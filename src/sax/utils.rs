use std::u8;

/// Compares two ASCII strings case-insensitively.
///
/// This function compares two ASCII strings for equality, ignoring case differences.
/// It returns `true` if the strings are equal (case-insensitive), and `false` otherwise.
///
/// # Arguments
///
/// * `expected` - The expected string.
/// * `test` - The string to test against the expected string.
///
/// # Returns
///
/// * `true` if the strings are equal (case-insensitive), `false` otherwise.
///
/// # Examples
///
/// ```
/// use sax_wasm::sax::utils::ascii_compare;
///
/// assert!(ascii_compare("Hello", "hello"));
/// assert!(!ascii_compare("Hello", "world"));
/// ```
pub fn ascii_compare(expected: &str, test: &str) -> bool {
    if expected.len() != test.len() {
        return false;
    }
    expected.chars().zip(test.chars()).all(|(e, t)| e.eq_ignore_ascii_case(&t))
}

/// Converts a grapheme cluster to its corresponding Unicode code point.
///
/// This function converts a given grapheme cluster (represented as a string slice) to its
/// corresponding Unicode code point. It handles grapheme clusters of different lengths
/// (1 to 4 bytes) and uses unsafe code for performance optimization.
///
/// # Arguments
///
/// * `grapheme` - A string slice representing a grapheme cluster.
///
/// # Returns
///
/// * A `u32` representing the Unicode code point of the grapheme cluster.
///
/// # Examples
///
/// ```
/// use sax_wasm::sax::utils::to_char_code;
///
/// assert_eq!(to_char_code(("A".as_bytes())), 65);
/// assert_eq!(to_char_code("é".as_bytes()), 233);
/// ```
pub fn to_char_code(grapheme: &[u8]) -> u32 {
    let bytes = grapheme;
    unsafe {
        match bytes.len() {
            1 => *bytes.get_unchecked(0) as u32,
            2 => ((*bytes.get_unchecked(0) as u32 & 0x1f) << 6) | (*bytes.get_unchecked(1) as u32 & 0x3f),
            3 => {
                ((*bytes.get_unchecked(0) as u32 & 0x0f) << 12)
                    | ((*bytes.get_unchecked(1) as u32 & 0x3f) << 6)
                    | (*bytes.get_unchecked(2) as u32 & 0x3f)
            }
            4 => {
                ((*bytes.get_unchecked(0) as u32 & 0x07) << 18)
                    | ((*bytes.get_unchecked(1) as u32 & 0x3f) << 12)
                    | ((*bytes.get_unchecked(2) as u32 & 0x3f) << 6)
                    | (*bytes.get_unchecked(3) as u32 & 0x3f)
            }
            _ => 0,
        }
    }
}

#[inline(always)]
pub fn match_byte(haystack: &[u8], byte: u8) -> bool {
    let ptr = haystack.as_ptr();

    if unsafe { *ptr.add(0) } == byte {
        return true;
    }

    let len = haystack.len();
    for i in 1..len {
        if unsafe { *ptr.add(i) } == byte {
            return true;
        }
    }
    false
}

/// Determines the length of a grapheme cluster based on the first byte.
///
/// This function determines the length of a grapheme cluster (in bytes) based on the
/// first byte of the cluster. It handles UTF-8 encoded grapheme clusters, which can be
/// 1 to 4 bytes long.
///
/// # Arguments
///
/// * `byte` - The first byte of the grapheme cluster.
///
/// # Returns
///
/// * The length of the grapheme cluster (in bytes).
///
/// # Examples
///
/// ```
/// use sax_wasm::sax::utils::grapheme_len;
///
/// assert_eq!(grapheme_len(b'A'), 1);
/// assert_eq!(grapheme_len(b'\xC3'), 2); // 'é' in UTF-8
/// ```
pub fn grapheme_len(byte: u8) -> usize {
    if byte & 0b1000_0000 == 0 {
        1 // 1-byte sequence (ASCII)
    } else if byte & 0b1110_0000 == 0b1100_0000 {
        2 // 2-byte sequence
    } else if byte & 0b1111_0000 == 0b1110_0000 {
        3 // 3-byte sequence
    } else if byte & 0b1111_1000 == 0b1111_0000 {
        4 // 4-byte sequence
    } else {
        1 // Default case (invalid UTF-8 leading byte)
    }
}
