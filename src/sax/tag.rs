#[derive(Clone)]
pub struct Tag {
  pub name: String,
  pub attributes: Vec<(String, String)>,
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

  pub fn get_attribute_mut(&mut self, key: &str) -> Option<&mut (String, String)> {
    for a in &mut self.attributes {
      if a.0 == key {
        return Some(a);
      }
    }
    None
  }

  pub fn set_attribute(&mut self, attribute: (String, String)) {
    for a in &mut self.attributes {
      if a.0 == attribute.0 {
        a.1 = attribute.1;
        return;
      }
    }
    self.attributes.push(attribute);
  }
}
