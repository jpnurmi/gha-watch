use std::{collections::HashMap, io::Write, sync::Mutex};
use tempfile::NamedTempFile;

#[derive(Default)]
pub(crate) struct CommandInputState(Mutex<HashMap<String, NamedTempFile>>);

impl CommandInputState {
    fn create(&self, content: &str) -> Result<String, String> {
        let mut file = NamedTempFile::new().map_err(|error| error.to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|error| error.to_string())?;
        let path = file
            .path()
            .to_str()
            .ok_or("Command input path is not valid UTF-8.")?
            .to_string();
        self.0
            .lock()
            .map_err(|error| error.to_string())?
            .insert(path.clone(), file);
        Ok(path)
    }

    fn remove(&self, path: &str) -> Result<(), String> {
        let file = self
            .0
            .lock()
            .map_err(|error| error.to_string())?
            .remove(path)
            .ok_or("Unknown command input file.")?;
        file.close().map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub(crate) fn create_command_input(
    state: tauri::State<'_, CommandInputState>,
    content: String,
) -> Result<String, String> {
    state.create(&content)
}

#[tauri::command]
pub(crate) fn remove_command_input(
    state: tauri::State<'_, CommandInputState>,
    path: String,
) -> Result<(), String> {
    state.remove(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_large_inputs_separate_and_removes_them() {
        let state = CommandInputState::default();
        let content = "history".repeat(200_000);
        let first = state.create(&content).unwrap();
        let second = state.create("other request").unwrap();
        assert_eq!(std::fs::read_to_string(&first).unwrap(), content);
        state.remove(&first).unwrap();
        assert!(!std::path::Path::new(&first).exists());
        assert_eq!(std::fs::read_to_string(&second).unwrap(), "other request");
        drop(state);
        assert!(!std::path::Path::new(&second).exists());
    }

    #[test]
    fn refuses_to_remove_unregistered_files() {
        let file = NamedTempFile::new().unwrap();
        let state = CommandInputState::default();
        assert!(state.remove(file.path().to_str().unwrap()).is_err());
        assert!(file.path().exists());
    }
}
