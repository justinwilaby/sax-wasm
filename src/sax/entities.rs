use sax::names::is_name_start_char;
use std::char;

// https://unicode-table.com/en/
pub fn is_entity_start_char(grapheme: &str) -> bool {
  let c = grapheme.chars().next().unwrap();
  if c != '\u{003A}' && is_name_start_char(grapheme) {
    return true;
  }
  c == '\u{0023}'
}

pub fn is_entity_body(grapheme: &str) -> bool {
  if is_entity_start_char(grapheme) {
    return true;
  }
  let c = grapheme.chars().next().unwrap();
  match c {
    '\u{00B7}' => true,
    '\u{0030}'...'\u{036F}' => true,
    '\u{203F}'...'\u{2040}' => true,
    _ => false
  }
}

pub fn parse_entity<'a>(entity: &String) -> String {
  let mut e = match_xml_entity(entity.as_ref());
  if e != '\u{0}' {
    return e.to_string();
  }
  e = match_entity(entity.as_ref());
  if e != '\u{0}' {
    return e.to_string();
  }
  let mut c = None;
  unsafe {
    if entity.get_unchecked(0..1) == "#" {
      let x = entity.get_unchecked(1..2);
      if x == "x" || x == "X" {
        let hex_str = entity.get_unchecked(2..entity.len());
        let hex = hex_to_dec(hex_str);
        c = Some(char::from_u32_unchecked(hex));
      } else {
        let dec_str = entity.get_unchecked(1..entity.len());
        let dec = to_dec(dec_str);
        c = Some(char::from_u32_unchecked(dec));
      }
    }
  }
  return c.unwrap_or('\u{0}').to_string();
}

fn match_xml_entity(entity: &str) -> char {
  let c = match entity.as_ref() {
    "amp" => '\u{0026}',
    "gt" => '\u{003E}',
    "lt" => '\u{003C}',
    "quot" => '\u{0022}',
    "apos" => '\u{027}',
    _ => '\u{0}'
  };

  c
}

fn match_entity(entity: &str) -> char {
  let c = match entity.as_ref() {
    "amp" => '\u{0026}',
    "gt" => '\u{003E}',
    "lt" => '\u{003C}',
    "quot" => '\u{0022}',
    "apos" => '\u{027}',
    "AElig" => '\u{00c6}',
    "Aacute" => '\u{00c1}',
    "Acirc" => '\u{00c2}',
    "Agrave" => '\u{00c0}',
    "Aring" => '\u{00c5}',
    "Atilde" => '\u{00c3}',
    "Auml" => '\u{00c4}',
    "Ccedil" => '\u{00c7}',
    "ETH" => '\u{00d0}',
    "Eacute" => '\u{00c9}',
    "Ecirc" => '\u{00ca}',
    "Egrave" => '\u{00c8}',
    "Euml" => '\u{00cb}',
    "Iacute" => '\u{00cd}',
    "Icirc" => '\u{00ce}',
    "Igrave" => '\u{00cc}',
    "Iuml" => '\u{00cf}',
    "Ntilde" => '\u{00d1}',
    "Oacute" => '\u{00d3}',
    "Ocirc" => '\u{00d4}',
    "Ograve" => '\u{00d2}',
    "Oslash" => '\u{00d8}',
    "Otilde" => '\u{00d5}',
    "Ouml" => '\u{00d6}',
    "THORN" => '\u{00de}',
    "Uacute" => '\u{00da}',
    "Ucirc" => '\u{00db}',
    "Ugrave" => '\u{00d9}',
    "Uuml" => '\u{00dc}',
    "Yacute" => '\u{00dd}',
    "aacute" => '\u{00e1}',
    "acirc" => '\u{00e2}',
    "aelig" => '\u{00e6}',
    "agrave" => '\u{00e0}',
    "aring" => '\u{00e5}',
    "atilde" => '\u{00e3}',
    "auml" => '\u{00e4}',
    "ccedil" => '\u{00e7}',
    "eacute" => '\u{00e9}',
    "ecirc" => '\u{00ea}',
    "egrave" => '\u{00e8}',
    "eth" => '\u{00f0}',
    "euml" => '\u{00eb}',
    "iacute" => '\u{00ed}',
    "icirc" => '\u{00ee}',
    "igrave" => '\u{00ec}',
    "iuml" => '\u{00ef}',
    "ntilde" => '\u{00f1}',
    "oacute" => '\u{00f3}',
    "ocirc" => '\u{00f4}',
    "ograve" => '\u{00f2}',
    "oslash" => '\u{00f8}',
    "otilde" => '\u{00f5}',
    "ouml" => '\u{00f6}',
    "szlig" => '\u{00df}',
    "thorn" => '\u{00fe}',
    "uacute" => '\u{00fa}',
    "ucirc" => '\u{00fb}',
    "ugrave" => '\u{00f9}',
    "uuml" => '\u{00fc}',
    "yacute" => '\u{00fd}',
    "yuml" => '\u{00ff}',
    "copy" => '\u{00a9}',
    "reg" => '\u{00ae}',
    "nbsp" => '\u{00a0}',
    "iexcl" => '\u{00a1}',
    "cent" => '\u{00a2}',
    "pound" => '\u{00a3}',
    "curren" => '\u{00a4}',
    "yen" => '\u{00a5}',
    "brvbar" => '\u{00a6}',
    "sect" => '\u{00a7}',
    "uml" => '\u{00a8}',
    "ordf" => '\u{00aa}',
    "laquo" => '\u{00ab}',
    "not" => '\u{00ac}',
    "shy" => '\u{00ad}',
    "macr" => '\u{00af}',
    "deg" => '\u{00b0}',
    "plusmn" => '\u{00b1}',
    "sup1" => '\u{00b9}',
    "sup2" => '\u{00b2}',
    "sup3" => '\u{00b3}',
    "acute" => '\u{00b4}',
    "micro" => '\u{00b5}',
    "para" => '\u{00b6}',
    "middot" => '\u{00b7}',
    "cedil" => '\u{00b8}',
    "ordm" => '\u{00ba}',
    "raquo" => '\u{00bb}',
    "frac14" => '\u{00bc}',
    "frac12" => '\u{00bd}',
    "frac34" => '\u{00be}',
    "iquest" => '\u{00bf}',
    "times" => '\u{00d7}',
    "divide" => '\u{00f7}',
    "OElig" => '\u{152}',
    "oelig" => '\u{0153}',
    "Scaron" => '\u{0160}',
    "scaron" => '\u{0161}',
    "Yuml" => '\u{0178}',
    "fnof" => '\u{0192}',
    "circ" => '\u{02c6}',
    "tilde" => '\u{02dc}',
    "Alpha" => '\u{0391}',
    "Beta" => '\u{0392}',
    "Gamma" => '\u{0393}',
    "Delta" => '\u{0394}',
    "Epsilon" => '\u{0395}',
    "Zeta" => '\u{0396}',
    "Eta" => '\u{0397}',
    "Theta" => '\u{0398}',
    "Iota" => '\u{0399}',
    "Kappa" => '\u{039a}',
    "Lambda" => '\u{039b}',
    "Mu" => '\u{039c}',
    "Nu" => '\u{039d}',
    "Xi" => '\u{039e}',
    "Omicron" => '\u{039f}',
    "Pi" => '\u{03a0}',
    "Rho" => '\u{03a1}',
    "Sigma" => '\u{03a3}',
    "Tau" => '\u{03a4}',
    "Upsilon" => '\u{03a5}',
    "Phi" => '\u{03a6}',
    "Chi" => '\u{03a7}',
    "Psi" => '\u{03a8}',
    "Omega" => '\u{03a9}',
    "alpha" => '\u{03b1}',
    "beta" => '\u{03b2}',
    "gamma" => '\u{03b3}',
    "delta" => '\u{03b4}',
    "epsilon" => '\u{03b5}',
    "zeta" => '\u{03b6}',
    "eta" => '\u{03b7}',
    "theta" => '\u{03b8}',
    "iota" => '\u{03b9}',
    "kappa" => '\u{03ba}',
    "lambda" => '\u{03bb}',
    "mu" => '\u{03bc}',
    "nu" => '\u{03bd}',
    "xi" => '\u{03be}',
    "omicron" => '\u{03bf}',
    "pi" => '\u{03c0}',
    "rho" => '\u{03c1}',
    "sigmaf" => '\u{03c2}',
    "sigma" => '\u{03c3}',
    "tau" => '\u{03c4}',
    "upsilon" => '\u{03c5}',
    "phi" => '\u{03c6}',
    "chi" => '\u{03c7}',
    "psi" => '\u{03c8}',
    "omega" => '\u{03c9}',
    "thetasym" => '\u{03d1}',
    "upsih" => '\u{03d2}',
    "piv" => '\u{03d6}',
    "ensp" => '\u{2002}',
    "emsp" => '\u{2003}',
    "thinsp" => '\u{2009}',
    "zwnj" => '\u{200c}',
    "zwj" => '\u{200d}',
    "lrm" => '\u{200e}',
    "rlm" => '\u{200f}',
    "ndash" => '\u{2013}',
    "mdash" => '\u{2014}',
    "lsquo" => '\u{2018}',
    "rsquo" => '\u{2019}',
    "sbquo" => '\u{201a}',
    "ldquo" => '\u{201c}',
    "rdquo" => '\u{201d}',
    "bdquo" => '\u{201e}',
    "dagger" => '\u{2020}',
    "Dagger" => '\u{2021}',
    "bull" => '\u{2022}',
    "hellip" => '\u{2026}',
    "permil" => '\u{2030}',
    "prime" => '\u{2032}',
    "Prime" => '\u{2033}',
    "lsaquo" => '\u{2039}',
    "rsaquo" => '\u{203a}',
    "oline" => '\u{203e}',
    "frasl" => '\u{2044}',
    "euro" => '\u{20ac}',
    "image" => '\u{2111}',
    "weierp" => '\u{2118}',
    "real" => '\u{211c}',
    "trade" => '\u{2122}',
    "alefsym" => '\u{2135}',
    "larr" => '\u{2190}',
    "uarr" => '\u{2191}',
    "rarr" => '\u{2192}',
    "darr" => '\u{2193}',
    "harr" => '\u{2194}',
    "crarr" => '\u{21b5}',
    "lArr" => '\u{21d0}',
    "uArr" => '\u{21d1}',
    "rArr" => '\u{21d2}',
    "dArr" => '\u{21d3}',
    "hArr" => '\u{21d4}',
    "forall" => '\u{2200}',
    "part" => '\u{2202}',
    "exist" => '\u{2203}',
    "empty" => '\u{2205}',
    "nabla" => '\u{2207}',
    "isin" => '\u{2208}',
    "notin" => '\u{2209}',
    "ni" => '\u{220b}',
    "prod" => '\u{220f}',
    "sum" => '\u{2211}',
    "minus" => '\u{2212}',
    "lowast" => '\u{2217}',
    "radic" => '\u{221a}',
    "prop" => '\u{221d}',
    "infin" => '\u{221e}',
    "ang" => '\u{2220}',
    "and" => '\u{2227}',
    "or" => '\u{2228}',
    "cap" => '\u{2229}',
    "cup" => '\u{222a}',
    "int" => '\u{222b}',
    "there4" => '\u{2234}',
    "sim" => '\u{223c}',
    "cong" => '\u{2245}',
    "asymp" => '\u{2248}',
    "ne" => '\u{2260}',
    "equiv" => '\u{2261}',
    "le" => '\u{2264}',
    "ge" => '\u{2265}',
    "sub" => '\u{2282}',
    "sup" => '\u{2283}',
    "nsub" => '\u{2284}',
    "sube" => '\u{2286}',
    "supe" => '\u{2287}',
    "oplus" => '\u{2295}',
    "otimes" => '\u{2297}',
    "perp" => '\u{22a5}',
    "sdot" => '\u{22c5}',
    "lceil" => '\u{2308}',
    "rceil" => '\u{2309}',
    "lfloor" => '\u{230a}',
    "rfloor" => '\u{230b}',
    "lang" => '\u{2329}',
    "rang" => '\u{232a}',
    "loz" => '\u{25ca}',
    "spades" => '\u{2660}',
    "clubs" => '\u{2663}',
    "hearts" => '\u{2665}',
    "diams" => '\u{2666}',
    _ => '\u{0}'
  };

  c
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
    let b = match sl.as_ref() {
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
    let d = match sl.as_ref() {
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