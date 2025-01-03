use super::utils::to_char_code;

// Checks if a grapheme cluster is a valid XML name start character.
///
/// According to the XML specification, a name start character can be:
/// - A-Z
/// - a-z
/// - :
/// - _
/// - À-Ö
/// - Ø-ö
/// - ø-˿
/// - Various other Unicode ranges
///
/// # Arguments
///
/// * `grapheme` - A string slice representing a grapheme cluster.
///
/// # Returns
///
/// * `true` if the grapheme cluster is a valid XML name start character, `false` otherwise.
///
/// # Examples
///
/// ```
/// use sax_wasm::sax::names::is_name_start_char;
///
/// assert!(is_name_start_char("A".as_bytes()));
/// assert!(!is_name_start_char("1".as_bytes()));
/// ```
pub fn is_name_start_char(grapheme: &[u8]) -> bool {
    let c = to_char_code(grapheme);

    // Quick lookup for common ASCII characters
    if c <= 0x7F {
        return matches!(c, 0x61..=0x7A | 0x41..=0x5A | 0x3A | 0x5F);
    }

    // Range checks for other valid characters
    matches!(
        c,
        0xC0..=0xD6 |
        0xD8..=0xF6 |
        0xF8..=0x02FF |
        0x0370..=0x037D |
        0x037F..=0x1FFF |
        0x200C..=0x200D |
        0x2070..=0x218F |
        0x2C00..=0x2FEF |
        0x3001..=0xD7FF |
        0xF900..=0xFDCF |
        0xFDF0..=0xFFFD |
        0x10000..=0xEFFFF
    )
}

/// Checks if a grapheme cluster is a valid XML name character.
///
/// According to the XML specification, a name character can be:
/// - A-Z
/// - a-z
/// - 0-9
/// - -
/// - .
/// - Various other Unicode ranges
///
/// # Arguments
///
/// * `grapheme` - A string slice representing a grapheme cluster.
///
/// # Returns
///
/// * `true` if the grapheme cluster is a valid XML name character, `false` otherwise.
///
/// # Examples
///
/// ```
/// use sax_wasm::sax::names::is_name_char;
///
/// assert!(is_name_char("A".as_bytes()));
/// assert!(is_name_char("1".as_bytes()));
/// assert!(!is_name_char(" ".as_bytes()));
/// ```
pub fn is_name_char(grapheme: &[u8]) -> bool {
    let c = to_char_code(grapheme);

    // Quick lookup for common ASCII characters
    if c <= 0x7F {
        return matches!(c, 0x61..=0x7A | 0x41..=0x5A | 0x30..=0x39 | 0x2D | 0x2E | 0x5F);
    }

    // Range checks for other valid characters
    matches!(
        c,
        0xB7 |
        0xC0..=0xD6 |
        0xD8..=0xF6 |
        0xF8..=0x02FF |
        0x0300..=0x036F |
        0x0370..=0x037D |
        0x037F..=0x1FFF |
        0x200C..=0x200D |
        0x203F..=0x2040 |
        0x2070..=0x218F |
        0x2C00..=0x2FEF |
        0x3001..=0xD7FF |
        0xF900..=0xFDCF |
        0xFDF0..=0xFFFD |
        0x10000..=0xEFFFF
    )
}
