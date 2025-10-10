const REFRESH_INTERVAL_MS = 5000;
const DISPLAY_TIMEOUT_MS = 1500;
const INBOUND_ALERT_DISTANCE_KM = 5;
const RANGE_STEPS = [5, 10, 25, 50, 100, 150, 200, 300];
const SWEEP_SPEED_STEPS = [90, 180, 270, 360];
const ALT_LOW_FEET = 10000;
const ALT_HIGH_FEET = 30000;
const FREQ_LOW = 800;
const FREQ_MID = 1200;
const FREQ_HIGH = 1800;
const EARTH_RADIUS_KM = 6371;

const canvas = document.getElementById('radar');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const aircraftInfoEl = document.getElementById('aircraft-info');
const rangeInfoEl = document.getElementById('range-info');
const messageEl = document.getElementById('message');
const hostInput = document.getElementById('server-host');
const portInput = document.getElementById('server-port');
const applyBtn = document.getElementById('apply-server');

const DEFAULT_BASE_PATH = 'dump1090-fa/data';
const SERVER_PATH_OPTIONS = [DEFAULT_BASE_PATH, 'data'];

const state = {
  server: {
    protocol: localStorage.getItem('dump1090Protocol') || 'http',
    host: localStorage.getItem('dump1090Host') || '',
    port: Number(localStorage.getItem('dump1090Port')) || 8080,
    basePath: localStorage.getItem('dump1090BasePath') || DEFAULT_BASE_PATH,
  },
  receiver: {
    lat: Number(localStorage.getItem('receiverLat')) || 54,
    lon: Number(localStorage.getItem('receiverLon')) || -1,
    hasOverride: Boolean(localStorage.getItem('receiverLat')),
  },
  running: true,
  trackedAircraft: [],
  previousPositions: new Map(),
  paintedThisTurn: new Set(),
  activeBlips: [],
  lastPingedAircraft: null,
  inboundAlertDistanceKm: INBOUND_ALERT_DISTANCE_KM,
  rangeStepIndex: 3,
  sweepSpeedIndex: 1,
  beepVolume: 10,
  controlMode: 'VOLUME',
  sweepAngle: 0,
  lastFrameTime: performance.now(),
  rotationPeriodMs: 0,
  dataConnectionOk: false,
  message: '',
  messageAlert: false,
  messageUntil: 0,
};

state.rotationPeriodMs = 360 / SWEEP_SPEED_STEPS[state.sweepSpeedIndex] * 1000;

hostInput.value = state.server.host;
portInput.value = state.server.port > 0 ? state.server.port.toString() : '';

applyBtn.addEventListener('click', () => {
  const rawHost = hostInput.value.trim();
  if (!rawHost) {
    showMessage('Enter a valid host and port', { alert: true });
    return;
  }

  let host = rawHost;
  let protocol = state.server.protocol || 'http';
  let port = Number(portInput.value);

  if (/^https?:\/\//i.test(rawHost)) {
    try {
      const url = new URL(rawHost);
      protocol = url.protocol.replace(':', '') || 'http';
      host = url.hostname;
      port = url.port ? Number(url.port) : port;
    } catch (error) {
      showMessage('Unable to parse server address', { alert: true });
      console.warn('Invalid server URL', error);
      return;
    }
  }

  if (!/^\[.*\]$/.test(host) && host.includes(':')) {
    const [hostPart, portPart] = host.split(':');
    if (hostPart && portPart && Number(portPart) > 0) {
      host = hostPart;
      port = Number(portPart);
    }
  }

  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    showMessage('Enter a valid host and port', { alert: true });
    return;
  }

  state.server.protocol = protocol;
  state.server.host = host;
  state.server.port = port;
  state.server.basePath = null;

  localStorage.setItem('dump1090Protocol', protocol);
  localStorage.setItem('dump1090Host', host);
  localStorage.setItem('dump1090Port', String(port));
  localStorage.removeItem('dump1090BasePath');
  state.dataConnectionOk = false;
  showMessage(`Server set to ${host}:${port}`);
  determineServerBasePath()
    .then(() => {
      fetchReceiverLocation().catch(() => {});
    })
    .catch((error) => {
      showMessage(`Unable to reach server: ${error.message}`, { alert: true, duration: DISPLAY_TIMEOUT_MS * 4 });
    });
});

function deg2rad(deg) {
  return (deg * Math.PI) / 180;
}

function rad2deg(rad) {
  return (rad * 180) / Math.PI;
}

function haversine(lat1, lon1, lat2, lon2) {
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(deg2rad(lon2 - lon1)) * Math.cos(deg2rad(lat2));
  const x =
    Math.cos(deg2rad(lat1)) * Math.sin(deg2rad(lat2)) -
    Math.sin(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.cos(deg2rad(lon2 - lon1));
  const brng = rad2deg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

function calculateHeading(prev, curr) {
  if (!prev) return curr.bearing;
  const delta = calculateBearing(prev.lat, prev.lon, curr.lat, curr.lon);
  return Number.isFinite(delta) ? delta : curr.bearing;
}

function getBeepFrequencyForAltitude(altitude) {
  if (altitude == null || altitude < 0) return FREQ_MID;
  if (altitude < ALT_LOW_FEET) return FREQ_LOW;
  if (altitude < ALT_HIGH_FEET) return FREQ_MID;
  return FREQ_HIGH;
}

function showMessage(text, options = {}) {
  const { alert = false, duration = DISPLAY_TIMEOUT_MS } = options;
  state.message = text;
  state.messageAlert = alert;
  state.messageUntil = performance.now() + duration;
  updateMessage();
}

function updateMessage() {
  if (!state.message) {
    messageEl.textContent = '';
    messageEl.classList.remove('alert');
    return;
  }

  if (performance.now() > state.messageUntil) {
    state.message = '';
    messageEl.textContent = '';
    messageEl.classList.remove('alert');
    return;
  }

  messageEl.textContent = state.message;
  messageEl.classList.toggle('alert', state.messageAlert);
}

function updateRangeInfo() {
  const mode = state.controlMode === 'VOLUME' ? 'Volume' : 'Sweep';
  const value = state.controlMode === 'VOLUME'
    ? `${state.beepVolume}`
    : `${SWEEP_SPEED_STEPS[state.sweepSpeedIndex]}°/s`;

  const rangeLines = [
    { label: 'Range', value: `${RANGE_STEPS[state.rangeStepIndex]} km` },
    { label: 'Alert', value: `${state.inboundAlertDistanceKm.toFixed(1)} km` },
    { label: `Mode (${mode})`, value },
  ];

  rangeInfoEl.innerHTML = rangeLines
    .map(({ label, value }) => `<div class="info-line"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');
}

function updateAircraftInfo() {
  const info = state.lastPingedAircraft;
  if (!info) {
    aircraftInfoEl.innerHTML = '<p>Scanning…</p>';
    return;
  }

  const lines = [
    { label: 'Flight', value: info.flight || '-----' },
    { label: 'Hex', value: info.hex || '-----' },
    { label: 'Distance', value: `${info.distanceKm.toFixed(1)} km` },
    { label: 'Altitude', value: info.altitude > 0 ? `${info.altitude} ft` : '-----' },
    { label: 'Speed', value: info.groundSpeed > 0 ? `${info.groundSpeed.toFixed(0)} kt` : '---' },
  ];

  aircraftInfoEl.innerHTML = lines
    .map(({ label, value }) => `<div class="info-line"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');
}

function updateStatus() {
  if (!state.server.host) {
    statusEl.textContent = 'Enter a dump1090-fa server to begin.';
    return;
  }
  const status = state.dataConnectionOk ? 'Connected' : 'Waiting for data…';
  statusEl.textContent = `${status} – ${state.server.host}:${state.server.port}`;
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = canvas.clientWidth * dpr;
  const displayHeight = canvas.clientHeight * dpr;
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
}

const audioContext = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  ? new (window.AudioContext || window.webkitAudioContext)()
  : null;
let beepTimeout = null;

function playBeep(freq, durationMs) {
  if (!audioContext || state.beepVolume <= 0) return;
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  if (beepTimeout) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  const duration = durationMs / 1000;
  const maxGain = 0.25 * (state.beepVolume / 20);

  oscillator.type = 'sine';
  oscillator.frequency.value = freq;
  oscillator.connect(gain).connect(audioContext.destination);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(maxGain, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.05);

  beepTimeout = setTimeout(() => {
    beepTimeout = null;
  }, durationMs);
}

function buildUrl(path) {
  const { protocol, host, port, basePath } = state.server;
  const safeBase = (basePath || DEFAULT_BASE_PATH).replace(/^\/+|\/+$/g, '');
  const portPart = port ? `:${port}` : '';
  return `${protocol}://${host}${portPart}/${safeBase}/${path}`;
}

async function fetchJson(url, { timeout = 4000 } = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(id);
  }
}

async function fetchReceiverLocation() {
  if (!state.server.host) return;
  try {
    const data = await fetchJson(buildUrl('receiver.json'));
    if (typeof data.lat === 'number' && typeof data.lon === 'number') {
      state.receiver.lat = data.lat;
      state.receiver.lon = data.lon;
      localStorage.setItem('receiverLat', String(data.lat));
      localStorage.setItem('receiverLon', String(data.lon));
    }
  } catch (error) {
    console.warn('Failed to fetch receiver location', error);
  }
}

async function pollData() {
  while (state.running) {
    if (!state.server.host) {
      await new Promise((resolve) => setTimeout(resolve, REFRESH_INTERVAL_MS));
      continue;
    }
    if (!state.server.basePath) {
      try {
        await determineServerBasePath();
      } catch (error) {
        console.warn('Failed to determine dump1090 path', error);
        showMessage(`Unable to reach server: ${error.message}`, { alert: true, duration: DISPLAY_TIMEOUT_MS * 4 });
        await new Promise((resolve) => setTimeout(resolve, REFRESH_INTERVAL_MS));
        continue;
      }
    }
    try {
      const data = await fetchJson(buildUrl('aircraft.json'));
      processAircraftData(data);
      state.dataConnectionOk = true;
    } catch (error) {
      console.warn('Failed to fetch aircraft data', error);
      state.dataConnectionOk = false;
      state.trackedAircraft = [];
      state.previousPositions.clear();
      state.paintedThisTurn.clear();
      state.activeBlips = [];
      state.server.basePath = null;
      showMessage('Failed to fetch aircraft data. Check server settings.', { alert: true, duration: DISPLAY_TIMEOUT_MS * 2 });
    }
    updateStatus();
    updateRangeInfo();
    updateAircraftInfo();
    await new Promise((resolve) => setTimeout(resolve, REFRESH_INTERVAL_MS));
  }
}

async function determineServerBasePath() {
  const { host, port, protocol, basePath } = state.server;
  if (!host) return null;

  const candidates = basePath
    ? [basePath, ...SERVER_PATH_OPTIONS.filter((option) => option !== basePath)]
    : SERVER_PATH_OPTIONS;

  let lastError = null;
  for (const candidate of candidates) {
    const safeCandidate = candidate.replace(/^\/+|\/+$/g, '');
    const portPart = port ? `:${port}` : '';
    const url = `${protocol}://${host}${portPart}/${safeCandidate}/receiver.json`;
    try {
      await fetchJson(url, { timeout: 2500 });
      state.server.basePath = safeCandidate;
      localStorage.setItem('dump1090BasePath', safeCandidate);
      showMessage(`Connected via /${safeCandidate}`, { duration: DISPLAY_TIMEOUT_MS });
      return safeCandidate;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No dump1090 endpoints found');
}

function processAircraftData(data) {
  if (!data || !Array.isArray(data.aircraft)) {
    state.trackedAircraft = [];
    return;
  }
  const radarRangeKm = RANGE_STEPS[state.rangeStepIndex];
  const previousPositions = state.previousPositions;
  const nextPositions = new Map();
  const aircraft = [];
  const inboundNames = [];

  for (const entry of data.aircraft) {
    if (typeof entry.lat !== 'number' || typeof entry.lon !== 'number') continue;
    const lat = entry.lat;
    const lon = entry.lon;
    const distanceKm = haversine(state.receiver.lat, state.receiver.lon, lat, lon);
    if (!Number.isFinite(distanceKm) || distanceKm > radarRangeKm) continue;

    const bearing = calculateBearing(state.receiver.lat, state.receiver.lon, lat, lon);
    const hex = typeof entry.hex === 'string' ? entry.hex.trim().toUpperCase() : '';
    const flight = typeof entry.flight === 'string' ? entry.flight.trim() : '';

    const prev = hex ? previousPositions.get(hex) : null;
    const heading = calculateHeading(prev, { lat, lon, bearing });

    const altitude = Number.isInteger(entry.alt_baro) ? entry.alt_baro : -1;
    const groundSpeed = typeof entry.gs === 'number' ? entry.gs : -1;

    const craft = {
      flight,
      hex,
      lat,
      lon,
      distanceKm,
      bearing,
      heading,
      altitude,
      groundSpeed,
      inbound: false,
    };

    const inboundResult = evaluateInbound(craft);
    craft.inbound = inboundResult.inbound;
    if (inboundResult.inbound) {
      inboundNames.push(inboundResult.name);
      craft.minutesToBase = inboundResult.minutesToBase;
    }

    aircraft.push(craft);
    if (hex) {
      nextPositions.set(hex, { lat, lon });
    }
  }

  state.trackedAircraft = aircraft;
  state.previousPositions = nextPositions;
  state.paintedThisTurn = new Set();

  if (inboundNames.length > 0) {
    const unique = [...new Set(inboundNames)];
    const message = unique.length === 1
      ? `Inbound alert: ${unique[0]}`
      : `Inbound alert: ${unique.slice(0, 3).join(', ')}${unique.length > 3 ? '…' : ''}`;
    showMessage(message, { alert: true, duration: DISPLAY_TIMEOUT_MS * 2 });
  }
}

function evaluateInbound(craft) {
  const name = craft.flight || craft.hex || 'Unknown';
  const headingToBase = (craft.bearing + 180) % 360;
  let diff = Math.abs(headingToBase - craft.heading);
  diff = (diff + 360) % 360;
  if (diff > 180) diff = 360 - diff;
  const distanceAlong = craft.distanceKm * Math.cos(deg2rad(diff));
  if (distanceAlong <= 0) return { inbound: false, name };
  const minDist = craft.distanceKm * Math.sin(deg2rad(diff));
  const inbound = minDist <= state.inboundAlertDistanceKm;
  let minutesToBase = null;
  if (inbound && craft.groundSpeed > 0) {
    const speedKmh = craft.groundSpeed * 1.852;
    if (speedKmh > 0) {
      minutesToBase = Math.round((distanceAlong / speedKmh) * 60);
    }
  }
  return { inbound, name, minutesToBase };
}

function drawRadar(deltaTime) {
  resizeCanvas();
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const centerX = width * 0.7;
  const centerY = height / 2;
  const radarRadius = height * 0.4;

  // background glow
  const gradient = ctx.createRadialGradient(centerX, centerY, radarRadius * 0.1, centerX, centerY, radarRadius);
  gradient.addColorStop(0, 'rgba(53, 255, 153, 0.25)');
  gradient.addColorStop(1, 'rgba(11, 14, 23, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = Math.max(1, radarRadius * 0.0025);
  ctx.strokeStyle = 'rgba(53,255,153,0.35)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radarRadius * 0.66, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radarRadius * 0.33, 0, Math.PI * 2);
  ctx.stroke();

  // radial lines
  ctx.save();
  ctx.translate(centerX, centerY);
  for (let angle = 0; angle < 360; angle += 30) {
    const rad = deg2rad(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(rad) * radarRadius, -Math.cos(rad) * radarRadius);
    ctx.stroke();
  }
  ctx.restore();

  // sweep update
  const sweepSpeed = SWEEP_SPEED_STEPS[state.sweepSpeedIndex];
  const sweepAdvance = sweepSpeed * deltaTime;
  const previousAngle = state.sweepAngle;
  state.sweepAngle = (state.sweepAngle + sweepAdvance) % 360;
  const sweepWrapped = state.sweepAngle < previousAngle;

  // sweep arc
  const sweepStart = deg2rad(state.sweepAngle - 2);
  const sweepEnd = deg2rad(state.sweepAngle + 2);
  const sweepGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radarRadius);
  sweepGradient.addColorStop(0, 'rgba(53,255,153,0.6)');
  sweepGradient.addColorStop(1, 'rgba(53,255,153,0)');
  ctx.fillStyle = sweepGradient;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, radarRadius, sweepStart, sweepEnd);
  ctx.closePath();
  ctx.fill();

  // draw range text
  ctx.fillStyle = 'rgba(200,230,220,0.6)';
  ctx.font = `${Math.round(radarRadius * 0.09)}px "Share Tech Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${RANGE_STEPS[state.rangeStepIndex]} km`, centerX, centerY + radarRadius + radarRadius * 0.12);

  const radarRangeKm = RANGE_STEPS[state.rangeStepIndex];
  const now = performance.now();
  const newBlips = [];

  for (const craft of state.trackedAircraft) {
    if (!state.paintedThisTurn.has(craft.hex || craft.flight)) {
      const target = craft.bearing;
      const crossed =
        (!sweepWrapped && previousAngle <= target && state.sweepAngle >= target) ||
        (sweepWrapped && (target >= previousAngle || target <= state.sweepAngle));
      if (crossed) {
        const angleRad = deg2rad(target);
        const screenRadius = Math.min(1, craft.distanceKm / radarRangeKm) * radarRadius;
        const x = centerX + Math.sin(angleRad) * screenRadius;
        const y = centerY - Math.cos(angleRad) * screenRadius;
        const minutesToBase = craft.minutesToBase;
        newBlips.push({
          x,
          y,
          spawn: now,
          heading: craft.heading,
          inbound: craft.inbound,
          minutesToBase: Number.isFinite(minutesToBase) ? minutesToBase : null,
          hex: craft.hex || craft.flight,
        });
        state.paintedThisTurn.add(craft.hex || craft.flight);
        state.lastPingedAircraft = craft;
        playBeep(getBeepFrequencyForAltitude(craft.altitude), 50);
      }
    }
  }

  if (newBlips.length > 0) {
    state.activeBlips.push(...newBlips);
  }

  const rotationPeriod = state.rotationPeriodMs || (360 / sweepSpeed) * 1000;
  state.activeBlips = state.activeBlips.filter((blip) => now - blip.spawn < rotationPeriod);

  // draw blips
  for (const blip of state.activeBlips) {
    const age = (now - blip.spawn) / rotationPeriod;
    const alpha = Math.max(0, 1 - age);
    ctx.save();
    ctx.globalAlpha = blip.inbound ? Math.max(0.2, alpha) : alpha * 0.9;
    ctx.fillStyle = blip.inbound ? 'rgba(255,103,103,1)' : 'rgba(53,255,153,1)';
    ctx.beginPath();
    ctx.arc(blip.x, blip.y, radarRadius * 0.02, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = blip.inbound ? 'rgba(255,103,103,0.8)' : 'rgba(53,255,153,0.6)';
    ctx.lineWidth = radarRadius * 0.0025;
    const headingRad = deg2rad(blip.heading);
    ctx.beginPath();
    ctx.moveTo(blip.x, blip.y);
    ctx.lineTo(blip.x + Math.sin(headingRad) * radarRadius * 0.05, blip.y - Math.cos(headingRad) * radarRadius * 0.05);
    ctx.stroke();

    if (blip.minutesToBase != null && blip.inbound) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `${Math.round(radarRadius * 0.06)}px "Share Tech Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${blip.minutesToBase}m`, blip.x, blip.y - radarRadius * 0.04);
    }
    ctx.restore();
  }

  updateMessage();
  updateAircraftInfo();
}

function handleKeyDown(event) {
  if (event.target instanceof HTMLInputElement) return;
  const key = event.key.toLowerCase();
  const prevent = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', '+', '-', '='];
  if (prevent.includes(key) || event.key === '+' || event.key === '-') {
    event.preventDefault();
  }

  switch (event.key) {
    case 'm':
    case 'M':
      state.controlMode = state.controlMode === 'VOLUME' ? 'SPEED' : 'VOLUME';
      showMessage(`Mode: ${state.controlMode === 'VOLUME' ? 'Volume' : 'Sweep Speed'}`);
      break;
    case '+':
    case '=':
      if (state.controlMode === 'VOLUME') {
        state.beepVolume = Math.min(20, state.beepVolume + 1);
        showMessage(`Volume: ${state.beepVolume}`);
      } else {
        state.sweepSpeedIndex = Math.min(SWEEP_SPEED_STEPS.length - 1, state.sweepSpeedIndex + 1);
        state.rotationPeriodMs = 360 / SWEEP_SPEED_STEPS[state.sweepSpeedIndex] * 1000;
        showMessage(`Sweep: ${SWEEP_SPEED_STEPS[state.sweepSpeedIndex]}°/s`);
      }
      break;
    case '-':
      if (state.controlMode === 'VOLUME') {
        state.beepVolume = Math.max(0, state.beepVolume - 1);
        showMessage(`Volume: ${state.beepVolume}`);
      } else {
        state.sweepSpeedIndex = Math.max(0, state.sweepSpeedIndex - 1);
        state.rotationPeriodMs = 360 / SWEEP_SPEED_STEPS[state.sweepSpeedIndex] * 1000;
        showMessage(`Sweep: ${SWEEP_SPEED_STEPS[state.sweepSpeedIndex]}°/s`);
      }
      break;
    case 'ArrowUp':
      state.rangeStepIndex = Math.min(RANGE_STEPS.length - 1, state.rangeStepIndex + 1);
      showMessage(`Range: ${RANGE_STEPS[state.rangeStepIndex]} km`);
      state.paintedThisTurn.clear();
      break;
    case 'ArrowDown':
      state.rangeStepIndex = Math.max(0, state.rangeStepIndex - 1);
      showMessage(`Range: ${RANGE_STEPS[state.rangeStepIndex]} km`);
      state.paintedThisTurn.clear();
      break;
    case 'ArrowLeft':
      state.inboundAlertDistanceKm = Math.max(1, state.inboundAlertDistanceKm - 1);
      showMessage(`Alert radius: ${state.inboundAlertDistanceKm.toFixed(1)} km`);
      break;
    case 'ArrowRight':
      state.inboundAlertDistanceKm = Math.min(20, state.inboundAlertDistanceKm + 1);
      showMessage(`Alert radius: ${state.inboundAlertDistanceKm.toFixed(1)} km`);
      break;
    default:
      return;
  }

  updateRangeInfo();
}

document.addEventListener('keydown', handleKeyDown, { passive: false });

function loop() {
  if (!state.running) return;
  const now = performance.now();
  const deltaTime = (now - state.lastFrameTime) / 1000;
  state.lastFrameTime = now;
  drawRadar(deltaTime);
  requestAnimationFrame(loop);
}

updateStatus();
updateRangeInfo();
updateAircraftInfo();
fetchReceiverLocation().catch(() => {});
pollData();
requestAnimationFrame(loop);
