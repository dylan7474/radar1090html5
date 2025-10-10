# radar1090 HTML5

Closest Plane Radar is now a standalone HTML5 experience. The native SDL build and
its supporting assets have been removed so the repository contains only the files
needed to run the web dashboard.

## Features

- Retro-styled radar display that connects to a dump1090-fa server.
- Keyboard controls that mirror the original desktop client.
- Optional screen wake lock support with an audio-based fallback.
- Integrated airband audio stream at `http://192.168.50.4:8000/airbands` so you can
  monitor radio traffic alongside aircraft movements without juggling player controls.

## Getting Started

Open `index.html` in a modern browser (Chrome, Edge, Firefox, or Safari).

1. Enter the host and port of your dump1090-fa server in the sidebar.
   The server must expose the JSON endpoints (e.g. `http://HOST:PORT/dump1090-fa/data`).
2. Click **Apply** to begin polling `receiver.json` and `aircraft.json` every five seconds.
3. The **Live Audio** section starts the airband feed automatically—tap the mute toggle
   if you need to silence it temporarily.

The browser stores your server settings, receiver coordinates, wake-lock preference,
and audio mute preference in `localStorage` so your setup is preserved between visits.

### Keyboard Controls

- `m` toggle between volume and sweep speed adjustment for `+`/`-`
- `+`/`-` increase or decrease volume or sweep speed
- `Up`/`Down` change radar range
- `Left`/`Right` adjust inbound alert distance

### Troubleshooting

- The status banner in the sidebar shows whether the app is connected or waiting for data.
- Connection issues surface in the message area and in the browser developer console
  (open it with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> or <kbd>Cmd</kbd>+<kbd>Opt</kbd>+<kbd>I</kbd> on macOS).
- If the audio stream cannot be reached, the app displays an alert in the message area.

## Development Notes

All assets are static. Update `index.html`, `styles.css`, and `app.js` to adjust the
interface or behavior.
