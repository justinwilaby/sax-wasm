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

pub fn ascii_icompare(expected: &str, test: &str) -> bool {
    if expected.len() != test.len() {
        return false;
    }
    for (e, t) in expected.chars().zip(test.chars()) {
        let char_diff = (e as i8) - (t as i8);
        if !(char_diff == 0 || char_diff == 32) {
            return false;
        }
    }
    true
}

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
#[inline(always)]
pub fn is_whitespace(grapheme: &str) -> bool {
    grapheme == " " || grapheme == "\n" || grapheme == "\t" || grapheme == "\r"
}
#[inline(always)]
pub fn is_quote(grapheme: &str) -> bool {
    grapheme == "\"" || grapheme == "'"
}
#[inline(always)]
pub fn grapheme_len(byte: u8) -> usize {
  if byte < 128 { return 1 } // 1-byte sequence (ASCII)
    match byte {
        0xC0..=0xDF => 2, // 2-byte sequence
        0xE0..=0xEF => 3, // 3-byte sequence
        0xF0..=0xF7 => 4, // 4-byte sequence
        _ => 1,           // Invalid byte, treat as single byte
    }
}
