# radar1090 HTML5

radar1090 ships as a standalone HTML5 experience designed to run the web dashboard
from any modern browser.

**Current Version:** V1.9.36

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
- One-tap "Use My Location" control recenters the radar on your current coordinates and keeps them stored for future visits.
- Manual receiver picker opens an interactive OpenStreetMap-powered picker so you can drop a marker on your station when GPS fixes are unreliable, automatically falling back between multiple CDN sources if the first map library request is blocked.
- If location permissions are blocked, an in-app help overlay walks through re-enabling access in popular browsers so centering can resume quickly.
- Optional aircraft label overlay toggled from the sidebar to display compact callsign tags connected by curved leaders that automatically dodge nearby blips, evaluate every surrounding anchor point to hug each aircraft as tightly as possible, avoid plane icons, other tags, clamp themselves fully inside the radar view, stay pinned to the latest sweep echo so IDs no longer hop as older traces fade, and continue tracking each blip as the radar scope is rotated.
- Layout toggle buttons collapse the controls or data sidebars so the radar can claim the freed screen real estate when desired.
- Sidebar readout that surfaces the receiver latitude/longitude for quick verification.
- Highlighted controlled airspace rings for nearby airports within the selected radar range.
- Range selector now spans 5 km through 400 km to cover both local operations and distant traffic monitoring.
- Faint hashed landmass overlays sourced from configurable GeoJSON coastline data so range changes always track real geography.
- Toggleable OpenStreetMap overlay beneath the radar scope for instant geographic context that rotates in sync with the scope when desired.
- Aircraft markers that scale with known wake turbulence or emitter category data, making heavy jets stand out at a glance.
- Rotate the scope in 90° increments with the sidebar control to quickly reorient the display.
- Range and base approach controls update their readouts without injecting temporary Live Data messages, keeping that panel focused on operational alerts.
- Live data ticker surfaces timely operational notes—now repeating automated rapid-descent and inbound-base alerts until the triggering aircraft clears.
- Alerted contacts pulse directly on the radar so the subject aircraft stands out the moment a ticker warning fires.
- Click any aircraft blip to lock the sidebar readout to that contact.
  Click the same blip again to spotlight it as the only rendered target while
  keeping audio focused. Tap an empty patch of the scope—or the aircraft a
  third time—to resume automatic cycling.
- When a contact is locked, the radar ping follows that aircraft so other
  traffic stays silent while still rendering on-screen (unless you have toggled
  the single-contact spotlight mode).
- Automatic emergency detection surfaces rapid descents, impending collision courses, and critical squawk codes with prominent warnings in the data panel.

## Requirements

- A running instance of `dump1090-fa` with the JSON endpoints exposed (e.g.
  `http://HOST:PORT/dump1090-fa/data`).
- A modern Chromium-, WebKit-, or Gecko-based browser (recent versions of Chrome, Edge,
  Firefox, or Safari).
- Optional: access to the companion airband audio stream if you want synced radio audio.
- Optional: temporary Internet access so the manual receiver picker can load OpenStreetMap tiles.
  

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
`baseAlertDistanceKm`, `controlsPanelVisible`, `dataPanelVisible`,
`dump1090BasePath`) via your browser's developer tools.

The dashboard expects the dump1090-fa JSON endpoints to live at
`http://192.168.50.100:8080/dump1090-fa/data`. Update the `DUMP1090_*` constants near the
top of `app.js` if your receiver runs on a different host, port, or protocol.

The AI assistant attempts to reach an Ollama instance on the same host that serves the
dashboard (defaulting to port `11434`). Override the target by setting `localStorage.ollamaUrl`
in your browser (for example, `http://192.168.50.4:11434`). If the dashboard is on HTTPS but
Ollama only exposes HTTP, the app now automatically retries with `http://` so LAN clients can
still connect. For lighttpd or other reverse proxies, you can also expose Ollama on the same
origin at `/ollama` (or `/ollama/`) to dodge CORS and mixed-content blocks—the app now tests
both paths automatically and will log a 404 hint if the proxy rule is missing. Saved custom
targets are normalized to strip trailing slashes so `/api/*` requests do not double up and
return 404s under strict proxies. Connection
attempts and failures are surfaced in the in-app comms log for quick debugging, including hints
when the browser blocks HTTP calls from an HTTPS dashboard.

Example lighttpd reverse proxy (requires `mod_proxy`):

```conf
$HTTP["url"] =~ "^/ollama(/|$)" {
  proxy.header = ("upgrade" => "enable")
  proxy.server = ("" => (("host" => "127.0.0.1", "port" => 11434)))
}
```

Default receiver coordinates now live in [`config.js`](config.js). Adjust the
`DEFAULT_RECEIVER_LOCATION` export there to match your station's latitude and longitude.
The sidebar shows the current coordinates so you can confirm the values in use.

The manual receiver picker works out of the box using OpenStreetMap tiles—no API keys
required. Ensure the device can briefly reach the public tile servers when you open the
picker so the basemap can load beneath the draggable marker; the dashboard automatically
cycles through alternate Leaflet CDNs if the first script request is blocked by a
firewall.

Controlled airspace footprints are also defined in [`config.js`](config.js) via the
`CONTROLLED_AIRSPACES` array. Each entry needs an ICAO code, human-friendly name,
latitude/longitude, and radius in kilometers. Tune or expand this list to reflect the
airports you care about monitoring; the radar will automatically highlight any whose
controlled region falls inside the active range rings.

Landmass silhouettes can be provided in two ways via [`config.js`](config.js):

- `LAND_MASS_SOURCES` lists remote or local GeoJSON feeds (e.g., Natural Earth coastlines).
  The app fetches the first reachable source, prunes the geometry around the receiver,
  and keeps it recentered if the receiver coordinates update.
- `LAND_MASS_OUTLINES` remains as a static fallback polygon list should you prefer to
  hard-code a small outline or operate offline.

Update either list with data for your airfield and the hashed overlay will redraw under
the radar rings automatically.

## Troubleshooting

- The status banner in the sidebar shows whether the app is connected or waiting for
  data.
- Connection issues surface in the message area and in the browser developer console
  (open it with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> or
  <kbd>Cmd</kbd>+<kbd>Opt</kbd>+<kbd>I</kbd> on macOS).
- Use the **Show Log** button under the AI panel to inspect recent dump1090 and Ollama
  requests with response codes and durations—handy when requests are routed through
  `lighttpd` or another reverse proxy.
- Click **Run AI Self-Test** in the sidebar to fire CORS and no-cors probes against all
  detected Ollama endpoints. The results land in the comms log so you can tell whether
  the browser is blocked by CORS, hitting a proxy 404, or actually reaching the
  service.
- After a failed detection or self-test, the comms log now prints an "Ollama
  remediation checklist" with the exact proxy/CORS commands to run (including a
  lighttpd snippet and server-side curl tests) based on the observed failures.
  If you see HTTP 403 in the log, Ollama is rejecting your dashboard origin;
  set `OLLAMA_ORIGINS` to the URL you use in the browser (e.g.
  `http://192.168.50.123`) or `*` and restart the service.
- To verify the server side of Ollama when troubleshooting 404/CORS errors, run these on
  the host that serves the dashboard:

  ```bash
  # Confirm Ollama responds locally
  curl -i http://127.0.0.1:11434/api/tags

  # Confirm CORS headers include your dashboard origin
  curl -i -H "Origin: http://YOUR_DASHBOARD_HOST" http://127.0.0.1:11434/api/tags

  # If using a lighttpd proxy at /ollama, confirm the path forwards correctly
  curl -i http://127.0.0.1/ollama/api/tags
  ```

  Replace `YOUR_DASHBOARD_HOST` with the hostname you load in the browser (e.g.
  `http://192.168.50.123`). Successful calls should return HTTP 200 and include
  an `Access-Control-Allow-Origin` header that permits the dashboard.
- If direct calls to `http://127.0.0.1:11434` succeed but the browser still fails
  or returns HTTP 403 when an `Origin` header is present, enable CORS directly on
  Ollama before restarting the service:

  ```bash
  export OLLAMA_ORIGINS="*"
  export OLLAMA_HOST=0.0.0.0
  systemctl restart ollama
  ```

  For a persistent change on systemd installs, add these lines to
  `/etc/systemd/system/ollama.service.d/override.conf` under `[Service]`:

  ```conf
  Environment=OLLAMA_ORIGINS=*
  Environment=OLLAMA_HOST=0.0.0.0
  ```

  Then run `systemctl daemon-reload && systemctl restart ollama`.
- If the in-app log shows `opaque/no-cors` probe results for Ollama, the browser could
  reach the service but was blocked by missing CORS headers or proxy rules; add
  `Access-Control-Allow-Origin:*` on Ollama or forward `/ollama/*` to the service on
  the same origin to resolve it.
- If the audio stream cannot be reached, the app displays a warning message in the sidebar.
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
