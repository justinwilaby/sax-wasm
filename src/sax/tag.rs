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

    // known byte length
    read_u32_into(self.open_start.0 as u32, &mut v);
    read_u32_into(self.open_start.1 as u32, &mut v);

    read_u32_into(self.open_end.0 as u32, &mut v);
    read_u32_into(self.open_end.1 as u32, &mut v);

    read_u32_into(self.close_start.0 as u32, &mut v);
    read_u32_into(self.close_start.1 as u32, &mut v);

    read_u32_into(self.close_end.0 as u32, &mut v);
    read_u32_into(self.close_end.1 as u32, &mut v);
    v.push(self.self_closing.clone() as u8);

    read_u32_into(self.name.len() as u32, &mut v);
    v.extend_from_slice(self.name.as_bytes());

    // unknown byte length
    prepend_u32_into((v.len() - 1) as u32, 0, &mut v);
    read_u32_into(self.attributes.len() as u32, &mut v);
    for a in &self.attributes {
      let mut attr = a.encode();
      read_u32_into(attr.len() as u32, &mut v);
      v.append(&mut attr);
    }

    prepend_u32_into((v.len() - 1) as u32, 4, &mut v);
    read_u32_into(self.text_nodes.len() as u32, &mut v);
    for t in &self.text_nodes {
      let mut text = t.encode();
      read_u32_into(text.len() as u32, &mut v);
      v.append(&mut text);
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
    read_u32_into(self.start.0, &mut v);
    read_u32_into(self.start.1, &mut v);

    read_u32_into(self.end.0, &mut v);
    read_u32_into(self.end.1, &mut v);

    read_u32_into(self.value.len() as u32, &mut v);
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
    read_u32_into(self.name_start.0, &mut v);
    read_u32_into(self.name_start.1, &mut v);

    read_u32_into(self.name_end.0, &mut v);
    read_u32_into(self.name_end.1, &mut v);

    read_u32_into(self.value_start.0, &mut v);
    read_u32_into(self.value_start.1, &mut v);

    read_u32_into(self.value_end.0, &mut v);
    read_u32_into(self.value_end.1, &mut v);

    read_u32_into(self.name.len() as u32, &mut v);
    v.extend_from_slice(self.name.as_bytes());

    read_u32_into(self.value.len() as u32, &mut v);
    v.extend_from_slice(self.value.as_bytes());
    v
  }
}

pub trait Encode<T> {
  fn encode(&self) -> T;
}

pub fn prepend_u32_into(x: u32, start: usize, vec: &mut Vec<u8>) {
  vec.insert(start, (x & 0xff) as u8);
  vec.insert(start + 1, ((x & 0xffff) >> 8) as u8);
  vec.insert(start + 2, ((x & 0xffffff) >> 16) as u8);
  vec.insert(start + 3, ((x & 0xffffffff) >> 24) as u8);
}

// Little Endian
pub fn read_u32_into(x: u32, vec: &mut Vec<u8>) {
  vec.push((x & 0xff) as u8);
  vec.push(((x & 0xffff) >> 8) as u8);
  vec.push(((x & 0xffffff) >> 16) as u8);
  vec.push(((x & 0xffffffff) >> 24) as u8);
}
