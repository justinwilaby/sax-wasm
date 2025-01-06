use std::cell::RefCell;
use std::ops::{Index, Range};
use std::str;

use super::utils::{grapheme_len, match_byte};

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
    byte_len: usize,
    bytes_needed: usize,
    byte_indices: RefCell<Vec<usize>>,
    pub line: u32,
    pub character: u32,
    pub cursor: usize,
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
    pub fn new(bytes: &[u8]) -> GraphemeClusters {
        GraphemeClusters {
            bytes,
            byte_len: bytes.len(),
            bytes_needed: 0,
            cursor: 0,
            byte_indices: RefCell::new(vec![0]),
            line: 0,
            character: 0,
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

    /// Takes grapheme clusters until one of the specified ASCII characters
    /// or until the end of the byte array is encountered. If the end of the
    /// byte array is encountered and a broken surrogate exists there, it is
    /// not included.
    ///
    /// This function iterates over the byte slice and collects grapheme clusters until
    /// one of the specified ASCII characters is encountered. It updates the cursor,
    /// line, and character positions accordingly.
    ///
    /// # Arguments
    ///
    /// * `chars` - A slice of ASCII characters to stop at.
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
    /// if let Some(result) = gc.take_until_ascii(&[b',', b' ']) {
    ///     assert_eq!(result, "hello".as_bytes());
    ///     assert_eq!(gc.line, 0);
    ///     assert_eq!(gc.character, 5);
    /// }
    ///
    /// // Continue taking until an exclamation mark is encountered
    /// if let Some(result) = gc.take_until_ascii(&[b'!']) {
    ///     assert_eq!(result, ", world".as_bytes());
    ///     assert_eq!(gc.line, 0);
    ///     assert_eq!(gc.character, 12);
    /// }
    ///
    /// // No more grapheme clusters to take
    /// assert!(gc.take_until_ascii(&[b'!']).is_none());
    ///
    /// // Handle broken surrogate at the end
    /// let bytes = "hello, world!🐉🐉🐉".as_bytes();
    /// let mut gc_with_surrogate = GraphemeClusters::new(&bytes[..14]);
    /// if let Some(result) = gc_with_surrogate.take_until_ascii(&[b'!']) {
    ///     assert_eq!(result, "hello, world".as_bytes());
    ///     assert_eq!(gc.line, 0);
    ///     assert_eq!(gc.character, 12);
    /// }
    /// assert!(gc_with_surrogate.take_until_ascii(&[b'!']).is_none());
    /// ```
    pub fn take_until_ascii(&mut self, haystack: &[u8]) -> Option<&'_ [u8]> {
        let mut cursor = self.cursor;
        let start = self.cursor;
        let mut line = self.line;
        let mut character = self.character;
        let byte_len = self.byte_len;
        // Take until we encounter an ASCII
        // or run out of bytes
        while cursor < byte_len {
            let next_byte = unsafe { *self.bytes.get_unchecked(cursor) };

            if match_byte(haystack, next_byte) {
                break;
            }

            let len = grapheme_len(next_byte);
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
        // We've run out of bytes - deliver what we have
        // even though the ascii wasn't found
        if cursor > byte_len {
            cursor = byte_len - (cursor - byte_len);
        }
        // Nothing to take
        if start >= cursor {
            return None;
        }

        self.cursor = cursor;
        self.line = line;
        self.character = character;
        let s = unsafe { self.bytes.get_unchecked(start..cursor) };
        Some(s)
    }

    pub fn skip_whitespace(&mut self) -> bool {
        let mut cursor = self.cursor;
        let mut line = self.line;
        let mut character = self.character;
        let byte_len = self.byte_len;
        while cursor < byte_len {
            let next_byte = unsafe { *self.bytes.get_unchecked(cursor) };
            if !match_byte(&[b' ', b'\n', b'\r', b'\t'], next_byte) {
                break;
            }
            // if next_byte != b' ' && next_byte != b'\n' && next_byte != b'\r' && next_byte != b'\t' {
            //     break;
            // }

            if next_byte == b'\n' {
                line += 1;
                character = 0;
            } else {
                character += 1;
            }
            cursor += 1;
        }
        let whitespace_skipped = cursor != self.cursor;
        self.cursor = cursor;
        self.line = line;
        self.character = character;
        whitespace_skipped
    }

    /// Converts a grapheme cluster range to a slice range.
    ///
    /// This function converts a range of grapheme clusters to a corresponding byte slice range.
    ///
    /// # Arguments
    ///
    /// * `range` - A range of grapheme cluster indices.
    ///
    /// # Returns
    ///
    /// * A `Range<usize>` representing the byte slice range.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::grapheme_iterator::GraphemeClusters;
    ///
    /// let s = "🐶 my dog's name is Spot 🐶";
    /// let gc = GraphemeClusters::new(s.as_bytes());
    /// assert_eq!(&s[gc.get_slice_range(0..8)], "🐶 my dog");
    /// ```
    pub fn get_slice_range(&self, range: Range<usize>) -> Range<usize> {
        let mut byte_indices = self.byte_indices.borrow_mut();
        let mut largest_idx = byte_indices.len() - 1;
        let mut start_idx = if largest_idx >= range.start {
            byte_indices[range.start]
        } else {
            byte_indices[largest_idx]
        };
        let mut end_idx = if largest_idx >= range.end {
            byte_indices[range.end]
        } else {
            byte_indices[largest_idx]
        };

        while largest_idx < range.end {
            let byte = unsafe { *self.bytes.get_unchecked(end_idx) };
            end_idx += grapheme_len(byte);
            largest_idx += 1;
            byte_indices.push(end_idx);
            if largest_idx == range.start {
                start_idx = end_idx;
            }
        }
        start_idx..end_idx
    }

    /// Returns the remaining bytes in the iterator.
    ///
    /// This function returns the remaining bytes in the iterator as a tuple containing:
    /// - A fixed-size array of up to 4 bytes representing the remaining bytes.
    /// - The length of the remaining bytes.
    /// - The number of bytes needed to complete the current grapheme cluster.
    ///
    /// # Returns
    ///
    /// An `Option` containing a tuple with the following elements:
    /// - A `[u8; 4]` array with the remaining bytes. If there are fewer than 4 bytes remaining,
    ///   the unused elements of the array will be set to 0.
    /// - A `usize` representing the length of the remaining bytes.
    /// - A `usize` representing the number of bytes needed to complete the current grapheme cluster.
    ///
    /// If there are no remaining bytes, the function returns `None`.
    ///
    /// # Safety
    ///
    /// This function uses `unsafe` code to access the underlying byte slice without bounds checking.
    /// It is the caller's responsibility to ensure that the `cursor` is within the valid range of the byte slice.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::grapheme_iterator::GraphemeClusters;
    ///
    /// let bytes = "hello, world!🐶".as_bytes();
    /// let mut gc = GraphemeClusters::new(&bytes[..14]);
    ///
    /// // Consume some grapheme clusters
    /// gc.take_until_ascii(&[b'1']); // 1 is not in the byte slice
    /// gc.next(); // try to consume the next grapheme cluster which will have a broken surrogate
    ///
    /// // Get the remaining bytes
    /// if let Some((remaining_bytes, len, bytes_needed)) = gc.get_remaining_bytes() {
    ///     assert_eq!(remaining_bytes, [33, 240, 0, 0]); // &bytes[12..14] sized to 4
    ///     assert_eq!(len, 2);
    ///     assert_eq!(bytes_needed, 0);
    /// }
    /// ```
    pub fn get_remaining_bytes(&self) -> Option<([u8; 4], usize, usize)> {
        if self.cursor == self.byte_len {
            return None;
        }
        let bytes = unsafe { self.bytes.get_unchecked(self.cursor..) };
        let mut remaining_bytes: [u8; 4] = [0, 0, 0, 0];
        let len = bytes.len();
        let mut i = len;
        while i > 0 {
            i -= 1;
            remaining_bytes[i] = unsafe { *bytes.get_unchecked(i) };
        }

        Some((remaining_bytes, len, self.bytes_needed))
    }
}
/// An iterator for grapheme clusters in a utf-8 formatted string
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
            self.bytes_needed = end - byte_len;
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
        self.cursor = end;
        self.line = line;
        self.character = character;

        Some(s)
    }
}

impl<'a> Index<usize> for GraphemeClusters<'a> {
    type Output = str;

    fn index(&self, index: usize) -> &Self::Output {
        let range = self.get_slice_range(index..index + 1);
        unsafe { str::from_utf8_unchecked(&self.bytes[range]) }
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
    fn slice_test() {
        let s = "🚀this is a test string🚀";
        let gc = GraphemeClusters::new(s.as_bytes());
        let byte_range1 = gc.get_slice_range(1..5);

        let slice = &s[byte_range1.clone()];
        assert_eq!(slice, "this");
        assert_eq!(byte_range1, 4..8);
    }

    #[test]
    fn index_test() {
        let s = "🚀this is a test string🚀";
        let gc = GraphemeClusters::new(s.as_bytes());
        assert_eq!(&gc[22], "🚀")
    }
    #[test]
    fn take_until_ascii_test() {
        let s = "🚀this is 🐉 a test string🚀";
        let mut gc = GraphemeClusters::new(s.as_bytes());
        let result = gc.take_until_ascii(&"a".as_bytes());
        assert_eq!(result.is_some(), true);

        let unwrapped = result.unwrap();
        assert_eq!(unwrapped, "🚀this is 🐉 ".as_bytes());
    }
}
