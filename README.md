# radar1090 HTML5

radar1090 ships as a standalone HTML5 experience designed to run the web dashboard
from any modern browser.

Two entry points are available depending on your deployment:

- `index.html`: the core radar experience without the AI copilot. Ideal for air-gapped
  or privacy-first installs where you only want flight tracking and audio.
- `radar.html`: the AI-enabled dashboard that layers Ollama-assisted commentary and
  controls on top of the standard radar UI.

**Current Version:** V1.9.67

---

## Table of Contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Quick Start](#quick-start)
4. [Raspberry Pi Hub Installation](#-raspberry-pi-hub-installation)
5. [Configuration](#configuration)
6. [Troubleshooting](#troubleshooting)
7. [Development](#development)
8. [Future Improvements](#future-improvements)

---

## Features

- Retro-styled radar display that connects to a `dump1090-fa` feed served from the same origin (e.g., `/dump1090-fa/data`).
- Integrated airband audio stream at `/airbands` so you can
  monitor radio traffic alongside aircraft movements without juggling player controls.
- Live audio status flags when the feed is silent versus carrying radio traffic by sampling the stream through a Web Audio
  analyser, plus a pulsing ring on the radar scope itself so you can see radio activity without the sidebar.
- AI commentary now automatically pauses and resumes around live airband broadcasts so controller traffic is never talked over.
- Persistent configuration stored in browser cookies, covering receiver coordinates, audio mute state, radar controls, and
  server path preferences.
- AI personas can be edited in-app (system prompt, tasking, and style hints) through a spacious full-screen workspace with
  changes stored locally so custom voice guidance survives reloads.
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
- AI comms log updates live while open so new dump1090 and Ollama events stream in without reopening the modal.
- Same-origin Ollama proxy support at `/ollama` to avoid CORS or mixed-content issues when running behind a reverse proxy.
- Hardened Dockerized reverse proxy deployment script tuned for Cloudflare Zero Trust; it binds to localhost by default to keep the gateway off the LAN while the tunnel publishes the service.
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
2. Choose the HTML entry point:
   - `index.html` for the non-AI radar dashboard.
   - `radar.html` when you want AI commentary and controls (requires access to an
     Ollama endpoint; see [Configuration](#configuration)).
   Serve either file through a static host (e.g. `python3 -m http.server`) or open it
   directly in your browser.
3. Ensure your `dump1090-fa` instance is reachable via the same origin (for example by proxying `/dump1090-fa/data`).
4. The dashboard automatically polls `receiver.json` and `aircraft.json` every five
   seconds once loaded.
5. Adjust the audio controls as needed. The **Live Audio** section starts the airband
   feed automatically—tap the mute toggle if you need to silence it temporarily.

## 🚀 Raspberry Pi Hub Installation

Use `install_radar_proxy_container.sh` when you want a self-contained deployment on a
Raspberry Pi that bundles everything into a single host:

1. **Local Audio:** Streams Airband audio from a connected RTL-SDR USB stick.
2. **Remote Radar:** Proxies ADS-B flight data from a remote feeder.
3. **Smart AI:** Auto-discovers and benchmarks Ollama servers on the LAN to find the
   fastest GPU.

### Usage

1. Clone this repository on your Raspberry Pi:

   ```bash
   git clone https://github.com/dylan7474/radar1090html5.git
   cd radar1090html5
   ```

2. Run the deployment script (requires sudo) with your desired Icecast password:

   ```bash
   chmod +x install_radar_proxy_container.sh
   sudo ./install_radar_proxy_container.sh 'YourIcecastPassword'
   ```

3. Access the dashboard at `http://<RaspberryPi_IP>/` once the installer finishes.

## Configuration

All user-facing preferences persist automatically. To clear them, delete the
`radar1090` cookies (e.g., `receiverLat`, `receiverLon`, `airbandMuted`,
`showAircraftDetails`, `beepVolumeLevel`, `radarRangeIndex`,
`baseAlertDistanceKm`, `controlsPanelVisible`, `dataPanelVisible`,
`dump1090BasePath`) via your browser's developer tools.

Open `radar.html` when you want the AI copilot features; it expects an Ollama
endpoint reachable at the same origin or as overridden below. `index.html`
skips the AI calls and only needs the `dump1090-fa` data feed.

The dashboard expects the dump1090-fa JSON endpoints to live at a relative path of
`/dump1090-fa/data` so it can operate cleanly behind a reverse proxy. Override the base path
by setting the `dump1090BasePath` cookie if your deployment uses a different subpath.

The AI assistant now targets an Ollama instance exposed at `${window.location.origin}/ollama`.
Override the target by setting `localStorage.ollamaUrl` in your browser (for example,
`https://radar.example.com/ollama`). Saved custom targets are normalized to strip trailing
slashes so `/api/*` requests do not double up and return 404s under strict proxies. Connection
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

### Containerized reverse proxy for Cloudflare Zero Trust

Run `install_radar_proxy_container.sh` when you want a hardened gateway that Cloudflare Zero Trust can publish via an Access policy or tunnel:

1. Ensure Docker and Docker Compose are available on the host. The script installs them automatically on Debian- or Red Hat-based systems if they are missing.
2. Set any required overrides as environment variables before running the script:
   - `HOST_BIND_IP=127.0.0.1` (default) keeps the container port bound to localhost so only the Cloudflare tunnel can reach it. Set `HOST_BIND_IP=0.0.0.0` if you intentionally want LAN access during testing.
   - `GATEWAY_PORT` controls the published port (defaults to `8090`).
   - `DUMP1090_IP`, `DUMP1090_PORT`, `AUDIO_IP`, and `AUDIO_PORT` point the proxy at your upstream services.
3. Execute the installer:

   ```bash
   chmod +x install_radar_proxy_container.sh
   ./install_radar_proxy_container.sh
   ```

4. Create or update your Cloudflare Tunnel to forward traffic to `http://localhost:${GATEWAY_PORT}` on the host. Apply your Cloudflare Access policy to the tunnel hostname so only authorized users reach the gateway.

The generated `nginx.conf` injects security headers, forwards client IP details to upstream services, and proxies dump1090-fa, airband audio, and Ollama through a single origin that matches the dashboard URLs.

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
- If `OLLAMA_ORIGINS="*"` is present but 403 responses persist, pin explicit
  origins instead of the wildcard—for example:

  ```bash
  export OLLAMA_ORIGINS="http://192.168.50.123,http://192.168.50.129"
  export OLLAMA_HOST=0.0.0.0
  systemctl restart ollama
  ```

  This helps on older Ollama builds that ignore `*` for security reasons. Use the
  dashboard URL(s) you actually load in the browser.
- On low-spec hosts, Ollama can take significantly longer to respond during
  discovery and chat. The app now waits up to 60 seconds for tag discovery,
  self-tests, and chat requests. If you still see timeouts immediately after
  booting, wait for the Ollama service to finish loading models before
  refreshing the dashboard.
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
- **Persona import/export** – let operators back up or share custom persona prompt
  sets across browsers or crews.
- **Ollama host picker** – surface discovered AI endpoints in the UI with latency
  hints and a manual override instead of relying solely on `localStorage` settings.
- **Improved offline handling** – surface cached aircraft history or a dedicated
  "standby" screen when the JSON endpoints are unreachable for multiple refresh
  intervals.
- **Audio device selection** – expose browser audio output/input routing controls so
  operators with multiple headsets can switch destinations without leaving the app.
- **Progressive Web App (PWA) packaging** – ship a manifest/service worker to enable
  installable home screen shortcuts and background caching for mobile or kiosk use.
- **Expanded accessibility support** – include high-contrast and reduced motion
  themes alongside additional keyboard shortcuts for the sidebar controls.
