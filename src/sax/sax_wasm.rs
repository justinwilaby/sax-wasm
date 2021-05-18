use sax::parser::{Event, EventListener, SAXParser};
use std::cell::RefCell;
use std::slice;

static mut SAX: Option<RefCell<SAXParser>> = None;

#[no_mangle]
pub unsafe extern "C" fn parser(events: u32) {
    if SAX.is_none() {
        let eh: EventListener = |event: Event, idx: usize| {
            event_listener(event as u32, idx);
        };
        let sax_parse = SAXParser::new(eh);
        SAX = Some(RefCell::new(sax_parse));
    }
    SAX.as_ref().unwrap().borrow_mut().events = events;
}

#[no_mangle]
pub unsafe extern "C" fn write(ptr: *mut u8, length: usize) {
    let document = slice::from_raw_parts(ptr, length);
    SAX.as_ref().unwrap().borrow_mut().write(document);
}

#[no_mangle]
pub unsafe extern "C" fn end() {
    SAX.as_ref().unwrap().borrow_mut().identity();
}

#[no_mangle]
extern "C" {
    fn event_listener(event: u32, idx: usize);
}
