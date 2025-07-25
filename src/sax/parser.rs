use std::mem;
use std::ops::Index;
use std::ops::IndexMut;
use std::ptr;

use super::grapheme_iterator::GraphemeClusters;
use super::names::is_name_start_char;
use super::tag::*;
use super::utils::ascii_compare;

/// Byte Order Mark (BOM) for UTF-8 encoded files.
static BOM: [u8; 3] = [0xef, 0xbb, 0xbf];

/// Characters that indicate the end of a tag name
/// in order of likelihood.
static TAG_NAME_END: &[u8] = &[b'>', b'/', b' ', b'\n', b'\t', b'\r'];

static TEXT_END: &[u8] = &[b'<', b'\n'];

/// Characters that indicate the end of
/// an attribute name
static ATTRIBUTE_NAME_END: &[u8] = &[b'=', b'>', b' ', b'\t', b'\n'];

static ATTRIBUTE_VALUE_END: &[u8] = &[b' ', b'\t', b'\n', b'>'];

/// Characters that indicate the end of
/// a proc inst target
static PROC_INST_TARGET_END: &[u8] = &[b'>', b' ', b'\n', b'\t', b'\r'];

/// Characters that indicate the end of a
/// entity or entity type.
static ENTITY_CAPTURE_END: &[u8] = &[b'>', b'-', b' ', b'['];

static DOCTYPE_VALUE_END: &[u8] = &[b' ', b'\n', b'\t', b'\r', b'>'];

static DOCTYPE_END: &[u8] = &[b'!', b'>'];

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
    // Used to make sure dispatched objects
    // stick around until the next write
    dispatched: Vec<Dispatched>,

    // Parsing Buffers
    tags: Vec<Tag>,
    text: Option<Text>,
    markup_decl: Option<Text>,
    markup_entity: Option<Text>,

    proc_inst: Option<ProcInst>,
    attribute: Attribute,
    tag: Tag,
    close_tag: Text,
    fragment: Vec<u8>,

    // Position Tracking
    end_pos: [u64; 2],
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
            dispatched: Vec::new(),

            // Parsing Buffers
            text: None,
            tags: Vec::new(),
            markup_decl: None,
            markup_entity: None,

            attribute: Attribute::new(),
            proc_inst: None,
            tag: Tag::new([0, 0]),
            close_tag: Text::new([0,0]),
            fragment: Vec::new(),

            // Position Tracking
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
    ///
    /// parser.write(&bytes[14..]);
    ///
    /// ```
    pub fn write(&mut self, source: &[u8]) {
        self.dispatched.clear();
        let mut bytes = source;

        let frag_len = self.fragment.len();
        let mut vec = Vec::new();
        if frag_len != 0 {
            let frag = mem::take(&mut self.fragment);
            vec.reserve(frag_len + source.len());
            vec.extend_from_slice(frag.as_slice());
            vec.extend_from_slice(source);
            bytes = vec.as_slice();
        }

        self.source_ptr = bytes.as_ptr();

        let mut gc = GraphemeClusters::new(bytes);
        gc.line = self.end_pos[0];
        gc.character = self.end_pos[1];

        while let Some(current) = gc.next() {
            self.process_grapheme(&mut gc, &current);
        }

        self.end_pos = [gc.line, gc.character];
        self.end_offset = gc.cursor;

        if let Some(fragment) = gc.get_remaining_bytes() {
            self.fragment.extend_from_slice(fragment);
        }

        self.hydrate();
    }

    fn hydrate(&mut self) {
        let ptr = self.source_ptr;
        for tag in &mut self.tags {
            tag.hydrate(ptr);
        }
        if let Some(text) = &mut self.text {
            text.hydrate(ptr);
        }
        if let Some(markup_decl) = &mut self.markup_decl {
            markup_decl.hydrate(ptr);
        }
        if let Some(markup_entity) = &mut self.markup_entity {
            markup_entity.hydrate(ptr);
        }
        if self.state == State::CloseTag {
            self.close_tag.hydrate(ptr);
        }
        self.attribute.hydrate(ptr);

        if let Some(proc_inst) = &mut self.proc_inst {
            proc_inst.hydrate(ptr);
        }

        self.tag.hydrate(ptr);
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
        self.flush_text(self.end_pos[0], self.end_pos[1], 0);
        // Reset Configuration and State
        self.state = State::Begin;
        self.brace_ct = 0;
        self.quote = 0;

        // Reset Event Handling
        self.dispatched.clear();

        // Reset Parsing Buffers
        self.text = None;
        self.tags.clear();
        self.markup_decl = None;
        self.markup_entity = None;

        self.attribute = Attribute::new();
        self.proc_inst = None;
        self.tag = Tag::new([0, 0]);
        self.close_tag = Text::new([0,0]);
        self.fragment.clear();

        // Reset Position Tracking
        self.end_pos = [0, 0];
        self.end_offset = 0;
        self.source_ptr = ptr::null();
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
            State::LT => self.less_than(gc, current),
            State::OpenTag => self.open_tag(gc, current),
            State::Attrib => self.attribute(gc, current),
            State::AttribName => self.attribute_name(gc, current),
            State::AttribValue => self.attribute_value(gc, current),
            State::AttribValueQuoted => self.attribute_value_quoted(gc, current),
            State::BeginWhitespace => self.begin_white_space(gc, current),
            State::SkipWhitespace => self.skip_whitespace(gc, current),
            State::Text => self.text(gc, current),
            State::CloseTag => self.close_tag(gc, current),
            State::MarkupDecl => self.markup_decl(gc, current),
            State::Comment => self.comment(gc, current),
            State::Cdata => self.cdata(gc, current),
            State::Doctype => self.doctype(gc, current),
            State::DoctypeEntity => self.doctype(gc, current),
            State::Entity => self.entity(gc, current),
            State::ProcInst => self.proc_inst(gc, current),
            State::ProcInstValue => self.proc_inst_value(gc, current),
            State::OpenTagSlash => self.open_tag_slash(gc, current),
            State::AttribNameSawWhite => self.attribute_name_saw_white(gc, current),
            State::AttribValueClosed => self.attribute_value_closed(gc, current),
            State::AttribValueUnquoted => self.attribute_value_unquoted(gc, current),
            State::JSXAttributeExpression => self.jsx_attribute_expression(gc, current),
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

    fn skip_whitespace(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let byte = current[0];
        if byte > 32 || gc.skip_whitespace() {
            if let Some(text) = &mut self.text {
                text.value.clear();
                text.start = [gc.line, gc.character];
                text.header.0 = gc.cursor;
            }

            self.state = State::BeginWhitespace;
            if byte > 32 {
                self.begin_white_space(gc, current);
            }
        }
    }

    fn begin_white_space(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let byte = current[0];

        if byte == b'\n' {
            self.state = State::SkipWhitespace;
            return;
        }

        if byte == b'<' {
            self.tag = Tag::new([gc.line, gc.last_character]);
            self.state = State::LT;
            return;
        }

        self.new_text(gc.line, gc.last_character, gc.last_cursor_pos);
    }

    fn less_than(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let mut should_flush_text = true;
        let character = gc.character.saturating_sub(2);
        let offset = gc.last_cursor_pos.saturating_sub(1);
        match current[0] {
            _ if is_name_start_char(current) == true => {
                should_flush_text = false;
                self.tag.header = (gc.last_cursor_pos, gc.cursor);

                self.state = State::OpenTag;
                // since calling open_tag advances
                // the cursor and adds a tag onto
                // the stack, we need to flush_text
                // now to prevent text nodes from
                // being added to the wrong tag
                self.flush_text(gc.line, character, offset);
                self.open_tag(gc, current);
            }

            b'!' => {
                self.state = State::MarkupDecl;

                let mut markup_decl = Text::new([gc.line, gc.last_character]);

                markup_decl.header = (gc.cursor.saturating_sub(1), gc.cursor);
                markup_decl.value.extend_from_slice(&[b'<']);

                self.markup_decl = Some(markup_decl);
            }

            b'/' => {
                self.state = State::CloseTag;

                self.tag.close_start = [gc.line, gc.last_character.saturating_sub(1)];
                self.close_tag.header.0 = gc.last_cursor_pos;
            }

            b'?' => {
                self.state = State::ProcInst;

                let mut proc_inst = ProcInst::new();
                proc_inst.start = [gc.line, gc.character.saturating_sub(2)];
                proc_inst.target.start = [gc.line, gc.character];
                proc_inst.target.header = (gc.last_cursor_pos.saturating_sub(1), gc.cursor);
                self.proc_inst = Some(proc_inst);
            }

            b'>' => {
                should_flush_text = false;
                // since calling process_open_tag adds
                // a tag onto the stack, we need to
                // flush_text now to prevent text nodes
                // from being added to the wrong tag
                self.flush_text(gc.line, character, offset);
                self.process_open_tag(false, gc); // JSX fragment
            }

            _ => {
                should_flush_text = false;
                // If this char is whitespace, treat it like text since
                // we don't want to process '< name' as an open tag.
                // backup 2 graphemes (not bytes) since we might have gotten
                // something like '< ' or '< *multi-bytes-grapheme*'
                self.new_text(gc.line, gc.character, gc.last_cursor_pos);
            }
        }

        if should_flush_text && self.text.is_some() {
            self.flush_text(gc.line, character, offset);
        }
    }

    fn open_tag(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        self.tag.open_start = [gc.line, gc.character.saturating_sub(2)];
        let mut byte = current[0];
        if !TAG_NAME_END.contains(&byte) {
            if let Some((span, found)) = gc.take_until_one_found(TAG_NAME_END, true) {
                byte = span[span.len() - 1];
                self.tag.header.1 = if found {
                    gc.last_cursor_pos
                } else {
                    gc.cursor
                };
            } else {
                self.tag.header.1 = gc.last_cursor_pos;
            }
        }

        if self.events[Event::OpenTagStart] {
            let mut tag = Box::new(self.tag.clone());
            tag.hydrate(self.source_ptr);

            self.event_handler.handle_event(Event::OpenTagStart, Entity::Tag(&*tag));
            self.dispatched.push(Dispatched::Tag(tag));
        }

        match byte {
            b'>' => self.process_open_tag(false, gc),
            b'/' => self.state = State::OpenTagSlash,
            b' ' | b'\t' | b'\n' | b'\r' => self.state = State::Attrib,
            _ => {}
        }
    }

    fn close_tag(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let mut byte: u8 = current[0];
        // By the time we get here, the last byte was '/'
        // and the current byte needs inspecting to determine
        // if this is the start of a close tag name.
        if byte != b'>' {
            // legit start to a close tag
            // Try to take the entire close tag name
            let mut offset: usize = 0;
            let start = gc.last_cursor_pos;
            if let Some((span, found)) = gc.take_until_one_found(&[b'>', b' '], true) {
                byte = span[span.len() - 1];
                offset = found as usize;
            }

            let end = gc.cursor;
            self.close_tag.header = (start, end - offset);
        }

        match byte {
            // We've hit a close tag - process it
            b'>' => self.process_close_tag(gc),
            // skip and catch the next iteration
            b' ' => {
                gc.skip_whitespace();
            }
            _ => {}
        }
    }

    fn text(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let byte = current[0];
        // This might not be a tag e.g. 'the number 1 < 3' or '<<--->>'
        // if less_than() determines this not to be a real
        // tag, the text will continue without flushing
        if byte == b'<' {
            self.state = State::LT;
            return;
        }

        if byte == b'\n' {
            // Newlines flush text always
            self.flush_text(gc.last_line, gc.last_character, gc.last_cursor_pos);
            self.state = State::SkipWhitespace
        } else {
            gc.take_until_one_found(TEXT_END, false);
            if let Some(text) = &mut self.text {
                text.header.1 = gc.cursor
            }
        }
    }

    fn flush_text(&mut self, line: u64, character: u64, offset: usize) {
        if self.text.is_none() {
            return;
        }
        let mut text = Box::new(unsafe { self.text.take().unwrap_unchecked() });
        text.end = [line, character];
        text.header.1 = offset;

        // Empty
        if text.header.0 == text.header.1 && text.value.is_empty() {
            return;
        }

        let len = self.tags.len();
        // Store these only if we're interested in CloseTag events
        if len != 0 && self.events[Event::CloseTag] {
            self.tags[len - 1].text_nodes.push(*text.clone());
        }

        if self.events[Event::Text] && text.hydrate(self.source_ptr) {
            self.event_handler.handle_event(Event::Text, Entity::Text(&text));
            self.dispatched.push(Dispatched::Text(text));
        }
    }

    fn markup_decl(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let byte = current[0];
        if !ENTITY_CAPTURE_END.contains(&byte) {
            gc.take_until_one_found(ENTITY_CAPTURE_END, false);
        }

        let markup_decl = self.markup_decl.as_mut().unwrap();
        markup_decl.header.1 = gc.cursor;

        let md_slice = markup_decl.get_value_slice(self.source_ptr, gc.byte_len);
        let sl_len = md_slice.len();

        if sl_len >= 4 && &md_slice[..4] == b"<!--" {
            markup_decl.start = [gc.line, gc.character.saturating_sub(4)];
            markup_decl.value.clear();
            markup_decl.header = (gc.cursor, 0);
            self.state = State::Comment;
            return;
        }

        if sl_len >= 9 && ascii_compare(&md_slice[..9], b"<![CDATA[") {
            markup_decl.start = [gc.line, gc.character.saturating_sub(9)];
            // skip over the <![CDATA[
            markup_decl.value.clear();
            markup_decl.header = (gc.cursor, 0);
            self.state = State::Cdata;
            return;
        }

        if sl_len >= 9 && ascii_compare(&md_slice[..9], b"<!DOCTYPE") {
            markup_decl.start = [gc.line, gc.character.saturating_sub(9)];
            // skip over the <!DOCTYPE and any whitespace after it
            gc.skip_whitespace();
            markup_decl.value.clear();
            markup_decl.header = (gc.cursor, 0);
            self.state = State::Doctype;
            return;
        }

        let bytes_to_check = if sl_len > 2 {
            &md_slice[..3]
        } else {
            md_slice
        };
        if bytes_to_check != b"<!-" && bytes_to_check != b"<![" && !ascii_compare(b"<!D", bytes_to_check) {
            let mut markup_entity = Text::new([gc.line, gc.character.saturating_sub(2)]);
            // skip over the <! and any whitespace afterwards
            gc.skip_whitespace();
            markup_entity.header = (gc.cursor, 0);

            self.markup_entity = Some(markup_entity);
            self.state = State::Entity;
            self.markup_decl = None;
            return;
        } else {
            markup_decl.header = (gc.cursor, 0);
        }
    }

    fn comment(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let markup_decl = self.markup_decl.as_mut().unwrap();
        let byte = current[0];

        if byte != b'>' {
            gc.take_until(b'>', true);
        }

        markup_decl.header.1 = gc.cursor;

        let markup_slice = markup_decl.get_value_slice(self.source_ptr, gc.byte_len);
        let len = markup_slice.len();

        // We're looking for exactly '-->'
        if len > 2 && &markup_slice[(len - 3)..] == b"-->" {
            markup_decl.end = [gc.line, gc.character];
            if self.events[Event::Comment] && markup_decl.hydrate(self.source_ptr) {
                let mut markup_decl = Box::new(self.markup_decl.take().unwrap());
                markup_decl.value.truncate(markup_decl.value.len() - 3); // remove '-->'
                self.event_handler.handle_event(Event::Comment, Entity::Text(&markup_decl));
                self.dispatched.push(Dispatched::Text(markup_decl));
            }
            self.markup_decl = None;
            self.state = State::BeginWhitespace;
        } else {
            markup_decl.header = (gc.cursor, 0);
        }
    }

    fn cdata(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] != b'>' {
            gc.take_until(b'>', true);
        }

        let markup_decl = self.markup_decl.as_mut().unwrap();
        markup_decl.header.1 = gc.cursor;

        let markup_slice = markup_decl.get_value_slice(self.source_ptr, gc.byte_len);
        let len = markup_slice.len();
        // We're looking for exactly ']]>'
        if len > 2 && &markup_slice[(len - 3)..] == b"]]>" {
            markup_decl.end = [gc.line, gc.character];
            if self.events[Event::Cdata] && markup_decl.hydrate(self.source_ptr) {
                let mut markup_decl = Box::new(self.markup_decl.take().unwrap());
                markup_decl.value.truncate(markup_decl.value.len() - 3); // remove ]]>
                self.event_handler.handle_event(Event::Cdata, Entity::Text(&markup_decl));
                self.dispatched.push(Dispatched::Text(markup_decl));
            }
            self.state = State::BeginWhitespace;
        } else {
            markup_decl.header = (gc.cursor, 0);
        }
    }

    /// DOCTYPE can be simple:
    ///
    /// <!DOCTYPE message SYSTEM "message.dtd">
    ///
    /// or contain entities:
    ///
    /// <!DOCTYPE address [
    ///   <!ELEMENT address (name,company,phone)>
    ///   <!ELEMENT name (#P_CDATA)>
    ///   <!ELEMENT company (#P_CDATA)>
    ///   <!ELEMENT phone (#P_CDATA)>
    /// ]>
    fn doctype(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let mut byte = current[0];

        // determine where to stop taking bytes for
        // for the doctype value. e.g. '<!DOCTYPE movie ' <----- take 'movie' but not 'movie '
        if self.state != State::DoctypeEntity && !DOCTYPE_VALUE_END.contains(&byte) {
            if let Some((span, _)) = gc.take_until_one_found(DOCTYPE_VALUE_END, true) {
                byte = span[span.len() - 1];
            }
            let markup_decl = self.markup_decl.as_mut().unwrap();
            markup_decl.header.1 = gc.cursor;
        }

        if !DOCTYPE_END.contains(&byte) {
            if let Some((span, _)) = gc.take_until_one_found(DOCTYPE_END, true) {
                byte = span[span.len() - 1];
            }
        }

        // <!ENTITY or similar
        if byte == b'!' {
            self.state = State::Entity;
            let mut markup_entity = Text::new([gc.line, gc.character]);
            markup_entity.header.0 = gc.cursor;

            self.markup_entity = Some(markup_entity);
            return;
        }

        if byte == b'>' {
            let mut markup_decl = Box::new(self.markup_decl.take().unwrap());
            markup_decl.end = [gc.line, gc.character];
            if self.events[Event::Doctype] && markup_decl.hydrate(self.source_ptr) {
                markup_decl.value.truncate(markup_decl.value.len() - 1); // remove '>' or '['

                self.event_handler.handle_event(Event::Doctype, Entity::Text(&markup_decl));
                self.dispatched.push(Dispatched::Text(markup_decl));
            }
            self.state = State::BeginWhitespace;
        }
    }

    fn entity(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let mut byte = current[0];

        if byte != b'>' {
            if let Some((span, _)) = gc.take_until(b'>', true) {
                byte = span[span.len() - 1];
            }
        }

        if byte == b'>' {
            let mut markup_entity = Box::new(self.markup_entity.take().unwrap());
            markup_entity.header.1 = gc.cursor - 1;
            markup_entity.end = [gc.line, gc.character.saturating_sub(1)];

            if self.events[Event::Declaration] && markup_entity.hydrate(self.source_ptr) {
                self.event_handler.handle_event(Event::Cdata, Entity::Text(&markup_entity));
                self.dispatched.push(Dispatched::Text(markup_entity));
            }
            // if we have a markup_decl, we previously
            // were processing a doctype and encountered
            // entities and now need to complete the doctype
            self.state = if self.markup_decl.is_some() {
                State::DoctypeEntity
            } else {
                State::BeginWhitespace
            };
            gc.skip_whitespace();
            return;
        }
    }

    fn proc_inst(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let mut byte = current[0];

        if !PROC_INST_TARGET_END.contains(&byte) {
            if let Some((span, _)) = gc.take_until_one_found(PROC_INST_TARGET_END, true) {
                byte = span[span.len() - 1];
            }
        }

        let proc_inst = self.proc_inst.as_mut().unwrap();
        proc_inst.target.header.1 = gc.cursor;

        match byte {
            b'>' => {
                self.process_proc_inst(gc);
            }

            b if b < 33 => {
                proc_inst.target.header.1 = gc.cursor - 1;
                proc_inst.target.end = [gc.line, gc.character.saturating_sub(1)];
                // we could have something like this before the content starts:
                // <?process-div           \n   instruction?>
                gc.skip_whitespace();
                proc_inst.content.start = [gc.line, gc.character];
                proc_inst.content.header = (gc.cursor, 0);
                self.state = State::ProcInstValue;
            }
            _ => {}
        }
    }

    fn proc_inst_value(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let mut byte = current[0];
        let proc_inst = self.proc_inst.as_mut().unwrap();

        if byte != b'>' {
            if let Some((span, _)) = gc.take_until(b'>', true) {
                byte = span[span.len() - 1];
            }
        }

        proc_inst.content.header.1 = gc.cursor;

        if byte != b'>' {
            return;
        }

        self.process_proc_inst(gc);
    }

    fn process_proc_inst(&mut self, gc: &mut GraphemeClusters) {
        self.state = State::BeginWhitespace;
        let mut proc_inst = Box::new(self.proc_inst.take().unwrap());
        proc_inst.hydrate(self.source_ptr);

        if self.events[Event::ProcessingInstruction] {
            proc_inst.end = [gc.line, gc.character];
            proc_inst.content.end = [gc.line, gc.character.saturating_sub(2)];

            proc_inst.target.value.drain(..2); // remove '<?'
            proc_inst.content.value.truncate(proc_inst.content.value.len().saturating_sub(2)); // remove '?>'
            self.event_handler.handle_event(Event::ProcessingInstruction, Entity::ProcInst(&proc_inst));
            self.dispatched.push(Dispatched::ProcInst(proc_inst));
        }
    }

    fn open_tag_slash(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'>' {
            self.process_open_tag(true, gc);
            return;
        }
        self.state = State::Attrib;
    }

    fn attribute(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let byte = current[0];
        // whitespace
        if byte < 33 {
            return;
        }

        match byte {
            b'>' => {
                self.process_open_tag(false, gc);
            }
            b'/' => {
                self.state = State::OpenTagSlash;
            }
            _ => {
                self.attribute.name.start = [gc.line, gc.character.saturating_sub(1)];
                self.attribute.name.header.0 = gc.last_cursor_pos;
                self.state = State::AttribName;
                self.attribute_name(gc, current);
            }
        }
    }

    fn attribute_name(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        match current[0] {
            b'=' => {
                self.attribute.name.end = [gc.line, gc.character.saturating_sub(1)];
                self.attribute.name.header.1 = gc.cursor.saturating_sub(1);
                self.state = State::AttribValue;
            }
            b'>' => {
                self.process_attribute();
                self.process_open_tag(false, gc);
            }
            // whitespace
            b if b < 33 => {
                self.state = State::AttribNameSawWhite;
            }
            _ => {
                gc.take_until_one_found(ATTRIBUTE_NAME_END, false);
                self.attribute.name.end = [gc.line, gc.character];
                self.attribute.name.header.1 = gc.cursor;
            }
        }
    }

    fn attribute_name_saw_white(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let byte = current[0];
        // whitespace
        if byte < 33 {
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
                self.attribute.name.header.0 = gc.cursor;
                self.attribute.name.start = [gc.line, gc.character.saturating_sub(1)];
                self.state = State::AttribName;
            }
        }
    }

    fn attribute_value(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let first_byte = current[0];
        // whitespace
        if first_byte < 33 {
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
            self.attribute.value.header.0 = gc.last_cursor_pos;
            self.state = State::AttribValueUnquoted;
        }
    }

    fn attribute_value_quoted(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == self.quote {
            self.attribute.value.end = [gc.line, gc.character.saturating_sub(1)];
            let header_1 = gc.cursor.saturating_sub(1);
            self.attribute.value.header.1 = if header_1 == self.attribute.value.header.0 {header_1.saturating_sub(1)} else {header_1};
            self.process_attribute();
            self.quote = 0;
            self.state = State::AttribValueClosed;
            return;
        }
        gc.take_until(self.quote, false);
        self.attribute.value.header.1 = gc.cursor
    }

    fn attribute_value_closed(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let byte = current[0];
        if byte < 33 {
            self.state = State::Attrib;
        } else if byte == b'>' {
            self.process_open_tag(false, gc);
        } else if byte == b'/' {
            self.state = State::OpenTagSlash;
        } else {
            self.attribute.name.header.0 = gc.last_cursor_pos;
            self.state = State::AttribName;
            self.attribute_name(gc, current);
        }
    }

    #[cold]
    fn attribute_value_unquoted(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        let mut byte = current[0];
        if byte < 33 {
            return;
        }
        if let Some((span, found)) = gc.take_until_one_found(ATTRIBUTE_VALUE_END, true) {
            byte = span[span.len() - 1];
            self.attribute.value.header.1 = if found {
                gc.last_cursor_pos
            } else {
                gc.cursor
            };
        } else {
            self.attribute.value.header.1 = gc.last_cursor_pos;
        }
        self.attribute.value.end = [gc.line, gc.character.saturating_sub(1)];
        let mut self_closing = false;
        // we've encountered a > and need to determine if this self closing tag
        if byte == b'>' && self.attribute.value.hydrate(self.source_ptr) {
            let val_slice = self.attribute.value.get_value_slice(self.source_ptr, gc.byte_len);
            let sl_len = val_slice.len();
            if sl_len > 1 && &val_slice[(sl_len - 1)..] == b"/" {
                self.attribute.value.value.truncate(sl_len - 1); // remove '/'
                self.attribute.value.end = [gc.line, gc.character.saturating_sub(2)];
                self_closing = true;
            }
        }

        self.process_attribute();
        if byte == b'>' {
            self.process_open_tag(self_closing, gc);
        } else {
            self.state = State::Attrib;
            self.attribute(gc, &[byte]);
        }
    }

    fn process_attribute(&mut self) {
        let mut attr = mem::replace(&mut self.attribute, Attribute::new());
        if self.events[Event::Attribute] && attr.hydrate(self.source_ptr) {
            let attr_box = Box::new(attr.clone());
            self.event_handler.handle_event(Event::Attribute, Entity::Attribute(&attr_box));
            self.dispatched.push(Dispatched::Attribute(attr_box));
        }
        // Store them only if we're interested in Open and Close tag events
        if self.events[Event::OpenTag] || self.events[Event::CloseTag] {
            self.tag.attributes.push(attr);
        }
    }

    fn process_open_tag(&mut self, self_closing: bool, gc: &mut GraphemeClusters) {
        let mut tag = mem::replace(&mut self.tag, Tag::new([0, 0]));
        tag.self_closing = self_closing;
        tag.open_end = [gc.line, gc.character];

        if self.events[Event::OpenTag] {
            tag.hydrate(self.source_ptr);
            let tag_box = Box::new(tag.clone());
            self.event_handler.handle_event(Event::OpenTag, Entity::Tag(&tag_box));
            self.dispatched.push(Dispatched::Tag(tag_box));
        }

        if self.events[Event::CloseTag] && self_closing {
            tag.hydrate(self.source_ptr);
            let tag_box = Box::new(tag.clone());
            self.event_handler.handle_event(Event::CloseTag, Entity::Tag(&tag_box));
            self.dispatched.push(Dispatched::Tag(tag_box));
        }

        if !self_closing {
            self.tags.push(tag);
        }

        self.state = State::BeginWhitespace;
    }

    fn process_close_tag(&mut self, gc: &mut GraphemeClusters) {
        self.state = State::BeginWhitespace;
        let mut close_tag = mem::replace(&mut self.close_tag, Text::new([0,0]));
        let close_tag_name = close_tag.get_value_slice(self.source_ptr, gc.byte_len);

        let mut found = false;
        let mut tag_index = 0;

        for (i, tag) in self.tags.iter_mut().enumerate().rev() {
            let tag_name = tag.get_name_slice(self.source_ptr);
            if tag_name == close_tag_name {
                tag.close_start = self.tag.close_start;
                tag.close_end = [gc.line, gc.character];
                found = true;
                tag_index = i;
                break;
            }
        }

        // Rare encounter of an </orphan> tag
        if !found {
            let text = self.text.get_or_insert(Text::new([0, 0]));

            let mut value = Vec::from("</");
            value.extend_from_slice(close_tag_name);
            value.extend_from_slice(&[b'>']);

            text.value = value;
            text.start = self.tag.close_start;
            text.header = (0, 0);

            self.flush_text(gc.line, gc.character, 0);
            self.state = State::BeginWhitespace;
            return;
        }

        if !self.events[Event::CloseTag] {
            self.tags.truncate(tag_index.max(1));
            return;
        }

        let mut i = self.tags.len();
        while i > tag_index {
            let mut tag = Box::new(unsafe { self.tags.pop().unwrap_unchecked() });
            tag.hydrate(self.source_ptr);
            self.event_handler.handle_event(Event::CloseTag, Entity::Tag(&tag));
            self.dispatched.push(Dispatched::Tag(tag));
            i -= 1;
        }
    }

    fn jsx_attribute_expression(&mut self, gc: &mut GraphemeClusters, current: &[u8]) {
        if current[0] == b'}' {
            self.brace_ct -= 1;
        } else if current[0] == b'{' {
            self.brace_ct += 1;
        }

        if self.brace_ct == 0 {
            self.attribute.value.end = [gc.line, gc.character.saturating_sub(1)];
            self.attribute.value.header.1 = gc.last_cursor_pos;
            self.process_attribute();
            self.state = State::AttribValueClosed;
            return;
        }
        gc.take_until_one_found(&[b'{', b'}'], false);
    }

    fn new_text(&mut self, line: u64, character: u64, offset: usize) {
        if self.text.is_none() && (self.events[Event::Text] || self.events[Event::CloseTag]) {
            let mut text = Text::new([line, character]);
            text.header = (offset, offset);
            self.text = Some(text);
        }

        self.state = State::Text;
    }
}
#[derive(Clone, Copy)]
pub enum Event {
    // 1
    Text = 0,
    // 2
    ProcessingInstruction = 1,
    // 4
    Declaration = 2,
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
#[derive(PartialEq)]
enum State {
    // leading byte order mark or whitespace
    Begin = 0,
    // leading whitespace
    BeginWhitespace = 1,
    // "abc123"
    Text = 2,
    // <
    LT = 3,
    // the start of <!--, <!DOCTYPE, <![CDATA, <!ENTITY etc..
    MarkupDecl = 4,
    // <!ENTITY, <!ELEMENT, <!ATTLIST, etc
    Entity = 5,
    // <!DOCTYPE
    Doctype = 6,
    // <!DOCTYPE [
    DoctypeEntity = 7,
    // <!--
    Comment = 8,
    // <![CDATA[
    Cdata = 15,
    // <?hi
    ProcInst = 16,
    // <?hi there
    ProcInstValue = 17,
    // <strong
    OpenTag = 20,
    // <strong /
    OpenTagSlash = 21,
    // <a
    Attrib = 22,
    // <a foo
    AttribName = 23,
    // <a foo _
    AttribNameSawWhite = 24,
    // <a foo=
    AttribValue = 25,
    // <a foo="bar
    AttribValueQuoted = 26,
    // <a foo="bar"
    AttribValueClosed = 27,
    // <a foo=bar
    AttribValueUnquoted = 28,
    // </a
    CloseTag = 29,
    // props={() => {}}
    JSXAttributeExpression = 30,
    // \n       <
    SkipWhitespace = 31,
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
        pub proc_insts: RefCell<Vec<ProcInst>>,
    }

    impl TextEventHandler {
        pub fn new() -> Self {
            TextEventHandler {
                attributes: RefCell::new(Vec::new()),
                texts: RefCell::new(Vec::new()),
                tags: RefCell::new(Vec::new()),
                proc_insts: RefCell::new(Vec::new()),
            }
        }
    }

    impl<'a> EventHandler for TextEventHandler {
        fn handle_event(&self, _event: Event, data: Entity) {
            match data {
                Entity::Attribute(attribute) => self.attributes.borrow_mut().push(attribute.clone()),
                Entity::ProcInst(proc_inst) => self.proc_insts.borrow_mut().push(proc_inst.clone()),
                Entity::Tag(tag) => self.tags.borrow_mut().push(tag.clone()),
                Entity::Text(text) => self.texts.borrow_mut().push(text.clone()),
            }
        }
    }
    #[test]
    fn test_attribute() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Attribute] = true;
        events[Event::CloseTag] = true;
        events[Event::Text] = true;
        sax.events = events;
        let str = r#"<body class=""></body> <component data-id="user_1234"key="23" disabled />"#;

        sax.write(str.as_bytes());
        sax.identity();

        let attrs = event_handler.attributes.borrow();
        let texts = event_handler.texts.borrow();
        let attr = &attrs[0];
        let text = &texts[0];
        assert_eq!(attr.value.value, b"");
        assert_eq!(text.value, b" ");
        assert_eq!(attrs.len(), 4);
        assert_eq!(texts.len(), 1);

        Ok(())
    }
    #[test]
    fn test_attribute_single_character_boolean() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Attribute] = true;
        events[Event::CloseTag] = true;
        events[Event::Text] = true;
        sax.events = events;
        let str = r#"<element attribute1='value1'a attribute3='value3'></element>"#;

        sax.write(str.as_bytes());
        sax.identity();

        let attrs = event_handler.attributes.borrow();
        let texts = event_handler.texts.borrow();
        assert_eq!(attrs.len(), 3);
        assert_eq!(attrs[0].name.value, b"attribute1");
        assert_eq!(attrs[0].value.value, b"value1");
        assert_eq!(attrs[1].name.value, b"a");
        assert_eq!(attrs[1].value.value, b"");
        assert_eq!(attrs[2].name.value, b"attribute3");
        assert_eq!(attrs[2].value.value, b"value3");
        assert_eq!(texts.len(), 0);

        Ok(())
    }
    #[test]
    fn test_attribute_unquoted() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Attribute] = true;
        events[Event::CloseTag] = true;
        events[Event::Text] = true;
        sax.events = events;
        let str = r#"<element attribute1=value1 attribute2='value2'></element>"#;

        sax.write(str.as_bytes());
        sax.identity();

        let attrs = event_handler.attributes.borrow();
        let texts = event_handler.texts.borrow();
        assert_eq!(attrs.len(), 2);
        assert_eq!(attrs[0].name.value, b"attribute1");
        assert_eq!(attrs[0].value.value, b"value1");
        assert_eq!(attrs[1].name.value, b"attribute2");
        assert_eq!(attrs[1].value.value, b"value2");
        assert_eq!(texts.len(), 0);

        Ok(())
    }
    #[test]
    fn test_attribute_single_character() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Attribute] = true;
        events[Event::CloseTag] = true;
        events[Event::Text] = true;
        sax.events = events;
        let str = r#"<element attribute1='value1'a="value2" attribute3='value3'></element>"#;

        sax.write(str.as_bytes());
        sax.identity();

        let attrs = event_handler.attributes.borrow();
        let texts = event_handler.texts.borrow();
        assert_eq!(attrs.len(), 3);
        assert_eq!(attrs[0].name.value, b"attribute1");
        assert_eq!(attrs[0].value.value, b"value1");
        assert_eq!(attrs[1].name.value, b"a");
        assert_eq!(attrs[1].value.value, b"value2");
        assert_eq!(attrs[2].name.value, b"attribute3");
        assert_eq!(attrs[2].value.value, b"value3");
        assert_eq!(texts.len(), 0);

        Ok(())
    }
    #[test]
    fn test_empty_tag() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::CloseTag] = true;
        events[Event::Text] = true;
        sax.events = events;
        let str = r#"<div><a href="http://github.com">GitHub</a></orphan></div>"#;

        sax.write(str.as_bytes());
        sax.identity();

        let tags = event_handler.tags.borrow();
        let texts = event_handler.texts.borrow();
        assert_eq!(tags.len(), 2);
        assert_eq!(texts.len(), 2);

        // orphaned close tag should be treated as text
        assert_eq!(&texts[0].value, b"GitHub");
        assert_eq!(&texts[1].value, b"</orphan>");

        assert_eq!(tags[0].name, b"a");
        assert_eq!(tags[0].close_start[1], 39);

        assert_eq!(tags[1].name, b"div");
        assert_eq!(tags[1].close_start[1], 52);
        Ok(())
    }
    #[test]
    fn test_tag() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::CloseTag] = true;
        events[Event::Text] = true;
        sax.events = events;
        let str = r#"<div><a href="http://github.com">GitHub</a></orphan></div>"#;

        sax.write(str.as_bytes());
        sax.identity();

        let tags = event_handler.tags.borrow();
        let texts = event_handler.texts.borrow();
        assert_eq!(tags.len(), 2);
        assert_eq!(texts.len(), 2);

        // orphaned close tag should be treated as text
        assert_eq!(&texts[0].value, b"GitHub");
        assert_eq!(&texts[0].start, &[0, 33]);
        assert_eq!(&texts[0].end, &[0, 39]);
        assert_eq!(&texts[1].value, b"</orphan>");

        assert_eq!(tags[0].name, b"a");
        assert_eq!(tags[0].close_start[1], 39);

        assert_eq!(tags[1].name, b"div");
        assert_eq!(tags[1].close_start[1], 52);
        Ok(())
    }

    #[test]
    fn test_tag_write_boundary() -> Result<()> {
        let str = r#"<div empty=""><a href="http://github.com">GitHub</a></orphan></div>"#;
        let bytes = str.as_bytes();

        for i in 1..bytes.len() {
            let event_handler = TextEventHandler::new();
            let mut sax = SAXParser::new(&event_handler);
            let mut events = [false; 10];
            events[Event::CloseTag] = true;
            events[Event::Text] = true;
            events[Event::Attribute] = true;
            sax.events = events;

            sax.write(&bytes[..i]);
            sax.write(&bytes[i..]);

            sax.identity();

            let tags = event_handler.tags.borrow();
            let texts = event_handler.texts.borrow();
            // Check tags
            assert_eq!(tags.len(), 2, "At iteration i={}, expected exactly 2 tags, got {}", i, tags.len());
            assert_eq!(tags[0].name, b"a", "At iteration i={}, first tag name should be 'a', got {:?}", i, tags[0].name);
            assert_eq!(tags[1].name, b"div", "At iteration i={}, second tag name should be 'div', got {:?}", i, tags[1].name);
            assert_eq!(tags[0].close_start[1], 48, "At iteration i={}, first tag close start position should be 39, got {}", i, tags[0].close_start[1]);
            assert_eq!(tags[1].close_start[1], 61, "At iteration i={}, second tag close start position should be 52, got {}", i, tags[1].close_start[1]);
            // Check tag attributes
            assert_eq!(tags[0].attributes.len(), 1, "At iteration i={}, <a> tag should have 1 attribute, got {}", i, tags[0].attributes.len());
            assert_eq!(tags[0].attributes[0].name.value, b"href", "At iteration i={}, <a> tag attribute name should be 'href', got {:?}", i, tags[0].attributes[0].name.value);
            assert_eq!(tags[0].attributes[0].value.value, b"http://github.com", "At iteration i={}, <a> tag attribute value should be 'http://github.com', got {:?}", i, tags[0].attributes[0].value.value);
            assert_eq!(tags[1].attributes.len(), 1, "At iteration i={}, <div> tag should have 1 attribute, got {}", i, tags[1].attributes.len());
            assert_eq!(tags[1].attributes[0].name.value, b"empty", "At iteration i={}, <div> tag attribute name should be 'empty', got {:?}", i, tags[1].attributes[0].name.value);
            assert_eq!(tags[1].attributes[0].value.value, b"", "At iteration i={}, <div> tag attribute value should be empty, got {:?}", i, tags[1].attributes[0].value.value);
            // Check texts
            assert_eq!(texts.len(), 2, "At iteration i={}, expected exactly 2 text elements, got {}", i, texts.len());
            assert_eq!(&texts[0].value, b"GitHub", "At iteration i={}, first text value should be 'GitHub', got {:?}", i, texts[0].value);
            assert_eq!(&texts[0].start, &[0, 42], "At iteration i={}, first text start position should be [0, 33], got {:?}", i, texts[0].start);
            assert_eq!(&texts[0].end, &[0, 48], "At iteration i={}, first text end position should be [0, 39], got {:?}", i, texts[0].end);
            assert_eq!(&texts[1].value, b"</orphan>", "At iteration i={}, second text value should be '</orphan>', got {:?}", i, texts[1].value);
            // Check attributes
            let attrs = event_handler.attributes.borrow();
            assert_eq!(attrs.len(), 2, "At iteration i={}, expected exactly 2 attributes, got {}", i, attrs.len());
            assert_eq!(attrs[0].name.value, b"empty", "At iteration i={}, first attribute name should be 'empty', got {:?}", i, attrs[0].name.value);
            assert_eq!(attrs[0].value.value, b"", "At iteration i={}, first attribute value should be empty, got {:?}", i, attrs[0].value.value);
            assert_eq!(attrs[1].name.value, b"href", "At iteration i={}, second attribute name should be 'href', got {:?}", i, attrs[1].name.value);
            assert_eq!(attrs[1].value.value, b"http://github.com", "At iteration i={}, second attribute value should be 'http://github.com', got {:?}", i, attrs[1].value.value);
        }
        Ok(())
    }

    #[test]
    fn test_whitespace() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::CloseTag] = true;
        events[Event::Text] = true;
        sax.events = events;
        let str = r#"<?xml version="1.0" encoding="UTF-8"?>
<plugin
    version       =   "1.0.0"   >

    <description>
    The current
    version of
the plugin
                </description>
</plugin>"#;

        sax.write(str.as_bytes());
        sax.identity();

        let tags = event_handler.tags.borrow();
        let texts = event_handler.texts.borrow();
        assert_eq!(tags.len(), 2);
        assert_eq!(texts.len(), 3);
        Ok(())
    }
    #[test]
    fn test_comment() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Comment] = true;
        events[Event::Text] = true;
        sax.events = events;
        let str = "<!--name='test 3 attr' this is a comment--> <-- name='test 3 attr' this is just text -->";

        sax.write(str.as_bytes());
        sax.identity();

        let texts = event_handler.texts.borrow();
        assert_eq!(texts.len(), 2);
        let comment_value = String::from_utf8(texts[0].value.clone()).unwrap();
        assert_eq!(comment_value, "name='test 3 attr' this is a comment");

        let text_value = String::from_utf8(texts[1].value.clone()).unwrap();
        assert_eq!(text_value, " <-- name='test 3 attr' this is just text -->");

        Ok(())
    }

    #[test]
    fn test_comment_write_boundary_2() -> Result<()> {
        let mut events = [false; 10];
        events[Event::Comment] = true;
        let str = r#"<!--lit-part cI7PGs8mxHY=-->
        <p><!--lit-part-->hello<!--/lit-part--></p>
        <!--lit-part BRUAAAUVAAA=--><?><!--/lit-part-->
        <!--lit-part--><!--/lit-part-->
        <p>more</p>
        <!--/lit-part-->"#;

        let bytes = str.as_bytes();
        for i in 1..bytes.len() {
            let event_handler = TextEventHandler::new();
            let mut sax = SAXParser::new(&event_handler);
            sax.events = events;

            sax.write(&bytes[..i]);
            sax.write(&bytes[i..]);
            sax.identity();

            let comments = event_handler.texts.borrow();
            assert_eq!(comments.len(), 8, "At iteration i={}, expected exactly 8 comments, got {}", i, comments.len());
            let text_value = String::from_utf8(comments[0].value.clone()).unwrap();
            assert_eq!(
                text_value, "lit-part cI7PGs8mxHY=",
                "At iteration i={}, first comment content should be 'lit-part cI7PGs8mxHY=', got {:?}",
                i, text_value
            );
        }

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
    fn test_4_bytes() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Text] = true;
        sax.events = events;
        let str = "🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚🏴📚📚";
        let bytes = str.as_bytes();
        sax.write(&bytes[..14]);

        sax.write(&bytes[14..]);
        sax.identity();

        let texts = event_handler.texts.borrow();
        assert_eq!(texts.len(), 1);
        let text_value = String::from_utf8(texts[0].value.clone()).unwrap();
        assert_eq!(text_value, String::from_utf8(Vec::from(bytes)).unwrap());

        Ok(())
    }

    #[test]
    fn test_cdata_write_boundary() -> Result<()> {
        let str = "<div><![CDATA[something]]>";
        let bytes = str.as_bytes();
        let mut events = [false; 10];
        events[Event::Cdata] = true;
        for i in 1..bytes.len() {
            let event_handler = TextEventHandler::new();
            let mut sax = SAXParser::new(&event_handler);
            sax.events = events;

            sax.write(&bytes[..i]);
            sax.write(&bytes[i..]);
            sax.identity();

            let texts = event_handler.texts.borrow();
            assert_eq!(texts.len(), 1, "At iteration i={}, expected exactly one text element, got {}", i, texts.len());
            let text_value = String::from_utf8(texts[0].value.clone()).unwrap();
            assert_eq!(
                text_value,
                String::from_utf8(Vec::from("something".as_bytes())).unwrap(),
                "At iteration i={}, CDATA content should be 'something', got {:?}",
                i,
                text_value
            );
        }
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
        events[Event::CloseTag] = true;
        sax.events = events;
        let str = "<foo>{bar < baz ? <div></div> : <></>}</foo>";

        sax.write(str.as_bytes());
        sax.identity();

        let texts = event_handler.texts.borrow();
        assert_eq!(texts.len(), 3);

        assert_eq!(String::from_utf8(texts[0].value.clone()).unwrap(), "{bar < baz ? ");
        assert_eq!(String::from_utf8(texts[1].value.clone()).unwrap(), " : ");
        assert_eq!(String::from_utf8(texts[2].value.clone()).unwrap(), "}");

        let tags = event_handler.tags.borrow();
        assert_eq!(tags.len(), 3);

        assert_eq!(tags[2].text_nodes.len(), 3);
        Ok(())
    }

    #[test]
    fn test_doctype() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Doctype] = true;
        events[Event::Declaration] = true;
        sax.events = events;
        let str = r#"
        <!DOCTYPE movie [
          <!ENTITY COM "Comedy">
          <!LIST title xml:lang TOKEN "EN" id ID #IMPLIED>
          <!ENTITY SF "Science Fiction">
          <!ELEMENT movie (title+,genre,year)>
          <!ELEMENT title (#DATA)>
          <!ELEMENT genre (#DATA)>
          <!ELEMENT year (#DATA)>
        ]>"#;
        sax.write(str.as_bytes());
        sax.identity();

        let doctypes = event_handler.texts.borrow();
        assert_eq!(doctypes.len(), 8);
        assert_eq!(doctypes[0].value, r#"ENTITY COM "Comedy""#.as_bytes());
        assert_eq!(doctypes[1].value, r#"LIST title xml:lang TOKEN "EN" id ID #IMPLIED"#.as_bytes());
        assert_eq!(doctypes[7].value, b"movie");

        Ok(())
    }

    #[test]
    fn test_empty_cdata() -> Result<()> {
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
        assert_eq!(cdatas[1].value, b"something");

        Ok(())
    }

    #[test]
    fn test_proc_inst() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::ProcessingInstruction] = true;
        sax.events = events;
        let str = r#"<?xml-stylesheet
        type="text/xsl"
        href="main.xsl"
        media="screen"
        title="Default Style"
        alternate="no"?>"#;

        sax.write(str.as_bytes());
        sax.identity();

        let proc_inst = event_handler.proc_insts.borrow();
        assert_eq!(proc_inst.len(), 1);
        assert_eq!(proc_inst[0].target.value, b"xml-stylesheet");

        Ok(())
    }
    #[test]
    fn test_jsx() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::CloseTag] = true;
        sax.events = events;
        let str = r#"
            <Component>
                {this.authenticated ? <User props={this.userProps}/> : <SignIn props={this.signInProps}/>}
            </Component>"#;

        sax.write(str.as_bytes());
        sax.identity();

        let tags = event_handler.tags.borrow();
        assert_eq!(tags.len(), 3);
        assert_eq!(tags[0].attributes.len(), 1);
        assert_eq!(tags[1].attributes.len(), 1);

        Ok(())
    }
    #[test]
    fn test_self_closing_tag() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::CloseTag] = true;
        sax.events = events;
        let str = r#"
        <Div>
            <Div type="JS" viewName="myapp.view.Home" />
            <Div type="JSON" viewName="myapp.view.Home" />
            <Div type="HTML" viewName="myapp.view.Home" />
            <Div type="Template" viewName="myapp.view.Home" />

            <!-- This one will be correctly "closed" -->
            <AnotherSelfClosingDiv type="Template" viewName={myapp.view.Home}/>
            <Div type="Template" viewName=myapp.view.Home/>
        </Div>"#;

        sax.write(str.as_bytes());
        sax.identity();

        let tags = event_handler.tags.borrow();
        assert_eq!(tags.len(), 7);
        assert_eq!(tags[0].self_closing, true);
        assert_eq!(tags[1].self_closing, true);
        assert_eq!(tags[2].self_closing, true);
        assert_eq!(tags[3].self_closing, true);
        assert_eq!(tags[4].self_closing, true);
        assert_eq!(tags[5].self_closing, true);
        assert_eq!(tags[6].self_closing, false);
        Ok(())
    }

    #[test]
    fn test_comment_write_boundary() -> Result<()> {
        let str = r#"<!--some comment here-->"#;
        let bytes = str.as_bytes();
        let mut events = [false; 10];
        events[Event::Comment] = true;

        for i in 1..bytes.len() {
            let event_handler = TextEventHandler::new();
            let mut sax = SAXParser::new(&event_handler);

            sax.events = events;

            let bytes = str.as_bytes();
            sax.write(&bytes[..i]);
            sax.write(&bytes[i..]);

            sax.identity();

            let comments = event_handler.texts.borrow();
            assert_eq!(comments.len(), 1, "At iteration i={}, expected exactly one comment, got {}", i, comments.len());
            assert_eq!(
                comments[0].value, b"some comment here",
                "At iteration i={}, comment content should be 'some comment here', got {:?}",
                i, comments[0].value
            );
        }
        Ok(())
    }

    #[test]
    fn test_attribute_value_write_boundary() -> Result<()> {
        let str = r#"<text top="100.00" />"#;
        let bytes = str.as_bytes();

        for i in 1..bytes.len() {
            let event_handler = TextEventHandler::new();
            let mut sax = SAXParser::new(&event_handler);
            let mut events = [false; 10];
            events[Event::Attribute] = true;
            sax.events = events;

            sax.write(&bytes[..i]);
            sax.write(&bytes[i..]);
            sax.identity();

            let attrs = event_handler.attributes.borrow();
            assert_eq!(attrs.len(), 1, "At iteration i={}, Expected exactly one attribute, got {:?}", i, attrs.len());
            assert_eq!(attrs[0].value.value, b"100.00", "At iteration i={}, Expected attribute value to be 100.00, got {:?}", i, attrs[0].value.value);
            assert_eq!(attrs[0].name.value, b"top", "At iteration i={}, Expected attribute name to be 100.00, got {:?}", i, attrs[0].name.value);
        }
        Ok(())
    }

    #[test]
    fn test_script_tag_unquoted_attribute() -> Result<()> {
        let event_handler = TextEventHandler::new();
        let mut sax = SAXParser::new(&event_handler);
        let mut events = [false; 10];
        events[Event::Attribute] = true;
        events[Event::CloseTag] = true;
        sax.events = events;
        let str = "<script type=text/javascript>\n\n</script>";
        sax.write(str.as_bytes());
        sax.identity();

        let tags = event_handler.tags.borrow();
        let attrs = event_handler.attributes.borrow();

        // There should be one <script> tag
        assert_eq!(tags.len(), 1, "Expected exactly 1 tag, got {}", tags.len());
        assert_eq!(tags[0].name, b"script", "Tag name should be 'script', got {:?}", tags[0].name);
        // The <script> tag should have one attribute: type=text/javascript
        assert_eq!(tags[0].attributes.len(), 1, "<script> tag should have 1 attribute, got {}", tags[0].attributes.len());
        assert_eq!(tags[0].attributes[0].name.value, b"type", "Attribute name should be 'type', got {:?}", tags[0].attributes[0].name.value);
        assert_eq!(tags[0].attributes[0].value.value, b"text/javascript", "Attribute value should be 'text/javascript', got {:?}", tags[0].attributes[0].value.value);
        // There should be one attribute event
        assert_eq!(attrs.len(), 1, "Expected exactly 1 attribute event, got {}", attrs.len());
        assert_eq!(attrs[0].name.value, b"type", "Attribute event name should be 'type', got {:?}", attrs[0].name.value);
        assert_eq!(attrs[0].value.value, b"text/javascript", "Attribute event value should be 'text/javascript', got {:?}", attrs[0].value.value);
        Ok(())
    }
}
