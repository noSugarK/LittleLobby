//! Characters downloaded from the character gallery live in the app data directory, one folder per
//! character (`characters/<id>/character.json`, `atlas.png`, `full-atlas.png`), mirroring the web
//! build's `public/characters`. The webview reads them through these commands and the LAN server
//! serves them to browser players next to the built-in ones.
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::{ipc::Response, AppHandle, Manager};

const FILES: [&str; 3] = ["character.json", "atlas.png", "full-atlas.png"];
const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

/// Text fields in character.json, each `{ "zh-CN", "zh-TW"?, "en" }` (see public/characters/README.md).
const TEXT_FIELDS: [&str; 4] = ["name", "subtitle", "description", "origin"];

pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

pub fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("characters"))
        .map_err(|e| e.to_string())
}

/// Complete downloaded characters, sorted by id.
pub fn list(root: &Path) -> Vec<String> {
    let mut ids: Vec<String> = std::fs::read_dir(root)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|id| valid_id(id) && FILES.iter().all(|f| root.join(id).join(f).is_file()))
        .collect();
    ids.sort();
    ids
}

/// Only the three known files of a valid id are readable, so paths can never escape the folder.
pub fn read(root: &Path, id: &str, file: &str) -> Option<Vec<u8>> {
    (valid_id(id) && FILES.contains(&file))
        .then(|| std::fs::read(root.join(id).join(file)).ok())
        .flatten()
}

/// The built-in manifest plus every downloaded character, for LAN players.
pub fn manifest(builtin: Option<&[u8]>, root: Option<&Path>) -> Vec<u8> {
    let mut value: Value = builtin
        .and_then(|b| serde_json::from_slice(b).ok())
        .unwrap_or_else(|| serde_json::json!({ "builtin": [], "characters": [] }));
    if let (Some(root), Some(list)) = (root, value["characters"].as_array_mut()) {
        for id in self::list(root) {
            if !list.iter().any(|v| v.as_str() == Some(&id)) {
                list.push(Value::String(id));
            }
        }
    }
    serde_json::to_vec(&value).unwrap_or_default()
}

/// Same rules as `parseCharacter` in src/game/characters.ts, so nothing malformed reaches LAN players.
fn meta_ok(meta: &Value, id: &str) -> bool {
    let text_ok = |v: &Value| {
        v["zh-CN"].as_str().is_some_and(|s| !s.is_empty())
            && v["en"].as_str().is_some_and(|s| !s.is_empty())
            && (v["zh-TW"].is_null() || v["zh-TW"].is_string())
    };
    let accent_ok = meta["accent"].as_str().is_some_and(|a| {
        a.len() == 7 && a.starts_with('#') && a[1..].bytes().all(|b| b.is_ascii_hexdigit())
    });
    meta["id"].as_str() == Some(id) && accent_ok && TEXT_FIELDS.iter().all(|f| text_ok(&meta[*f]))
}

fn atlas_ok(png: &[u8]) -> bool {
    // IHDR width and height follow the signature, length and chunk type.
    png.len() > 24
        && png.starts_with(PNG)
        && png[16..20] == 1024u32.to_be_bytes()
        && png[20..24] == 1280u32.to_be_bytes()
}

pub fn save(root: &Path, id: &str, meta: &str, atlas: &[u8], full: &[u8]) -> Result<(), String> {
    if !valid_id(id) {
        return Err("Invalid character id".into());
    }
    let parsed: Value = serde_json::from_str(meta).map_err(|e| e.to_string())?;
    if !meta_ok(&parsed, id) {
        return Err("character.json does not follow the character spec".into());
    }
    if !atlas_ok(atlas) || !atlas_ok(full) {
        return Err("Character atlases must be 1024x1280 PNG files".into());
    }
    // Write into a temporary folder first so a half-finished download never shows up as a character.
    let tmp = root.join(format!(".{id}.tmp"));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    for (file, bytes) in FILES.iter().zip([meta.as_bytes(), atlas, full]) {
        std::fs::write(tmp.join(file), bytes).map_err(|e| e.to_string())?;
    }
    let target = root.join(id);
    let _ = std::fs::remove_dir_all(&target);
    std::fs::rename(&tmp, &target).map_err(|e| e.to_string())
}

pub fn delete(root: &Path, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("Invalid character id".into());
    }
    match std::fs::remove_dir_all(root.join(id)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn list_characters(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(list(&dir(&app)?))
}

#[tauri::command]
pub fn character_file(app: AppHandle, id: String, file: String) -> Result<Response, String> {
    read(&dir(&app)?, &id, &file)
        .map(Response::new)
        .ok_or_else(|| format!("{id}/{file} is not downloaded"))
}

#[tauri::command]
pub fn save_character(
    app: AppHandle,
    id: String,
    meta: String,
    atlas: Vec<u8>,
    full: Vec<u8>,
) -> Result<(), String> {
    save(&dir(&app)?, &id, &meta, &atlas, &full)
}

#[tauri::command]
pub fn delete_character(app: AppHandle, id: String) -> Result<(), String> {
    delete(&dir(&app)?, &id)
}

/// A minimal valid atlas header for tests (shared with the LAN server tests).
#[cfg(test)]
pub fn test_atlas() -> Vec<u8> {
    let mut png = PNG.to_vec();
    png.extend_from_slice(&[0, 0, 0, 13]);
    png.extend_from_slice(b"IHDR");
    png.extend_from_slice(&1024u32.to_be_bytes());
    png.extend_from_slice(&1280u32.to_be_bytes());
    png.extend_from_slice(&[8, 6, 0, 0, 0]);
    png
}

/// A character.json that follows the spec, for tests.
#[cfg(test)]
pub fn test_meta(id: &str) -> String {
    let text = r#"{"zh-CN":"测试","en":"Test"}"#;
    format!(r##"{{"id":"{id}","accent":"#f7cf4f","name":{text},"subtitle":{text},"description":{text},"origin":{text}}}"##)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn atlas() -> Vec<u8> {
        test_atlas()
    }

    #[test]
    fn rejects_character_json_that_breaks_the_spec() {
        let ok: Value = serde_json::from_str(&test_meta("nailong")).unwrap();
        assert!(meta_ok(&ok, "nailong"));
        for (field, bad) in [
            ("accent", serde_json::json!("red")),
            ("subtitle", serde_json::json!("只有中文")),
            ("description", serde_json::json!({ "zh-CN": "中文" })),
            ("origin", serde_json::json!({ "zh-CN": "中文", "en": "" })),
            ("name", serde_json::json!({ "zh-CN": "中文", "en": "En", "zh-TW": 1 })),
        ] {
            let mut meta = ok.clone();
            meta[field] = bad;
            assert!(!meta_ok(&meta, "nailong"), "{field} should be rejected");
        }
        assert!(!meta_ok(&ok, "naiwa"), "id must match the folder");
    }

    #[test]
    fn saves_lists_serves_and_deletes_downloaded_characters() {
        let root = std::env::temp_dir().join(format!("ll-characters-{}", uuid::Uuid::new_v4()));
        let meta = &test_meta("nailong");
        assert!(save(&root, "../x", meta, &atlas(), &atlas()).is_err());
        assert!(save(&root, "nailong", meta, b"not a png", &atlas()).is_err());
        assert!(save(&root, "naiwa", meta, &atlas(), &atlas()).is_err(), "id must match");
        save(&root, "nailong", meta, &atlas(), &atlas()).unwrap();
        assert_eq!(list(&root), ["nailong"]);
        assert_eq!(read(&root, "nailong", "atlas.png"), Some(atlas()));
        assert_eq!(read(&root, "nailong", "../nailong/atlas.png"), None);
        assert_eq!(read(&root, "..", "atlas.png"), None);
        let merged: Value = serde_json::from_slice(&manifest(
            Some(br#"{"builtin":["yier"],"characters":["yier"]}"#),
            Some(&root),
        ))
        .unwrap();
        assert_eq!(merged["characters"], serde_json::json!(["yier", "nailong"]));
        delete(&root, "nailong").unwrap();
        assert!(list(&root).is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }
}
