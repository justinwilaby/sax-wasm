pub fn is_name_start_char(grapheme: &str) -> bool {
  let c = grapheme.chars().next();
  // https://www.w3.org/TR/REC-xml/#NT-NameStartChar
  match c.unwrap() {
    '\u{003A}' => true,              // :
    '\u{0041}'...'\u{005A}' => true, // A-Z
    '\u{005F}' => true,              // _
    '\u{0061}'...'\u{007A}' => true, // a-z
    '\u{00C0}'...'\u{00D6}' => true, // À-Ö
    '\u{00D8}'...'\u{00F6}' => true, // Ø-ö
    '\u{00F8}'...'\u{02FF}' => true, // ø-˿
    '\u{0370}'...'\u{037D}' => true,
    '\u{037F}'...'\u{1FFF}' => true,
    '\u{200C}'...'\u{200D}' => true,
    '\u{2070}'...'\u{218F}' => true,
    '\u{2C00}'...'\u{2FEF}' => true,
    '\u{3001}'...'\u{D7FF}' => true,
    '\u{F900}'...'\u{FDCF}' => true,
    '\u{FDF0}'...'\u{FFFD}' => true,
    '\u{10000}'...'\u{EFFFF}' => true,
    _ => false,
  }
}

pub fn is_name_char(grapheme: &str) -> bool {
  if is_name_start_char(grapheme) {
    return true;
  }

  let c = grapheme.chars().next();
  match c.unwrap() {
    '\u{002D}' => true,
    '\u{002E}' => true,
    '\u{00B7}' => true,
    '\u{0030}'...'\u{0039}' => true,
    '\u{0300}'...'\u{036F}' => true,
    '\u{203F}'...'\u{2040}' => true,
    _ => false
  }
}
