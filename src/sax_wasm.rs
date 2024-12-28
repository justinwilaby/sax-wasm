use core::mem;
use std::slice;
use std::ptr;
use crate::sax::parser::*;
use crate::sax::tag::*;

static mut SAX: *mut SAXParser = 0 as *mut SAXParser;

#[no_mangle]
pub unsafe extern "C" fn parser(events: u32) {
    if SAX == 0 as *mut SAXParser {
        let eh: EventListener = |event: Event, data: Entity| {
            // let encoded_data = data.encode();
            event_listener(event as u32, ptr::addr_of!(data) as *const u8, 0);
        };
        let sax_parse = SAXParser::new(eh);
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
