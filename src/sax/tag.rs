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
    let mut v: Vec<u8> = Vec::new();
    // known byte length
    v.extend_from_slice(read_u32_into(self.close_end.0 as u32, &mut [0; 4], 0));
    v.extend_from_slice(read_u32_into(self.close_end.1 as u32, &mut [0; 4], 0));

    v.extend_from_slice(read_u32_into(self.close_start.0 as u32, &mut [0; 4], 0));
    v.extend_from_slice(read_u32_into(self.close_start.1 as u32, &mut [0; 4], 0));

    v.extend_from_slice(read_u32_into(self.open_end.0 as u32, &mut [0; 4], 0));
    v.extend_from_slice(read_u32_into(self.open_end.1 as u32, &mut [0; 4], 0));

    v.extend_from_slice(read_u32_into(self.open_start.0 as u32, &mut [0; 4], 0));
    v.extend_from_slice(read_u32_into(self.open_start.1 as u32, &mut [0; 4], 0));

    v.extend_from_slice(read_u32_into(self.name.as_ptr() as u32, &mut [0; 4], 0));
    v.extend_from_slice(read_u32_into(self.name.len() as u32, &mut [0; 4], 0));

    v.push(self.self_closing.clone() as u8);

    // unknown byte length
    v.extend_from_slice(read_u32_into(self.attributes.len() as u32, &mut [0; 4], 0));
    for a in &self.attributes {
      v.extend_from_slice(&mut a.encode());
    }

    v.extend_from_slice(read_u32_into(self.text_nodes.len() as u32, &mut [0; 4], 0));
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

impl Encode<[u8; 24]> for Text {
  fn encode(&self) -> [u8; 24] {
    let mut buf: [u8; 24] = [0; 24];
    read_u32_into(self.end.0, &mut buf, 0);
    read_u32_into(self.end.1, &mut buf, 4);

    read_u32_into(self.start.0, &mut buf, 8);
    read_u32_into(self.start.1, &mut buf, 12);

    read_u32_into(self.value.as_ptr() as u32, &mut buf, 16);
    read_u32_into(self.value.len() as u32, &mut buf, 20);

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

impl Encode<[u8; 48]> for Attribute {
  fn encode(&self) -> [u8; 48] {
    let mut buf: [u8; 48] = [0; 48];
    read_u32_into(self.name.as_ptr() as u32, &mut buf, 0);
    read_u32_into(self.name.len() as u32, &mut buf, 4);

    read_u32_into(self.name_end.0, &mut buf, 8);
    read_u32_into(self.name_end.1, &mut buf, 12);

    read_u32_into(self.name_start.0, &mut buf, 16);
    read_u32_into(self.name_start.1, &mut buf, 20);

    read_u32_into(self.value.as_ptr() as u32, &mut buf, 24);
    read_u32_into(self.value.len() as u32, &mut buf, 28);

    read_u32_into(self.value_end.0, &mut buf, 32);
    read_u32_into(self.value_end.1, &mut buf, 36);

    read_u32_into(self.value_start.0, &mut buf, 40);
    read_u32_into(self.value_start.1, &mut buf, 44);

    buf
  }
}

pub trait Encode<T> {
  fn encode(&self) -> T;
}

// Little Endian
pub fn read_u32_into(x: u32, buf: &mut [u8], offset: usize) -> &[u8] {
  buf[offset] = (x & 0xff) as u8;
  buf[offset + 1] = ((x & 0xffff) >> 8) as u8;
  buf[offset + 2] = ((x & 0xffffff) >> 16) as u8;
  buf[offset + 3] = ((x & 0xffffffff) >> 24) as u8;

  buf
}
