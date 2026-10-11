use std::{
    ffi::OsString,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Manager, WebviewWindow};

struct ScreenshotState {
    path: PathBuf,
    started: AtomicBool,
}

pub(crate) fn output_path(
    args: impl IntoIterator<Item = OsString>,
) -> Result<Option<PathBuf>, String> {
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        if arg == "--screenshot" {
            return args
                .next()
                .filter(|path| !path.is_empty())
                .map(PathBuf::from)
                .map(Some)
                .ok_or_else(|| "usage: gha-watch --screenshot OUTPUT.png".to_string());
        }
    }
    Ok(None)
}

pub(crate) fn run(path: PathBuf, mut context: tauri::Context<tauri::Wry>) {
    let config = context.config_mut().app.windows.remove(0);
    let profile = tempfile::tempdir().expect("could not create screenshot profile");
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.manage(crate::tray::TrayIndicatorState::default());
    builder
        .manage(ScreenshotState {
            path,
            started: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![screenshot_ready])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                crate::tray::setup(app)?;
            }
            let window = tauri::WebviewWindowBuilder::from_config(app, &config)?
                .initialization_script("window.__GHA_WATCH_SCREENSHOT__ = true;")
                .data_directory(profile.path().to_path_buf())
                .incognito(true)
                .inner_size(460.0, 400.0)
                .visible(false)
                .center()
                .build()?;

            #[cfg(target_os = "macos")]
            crate::window::configure_macos_window_frame(&window)?;
            #[cfg(target_os = "linux")]
            {
                crate::window::configure_linux_window_frame(&window);
                crate::window::configure_linux_window_controls(&window);
                window.with_webview(|webview| {
                    use webkit2gtk::{SettingsExt, WebViewExt};
                    if let Some(settings) = webview.inner().settings() {
                        settings.set_hardware_acceleration_policy(
                            webkit2gtk::HardwareAccelerationPolicy::Never,
                        );
                    }
                })?;
            }

            window.show()?;
            window.set_focus()?;
            // retain the isolated profile until the app exits
            app.manage(profile);
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(45));
                finish(
                    &handle,
                    Err("screenshot did not finish within 45 seconds".into()),
                );
            });
            Ok(())
        })
        .run(context)
        .expect("error while capturing GHA Watch");
}

#[tauri::command]
fn screenshot_ready(
    window: WebviewWindow,
    state: tauri::State<'_, ScreenshotState>,
    status: String,
    tooltip: String,
    has_unseen_changes: bool,
) -> Result<(), String> {
    if state.started.swap(true, Ordering::SeqCst) {
        return Err("screenshot already started".into());
    }
    let path = state.path.clone();
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let app = window.app_handle();
        crate::tray::set_tray_indicator(
            app.clone(),
            app.state(),
            status,
            tooltip,
            has_unseen_changes,
        )?;
        let tray = app
            .tray_by_id("gha-watch")
            .ok_or("screenshot tray is missing")?;
        crate::window::show_main_window(app, tray.rect().map_err(|error| error.to_string())?);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (status, tooltip, has_unseen_changes);
    capture(window, path)
}

fn finish(app: &AppHandle, result: Result<(), String>) {
    if let Err(error) = result {
        eprintln!("Screenshot failed: {error}");
        app.exit(1);
    } else {
        app.exit(0);
    }
}

fn validate_content(image: &tauri::image::Image<'_>) -> Result<(), String> {
    let width = image.width() as usize;
    let height = image.height() as usize;
    let colors: std::collections::HashSet<_> = image
        .rgba()
        .as_chunks::<4>()
        .0
        .iter()
        .enumerate()
        .filter(|(index, pixel)| {
            let x = index % width;
            let y = index / width;
            x >= width / 10
                && x < width * 9 / 10
                && y >= height / 4
                && y < height * 9 / 10
                && pixel[3] > 0
        })
        .map(|(_, pixel)| &pixel[..3])
        .collect();
    if colors.len() < 16 {
        return Err("screenshot has no rendered app content".into());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn validate_png(bytes: &[u8]) -> Result<(), String> {
    let image = tauri::image::Image::from_bytes(bytes).map_err(|error| error.to_string())?;
    validate_content(&image)
}

#[cfg(windows)]
fn capture(window: WebviewWindow, path: PathBuf) -> Result<(), String> {
    use webview2_com::{
        CapturePreviewCompletedHandler,
        Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
    };
    use windows::Win32::{
        System::Com::{STATFLAG_NONAME, STATSTG, STREAM_SEEK_SET},
        UI::Shell::SHCreateMemStream,
    };

    let app = window.app_handle().clone();
    window
        .with_webview(move |webview| {
            let result = (|| -> windows::core::Result<()> {
                // WebView2 writes the rendered page directly into an in-memory PNG stream
                unsafe {
                    let stream =
                        SHCreateMemStream(None).ok_or_else(windows::core::Error::from_thread)?;
                    let output = stream.clone();
                    let handle = app.clone();
                    let callback =
                        CapturePreviewCompletedHandler::create(Box::new(move |result| {
                            let result = (|| -> Result<(), String> {
                                result.map_err(|error| error.to_string())?;
                                let mut stat = STATSTG::default();
                                output
                                    .Stat(&mut stat, STATFLAG_NONAME)
                                    .map_err(|error| error.to_string())?;
                                output
                                    .Seek(0, STREAM_SEEK_SET, None)
                                    .map_err(|error| error.to_string())?;
                                let size = u32::try_from(stat.cbSize)
                                    .map_err(|error| error.to_string())?;
                                let mut bytes = vec![0; size as usize];
                                let mut read = 0;
                                output
                                    .Read(bytes.as_mut_ptr().cast(), size, Some(&mut read))
                                    .ok()
                                    .map_err(|error| error.to_string())?;
                                if read != size {
                                    return Err("incomplete WebView2 screenshot".into());
                                }
                                validate_png(&bytes)?;
                                std::fs::write(&path, bytes).map_err(|error| error.to_string())
                            })();
                            finish(&handle, result);
                            Ok(())
                        }));
                    webview.controller().CoreWebView2()?.CapturePreview(
                        COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                        &stream,
                        &callback,
                    )?;
                }
                Ok(())
            })();
            if let Err(error) = result {
                finish(&app, Err(error.to_string()));
            }
        })
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn capture(window: WebviewWindow, path: PathBuf) -> Result<(), String> {
    use objc2_app_kit::NSWindow;
    use sha2::{Digest, Sha256};

    let app = window.app_handle().clone();
    let capture_window = window.clone();
    window
        .with_webview(move |webview| {
            // Tauri supplies a live NSWindow on the main thread
            let id = unsafe { (&*webview.ns_window().cast::<NSWindow>()).windowNumber() };
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(250));
                let result = (|| -> Result<(), String> {
                    let scale = capture_window
                        .scale_factor()
                        .map_err(|error| error.to_string())?;
                    let position = capture_window
                        .outer_position()
                        .map_err(|error| error.to_string())?
                        .to_logical::<i32>(scale);
                    let size = capture_window
                        .outer_size()
                        .map_err(|error| error.to_string())?
                        .to_logical::<u32>(scale);
                    let monitor = capture_window
                        .current_monitor()
                        .map_err(|error| error.to_string())?
                        .ok_or("screenshot monitor is missing")?;
                    let origin = monitor.position().to_logical::<i32>(scale);
                    let screen = monitor.size().to_logical::<u32>(scale);
                    let left = (position.x - 20).max(origin.x);
                    let top = origin.y;
                    let right =
                        (position.x + size.width as i32 + 20).min(origin.x + screen.width as i32);
                    let bottom =
                        (position.y + size.height as i32 + 20).min(origin.y + screen.height as i32);
                    let bounds = [left, top, right - left, bottom - top];

                    let temporary = tempfile::tempdir().map_err(|error| error.to_string())?;
                    let popup_path = temporary.path().join("popup.png");
                    capture_macos_screen(&format!("-l{id}"), &popup_path)?;
                    let popup = tauri::image::Image::from_bytes(
                        &std::fs::read(&popup_path).map_err(|error| error.to_string())?,
                    )
                    .map_err(|error| error.to_string())?;
                    validate_content(&popup)?;
                    capture_macos_screen(
                        &format!("-R{left},{top},{},{}", bounds[2], bounds[3]),
                        &path,
                    )?;
                    let desktop = tauri::image::Image::from_bytes(
                        &std::fs::read(&path).map_err(|error| error.to_string())?,
                    )
                    .map_err(|error| error.to_string())?;
                    let tray = app
                        .tray_by_id("gha-watch")
                        .ok_or("screenshot tray is missing")?
                        .rect()
                        .map_err(|error| error.to_string())?
                        .ok_or("screenshot tray bounds are missing")?;
                    let tray_position = tray.position.to_logical::<f64>(scale);
                    let tray_size = tray.size.to_logical::<f64>(scale);
                    let x_scale = desktop.width() as f64 / bounds[2] as f64;
                    let y_scale = desktop.height() as f64 / bounds[3] as f64;
                    let x = ((tray_position.x - left as f64) * x_scale).round().max(0.0) as u32;
                    let y = ((tray_position.y - top as f64) * y_scale).round().max(0.0) as u32;
                    let right =
                        (x + (tray_size.width * x_scale).round() as u32).min(desktop.width());
                    let bottom =
                        (y + (tray_size.height * y_scale).round() as u32).min(desktop.height());
                    if x >= right || y >= bottom {
                        return Err("desktop capture does not include the tray icon".into());
                    }

                    // compare real app and tray pixels, excluding the system clock and desktop
                    let mut hash = Sha256::new();
                    hash.update(popup.width().to_le_bytes());
                    hash.update(popup.height().to_le_bytes());
                    hash.update(popup.rgba());
                    hash.update((position.x as f64 - tray_position.x).to_le_bytes());
                    hash.update((position.y as f64 - tray_position.y).to_le_bytes());
                    hash.update((right - x).to_le_bytes());
                    hash.update((bottom - y).to_le_bytes());
                    for row in y..bottom {
                        let first = ((row * desktop.width() + x) * 4) as usize;
                        let last = ((row * desktop.width() + right) * 4) as usize;
                        hash.update(&desktop.rgba()[first..last]);
                    }
                    std::fs::write(
                        path.with_extension("sha256"),
                        format!("{:x}\n", hash.finalize()),
                    )
                    .map_err(|error| error.to_string())
                })();
                finish(&app, result);
            });
        })
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn capture_macos_screen(area: &str, path: &std::path::Path) -> Result<(), String> {
    let output = std::process::Command::new("/usr/sbin/screencapture")
        .args(["-x", "-t", "png", area])
        .arg(path)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "screencapture failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn capture(window: WebviewWindow, path: PathBuf) -> Result<(), String> {
    use gtk::prelude::*;
    use webkit2gtk::WebViewExt;

    let app = window.app_handle().clone();
    let capture_window = window.clone();
    window
        .with_webview(move |webview| {
            let view = webview.inner();
            let content_view = view.clone();
            view.snapshot(
                webkit2gtk::SnapshotRegion::Visible,
                webkit2gtk::SnapshotOptions::NONE,
                None::<&gtk::gio::Cancellable>,
                move |snapshot| {
                    let result = (|| -> Result<(), String> {
                        let content = snapshot.map_err(|error| error.to_string())?;
                        let mut bytes = Vec::new();
                        content
                            .write_to_png(&mut bytes)
                            .map_err(|error| error.to_string())?;
                        validate_png(&bytes)?;

                        let frame = capture_window
                            .gtk_window()
                            .map_err(|error| error.to_string())?;
                        let (x, y) = content_view
                            .translate_coordinates(&frame, 0, 0)
                            .ok_or("could not locate WebKit content in GTK window")?;
                        let image = cairo::ImageSurface::create(
                            cairo::Format::ARgb32,
                            frame.allocated_width(),
                            frame.allocated_height(),
                        )
                        .map_err(|error| error.to_string())?;
                        let context =
                            cairo::Context::new(&image).map_err(|error| error.to_string())?;
                        frame.draw(&context);
                        context
                            .set_source_surface(&content, x as f64, y as f64)
                            .map_err(|error| error.to_string())?;
                        context.paint().map_err(|error| error.to_string())?;
                        let mut output =
                            std::fs::File::create(&path).map_err(|error| error.to_string())?;
                        image
                            .write_to_png(&mut output)
                            .map_err(|error| error.to_string())
                    })();
                    finish(&app, result);
                },
            );
        })
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaves_normal_launches_alone() {
        assert_eq!(output_path(["--autostart".into()]), Ok(None));
    }

    #[test]
    fn accepts_paths_with_spaces() {
        assert_eq!(
            output_path(["--screenshot".into(), "screen shots/windows.png".into()]),
            Ok(Some("screen shots/windows.png".into()))
        );
    }

    #[test]
    fn requires_an_output_path() {
        assert!(output_path(["--screenshot".into()]).is_err());
        assert!(output_path(["--screenshot".into(), "".into()]).is_err());
    }

    #[test]
    fn rejects_a_blank_popup() {
        let mut rgba = [0, 0, 0, 255].repeat(100 * 100);
        for x in 0..100 {
            rgba[x * 4] = x as u8;
        }
        let image = tauri::image::Image::new_owned(rgba, 100, 100);
        assert!(validate_content(&image).is_err());
        let image = tauri::image::Image::new_owned(vec![255; 100 * 100 * 4], 100, 100);
        assert!(validate_content(&image).is_err());
    }

    #[test]
    fn accepts_rendered_app_content() {
        let image = tauri::image::Image::from_bytes(include_bytes!(
            "../../.github/screenshots/windows.png"
        ))
        .unwrap();
        assert!(validate_content(&image).is_ok());
    }
}
