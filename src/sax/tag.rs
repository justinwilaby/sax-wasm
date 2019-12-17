use std::mem::transmute;

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

      name: String::new(),
      self_closing: false,
    }
  }
}

impl Encode<Vec<u8>> for Tag {
  fn encode(&self) -> Vec<u8> {
    let mut v = Vec::new();
    unsafe {

      // known byte length
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.open_start.0));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.open_start.1));

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.open_end.0));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.open_end.1));

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.close_start.0));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.close_start.1));

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.close_end.0));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.close_end.1));

      v.push(self.self_closing.clone() as u8);

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.name.len() as u32));
      v.extend_from_slice(self.name.as_bytes());

      // unknown byte length
      let attr_ptr = v.len();
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.attributes.len() as u32));
      for a in &self.attributes {
        let mut attr = a.encode();
        v.extend_from_slice(&transmute::<u32, [u8; 4]>(attr.len() as u32));
        v.append(&mut attr);
      }

      let text_ptr = v.len();
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.text_nodes.len() as u32));
      for t in &self.text_nodes {
        let mut text = t.encode();
        v.extend_from_slice(&transmute::<u32, [u8; 4]>(text.len() as u32));
        v.append(&mut text);
      }
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(attr_ptr as u32));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(text_ptr as u32));
    }
    v
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
      value: String::new(),
      end: (0, 0),
    };
  }
}

impl Encode<Vec<u8>> for Text {
  fn encode(&self) -> Vec<u8> {
    let mut v = Vec::new();
    unsafe {
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.start.0));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.start.1));

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.end.0));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.end.1));

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.value.len() as u32));
    }
    v.extend_from_slice(self.value.as_bytes());
    v
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
      name: String::new(),
      value: String::new(),
      name_start: (0, 0),
      name_end: (0, 0),
      value_start: (0, 0),
      value_end: (0, 0),
    };
  }
}

impl Encode<Vec<u8>> for Attribute {
  fn encode(&self) -> Vec<u8> {
    let mut v: Vec<u8> = Vec::new();
    unsafe {
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.name_start.0));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.name_start.1));

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.name_end.0));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.name_end.1));

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.value_start.0));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.value_start.1));

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.value_end.0));
      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.value_end.1));

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.name.len() as u32));

      v.extend_from_slice(self.name.as_bytes());

      v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.value.len() as u32));
    }
    v.extend_from_slice(self.value.as_bytes());
    v
  }
}

pub trait Encode<T> {
  fn encode(&self) -> T;
}

