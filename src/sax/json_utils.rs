use sax::tag::Tag;

pub fn attribute_to_json(attr: &(String, String)) -> String {
  // {"name":"myName", "value":"myValue"}
  let mut attr_json = "{\"name\":\"".to_string();
  attr_json.push_str(attr.0.as_ref());
  attr_json.push_str("\",\"value\":\"");
  attr_json.push_str(attr.1.as_ref());
  attr_json.push_str("\"}");
  attr_json
}

pub fn attributes_to_json(attrs: &Vec<(String, String)>) -> String {
  let mut attrs_json = "[".to_string();
  for attr in attrs {
    attrs_json.push_str(attribute_to_json(attr).as_ref());
    attrs_json.push_str(",");
  }
  attrs_json.push_str("]");
  attrs_json
}

pub fn point_to_json(pt: &(u32, u32)) -> String {
  let mut pt_json = "{\"line\":".to_string();
  pt_json.push_str(pt.0.to_string().as_ref());
  pt_json.push_str(",\"character\":");
  pt_json.push_str(pt.1.to_string().as_ref());
  pt_json.push_str("}");

  pt_json
}

pub fn tag_to_json(tag: &Tag) -> String {
  // Name
  let mut tag_json = "{\"name\":\"".to_string();
  tag_json.push_str(tag.name.as_ref());
  tag_json.push_str("\",");
  // attributes
  tag_json.push_str("\"attributes\":");
  tag_json.push_str(attributes_to_json(&tag.attributes).as_ref());
  // start, end
  tag_json.push_str(",\"start\":");
  tag_json.push_str(point_to_json(&tag.start).as_ref());
  tag_json.push_str(",\"end\":");
  tag_json.push_str(point_to_json(&tag.end).as_ref());
  tag_json.push_str(",\"text\":\"");
  tag_json.push_str(tag.text.as_ref());
  tag_json.push_str("\"");
  tag_json.push_str(",\"selfClosing\":");
  tag_json.push_str(if tag.self_closing { "true" } else { "false" });
  tag_json.push_str("}");

  tag_json
}
