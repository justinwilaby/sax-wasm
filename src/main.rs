#![crate_type = "cdylib"]
#![feature(const_fn)]

use sax::parser::*;
use std::slice;

pub mod sax;

static mut SAX: Option<SAXParser> = None;

#[no_mangle]
pub unsafe extern fn parser(events: u32) {
  if SAX.is_none() {
    let eh: fn(u32, *const u8, usize) = |event: u32, ptr: *const u8, len: usize| { event_listener(event, ptr, len) };
    SAX = Some(SAXParser::new(eh));
  }
  let parser = get_parser();
  parser.events = events;
}

#[no_mangle]
pub unsafe extern fn write(ptr: *mut u8, length: usize) {
  let document = slice::from_raw_parts(ptr, length);
  let parser = get_parser();
  parser.write(document);
}

extern "C" {
  fn event_listener(event: u32, ptr: *const u8, len: usize);
}

fn get_parser() -> &'static mut SAXParser<'static> {
  unsafe {
    match SAX {
      Some(ref mut x) => &mut *x,
      None => panic!()
    }
  }
}
