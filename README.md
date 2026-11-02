# Forex Time

A borderless Forex session clock for Kabul. React 19, TypeScript, Tailwind CSS 4
and Radix UI on Tauri v2, with a Rust-owned clock engine.

## Run

Requires Node.js 22.12+ (or 24), Rust MSVC, Visual Studio C++ Build Tools with a
Windows SDK, and Microsoft Edge WebView2 on Windows.

```powershell
npm install
npm run desktop
```

Build a standalone executable without an installer:

```powershell
npm run desktop:build
```

The Windows executable is `src-tauri/target/release/forex-time.exe`. Installer
bundling is disabled. Native icons are temporary neutral squares.

For a browser design preview, run `npm run dev` and open http://127.0.0.1:1420.
The browser is labeled as a **static sample**, with overlap, solo and off-peak
scenarios. Actual ticking and native window controls require Tauri.

## Use

- **Kabul time** is the main clock; London and New York show their local times.
- **Up next** shows the next session boundary and a Rust-calculated countdown.
- **Session map** uses a 06:00–06:00 Kabul timeline. `+1` means the following day.
  Before 06:00 it shows the previous trading day, including New York's overnight
  tail. Weekend rows are marked as unscheduled.
- **Pin icon** keeps the window above trading charts.
- **Compact icon** switches to a small floating clock; expand restores the dashboard.
- **Settings → Quick placement** moves to a corner of the current monitor's
  usable area, respecting its scaling and taskbar.
- **Settings → Lock position** prevents titlebar dragging and manual resizing.
  Unlock to use quick placement. Explicit compact/expand controls remain available.
- Drag the logo/titlebar to move the unlocked window. Minimize and close buttons
  remain available. Alt+F4 also closes the window on Windows.
- Position and size are saved by Tauri's window-state plugin. Pin, lock, compact
  and 12-hour preferences are saved locally. No account or network service is used.

## Component library and design

[Radix UI](https://www.radix-ui.com/primitives/docs/overview/introduction) supplies
the accessible dialog, focus management, tooltips and switches. Its unstyled
primitives fit a custom Tailwind desktop interface. Lucide supplies icons.
Manrope and DM Sans variable fonts are bundled locally with Latin subsets only.

The slate-dark interface uses tabular clock digits, emerald for overlap, blue
for a solo session and muted slate for off-peak. Reduced-motion preferences,
keyboard focus, dialog Escape handling and narrow layouts are supported.

## Clock architecture

The frontend has **no clock timers**. One Tokio worker polls UTC system time
every 250 ms and emits `market-tick` once per newly observed Unix second. All
clock fields, calendar labels, boundaries, countdowns and schedule positions
come from Rust using `chrono-tz` IANA zones. The UI only formats values.

The listener registers before `get_market_snapshot` hydration. A snapshot is
discarded if a newer tick arrived first. Listeners are released even when async
registration completes after unmount. The worker aborts on app exit, recovers
from clock corrections, and skips missed ticks after sleep instead of replaying.
Normal updates arrive within approximately 250 ms of a boundary; OS scheduling
and sleep prevent hard real-time guarantees.

| Session | Weekdays | Local hours |
| --- | --- | --- |
| London | Monday–Friday | 08:00 inclusive – 16:00 exclusive |
| New York | Monday–Friday | 08:00 inclusive – 17:00 exclusive |

New York's opening is **16:30 Kabul during US daylight time**, and **17:30 during
US standard time**. London and New York change DST on different dates; IANA rules
handle this. Future timezone-law changes require updating `chrono-tz` and rebuilding.

Session activity is a timing guide, **not measured volatility**. There is no
price feed, holiday calendar or broker-specific closure data.

## Source map

- `src/App.tsx`: dashboard, timeline, compact view and settings.
- `src/hooks/useMarketClock.ts`: event subscription and hydration.
- `src/hooks/useWindowControls.ts`: native placement and preferences.
- `src/lib/types.ts`: IPC types and presentation-only formatters.
- `src/lib/preview.ts`: labeled browser fixtures, never used in Tauri.
- `src-tauri/src/market.rs`: timezone, schedule and countdown engine.
- `src-tauri/src/main.rs`: Tokio worker, snapshot command and window persistence.
- `src-tauri/capabilities/main.json`: permissions for the local main window only.

## Verify

Build the frontend first: Tauri embeds `dist` at compile time.

```powershell
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo build --manifest-path src-tauri/Cargo.toml --locked
```

Tests cover DST transitions and mismatch weeks, opening/closing seconds, weekends,
overnight schedules, countdowns, tick deduplication, clock corrections, listener
races and cleanup, connection retry, pin failures and monitor placement.
