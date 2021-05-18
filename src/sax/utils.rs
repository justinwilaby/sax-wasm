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
    let len = bytes.len();
    let char_code = match len {
        1 => bytes[0] as u32,
        2 => ((bytes[0] as u32 & 0x1f) << 6) | (bytes[1] as u32 & 0x3f),
        3 => {
            ((bytes[0] as u32 & 0x0f) << 12)
                | ((bytes[1] as u32 & 0x3f) << 6)
                | (bytes[2] as u32 & 0x3f)
        }
        4 => {
            ((bytes[0] as u32 & 0x07) << 18)
                | ((bytes[1] as u32 & 0x3f) << 12)
                | ((bytes[2] as u32 & 0x3f) << 6)
                | (bytes[3] as u32 & 0x3f)
        }
        _ => 0,
    };
    char_code
}
