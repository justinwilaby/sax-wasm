//! Version 1 of the wasm32 event ABI. All pointers are linear-memory offsets;
//! lengths count bytes for strings and records for lists. No Rust Vec layout is
//! exposed. Records and their backing storage live until the next write/end.

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub(crate) struct Span {
    pub pointer: u32,
    pub length: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub(crate) struct TextDescriptor {
    pub value: Span,
    pub start: [u64; 2],
    pub end: [u64; 2],
    pub byte_range: [u64; 2],
}

#[repr(C)]
#[derive(Clone, Copy)]
pub(crate) struct AttributeDescriptor {
    pub name: TextDescriptor,
    pub value: TextDescriptor,
    pub attr_type: u32,
    pub reserved: u32,
    pub byte_range: [u64; 2],
}

#[repr(C)]
pub(crate) struct TagDescriptor {
    pub name: Span,
    pub attributes: Span,
    pub text_nodes: Span,
    pub self_closing: u32,
    pub reserved: u32,
    pub open_start: [u64; 2],
    pub open_end: [u64; 2],
    pub close_start: [u64; 2],
    pub close_end: [u64; 2],
    pub byte_range: [u64; 2],
}

#[repr(C)]
pub(crate) struct ProcInstDescriptor {
    pub start: [u64; 2],
    pub end: [u64; 2],
    pub target: TextDescriptor,
    pub content: TextDescriptor,
    pub byte_range: [u64; 2],
}

// These assertions validate the offsets consumed by JS on every Wasm build.
const _: () = {
    use std::mem::{offset_of, size_of};
    assert!(size_of::<Span>() == 8);
    assert!(size_of::<TextDescriptor>() == 56);
    assert!(offset_of!(TextDescriptor, start) == 8);
    assert!(offset_of!(TextDescriptor, end) == 24);
    assert!(offset_of!(TextDescriptor, byte_range) == 40);
    assert!(size_of::<AttributeDescriptor>() == 136);
    assert!(offset_of!(AttributeDescriptor, value) == 56);
    assert!(offset_of!(AttributeDescriptor, attr_type) == 112);
    assert!(offset_of!(AttributeDescriptor, byte_range) == 120);
    assert!(size_of::<TagDescriptor>() == 112);
    assert!(offset_of!(TagDescriptor, attributes) == 8);
    assert!(offset_of!(TagDescriptor, text_nodes) == 16);
    assert!(offset_of!(TagDescriptor, self_closing) == 24);
    assert!(offset_of!(TagDescriptor, open_start) == 32);
    assert!(offset_of!(TagDescriptor, open_end) == 48);
    assert!(offset_of!(TagDescriptor, close_start) == 64);
    assert!(offset_of!(TagDescriptor, close_end) == 80);
    assert!(offset_of!(TagDescriptor, byte_range) == 96);
    assert!(size_of::<ProcInstDescriptor>() == 160);
    assert!(offset_of!(ProcInstDescriptor, target) == 32);
    assert!(offset_of!(ProcInstDescriptor, content) == 88);
    assert!(offset_of!(ProcInstDescriptor, byte_range) == 144);
};

#[cfg(target_arch = "wasm32")]
mod storage {
    use super::*;
    use crate::sax::tag::{Attribute, Entity, Text};

    // Boxed records and boxed slices remain at fixed addresses when these
    // bookkeeping vectors grow. A Vec of records alone would invalidate JS
    // pointers on reallocation.
    #[allow(dead_code)] // Payloads own the backing storage read through JS pointers.
    enum Record {
        Text(Box<TextDescriptor>),
        Attribute(Box<AttributeDescriptor>),
        Tag(Box<TagRecord>),
        ProcInst(Box<ProcInstDescriptor>),
    }

    struct TagRecord {
        descriptor: TagDescriptor,
        _attributes: Box<[AttributeDescriptor]>,
        _text_nodes: Box<[TextDescriptor]>,
    }

    #[derive(Default)]
    pub(crate) struct EventStore {
        records: Vec<Record>,
        strings: Vec<Box<[u8]>>,
    }

    impl EventStore {
        pub fn clear(&mut self) {
            self.records.clear();
            self.strings.clear();
        }

        fn span(&mut self, owned: &[u8], header: (usize, usize), source: &[u8], retained_owned: bool) -> Span {
            let (start, end) = header;
            let tail = if start <= end && end <= source.len() {
                let end = if start == end && start > 0 {
                    end + 1
                } else {
                    end
                };
                source.get(start..end).unwrap_or_default()
            } else {
                &[]
            };
            if owned.is_empty() {
                return Span {
                    pointer: tail.as_ptr() as u32,
                    length: tail.len() as u32,
                };
            }
            if retained_owned && tail.is_empty() {
                // The legacy emission path retains its owning Rust entity in
                // SAXParser::dispatched, so these bytes already have a stable
                // lifetime. This covers comments, CDATA and processing insts.
                return Span {
                    pointer: owned.as_ptr() as u32,
                    length: owned.len() as u32,
                };
            }
            // A span accumulated across writes (or synthesized by the parser)
            // needs its own backing storage. Only the complete current-write
            // spans take the borrowed fast path above.
            let mut bytes = Vec::with_capacity(owned.len() + tail.len());
            bytes.extend_from_slice(owned);
            bytes.extend_from_slice(tail);
            let bytes = bytes.into_boxed_slice();
            let span = Span {
                pointer: bytes.as_ptr() as u32,
                length: bytes.len() as u32,
            };
            self.strings.push(bytes);
            span
        }

        fn text(&mut self, text: &Text, source: &[u8], retained_owned: bool) -> TextDescriptor {
            TextDescriptor {
                value: self.span(&text.value, text.header, source, retained_owned),
                start: text.start,
                end: text.end,
                byte_range: [text.byte_range.0, text.byte_range.1],
            }
        }

        fn attribute(&mut self, attribute: &Attribute, source: &[u8], retained_owned: bool) -> AttributeDescriptor {
            AttributeDescriptor {
                name: self.text(&attribute.name, source, retained_owned),
                value: self.text(&attribute.value, source, retained_owned),
                attr_type: attribute.attr_type as u32,
                reserved: 0,
                byte_range: [attribute.byte_range.0, attribute.byte_range.1],
            }
        }

        pub fn snapshot(&mut self, data: Entity, source: &[u8], retained_owned: bool) -> *const u8 {
            let (record, pointer) = match data {
                Entity::Text(text) => {
                    let descriptor = Box::new(self.text(text, source, retained_owned));
                    let pointer = std::ptr::from_ref(&*descriptor).cast();
                    (Record::Text(descriptor), pointer)
                }
                Entity::Attribute(attribute) => {
                    let descriptor = Box::new(self.attribute(attribute, source, retained_owned));
                    let pointer = std::ptr::from_ref(&*descriptor).cast();
                    (Record::Attribute(descriptor), pointer)
                }
                Entity::Tag(tag) => {
                    let name = self.span(&tag.name, tag.header, source, retained_owned);
                    let attributes: Box<[_]> =
                        tag.attributes.iter().map(|attribute| self.attribute(attribute, source, retained_owned)).collect();
                    let text_nodes: Box<[_]> = tag.text_nodes.iter().map(|text| self.text(text, source, retained_owned)).collect();
                    let record = Box::new(TagRecord {
                        descriptor: TagDescriptor {
                            name,
                            attributes: Span {
                                pointer: attributes.as_ptr() as u32,
                                length: attributes.len() as u32,
                            },
                            text_nodes: Span {
                                pointer: text_nodes.as_ptr() as u32,
                                length: text_nodes.len() as u32,
                            },
                            self_closing: tag.self_closing as u32,
                            reserved: 0,
                            open_start: tag.open_start,
                            open_end: tag.open_end,
                            close_start: tag.close_start,
                            close_end: tag.close_end,
                            byte_range: [tag.byte_range.0, tag.byte_range.1],
                        },
                        _attributes: attributes,
                        _text_nodes: text_nodes,
                    });
                    let pointer = std::ptr::from_ref(&record.descriptor).cast();
                    (Record::Tag(record), pointer)
                }
                Entity::ProcInst(proc_inst) => {
                    let descriptor = Box::new(ProcInstDescriptor {
                        start: proc_inst.start,
                        end: proc_inst.end,
                        target: self.text(&proc_inst.target, source, retained_owned),
                        content: self.text(&proc_inst.content, source, retained_owned),
                        byte_range: [proc_inst.byte_range.0, proc_inst.byte_range.1],
                    });
                    let pointer = std::ptr::from_ref(&*descriptor).cast();
                    (Record::ProcInst(descriptor), pointer)
                }
            };
            self.records.push(record);
            pointer
        }
    }
}

#[cfg(target_arch = "wasm32")]
pub(crate) use storage::EventStore;
