#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod market;
mod preferences;

use std::time::Duration;

use chrono::Utc;
use market::{MarketPayload, MarketTicker, MARKET_TICK_EVENT};
use preferences::TimezonePreference;
use tauri::{Emitter, Manager};
use tokio::{task::JoinHandle, time::MissedTickBehavior};

struct ClockWorker(JoinHandle<()>);

impl Drop for ClockWorker {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// One-shot hydration after the frontend registers its event listener.
#[tauri::command]
fn get_market_snapshot(timezone: tauri::State<'_, TimezonePreference>) -> MarketPayload {
    MarketPayload::at(Utc::now(), timezone.get())
}

#[tauri::command]
fn set_home_timezone(
    home_timezone: String,
    timezone: tauri::State<'_, TimezonePreference>,
) -> Result<MarketPayload, String> {
    let zone = timezone.set(&home_timezone)?;
    Ok(MarketPayload::at(Utc::now(), zone))
}

fn main() {
    // The native event loop remains on the main thread; one Tokio worker handles
    // the clock and Tauri async work. Keep its runtime alive until the app exits.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .thread_name("forex-clock")
        .enable_all()
        .build()
        .expect("failed to initialize the clock runtime");
    tauri::async_runtime::set(runtime.handle().clone());
    let runtime_handle = runtime.handle().clone();

    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE,
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_market_snapshot,
            set_home_timezone
        ])
        .setup(move |app| {
            app.manage(TimezonePreference::load(
                app.path().app_config_dir()?.join("home-timezone.json"),
            ));
            let handle = app.handle().clone();
            let _runtime_context = runtime_handle.enter();
            let worker = tokio::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_millis(250));
                // Resume with current wall time, without replaying missed ticks.
                interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
                let mut ticker = MarketTicker::default();
                loop {
                    interval.tick().await;
                    if let Some(payload) =
                        ticker.sample(Utc::now(), handle.state::<TimezonePreference>().get())
                    {
                        if let Err(error) = handle.emit(MARKET_TICK_EVENT, payload) {
                            eprintln!("failed to emit {MARKET_TICK_EVENT}: {error}");
                        }
                    }
                }
            });
            app.manage(ClockWorker(worker));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Forex Time");

    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            // Break the task's AppHandle ownership before tearing down Tauri.
            if let Some(worker) = app.try_state::<ClockWorker>() {
                worker.0.abort();
            }
        }
    });
    runtime.shutdown_timeout(Duration::from_secs(1));
}
