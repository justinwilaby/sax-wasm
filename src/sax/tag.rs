#[repr(C)]
#[derive(Clone)]
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

#[repr(C)]
#[derive(Clone)]
pub struct Text {
    pub value: Vec<u8>,
    pub start: [u32; 2],
    pub end: [u32; 2],
}

impl Text {
    pub fn new(start: [u32; 2]) -> Text {
        return Text { start, value: Vec::new(), end: [0, 0] };
    }
}

#[repr(C)]
#[derive(Clone)]
pub struct Attribute {
    pub name: Text,
    pub value: Text,
    pub attr_type: AttrType,
}

impl Attribute {
    pub fn new() -> Attribute {
        return Attribute { name: Text::new([0, 0]), value: Text::new([0, 0]), attr_type: AttrType::Normal };
    }
}

#[repr(C)]
#[derive(Clone)]
pub struct ProcInst {
    pub start: [u32; 2],
    pub end: [u32; 2],
    pub target: Text,
    pub content: Text,
}

impl ProcInst {
    pub fn new() -> ProcInst {
        return ProcInst { start: [0, 0], end: [0, 0], target: Text::new([0, 0]), content: Text::new([0, 0]) };
    }
}

#[repr(C)]
#[derive(Clone, Copy)]
pub enum Entity<'a> {
    Attribute(&'a Attribute),
    ProcInst(&'a ProcInst),
    Tag(&'a Tag),
    Text(&'a Text),
}

#[derive(Clone, Copy)]
pub enum AttrType {
    Normal = 0x00,
    JSX = 0x01,
}
