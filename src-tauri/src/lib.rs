mod steam;

#[tauri::command]
fn get_steam_session_ticket(steam: tauri::State<'_, steam::SteamHandle>) -> Result<String, String> {
    steam.session_ticket()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(steam::SteamHandle::spawn())
        .invoke_handler(tauri::generate_handler![get_steam_session_ticket])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
