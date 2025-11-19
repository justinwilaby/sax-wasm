use super::utils::{ascii_contains, grapheme_len};
use core::arch::wasm32::{i8x16_bitmask, i8x16_eq, i8x16_splat, v128_load, v128_or};
use std::{mem, ptr};

/// Represents an iterator over grapheme clusters in a byte slice.
///
/// This struct provides functionality to iterate over grapheme clusters in a byte slice,
/// keeping track of the current position, line, and character indices.
///
/// # Fields
///
/// * `bytes` - A reference to the byte slice being iterated over.
/// * `byte_len` - The length of the byte slice.
/// * `byte_indices` - A vector of byte indices where the vector index is the grapheme cluster index.
/// * `line` - The current line number.
/// * `character` - The current character index.
/// * `cursor` - The current position in the byte slice.
pub struct GraphemeClusters<'a> {
    bytes: &'a [u8],
    pub byte_len: usize,
    pub line: u64,
    pub last_line: u64,
    pub character: u64,
    pub last_character: u64,
    pub cursor: usize,
    pub last_cursor_pos: usize,
}

impl GraphemeClusters<'_> {
    /// Creates a new `GraphemeClusters` iterator for the given byte slice.
    ///
    /// # Arguments
    ///
    /// * `bytes` - A reference to the byte slice to iterate over.
    ///
    /// # Returns
    ///
    /// * A new `GraphemeClusters` iterator.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::grapheme_iterator::GraphemeClusters;
    ///
    /// let bytes = "hello".as_bytes();
    /// let gc = GraphemeClusters::new(bytes);
    /// ```
    pub fn new(bytes: &[u8]) -> GraphemeClusters<'_> {
        GraphemeClusters {
            bytes,
            byte_len: bytes.len(),
            cursor: 0,
            last_cursor_pos: 0,
            line: 0,
            last_line: 0,
            character: 0,
            last_character: 0,
        }
    }

    /// Returns the number of grapheme clusters in the byte slice.
    ///
    /// This function iterates over the byte slice and counts the number of grapheme clusters.
    ///
    /// # Returns
    ///
    /// * The number of grapheme clusters in the byte slice.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::grapheme_iterator::GraphemeClusters;
    ///
    /// let bytes = "hello".as_bytes();
    /// let gc = GraphemeClusters::new(bytes);
    /// assert_eq!(gc.len(), 5);
    /// ```
    pub fn len(&self) -> usize {
        let mut len = 0;
        let mut idx = 0;
        let bytes_len = self.bytes.len();
        while idx != bytes_len {
            let byte = unsafe { *self.bytes.get_unchecked(idx) };
            idx += grapheme_len(byte);
            len += 1;
        }
        len
    }

    /// Takes grapheme clusters until one of the specified bytes
    /// or until the end of the byte array is encountered. If the end of the
    /// byte array is encountered and a broken surrogate exists there, it is
    /// not included.
    ///
    /// This function iterates over the byte slice and collects grapheme clusters until
    /// one of the specified bytes is encountered. It updates the cursor,
    /// line, and character positions accordingly.
    ///
    /// # Arguments
    ///
    /// * `chars` - A slice of bytes to stop at.
    ///
    /// # Returns
    ///
    /// * An `Option` containing a `GraphemeResult` with the collected grapheme clusters,
    ///   or `None` if the end of the byte slice is reached without encountering any of
    ///   the specified characters.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::grapheme_iterator::GraphemeClusters;
    ///
    /// let bytes = "hello, world!".as_bytes();
    /// let mut gc = GraphemeClusters::new(bytes);
    ///
    /// // Take until a comma or space is encountered
    /// if let Some((result, _)) = gc.take_until_one_found(&[b',', b' '], false) {
    ///     assert_eq!(result, "hello".as_bytes());
    ///     assert_eq!(gc.line, 0);
    ///     assert_eq!(gc.character, 5);
    /// }
    ///
    /// // Continue taking until an exclamation mark is encountered
    /// if let Some((result, _)) = gc.take_until_one_found(&[b'!'], false) {
    ///     assert_eq!(result, ", world".as_bytes());
    ///     assert_eq!(gc.line, 0);
    ///     assert_eq!(gc.character, 12);
    /// }
    ///
    /// // No more grapheme clusters to take
    /// assert!(gc.take_until_one_found(&[b'!'], false).is_none());
    ///
    /// // Handle broken surrogate at the end
    /// let bytes = "hello, world!🐉🐉🐉".as_bytes();
    /// let mut gc_with_surrogate = GraphemeClusters::new(&bytes[..14]);
    /// if let Some((result, _)) = gc_with_surrogate.take_until_one_found(&[b'!'], false) {
    ///     assert_eq!(result, "hello, world".as_bytes());
    ///     assert_eq!(gc.line, 0);
    ///     assert_eq!(gc.character, 12);
    /// }
    /// assert!(gc_with_surrogate.take_until_one_found(&[b'!'], false).is_none());
    /// ```
    pub fn take_until_one_found(&mut self, haystack: &[u8], include_match: bool) -> Option<(&[u8], bool)> {
        if self.cursor == self.byte_len {
            return None;
        }
        let ptr = self.bytes.as_ptr();
        let idx = self.cursor.saturating_sub(1);
        let current_byte = unsafe { *self.bytes.get_unchecked(idx) };
        if ascii_contains(haystack, current_byte) {
            return Some((unsafe { &*ptr::slice_from_raw_parts(ptr.add(idx), 1) }, true));
        }

        let start = self.cursor;
        let mut cursor = self.cursor;
        let mut line = self.line;
        let mut character = self.character;
        let max_index = self.byte_len;
        let mut matched_byte = b'0';
        let mut found = false;
        let mut len = 0;

        while cursor < max_index {
            let next_byte = unsafe { *ptr.add(cursor) };

            if ascii_contains(haystack, next_byte) {
                found = true;
                matched_byte = next_byte;
                len = grapheme_len(next_byte);
                break;
            }

            len = grapheme_len(next_byte);
            if next_byte == b'\n' {
                line += 1;
                character = 0;
            } else {
                character += if len != 4 {
                    1
                } else {
                    2
                };
            }
            cursor += len;
        }

        if found && include_match {
            if matched_byte == b'\n' {
                line += 1;
                character = 0;
            } else {
                character += 1;
            }
            len = 1;
            cursor += 1;
        }

        // We've run out of bytes - deliver what we have
        // even though the ascii wasn't found but do not
        // include a broken surrogate
        if cursor > max_index {
            cursor -= len;
        }

        // If the slice len is zero, return None
        if start == cursor {
            return None;
        }

        self.cursor = cursor;
        self.last_cursor_pos = cursor - len;

        self.last_line = mem::replace(&mut self.line, line);
        self.last_character = mem::replace(&mut self.character, character);

        // Use unsafe slice creation for performance
        Some((unsafe { &*ptr::slice_from_raw_parts(ptr.add(start), cursor - start) }, found))
    }

    pub fn take_until(&mut self, match_byte: u8, include_match_or_exhaust: bool) -> Option<(&[u8], bool)> {
        if self.cursor == self.byte_len {
            return None;
        }
        let start = self.cursor;
        let max_index = self.byte_len;
        let ptr = self.bytes.as_ptr();
        let mut cursor = self.cursor;
        let mut line = self.line;
        let mut character = self.character;
        let mut found = false;
        let mut len = 0;

        while cursor < max_index {
            let next_byte = unsafe { *ptr.add(cursor) };
            len = grapheme_len(next_byte);

            if next_byte == match_byte {
                found = true;
                break;
            }

            if next_byte == b'\n' {
                line += 1;
                character = 0;
            } else {
                character += if len != 4 {
                    1
                } else {
                    2
                };
            }
            cursor += len;
        }

        if include_match_or_exhaust && cursor < max_index {
            if match_byte == b'\n' {
                line += 1;
                character = 0;
            } else {
                character += 1;
            }
            len = 1;
            cursor += 1;
        }
        // We've run out of bytes - deliver what we have
        // even though the ascii wasn't found but do not
        // include a broken surrogate
        if cursor > max_index {
            cursor -= len;
        }

        self.cursor = cursor;
        self.last_cursor_pos = cursor - len;
        self.last_line = mem::replace(&mut self.line, line);
        self.last_character = mem::replace(&mut self.character, character);

        Some((unsafe { &*ptr::slice_from_raw_parts(ptr.add(start), cursor - start) }, found))
    }

    pub fn skip_whitespace(&mut self) -> bool {
        let mut cursor = self.cursor;
        let mut line = self.line;
        let mut character = self.character;
        let mut done = false;
        let max_index = self.byte_len;
        let ptr = self.bytes.as_ptr();

        unsafe {
            // Fast path: scan 16 bytes at a time for non-whitespace. Whitespace set
            // matches the ASCII characters the parser expects: space, tab, CR, NL.
            let sp = i8x16_splat(b' ' as i8);
            let tab = i8x16_splat(b'\t' as i8);
            let nl = i8x16_splat(b'\n' as i8);
            let cr = i8x16_splat(b'\r' as i8);

            while cursor + 16 <= max_index {
                let chunk = v128_load(ptr.add(cursor) as *const _);
                let is_space = i8x16_eq(chunk, sp);
                let is_tab = i8x16_eq(chunk, tab);
                let is_nl = i8x16_eq(chunk, nl);
                let is_cr = i8x16_eq(chunk, cr);
                let ws_mask_bits = i8x16_bitmask(v128_or(v128_or(is_space, is_tab), v128_or(is_nl, is_cr))) as u32;
                let nl_mask_bits = i8x16_bitmask(is_nl) as u32;
                let non_ws_mask_bits = !ws_mask_bits & 0xFFFF;

                if non_ws_mask_bits == 0 {
                    // The entire chunk is whitespace.
                    if nl_mask_bits != 0 {
                        let nl_count = nl_mask_bits.count_ones();
                        line += nl_count as u64;
                        // After the last newline, the character counts the bytes that follow.
                        let last_nl_idx = 31u32.saturating_sub(nl_mask_bits.leading_zeros()) as usize;
                        character = 15usize.saturating_sub(last_nl_idx) as u64;
                    } else {
                        character += 16;
                    }
                    cursor += 16;
                    continue;
                }

                // Found a non-whitespace byte within this chunk. Process only the prefix.
                let first_non_ws = non_ws_mask_bits.trailing_zeros() as usize;
                let prefix_mask = if first_non_ws == 0 {
                    0
                } else {
                    (1u32 << first_non_ws) - 1
                };
                let nl_prefix = nl_mask_bits & prefix_mask;
                let nl_count = nl_prefix.count_ones();

                if nl_count == 0 {
                    character += first_non_ws as u64;
                } else {
                    line += nl_count as u64;
                    let last_nl_idx = 31u32.saturating_sub(nl_prefix.leading_zeros()) as usize;
                    character = first_non_ws.saturating_sub(last_nl_idx + 1) as u64;
                }

                cursor += first_non_ws;
                done = true;
                break;
            }
        }

        while cursor < max_index {
            let next_byte = unsafe { *ptr.add(cursor) };
            if next_byte > 32 {
                done = true;
                break;
            }

            if next_byte == b'\n' {
                line += 1;
                character = 0;
            } else {
                character += 1;
            }
            cursor += 1;
        }
        self.cursor = cursor;
        self.last_cursor_pos = cursor.saturating_sub(1);
        self.last_line = mem::replace(&mut self.line, line);
        self.last_character = mem::replace(&mut self.character, character);

        done
    }

    /// Returns the remaining bytes in the iterator.
    ///
    /// This function returns the remaining bytes in the iterator
    pub fn get_remaining_bytes(&self) -> Option<&[u8]> {
        if self.cursor == self.byte_len {
            return None;
        }
        let bytes = unsafe { self.bytes.get_unchecked(self.cursor..) };

        Some(bytes)
    }
}
/// An iterator for grapheme clusters in an utf-8 formatted string
///
/// This iterator provides a tuple: (grapheme: &str, from_index:usize, to_index:usize)
impl<'a> Iterator for GraphemeClusters<'a> {
    type Item = &'a [u8];

    fn next(&mut self) -> Option<Self::Item> {
        if self.byte_len <= self.cursor {
            return None;
        }

        let cursor = self.cursor;
        let bytes = self.bytes;
        let byte_len = self.byte_len;
        let mut line = self.line;
        let mut character = self.character;

        let next_byte = unsafe { *bytes.get_unchecked(cursor) };
        let len = grapheme_len(next_byte);
        let end = cursor + len;

        if end > byte_len {
            return None;
        }

        // Update line and character count
        if next_byte == b'\n' {
            line += 1;
            character = 0;
        } else {
            character += if len != 4 {
                1
            } else {
                2
            };
        }

        let s = unsafe { bytes.get_unchecked(cursor..end) };
        self.last_cursor_pos = mem::replace(&mut self.cursor, end);
        self.last_line = mem::replace(&mut self.line, line);
        self.last_character = mem::replace(&mut self.character, character);

        Some(s)
    }
}

impl<'a> AsRef<Self> for GraphemeClusters<'a> {
    fn as_ref(&self) -> &Self {
        self
    }
}

#[cfg(test)]
mod grapheme_iterator_tests {
    use crate::sax::grapheme_iterator::GraphemeClusters;

    #[test]
    fn iterator_test() {
        let s = "🚀this is a test string🚀";
        let it: Vec<_> = GraphemeClusters::new(s.as_bytes()).collect();
        assert_eq!(it.len(), 23);
    }

    #[test]
    fn iterator_test2() {
        let s = "🚀rocket ";
        let it: Vec<_> = GraphemeClusters::new(s.as_bytes()).collect();
        for grapheme in it {
            assert_eq!(grapheme.len() > 0, true)
        }
    }

    #[test]
    fn len_test() {
        let s = "🚀this is a test string🚀";
        let gc = GraphemeClusters::new(s.as_bytes());
        let len = gc.len();
        assert_eq!(len, 23);
    }

    #[test]
    fn take_until_one_found_test() {
        let s = "🚀this is 🐉 a test string🚀";
        let mut gc = GraphemeClusters::new(s.as_bytes());
        let result = gc.take_until_one_found(b"a", false);
        assert_eq!(result.is_some(), true);

        let (unwrapped, _) = result.unwrap();
        assert_eq!(unwrapped, "🚀this is 🐉 ".as_bytes());
    }
    #[test]
    fn take_until_str() {
        let s = "this is 🐉 a test string🚀";
        let mut gc = GraphemeClusters::new(s.as_bytes());
        let result = gc.take_until_one_found(b"e", false);
        assert_eq!(result.is_some(), true);

        let (unwrapped, _) = result.unwrap();
        assert_eq!(unwrapped, "this is 🐉 a t".as_bytes());
    }
    #[test]
    fn take_until_str_include_match() {
        let s = "this is 🐉 a test string🚀";
        let mut gc = GraphemeClusters::new(s.as_bytes());
        let result = gc.take_until_one_found(b"e", true);
        assert_eq!(result.is_some(), true);

        let (unwrapped, _) = result.unwrap();
        assert_eq!(unwrapped, "this is 🐉 a te".as_bytes());
    }
}
