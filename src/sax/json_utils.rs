use sax::tag::*;

pub fn attributes_to_json(attrs: &Vec<Attribute>) -> String {
  let mut attrs_json = "[".to_string();
  let mut i = 0;
  for attr in attrs {
    if i != 0 {
      attrs_json.push_str(",");
    }
    attrs_json.push_str(&attribute_to_json(attr));
    i += 1;
  }
  attrs_json.push_str("]");
  attrs_json
}

pub fn attribute_to_json(attr: &Attribute) -> String {
  // {"name":"myName", "value":"myValue"}
  let mut attr_json = "{\"name\":\"".to_string();
  attr_json.push_str(&attr.name);
  attr_json.push_str("\",\"value\":\"");
  attr_json.push_str(&attr.value);
  attr_json.push_str("\",\"nameStart\":");
  attr_json.push_str(&point_to_json(&attr.name_start));
  attr_json.push_str(",\"nameEnd\":");
  attr_json.push_str(&point_to_json(&attr.name_end));
  attr_json.push_str(",\"valueStart\":");
  attr_json.push_str(&point_to_json(&attr.value_start));
  attr_json.push_str(",\"valueEnd\":");
  attr_json.push_str(&point_to_json(&attr.value_end));
  attr_json.push_str("}");
  attr_json
}

pub fn text_to_json(text: &Text) -> String {
  let mut text_json = "{\"value\":\"".to_string();
  text_json.push_str(&text.value);
  text_json.push_str("\",\"start\":");
  text_json.push_str(&point_to_json(&text.start));
  text_json.push_str(",\"end\":");
  text_json.push_str(&point_to_json(&text.end));
  text_json.push_str("}");
  text_json
}

pub fn texts_to_json(texts: &Vec<Text>) -> String {
  let mut texts_json = "[".to_string();
  let len = texts.len();
  let mut i = 0;
  for text in texts {
    i += 1;
    texts_json.push_str(&text_to_json(text));
    if i != len {
      texts_json.push_str(",");
    }
  }
  texts_json.push_str("]");
  texts_json
}

pub fn point_to_json(pt: &(u32, u32)) -> String {
  let mut pt_json = "{\"line\":".to_string();
  pt_json.push_str(&pt.0.to_string());
  pt_json.push_str(",\"character\":");
  pt_json.push_str(&pt.1.to_string());
  pt_json.push_str("}");

  pt_json
}

pub fn tag_to_json(tag: &Tag) -> String {
  // Name
  let mut tag_json = "{\"name\":\"".to_string();
  tag_json.push_str(&tag.name);
  tag_json.push_str("\",");
  // attributes
  tag_json.push_str("\"attributes\":");
  tag_json.push_str(&attributes_to_json(&tag.attributes));
  // start, end
  tag_json.push_str(",\"openStart\":");
  tag_json.push_str(&point_to_json(&tag.open_start));
  tag_json.push_str(",\"openEnd\":");
  tag_json.push_str(&point_to_json(&tag.open_end));
  tag_json.push_str(",\"closeStart\":");
  tag_json.push_str(&point_to_json(&tag.close_start));
  tag_json.push_str(",\"closeEnd\":");
  tag_json.push_str(&point_to_json(&tag.close_end));
  tag_json.push_str(",\"textNodes\":");
  tag_json.push_str(&texts_to_json(&tag.text_nodes));
  tag_json.push_str(",\"selfClosing\":");
  tag_json.push_str(if tag.self_closing { "true" } else { "false" });
  tag_json.push_str("}");

  tag_json
}
