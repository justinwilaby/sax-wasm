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
        let mut v = vec![0, 0, 0, 0, 0, 0, 0, 0];

        // known byte length
        v.extend_from_slice(&u32::to_le_bytes(self.open_start.0));
        v.extend_from_slice(&u32::to_le_bytes(self.open_start.1));

        v.extend_from_slice(&u32::to_le_bytes(self.open_end.0));
        v.extend_from_slice(&u32::to_le_bytes(self.open_end.1));

        v.extend_from_slice(&u32::to_le_bytes(self.close_start.0));
        v.extend_from_slice(&u32::to_le_bytes(self.close_start.1));

        v.extend_from_slice(&u32::to_le_bytes(self.close_end.0));
        v.extend_from_slice(&u32::to_le_bytes(self.close_end.1));

        v.push(self.self_closing.clone() as u8);

        v.extend_from_slice(&u32::to_le_bytes(self.name.len() as u32));
        v.extend_from_slice(self.name.as_bytes());

        // write the starting location for the attributes at bytes 0..4
        v.splice(0..4, u32::to_le_bytes(v.len() as u32).to_vec());
        // write the number of attributes
        v.extend_from_slice(&u32::to_le_bytes(self.attributes.len() as u32));
        for a in &self.attributes {
            let mut attr = a.encode();
            v.extend_from_slice(&u32::to_le_bytes(attr.len() as u32));
            v.append(&mut attr);
        }

        // write the starting location for the text node at bytes 4..8
        v.splice(4..8, u32::to_le_bytes(v.len() as u32).to_vec());
        // write the number of text nodes
        v.extend_from_slice(&u32::to_le_bytes(self.text_nodes.len() as u32));
        for t in &self.text_nodes {
            let mut text = t.encode();
            v.extend_from_slice(&u32::to_le_bytes(text.len() as u32));
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

        v.extend_from_slice(&u32::to_le_bytes(self.start.0));
        v.extend_from_slice(&u32::to_le_bytes(self.start.1));

        v.extend_from_slice(&u32::to_le_bytes(self.end.0));
        v.extend_from_slice(&u32::to_le_bytes(self.end.1));

        v.extend_from_slice(&u32::to_le_bytes(self.value.len() as u32));

        v.extend_from_slice(self.value.as_bytes());
        v
    }
}

#[derive(Clone)]
pub struct Attribute {
    pub name: Text,
    pub value: Text,
    pub attr_type: AttrType,
}

impl Attribute {
    pub fn new() -> Attribute {
        return Attribute {
            name: Text::new((0, 0)),
            value: Text::new((0, 0)),
            attr_type: AttrType::Normal,
        };
    }
}

impl Encode<Vec<u8>> for Attribute {
    fn encode(&self) -> Vec<u8> {
        let mut v: Vec<u8> = Vec::new();
        v.push(self.attr_type as u8);

        let name = self.name.encode();
        v.extend_from_slice(&u32::to_le_bytes(name.len() as u32));
        v.extend_from_slice(name.as_slice());

        v.extend(self.value.encode());

        v
    }
}

pub struct ProcInst {
    pub start: (u32, u32),
    pub end: (u32, u32),
    pub target: Text,
    pub content: Text,
}

impl ProcInst {
    pub fn new() -> ProcInst {
        return ProcInst {
            start: (0, 0),
            end: (0, 0),
            target: Text::new((0, 0)),
            content: Text::new((0, 0)),
        };
    }
}

impl Encode<Vec<u8>> for ProcInst {
    fn encode(&self) -> Vec<u8> {
        let mut v: Vec<u8> = Vec::new();

        v.extend_from_slice(&u32::to_le_bytes(self.start.0));
        v.extend_from_slice(&u32::to_le_bytes(self.start.1));
        v.extend_from_slice(&u32::to_le_bytes(self.end.0));
        v.extend_from_slice(&u32::to_le_bytes(self.end.1));

        let target = self.target.encode();
        v.extend_from_slice(&u32::to_le_bytes(target.len() as u32));
        v.extend(target);

        v.extend(self.content.encode());
        v
    }
}

pub enum Entity<'a> {
    Attribute(&'a mut Attribute),
    ProcInst(&'a mut ProcInst),
    Tag(&'a mut Tag),
    Text(&'a mut Text),
}

impl<'a> Encode<Vec<u8>> for Entity<'a> {
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
