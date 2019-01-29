use sax::names::is_name_start_char;
use sax::utils::to_char_code;
use std::char;

// https://unicode-table.com/en/
pub fn is_entity_start_char(grapheme: &str) -> bool {
  let c = to_char_code(grapheme);
  if c != to_char_code(":") && is_name_start_char(grapheme) {
    return true;
  }
  c == to_char_code("#")
}

pub fn is_entity_body(grapheme: &str) -> bool {
  if is_entity_start_char(grapheme) {
    return true;
  }
  let c = to_char_code(grapheme);
  match c {
    0xb7 => true,
    0x30...0x36f => true,
    0x203f...0x2040 => true,
    _ => false
  }
}

pub fn parse_entity<'a>(entity: &String) -> char {
  let mut e = match_xml_entity(entity);
  if e != 0x0 {
    return unsafe { char::from_u32_unchecked(e) };
  }
  e = match_entity(entity);
  if e != 0x0 {
    return unsafe { char::from_u32_unchecked(e) };
  }
  let mut e = 0x0;
  unsafe {
    if entity.get_unchecked(0..1) == "#" {
      let x = entity.get_unchecked(1..2);
      if x == "x" || x == "X" {
        let hex_str = entity.get_unchecked(2..entity.len());
        e = hex_to_dec(hex_str);
      } else {
        let dec_str = entity.get_unchecked(1..entity.len());
        e = to_dec(dec_str);
      }
    }
  }
  unsafe { char::from_u32_unchecked(e) }
}

fn match_xml_entity(entity: &str) -> u32 {
  match entity {
    "amp" => 0x26,
    "gt" => 0x3E,
    "lt" => 0x3C,
    "quot" => 0x22,
    "apos" => 0x27,
    _ => 0
  }
}

fn match_entity(entity: &str) -> u32 {
  match entity {
    "amp" => 0x26,
    "gt" => 0x3E,
    "lt" => 0x3C,
    "quot" => 0x22,
    "apos" => 0x027,
    "AElig" => 0xc6,
    "Aacute" => 0xc1,
    "Acirc" => 0xc2,
    "Agrave" => 0xc0,
    "Aring" => 0xc5,
    "Atilde" => 0xc3,
    "Auml" => 0xc4,
    "Ccedil" => 0xc7,
    "ETH" => 0xd0,
    "Eacute" => 0xc9,
    "Ecirc" => 0xca,
    "Egrave" => 0xc8,
    "Euml" => 0xcb,
    "Iacute" => 0xcd,
    "Icirc" => 0xce,
    "Igrave" => 0xcc,
    "Iuml" => 0xcf,
    "Ntilde" => 0xd1,
    "Oacute" => 0xd3,
    "Ocirc" => 0xd4,
    "Ograve" => 0xd2,
    "Oslash" => 0xd8,
    "Otilde" => 0xd5,
    "Ouml" => 0xd6,
    "THORN" => 0xde,
    "Uacute" => 0xda,
    "Ucirc" => 0xdb,
    "Ugrave" => 0xd9,
    "Uuml" => 0xdc,
    "Yacute" => 0xdd,
    "aacute" => 0xe1,
    "acirc" => 0xe2,
    "aelig" => 0xe6,
    "agrave" => 0xe0,
    "aring" => 0xe5,
    "atilde" => 0xe3,
    "auml" => 0xe4,
    "ccedil" => 0xe7,
    "eacute" => 0xe9,
    "ecirc" => 0xea,
    "egrave" => 0xe8,
    "eth" => 0xf0,
    "euml" => 0xeb,
    "iacute" => 0xed,
    "icirc" => 0xee,
    "igrave" => 0xec,
    "iuml" => 0xef,
    "ntilde" => 0xf1,
    "oacute" => 0xf3,
    "ocirc" => 0xf4,
    "ograve" => 0xf2,
    "oslash" => 0xf8,
    "otilde" => 0xf5,
    "ouml" => 0xf6,
    "szlig" => 0xdf,
    "thorn" => 0xfe,
    "uacute" => 0xfa,
    "ucirc" => 0xfb,
    "ugrave" => 0xf9,
    "uuml" => 0xfc,
    "yacute" => 0xfd,
    "yuml" => 0xff,
    "copy" => 0xa9,
    "reg" => 0xae,
    "nbsp" => 0xa0,
    "iexcl" => 0xa1,
    "cent" => 0xa2,
    "pound" => 0xa3,
    "curren" => 0xa4,
    "yen" => 0xa5,
    "brvbar" => 0xa6,
    "sect" => 0xa7,
    "uml" => 0xa8,
    "ordf" => 0xaa,
    "laquo" => 0xab,
    "not" => 0xac,
    "shy" => 0xad,
    "macr" => 0xaf,
    "deg" => 0xb0,
    "plusmn" => 0xb1,
    "sup1" => 0xb9,
    "sup2" => 0xb2,
    "sup3" => 0xb3,
    "acute" => 0xb4,
    "micro" => 0xb5,
    "para" => 0xb6,
    "middot" => 0xb7,
    "cedil" => 0xb8,
    "ordm" => 0xba,
    "raquo" => 0xbb,
    "frac14" => 0xbc,
    "frac12" => 0xbd,
    "frac34" => 0xbe,
    "iquest" => 0xbf,
    "times" => 0xd7,
    "divide" => 0xf7,
    "OElig" => 0x152,
    "oelig" => 0x0153,
    "Scaron" => 0x0160,
    "scaron" => 0x0161,
    "Yuml" => 0x0178,
    "fnof" => 0x0192,
    "circ" => 0x02c6,
    "tilde" => 0x02dc,
    "Alpha" => 0x0391,
    "Beta" => 0x0392,
    "Gamma" => 0x0393,
    "Delta" => 0x0394,
    "Epsilon" => 0x0395,
    "Zeta" => 0x0396,
    "Eta" => 0x0397,
    "Theta" => 0x0398,
    "Iota" => 0x0399,
    "Kappa" => 0x039a,
    "Lambda" => 0x039b,
    "Mu" => 0x039c,
    "Nu" => 0x039d,
    "Xi" => 0x039e,
    "Omicron" => 0x039f,
    "Pi" => 0x03a0,
    "Rho" => 0x03a1,
    "Sigma" => 0x03a3,
    "Tau" => 0x03a4,
    "Upsilon" => 0x03a5,
    "Phi" => 0x03a6,
    "Chi" => 0x03a7,
    "Psi" => 0x03a8,
    "Omega" => 0x03a9,
    "alpha" => 0x03b1,
    "beta" => 0x03b2,
    "gamma" => 0x03b3,
    "delta" => 0x03b4,
    "epsilon" => 0x03b5,
    "zeta" => 0x03b6,
    "eta" => 0x03b7,
    "theta" => 0x03b8,
    "iota" => 0x03b9,
    "kappa" => 0x03ba,
    "lambda" => 0x03bb,
    "mu" => 0x03bc,
    "nu" => 0x03bd,
    "xi" => 0x03be,
    "omicron" => 0x03bf,
    "pi" => 0x03c0,
    "rho" => 0x03c1,
    "sigmaf" => 0x03c2,
    "sigma" => 0x03c3,
    "tau" => 0x03c4,
    "upsilon" => 0x03c5,
    "phi" => 0x03c6,
    "chi" => 0x03c7,
    "psi" => 0x03c8,
    "omega" => 0x03c9,
    "thetasym" => 0x03d1,
    "upsih" => 0x03d2,
    "piv" => 0x03d6,
    "ensp" => 0x2002,
    "emsp" => 0x2003,
    "thinsp" => 0x2009,
    "zwnj" => 0x200c,
    "zwj" => 0x200d,
    "lrm" => 0x200e,
    "rlm" => 0x200f,
    "ndash" => 0x2013,
    "mdash" => 0x2014,
    "lsquo" => 0x2018,
    "rsquo" => 0x2019,
    "sbquo" => 0x201a,
    "ldquo" => 0x201c,
    "rdquo" => 0x201d,
    "bdquo" => 0x201e,
    "dagger" => 0x2020,
    "Dagger" => 0x2021,
    "bull" => 0x2022,
    "hellip" => 0x2026,
    "permil" => 0x2030,
    "prime" => 0x2032,
    "Prime" => 0x2033,
    "lsaquo" => 0x2039,
    "rsaquo" => 0x203a,
    "oline" => 0x203e,
    "frasl" => 0x2044,
    "euro" => 0x20ac,
    "image" => 0x2111,
    "weierp" => 0x2118,
    "real" => 0x211c,
    "trade" => 0x2122,
    "alefsym" => 0x2135,
    "larr" => 0x2190,
    "uarr" => 0x2191,
    "rarr" => 0x2192,
    "darr" => 0x2193,
    "harr" => 0x2194,
    "crarr" => 0x21b5,
    "lArr" => 0x21d0,
    "uArr" => 0x21d1,
    "rArr" => 0x21d2,
    "dArr" => 0x21d3,
    "hArr" => 0x21d4,
    "forall" => 0x2200,
    "part" => 0x2202,
    "exist" => 0x2203,
    "empty" => 0x2205,
    "nabla" => 0x2207,
    "isin" => 0x2208,
    "notin" => 0x2209,
    "ni" => 0x220b,
    "prod" => 0x220f,
    "sum" => 0x2211,
    "minus" => 0x2212,
    "lowast" => 0x2217,
    "radic" => 0x221a,
    "prop" => 0x221d,
    "infin" => 0x221e,
    "ang" => 0x2220,
    "and" => 0x2227,
    "or" => 0x2228,
    "cap" => 0x2229,
    "cup" => 0x222a,
    "int" => 0x222b,
    "there4" => 0x2234,
    "sim" => 0x223c,
    "cong" => 0x2245,
    "asymp" => 0x2248,
    "ne" => 0x2260,
    "equiv" => 0x2261,
    "le" => 0x2264,
    "ge" => 0x2265,
    "sub" => 0x2282,
    "sup" => 0x2283,
    "nsub" => 0x2284,
    "sube" => 0x2286,
    "supe" => 0x2287,
    "oplus" => 0x2295,
    "otimes" => 0x2297,
    "perp" => 0x22a5,
    "sdot" => 0x22c5,
    "lceil" => 0x2308,
    "rceil" => 0x2309,
    "lfloor" => 0x230a,
    "rfloor" => 0x230b,
    "lang" => 0x2329,
    "rang" => 0x232a,
    "loz" => 0x25ca,
    "spades" => 0x2660,
    "clubs" => 0x2663,
    "hearts" => 0x2665,
    "diams" => 0x2666,
    _ => 0x0
  }
}

fn hex_to_dec(s: &str) -> u32 {
  let mut i = 0;
  let len = s.len();
  let mut payload = 0b0;
  loop {
    if i == len {
      break;
    }
    let sl = &s[i..i + 1];
    let b = match sl {
      "1" => { 0b0001 }
      "2" => { 0b0010 }
      "3" => { 0b0011 }
      "4" => { 0b0100 }
      "5" => { 0b0101 }
      "6" => { 0b0110 }
      "7" => { 0b0111 }
      "8" => { 0b1000 }
      "9" => { 0b1001 }
      "a" => { 0b1010 }
      "A" => { 0b1010 }
      "b" => { 0b1011 }
      "B" => { 0b1011 }
      "c" => { 0b1100 }
      "C" => { 0b1100 }
      "d" => { 0b1101 }
      "D" => { 0b1101 }
      "e" => { 0b1110 }
      "E" => { 0b1110 }
      "f" => { 0b1111 }
      "F" => { 0b1111 }
      _ => { 0 }
    };
    payload = payload << 4 | b;
    i = i + 1;
  }
  payload
}

unsafe fn to_dec(s: &str) -> u32 {
  let mut i = 0;
  let len = s.len();
  let mut payload = 0b0;
  loop {
    if i == len {
      break;
    }
    let sl = s.get_unchecked(i..i + 1);
    let d = match sl {
      "1" => { 1 }
      "2" => { 2 }
      "3" => { 3 }
      "4" => { 4 }
      "5" => { 5 }
      "6" => { 6 }
      "7" => { 7 }
      "8" => { 8 }
      "9" => { 9 }
      _ => { 0 }
    };
    payload = payload + d;
    i = i + 1;
  }
  payload
}
