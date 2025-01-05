use std::mem;
use std::ops::Index;
use std::ops::IndexMut;
use std::ptr;
use std::str;

use super::grapheme_iterator::GraphemeClusters;
use super::names::is_name_char;
use super::names::is_name_start_char;
use super::tag::*;
use super::utils::ascii_icompare;
use super::utils::grapheme_len;
use super::utils::match_byte;

/// Byte Order Mark (BOM) for UTF-8 encoded files.
static BOM: [u8; 3] = [0xef, 0xbb, 0xbf];

/// Characters that indicate the end of a tag name
/// in order of likelihood.
static TAG_NAME_END: &'static [u8; 6] = &[b'>', b'/', b' ', b'\n', b'\t', b'\r'];

/// Characters that indicate the end of an attribute name.
/// in order of likelihood.
static ATTRIBUTE_NAME_END: &'static [u8; 3] = &[b'=', b'>', b' '];

/// Characters that indicate whitespace in order of likelihood.
static WHITESPACE: &'static [u8; 4] = &[b' ', b'\n', b'\t', b'\r'];

// Trait for implementing an event handler struct
// to pass to the parser for receiving events
pub trait EventHandler {
    fn handle_event(&self, event: Event, data: Entity);
}

/// Represents a SAX (Simple API for XML) parser.
///
/// This struct provides functionality to parse XML data using the SAX approach,
/// where events are generated for different parts of the XML document.
///
/// # Fields
///
/// * `events` - A bitmask representing the events to be generated.
/// * `tags` - A vector of tags encountered during parsing.
/// * `state` - The current state of the parser.
/// * `cdata` - The current CDATA section being parsed.
/// * `comment` - The current comment being parsed.
/// * `doctype` - The current DOCTYPE declaration being parsed.
/// * `text` - The current text node being parsed.
/// * `close_tag_name` - The name of the tag being closed.
/// * `proc_inst` - The current processing instruction being parsed.
/// * `quote` - The current quote character being used.
/// * `sgml_decl` - The current SGML declaration being parsed.
/// * `attribute` - The current attribute being parsed.
/// * `tag` - The current tag being parsed.
/// * `brace_ct` - The current brace count.
/// * `event_handler` - The event handler function.
/// * `leftover_bytes` - Bytes left over from the previous parse.
/// * `end_pos` - The end position of the current parse.
pub struct SAXParser<'a> {
    // Configuration and State
    pub events: [bool; 10],
    state: State,
    brace_ct: u32,
    quote: u8,

    // Event Handling
    event_handler: &'a dyn EventHandler,

    // Parsing Buffers
    tags: Vec<Tag>,
    cdata: Text,
    comment: Text,
    doctype: Text,
    text: Text,
    close_tag_name: Vec<u8>,
    proc_inst: ProcInst,
    sgml_decl: Text,
    attribute: Attribute,
    tag: Tag,

    // Position Tracking
    pub leftover_bytes_info: Option<([u8; 4], usize, usize)>,
    end_pos: [u32; 2],
    source_ptr: *const u8,
    end_offset: usize,
}

impl<'a> SAXParser<'a> {
    /// Creates a new `SAXParser` with the specified event handler.
    ///
    /// # Arguments
    ///
    /// * `event_handler` - The event handler function to be called for each event.
    ///
    /// # Returns
    ///
    /// * A new `SAXParser` instance.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::parser::{Event, SAXParser, EventHandler};
    /// use sax_wasm::sax::tag::*;
    /// use std::rc::Rc;
    /// use std::cell::RefCell;
    ///
    /// struct SaxEventHandler {
    ///     tags: Rc<RefCell<Vec<Tag>>>,
    /// }
    ///
    /// impl SaxEventHandler {
    ///     pub fn new(tags: Rc<RefCell<Vec<Tag>>>) -> Self {
    ///         SaxEventHandler { tags }
    ///     }
    /// }
    ///
    /// impl EventHandler for SaxEventHandler {
    ///     fn handle_event(&self, event: Event, data: Entity) {
    ///       match data {
    ///         Entity::Tag(tag) => self.tags.borrow_mut().push(tag.clone()),
    ///         _ => {}
    ///       }
    ///     }
    /// }
    ///
    /// let tags = Rc::new(RefCell::new(Vec::new()));
    /// let event_handler = SaxEventHandler::new(Rc::clone(&tags));
    /// let mut parser = SAXParser::new(&event_handler);
    /// let mut events = [false;10];
    /// events[Event::OpenTag as usize] = true;
    /// parser.events = events;
    /// parser.write(b"<tag>content</tag>");
    ///
    /// // Process events
    /// for (tag) in tags.borrow().iter() {
    ///    assert_eq!(String::from_utf8(tag.name.clone()).unwrap(), "tag");
    /// }
    /// ```
    pub fn new(event_handler: &'a dyn EventHandler) -> SAXParser<'a> {
        SAXParser {
            // Configuration and State
            events: [false; 10],
            state: State::Begin,
            brace_ct: 0,
            quote: 0,

            // Event Handling
            event_handler,

            // Parsing Buffers
            tags: Vec::new(),
            cdata: Text::new([0, 0]),
            comment: Text::new([0, 0]),
            doctype: Text::new([0, 0]),
            text: Text::new([0, 0]),
            close_tag_name: Vec::new(),
            proc_inst: ProcInst::new(),
            sgml_decl: Text::new([0, 0]),
            attribute: Attribute::new(),
            tag: Tag::new([0, 0]),

            // Position Tracking
            leftover_bytes_info: None,
            end_pos: [0, 0],
            end_offset: 0,
            source_ptr: ptr::null(),
        }
    }

    /// Writes data to the parser.
    ///
    /// This function takes a byte slice as input and processes it using the SAX parser.
    /// It handles leftover bytes from the previous parse and updates the parser's state
    /// accordingly.
    ///
    /// # Arguments
    ///
    /// * `source` - A byte slice representing the data to be parsed.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::parser::{Event, SAXParser, EventHandler};
    /// use sax_wasm::sax::tag::*;
    /// use std::rc::Rc;
    /// use std::cell::RefCell;
    ///
    /// struct SaxEventHandler {
    ///     tags: Rc<RefCell<Vec<Tag>>>,
    /// }
    ///
    /// impl SaxEventHandler {
    ///     pub fn new(tags: Rc<RefCell<Vec<Tag>>>) -> Self {
    ///         SaxEventHandler { tags }
    ///     }
    /// }
    ///
    /// impl EventHandler for SaxEventHandler {
    ///     fn handle_event(&self, event: Event, data: Entity) {
    ///       match data {
    ///         Entity::Tag(tag) => self.tags.borrow_mut().push(tag.clone()),
    ///         _ => {}
    ///       }
    ///     }
    /// }
    ///
    /// let tags = Rc::new(RefCell::new(Vec::new()));
    /// let event_handler = SaxEventHandler::new(Rc::clone(&tags));
    /// let mut parser = SAXParser::new(&event_handler);
    /// let str = "🚀this is 🐉 a test string🚀";
    /// let bytes = str.as_bytes();
    /// let broken_surrogate = &bytes[0..14];
    /// parser.write(broken_surrogate);
    /// assert!(parser.leftover_bytes_info.is_some());
    ///
    /// parser.write(&bytes[14..]);
    /// assert!(parser.leftover_bytes_info.is_none());
    ///
    /// ```
    pub fn write(&mut self, source: &[u8]) {
        self.source_ptr = source.as_ptr();
        let mut gc = GraphemeClusters::new(source);
        gc.line = self.end_pos[0];
        gc.character = self.end_pos[1];

        if let Some(bytes_info) = self.leftover_bytes_info {
            gc.character += if bytes_info.1 == 4 {
                2
            } else {
                1
            };
            self.process_broken_surrogate(&mut gc, source, bytes_info);
        }

        while let Some(current) = gc.next() {
            self.process_grapheme(&mut gc, &current);
        }
        self.end_pos = [gc.line, gc.character];
        self.leftover_bytes_info = gc.get_remaining_bytes();
        self.end_offset = gc.cursor;
    }

    #[cold]
    fn process_broken_surrogate(&mut self, gc: &mut GraphemeClusters, source: &[u8], bytes_info: ([u8; 4], usize, usize)) {
        let (mut bytes, bytes_len, bytes_needed) = bytes_info;
        let grapheme_len = bytes_len + bytes_needed;
        let bytes_slice = unsafe { source.get_unchecked(0..bytes_needed) };

        match bytes_needed {
            1 => bytes[bytes_len] = bytes_slice[0],
            2 => {
                bytes[bytes_len] = bytes_slice[0];
                bytes[bytes_len + 1] = bytes_slice[1];
            }
            3 => {
                bytes[bytes_len] = bytes_slice[0];
                bytes[bytes_len + 1] = bytes_slice[1];
                bytes[bytes_len + 2] = bytes_slice[2];
            }
            _ => {}
        }
        let grapheme = unsafe { bytes.get_unchecked(0..grapheme_len) };
        gc.cursor = bytes_needed;
        self.process_grapheme(gc, grapheme);
    }

    /// Resets the parser to its initial state.
    ///
    /// This function flushes any remaining text at the end of the file (EOF) and resets
    /// the parser's state to its initial state.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::parser::{Event, SAXParser, EventHandler};
    /// use sax_wasm::sax::tag::*;
    /// use std::rc::Rc;
    /// use std::cell::RefCell;
    ///
    /// struct SaxEventHandler {
    ///     tags: Rc<RefCell<Vec<Tag>>>,
    /// }
    ///
    /// impl SaxEventHandler {
    ///     pub fn new(tags: Rc<RefCell<Vec<Tag>>>) -> Self {
    ///         SaxEventHandler { tags }
    ///     }
    /// }
    ///
    /// impl EventHandler for SaxEventHandler {
    ///     fn handle_event(&self, event: Event, data: Entity) {
    ///       match data {
    ///         Entity::Tag(tag) => self.tags.borrow_mut().push(tag.clone()),
    ///         _ => {}
    ///       }
    ///     }
    /// }
    ///
    /// let tags = Rc::new(RefCell::new(Vec::new()));
    /// let event_handler = SaxEventHandler::new(Rc::clone(&tags));
    /// let mut parser = SAXParser::new(&event_handler);
    ///
    /// let s = "this is a test string".as_bytes();
    /// parser.write(s);
    /// parser.identity();
    /// ```
    pub fn identity(&mut self) {
        // flush text at the EOF
        self.flush_text(self.end_pos[0], self.end_pos[1] + 1, self.end_offset);
        self.state = State::Begin;
        self.attribute = Attribute::new();
        self.brace_ct = 0;
        self.end_pos = [0, 0];
        self.end_offset = 0;
    }

    /// Processes a grapheme cluster.
    ///
    /// This function processes a grapheme cluster based on the current state of the parser.
    /// It updates the parser's state and handles different types of XML constructs.
    ///
    /// # Arguments
    ///
    /// * `gc` - A mutable reference to the `GraphemeClusters` iterator.
    /// * `current` - A reference to the current `&[u8]`.
    ///
    fn process_grapheme(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        match self.state {
            State::OpenTag => self.open_tag(gc, current),
            State::Attrib => self.attribute(gc, current),
            State::AttribName => self.attribute_name(gc, current),
            State::AttribValue => self.attribute_value(gc, current),
            State::AttribValueQuoted => self.attribute_value_quoted(gc, current),
            State::BeginWhitespace => self.begin_white_space(gc, current),
            State::Text => self.text(gc, current),
            State::CloseTag => self.close_tag(gc, current),
            State::SgmlDecl => self.sgml_decl(gc, current),
            State::SgmlDeclQuoted => self.sgml_quoted(current),
            State::Doctype => self.doctype(gc, current),
            State::DoctypeQuoted => self.doctype_quoted(current),
            State::DoctypeDtd => self.doctype_dtd(current),
            State::DoctypeDtdQuoted => self.doctype_dtd_quoted(current),
            State::Comment => self.comment(gc, current),
            State::CommentEnding => self.comment_ending(current),
            State::CommentEnded => self.comment_ended(gc, current),
            State::Cdata => self.cdata(gc, current),
            State::CdataEnding => self.cdata_ending(current),
            State::CdataEnding2 => self.cdata_ending_2(gc, current),
            State::ProcInst => self.proc_inst(gc, current),
            State::ProcInstValue => self.proc_inst_value(gc, current),
            State::ProcInstEnding => self.proc_inst_ending(gc, current),
            State::OpenTagSlash => self.open_tag_slash(gc, current),
            State::AttribNameSawWhite => self.attribute_name_saw_white(gc, current),
            State::AttribValueClosed => self.attribute_value_closed(gc, current),
            State::AttribValueUnquoted => self.attribute_value_unquoted(gc, current),
            State::CloseTagSawWhite => self.close_tag_saw_white(gc, current),
            State::JSXAttributeExpression => self.jsx_attribute_expression(gc, current),
            State::OpenWaka => self.open_waka(gc, current),
            State::Begin => self.begin(gc, current),
        };
    }

    fn begin(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        self.state = State::BeginWhitespace;
        // BOM
        if current == BOM {
            return;
        }

        self.begin_white_space(gc, current);
    }

    fn open_waka(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if is_name_start_char(current) {
            self.tag = Tag::new([gc.line, gc.character - 1]);
            self.tag.header.0 = gc.cursor - 1;
            
            self.state = State::OpenTag;
            self.open_tag(gc, current);
            return;
        }
        let byte = current[0];
        match byte {
            b'!' => {
                self.state = State::SgmlDecl;
                self.sgml_decl.start = [gc.line, gc.character - 1];
            }

            b'/' => {
                self.state = State::CloseTag;
                self.close_tag_name = Vec::new();
            }

            b'?' => {
                self.state = State::ProcInst;
                self.proc_inst.start = [gc.line, gc.character - 1];
                self.proc_inst.target.start = [gc.line, gc.character];
            }

            b'>' => {
                self.process_open_tag(false, gc); // JSX fragment
            }

            _ => {
                // backup 2 graphemes since we might have gotten something
                // wierd like '< ' or '< *multi-bytes-grapheme*'
                self.new_text(gc.line, gc.character, gc.cursor - 1 - grapheme_len(byte));
                // self.write_text(&[b'<']);
                // self.write_text(current);
            }
        }
    }

    fn open_tag(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if is_name_char(current) {
            // self.tag.name.extend_from_slice(current);
            // if let Some(unwrapped) = gc.take_until_ascii(TAG_NAME_END) {
            //     self.tag.name.extend_from_slice(unwrapped);
            // }
            gc.take_until_ascii(TAG_NAME_END);
            self.tag.header.1 = gc.cursor;
            return;
        }

        if self.events[Event::OpenTagStart] {
            self.tag.hydrate(self.source_ptr);
            self.event_handler.handle_event(Event::OpenTagStart, Entity::Tag(&self.tag));
        }
        match current[0] {
            b'>' => self.process_open_tag(false, gc),
            b'/' => self.state = State::OpenTagSlash,
            _ => self.state = State::Attrib,
        }
    }

    fn begin_white_space(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let byte = current[0];
        if byte == b'<' {
            self.flush_text(gc.line, gc.character, gc.cursor - 1);
            self.state = State::OpenWaka;
            return;
        }

        self.new_text(gc.line, gc.character, gc.cursor - grapheme_len(byte));
        // self.write_text(current);
    }

    fn text(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let byte = current[0];
        if byte != b'<' {
            // self.write_text(current);
            // if let Some(text) = gc.take_until_ascii(&[b'<', b'\n']) {
            //     self.write_text(text);
            // }
            gc.take_until_ascii(&[b'<', b'\n']);
            return;
        }
        self.flush_text(gc.line, gc.character, gc.cursor - 1);
        self.state = State::OpenWaka;
    }

    fn flush_text(&mut self, line: u32, character: u32, offset: usize) {
        let emit_close_tag = self.events[Event::CloseTag];
        let emit_text = self.events[Event::Text];
        if !emit_close_tag && !emit_text {
            return;
        }

        let mut text = mem::replace(&mut self.text, Text::new([0, 0]));
        text.end = [line, character - 1];
        text.header.1 = offset;
        if emit_text && text.hydrate(self.source_ptr) {
            self.event_handler.handle_event(Event::Text, Entity::Text(&text));
        }

        let len = self.tags.len();
        // Store these only if we're interested in CloseTag events
        if len != 0 && emit_close_tag {
            self.tags[len - 1].text_nodes.push(text);
        }
    }

    fn sgml_decl(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let sgml_str = unsafe { str::from_utf8_unchecked(self.sgml_decl.value.as_slice()) };
        let is_sgml_char = match sgml_str {
            sgml if ascii_icompare("[cdata[", sgml) == true => {
                // Empty cdata
                if current[0] == b']' {
                    self.state = State::CdataEnding;
                } else {
                    self.state = State::Cdata;
                    self.cdata.value.extend_from_slice(current);
                }
                self.cdata.start = [gc.line, gc.character - 8];
                false
            }

            "--" => {
                self.state = State::Comment;
                self.comment.start = [gc.line, gc.character - 4];
                self.comment.header.0 = gc.cursor - 1;
                self.comment(gc, current);
                false
            }

            sgml if ascii_icompare("doctype", sgml) == true => {
                self.state = State::Doctype;
                self.doctype.start = [gc.line, gc.character - 8];
                false
            }

            _ => true,
        };

        if current[0] == b'>' {
            let mut sgml_decl = mem::replace(&mut self.sgml_decl, Text::new([0, 0]));
            if self.events[Event::SGMLDeclaration] {
                sgml_decl.value.extend_from_slice(current);
                sgml_decl.end = [gc.line, gc.character - 1];
                self.event_handler.handle_event(Event::SGMLDeclaration, Entity::Text(&sgml_decl));
            }

            self.new_text(gc.line, gc.character, gc.cursor);
            return;
        }

        if is_sgml_char {
            self.sgml_decl.value.extend_from_slice(current);
        } else {
            self.sgml_decl = Text::new([0, 0]);
        }
        let byte = current[0];
        if byte == b'"' || byte == b'\'' {
            self.state = State::SgmlDeclQuoted;
        }
    }

    fn sgml_quoted(&mut self, current: &[u8]) {
        let maybe_quote = unsafe { *current.get_unchecked(0) };
        if maybe_quote == self.quote {
            self.quote = 0;
            self.state = State::SgmlDecl;
        }
        self.sgml_decl.value.extend_from_slice(current);
    }

    fn doctype(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'>' {
            self.new_text(gc.line, gc.character, gc.cursor);
            if self.events[Event::Doctype] {
                let mut doctype = mem::replace(&mut self.doctype, Text::new([0, 0]));
                doctype.end = [gc.line, gc.character - 1];
                self.event_handler.handle_event(Event::Doctype, Entity::Text(&doctype));
            }
            return;
        }
        let byte = current[0];
        self.doctype.value.extend_from_slice(current);
        if byte == b']' {
            self.state = State::DoctypeDtd;
        } else if byte == b'"' || byte == b'\'' {
            self.state = State::DoctypeQuoted;
            self.quote = byte;
        }
    }

    fn doctype_quoted(&mut self, current: &[u8]) {
        self.doctype.value.extend_from_slice(current);
        let maybe_quote = unsafe { *current.get_unchecked(0) };
        if maybe_quote == self.quote {
            self.quote = 0;
            self.state = State::Doctype;
        }
    }

    fn doctype_dtd(&mut self, current: &[u8]) {
        let byte = current[0];
        self.doctype.value.extend_from_slice(current);
        if byte == b']' {
            self.state = State::Doctype;
        } else if byte == b'"' || byte == b'\'' {
            self.state = State::DoctypeDtdQuoted;
            self.quote = byte
        }
    }

    fn doctype_dtd_quoted(&mut self, current: &[u8]) {
        self.doctype.value.extend_from_slice(current);
        let maybe_quote = unsafe { *current.get_unchecked(0) };
        if self.quote == maybe_quote {
            self.state = State::DoctypeDtd;
            self.quote = 0;
        }
    }

    fn comment(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'-' {
            self.state = State::CommentEnding;
            return;
        }
        gc.take_until_ascii(&[b'-']);
        gc.next(); // skip the b'-'
        self.state = State::CommentEnding; // The next byte should be b'-'

        // let mut comment_str: &[u8] = &[0];
        // if let Some(comment) = gc.take_until_ascii(&[b'-']) {
        //     comment_str = comment;
        // }

        // if self.events[Event::Comment] {
        //     self.comment.value.extend_from_slice(current);
        //     self.comment.value.extend_from_slice(comment_str);
        // }
    }

    fn comment_ending(&mut self, current: &[u8]) {
        if current[0] == b'-' {
            self.state = State::CommentEnded;
            return;
        }
        // We didn't find the last b'-' so we treat this
        // as part of the comment

        // if self.events[Event::Comment] {
        //     self.comment.value.push(b'-');
        //     self.comment.value.extend_from_slice(current);
        // }
        self.state = State::Comment;
    }

    fn comment_ended(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'>' {
            let mut comment = mem::replace(&mut self.comment, Text::new([0, 0]));
            comment.end = [gc.line, gc.character - 1];
            comment.header.1 = gc.cursor - 3;
            if self.events[Event::Comment] && comment.hydrate(self.source_ptr) {
                self.event_handler.handle_event(Event::Comment, Entity::Text(&comment));
            }
            self.state = State::BeginWhitespace;
            return;
        }
        // We didn't find the b'>' so we treat this
        // as part of the comment

        // if self.events[Event::Comment] {
        //     self.comment.value.extend_from_slice("--".as_bytes());
        //     self.comment.value.extend_from_slice(current);
        // }
        self.state = State::Comment;
    }

    fn cdata(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b']' {
            self.state = State::CdataEnding;
            return;
        }
        self.cdata.value.extend_from_slice(current);
        let cdata_result = gc.take_until_ascii(&[b']']);
        if let Some(cdata) = cdata_result {
            self.cdata.value.extend_from_slice(cdata);
        }
    }

    fn cdata_ending(&mut self, current: &[u8]) {
        if current[0] == b']' {
            self.state = State::CdataEnding2;
            return;
        }
        self.state = State::Cdata;
        self.cdata.value.extend_from_slice(current);
    }

    fn cdata_ending_2(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'>' {
            self.new_text(gc.line, gc.character, gc.cursor);
            if self.events[Event::Cdata] {
                let mut cdata = mem::replace(&mut self.cdata, Text::new([0, 0]));
                cdata.end = [gc.line, gc.character - 1];
                self.event_handler.handle_event(Event::Cdata, Entity::Text(&cdata));
            }
            return;
        } else if current[0] == b']' {
            self.cdata.value.extend_from_slice(current);
        } else {
            self.cdata.value.extend_from_slice("]]".as_bytes());
            self.cdata.value.extend_from_slice(current);
            self.state = State::Cdata;
        }
    }

    fn proc_inst(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'>' {
            return self.proc_inst_ending(gc, current);
        }
        if current[0] == b'?' {
            self.state = State::ProcInstEnding;
            return;
        }

        if match_byte(WHITESPACE, current[0]) {
            self.proc_inst.target.end = [gc.line, gc.character - 1];
            self.state = State::ProcInstValue;
            return;
        }

        self.proc_inst.target.value.extend_from_slice(current);
        if let Some(target) = gc.take_until_ascii(&[b'>', b'?', b' ']) {
            self.proc_inst.target.value.extend_from_slice(target);
        }
    }

    fn proc_inst_value(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if self.proc_inst.content.value.len() == 0 {
            if match_byte(WHITESPACE, current[0]) {
                return;
            }
            self.proc_inst.content.start = [gc.line, gc.character - 1];
        }

        if current[0] == b'?' {
            self.state = State::ProcInstEnding;
            self.proc_inst.content.end = [gc.line, gc.character - 1];
        } else {
            self.proc_inst.content.value.extend_from_slice(current);
            if let Some(proc_inst_value) = gc.take_until_ascii(&[b'?']) {
                self.proc_inst.content.value.extend_from_slice(proc_inst_value);
            }
        }
    }

    fn proc_inst_ending(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'>' {
            self.new_text(gc.line, gc.character, gc.cursor);
            let mut proc_inst = mem::replace(&mut self.proc_inst, ProcInst::new());
            if self.events[Event::ProcessingInstruction] {
                proc_inst.end = [gc.line, gc.character];
                self.event_handler.handle_event(Event::ProcessingInstruction, Entity::ProcInst(&proc_inst));
            }
            return;
        }
        self.proc_inst.content.value.push(b'?');
        self.proc_inst.content.value.extend_from_slice(current);
        self.state = State::ProcInstValue;
    }

    fn open_tag_slash(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'>' {
            self.process_open_tag(true, gc);
            self.process_close_tag(gc);
            return;
        }
        self.state = State::Attrib;
    }

    fn attribute(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if match_byte(WHITESPACE, current[0]) {
            return;
        }
        if current[0] == b'>' {
            self.process_open_tag(false, gc);
        } else if current[0] == b'/' {
            self.state = State::OpenTagSlash;
        } else {
            self.attribute.name.start = [gc.line, gc.character - 1];
            self.attribute.name.header.0 = gc.cursor - 1;
            self.state = State::AttribName;
        }
    }

    fn attribute_name(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        match current[0] {
            b'=' => {
                self.attribute.name.end = [gc.line, gc.character - 1];
                self.attribute.name.header.1 = gc.cursor - 1;
                self.state = State::AttribValue;
            }
            b'>' => {
                self.process_attribute();
                self.process_open_tag(false, gc);
            }
            grapheme if match_byte(WHITESPACE, grapheme) == true => {
                self.state = State::AttribNameSawWhite;
                //gc.skip_whitespace();
            }
            _ => {
                // self.attribute.name.value.extend_from_slice(current);
                // if let Some(attribute_name) = gc.take_until_ascii(ATTRIBUTE_NAME_END) {
                //     self.attribute.name.value.extend_from_slice(attribute_name);
                // };
                gc.take_until_ascii(ATTRIBUTE_NAME_END);
                self.attribute.name.end = [gc.line, gc.character - 1];
                self.attribute.name.header.1 = gc.cursor;
            }
        }
    }

    fn attribute_name_saw_white(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let byte = current[0];
        if match_byte(WHITESPACE, byte) {
            return;
        }
        match byte {
            b'=' => self.state = State::AttribValue,
            b'/' => {
                self.process_attribute();
                self.state = State::OpenTagSlash;
            }
            b'>' => {
                self.process_attribute();
                self.process_open_tag(false, gc);
            }
            _ => {
                self.process_attribute(); // new Attribute struct created
                self.attribute.name.value = Vec::from(current);
                self.attribute.name.start = [gc.line, gc.character - 1];
                self.state = State::AttribName;
            }
        }
    }

    fn attribute_value(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let first_byte = current[0];
        if match_byte(WHITESPACE, first_byte) {
            return;
        }
        self.attribute.value.start = [gc.line, gc.character];
        self.attribute.value.header.0 = gc.cursor;
        if first_byte == b'"' || first_byte == b'\'' {
            self.quote = first_byte;
            self.state = State::AttribValueQuoted;
        } else if first_byte == b'{' {
            self.state = State::JSXAttributeExpression;
            self.attribute.attr_type = AttrType::JSX;
            self.brace_ct += 1;
        } else {
            self.state = State::AttribValueUnquoted;
            // self.attribute.value.value.extend_from_slice(current);
            // if let Some(unquoted_value) = gc.take_until_ascii(&[b' ', b'>', b'/']) {
            //     self.attribute.value.value.extend_from_slice(unquoted_value);
            // }
            gc.take_until_ascii(&[b' ', b'>', b'/']);
        }
    }

    fn attribute_value_quoted(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == self.quote {
            self.attribute.value.end = [gc.line, gc.character - 1];
            self.attribute.value.header.1 = gc.cursor - 1;
            self.process_attribute();
            self.quote = 0;
            self.state = State::AttribValueClosed;
            return;
        }
        // self.attribute.value.value.extend_from_slice(current);
        // if let Some(attribute_value) = gc.take_until_ascii(&[self.quote]) {
        //     self.attribute.value.value.extend_from_slice(attribute_value);
        // }
        gc.take_until_ascii(&[self.quote]);
    }

    fn attribute_value_closed(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if match_byte(WHITESPACE, current[0]) {
            self.state = State::Attrib;
        } else if current[0] == b'>' {
            self.process_open_tag(false, gc);
        } else if current[0] == b'/' {
            self.state = State::OpenTagSlash;
        } else {
            self.attribute.name.value = Vec::from(current);
            self.state = State::AttribName;
        }
    }

    #[cold]
    fn attribute_value_unquoted(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] != b'>' && !match_byte(WHITESPACE, current[0]) {
            // self.attribute.value.value.extend_from_slice(current);
            return;
        }
        self.attribute.value.end = [gc.line, gc.character - 1];
        self.attribute.value.header.1 = gc.cursor - 1;
        self.process_attribute();
        if current[0] == b'>' {
            self.process_open_tag(false, gc);
        } else {
            self.state = State::Attrib;
        }
    }

    fn close_tag(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'>' {
            // Weird </> tag
            let len = self.tags.len();
            if self.close_tag_name.is_empty() && (len == 0 || !self.tags[len - 1].get_name(self.source_ptr).is_empty()) {
                self.process_open_tag(true, gc);
            }
            self.process_close_tag(gc);
        } else if is_name_char(current) {
            self.close_tag_name.extend_from_slice(current);
            if let Some(close_tag) = gc.take_until_ascii(&[b'>']) {
                self.close_tag_name.extend_from_slice(close_tag);
            }
            self.tag.header.1 = gc.cursor;
        } else {
            self.state = State::CloseTagSawWhite;
        }
    }

    fn close_tag_saw_white(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if !match_byte(WHITESPACE, current[0]) && current[0] == b'>' {
            self.process_close_tag(gc);
        }
    }

    fn process_attribute(&mut self) {
        let mut attr = mem::replace(&mut self.attribute, Attribute::new());
        if self.events[Event::Attribute] && attr.hydrate(self.source_ptr) {
            self.event_handler.handle_event(Event::Attribute, Entity::Attribute(&attr));
        }
        // Store them only if we're interested in Open and Close tag events
        if self.events[Event::OpenTag] || self.events[Event::CloseTag] {
            attr.hydrate(self.source_ptr);
            self.tag.attributes.push(attr);
        }
    }

    fn process_open_tag(&mut self, self_closing: bool, gc: &mut GraphemeClusters) {
        let mut tag = mem::replace(&mut self.tag, Tag::new([gc.line, gc.character - 1]));
        tag.self_closing = self_closing;
        tag.open_end = [gc.line, gc.character];

        if self.events[Event::OpenTag] {
            tag.hydrate(self.source_ptr);
            self.event_handler.handle_event(Event::OpenTag, Entity::Tag(&tag));
        }
        if !self_closing {
            self.new_text(gc.line, gc.character, gc.cursor);
        }
        self.tags.push(tag);
    }

    fn process_close_tag(&mut self, gc: &mut GraphemeClusters) {
        self.new_text(gc.line, gc.character, gc.cursor);
        let mut tags_len = self.tags.len();

        let close_tag_name = if self.tag.self_closing && self.close_tag_name.is_empty() {
            &self.tag.get_name(self.source_ptr)
        } else {
            &mem::take(&mut self.close_tag_name)
        };

        let mut found = false;
        let mut tag_index = 0;

        for (i, tag) in self.tags.iter_mut().enumerate().rev() {
            if tag.get_name(self.source_ptr) == close_tag_name {
                tag.close_start = self.tag.open_start;
                tag.close_end = [gc.line, gc.character];
                found = true;
                tag_index = i;
                break;
            }
        }

        if !found {
            // let close_tag_clone = close_tag_name.clone();
            // self.write_text(b"</");
            // self.write_text(&close_tag_clone);
            // self.write_text(b">");
            // self.text.start = self.tag.open_start;
            return;
        }

        if !self.events[Event::CloseTag] {
            if tag_index > 1 {
                self.tags.truncate(tag_index);
                return;
            }

            self.tag = self.tags.remove(tag_index);
            return;
        }

        while tags_len > tag_index {
            tags_len -= 1;

            let mut tag = self.tags.remove(tags_len);
            tag.close_end = [gc.line, gc.character];
            tag.hydrate(self.source_ptr);

            self.event_handler.handle_event(Event::CloseTag, Entity::Tag(&tag));
            self.tag = tag;
        }
    }

    fn jsx_attribute_expression(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'}' {
            self.brace_ct -= 1;
        } else if current[0] == b'{' {
            self.brace_ct += 1;
        }

        if self.brace_ct == 0 {
            self.attribute.value.end = [gc.line, gc.character - 1];
            self.attribute.value.header.1 = gc.cursor - 1;
            self.process_attribute();
            self.state = State::AttribValueClosed;
            return;
        }
        // self.attribute.value.value.extend_from_slice(current);

        // if let Some(attribute) = gc.take_until_ascii(&[b'{', b'}']) {
        //     self.attribute.value.value.extend_from_slice(attribute);
        // }
        gc.take_until_ascii(&[b'{', b'}']);
    }

    fn new_text(&mut self, line: u32, character: u32, offset: usize) {
        if self.events[Event::Text] || self.events[Event::CloseTag] {
            self.text = Text::new([line, character]);
            self.text.header.0 = offset;
        }
        self.state = State::Text;
    }
}

pub enum Event {
    // 1
    Text = 0,
    // 2
    ProcessingInstruction = 1,
    // 4
    SGMLDeclaration = 2,
    // 8
    Doctype = 3,
    // 16
    Comment = 4,
    // 32
    OpenTagStart = 5,
    // 64
    Attribute = 6,
    // 128
    OpenTag = 7,
    // 256
    CloseTag = 8,
    // 512
    Cdata = 9,
}

impl Index<Event> for [bool; 10] {
    type Output = bool;

    fn index(&self, event: Event) -> &Self::Output {
        let ptr = self.as_ptr();
        unsafe { &*ptr.add(event as usize) }
    }
}

impl IndexMut<Event> for [bool; 10] {
    fn index_mut(&mut self, event: Event) -> &mut Self::Output {
        unsafe { self.get_unchecked_mut(event as usize) }
    }
}

enum State {
    // leading byte order mark or whitespace
    Begin = 0,
    // leading whitespace
    BeginWhitespace = 1,
    // "abc123"
    Text = 2,
    // <
    OpenWaka = 3,
    // <!blarg
    SgmlDecl = 4,
    // <!blarg foo "bar
    SgmlDeclQuoted = 5,
    // <!doctype
    Doctype = 6,
    // <!doctype "//blah
    DoctypeQuoted = 7,
    // <!doctype "//blah" [ ...
    DoctypeDtd = 8,
    // <!doctype "//blah" [ "foo
    DoctypeDtdQuoted = 9,
    // <!--
    Comment = 10,
    // <!-- blah -
    CommentEnding = 11,
    // <!-- blah --
    CommentEnded = 12,
    // <![cdata[ something
    Cdata = 13,
    // ]
    CdataEnding = 14,
    // ]]
    CdataEnding2 = 15,
    // <?hi
    ProcInst = 16,
    // <?hi there
    ProcInstValue = 17,
    // <?hi "there" ?
    ProcInstEnding = 18,
    // <strong
    OpenTag = 19,
    // <strong /
    OpenTagSlash = 20,
    // <a
    Attrib = 21,
    // <a foo
    AttribName = 22,
    // <a foo _
    AttribNameSawWhite = 23,
    // <a foo=
    AttribValue = 24,
    // <a foo="bar
    AttribValueQuoted = 25,
    // <a foo="bar"
    AttribValueClosed = 26,
    // <a foo=bar
    AttribValueUnquoted = 27,
    // </a
    CloseTag = 28,
    // </a   >
    CloseTagSawWhite = 29,
    // props={() => {}}
    JSXAttributeExpression = 30,
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::fs::File;
    use std::io::{BufReader, Read, Result};

    use crate::sax::parser::{Event, EventHandler, SAXParser};
    use crate::sax::tag::Entity;

    use super::{Attribute, ProcInst, Tag, Text};
    pub struct TextEventHandler {
        pub attributes: RefCell<Vec<Attribute>>,
        pub texts: RefCell<Vec<Text>>,
        pub tags: RefCell<Vec<Tag>>,
        pub procinsts: RefCell<Vec<ProcInst>>,
    }

    impl TextEventHandler {
        pub fn new() -> Self {
            TextEventHandler {
                attributes: RefCell::new(Vec::new()),
                texts: RefCell::new(Vec::new()),
                tags: RefCell::new(Vec::new()),
                procinsts: RefCell::new(Vec::new()),
            }
        }
    }

    impl<'a> EventHandler for TextEventHandler {
        fn handle_event(&self, _event: Event, data: Entity) {
            match data {
                Entity::Attribute(attribute) => self.attributes.borrow_mut().push(attribute.clone()),
                Entity::ProcInst(proc_inst) => self.procinsts.borrow_mut().push(proc_inst.clone()),
                Entity::Tag(tag) => self.tags.borrow_mut().push(tag.clone()),
                Entity::Text(text) => self.texts.borrow_mut().push(text.clone()),
            }
        }
    }
    #[test]
    fn test_tag() -> Result<()> {
      let event_handler = TextEventHandler::new();
      let mut sax = SAXParser::new(&event_handler);
      let mut events = [false; 10];
      events[Event::CloseTag] = true;
      events[Event::Comment] = true;
      sax.events = events;
      let str = "<!--lit-part cI7PGs8mxHY=-->
      <p><!--lit-part-->hello<!--/lit-part--></p>
      <!--lit-part BRUAAAUVAAA=--><?><!--/lit-part-->
      <!--lit-part--><!--/lit-part-->
      <p>more</p>
    <!--/lit-part-->";

      sax.write(str.as_bytes());
      sax.identity();

      Ok(())
    }
    #[test]
    fn stream_large_xml() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        sax.events = [true; 10];
        let f = File::open("src/js/__test__/xml.xml")?;
        let mut reader = BufReader::new(f);
        const BUFFER_LEN: usize = 64 * 1024;
        loop {
            let mut buffer = [0; BUFFER_LEN];
            if let Ok(()) = reader.read_exact(&mut buffer) {
                sax.write(&buffer);
            } else {
                break;
            }
        }
        assert!(!event_handler.attributes.borrow().is_empty());
        Ok(())
    }

    #[test]
    fn test_comment() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Comment] = true;
        sax.events = events;
        let str = "<!--name='test 3 attr' this is a comment--> <-- name='test 3 attr' this is just text -->";

        sax.write(str.as_bytes());
        sax.identity();

        let comments = event_handler.texts.borrow();
        assert_eq!(comments.len(), 1);
        let text_value = String::from_utf8(comments[0].value.clone()).unwrap();
        assert_eq!(text_value, "name='test 3 attr' this is a comment");

        Ok(())
    }

    #[test]
    fn test_4_bytes() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Text] = true;
        sax.events = events;
        let str = "🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚";
        let bytes = str.as_bytes();
        sax.write(&bytes[..14]);
        assert!(sax.leftover_bytes_info.is_some());

        sax.write(&bytes[14..]);
        assert!(sax.leftover_bytes_info.is_none());
        sax.identity();

        let texts = event_handler.texts.borrow();
        assert_eq!(texts.len(), 1);
        let text_value = String::from_utf8(texts[0].value.clone()).unwrap();
        assert_eq!(text_value, String::from_utf8(Vec::from(bytes)).unwrap());

        Ok(())
    }

    #[test]
    fn count_grapheme_length() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Text] = true;
        sax.events = events;
        let str = "🏴📚📚<div href=\"./123/123\">hey there</div>";

        sax.write(str.as_bytes());
        sax.identity();

        let texts = event_handler.texts.borrow();
        assert_eq!(texts.len(), 2);
        let text_value = String::from_utf8(texts[0].value.clone()).unwrap();
        assert!(text_value.contains("🏴📚📚"));

        Ok(())
    }

    #[test]
    fn parse_jsx_expression() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Text] = true;
        sax.events = events;
        let str = "<foo>{bar < baz ? <div></div> : <></>}</foo>";

        sax.write(str.as_bytes());
        sax.identity();

        let texts = event_handler.texts.borrow();
        assert_eq!(texts.len(), 4);

        assert_eq!(String::from_utf8(texts[0].value.clone()).unwrap(), "{bar ");
        assert_eq!(String::from_utf8(texts[1].value.clone()).unwrap(), "< baz ? ");
        assert_eq!(String::from_utf8(texts[2].value.clone()).unwrap(), " : ");
        assert_eq!(String::from_utf8(texts[3].value.clone()).unwrap(), "}");
        Ok(())
    }

    #[test]
    fn parse_empty_cdata() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Cdata] = true;
        sax.events = events;
        let str = "<div>
        <div>
          <![CDATA[]]>
        </div>
        <div>
          <![CDATA[something]]>
        </div>
      </div>";

        sax.write(str.as_bytes());
        sax.identity();

        let cdatas = event_handler.texts.borrow();
        assert_eq!(cdatas.len(), 2);
        assert!(cdatas[0].value.is_empty());
        let text_value = String::from_utf8(cdatas[1].value.clone()).unwrap();
        assert_eq!(text_value, "something");

        Ok(())
    }
}
