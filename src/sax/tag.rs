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

impl Readable for Tag {
    fn read(&self, entity: u32) -> (u32, u32) {
        unimplemented!()
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

impl Readable for Text {
    fn read(&self, entity: u32) -> (u32, u32) {
        unimplemented!()
    }
}

#[derive(Clone)]
pub struct Attribute {
    pub name: Text,
    pub value: Text,
}

impl Attribute {
    pub fn new() -> Attribute {
        return Attribute {
            name: Text::new((0, 0)),
            value: Text::new((0, 0)),
        };
    }
}

impl Readable for Attribute {
    fn read(&self, entity: u32) -> (u32, u32) {
        unimplemented!()
    }
}

enum AttributeField {
    Name = 0,
    Value = 1,
}

#[derive(Clone)]
pub struct ProcInst {
    pub start: (u32, u32),
    pub end: (u32, u32),
    pub target: Text,
    pub content: Text,
}

impl ProcInst {
    pub fn new(start: (u32, u32)) -> ProcInst {
        return ProcInst {
            start,
            end: (0, 0),
            target: Text::new((0, 0)),
            content: Text::new((0, 0)),
        };
    }
}

pub trait Readable {
    fn read(&self, entity: u32) -> (u32, u32);
}
