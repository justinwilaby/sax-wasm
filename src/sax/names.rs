use sax::utils::to_char_code;

pub fn is_name_start_char(grapheme: &str) -> bool {
  let c = to_char_code(grapheme);
  // https://www.w3.org/TR/REC-xml/#NT-NameStartChar
  match c {
    0x3A => true,          // :
    0x41...0x5A => true,   // A-Z
    0x5F => true,          // _
    0x61...0x7A => true,   // a-z
    0xC0...0xD6 => true,   // À-Ö
    0xD8...0xF6 => true,   // Ø-ö
    0xF8...0x02FF => true, // ø-˿
    0x0370...0x037D => true,
    0x037F...0x1FFF => true,
    0x200C...0x200D => true,
    0x2070...0x218F => true,
    0x2C00...0x2FEF => true,
    0x3001...0xD7FF => true,
    0xF900...0xFDCF => true,
    0xFDF0...0xFFFD => true,
    0x10000...0xEFFFF => true,
    _ => false,
  }
}

pub fn is_name_char(grapheme: &str) -> bool {
  if is_name_start_char(grapheme) {
    return true;
  }

  let c = to_char_code(grapheme);
  match c {
    0x2D => true,
    0x2E => true,
    0xB7 => true,
    0x30...0x39 => true,
    0x0300...0x036F => true,
    0x203F...0x2040 => true,
    _ => false
  }
}
