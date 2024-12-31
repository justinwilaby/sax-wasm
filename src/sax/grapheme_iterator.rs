use std::cell::RefCell;
use std::ops::{Index, Range};
use std::str;

use super::utils::grapheme_len;

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

    /// Takes grapheme clusters until an ASCII character is encountered.
    ///
    /// This function iterates over the byte slice, taking grapheme clusters until one of the specified
    /// ASCII characters is encountered. It updates the cursor, line, and character indices accordingly.
    ///
    /// # Arguments
    ///
    /// * `chars` - A slice of ASCII characters to stop at.
    ///
    /// # Returns
    ///
    /// * An `Option` containing a `GraphemeResult` with the taken grapheme clusters, or `None` if the end of the byte slice is reached.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::grapheme_iterator::GraphemeClusters;
    ///
    /// let bytes = "hello world".as_bytes();
    /// let mut gc = GraphemeClusters::new(bytes);
    /// let result = gc.take_until_ascii(&[b' ']);
    /// assert!(result.is_some());
    /// ```
    pub fn take_until_ascii(&mut self, chars: &[u8]) -> Option<GraphemeResult<'_>> {
        let mut cursor = self.cursor;
        let start = self.cursor;
        let mut line = self.line;
        let mut character = self.character;
        let mut end = self.cursor;
        loop {
            if self.byte_len <= cursor {
                return None;
            }
            let next_byte = unsafe { *self.bytes.get_unchecked(cursor) };
            if chars.contains(&next_byte) {
                break;
            }

            let len = grapheme_len(next_byte);
            if next_byte == b'\n' {
                line += 1;
                character = 0;
            } else {
                character += if len == 4 { 2 } else { 1 };
            }
            end += len;
            cursor = end;
        }
        self.cursor = cursor;
        self.line = line;
        self.character = character;
        let s = unsafe { str::from_utf8_unchecked(&self.bytes.get_unchecked(start..end)) };
        Some((s, line, character))
    }

    /// Peeks at the next grapheme cluster without advancing the cursor.
    ///
    /// This function returns the next grapheme cluster in the byte slice without advancing the cursor.
    /// It updates the line and character indices accordingly.
    ///
    /// # Returns
    ///
    /// * An `Option` containing a `GraphemeResult` with the next grapheme cluster, or `None` if the end of the byte slice is reached.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::grapheme_iterator::GraphemeClusters;
    ///
    /// let bytes = "hello".as_bytes();
    /// let mut gc = GraphemeClusters::new(bytes);
    /// let result = gc.peek();
    /// assert!(result.is_some());
    /// ```
    pub fn peek(&mut self) -> Option<GraphemeResult<'_>> {
        let next_byte = unsafe { *self.bytes.get_unchecked(self.cursor) };
        let len = grapheme_len(next_byte);
        let byte_len = self.bytes.len();
        let end = self.cursor + len;
        if byte_len <= end {
            return None;
        }
        let mut line = self.line;
        let mut character = self.character;
        if next_byte == b'\n' {
            line += 1;
            character = 0;
        } else {
            character += if len == 4 { 1 } else { 2 };
        }
        let s = unsafe { str::from_utf8_unchecked(&self.bytes.get_unchecked(self.cursor..end)) };
        Some((s, line, character))
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

    pub fn get_remaining_bytes(&self) -> Option<([u8;3], usize, usize)> {
        if self.cursor == self.byte_len {
            return None;
        }
        let bytes = unsafe { self.bytes.get_unchecked(self.cursor..)};
        let mut remaining_bytes: [u8; 3] = [0, 0, 0];
        let len = bytes.len();
        let mut i = len;
        while i > 0 {
          i -= 1;
          remaining_bytes[i] = unsafe { *bytes.get_unchecked(i) };
        }

        Some((remaining_bytes, len, self.bytes_needed))
    }
}
/// Represents the result of a grapheme cluster operation.
///
/// This type alias represents a tuple containing a string slice, a line number, and a character index.
pub type GraphemeResult<'a> = (&'a str, u32, u32);
/// An iterator for grapheme clusters in a utf-8 formatted string
///
/// This iterator provides a tuple: (grapheme: &str, from_index:usize, to_index:usize)
impl<'a> Iterator for GraphemeClusters<'a> {
    type Item = GraphemeResult<'a>;

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
            character += if len == 4 { 2 } else { 1 };
        }

        let s = unsafe { str::from_utf8_unchecked(&bytes.get_unchecked(cursor..end)) };
        self.cursor = end;
        self.line = line;
        self.character = character;

        Some((s, line, character))
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
        for (grapheme, _, _) in it {
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
    fn seek_until_ascii_test() {
        let s = "🚀this is a test string🚀";
        let mut gc = GraphemeClusters::new(s.as_bytes());
        let result = gc.take_until_ascii(&"a".as_bytes());
        assert_eq!(result.is_some(), true);

        let unwrapped = result.unwrap();
        assert_eq!(unwrapped.0, "🚀this is ");
    }
}
