use core::mem;
use std::slice;

use crate::sax::parser::*;
use crate::sax::tag::*;

static mut SAX: *mut SAXParser = 0 as *mut SAXParser;
pub struct SaxEventHandler;

impl SaxEventHandler {
    pub fn new() -> Self {
      SaxEventHandler
    }
}

impl EventHandler for SaxEventHandler {
  #[inline(always)]
    fn handle_event(&self, event: Event, data: Entity) {
        let encoded_data = data.encode();
        unsafe { event_listener(event as u32, encoded_data.as_ptr(), encoded_data.len()) };
    }
}

#[no_mangle]
pub unsafe extern "C" fn parser(events: u32) {
    if SAX == 0 as *mut SAXParser {
        let event_handler = Box::leak(Box::new(SaxEventHandler::new()));
        let sax_parse = SAXParser::new(event_handler);
        SAX = mem::transmute(Box::new(sax_parse));
    }
    (*SAX).events = events;
}

#[no_mangle]
pub unsafe extern "C" fn write(ptr: *mut u8, length: usize) {
    let document = slice::from_raw_parts(ptr, length);
    (*SAX).write(document);
}

#[no_mangle]
pub unsafe extern "C" fn end() {
    (*SAX).identity();
}

extern "C" {
    fn event_listener(event: u32, ptr: *const u8, len: usize);
}
