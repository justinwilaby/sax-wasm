extern crate core;
use sax::parser::*;
use std::slice;
use core::mem;

pub mod sax;

static mut SAX: *mut SAXParser = 0 as *mut SAXParser;

#[no_mangle]
pub unsafe extern fn parser(events: u32) {
  if SAX == 0 as *mut SAXParser {
    let eh: fn(u32, *const u8, usize) = |event: u32, ptr: *const u8, len: usize| { event_listener(event, ptr, len) };
    let sax_parse = SAXParser::new(eh);
    SAX = mem::transmute(Box::new(sax_parse));
  }
  (*SAX).events = events;
}

#[no_mangle]
pub unsafe extern fn write(ptr: *mut u8, length: usize) {
  let document = slice::from_raw_parts(ptr, length);
  (*SAX).write(document);
}

#[no_mangle]
pub unsafe extern fn end() {
  (*SAX).identity();
}

#[no_mangle]
extern "C" {
  fn event_listener(event: u32, ptr: *const u8, len: usize);
}
