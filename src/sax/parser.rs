use sax::entities::*;
use sax::names::*;
use sax::json_utils::*;
use sax::tag::Tag;
use std::str;

static BOM: &'static [u8; 3] = &[0xef, 0xbb, 0xbf];

pub struct SAXParser<'a> {
  pub events: u32,
  pub line: u32,
  pub character: u32,
  pub tags: Vec<Tag>,

  state: State,
  saw_root: bool,
  closed_root: bool,
  attribute_name: String,
  cdata: String,
  comment: String,
  doctype: String,
  entity: String,
  text: String,
  close_tag_name: String,
  proc_inst_body: String,
  proc_inst_name: String,
  quote: &'a str,
  sgml_decl: String,
  tag: Tag,
  brace_ct: u32,
  tag_start: (u32, u32),

  event_handler: fn(u32, *const u8, usize),
}

impl<'a> SAXParser<'a> {
  pub fn new(event_handler: fn(u32, *const u8, usize)) -> SAXParser<'a> {
    SAXParser {
      event_handler,
      state: State::Begin,
      events: 0,
      line: 0,
      character: 0,
      tags: Vec::new(),

      saw_root: false,
      closed_root: false,
      attribute_name: "".to_string(),
      cdata: "".to_string(),
      comment: "".to_string(),
      doctype: "".to_string(),
      entity: "".to_string(),
      text: "".to_string(),
      close_tag_name: "".to_string(),
      proc_inst_name: "".to_string(),
      proc_inst_body: "".to_string(),
      quote: "",
      sgml_decl: "".to_string(),
      tag: Tag::new((0, 0)),
      brace_ct: 0,
      tag_start: (0, 0),
    }
  }

  pub fn write(&mut self, source: &'a [u8]) {
    let mut idx = 0;
    let len = source.len();
    while idx < len {
      let byte = source[idx];
      let mut bytes = 1;
      if ((byte & 0b10000000) >> 7) == 1 && ((byte & 0b1000000) >> 6) == 1 {
        bytes += 1;
      }
      if bytes == 2 && ((byte & 0b100000) >> 5) == 1 {
        bytes += 1;
      }
      if bytes == 3 && ((byte & 0b10000) >> 4) == 1 {
        bytes += 1;
      }
      let s = &source[idx..idx + bytes as usize];
      unsafe {
        let st = str::from_utf8_unchecked(s);
        self.process_grapheme(st);
      }
      idx += bytes as usize;
    }
  }

  fn process_grapheme(&mut self, grapheme: &'a str) {
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
      State::TextEntity => { self.entity(grapheme) }
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
      State::AttribValueEntityQ => { self.entity(grapheme) }
      State::AttribValueEntityU => { self.entity(grapheme) }
      State::CloseTag => { self.close_tag(grapheme) }
      State::CloseTagSawWhite => { self.close_tag_saw_white(grapheme) }
      State::JSXAttributeExpression => { self.jsx_attribute_expression(grapheme) }
    };
  }

  fn trigger_event(&self, event: Event, json: &String) {
    (self.event_handler)(event as u32, json.as_ptr(), json.len());
  }

  fn begin(&mut self, grapheme: &str) {
    self.state = State::BeginWhitespace;
    // BOM
    if grapheme.as_bytes() == BOM {
      return;
    }

    self.begin_white_space(grapheme)
  }

  fn open_waka(&mut self, grapheme: &str) {
    if SAXParser::is_whitespace(grapheme) {
      return;
    }

    if is_name_start_char(grapheme) {
      self.state = State::OpenTag;
      let mut tag = Tag::new(self.tag_start);
      tag.name = grapheme.to_string();
      self.tag = tag;
      return;
    }

    match grapheme.as_ref() {
      "!" => {
        self.state = State::SgmlDecl;
        self.sgml_decl = "".to_string();
      }

      "/" => {
        self.state = State::CloseTag;
        self.close_tag_name = "".to_string();
      }

      "?" => {
        self.state = State::ProcInst;
        self.proc_inst_body = "".to_string();
        self.proc_inst_name = "".to_string();
      }

      ">" => {
        self.open_tag(grapheme); // JSX fragment
      }

      _ => {
        self.state = State::Text;
        self.text.push_str("<");
        self.text.push_str(grapheme);
      }
    }
  }

  fn open_tag(&mut self, grapheme: &str) {
    if is_name_char(grapheme) {
      self.tag.name.push_str(grapheme);
    } else {
      if self.events & Event::OpenTagStart as u32 != 0 {
        self.trigger_event(Event::OpenTagStart, &tag_to_json(&self.tag));
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
    } else if SAXParser::is_whitespace(grapheme) {
      self.state = State::Text;
      self.tag.text = grapheme.to_string();
    }
  }

  fn text(&mut self, grapheme: &str) {
    if self.saw_root && !self.closed_root && grapheme != "<" && grapheme != "&" {
      self.text.push_str(grapheme);
    } else if grapheme == "<" && !(self.saw_root && self.closed_root) {
      self.new_tag();
    } else if grapheme == "&" {
      self.state = State::TextEntity;
    }
  }

  fn sgml_decl(&mut self, grapheme: &str) {
    let mut sgml = self.sgml_decl.clone();
    sgml.push_str(grapheme);

    if sgml == "[CDATA[" {
      self.state = State::Cdata;
      self.sgml_decl = "".to_string();
      self.cdata = "".to_string();
      if self.events & Event::OpenCDATA as u32 != 0 {
        self.trigger_event(Event::OpenCDATA, &point_to_json(&(self.line - 7, self.character)));
      }
    } else if sgml == "--" {
      self.state = State::Comment;
      self.sgml_decl = "".to_string();
    } else if sgml == "DOCTYPE" {
      self.state = State::Doctype;
      if self.doctype.len() != 0 && self.saw_root {
        self.doctype = "".to_string();
        self.sgml_decl = "".to_string();
      }
    } else if grapheme == ">" {
      if self.events & Event::SGMLDeclaration as u32 != 0 {
        self.trigger_event(Event::SGMLDeclaration, &self.sgml_decl);
      }
      self.state = State::Text;
      self.sgml_decl = "".to_string();
      return;
    }
    if SAXParser::is_quote(grapheme) {
      self.state = State::SgmlDeclQuoted;
    }
    self.sgml_decl.push_str(grapheme);
  }

  fn sgml_quoted(&mut self, grapheme: &'a str) {
    if grapheme == self.quote {
      self.quote = "";
      self.state = State::SgmlDecl;
    }
    self.sgml_decl.push_str(grapheme);
  }

  fn doctype(&mut self, grapheme: &'a str) {
    if grapheme == ">" {
      self.state = State::Text;
      if self.events & Event::Doctype as u32 != 0 {
        self.trigger_event(Event::Doctype, &self.doctype);
      }
      return;
    }
    self.doctype.push_str(grapheme);
    if grapheme == "]" {
      self.state = State::DoctypeDtd;
    } else if SAXParser::is_quote(grapheme) {
      self.state = State::DoctypeQuoted;
      self.quote = grapheme;
    }
  }

  fn doctype_quoted(&mut self, grapheme: &'a str) {
    self.doctype.push_str(grapheme);
    if grapheme == self.quote {
      self.quote = "";
      self.state = State::Doctype;
    }
  }

  fn doctype_dtd(&mut self, grapheme: &'a str) {
    self.doctype.push_str(grapheme);
    if grapheme == "]" {
      self.state = State::Doctype;
    } else if SAXParser::is_quote(grapheme) {
      self.state = State::DoctypeDtdQuoted;
      self.quote = grapheme;
    }
  }

  fn doctype_dtd_quoted(&mut self, grapheme: &str) {
    self.doctype.push_str(grapheme);
    if self.quote == grapheme {
      self.state = State::DoctypeDtd;
      self.quote = "";
    }
  }

  fn comment(&mut self, grapheme: &str) {
    if grapheme == "-" {
      self.state = State::CommentEnding;
    } else {
      self.comment.push_str(grapheme);
    }
  }

  fn comment_ending(&mut self, grapheme: &str) {
    if grapheme == "-" {
      self.state = State::CommentEnded;
      if self.events & Event::Comment as u32 != 0 {
        self.trigger_event(Event::Comment, &self.comment);
      }
    } else {
      self.comment.push('-');
      self.comment.push_str(grapheme);
      self.state = State::Comment;
    }
  }

  fn comment_ended(&mut self, grapheme: &str) {
    if grapheme == ">" {
      self.comment.push_str("--");
      self.comment.push_str(grapheme);
      self.state = State::Comment;
    } else {
      self.state = State::Text;
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
      self.state = State::Text;
      if self.events & Event::Cdata as u32 != 0 {
        self.trigger_event(Event::Cdata, &self.cdata);
      }
      if self.events & Event::CloseCDATA as u32 != 0 {
        self.trigger_event(Event::CloseCDATA, &point_to_json(&(self.line, self.character)));
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
      self.state = State::Text;
      if self.events & Event::ProcessingInstruction as u32 != 0 {
        self.trigger_event(Event::ProcessingInstruction, &self.proc_inst_body);
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
      self.attribute_name = grapheme.to_string();
      self.state = State::AttribName;
    }
  }

  fn attribute_name(&mut self, grapheme: &str) {
    if grapheme == "=" {
      self.state = State::AttribValue;
      self.tag.set_attribute((self.attribute_name.clone(), "".to_string()));
    } else if grapheme == ">" {
      let attribute_name = self.attribute_name.clone();
      {
        // Attribute without a value or a boolean attribute
        self.tag.set_attribute((attribute_name.clone(), attribute_name));
      }
      self.process_open_tag(false);
    } else if SAXParser::is_whitespace(grapheme) {
      self.state = State::AttribNameSawWhite;
    } else if is_name_char(grapheme) {
      self.attribute_name.push_str(grapheme);
    }
  }

  fn attribute_name_saw_white(&mut self, grapheme: &str) {
    if SAXParser::is_whitespace(grapheme) {
      return;
    }
    if grapheme == "=" {
      self.state = State::AttribName;
    } else {
      let attribute_name = self.attribute_name.clone();
      {
        self.tag.set_attribute((attribute_name, "".to_string()));
      }
      if grapheme == ">" {
        self.process_open_tag(false);
      } else if is_name_start_char(grapheme) {
        self.state = State::AttribName;
        self.attribute_name = grapheme.to_string();
      } else {
        self.state = State::Attrib;
      }
    }
  }

  fn attribute_value(&mut self, grapheme: &'a str) {
    if SAXParser::is_whitespace(grapheme) {
      return;
    }
    if SAXParser::is_quote(grapheme) {
      self.quote = grapheme;
      self.state = State::AttribValueQuoted;
    } else if grapheme == "{" {
      self.state = State::JSXAttributeExpression;
      self.brace_ct += 1;
      self.push_attribute_value(grapheme);
    } else {
      self.state = State::AttribValueUnquoted;
      self.push_attribute_value(grapheme);
    }
  }

  fn attribute_value_quoted(&mut self, grapheme: &str) {
    if grapheme != self.quote {
      if grapheme == "&" {
        self.state = State::AttribValueEntityQ;
      } else {
        self.push_attribute_value(grapheme);
      }
    } else {
      self.process_attribute();
      self.quote = "";
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
      self.attribute_name = grapheme.to_string();
      self.state = State::AttribName;
    }
  }

  fn attribute_value_unquoted(&mut self, grapheme: &str) {
    if grapheme != ">" && !SAXParser::is_whitespace(grapheme) {
      if grapheme == "&" {
        self.state = State::AttribValueEntityQ;
      } else {
        self.push_attribute_value(grapheme);
      }
      return;
    } else {
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
      self.process_close_tag();
    } else if self.tag.name == "" {
      if SAXParser::is_whitespace(grapheme) {
        return;
      }
      if !is_name_start_char(grapheme) {
        self.tag.name = grapheme.to_string();
      }
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

  fn entity(&mut self, grapheme: &str) {
    let mut return_state = State::Text;
    let mut buffer = 0;
    if self.state == State::TextEntity {
      buffer = 1;
    } else if self.state == State::AttribValueEntityQ {
      return_state = State::AttribValueQuoted;
    } else if self.state == State::AttribValueEntityU {
      return_state = State::AttribValueUnquoted;
    }
    let mut value: Option<String> = None;
    if grapheme == ";" {
      let entity = parse_entity(&self.entity);
      if entity != "" {
        (self.event_handler)(2222, entity.as_ptr(), entity.len());
        value = Some(entity);
      } else {
        value = Some("&".to_string() + self.entity.as_ref() + ";");
      }
      self.state = return_state;
      self.entity = "".to_string();
    } else if (self.entity.len() > 0 && is_entity_body(grapheme)) || is_entity_start_char(grapheme) {
      self.entity.push_str(grapheme);
    } else {
      self.state = return_state;
      self.entity = "".to_string();
      value = Some("&".to_string() + self.entity.as_ref() + grapheme);
    }

    if value.is_some() {
      let s = value.unwrap();
      if buffer == 1 {
        self.text.push_str(s.as_ref());
      } else {
        self.push_attribute_value(s.as_ref());
      }
    }
  }

  fn is_whitespace(grapheme: &str) -> bool {
    grapheme == " " || grapheme == "\n" || grapheme == "\r" || grapheme == "\t"
  }

  fn is_quote(grapheme: &str) -> bool {
    grapheme == "\"" || grapheme == "'"
  }

  fn process_attribute(&mut self) {
    let attribute_name = self.attribute_name.clone();
    let mut attribute_value = "".to_string();
    {
      let attr_opt = self.tag.get_attribute_mut(attribute_name.as_ref());
      if attr_opt.is_some() {
        attribute_value.push_str(attr_opt.unwrap().1.as_ref());
      }
    }
    if attribute_value == "" {
      self.attribute_name = attribute_value;
      return;
    }
    let attr = (attribute_name, attribute_value);

    if self.events & Event::Attribute as u32 != 0 {
      self.trigger_event(Event::Attribute, &attribute_to_json(&attr));
    }
    self.tag.set_attribute(attr);
    self.attribute_name = "".to_string();
  }

  fn process_open_tag(&mut self, self_closing: bool) {
    self.saw_root = true;
    if self.text != "" {
      if self.events & Event::Text as u32 != 0 {
        self.trigger_event(Event::Text, &self.text);
      }
      self.tag.text.push_str(self.text.as_ref());
      self.text = "".to_string();
    }
    self.tags.push(self.tag.clone());
    if self.events & Event::OpenTag as u32 != 0 {
      self.trigger_event(Event::OpenTag, &tag_to_json(&self.tag));
    }
    if !self_closing {
      self.state = State::Text;
    }
  }

  fn process_close_tag(&mut self) {
    let mut s = self.tags.len();
    let mut found = false;
    if self.close_tag_name == "" {
      self.close_tag_name = self.tag.name.clone();
    }
    while s != 0 {
      s -= 1;
      let tag = &self.tags[s];
      if tag.name == self.close_tag_name {
        found = true;
        break;
      }
    }
    if !found {
      self.text.push_str("</");
      self.text.push_str(self.close_tag_name.as_ref());
      self.text.push('>');
      self.state = State::Text;
      return;
    }
    let mut t = self.tags.len();
    while t > s {
      t -= 1;
      let tag_opt = self.tags.pop();
      if tag_opt.is_some() {
        self.tag = tag_opt.unwrap();
        self.tag.end = (self.line, self.character);
        if self.text != "" {
          if self.events & Event::Text as u32 != 0 {
            self.trigger_event(Event::Text, &self.text);
          }
          self.tag.text.push_str(self.text.as_ref());
          self.text = "".to_string();
        }

        if self.events & Event::CloseTag as u32 != 0 {
          self.trigger_event(Event::CloseTag, &tag_to_json(&self.tag));
        }
      }
    }

    if t == 0 {
      self.closed_root = true;
    }
    self.attribute_name = "".to_string();
    self.state = State::Text;
  }

  fn jsx_attribute_expression(&mut self, grapheme: &str) {
    if grapheme == "}" {
      self.brace_ct -= 1;
    } else if grapheme == "{" {
      self.brace_ct += 1;
    }
    self.push_attribute_value(grapheme);
    if self.brace_ct == 0 {
      self.process_attribute();
      self.state = State::AttribValueClosed;
    }
  }

  fn push_attribute_value(&mut self, attribute_value: &str) {
    let attribute_name = self.attribute_name.clone();
    let attr_opt = self.tag.get_attribute_mut(attribute_name.as_ref());
    if attr_opt.is_some() {
      attr_opt.unwrap().1.push_str(attribute_value);
    }
  }

  fn new_tag(&mut self) {
    self.tag_start = (self.line, self.character);
    self.state = State::OpenWaka;
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
  // &amp and such.
  TextEntity = 3,
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
  // <foo bar="&quot;"
  AttribValueEntityQ = 30,
  // <foo bar=&quot
  AttribValueEntityU = 31,
  // </a
  CloseTag = 32,
  // </a   >
  CloseTagSawWhite = 33,
  // props={() => {}}
  JSXAttributeExpression = 36,
}
