/// Converts an unsigned integer to its string representation.
///
/// This function converts a given `u32` value to its corresponding string representation.
/// It uses a loop to determine the number of digits and then constructs the string by
/// extracting each digit from the number.
///
/// # Arguments
///
/// * `uint` - The unsigned integer to convert.
///
/// # Returns
///
/// * A `String` representing the unsigned integer.
///
/// # Examples
///
/// ```
/// use sax_wasm::sax::utils::uint_to_string;
///
/// assert_eq!(uint_to_string(123), "123");
/// assert_eq!(uint_to_string(0), "0");
/// ```
pub fn uint_to_string(mut uint: u32) -> String {
    let mut ct: u32 = 0;
    let mut s = String::new();
    loop {
        let d = (uint / 10u32.pow(ct)) as f32;
        if d < 10.0 {
            break;
        }
        ct += 1;
    }
    let nums = "0123456789";
    loop {
        let pow = 10u32.pow(ct);
        let set = uint - (uint % pow);
        let i = (set / pow) as usize;
        let num = unsafe { nums.get_unchecked(i..i + 1) };
        s.push_str(num);
        if ct == 0 {
            break;
        }
        uint -= set;
        ct -= 1;
    }
    s
}

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
/// use sax_wasm::sax::utils::ascii_icompare;
///
/// assert!(ascii_icompare("Hello", "hello"));
/// assert!(!ascii_icompare("Hello", "world"));
/// ```
#[inline(always)]
pub fn ascii_icompare(expected: &str, test: &str) -> bool {
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
/// assert_eq!(to_char_code("A"), 65);
/// assert_eq!(to_char_code("é"), 233);
/// ```
#[inline(always)]
pub fn to_char_code(grapheme: &str) -> u32 {
    let bytes = grapheme.as_bytes();
    unsafe {
        match bytes.len() {
            1 => *bytes.get_unchecked(0) as u32,
            2 => {
                ((*bytes.get_unchecked(0) as u32 & 0x1f) << 6)
                    | (*bytes.get_unchecked(1) as u32 & 0x3f)
            }
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

/// Checks if a grapheme cluster is a whitespace character.
///
/// This function checks if a given grapheme cluster (represented as a string slice) is a
/// whitespace character. It considers the following characters as whitespace:
/// - Space (' ')
/// - Newline ('\n')
/// - Tab ('\t')
/// - Carriage return ('\r')
///
/// # Arguments
///
/// * `grapheme` - A string slice representing a grapheme cluster.
///
/// # Returns
///
/// * `true` if the grapheme cluster is a whitespace character, `false` otherwise.
///
/// # Examples
///
/// ```
/// use sax_wasm::sax::utils::is_whitespace;
///
/// assert!(is_whitespace(" "));
/// assert!(is_whitespace("\n"));
/// assert!(!is_whitespace("A"));
/// ```
#[inline(always)]
pub fn is_whitespace(grapheme: &str) -> bool {
    let byte = grapheme.as_bytes()[0];
    byte == b' ' || byte == b'\n' || byte == b'\t' || byte == b'\r'
}

/// Checks if a grapheme cluster is a quote character.
///
/// This function checks if a given grapheme cluster (represented as a string slice) is a
/// quote character. It considers the following characters as quotes:
/// - Double quote ('"')
/// - Single quote ('\'')
///
/// # Arguments
///
/// * `grapheme` - A string slice representing a grapheme cluster.
///
/// # Returns
///
/// * `true` if the grapheme cluster is a quote character, `false` otherwise.
///
/// # Examples
///
/// ```
/// use sax_wasm::sax::utils::is_quote;
///
/// assert!(is_quote("\""));
/// assert!(is_quote("'"));
/// assert!(!is_quote("A"));
/// ```
#[inline(always)]
pub fn is_quote(grapheme: &str) -> bool {
    let byte = grapheme.as_bytes()[0];
    byte == b'"' || byte == b'\''
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
#[inline(always)]
pub fn grapheme_len(byte: u8) -> usize {
    if byte < 128 { // 1-byte sequence (ASCII)
        return 1;
    }
    if byte < 224 {
        return 2;
    }
    if byte < 240 {
        return 3;
    }
    if byte < 248 {
        return 4;
    }
    1
}
#[inline(always)]
pub fn u32_to_u8(arr: &[u32]) -> &[u8] {
  unsafe {
      std::slice::from_raw_parts(arr.as_ptr() as *const u8, arr.len() * 4)
  }
}
