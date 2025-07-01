use std::slice;

#[repr(C)]
#[derive(Clone)]
pub struct Tag {
    pub name: Vec<u8>,
    pub attributes: Vec<Attribute>,
    pub text_nodes: Vec<Text>,
    pub self_closing: bool,
    pub open_start: [u64; 2],
    pub open_end: [u64; 2],
    pub close_start: [u64; 2],
    pub close_end: [u64; 2],
    pub header: (usize, usize),
}

impl Tag {
    pub fn new(open_start: [u64; 2]) -> Tag {
        Tag {
            header: (0, 0),
            name: Vec::new(),
            attributes: Vec::new(),
            text_nodes: Vec::new(),
            self_closing: false,

            open_start,
            open_end: [0; 2],
            close_start: [0; 2],
            close_end: [0; 2],
        }
    }

    pub fn get_name_slice(&mut self, ptr: *const u8) -> &[u8] {
        if !self.name.is_empty() {
            return self.get_name(ptr);
        }

        let (start, end) = self.header;
        if start < end {
            let len = end - start;
            if len > 0 {
                return unsafe { slice::from_raw_parts(ptr.add(start), len) };
            }
        }

        &[]
    }

    pub fn hydrate(&mut self, ptr: *const u8) -> bool {
        for a in &mut self.attributes {
            a.hydrate(ptr);
        }
        for t in &mut self.text_nodes {
            t.hydrate(ptr);
        }
        self.get_name(ptr);
        true
    }

    fn get_name(&mut self, ptr: *const u8) -> &Vec<u8> {
        let (start, end) = self.header;
        if start > end {
            return &self.name;
        }
        let len = end - start;
        if len > 0 {
            let slice = unsafe { slice::from_raw_parts(ptr.add(start), len) };
            self.name.extend_from_slice(slice);
        } else if start > 0 && start == end {
            let slice = unsafe { slice::from_raw_parts(ptr.add(start), 1) };
            self.name.extend_from_slice(slice);
        }
        self.header.0 = 0;
        self.header.1 = 0;
        &self.name
    }
}

#[repr(C)]
#[derive(Clone)]
pub struct Text {
    pub header: (usize, usize),
    pub value: Vec<u8>,
    pub start: [u64; 2],
    pub end: [u64; 2],
}

impl Text {
    pub fn new(start: [u64; 2]) -> Text {
        return Text {
            start,
            value: Vec::new(),
            end: [0; 2],
            header: (0, 0),
        };
    }

    pub fn get_value_slice(&mut self, ptr: *const u8, ptr_len: usize) -> &[u8] {
        let mut sl = &[] as &[u8];

        let (start, end) = self.header;
        if start > end || end > ptr_len {
            return &self.value.as_slice();
        }
        let len = end - start;
        if len > 0 {
            sl = unsafe { slice::from_raw_parts(ptr.add(start), len) }
        } else if start > 0 && start == end {
            sl = unsafe { slice::from_raw_parts(ptr.add(start), 1) }
        }

        self.value.extend_from_slice(sl);
        self.header = (0, 0);
        return &self.value.as_slice();
    }

    pub fn hydrate(&mut self, ptr: *const u8) -> bool {
        let (start, end) = self.header;
        self.header.0 = 0;
        self.header.1 = 0;
        if start > end {
            return self.value.len() > 0;
        }
        let mut sl = &[] as &[u8];
        let len = end - start;
        if len > 0 {
            sl = unsafe { slice::from_raw_parts(ptr.add(start), len) };
        } else if start > 0 && start == end {
            sl = unsafe { slice::from_raw_parts(ptr.add(start), 1) };
        }
        self.value.extend_from_slice(sl);
        true
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
        return Attribute {
            name: Text::new([0; 2]),
            value: Text::new([0; 2]),
            attr_type: AttrType::Normal,
        };
    }

    pub fn hydrate(&mut self, ptr: *const u8) -> bool {
        self.name.hydrate(ptr) | self.value.hydrate(ptr)
    }
}

#[repr(C)]
#[derive(Clone)]
pub struct ProcInst {
    pub start: [u64; 2],
    pub end: [u64; 2],
    pub target: Text,
    pub content: Text,
}

impl ProcInst {
    pub fn new() -> ProcInst {
        return ProcInst {
            start: [0; 2],
            end: [0; 2],
            target: Text::new([0; 2]),
            content: Text::new([0; 2]),
        };
    }

    pub fn hydrate(&mut self, ptr: *const u8) -> bool {
        self.target.hydrate(ptr) | self.content.hydrate(ptr)
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

pub enum Dispatched {
    Attribute(Box<Attribute>),
    ProcInst(Box<ProcInst>),
    Tag(Box<Tag>),
    Text(Box<Text>),
}

#[derive(Clone, Copy)]
pub enum AttrType {
    Normal = 0x00,
    JSX = 0x01,
}

pub struct Accumulator {
    pub header: (usize, usize),
    pub value: Vec<u8>,
}

impl Accumulator {
    pub fn new() -> Accumulator {
        return Accumulator {
            header: (0, 0),
            value: Vec::new(),
        };
    }

    pub fn get_value_slice(&mut self, ptr: *const u8) -> &[u8] {
        let mut sl = &[] as &[u8];

        let (start, end) = self.header;
        if start > end {
            return &self.value.as_slice();
        }
        let len = end - start;
        if len > 0 {
            sl = unsafe { slice::from_raw_parts(ptr.add(start), len) }
        } else if start > 0 && start == end {
            sl = unsafe { slice::from_raw_parts(ptr.add(start), 1) }
        }

        let v = &mut self.value;
        if !v.is_empty() {
            v.extend_from_slice(sl);
            let len = v.len();
            let v_slice = v.as_slice();
            let v_ptr = v_slice.as_ptr();

            sl = unsafe { slice::from_raw_parts(v_ptr.add(start), len) };
        }

        sl
    }

    pub fn hydrate(&mut self, ptr: *const u8) {
        let (start, end) = self.header;
        self.header.0 = 0;
        self.header.1 = 0;
        if start >= end {
            return;
        }
        let len = end - start;
        if len > 0 {
            let sl = unsafe { slice::from_raw_parts(ptr.add(start), len) };
            self.value.extend_from_slice(sl);
        }
    }
}
