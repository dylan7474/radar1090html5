# radar1090 HTML5

radar1090 ships as a standalone HTML5 experience designed to run the web dashboard
from any modern browser.

**Current Version:** V1.7.21

---

## Table of Contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Quick Start](#quick-start)
4. [Configuration](#configuration)
5. [Troubleshooting](#troubleshooting)
6. [Development](#development)
7. [Future Improvements](#future-improvements)

---

## Features

- Retro-styled radar display that connects to a `dump1090-fa` server hosted at `http://192.168.50.100:8080`.
- Integrated airband audio stream at `http://192.168.50.4:8000/airbands` so you can
  monitor radio traffic alongside aircraft movements without juggling player controls.
- Persistent configuration stored in browser cookies, covering receiver coordinates, audio mute state, radar controls, and
  server path preferences.
- Optional aircraft label overlay toggled from the sidebar to display callsigns, altitude, and inbound distance/ETA around each blip.
- Layout toggle buttons collapse the controls or data sidebars so the radar can claim the freed screen real estate when desired.
- Sidebar readout that surfaces the receiver latitude/longitude for quick reference.
- Highlighted controlled airspace rings for nearby airports within the selected radar range.
- Aircraft markers that scale with known wake turbulence or emitter category data, making heavy jets stand out at a glance.
- Rotate the scope in 90° increments with the sidebar control to quickly reorient the display.
- Click any aircraft blip to lock the sidebar readout to that contact.
  Click the same blip again to spotlight it as the only rendered target while
  keeping audio focused. Tap an empty patch of the scope—or the aircraft a
  third time—to resume automatic cycling.
- When a contact is locked, the radar ping follows that aircraft so other
  traffic stays silent while still rendering on-screen (unless you have toggled
  the single-contact spotlight mode).
- Automatic alert detection surfaces rapid descents, critical squawk codes, and inbound traffic with prominent warnings in the data panel and highlights the affected blip on the scope. Receiver and server warnings share a scrolling message banner that queues every alert and lets each one glide fully across the display before advancing.

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

All user-facing preferences persist automatically. To clear them, delete the
`radar1090` cookies (e.g., `receiverLat`, `receiverLon`, `airbandMuted`,
`showAircraftDetails`, `beepVolumeLevel`, `radarRangeIndex`,
`inboundAlertDistanceKm`, `controlsPanelVisible`, `dataPanelVisible`,
`dump1090BasePath`) via your browser's developer tools.

The dashboard expects the dump1090-fa JSON endpoints to live at
`http://192.168.50.100:8080/dump1090-fa/data`. Update the `DUMP1090_*` constants near the
top of `app.js` if your receiver runs on a different host, port, or protocol.

Default receiver coordinates now live in [`config.js`](config.js). Adjust the
`DEFAULT_RECEIVER_LOCATION` export there to match your station's latitude and longitude.
The sidebar shows the current coordinates so you can confirm the values in use.

Controlled airspace footprints are also defined in [`config.js`](config.js) via the
`CONTROLLED_AIRSPACES` array. Each entry needs an ICAO code, human-friendly name,
latitude/longitude, and radius in kilometers. Tune or expand this list to reflect the
airports you care about monitoring; the radar will automatically highlight any whose
controlled region falls inside the active range rings.

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

## Future Improvements

The current build focuses on replicating the retro radar experience with modern web
tooling. A few enhancements that would streamline operations for hobbyists and
deployments alike include:

- **In-app server configuration UI** – allow operators to adjust the dump1090 host,
  port, and base path from the sidebar instead of editing `app.js` or clearing
  cookies between sites.
- **Improved offline handling** – surface cached aircraft history or a dedicated
  "standby" screen when the JSON endpoints are unreachable for multiple refresh
  intervals.
- **Audio device selection** – expose browser audio output/input routing controls so
  operators with multiple headsets can switch destinations without leaving the app.
- **Progressive Web App (PWA) packaging** – ship a manifest/service worker to enable
  installable home screen shortcuts and background caching for mobile or kiosk use.
- **Expanded accessibility support** – include high-contrast and reduced motion
  themes alongside additional keyboard shortcuts for the sidebar controls.
