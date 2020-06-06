use std::mem;
use std::str;

use sax::names::*;
use sax::tag::*;
use std::mem::transmute;

static BOM: &'static [u8; 3] = &[0xef, 0xbb, 0xbf];

pub struct SAXParser {
  pub events: u32,
  pub line: u32,
  pub character: u32,
  pub tags: Vec<Tag>,

  state: State,
  cdata: String,
  comment: String,
  doctype: String,
  text: Text,
  close_tag_name: String,
  proc_inst_body: String,
  proc_inst_name: String,
  quote: u8,
  sgml_decl: String,
  attribute: Attribute,
  tag: Tag,
  brace_ct: u32,

  event_handler: fn(u32, *const u8, usize),
  fragment: Vec<u8>,
}

impl SAXParser {
  pub fn new(event_handler: fn(u32, *const u8, usize)) -> SAXParser {
    SAXParser {
      event_handler,
      state: State::Begin,
      events: 0,
      line: 0,
      character: 0,
      tags: Vec::new(),

      cdata: String::new(),
      comment: String::new(),
      doctype: String::new(),
      close_tag_name: String::new(),
      proc_inst_name: String::new(),
      proc_inst_body: String::new(),
      quote: 0,
      sgml_decl: String::new(),
      tag: Tag::new((0, 0)),
      attribute: Attribute::new(),
      text: Text::new((0, 0)),
      brace_ct: 0,
      fragment: Vec::new(),
    }
  }

  pub fn write(&mut self, source: &[u8]) {
    let mut idx = 0;
    let len = source.len();
    let mut chunk = self.fragment.clone();
    chunk.extend_from_slice(source);

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
        let mut ct = len - idx;
        self.fragment.truncate(0);
        loop {
          self.fragment.push(chunk[ct]);
          ct += 1;
          if ct == len {
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
    self.attribute = Attribute::new();
  }

  fn process_grapheme(&mut self, grapheme: &str) {
    if grapheme == "\n" {
      self.line += 1;
      self.character = 0;
    } else {
      self.character += 1;
    }

    match self.state {
      State::Begin => { self.begin(grapheme) }
      State::OpenWaka => { self.open_waka(grapheme) }
      State::OpenTag => { self.open_tag(grapheme) }
      State::BeginWhitespace => { self.begin_white_space(grapheme) }
      State::Text => { self.text(grapheme) }
      State::SgmlDecl => { self.sgml_decl(grapheme) }
      State::SgmlDeclQuoted => { self.sgml_quoted(grapheme) }
      State::Doctype => { self.doctype(grapheme) }
      State::DoctypeQuoted => { self.doctype_quoted(grapheme) }
      State::DoctypeDtd => { self.doctype_dtd(grapheme) }
      State::DoctypeDtdQuoted => { self.doctype_dtd_quoted(grapheme) }
//    State::CommentStarting => {None}
      State::Comment => { self.comment(grapheme) }
      State::CommentEnding => { self.comment_ending(grapheme) }
      State::CommentEnded => { self.comment_ended(grapheme) }
      State::Cdata => { self.cdata(grapheme) }
      State::CdataEnding => { self.cdata_ending(grapheme) }
      State::CdataEnding2 => { self.cdata_ending_2(grapheme) }
      State::ProcInst => { self.proc_inst(grapheme) }
      State::ProcInstBody => { self.proc_inst_body(grapheme) }
      State::ProcInstEnding => { self.proc_inst_ending(grapheme) }
      State::OpenTagSlash => { self.open_tag_slash(grapheme) }
      State::Attrib => { self.attribute(grapheme) }
      State::AttribName => { self.attribute_name(grapheme) }
      State::AttribNameSawWhite => { self.attribute_name_saw_white(grapheme) }
      State::AttribValue => { self.attribute_value(grapheme) }
      State::AttribValueQuoted => { self.attribute_value_quoted(grapheme) }
      State::AttribValueClosed => { self.attribute_value_closed(grapheme) }
      State::AttribValueUnquoted => { self.attribute_value_unquoted(grapheme) }
      State::CloseTag => { self.close_tag(grapheme) }
      State::CloseTagSawWhite => { self.close_tag_saw_white(grapheme) }
      State::JSXAttributeExpression => { self.jsx_attribute_expression(grapheme) }
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
      self.tag.name = grapheme.to_string();
      return;
    }

    match grapheme {
      "!" => {
        self.state = State::SgmlDecl;
        self.sgml_decl = String::new();
      }

      "/" => {
        self.state = State::CloseTag;
        self.close_tag_name = String::new();
      }

      "?" => {
        self.state = State::ProcInst;
        self.proc_inst_body = String::new();
        self.proc_inst_name = String::new();
      }

      ">" => {
        self.open_tag(grapheme); // JSX fragment
      }

      _ => {
        self.new_text();
        self.write_text("<");
        self.write_text(grapheme);
      }
    }
  }

  fn open_tag(&mut self, grapheme: &str) {
    if is_name_char(grapheme) {
      self.tag.name.push_str(grapheme);
    } else {
      if self.events & Event::OpenTagStart as u32 != 0 {
        let v = self.tag.encode();
        (self.event_handler)(Event::OpenTagStart as u32, v.as_ptr(), v.len());
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
    } else {
      self.new_text();
      self.write_text(grapheme);
    }
  }

  fn text(&mut self, grapheme: &str) {
    if grapheme != "<" {
      self.write_text(grapheme);
    } else {
      if !self.text.value.is_empty() {
        let len = self.tags.len();
        // Store these only if we're interested in CloseTag events
        if len != 0 && self.events & Event::CloseTag as u32 != 0 {
          self.tags[len - 1].text_nodes.push(self.text.clone());
        }
        if self.events & Event::Text as u32 != 0 {
          self.text.end = (self.line, self.character - 1);
          let v = self.text.encode();
          (self.event_handler)(Event::Text as u32, v.as_ptr(), v.len());
        }
      }
      self.new_tag();
    }
  }

  fn sgml_decl(&mut self, grapheme: &str) {
    self.sgml_decl.push_str(grapheme);
    if &self.sgml_decl == "[CDATA[" {
      self.state = State::Cdata;
      self.cdata = String::new();
      if self.events & Event::OpenCDATA as u32 != 0 {
        let mut v = Vec::new();
        unsafe {
          v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.line));
          v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.character - 7));
        }
        (self.event_handler)(Event::OpenCDATA as u32, v.as_ptr(), v.len());
      }
    } else if &self.sgml_decl == "--" {
      self.state = State::Comment;
      self.sgml_decl = String::new();
    } else if &self.sgml_decl == "DOCTYPE" {
      self.state = State::Doctype;
      if self.doctype.len() != 0 {
        self.doctype = String::new();
        self.sgml_decl = String::new();
      }
    } else if grapheme == ">" {
      let sgml_decl = mem::replace(&mut self.sgml_decl, String::new());
      if self.events & Event::SGMLDeclaration as u32 != 0 {
        (self.event_handler)(Event::SGMLDeclaration as u32, sgml_decl.as_ptr(), sgml_decl.len());
      }
      self.new_text();
      return;
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
      self.new_text();
      if self.events & Event::Doctype as u32 != 0 {
        (self.event_handler)(Event::Doctype as u32, self.doctype.as_ptr(), self.doctype.len());
      }
      return;
    }
    self.doctype.push_str(grapheme);
    if grapheme == "]" {
      self.state = State::DoctypeDtd;
    } else if SAXParser::is_quote(grapheme) {
      self.state = State::DoctypeQuoted;
      self.quote = grapheme.as_bytes()[0];
    }
  }

  fn doctype_quoted(&mut self, grapheme: &str) {
    self.doctype.push_str(grapheme);
    if grapheme.as_bytes()[0] == self.quote {
      self.quote = 0;
      self.state = State::Doctype;
    }
  }

  fn doctype_dtd(&mut self, grapheme: &str) {
    self.doctype.push_str(grapheme);
    if grapheme == "]" {
      self.state = State::Doctype;
    } else if SAXParser::is_quote(grapheme) {
      self.state = State::DoctypeDtdQuoted;
      self.quote = grapheme.as_bytes()[0];
    }
  }

  fn doctype_dtd_quoted(&mut self, grapheme: &str) {
    self.doctype.push_str(grapheme);
    if self.quote == grapheme.as_bytes()[0] {
      self.state = State::DoctypeDtd;
      self.quote = 0;
    }
  }

  fn comment(&mut self, grapheme: &str) {
    if grapheme == "-" {
      self.state = State::CommentEnding;
    } else if self.events & Event::Comment as u32 != 0 {
      self.comment.push_str(grapheme);
    }
  }

  fn comment_ending(&mut self, grapheme: &str) {
    if grapheme == "-" {
      self.state = State::CommentEnded;
      if self.events & Event::Comment as u32 != 0 {
        (self.event_handler)(Event::Comment as u32, self.comment.as_ptr(), self.comment.len());
      }
    } else {
      if self.events & Event::Comment as u32 != 0 {
        self.comment.push('-');
        self.comment.push_str(grapheme);
      }
      self.state = State::Comment;
    }
  }

  fn comment_ended(&mut self, grapheme: &str) {
    if grapheme == ">" {
      if self.events & Event::Comment as u32 != 0 {
        self.comment.push_str("--");
        self.comment.push_str(grapheme);
      }
      self.state = State::BeginWhitespace;
    } else {
      self.new_text();
    }
  }

  fn cdata(&mut self, grapheme: &str) {
    if grapheme == "]" {
      self.state = State::CdataEnding;
    } else {
      self.cdata.push_str(grapheme);
    }
  }

  fn cdata_ending(&mut self, grapheme: &str) {
    if grapheme == "]" {
      self.state = State::CdataEnding2;
    } else {
      self.state = State::Cdata;
      self.cdata.push_str(grapheme);
    }
  }

  fn cdata_ending_2(&mut self, grapheme: &str) {
    if grapheme == ">" && self.cdata.len() != 0 {
      self.new_text();
      if self.events & Event::Cdata as u32 != 0 {
        (self.event_handler)(Event::Cdata as u32, self.cdata.as_ptr(), self.cdata.len());
      }
      if self.events & Event::CloseCDATA as u32 != 0 {
        let mut v = Vec::new();
        unsafe {
          v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.line));
          v.extend_from_slice(&transmute::<u32, [u8; 4]>(self.character));
        }
        (self.event_handler)(Event::CloseCDATA as u32, v.as_ptr(), v.len());
      }
      return;
    } else if grapheme == "]" {
      self.cdata.push_str(grapheme);
    } else {
      self.cdata.push_str("]]");
      self.cdata.push_str(grapheme);
      self.state = State::Cdata;
    }
  }

  fn proc_inst(&mut self, grapheme: &str) {
    if grapheme == "?" {
      self.state = State::ProcInstEnding;
    } else if SAXParser::is_whitespace(grapheme) {
      self.state = State::ProcInstBody;
    } else {
      self.proc_inst_name.push_str(grapheme);
    }
  }

  fn proc_inst_body(&mut self, grapheme: &str) {
    if self.proc_inst_body.len() == 0 && SAXParser::is_whitespace(grapheme) {
      return;
    } else if grapheme == "?" {
      self.state = State::ProcInstEnding;
    } else {
      self.proc_inst_body.push_str(grapheme);
    }
  }

  fn proc_inst_ending(&mut self, grapheme: &str) {
    if grapheme == ">" {
      self.new_text();
      if self.events & Event::ProcessingInstruction as u32 != 0 {
        (self.event_handler)(Event::ProcessingInstruction as u32, self.proc_inst_body.as_ptr(), self.proc_inst_body.len());
      }
    } else {
      self.proc_inst_body.push_str("?");
      self.proc_inst_body.push_str(grapheme);
      self.state = State::ProcInstBody;
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
    if SAXParser::is_whitespace(grapheme) {
      return;
    }
    if grapheme == ">" {
      self.process_open_tag(false);
    } else if grapheme == "/" {
      self.state = State::OpenTagSlash;
    } else if is_name_start_char(grapheme) {
      self.attribute.name = grapheme.to_string();
      self.attribute.name_start = (self.line, self.character - 1);
      self.state = State::AttribName;
    }
  }

  fn attribute_name(&mut self, grapheme: &str) {
    if grapheme == "=" {
      self.attribute.name_end = (self.line, self.character - 1);
      self.state = State::AttribValue;
    } else if grapheme == ">" {
      self.process_attribute();
      self.process_open_tag(false);
    } else if SAXParser::is_whitespace(grapheme) {
      self.state = State::AttribNameSawWhite;
      self.attribute.name_end = (self.line, self.character - 1);
    } else if is_name_char(grapheme) {
      self.attribute.name.push_str(grapheme);
    }
  }

  fn attribute_name_saw_white(&mut self, grapheme: &str) {
    if SAXParser::is_whitespace(grapheme) {
      return;
    }
    if grapheme == "=" {
      self.state = State::AttribValue;
      self.attribute.name_end = (self.line, self.character - 1);
    } else {
      if grapheme == ">" {
        self.process_attribute();
        self.process_open_tag(false);
      } else if is_name_start_char(grapheme) {
        self.process_attribute(); // new Attribute struct created
        self.attribute.name = grapheme.to_string();
        self.attribute.name_start = (self.line, self.character - 1);
        self.state = State::AttribName;
      } else {
        self.state = State::Attrib;
      }
    }
  }

  fn attribute_value(&mut self, grapheme: &str) {
    if SAXParser::is_whitespace(grapheme) {
      return;
    }
    self.attribute.value_start = (self.line, self.character);
    if SAXParser::is_quote(grapheme) {
      self.quote = grapheme.as_bytes()[0];
      self.state = State::AttribValueQuoted;
    } else if grapheme == "{" {
      self.state = State::JSXAttributeExpression;
      self.brace_ct += 1;
    } else {
      self.state = State::AttribValueUnquoted;
      self.attribute.value.push_str(grapheme);
    }
  }

  fn attribute_value_quoted(&mut self, grapheme: &str) {
    if grapheme.as_bytes()[0] != self.quote {
      self.attribute.value.push_str(grapheme);
    } else {
      self.attribute.value_end = (self.line, self.character - 1);
      self.process_attribute();
      self.quote = 0;
      self.state = State::AttribValueClosed;
    }
  }

  fn attribute_value_closed(&mut self, grapheme: &str) {
    if SAXParser::is_whitespace(grapheme) {
      self.state = State::Attrib;
    } else if grapheme == ">" {
      self.process_open_tag(false);
    } else if grapheme == "/" {
      self.state = State::OpenTagSlash;
    } else if is_name_start_char(grapheme) {
      self.attribute.name = grapheme.to_string();
      self.state = State::AttribName;
    }
  }

  fn attribute_value_unquoted(&mut self, grapheme: &str) {
    if grapheme != ">" && !SAXParser::is_whitespace(grapheme) {
      self.attribute.value.push_str(grapheme);
      return;
    } else {
      self.attribute.value_end = (self.line, self.character - 1);
      self.process_attribute();
      if grapheme == ">" {
        self.process_open_tag(false);
      } else {
        self.state = State::Attrib;
      }
    }
  }

  fn close_tag(&mut self, grapheme: &str) {
    if grapheme == ">" {
      // Weird </> tag
      let len = self.tags.len();
      if self.close_tag_name.is_empty() && (len == 0 || !self.tags[len - 1].name.is_empty()) {
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
    let attr = mem::replace(&mut self.attribute, Attribute::new());
    if self.events & Event::Attribute as u32 != 0 {
      let v = attr.encode();
      (self.event_handler)(Event::Attribute as u32, v.as_ptr(), v.len());
    }
    // Store them only if we're interested in Open and Close tag events
    if self.events & Event::Attribute as u32 != 0 || self.events & Event::CloseTag as u32 != 0 {
      self.tag.attributes.push(attr);
    }
  }

  fn process_open_tag(&mut self, self_closing: bool) {
    self.tag.self_closing = self_closing;
    self.tag.open_end = (self.line, self.character);
    self.tags.push(self.tag.clone());
    if self.events & Event::OpenTag as u32 != 0 {
      let v = self.tag.encode();
      (self.event_handler)(Event::OpenTag as u32, v.as_ptr(), v.len());
    }
    if !self_closing {
      self.new_text();
    }
  }

  fn process_close_tag(&mut self) {
    self.new_text();
    let mut tags_len = self.tags.len();
    {
      let mut close_tag_name = mem::replace(&mut self.close_tag_name, String::new());
      let mut found = false;
      if close_tag_name.is_empty() && self.tag.self_closing {
        close_tag_name = self.tag.name.clone();
      }
      while tags_len != 0 {
        tags_len -= 1;
        let tag = &mut self.tags[tags_len];
        if tag.name == close_tag_name {
          tag.close_start = self.tag.open_start;
          tag.close_end = (self.line, self.character);
          found = true;
          break;
        }
      }
      if !found {
        self.write_text("</");
        self.write_text(&close_tag_name);
        self.write_text(">");
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
      self.tag = self.tags.remove(len);
      self.tag.close_end = (self.line, self.character);
      let v = self.tag.encode();
      (self.event_handler)(Event::CloseTag as u32, v.as_ptr(), v.len());
    }
  }

  fn jsx_attribute_expression(&mut self, grapheme: &str) {
    if grapheme == "}" {
      self.brace_ct -= 1;
    } else if grapheme == "{" {
      self.brace_ct += 1;
    }
    if self.brace_ct == 0 {
      self.attribute.value_end = (self.line, self.character - 1);
      self.process_attribute();
      self.state = State::AttribValueClosed;
    } else {
      self.attribute.value.push_str(grapheme);
    }
  }

  fn new_tag(&mut self) {
    self.tag = Tag::new((self.line, self.character - 1));
    self.state = State::OpenWaka;
  }

  fn new_text(&mut self) {
    if self.events & Event::Text as u32 != 0 || self.events & Event::CloseTag as u32 != 0 {
      self.text = Text::new((self.line, self.character));
    }
    self.state = State::Text;
  }

  fn write_text(&mut self, grapheme: &str) {
    if self.events & Event::Text as u32 == 0 && self.events & Event::CloseTag as u32 == 0 {
      return;
    }
    self.text.value.push_str(grapheme);
  }
}

#[derive(PartialEq)]
#[derive(Clone, Copy)]
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
  OpenCDATA = 0b1000000000,
  // 1024
  Cdata = 0b10000000000,
  // 2048
  CloseCDATA = 0b100000000000,
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
  OpenWaka = 4,
  // <!blarg
  SgmlDecl = 5,
  // <!blarg foo "bar
  SgmlDeclQuoted = 6,
  // <!doctype
  Doctype = 7,
  // <!doctype "//blah
  DoctypeQuoted = 8,
  // <!doctype "//blah" [ ...
  DoctypeDtd = 9,
  // <!doctype "//blah" [ "foo
  DoctypeDtdQuoted = 10,
  // <!-
  // CommentStarting =       11,
  // <!--
  Comment = 12,
  // <!-- blah -
  CommentEnding = 13,
  // <!-- blah --
  CommentEnded = 14,
  // <![cdata[ something
  Cdata = 15,
  // ]
  CdataEnding = 16,
  // ]]
  CdataEnding2 = 17,
  // <?hi
  ProcInst = 18,
  // <?hi there
  ProcInstBody = 19,
  // <?hi "there" ?
  ProcInstEnding = 20,
  // <strong
  OpenTag = 21,
  // <strong /
  OpenTagSlash = 22,
  // <a
  Attrib = 23,
  // <a foo
  AttribName = 24,
  // <a foo _
  AttribNameSawWhite = 25,
  // <a foo=
  AttribValue = 26,
  // <a foo="bar
  AttribValueQuoted = 27,
  // <a foo="bar"
  AttribValueClosed = 28,
  // <a foo=bar
  AttribValueUnquoted = 29,
  // </a
  CloseTag = 30,
  // </a   >
  CloseTagSawWhite = 31,
  // props={() => {}}
  JSXAttributeExpression = 32,
}
