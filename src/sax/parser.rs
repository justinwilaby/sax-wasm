use std::mem;
use std::str;

use sax::names::*;
use sax::tag::*;
use std::cell::RefCell;
use std::sync::Arc;

static BOM: &'static [u8; 3] = &[0xef, 0xbb, 0xbf];

pub type EventListener = fn(event: Event, idx: usize);

pub struct SAXParser {
    pub events: u32,
    pub line: u32,
    pub character: u32,

    pub nodes: Vec<Arc<RefCell<dyn Readable>>>,
    pub tags: Vec<Arc<RefCell<Tag>>>,
    // cdata, comments, doctype, sgml declarations.
    pub texts: Vec<Text>,
    pub proc_insts: Vec<ProcInst>,

    current_tag: Arc<RefCell<Tag>>,
    current_attr: Option<Attribute>,
    current_text: Option<Text>,
    current_proc_inst: Option<ProcInst>,

    state: State,
    close_tag_name: String,
    sgml_decl: String,
    quote: u8,
    brace_ct: u32,
    event_handler: EventListener,
    fragment: Vec<u8>,
}

impl SAXParser {
    pub fn new(event_handler: EventListener) -> SAXParser {
        SAXParser {
            event_handler,
            state: State::Begin,
            events: 0,
            line: 0,
            character: 0,

            nodes: Vec::new(),
            tags: Vec::new(),
            texts: Vec::new(),
            proc_insts: Vec::new(),

            close_tag_name: String::new(),
            sgml_decl: String::new(),

            current_tag: Arc::new(RefCell::new(Tag::new((0, 0)))),
            current_attr: None,
            current_text: None,
            current_proc_inst: None,

            quote: 0,
            brace_ct: 0,
            fragment: Vec::new(),
        }
    }

    pub fn write(&mut self, source: &[u8]) {
        let mut idx = 0;
        let mut chunk = self.fragment.clone();
        chunk.extend_from_slice(source);
        let len = chunk.len();

        'outer: while idx < len {
            let byte = &chunk[idx];
            let mut bytes: usize = 1;
            if ((byte & 0b10000000) >> 7) == 1 && ((byte & 0b1000000) >> 6) == 1 {
                bytes += 1;
            }
            if bytes == 2 && ((byte & 0b100000) >> 5) == 1 {
                bytes += 1;
            }
            if bytes == 3 && ((byte & 0b10000) >> 4) == 1 {
                bytes += 1;
            }
            // We don't have enough bytes
            let end_idx = idx + bytes;
            if end_idx > len {
                self.fragment.truncate(0);
                loop {
                    self.fragment.push(chunk[idx]);
                    idx += 1;
                    if idx == len {
                        break 'outer;
                    }
                }
            }
            let s = &chunk[idx..end_idx];
            unsafe {
                let st = str::from_utf8_unchecked(s);
                self.process_grapheme(st);
            }
            idx = end_idx;
        }
    }

    pub fn identity(&mut self) {
        // flush text at the EOF
        self.character += 1;
        self.text("<");

        self.character = 0;
        self.line = 0;
        self.state = State::Begin;
    }

    fn process_grapheme(&mut self, grapheme: &str) {
        if grapheme == "\n" {
            self.line += 1;
            self.character = 0;
        } else {
            self.character += 1;
        }

        match self.state {
            State::Begin => self.begin(grapheme),
            State::OpenWaka => self.open_waka(grapheme),
            State::OpenTag => self.open_tag(grapheme),
            State::BeginWhitespace => self.begin_white_space(grapheme),
            State::Text => self.text(grapheme),
            State::MaybeText => self.maybe_text(grapheme),
            State::SgmlDecl => self.sgml_decl(grapheme),
            State::SgmlDeclQuoted => self.sgml_quoted(grapheme),
            State::Doctype => self.doctype(grapheme),
            State::DoctypeQuoted => self.doctype_quoted(grapheme),
            State::DoctypeDtd => self.doctype_dtd(grapheme),
            State::DoctypeDtdQuoted => self.doctype_dtd_quoted(grapheme),
            State::Comment => self.comment(grapheme),
            State::CommentEnding => self.comment_ending(grapheme),
            State::CommentEnded => self.comment_ended(grapheme),
            State::Cdata => self.cdata(grapheme),
            State::CdataEnding => self.cdata_ending(grapheme),
            State::CdataEnding2 => self.cdata_ending_2(grapheme),
            State::ProcInst => self.proc_inst(grapheme),
            State::ProcInstValue => self.proc_inst_value(grapheme),
            State::ProcInstEnding => self.proc_inst_ending(grapheme),
            State::OpenTagSlash => self.open_tag_slash(grapheme),
            State::Attrib => self.attribute(grapheme),
            State::AttribName => self.attribute_name(grapheme),
            State::AttribNameSawWhite => self.attribute_name_saw_white(grapheme),
            State::AttribValue => self.attribute_value(grapheme),
            State::AttribValueQuoted => self.attribute_value_quoted(grapheme),
            State::AttribValueClosed => self.attribute_value_closed(grapheme),
            State::AttribValueUnquoted => self.attribute_value_unquoted(grapheme),
            State::CloseTag => self.close_tag(grapheme),
            State::CloseTagSawWhite => self.close_tag_saw_white(grapheme),
            State::JSXAttributeExpression => self.jsx_attribute_expression(grapheme),
        };
    }

    fn begin(&mut self, grapheme: &str) {
        self.state = State::BeginWhitespace;
        // BOM
        if grapheme.as_bytes() == BOM {
            return;
        }

        self.begin_white_space(grapheme);
    }

    fn open_waka(&mut self, grapheme: &str) {
        if SAXParser::is_whitespace(grapheme) {
            return;
        }

        if is_name_start_char(grapheme) {
            self.state = State::OpenTag;
            RefCell::borrow_mut(&self.current_tag).name = grapheme.to_string();
            return;
        }

        match grapheme {
            "!" => {
                self.state = State::SgmlDecl;
            }

            "/" => {
                self.state = State::CloseTag;
                self.close_tag_name = String::new();
            }

            "?" => {
                self.state = State::ProcInst;
                if self.events & Event::ProcessingInstruction as u32 != 0 {
                    self.current_proc_inst = Some(ProcInst::new((self.line, self.character - 1)))
                }
            }

            ">" => {
                self.open_tag(grapheme); // JSX fragment
            }

            _ => {}
        }
    }

    fn open_tag(&mut self, grapheme: &str) {
        if is_name_char(grapheme) {
            RefCell::borrow_mut(&self.current_tag)
                .name
                .push_str(grapheme);
        } else {
            if self.events & Event::OpenTagStart as u32 != 0 {
                (self.event_handler)(Event::OpenTagStart, 0);
            }
            if grapheme == ">" {
                self.process_open_tag(false);
            } else if grapheme == "/" {
                self.state = State::OpenTagSlash;
            } else {
                self.state = State::Attrib;
            }
        }
    }

    fn begin_white_space(&mut self, grapheme: &str) {
        if grapheme == "<" {
            self.new_tag();
        }
    }

    fn text(&mut self, grapheme: &str) {
        let tag_ended = grapheme == "<";
        match self.current_text {
            Some(ref mut tx) => {
                if tag_ended {
                    tx.end = (self.line, self.character - 1);
                } else {
                    tx.value.push_str(grapheme);
                }
            }
            None => {}
        };

        if tag_ended {
            let text = mem::replace(&mut self.current_text, None).unwrap();
            RefCell::borrow_mut(&self.current_tag).text_nodes.push(text);
            (self.event_handler)(Event::Text, 0);
            self.new_tag();
        } else {
            self.write_text(grapheme);
        }
    }

    fn maybe_text(&mut self, grapheme: &str) {
        if grapheme != "<" {
            self.state = State::Text;
            if self.events & Event::Text as u32 != 0 {
                let mut text = Text::new((self.line, self.character));
                text.value.push_str(grapheme);
                self.current_text = Some(text);
            }
        } else {
            self.text(grapheme);
        }
    }

    fn sgml_decl(&mut self, grapheme: &str) {
        let is_sgml_char = match &self.sgml_decl as &str {
            "[CDATA[" => {
                self.state = State::Cdata;
                if self.events & Event::Cdata as u32 != 0 {
                    let mut cdata = Text::new((self.line, self.character - 8));
                    cdata.value.push_str(grapheme);
                    self.current_text = Some(cdata);
                } else {
                    self.current_text = None;
                }
                false
            }
            "--" => {
                self.state = State::Comment;
                if self.events & Event::Comment as u32 != 0 {
                    let mut comment = Text::new((self.line, self.character - 4));
                    comment.value.push_str(grapheme);
                    self.current_text = Some(comment);
                } else {
                    self.current_text = None;
                }

                false
            }
            "DOCTYPE" => {
                self.state = State::Doctype;
                if self.events as u32 & Event::Doctype as u32 != 0 {
                    self.current_text = Some(Text::new((self.line, self.character - 8)));
                } else {
                    self.current_text = None;
                }

                false
            }
            _ => true,
        };

        if grapheme == ">" {
            if self.events & Event::SGMLDeclaration as u32 != 0 {
                (self.event_handler)(Event::SGMLDeclaration, 0);
            }
            self.state = State::MaybeText;
            return;
        }

        if is_sgml_char {
            self.sgml_decl.push_str(grapheme);
        } else {
            self.sgml_decl = String::new();
        }

        if SAXParser::is_quote(grapheme) {
            self.state = State::SgmlDeclQuoted;
        }
    }

    fn sgml_quoted(&mut self, grapheme: &str) {
        if grapheme.as_bytes()[0] == self.quote {
            self.quote = 0;
            self.state = State::SgmlDecl;
        }
        self.sgml_decl.push_str(grapheme);
    }

    fn doctype(&mut self, grapheme: &str) {
        if grapheme == ">" {
            self.state = State::MaybeText;
            if self.current_text.is_some() {
                let mut doctype = mem::replace(&mut self.current_text, None).unwrap();
                doctype.end = (self.line, self.character - 1);
                self.texts.push(doctype);
                (self.event_handler)(Event::Doctype, self.texts.len() - 1);
            }
            return;
        }
        self.write_text(grapheme);
        if grapheme == "]" {
            self.state = State::DoctypeDtd;
        } else if SAXParser::is_quote(grapheme) {
            self.state = State::DoctypeQuoted;
            self.quote = grapheme.as_bytes()[0];
        }
    }

    fn doctype_quoted(&mut self, grapheme: &str) {
        self.write_text(grapheme);
        if grapheme.as_bytes()[0] == self.quote {
            self.quote = 0;
            self.state = State::Doctype;
        }
    }

    fn doctype_dtd(&mut self, grapheme: &str) {
        self.write_text(grapheme);
        if grapheme == "]" {
            self.state = State::Doctype;
        } else if SAXParser::is_quote(grapheme) {
            self.state = State::DoctypeDtdQuoted;
            self.quote = grapheme.as_bytes()[0];
        }
    }

    fn doctype_dtd_quoted(&mut self, grapheme: &str) {
        self.write_text(grapheme);
        if self.quote == grapheme.as_bytes()[0] {
            self.state = State::DoctypeDtd;
            self.quote = 0;
        }
    }

    fn comment(&mut self, grapheme: &str) {
        if grapheme == "-" {
            self.state = State::CommentEnding;
            return;
        }
        self.write_text(grapheme);
    }

    fn comment_ending(&mut self, grapheme: &str) {
        if grapheme == "-" {
            self.state = State::CommentEnded;
            if self.current_text.is_some() {
                self.current_text.as_mut().unwrap().end = (self.line, self.character - 1);
                (self.event_handler)(Event::Comment, 0);
            }
        } else {
            self.write_text("-");
            self.write_text(grapheme);
            self.state = State::Comment;
        }
    }

    fn comment_ended(&mut self, grapheme: &str) {
        if grapheme == ">" {
            self.state = State::BeginWhitespace;
            self.write_text("-->");
            let text = mem::replace(&mut self.current_text, None);
            match text {
                Some(tx) => {
                    self.texts.push(tx);
                    (self.event_handler)(Event::Comment, 0);
                }
                None => {}
            }
        } else {
            self.state = State::MaybeText;
        }
    }

    fn cdata(&mut self, grapheme: &str) {
        if grapheme == "]" {
            self.state = State::CdataEnding;
        } else {
            self.write_text(grapheme);
        }
    }

    fn cdata_ending(&mut self, grapheme: &str) {
        if grapheme == "]" {
            self.state = State::CdataEnding2;
        } else {
            self.state = State::Cdata;
            self.write_text(grapheme);
        }
    }

    fn cdata_ending_2(&mut self, grapheme: &str) {
        match self.current_text {
            Some(ref mut tx) => {
                if grapheme == ">" && tx.value.len() != 0 {
                    self.state = State::MaybeText;
                    if self.events & Event::Cdata as u32 != 0 {
                        tx.end = (self.line, self.character - 1);
                        (self.event_handler)(Event::Cdata, 0);
                    }
                    return;
                } else if grapheme == "]" {
                    tx.value.push_str(grapheme);
                } else {
                    tx.value.push_str("]]");
                    tx.value.push_str(grapheme);
                    self.state = State::Cdata;
                }
            }
            None => {}
        }
    }

    fn proc_inst(&mut self, grapheme: &str) {
        if grapheme == "?" {
            self.state = State::ProcInstEnding;
            return;
        }
        match self.current_proc_inst {
            Some(ref mut p) => {
                if SAXParser::is_whitespace(grapheme) {
                    p.target.end = (self.line, self.character - 1);
                    self.state = State::ProcInstValue;
                } else {
                    p.target.value.push_str(grapheme);
                }
            }
            None => {}
        }
    }

    fn proc_inst_value(&mut self, grapheme: &str) {
        match self.current_proc_inst {
            Some(ref mut p) => {
                let is_whitespace = SAXParser::is_whitespace(grapheme);
                if p.content.value.len() == 0 && !is_whitespace {
                    p.content.start = (self.line, self.character - 1);
                }
                if grapheme == "?" {
                    self.state = State::ProcInstEnding;
                    p.content.end = (self.line, self.character - 1);
                } else if !is_whitespace {
                    p.content.value.push_str(grapheme);
                }
            }
            None => {
                if grapheme == "?" {
                    self.state = State::ProcInstEnding;
                }
            }
        }
    }

    fn proc_inst_ending(&mut self, grapheme: &str) {
        if grapheme == ">" && self.current_proc_inst.is_some() {
            self.state = State::MaybeText;
            let mut proc_inst = mem::replace(&mut self.current_proc_inst, None).unwrap();
            proc_inst.end = (self.line, self.character);
            self.proc_insts.push(proc_inst);

            (self.event_handler)(Event::ProcessingInstruction, 0);
            return;
        }

        match self.current_proc_inst {
            Some(ref mut p) => {
                p.content.value.push_str("?");
                p.content.value.push_str(grapheme);
                self.state = State::ProcInstValue;
            }
            None => {
                if grapheme == ">" {
                    self.state = State::MaybeText;
                } else {
                    self.state = State::ProcInstValue;
                }
            }
        }
    }

    fn open_tag_slash(&mut self, grapheme: &str) {
        if grapheme == ">" {
            self.process_open_tag(true);
            self.process_close_tag();
        } else {
            self.state = State::Attrib;
        }
    }

    fn attribute(&mut self, grapheme: &str) {
        if grapheme == ">" {
            self.process_open_tag(false);
        } else if grapheme == "/" {
            self.state = State::OpenTagSlash;
        } else if !SAXParser::is_whitespace(grapheme) {
            match self.current_attr {
                Some(ref mut a) => {
                    a.name.value.push_str(grapheme);
                    a.name.start = (self.line, self.character - 1);
                    self.state = State::AttribName;
                }
                None => {}
            }
        }
    }

    fn attribute_name(&mut self, grapheme: &str) {
        if grapheme == ">" {
            self.process_attribute();
            self.process_open_tag(false);
            return;
        }

        match self.current_attr {
            Some(ref mut a) => {
                if grapheme == "=" {
                    self.state = State::AttribValue;
                    a.name.end = (self.line, self.character - 1);
                } else if SAXParser::is_whitespace(grapheme) {
                    self.state = State::AttribNameSawWhite;
                    a.name.end = (self.line, self.character - 1);
                } else {
                    a.name.value.push_str(grapheme);
                }
            }
            None => {}
        }
    }

    fn attribute_name_saw_white(&mut self, grapheme: &str) {
        if grapheme == "=" {
            self.state = State::AttribValue;
        } else if grapheme == "/" {
            self.process_attribute();
            self.state = State::OpenTagSlash;
        } else if grapheme == ">" {
            self.process_attribute();
            self.process_open_tag(false);
        } else if !SAXParser::is_whitespace(grapheme) {
            self.process_attribute();
            match self.current_attr {
                Some(ref mut a) => {
                    self.state = State::AttribName;
                    a.name.value = grapheme.to_string();
                    a.name.start = (self.line, self.character - 1);
                }
                None => {}
            }
        }
    }

    fn attribute_value(&mut self, grapheme: &str) {
        if SAXParser::is_quote(grapheme) {
            self.quote = grapheme.as_bytes()[0];
            self.state = State::AttribValueQuoted;
        } else if grapheme == "{" {
            self.state = State::JSXAttributeExpression;
            self.brace_ct += 1;
        } else {
            match self.current_attr {
                Some(ref mut a) => {
                    a.value.start = (self.line, self.character);
                    if !SAXParser::is_whitespace(grapheme) {
                        self.state = State::AttribValueUnquoted;
                        a.value.value.push_str(grapheme);
                    }
                }
                None => {}
            }
        }
    }

    fn attribute_value_quoted(&mut self, grapheme: &str) {
        match self.current_attr {
            Some(ref mut a) => {
                if grapheme.as_bytes()[0] != self.quote {
                    a.value.value.push_str(grapheme);
                } else {
                    a.value.end = (self.line, self.character - 1);
                    self.quote = 0;
                    self.state = State::AttribValueClosed;
                }
            }
            None => {}
        };

        if self.state == State::AttribValueClosed {
            self.process_attribute();
        }
    }

    fn attribute_value_closed(&mut self, grapheme: &str) {
        if SAXParser::is_whitespace(grapheme) {
            self.state = State::Attrib;
        } else if grapheme == ">" {
            self.process_open_tag(false);
        } else if grapheme == "/" {
            self.state = State::OpenTagSlash;
        } else {
            match self.current_attr {
                Some(ref mut a) => {
                    a.name.value.push_str(grapheme);
                }
                None => {}
            }
            self.state = State::AttribName;
        }
    }

    fn attribute_value_unquoted(&mut self, grapheme: &str) {
        if SAXParser::is_whitespace(grapheme) {
            return;
        }
        let has_closed = match self.current_attr {
            Some(ref mut a) => {
                let is_end_char = grapheme == ">";
                if !is_end_char {
                    a.value.value.push_str(grapheme);
                } else {
                    a.value.end = (self.line, self.character - 1);
                }
                is_end_char
            }
            None => false,
        };

        if has_closed {
            self.process_attribute();
        }

        if grapheme == ">" {
            self.process_open_tag(false);
        } else {
            self.state = State::Attrib;
        }
    }

    fn close_tag(&mut self, grapheme: &str) {
        if grapheme == ">" {
            // Weird </> tag
            let len = self.tags.len();
            let teg_name_empty = self.tags.last().unwrap().borrow().name.is_empty();
            if self.close_tag_name.is_empty() && (len == 0 || !teg_name_empty) {
                self.process_open_tag(true);
            }
            self.process_close_tag();
        } else if is_name_char(grapheme) {
            self.close_tag_name.push_str(grapheme);
        } else {
            self.state = State::CloseTagSawWhite;
        }
    }

    fn close_tag_saw_white(&mut self, grapheme: &str) {
        if !SAXParser::is_whitespace(grapheme) {
            if grapheme == ">" {
                self.process_close_tag();
            }
        }
    }

    fn is_whitespace(grapheme: &str) -> bool {
        grapheme == " " || grapheme == "\n" || grapheme == "\t" || grapheme == "\r"
    }

    fn is_quote(grapheme: &str) -> bool {
        grapheme == "\"" || grapheme == "'"
    }

    fn process_attribute(&mut self) {
        let new_attr = if self.events & Event::Attribute as u32 != 0 {
            Some(Attribute::new())
        } else {
            None
        };
        let attr = mem::replace(&mut self.current_attr, new_attr);
        match attr {
            Some(a) => {
                RefCell::borrow_mut(&self.current_tag).attributes.push(a);
                (self.event_handler)(Event::Attribute, 0);
            }
            None => {}
        }
    }

    fn process_open_tag(&mut self, self_closing: bool) {
        self.tags.push(Arc::clone(&self.current_tag));
        {
            let mut tag = RefCell::borrow_mut(&self.current_tag);
            tag.self_closing = self_closing;
            tag.open_end = (self.line, self.character);
        }
        if self.events & Event::OpenTag as u32 != 0 {
            (self.event_handler)(Event::OpenTag, self.tags.len() - 1);
        }
        if !self_closing {
            self.state = State::MaybeText;
        }
    }

    fn process_close_tag(&mut self) {
        self.state = State::MaybeText;
        let mut tags_len = self.tags.len();
        {
            let mut current_tag = RefCell::borrow_mut(&self.current_tag);
            let mut close_tag_name = mem::replace(&mut self.close_tag_name, String::new());
            let mut found = false;
            if close_tag_name.is_empty() && current_tag.self_closing {
                close_tag_name = current_tag.name.clone();
            }
            while tags_len != 0 {
                tags_len -= 1;
                let mut tag = RefCell::borrow_mut(&self.tags[tags_len]);
                if tag.name == close_tag_name {
                    tag.close_start = current_tag.open_start;
                    tag.close_end = (self.line, self.character);
                    found = true;
                    break;
                }
            }
            if !found {
                let mut text = Text::new(current_tag.open_start);
                text.start = current_tag.open_start;
                text.value.push_str("</");
                text.value.push_str(&close_tag_name);
                text.value.push_str(">");
                current_tag.text_nodes.push(text);
                return;
            }
        }

        let mut len = self.tags.len();
        // if self.events & Event::CloseTag as u32 == 0 {
        //     let idx = len - tags_len;
        //     if idx > 1 {
        //         self.tags.truncate(idx);
        //         return;
        //     }
        //
        //     self.tag = self.tags.remove(tags_len);
        //     return;
        // }

        while len > tags_len {
            len -= 1;
            let mut tag = RefCell::borrow_mut(&self.tags[len]);
            tag.close_end = (self.line, self.character);
            (self.event_handler)(Event::CloseTag, 0);
        }
    }

    fn jsx_attribute_expression(&mut self, grapheme: &str) {
        if grapheme == "}" {
            self.brace_ct -= 1;
        } else if grapheme == "{" {
            self.brace_ct += 1;
        }
        match self.current_attr {
            Some(ref mut a) => {
                if self.brace_ct == 0 {
                    a.value.end = (self.line, self.character - 1);
                    self.process_attribute();
                    self.state = State::AttribValueClosed;
                } else {
                    a.value.value.push_str(grapheme);
                }
            }
            None => {
                if self.brace_ct == 0 {
                    self.state = State::AttribValueClosed;
                }
            }
        }
    }

    fn write_text(&mut self, grapheme: &str) {
        match self.current_text {
            Some(ref mut t) => t.value.push_str(grapheme),
            None => {}
        }
    }

    fn new_tag(&mut self) {
        self.current_tag = Arc::new(RefCell::new(Tag::new((self.line, self.character - 1))));
        self.state = State::OpenWaka;
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
    Begin,
    // leading whitespace
    BeginWhitespace,
    // Might be a text node but we're not sure yet
    MaybeText,
    // general stuff
    Text,
    // <
    OpenWaka,
    // <!blarg
    SgmlDecl,
    // <!blarg foo "bar
    SgmlDeclQuoted,
    // <!doctype
    Doctype,
    // <!doctype "//blah
    DoctypeQuoted,
    // <!doctype "//blah" [ ...
    DoctypeDtd,
    // <!doctype "//blah" [ "foo
    DoctypeDtdQuoted,
    // <!--
    Comment,
    // <!-- blah -
    CommentEnding,
    // <!-- blah --
    CommentEnded,
    // <![cdata[ something
    Cdata,
    // ]
    CdataEnding,
    // ]]
    CdataEnding2,
    // <?hi
    ProcInst,
    // <?hi there
    ProcInstValue,
    // <?hi "there" ?
    ProcInstEnding,
    // <strong
    OpenTag,
    // <strong /
    OpenTagSlash,
    // <a
    Attrib,
    // <a foo
    AttribName,
    // <a foo _
    AttribNameSawWhite,
    // <a foo=
    AttribValue,
    // <a foo="bar
    AttribValueQuoted,
    // <a foo="bar"
    AttribValueClosed,
    // <a foo=bar
    AttribValueUnquoted,
    // </a
    CloseTag,
    // </a   >
    CloseTagSawWhite,
    // props={() => {}}
    JSXAttributeExpression,
}

#[test]
fn test_trait() {
    let t = Arc::new(RefCell::new(Text::new((0, 0))));
    let a: Arc<RefCell<dyn Readable>> = Arc::clone(&t);
}
