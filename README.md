# radar1090 HTML5

radar1090 now ships as a standalone HTML5 experience. The native SDL build
and its supporting assets have been removed so the repository contains only the files
needed to run the web dashboard from any modern browser.

---

## Table of Contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Quick Start](#quick-start)
4. [Configuration](#configuration)
5. [Keyboard Controls](#keyboard-controls)
6. [Troubleshooting](#troubleshooting)
7. [Development](#development)

---

## Features

- Retro-styled radar display that connects to a `dump1090-fa` server hosted at `http://192.168.50.100:8080`.
- Keyboard controls that mirror the original desktop client for muscle-memory parity.
- Integrated airband audio stream at `http://192.168.50.4:8000/airbands` so you can
  monitor radio traffic alongside aircraft movements without juggling player controls.
- Persistent configuration via `localStorage`, covering receiver coordinates and audio mute state.
- Sidebar readout that surfaces the receiver latitude/longitude and whether defaults or overrides are active.

## Requirements

- A running instance of `dump1090-fa` with the JSON endpoints exposed (e.g.
  `http://HOST:PORT/dump1090-fa/data`).
- A modern Chromium-, WebKit-, or Gecko-based browser (recent versions of Chrome, Edge,
  Firefox, or Safari).
- Optional: access to the companion airband audio stream if you want synced radio audio.

## Quick Start

1. Clone or download this repository.
2. Open `index.html` directly in your browser or serve the repo through a static file
   host (e.g. `python3 -m http.server`).
3. Ensure your `dump1090-fa` instance is reachable at `http://192.168.50.100:8080`.
4. The dashboard automatically polls `receiver.json` and `aircraft.json` every five
   seconds once loaded.
5. Adjust the audio controls as needed. The **Live Audio** section starts the airband
   feed automatically—tap the mute toggle if you need to silence it temporarily.

## Configuration

All user-facing preferences persist automatically. To clear them, remove the
`radar1090` entry from `localStorage` via your browser's developer tools.

The dashboard expects the dump1090-fa JSON endpoints to live at
`http://192.168.50.100:8080/dump1090-fa/data`. Update the `DUMP1090_*` constants near the
top of `app.js` if your receiver runs on a different host, port, or protocol.

Default receiver coordinates now live in [`config.js`](config.js). Adjust the
`DEFAULT_RECEIVER_LOCATION` export there to match your station's latitude and longitude.
The sidebar shows the current coordinates so you can confirm the values in use.

## Keyboard Controls

- `m` toggles whether `+`/`-` adjust volume or sweep speed.
- `+` / `-` increase or decrease volume or sweep speed (depending on mode).
- `↑` / `↓` change radar range.
- `←` / `→` adjust inbound alert distance.

## Troubleshooting

- The status banner in the sidebar shows whether the app is connected or waiting for
  data.
- Connection issues surface in the message area and in the browser developer console
  (open it with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> or
  <kbd>Cmd</kbd>+<kbd>Opt</kbd>+<kbd>I</kbd> on macOS).
- If the audio stream cannot be reached, the app displays an alert in the message area.
- When self-hosting over HTTPS, ensure mixed content is allowed if your `dump1090-fa`
  or audio endpoints are plain HTTP.

## Development

All assets are static. Update `index.html`, `styles.css`, and `app.js` to adjust the
interface or behavior.

During development you can use any static file server. A quick option is:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080` in your browser.

If you contribute code, please follow the conventions in [`AGENTS.md`](AGENTS.md) for
styling, documentation, and testing expectations.
