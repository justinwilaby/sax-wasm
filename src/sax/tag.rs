use super::utils::u32_to_u8;

#[repr(C)]
pub struct Tag {
    pub name: Vec<u8>,
    pub attributes: Vec<Attribute>,
    pub text_nodes: Vec<Text>,
    pub self_closing: bool,
    pub open_start: [u32; 2],
    pub open_end: [u32; 2],
    pub close_start: [u32; 2],
    pub close_end: [u32; 2],
}

impl Tag {
    pub fn new(open_start: [u32; 2]) -> Tag {
        Tag {
            name: Vec::new(),
            attributes: Vec::new(),
            text_nodes: Vec::new(),
            self_closing: false,

            open_start,
            open_end: [0, 0],
            close_start: [0, 0],
            close_end: [0, 0],
        }
    }
}

impl Encode<Vec<u8>> for Tag {
    #[inline]
    fn encode(&self) -> Vec<u8> {
        let mut v = vec![0, 0, 0, 0, 0, 0, 0, 0];
        let name_bytes = self.name.as_slice();

        v.reserve(name_bytes.len() + 37);
        // known byte length
        v.extend_from_slice(u32_to_u8(&self.open_start));
        v.extend_from_slice(u32_to_u8(&self.open_end));

        v.extend_from_slice(u32_to_u8(&self.close_start));
        v.extend_from_slice(u32_to_u8(&self.close_end));

        v.push(self.self_closing as u8);

        v.extend_from_slice(u32_to_u8(&[self.name.len() as u32]));
        v.extend_from_slice(name_bytes);

        // write the starting location for the attributes at bytes 0..4
        v.splice(0..4, u32_to_u8(&[v.len() as u32]).to_vec());
        // write the number of attributes
        v.extend_from_slice(u32_to_u8(&[self.attributes.len() as u32]));
        for a in &self.attributes {
            let mut attr = a.encode();
            let len = attr.len();
            v.reserve(len + 4);
            v.extend_from_slice(u32_to_u8(&[len as u32]));
            v.append(&mut attr);
        }

        // write the starting location for the text node at bytes 4..8
        v.splice(4..8, u32_to_u8(&[v.len() as u32]).to_vec());
        // write the number of text nodes
        v.extend_from_slice(u32_to_u8(&[self.text_nodes.len() as u32]));
        for t in &self.text_nodes {
            let mut text = t.encode();
            let len = text.len();
            v.reserve(len + 4);
            v.extend_from_slice(u32_to_u8(&[len as u32]));
            v.append(&mut text);
        }
        v
    }
}

#[repr(C)]
pub struct Text {
    pub value: Vec<u8>,
    pub start: [u32; 2],
    pub end: [u32; 2],
}

impl Text {
    pub fn new(start: [u32; 2]) -> Text {
        return Text {
            start,
            value: Vec::new(),
            end: [0, 0],
        };
    }
}

impl Encode<Vec<u8>> for Text {
    #[inline]
    fn encode(&self) -> Vec<u8> {
        let bytes = self.value.as_slice();
        let mut v = Vec::with_capacity(bytes.len() + 12);

        v.extend_from_slice(u32_to_u8(&self.start));
        v.extend_from_slice(u32_to_u8(&self.end));

        v.extend_from_slice(u32_to_u8(&[self.value.len() as u32]));
        v.extend_from_slice(bytes);
        v
    }
}

#[repr(C)]
pub struct Attribute {
    pub name: Text,
    pub value: Text,
    pub attr_type: AttrType,
}

impl Attribute {
    pub fn new() -> Attribute {
        return Attribute {
            name: Text::new([0, 0]),
            value: Text::new([0, 0]),
            attr_type: AttrType::Normal,
        };
    }
}

impl Encode<Vec<u8>> for Attribute {
    #[inline]
    fn encode(&self) -> Vec<u8> {
        let mut name = self.name.encode();
        let mut value = self.value.encode();
        let name_len = name.len();
        let value_len = value.len();

        let mut v: Vec<u8> = Vec::with_capacity(name_len + value_len + 9);
        v.push(self.attr_type as u8);
        v.extend_from_slice(u32_to_u8(&[name_len as u32]));

        v.append(&mut name);
        v.append(&mut value);

        v
    }
}
#[repr(C)]
pub struct ProcInst {
    pub start: [u32; 2],
    pub end: [u32; 2],
    pub target: Text,
    pub content: Text,
}

impl ProcInst {
    pub fn new() -> ProcInst {
        return ProcInst {
            start: [0, 0],
            end: [0, 0],
            target: Text::new([0, 0]),
            content: Text::new([0, 0]),
        };
    }
}

impl Encode<Vec<u8>> for ProcInst {
    #[inline]
    fn encode(&self) -> Vec<u8> {
        let mut target = self.target.encode();
        let mut content = self.content.encode();
        let mut v: Vec<u8> = Vec::with_capacity(target.len() + content.len() + 20);

        v.extend_from_slice(u32_to_u8(&self.start));
        v.extend_from_slice(u32_to_u8(&self.end));

        v.extend_from_slice(u32_to_u8(&[target.len() as u32]));
        v.append(&mut target);
        v.append(&mut content);
        v
    }
}
#[repr(C)]
pub enum Entity<'a> {
    Attribute(&'a mut Attribute),
    ProcInst(&'a mut ProcInst),
    Tag(&'a mut Tag),
    Text(&'a mut Text),
}

impl<'a> Encode<Vec<u8>> for Entity<'a> {
    #[inline]
    fn encode(&self) -> Vec<u8> {
        match self {
            Entity::Attribute(a) => a.encode(),
            Entity::ProcInst(p) => p.encode(),
            Entity::Tag(t) => t.encode(),
            Entity::Text(t) => t.encode(),
        }
    }
}

pub trait Encode<T>
where
    T: IntoIterator,
{
    fn encode(&self) -> T;
}

#[derive(Clone, Copy)]
pub enum AttrType {
    Normal = 0x00,
    JSX = 0x01,
}
