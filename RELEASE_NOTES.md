Four Forex sessions. One glance.

- Local clocks for Sydney, Tokyo, London and New York, with automatic DST adjustments.
- Clear open/closed states, countdowns and a shared 24-hour session timeline.
- Compact floating view for the current and next session.
- Always-on-top pinning, position locking and quick corner placement.
- Search all 597 bundled IANA timezone identifiers for opening/closing references.
- The new Relay logo, native desktop icons and locally bundled fonts.
- Rust-owned clock updates; no frontend clock timers, account or price-feed connection.

### Downloads

| Your computer | Download |
| --- | --- |
| Windows x64 | `Forex-Time_0.1.0_windows-x64-setup.exe` |
| Mac with Apple Silicon (M-series) | `Forex-Time_0.1.0_macos-arm64.dmg` |
| Mac with an Intel processor | `Forex-Time_0.1.0_macos-x64.dmg` |

On Windows, run the setup file. On macOS, open the DMG and drag Forex Time to Applications.
`SHA256SUMS.txt` contains the checksums for all three installers.

### Signing and scope

This initial release has no publisher certificates configured. The Windows installer
is unsigned. The macOS apps are ad hoc signed and are **not Apple-notarized**;
operating-system trust prompts may appear. See [Apple's guidance for opening apps
from unidentified developers](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/mac).

Session activity represents scheduled trading hours, not measured volatility.
Exchange holidays and broker-specific closures are not included.
