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

impl Encode<Vec<u32>> for Tag {
  fn encode(&self) -> Vec<u32> {
    let mut v: Vec<u32> = Vec::new();
    // known byte length
    v.push(self.close_end.0.clone());
    v.push(self.close_end.1.clone());

    v.push(self.close_start.0.clone());
    v.push(self.close_start.1.clone());

    v.push(self.open_end.0.clone());
    v.push(self.open_end.1.clone());

    v.push(self.open_start.0.clone());
    v.push(self.open_start.1.clone());

    v.push(self.name.as_ptr() as u32);
    v.push(self.name.len() as u32);

    v.push(self.self_closing.clone() as u32);

    // unknown byte length
    v.push(self.attributes.len() as u32);
    for a in &self.attributes {
      v.extend_from_slice(&mut a.encode());
    }

    v.push(self.text_nodes.len() as u32);
    for t in &self.text_nodes {
      v.extend_from_slice(&mut t.encode());
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

impl Encode<[u32; 6]> for Text {
  fn encode(&self) -> [u32; 6] {
    let mut buf: [u32; 6] = [0; 6];
    buf[0] = self.end.0.clone();
    buf[1] = self.end.1.clone();

    buf[2] = self.start.0.clone();
    buf[3] = self.start.1.clone();

    buf[4] = self.value.as_ptr() as u32;
    buf[5] = self.value.len() as u32;

    buf
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

impl Encode<[u32; 12]> for Attribute {
  fn encode(&self) -> [u32; 12] {
    let mut buf: [u32; 12] = [0; 12];
    buf[0] = self.name.as_ptr() as u32;
    buf[1] = self.name.len() as u32;

    buf[2] = self.name_end.0.clone();
    buf[3] = self.name_end.1.clone();

    buf[4] = self.name_start.0.clone();
    buf[5] = self.name_start.1.clone();

    buf[6] = self.value.as_ptr() as u32;
    buf[7] = self.value.len() as u32;

    buf[8] = self.value_end.0.clone();
    buf[9] = self.value_end.1.clone();

    buf[10] = self.value_start.0.clone();
    buf[11] = self.value_start.1.clone();

    buf
  }
}

pub trait Encode<T> {
  fn encode(&self) -> T;
}
