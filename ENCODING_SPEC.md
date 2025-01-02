# Custom Encoding Specification for FFI Boundary Crossing
## Overview
This document describes the custom encoding format used for serializing the Tag struct in Rust to a `Vec<u8>` for crossing FFI (Foreign Function Interface) boundaries. This encoding format ensures that the data can be efficiently transferred and reconstructed on the other side of the FFI boundary.

## Tag Struct
The Tag struct contains the following fields:

- open_start: `[u32; 2]`
- open_end: `[u32; 2]`
- close_start: `[u32; 2]`
- close_end: `[u32; 2]`
- self_closing: `bool`
- name: `Vec<u8>`
- attributes: `Vec<Attribute>`
- text_nodes: `Vec<Text>`
### Encoding Format
The encoding format is a binary representation of the Tag struct, with the following layout:

1. ### Header (8 bytes):
  - attributes_start: u32 (4 bytes) - The starting byte offset of the attributes section.
  - text_nodes_start: u32 (4 bytes) - The starting byte offset of the text nodes section.

2. ### Tag Data:
  - open_start: `[u32; 2]` (8 bytes)
  - open_end: `[u32; 2]` (8 bytes)
  - close_start: `[u32; 2]` (8 bytes)
  - close_end: `[u32; 2]` (8 bytes)
  - self_closing: `u8` (1 byte)
  - name_length: `u32` (4 bytes) - The length of the name field.
  - name: `Vec<u8>` (variable length) - The UTF-8 encoded bytes of the tag name.

3. ### Attributes Section:
  - attributes_count: `u32` (4 bytes) - The number of attributes.
  - For each attribute:
      - attribute_length: `u32` (4 bytes) - The length of the encoded attribute.
      - attribute_data: `Vec<u8>`(variable length) - The encoded attribute data.


Text Nodes Section:

text_nodes_count: u32 (4 bytes) - The number of text nodes.
For each text node:
text_length: u32 (4 bytes) - The length of the encoded text node.
text_data: Vec<u8> (variable length) - The encoded text node data.
Encoding Process
The encoding process involves serializing each field of the Tag struct into a Vec<u8> in the specified order. The following Rust code demonstrates the encoding process:

Encoding Process
The encoding process involves serializing each field of the Tag struct into a `Vec<u8>` in the specified order. The following Rust code demonstrates the encoding process:
```rust
impl Encode<Vec<u8>> for Tag {
    #[inline]
    fn encode(&self) -> Vec<u8> {
        let mut v = vec![0, 0, 0, 0, 0, 0, 0, 0];
        let name_bytes = self.name.as_slice();

        v.reserve(name_bytes.len() + 37);
        // known byte length - 8 bytes per [u32; 2]
        v.extend_from_slice(u32_to_u8(&self.open_start));
        v.extend_from_slice(u32_to_u8(&self.open_end));

        v.extend_from_slice(u32_to_u8(&self.close_start));
        v.extend_from_slice(u32_to_u8(&self.close_end));
        // bool - 1 byte
        v.push(self.self_closing as u8);
        // length of the name - 4 bytes
        v.extend_from_slice(u32_to_u8(&[self.name.len() as u32]));
        // name_bytes.len() bytes
        v.extend_from_slice(name_bytes);

        // write the starting location for the attributes at bytes 0..4
        v.splice(0..4, u32_to_u8(&[v.len() as u32]).to_vec());
        // write the number of attributes
        v.extend_from_slice(u32_to_u8(&[self.attributes.len() as u32]));
        // Encode and write the attributes
        for a in &self.attributes {
            let mut attr = a.encode();
            let len = attr.len();
            v.reserve(len + 4);
            // write the length of this attribute
            v.extend_from_slice(u32_to_u8(&[len as u32]));
            v.append(&mut attr);
        }

        // write the starting location for the text node at bytes 4..8
        v.splice(4..8, u32_to_u8(&[v.len() as u32]).to_vec());
        // write the number of text nodes
        v.extend_from_slice(u32_to_u8(&[self.text_nodes.len() as u32]));
        // encode and write the text nodes
        for t in &self.text_nodes {
            let mut text = t.encode();
            let len = text.len();
            v.reserve(len + 4);
            // write the length of this text node
            v.extend_from_slice(u32_to_u8(&[len as u32]));
            v.append(&mut text);
        }
        v
    }
}
```
# Decoding Process
The decoding process involves reconstructing the Tag struct from the binary representation. The following steps outline the decoding process:

1. Read the header to get the starting offsets for the attributes and text nodes sections.
2. Read the tag data fields.
3. Read the attributes section using the starting offset.
4. Read the text nodes section using the starting offset.
The decoding process should ensure that the data is read in the same order as it was written during encoding.

# Why (serde-)wasm-bindgen Was Not Used
While wasm-bindgen is a powerful tool that facilitates high-level interactions between Rust and JavaScript, it was not used in this project for the following performance-related reasons:

1. **Lazy read of individual fields from a Uint8Array**: The decoding strategy does not require crossing the JS-wasm boundary each time a field is read (which is expensive), nor does it need to construct all field values at once on the JS side. Instead, the encoded data is a fixed structure on both the Rust and JS side and resides in linear memory. The data for each field is at a known address within the Uint8Array and can be read lazily via getters. This means that if you received a Tag from the parser and only need to read the `tag.name`, the `name` is decoded at the time it is read while leaving all other fields encoded. Your CPU overhead is lmited to decoding only the fields that are accessed and only at the time they are accessed.

1. **Performance Overhead** : wasm-bindgen introduces significant overhead due to automatic type conversion and memory management. For performance-critical applications, this overhead can impact the overall efficiency of the system. By using a custom encoding format, we can minimize this overhead and achieve better performance.

1. **Fine-Grained Control**: Custom encoding provides fine-grained control over the serialization and deserialization process. This allows for optimizations specific to the application's needs, such as minimizing the size of the encoded data and reducing the number of memory allocations.

1. **Compactness**: The custom encoding format is designed to be compact, reducing memory usage and transmission time. This is particularly important for applications that need to transfer large amounts of data across the FFI boundary.

1. **Avoiding Dependencies**: By not relying on wasm-bindgen, we avoid adding an additional dependency to the project. This can simplify the build process and reduce potential compatibility issues with other tools and libraries.
