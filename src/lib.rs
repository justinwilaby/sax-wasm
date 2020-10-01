extern crate core;

use core::mem;
use sax::parser::*;
use sax::tag::Encode;
use std::slice;

pub mod sax;

static mut SAX: *mut SAXParser = 0 as *mut SAXParser;
static mut MEM: *mut Vec<u8> = 0 as *mut Vec<u8>;

#[no_mangle]
pub unsafe extern "C" fn parser(events: u32) {
    if SAX == 0 as *mut SAXParser {
        let eh: EventListener = |event: Event, data: &dyn Encode<Vec<u8>>| {
            let encoded_data = data.encode();
            MEM = mem::transmute(Box::new(encoded_data));
            event_listener(event as u32, (*MEM).as_ptr(), (*MEM).len());
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

#[no_mangle]
extern "C" {
    fn event_listener(event: u32, ptr: *const u8, len: usize);
}
