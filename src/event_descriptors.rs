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
#[derive(Clone, Copy)]
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
#[derive(Clone, Copy)]
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

    use std::mem::{align_of, size_of, MaybeUninit};

    const BLOCK_BYTES: usize = 64 * 1024;
    const RETAIN_BYTES: usize = 2 * 1024 * 1024;

    struct Block {
        // u64 storage guarantees the descriptors' required eight-byte alignment.
        // Moving the Box in the bookkeeping Vec never moves its allocation.
        words: Box<[MaybeUninit<u64>]>,
        used: usize,
    }

    #[derive(Default)]
    struct DescriptorArena {
        blocks: Vec<Block>,
        current: usize,
    }

    impl DescriptorArena {
        fn allocate<T: Copy>(&mut self, count: usize) -> *mut T {
            assert!(align_of::<T>() <= align_of::<u64>());
            if count == 0 { return std::ptr::NonNull::<T>::dangling().as_ptr(); }
            let bytes = size_of::<T>().checked_mul(count).expect("descriptor size overflow");
            let words = bytes.checked_add(7).expect("descriptor alignment overflow") / 8;
            loop {
                if self.current == self.blocks.len() {
                    self.blocks.push(Block {
                        words: Box::<[u64]>::new_uninit_slice(words.max(BLOCK_BYTES / 8)),
                        used: 0,
                    });
                }
                let block = &mut self.blocks[self.current];
                if words <= block.words.len() - block.used {
                    let pointer = unsafe { block.words.as_mut_ptr().add(block.used).cast::<T>() };
                    block.used += words;
                    return pointer;
                }
                self.current += 1;
            }
        }

        fn store<T: Copy>(&mut self, value: T) -> *const u8 {
            let pointer = self.allocate::<T>(1);
            // allocate reserves non-overlapping aligned storage; T has no drop
            // glue. Every exposed descriptor is initialized before the callback.
            unsafe { pointer.write(value); }
            pointer.cast()
        }

        fn clear(&mut self) {
            // Called only at the next write/end, after the reader lifetime ends.
            // Retain a bounded prefix for common writes; release outlier blocks.
            let mut retained = 0;
            let mut keep = 0;
            for block in &mut self.blocks {
                let bytes = block.words.len() * 8;
                if bytes > RETAIN_BYTES - retained { break; }
                retained += bytes;
                block.used = 0;
                keep += 1;
            }
            self.blocks.truncate(keep);
            self.current = 0;
        }
    }

    #[derive(Default)]
    pub(crate) struct EventStore {
        descriptors: DescriptorArena,
        strings: Vec<Box<[u8]>>,
    }

    impl EventStore {
        pub fn clear(&mut self) {
            self.descriptors.clear();
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
            match data {
                Entity::Text(text) => {
                    let descriptor = self.text(text, source, retained_owned);
                    self.descriptors.store(descriptor)
                }
                Entity::Attribute(attribute) => {
                    let descriptor = self.attribute(attribute, source, retained_owned);
                    self.descriptors.store(descriptor)
                }
                Entity::Tag(tag) => {
                    let name = self.span(&tag.name, tag.header, source, retained_owned);
                    let attributes = self.descriptors.allocate::<AttributeDescriptor>(tag.attributes.len());
                    for (index, attribute) in tag.attributes.iter().enumerate() {
                        let descriptor = self.attribute(attribute, source, retained_owned);
                        // The entire contiguous array was reserved above. String
                        // allocations cannot invalidate its block's address.
                        unsafe { attributes.add(index).write(descriptor); }
                    }
                    let text_nodes = self.descriptors.allocate::<TextDescriptor>(tag.text_nodes.len());
                    for (index, text) in tag.text_nodes.iter().enumerate() {
                        let descriptor = self.text(text, source, retained_owned);
                        unsafe { text_nodes.add(index).write(descriptor); }
                    }
                    self.descriptors.store(TagDescriptor {
                        name,
                        attributes: Span { pointer: attributes as u32, length: tag.attributes.len() as u32 },
                        text_nodes: Span { pointer: text_nodes as u32, length: tag.text_nodes.len() as u32 },
                        self_closing: tag.self_closing as u32,
                        reserved: 0,
                        open_start: tag.open_start,
                        open_end: tag.open_end,
                        close_start: tag.close_start,
                        close_end: tag.close_end,
                        byte_range: [tag.byte_range.0, tag.byte_range.1],
                    })
                }
                Entity::ProcInst(proc_inst) => {
                    let descriptor = ProcInstDescriptor {
                        start: proc_inst.start,
                        end: proc_inst.end,
                        target: self.text(&proc_inst.target, source, retained_owned),
                        content: self.text(&proc_inst.content, source, retained_owned),
                        byte_range: [proc_inst.byte_range.0, proc_inst.byte_range.1],
                    };
                    self.descriptors.store(descriptor)
                }
            }
        }
    }
}

#[cfg(target_arch = "wasm32")]
pub(crate) use storage::EventStore;
