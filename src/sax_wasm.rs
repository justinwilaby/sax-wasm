use std::cell::RefCell;
use std::mem;
use std::ptr;
use std::slice;

use crate::event_descriptors::EventStore;
use crate::sax::parser::*;
use crate::sax::tag::*;

static mut SAX: *mut SAXParser = ptr::null_mut();
pub struct SaxEventHandler {
    store: RefCell<EventStore>,
}

impl SaxEventHandler {
    pub fn new() -> Self {
        SaxEventHandler {
            store: RefCell::new(EventStore::default()),
        }
    }
}

impl EventHandler for SaxEventHandler {
    fn handle_event(&self, event: Event, data: Entity) {
        let ptr = self.store.borrow_mut().snapshot(data, &[], true);
        unsafe { event_listener_v1(1 << event as u32, ptr) };
    }

    fn supports_borrowed_events(&self) -> bool {
        true
    }

    fn handle_borrowed_event(&self, event: Event, data: Entity, source: &[u8]) {
        let ptr = self.store.borrow_mut().snapshot(data, source, false);
        // Release the RefCell borrow before entering JavaScript.
        unsafe { event_listener_v1(1 << event as u32, ptr) };
    }

    fn handle_borrowed_event_pair(&self, first: Event, second: Event, data: Entity, source: &[u8]) {
        let ptr = self.store.borrow_mut().snapshot(data, source, false);
        unsafe {
            event_listener_v1(1 << first as u32, ptr);
            event_listener_v1(1 << second as u32, ptr);
        }
    }

    fn handle_signal(&self, event: Event) {
        unsafe { event_listener_v1(1 << event as u32, ptr::null()) };
    }

    fn clear_events(&self) {
        self.store.borrow_mut().clear();
    }
}

#[no_mangle]
pub extern "C" fn event_abi_version() -> u32 {
    1
}

#[no_mangle]
pub extern "C" fn close_tag_signal_version() -> u32 { 1 }

fn generate_event_lookup(events: u32) -> [bool; 11] {
    let mut event_lookup = [false; 11];
    for i in 0..11 {
        event_lookup[i] = events & (1 << i) != 0;
    }
    event_lookup
}

#[no_mangle]
pub unsafe extern "C" fn parser(events: u32) {
    if SAX == 0 as *mut SAXParser {
        let event_handler = Box::leak(Box::new(SaxEventHandler::new()));
        let sax_parse = SAXParser::new(event_handler);
        SAX = mem::transmute(Box::new(sax_parse));
    }
    (*SAX).events = generate_event_lookup(events);
}

#[no_mangle]
pub unsafe extern "C" fn write(ptr: *const u8, length: usize) {
    let document = slice::from_raw_parts(ptr, length);
    (*SAX).write(document);
}

#[no_mangle]
pub unsafe extern "C" fn end() {
    (*SAX).identity();
}

#[link(wasm_import_module = "env")]
extern "C" {
    fn event_listener_v1(event: u32, ptr: *const u8);
}
