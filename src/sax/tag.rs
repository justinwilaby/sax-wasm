#[derive(Clone)]
pub struct Tag {
  pub name: String,
  pub attributes: Vec<Attribute>,
  pub text_nodes: Vec<Text>,
  pub self_closing: bool,
  pub open_start: (u32, u32),
  pub open_end: (u32, u32),
  pub close_start: (u32, u32),
  pub close_end: (u32, u32),
}

impl Tag {
  pub fn new(open_start: (u32, u32)) -> Tag {
    Tag {
      open_start,
      open_end: (0, 0),
      close_start: (0, 0),
      close_end: (0, 0),

      attributes: Vec::new(),
      text_nodes: Vec::new(),

      name: "".to_string(),
      self_closing: false,
    }
  }
}

#[derive(Clone)]
pub struct Text {
  pub value: String,
  pub start: (u32, u32),
  pub end: (u32, u32),
}

impl Text {
  pub fn new(start: (u32, u32)) -> Text {
    return Text {
      start,
      value: "".to_string(),
      end: (0, 0),
    };
  }
}

#[derive(Clone)]
pub struct Attribute {
  pub name: String,
  pub value: String,
  pub name_start: (u32, u32),
  pub name_end: (u32, u32),
  pub value_start: (u32, u32),
  pub value_end: (u32, u32),
}

impl Attribute {
  pub fn new() -> Attribute {
    return Attribute {
      name: "".to_string(),
      value: "".to_string(),
      name_start: (0, 0),
      name_end: (0, 0),
      value_start: (0, 0),
      value_end: (0, 0),
    };
  }
}
