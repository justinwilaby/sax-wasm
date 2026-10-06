pub mod sax;

#[cfg(any(target_arch = "wasm32", test))]
mod event_descriptors;

#[cfg(target_arch = "wasm32")]
pub mod sax_wasm;
