#[derive(Clone)]
pub struct Tag {
  pub name: String,
  pub attributes: Vec<Attribute>,
  pub text: String,
  pub self_closing: bool,
  pub start: (u32, u32),
  pub end: (u32, u32),
}

impl Tag {
  pub fn new(start: (u32, u32)) -> Tag {
    Tag {
      start,
      name: "".to_string(),
      attributes: Vec::new(),
      text: "".to_string(),
      self_closing: false,
      end: (0, 0),
    }
  }
}

#[derive(Clone)]
pub struct Attribute {
  pub name: String,
  pub value: String,
  pub start: (u32, u32),
  pub end: (u32, u32),
}

impl Attribute {
  pub fn new() -> Attribute {
    return Attribute {
      name: "".to_string(),
      value: "".to_string(),
      start: (0, 0),
      end: (0, 0),
    };
  }
}
