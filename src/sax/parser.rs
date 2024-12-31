use std::mem;
use std::str;

use super::grapheme_iterator::GraphemeClusters;
use super::grapheme_iterator::GraphemeResult;
use super::names::is_name_char;
use super::names::is_name_start_char;
use super::tag::*;
use super::utils::ascii_icompare;
use super::utils::is_quote;
use super::utils::is_whitespace;

/// Byte Order Mark (BOM) for UTF-8 encoded files.
static BOM: &'static [u8; 3] = &[0xef, 0xbb, 0xbf];

/// Characters that indicate the end of a tag name.
static TAG_NAME_END: &'static [u8; 6] = &[b' ', b'\n', b'\t', b'\r', b'>', b'/'];

/// Characters that indicate the end of an attribute name.
static ATTRIBUTE_NAME_END: &'static [u8; 3] = &[b' ', b'=', b'>'];

/// Type alias for the event listener function.
pub type EventListener = fn(event: Event, data: Entity);

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
pub struct SAXParser {
    pub events: u32,
    pub tags: Vec<Tag>,

    state: State,
    cdata: Text,
    comment: Text,
    doctype: Text,
    text: Text,
    close_tag_name: Vec<u8>,
    proc_inst: ProcInst,
    quote: u8,
    sgml_decl: Text,
    attribute: Attribute,
    tag: Tag,
    brace_ct: u32,

    event_handler: EventListener,
    leftover_bytes_info: Option<([u8; 3], usize, usize)>,
    end_pos: [u32; 2],
}

impl SAXParser {
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
    /// use sax_wasm::sax::parser::Event;
    /// use sax_wasm::sax::tag::Entity;
    /// use sax_wasm::sax::parser::EventListener;
    /// use sax_wasm::sax::parser::SAXParser;
    ///
    /// let event_handler = |event: Event, data: Entity| { /* handle event */ };
    /// let parser = SAXParser::new(event_handler);
    /// ```
    pub fn new(event_handler: EventListener) -> SAXParser {
        SAXParser {
            event_handler,
            state: State::Begin,
            events: 0,
            tags: Vec::new(),

            cdata: Text::new([0, 0]),
            comment: Text::new([0, 0]),
            doctype: Text::new([0, 0]),
            close_tag_name: Vec::new(),
            proc_inst: ProcInst::new(),
            quote: 0,
            sgml_decl: Text::new([0, 0]),
            tag: Tag::new([0, 0]),
            attribute: Attribute::new(),
            text: Text::new([0, 0]),
            brace_ct: 0,
            leftover_bytes_info: None,
            end_pos: [0, 0],
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
    /// use sax_wasm::sax::parser::Event;
    /// use sax_wasm::sax::tag::Entity;
    /// use sax_wasm::sax::parser::EventListener;
    /// use sax_wasm::sax::parser::SAXParser;
    ///
    /// let event_handler: EventListener = |event: Event, data: Entity| {
    ///
    /// };
    /// let mut parser = SAXParser::new(event_handler);
    /// parser.write(b"<tag>content</tag>");
    /// ```
    pub fn write(&mut self, source: &[u8]) {
        let mut gc = GraphemeClusters::new(source);
        gc.line = self.end_pos[0];
        gc.character = self.end_pos[1];

        if let Some(bytes_info) = self.leftover_bytes_info {
          gc.character += if bytes_info.1 == 4 {2} else {1};
          self.process_dangling_bytes(&mut gc, source, bytes_info);
        }

        loop {
            if let Some(current) = gc.next() {
                self.process_grapheme(&mut gc, &current);
            } else {
                break;
            }
        }
        self.end_pos = [gc.line, gc.character];
        self.leftover_bytes_info = gc.get_remaining_bytes();
    }

    #[cold]
    fn process_dangling_bytes(&mut self, gc: &mut GraphemeClusters, source: &[u8], bytes_info: ([u8;3], usize, usize)) {
      let (mut bytes, bytes_len, bytes_needed) = bytes_info;
          let grapheme_len = bytes_len + bytes_needed;
          let bytes_slice = unsafe { source.get_unchecked(0..bytes_needed)};

          match bytes_needed {
            2 => bytes[bytes_len + 1] = bytes_slice[0],
            3 => {
              bytes[bytes_len + 1] = bytes_slice[0];
              bytes[bytes_len + 2] = bytes_slice[1];
            },
            _ => {}
          }
          let grapheme = unsafe { str::from_utf8_unchecked(bytes.get_unchecked(0..grapheme_len))};
         self.process_grapheme(gc, &(grapheme, 0, 0));
    }

    /// Resets the parser to its initial state.
    ///
    /// This function flushes any remaining text at the end of the file (EOF) and resets
    /// the parser's state to its initial state.
    ///
    /// # Examples
    ///
    /// ```
    /// use sax_wasm::sax::parser::Event;
    /// use sax_wasm::sax::parser::SAXParser;
    /// use sax_wasm::sax::tag::Entity;
    /// use sax_wasm::sax::parser::EventListener;
    ///
    /// let event_handler: EventListener = |event: Event, data: Entity| {
    ///
    /// };
    /// let mut parser = SAXParser::new(event_handler);
    /// parser.write(b"<tag>content</tag>");
    /// parser.identity();
    /// ```
    pub fn identity(&mut self) {
        // flush text at the EOF
        self.flush_text(self.end_pos[0], self.end_pos[1] + 1);
        self.state = State::Begin;
        self.attribute = Attribute::new();
        self.brace_ct = 0;
        self.end_pos = [0, 0];
    }

    /// Processes a grapheme cluster.
    ///
    /// This function processes a grapheme cluster based on the current state of the parser.
    /// It updates the parser's state and handles different types of XML constructs.
    ///
    /// # Arguments
    ///
    /// * `gc` - A mutable reference to the `GraphemeClusters` iterator.
    /// * `current` - A reference to the current `GraphemeResult`.
    ///
    fn process_grapheme(&mut self, gc: &mut GraphemeClusters, current: &GraphemeResult) {
        match self.state {
            State::OpenTag => self.open_tag(gc, current),
            State::Attrib => self.attribute(current),
            State::AttribName => self.attribute_name(gc, current),
            State::AttribValue => self.attribute_value(current),
            State::AttribValueQuoted => self.attribute_value_quoted(gc, current),
            State::BeginWhitespace => self.begin_white_space(current),
            State::Text => self.text(gc, current),
            State::CloseTag => self.close_tag(gc, current),
            State::SgmlDecl => self.sgml_decl(gc, current),
            State::SgmlDeclQuoted => self.sgml_quoted(current),
            State::Doctype => self.doctype(current),
            State::DoctypeQuoted => self.doctype_quoted(current),
            State::DoctypeDtd => self.doctype_dtd(current),
            State::DoctypeDtdQuoted => self.doctype_dtd_quoted(current),
            State::Comment => self.comment(gc, current),
            State::CommentEnding => self.comment_ending(current),
            State::CommentEnded => self.comment_ended(current),
            State::Cdata => self.cdata(gc, current),
            State::CdataEnding => self.cdata_ending(current),
            State::CdataEnding2 => self.cdata_ending_2(current),
            State::ProcInst => self.proc_inst(current),
            State::ProcInstValue => self.proc_inst_value(current),
            State::ProcInstEnding => self.proc_inst_ending(current),
            State::OpenTagSlash => self.open_tag_slash(current),
            State::AttribNameSawWhite => self.attribute_name_saw_white(current),
            State::AttribValueClosed => self.attribute_value_closed(current),
            State::AttribValueUnquoted => self.attribute_value_unquoted(current),
            State::CloseTagSawWhite => self.close_tag_saw_white(current),
            State::JSXAttributeExpression => self.jsx_attribute_expression(gc, current),
            State::OpenWaka => self.open_waka(current),
            State::Begin => self.begin(current),
        };
    }

    fn begin(&mut self, current: &GraphemeResult) {
        self.state = State::BeginWhitespace;
        // BOM
        if current.0.as_bytes() == BOM {
            return;
        }

        self.begin_white_space(current);
    }

    fn open_waka(&mut self, current: &GraphemeResult) {
        if is_name_start_char(current.0) {
            self.state = State::OpenTag;
            self.tag.name = current.0.as_bytes().to_vec();
            return;
        }

        match current.0 {
            "!" => {
                self.state = State::SgmlDecl;
                self.sgml_decl.start = [current.1, current.2 - 1];
            }

            "/" => {
                self.state = State::CloseTag;
                self.close_tag_name = Vec::new()
            }

            "?" => {
                self.state = State::ProcInst;
                self.proc_inst.start = [current.1, current.2 - 1];
            }

            ">" => {
                self.process_open_tag(false, current); // JSX fragment
            }

            _ => {
                self.new_text(current);
                self.write_text(&[b'<']);
                self.write_text(current.0.as_bytes());
            }
        }
    }

    fn open_tag(&mut self, gc: &mut GraphemeClusters, current: &GraphemeResult) {
        if is_name_char(current.0) {
            self.tag.name.extend_from_slice(current.0.as_bytes());
            if let Some(unwrapped) = gc.take_until_ascii(TAG_NAME_END) {
                self.tag.name.extend_from_slice(unwrapped.0.as_bytes());
            }
            return;
        }

        if self.events & Event::OpenTagStart as u32 != 0 {
            (self.event_handler)(Event::OpenTagStart, Entity::Tag(&mut self.tag));
        }
        match current.0 {
            ">" => self.process_open_tag(false, current),
            "/" => self.state = State::OpenTagSlash,
            _ => self.state = State::Attrib,
        }
    }

    fn begin_white_space(&mut self, current: &GraphemeResult) {
        if current.0 == "<" {
            self.new_tag(current);
            return;
        }
        self.new_text(current);
        self.write_text(current.0.as_bytes());
    }

    fn text(&mut self, gc: &mut GraphemeClusters, current: &GraphemeResult) {
        if current.0 != "<" {
            self.write_text(current.0.as_bytes());
            let text_result = gc.take_until_ascii(&[b'<']);
            if let Some(text) = text_result {
                self.write_text(text.0.as_bytes());
            }
            return;
        }
        self.flush_text(current.1, current.2);
        self.new_tag(current);
    }

    fn flush_text(&mut self, line: u32, character: u32) {
        if self.text.value.is_empty() {
            return;
        }
        let len = self.tags.len();

        let mut text = mem::replace(&mut self.text, Text::new([line, character]));
        text.end = [line, character - 1];
        if self.events & Event::Text as u32 != 0 {
            (self.event_handler)(Event::Text, Entity::Text(&mut text));
        }
        // Store these only if we're interested in CloseTag events
        if len != 0 && self.events & Event::CloseTag as u32 != 0 {
            self.tags[len - 1].text_nodes.push(text);
        }
    }

    fn sgml_decl(&mut self, gc: &mut GraphemeClusters, current: &GraphemeResult) {
        let sgml_str = unsafe { str::from_utf8_unchecked(self.sgml_decl.value.as_slice()) };
        let is_sgml_char = match sgml_str {
            sgml if ascii_icompare("[cdata[", sgml) == true => {
                // Empty cdata
                if current.0 == "]" {
                    self.state = State::CdataEnding;
                } else {
                    self.state = State::Cdata;
                    self.cdata.value.extend_from_slice(current.0.as_bytes());
                }
                self.cdata.start = [current.1, current.2 - 8];
                false
            }

            "--" => {
                self.state = State::Comment;
                self.comment.start = [current.1, current.2 - 4];
                self.comment(gc, current);
                false
            }

            sgml if ascii_icompare("doctype", sgml) == true => {
                self.state = State::Doctype;
                self.doctype.start = [current.1, current.2 - 8];
                false
            }

            _ => true,
        };

        if current.0 == ">" {
            let mut sgml_decl = mem::replace(&mut self.sgml_decl, Text::new([0, 0]));
            if self.events & Event::SGMLDeclaration as u32 != 0 {
                sgml_decl.value.extend_from_slice(current.0.as_bytes());
                sgml_decl.end = [current.1, current.2 - 1];
                (self.event_handler)(Event::SGMLDeclaration, Entity::Text(&mut sgml_decl));
            }

            self.new_text(current);
            return;
        }

        if is_sgml_char {
            self.sgml_decl.value.extend_from_slice(current.0.as_bytes());
        } else {
            self.sgml_decl = Text::new([0, 0]);
        }

        if is_quote(current.0) {
            self.state = State::SgmlDeclQuoted;
        }
    }

    fn sgml_quoted(&mut self, current: &GraphemeResult) {
        if current.0.as_bytes()[0] == self.quote {
            self.quote = 0;
            self.state = State::SgmlDecl;
        }
        self.sgml_decl.value.extend_from_slice(current.0.as_bytes());
    }

    fn doctype(&mut self, current: &GraphemeResult) {
        if current.0 == ">" {
            self.new_text(current);
            if self.events & Event::Doctype as u32 != 0 {
                let mut doctype = mem::replace(&mut self.doctype, Text::new([0, 0]));
                doctype.end = [current.1, current.2 - 1];
                (self.event_handler)(Event::Doctype, Entity::Text(&mut doctype));
            }
            return;
        }
        self.doctype.value.extend_from_slice(current.0.as_bytes());
        if current.0 == "]" {
            self.state = State::DoctypeDtd;
        } else if is_quote(current.0) {
            self.state = State::DoctypeQuoted;
            self.quote = current.0.as_bytes()[0];
        }
    }

    fn doctype_quoted(&mut self, current: &GraphemeResult) {
        self.doctype.value.extend_from_slice(current.0.as_bytes());
        if current.0.as_bytes()[0] == self.quote {
            self.quote = 0;
            self.state = State::Doctype;
        }
    }

    fn doctype_dtd(&mut self, current: &GraphemeResult) {
        self.doctype.value.extend_from_slice(current.0.as_bytes());
        if current.0 == "]" {
            self.state = State::Doctype;
        } else if is_quote(current.0) {
            self.state = State::DoctypeDtdQuoted;
            self.quote = current.0.as_bytes()[0];
        }
    }

    fn doctype_dtd_quoted(&mut self, current: &GraphemeResult) {
        self.doctype.value.extend_from_slice(current.0.as_bytes());
        if self.quote == current.0.as_bytes()[0] {
            self.state = State::DoctypeDtd;
            self.quote = 0;
        }
    }

    fn comment(&mut self, gc: &mut GraphemeClusters, current: &GraphemeResult) {
        if current.0 == "-" {
            self.state = State::CommentEnding;
            return;
        }
        let mut comment_str: &str = &"";
        let comment_result = gc.take_until_ascii(&[b'-']);
        if let Some(comment) = comment_result {
            comment_str = comment.0;
        }
        if self.events & Event::Comment as u32 != 0 {
            self.comment.value.extend_from_slice(current.0.as_bytes());
            self.comment.value.extend_from_slice(comment_str.as_bytes());
        }
    }

    fn comment_ending(&mut self, current: &GraphemeResult) {
        if current.0 == "-" {
            self.state = State::CommentEnded;
            return;
        }
        if self.events & Event::Comment as u32 != 0 {
            self.comment.value.push(b'-');
            self.comment.value.extend_from_slice(current.0.as_bytes());
        }
        self.state = State::Comment;
    }

    fn comment_ended(&mut self, current: &GraphemeResult) {
        if current.0 == ">" {
            if self.events & Event::Comment as u32 != 0 {
                let mut comment = mem::replace(&mut self.comment, Text::new([0, 0]));
                comment.end = [current.1, current.2 - 1];
                (self.event_handler)(Event::Comment, Entity::Text(&mut comment));
            }
            self.state = State::BeginWhitespace;
            return;
        }
        if self.events & Event::Comment as u32 != 0 {
            self.comment.value.extend_from_slice("--".as_bytes());
            self.comment.value.extend_from_slice(current.0.as_bytes());
        }
        self.state = State::Comment;
    }

    fn cdata(&mut self, gc: &mut GraphemeClusters, current: &GraphemeResult) {
        if current.0 == "]" {
            self.state = State::CdataEnding;
            return;
        }
        self.cdata.value.extend_from_slice(current.0.as_bytes());
        let cdata_result = gc.take_until_ascii(&[b']']);
        if let Some(cdata) = cdata_result {
            self.cdata.value.extend_from_slice(cdata.0.as_bytes());
        }
        gc.next(); // skip the ] char
        self.state = State::CdataEnding;
    }

    fn cdata_ending(&mut self, current: &GraphemeResult) {
        if current.0 == "]" {
            self.state = State::CdataEnding2;
            return;
        }
        self.state = State::Cdata;
        self.cdata.value.extend_from_slice(current.0.as_bytes());
    }

    fn cdata_ending_2(&mut self, current: &GraphemeResult) {
        if current.0 == ">" {
            self.new_text(current);
            if self.events & Event::Cdata as u32 != 0 {
                let mut cdata = mem::replace(&mut self.cdata, Text::new([0, 0]));
                cdata.end = [current.1, current.2 - 1];
                (self.event_handler)(Event::Cdata, Entity::Text(&mut cdata));
            }
            return;
        } else if current.0 == "]" {
            self.cdata.value.extend_from_slice(current.0.as_bytes());
        } else {
            self.cdata.value.extend_from_slice("]]".as_bytes());
            self.cdata.value.extend_from_slice(current.0.as_bytes());
            self.state = State::Cdata;
        }
    }

    fn proc_inst(&mut self, current: &GraphemeResult) {
        if current.0 == ">" {
            return self.proc_inst_ending(current);
        }
        if current.0 == "?" {
            self.state = State::ProcInstEnding;
            return;
        }
        if self.proc_inst.target.value.len() == 0 {
            self.proc_inst.target.start = [current.1, current.2];
        } else if is_whitespace(current.0) {
            self.proc_inst.target.end = [current.1, current.2 - 1];
            self.state = State::ProcInstValue;
            return;
        }
        self.proc_inst
            .target
            .value
            .extend_from_slice(current.0.as_bytes());
    }

    fn proc_inst_value(&mut self, current: &GraphemeResult) {
        if self.proc_inst.content.value.len() == 0 {
            if is_whitespace(current.0) {
                return;
            }
            self.proc_inst.content.start = [current.1, current.2 - 1];
        }

        if current.0 == "?" {
            self.state = State::ProcInstEnding;
            self.proc_inst.content.end = [current.1, current.2 - 1];
        } else {
            self.proc_inst
                .content
                .value
                .extend_from_slice(current.0.as_bytes());
        }
    }

    fn proc_inst_ending(&mut self, current: &GraphemeResult) {
        if current.0 == ">" {
            self.new_text(current);
            let mut proc_inst = mem::replace(&mut self.proc_inst, ProcInst::new());
            if self.events & Event::ProcessingInstruction as u32 != 0 {
                proc_inst.end = [current.1, current.2];
                (self.event_handler)(
                    Event::ProcessingInstruction,
                    Entity::ProcInst(&mut proc_inst),
                );
            }
            return;
        }
        self.proc_inst.content.value.push(b'?');
        self.proc_inst
            .content
            .value
            .extend_from_slice(current.0.as_bytes());
        self.state = State::ProcInstValue;
    }

    fn open_tag_slash(&mut self, current: &GraphemeResult) {
        if current.0 == ">" {
            self.process_open_tag(true, current);
            self.process_close_tag(current);
            return;
        }
        self.state = State::Attrib;
    }

    fn attribute(&mut self, current: &GraphemeResult) {
        if is_whitespace(current.0) {
            return;
        }
        if current.0 == ">" {
            self.process_open_tag(false, current);
        } else if current.0 == "/" {
            self.state = State::OpenTagSlash;
        } else {
            self.attribute.name.value = Vec::from(current.0);
            self.attribute.name.start = [current.1, current.2 - 1];
            self.state = State::AttribName;
        }
    }

    fn attribute_name(&mut self, gc: &mut GraphemeClusters, current: &GraphemeResult) {
        match current.0 {
            "=" => {
                self.attribute.name.end = [current.1, current.2 - 1];
                self.state = State::AttribValue;
            }
            ">" => {
                self.process_attribute();
                self.process_open_tag(false, current);
            }
            grapheme if is_whitespace(grapheme) == true => {
                self.state = State::AttribNameSawWhite;
                self.attribute.name.end = [current.1, current.2 - 1];
            }
            _ => {
                if let Some(attribute_name) = gc.take_until_ascii(ATTRIBUTE_NAME_END) {
                    self.attribute
                        .name
                        .value
                        .extend_from_slice(current.0.as_bytes());
                    self.attribute
                        .name
                        .value
                        .extend_from_slice(attribute_name.0.as_bytes());
                };
            }
        }
    }

    fn attribute_name_saw_white(&mut self, current: &GraphemeResult) {
        if is_whitespace(current.0) {
            return;
        }
        match current.0 {
            "=" => self.state = State::AttribValue,
            "/" => {
                self.process_attribute();
                self.state = State::OpenTagSlash;
            }
            ">" => {
                self.process_attribute();
                self.process_open_tag(false, current);
            }
            _ => {
                self.process_attribute(); // new Attribute struct created
                self.attribute.name.value = Vec::from(current.0);
                self.attribute.name.start = [current.1, current.2 - 1];
                self.state = State::AttribName;
            }
        }
    }

    fn attribute_value(&mut self, current: &GraphemeResult) {
        if is_whitespace(current.0) {
            return;
        }
        self.attribute.value.start = [current.1, current.2];
        if is_quote(current.0) {
            self.quote = current.0.as_bytes()[0];
            self.state = State::AttribValueQuoted;
        } else if current.0 == "{" {
            self.state = State::JSXAttributeExpression;
            self.attribute.attr_type = AttrType::JSX;
            self.brace_ct += 1;
        } else {
            self.state = State::AttribValueUnquoted;
            self.attribute
                .value
                .value
                .extend_from_slice(current.0.as_bytes());
        }
    }

    fn attribute_value_quoted(&mut self, gc: &mut GraphemeClusters, current: &GraphemeResult) {
        if let Some(attribute_value) = gc.take_until_ascii(&[self.quote]) {
            self.attribute
                .value
                .value
                .extend_from_slice(current.0.as_bytes());
            self.attribute
                .value
                .value
                .extend_from_slice(attribute_value.0.as_bytes());
            self.attribute.value.end = [attribute_value.1, attribute_value.2];
        }

        gc.next(); // skip the last quote
        self.process_attribute();
        self.quote = 0;
        self.state = State::AttribValueClosed;
    }

    fn attribute_value_closed(&mut self, current: &GraphemeResult) {
        if is_whitespace(current.0) {
            self.state = State::Attrib;
        } else if current.0 == ">" {
            self.process_open_tag(false, current);
        } else if current.0 == "/" {
            self.state = State::OpenTagSlash;
        } else {
            self.attribute.name.value = Vec::from(current.0);
            self.state = State::AttribName;
        }
    }

    fn attribute_value_unquoted(&mut self, current: &GraphemeResult) {
        if current.0 != ">" && !is_whitespace(current.0) {
            self.attribute
                .value
                .value
                .extend_from_slice(current.0.as_bytes());
            return;
        }
        self.attribute.value.end = [current.1, current.2 - 1];
        self.process_attribute();
        if current.0 == ">" {
            self.process_open_tag(false, current);
        } else {
            self.state = State::Attrib;
        }
    }

    fn close_tag(&mut self, gc: &mut GraphemeClusters, current: &GraphemeResult) {
        if current.0 == ">" {
            // Weird </> tag
            let len = self.tags.len();
            if self.close_tag_name.is_empty() && (len == 0 || !self.tags[len - 1].name.is_empty()) {
                self.process_open_tag(true, current);
            }
            self.process_close_tag(current);
        } else if is_name_char(current.0) {
            self.close_tag_name.extend_from_slice(current.0.as_bytes());
            if let Some(close_tag) = gc.take_until_ascii(&[b'>']) {
                self.close_tag_name
                    .extend_from_slice(close_tag.0.as_bytes());
            }
        } else {
            self.state = State::CloseTagSawWhite;
        }
    }

    fn close_tag_saw_white(&mut self, current: &GraphemeResult) {
        if !is_whitespace(current.0) {
            if current.0 == ">" {
                self.process_close_tag(current);
            }
        }
    }

    fn process_attribute(&mut self) {
        let mut attr = mem::replace(&mut self.attribute, Attribute::new());
        let attribute_event = self.events & Event::Attribute as u32 != 0;
        if attribute_event {
            (self.event_handler)(Event::Attribute, Entity::Attribute(&mut attr));
        }
        // Store them only if we're interested in Open and Close tag events
        if attribute_event || self.events & Event::CloseTag as u32 != 0 {
            self.tag.attributes.push(attr);
        }
    }

    fn process_open_tag(&mut self, self_closing: bool, current: &GraphemeResult) {
        let mut tag = mem::replace(&mut self.tag, Tag::new([current.1, current.2 - 1]));
        tag.self_closing = self_closing;
        tag.open_end = [current.1, current.2];

        if self.events & Event::OpenTag as u32 != 0 {
            (self.event_handler)(Event::OpenTag, Entity::Tag(&mut tag));
        }
        if !self_closing {
            self.new_text(current);
        }
        self.tags.push(tag);
    }

    fn process_close_tag(&mut self, current: &GraphemeResult) {
        self.new_text(current);
        let mut tags_len = self.tags.len();
        {
            let mut close_tag_name = mem::replace(&mut self.close_tag_name, Vec::new());
            let mut found = false;
            if close_tag_name.is_empty() && self.tag.self_closing {
                close_tag_name = self.tag.name.clone();
            }
            while tags_len != 0 {
                tags_len -= 1;
                let tag = &mut self.tags[tags_len];
                if tag.name == close_tag_name {
                    tag.close_start = self.tag.open_start;
                    tag.close_end = [current.1, current.2];
                    found = true;
                    break;
                }
            }
            if !found {
                self.write_text("</".as_bytes());
                self.write_text(&close_tag_name);
                self.write_text(">".as_bytes());
                self.text.start = self.tag.open_start;
                return;
            }
        }

        let mut len = self.tags.len();
        if self.events & Event::CloseTag as u32 == 0 {
            let idx = len - tags_len;
            if idx > 1 {
                self.tags.truncate(idx);
                return;
            }

            self.tag = self.tags.remove(tags_len);
            return;
        }

        while len > tags_len {
            len -= 1;

            let mut tag = self.tags.remove(len);
            tag.close_end = [current.1, current.2];

            (self.event_handler)(Event::CloseTag, Entity::Tag(&mut tag));
            self.tag = tag;
        }
    }

    fn jsx_attribute_expression(&mut self, gc: &mut GraphemeClusters, current: &GraphemeResult) {
        if current.0 == "}" {
            self.brace_ct -= 1;
        } else if current.0 == "{" {
            self.brace_ct += 1;
        }

        if self.brace_ct == 0 {
            self.attribute.value.end = [current.1, current.2 - 1];
            self.process_attribute();
            self.state = State::AttribValueClosed;
            return;
        }
        self.attribute
            .value
            .value
            .extend_from_slice(current.0.as_bytes());

        if let Some(attribute) = gc.take_until_ascii(&[b'{', b'}']) {
            self.attribute
                .value
                .value
                .extend_from_slice(attribute.0.as_bytes());
        }
    }

    fn new_tag(&mut self, current: &GraphemeResult) {
        self.tag = Tag::new([current.1, current.2 - 1]);
        self.state = State::OpenWaka;
    }

    fn new_text(&mut self, current: &GraphemeResult) {
        if self.events & Event::Text as u32 != 0 || self.events & Event::CloseTag as u32 != 0 {
            self.text = Text::new([current.1, current.2]);
        }
        self.state = State::Text;
    }

    fn write_text(&mut self, grapheme: &[u8]) {
        if self.events & Event::Text as u32 == 0 && self.events & Event::CloseTag as u32 == 0 {
            return;
        }
        self.text.value.extend_from_slice(grapheme);
    }
}

#[derive(PartialEq, Clone, Copy)]
pub enum Event {
    // 1
    Text = 0b1,
    // 2
    ProcessingInstruction = 0b10,
    // 4
    SGMLDeclaration = 0b100,
    // 8
    Doctype = 0b1000,
    // 16
    Comment = 0b10000,
    // 32
    OpenTagStart = 0b100000,
    // 64
    Attribute = 0b1000000,
    // 128
    OpenTag = 0b10000000,
    // 256
    CloseTag = 0b100000000,
    // 512
    Cdata = 0b1000000000,
}

#[derive(PartialEq)]
enum State {
    // leading byte order mark or whitespace
    Begin = 0,
    // leading whitespace
    BeginWhitespace = 1,
    // general stuff
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
    // <!-
    // CommentStarting =       11,
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
    use std::fs::File;
    use std::io::{BufReader, Read, Result};

    use crate::sax::parser::{Event, SAXParser};
    use crate::sax::tag::{Encode, Entity};

    #[test]
    fn stream_very_large_xml() -> Result<()> {
        let event_handler = |_event: Event, _data: Entity| {};
        let mut sax = SAXParser::new(event_handler);
        let f = File::open("src/js/__test__/xml.xml")?;
        let mut reader = BufReader::new(f);
        const BUFFER_LEN: usize = 32 * 1024;
        loop {
            let mut buffer = [0; BUFFER_LEN];
            if let Ok(()) = reader.read_exact(&mut buffer) {
                sax.write(&buffer);
            } else {
                break;
            }
        }
        Ok(())
    }
    #[test]
    fn test_comment() -> Result<()> {
        let event_handler = |_event: Event, _data: Entity| {};
        let mut sax = SAXParser::new(event_handler);
        let str = "<!--name='test 3 attr' some comment--> <-- name='test 3 attr' some comment -->";

        sax.write(str.as_bytes());
        sax.identity();
        Ok(())
    }
    #[test]
    fn test_4_bytes() -> Result<()> {
        let event_handler = |_event: Event, _data: Entity| {};
        let mut sax = SAXParser::new(event_handler);
        sax.events = Event::Text as u32;
        let str = "🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚";
        let bytes = str.as_bytes();
        sax.write(&bytes[0..3]);
        sax.write(&bytes[3..]);
        sax.identity();
        Ok(())
    }
    #[test]
    fn count_grapheme_length() -> Result<()> {
        let event_handler = |_event: Event, _data: Entity| {};
        let mut sax = SAXParser::new(event_handler);
        let str = "🏴󠁧󠁢󠁥󠁮󠁧󠁿📚📚<div href=\"./123/123\">hey there</div>";

        sax.write(str.as_bytes());
        Ok(())
    }
    #[test]
    fn parse_jsx_expression() -> Result<()> {
        let event_handler = |_event: Event, _data: Entity| {
            _data.encode();
            return;
        };
        let mut sax = SAXParser::new(event_handler);
        sax.events = Event::Text as u32;
        let str = "<foo>{bar < baz ? <div></div> : <></>}</foo>";

        sax.write(str.as_bytes());
        Ok(())
    }
    #[test]
    fn parse_empty_cdata() -> Result<()> {
        let event_handler = |_event: Event, _data: Entity| {};
        let mut sax = SAXParser::new(event_handler);
        sax.events = Event::Cdata as u32;
        let str = "<div>
        <div>
          <![CDATA[]]>
        </div>
        <div>
          <![CDATA[something]]>
        </div>
      </div>";

        sax.write(str.as_bytes());
        Ok(())
    }
}
