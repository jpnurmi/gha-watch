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
    tauri::Builder::default()
        .manage(ScreenshotState {
            path,
            started: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![screenshot_ready])
        .setup(move |app| {
            let window = tauri::WebviewWindowBuilder::from_config(app, &config)?
                .initialization_script("window.__GHA_WATCH_SCREENSHOT__ = true;")
                .data_directory(profile.path().to_path_buf())
                .incognito(true)
                .inner_size(460.0, 400.0)
                .visible(true)
                .center()
                .build()?;

            #[cfg(target_os = "macos")]
            crate::window::configure_macos_window_frame(&window)?;
            #[cfg(target_os = "linux")]
            {
                crate::window::configure_linux_window_frame(&window);
                crate::window::configure_linux_window_controls(&window);
            }

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
    use block2::RcBlock;
    use objc2::AllocAnyThread;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSDictionary, NSError};
    use objc2_web_kit::WKWebView;

    let app = window.app_handle().clone();
    window
        .with_webview(move |webview| {
            let callback = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                let result = (|| -> Result<(), String> {
                    // the snapshot callback owns these objects for the duration of this call
                    unsafe {
                        if let Some(error) = error.as_ref() {
                            return Err(error.localizedDescription().to_string());
                        }
                        let image = image.as_ref().ok_or("WKWebView returned no screenshot")?;
                        let tiff = image
                            .TIFFRepresentation()
                            .ok_or("could not encode screenshot")?;
                        let bitmap =
                            NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff)
                                .ok_or("could not decode screenshot")?;
                        let png = bitmap
                            .representationUsingType_properties(
                                NSBitmapImageFileType::PNG,
                                &NSDictionary::new(),
                            )
                            .ok_or("could not encode PNG")?;
                        std::fs::write(&path, png.to_vec()).map_err(|error| error.to_string())
                    }
                })();
                finish(&app, result);
            });
            // Tauri supplies a live WKWebView and schedules this closure on the main thread
            unsafe {
                let view = &*webview.inner().cast::<WKWebView>();
                view.takeSnapshotWithConfiguration_completionHandler(None, &callback);
            }
        })
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "linux")]
fn capture(window: WebviewWindow, path: PathBuf) -> Result<(), String> {
    use gtk::prelude::*;

    let app = window.app_handle().clone();
    let capture_window = window.clone();
    window
        .run_on_main_thread(move || {
            let result = (|| -> Result<(), String> {
                let gtk_window = capture_window
                    .gtk_window()
                    .map_err(|error| error.to_string())?;
                let frame = gtk_window.window().ok_or("GTK window is not realized")?;
                let (_, _, width, height) = frame.geometry();
                let image = frame
                    .pixbuf(0, 0, width, height)
                    .ok_or("could not capture GTK window")?;
                image
                    .savev(&path, "png", &[])
                    .map_err(|error| error.to_string())
            })();
            finish(&app, result);
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
}
