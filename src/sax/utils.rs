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
#[inline(always)]
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
#[inline(always)]
pub fn is_whitespace(grapheme: &str) -> bool {
    let byte = grapheme.as_bytes()[0];
    byte == b' ' || byte == b'\n' || byte == b'\t' || byte == b'\r'
}
#[inline(always)]
pub fn is_quote(grapheme: &str) -> bool {
    let byte = grapheme.as_bytes()[0];
    byte == b'"' || byte == b'\''
}
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
