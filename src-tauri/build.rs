use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    /* tauri_build は bundle.resources の存在を確認するので、先に DLL を置く */
    copy_steam_api_dll();
    tauri_build::build();
}

/// steamworks-sys 同梱の redistributable を、exe 隣と bundle 用へコピーする。
fn copy_steam_api_dll() {
    let Some(src) = find_steam_api_dll() else {
        panic!(
            "steam_api64.dll not found. Build steamworks-sys first, or set CARGO_HOME so the crate sources are readable."
        );
    };

    if let Some(profile_dir) = profile_dir_from_out_dir() {
        let dest_exe = profile_dir.join("steam_api64.dll");
        if let Err(e) = fs::copy(&src, &dest_exe) {
            println!("cargo:warning=failed to copy steam_api64.dll next to exe: {e}");
        }
        /* cargo test / 一部の起動経路は deps 配下の exe を使う */
        let deps = profile_dir.join("deps");
        if deps.is_dir() {
            let _ = fs::copy(&src, deps.join("steam_api64.dll"));
        }
    }

    let steam_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR")).join("steam");
    fs::create_dir_all(&steam_dir).expect("create src-tauri/steam");
    let dest_bundle = steam_dir.join("steam_api64.dll");
    fs::copy(&src, &dest_bundle).unwrap_or_else(|e| {
        panic!("failed to copy steam_api64.dll to {}: {e}", dest_bundle.display());
    });
    println!("cargo:rerun-if-changed={}", src.display());
}

fn profile_dir_from_out_dir() -> Option<PathBuf> {
    let out_dir = PathBuf::from(env::var("OUT_DIR").ok()?);
    out_dir.ancestors().nth(3).map(Path::to_path_buf)
}

fn find_steam_api_dll() -> Option<PathBuf> {
    if let Some(profile_dir) = profile_dir_from_out_dir() {
        if let Some(found) = find_in_build_dir(&profile_dir.join("build")) {
            return Some(found);
        }
    }
    find_in_registry_src()
}

fn find_in_build_dir(build_dir: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(build_dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        if !name.to_string_lossy().starts_with("steamworks-sys-") {
            continue;
        }
        let candidate = entry.path().join("out").join("steam_api64.dll");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn find_in_registry_src() -> Option<PathBuf> {
    let cargo_home = env::var("CARGO_HOME")
        .map(PathBuf::from)
        .ok()
        .or_else(|| {
            env::var("USERPROFILE")
                .ok()
                .map(|h| PathBuf::from(h).join(".cargo"))
        })?;
    let src_root = cargo_home.join("registry").join("src");
    let indexes = fs::read_dir(src_root).ok()?;
    for index in indexes.flatten() {
        let crates = fs::read_dir(index.path()).ok()?;
        for crate_dir in crates.flatten() {
            let name = crate_dir.file_name();
            if !name.to_string_lossy().starts_with("steamworks-sys-") {
                continue;
            }
            let candidate = crate_dir
                .path()
                .join("lib")
                .join("steam")
                .join("redistributable_bin")
                .join("win64")
                .join("steam_api64.dll");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}
