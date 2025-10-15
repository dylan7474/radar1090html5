import { CONTROLLED_AIRSPACES, DEFAULT_RECEIVER_LOCATION } from './config.js';

const REFRESH_INTERVAL_MS = 5000;
const AUDIO_RETRY_INTERVAL_MS = 8000;
const DISPLAY_TIMEOUT_MS = 1500;
const INBOUND_ALERT_DISTANCE_KM = 5;
const RANGE_STEPS = [5, 10, 25, 50, 100, 150, 200, 300];
const DEFAULT_RANGE_STEP_INDEX = Math.max(0, Math.min(3, RANGE_STEPS.length - 1));
const DEFAULT_BEEP_VOLUME = 10;
const SWEEP_SPEED_DEG_PER_SEC = 90;
const APP_VERSION = 'v1.5.1';
const ALT_LOW_FEET = 10000;
const ALT_HIGH_FEET = 30000;
const FREQ_LOW = 800;
const FREQ_MID = 1200;
const FREQ_HIGH = 1800;
const EARTH_RADIUS_KM = 6371;
const AUDIO_STREAM_URL = 'https://audio.dylanjones.org/airbands';
const AUDIO_MUTED_STORAGE_KEY = 'airbandMuted';
const AIRCRAFT_DETAILS_STORAGE_KEY = 'showAircraftDetails';
const BEEP_VOLUME_STORAGE_KEY = 'beepVolumeLevel';
const RANGE_INDEX_STORAGE_KEY = 'radarRangeIndex';
const ALERT_DISTANCE_STORAGE_KEY = 'inboundAlertDistanceKm';
const RADAR_ORIENTATION_STORAGE_KEY = 'radarOrientationQuarterTurns';
const DUMP1090_PROTOCOL = 'https';
const DUMP1090_HOST = 'dump1090.dylanjones.org';
const DUMP1090_PORT = 443;
// Persist user preferences in cookies so they survive reloads and browser restarts.
const COOKIE_MAX_AGE_DAYS = 365;

const readCookie = (name) => {
  const cookiePrefix = `${encodeURIComponent(name)}=`;
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const entry of cookies) {
    const trimmed = entry.trim();
    if (trimmed.startsWith(cookiePrefix)) {
      return decodeURIComponent(trimmed.substring(cookiePrefix.length));
    }
  }
  return null;
};

const writeCookie = (name, value, maxAgeDays = COOKIE_MAX_AGE_DAYS) => {
  const maxAgeSeconds = Math.max(1, Math.floor(maxAgeDays * 24 * 60 * 60));
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)};path=/;max-age=${maxAgeSeconds};samesite=lax`;
};

const readIntPreference = (key, fallback, min, max) => {
  const raw = readCookie(key);
  if (raw === null) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
};

const readReceiverCoordinate = (storageKey, fallback) => {
  const storedValue = readCookie(storageKey);
  if (storedValue === null) {
    return { value: fallback, hasOverride: false };
  }

  const parsedValue = Number(storedValue);
  if (Number.isFinite(parsedValue)) {
    return { value: parsedValue, hasOverride: true };
  }

  return { value: fallback, hasOverride: false };
};

const receiverLatConfig = readReceiverCoordinate('receiverLat', DEFAULT_RECEIVER_LOCATION.lat);
const receiverLonConfig = readReceiverCoordinate('receiverLon', DEFAULT_RECEIVER_LOCATION.lon);
const receiverHasOverride = receiverLatConfig.hasOverride || receiverLonConfig.hasOverride;

const canvas = document.getElementById('radar');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const aircraftInfoEl = document.getElementById('aircraft-info');
const rangeInfoEl = document.getElementById('range-info');
const receiverInfoEl = document.getElementById('receiver-info');
const messageEl = document.getElementById('message');
const versionEl = document.getElementById('version');
const volumeLabelEl = document.getElementById('volume-label');
const volumeDescriptionEl = document.getElementById('volume-description');
const volumeValueEl = document.getElementById('volume-value');
const volumeDecreaseBtn = document.getElementById('volume-decrease');
const volumeIncreaseBtn = document.getElementById('volume-increase');
const rangeValueEl = document.getElementById('range-value');
const rangeDecreaseBtn = document.getElementById('range-decrease');
const rangeIncreaseBtn = document.getElementById('range-increase');
const alertValueEl = document.getElementById('alert-value');
const alertDecreaseBtn = document.getElementById('alert-decrease');
const alertIncreaseBtn = document.getElementById('alert-increase');
const audioStreamEl = document.getElementById('airband-stream');
const audioMuteToggleBtn = document.getElementById('audio-mute-toggle');
const audioStatusEl = document.getElementById('audio-status');
const aircraftDetailsToggleBtn = document.getElementById('aircraft-details-toggle');
const aircraftDetailsStateEl = document.getElementById('aircraft-details-state');

const ICON_SCALE_DEFAULT = 1;
const ICON_SCALE_MIN = 0.65;
const ICON_SCALE_MAX = 1.4;

const DEFAULT_ICON_KEY = 'medium';
// Icon files shipped with the dashboard keyed by the semantic type we want to render.
const ICON_DEFINITIONS = {
  light: 'Light.png',
  medium: 'Medium.png',
  heavy: 'Heavy.png',
  rotor: 'Rotar.png',
  glider: 'Glider.png',
  lighterThanAir: 'LighterThanAir.png',
  drone: 'DroneUAV.png',
};

const iconLibrary = Object.entries(ICON_DEFINITIONS).reduce((acc, [key, src]) => {
  acc[key] = {
    image: new Image(),
    ready: false,
    aspect: 1,
    canvas: null,
    src,
  };
  return acc;
}, {});

// First character of the wake turbulence category -> icon key.
const WTC_ICON_MAP = {
  L: 'light',
  S: 'light',
  M: 'medium',
  H: 'heavy',
  J: 'heavy',
};

// ADS-B emitter category prefixes that imply a specific aircraft class.
const CATEGORY_ICON_MAP = {
  A1: 'light',
  A2: 'medium',
  A3: 'heavy',
  A4: 'heavy',
  A5: 'medium',
  A6: 'rotor',
  A7: 'glider',
  A8: 'lighterThanAir',
  A9: 'light',
  AA: 'glider',
  AC: 'drone',
};

const SPECIES_ICON_MAP = {
  4: 'rotor',
  5: 'rotor',
  6: 'rotor',
};

function resolveIconKeyFromWtc(entry) {
  const raw = typeof entry.wtc === 'string' ? entry.wtc.trim().toUpperCase() : '';
  if (!raw) return null;
  const key = WTC_ICON_MAP[raw.charAt(0)];
  return key ?? null;
}

function resolveIconKeyFromCategory(entry) {
  const category = typeof entry.category === 'string' ? entry.category.trim().toUpperCase() : '';
  if (!category || category.length < 2) return null;
  const prefix = category.substring(0, 2);
  const mapped = CATEGORY_ICON_MAP[prefix];
  if (mapped) {
    return mapped;
  }
  if (category.charAt(0) === 'A') {
    const sizeCode = category.charAt(1);
    if (sizeCode === '1') return 'light';
    if (sizeCode === '2' || sizeCode === '5') return 'medium';
    if (sizeCode === '3' || sizeCode === '4') return 'heavy';
  }
  return null;
}

function resolveIconKeyFromSpecies(entry) {
  const species = Number.isInteger(entry.species) ? entry.species : null;
  if (species === null) return null;
  const mapped = SPECIES_ICON_MAP[species];
  return mapped ?? null;
}

function resolveAircraftIconKey(entry) {
  // Prefer the most specific metadata that dump1090 exposes and fall back to
  // wake turbulence or generic size categories when detailed types are absent.
  const fromWtc = resolveIconKeyFromWtc(entry);
  if (fromWtc) return fromWtc;

  const fromCategory = resolveIconKeyFromCategory(entry);
  if (fromCategory) return fromCategory;

  const fromSpecies = resolveIconKeyFromSpecies(entry);
  if (fromSpecies) return fromSpecies;

  return DEFAULT_ICON_KEY;
}

const WAKE_TURBULENCE_SCALES = {
  L: 0.8,
  S: 0.85,
  M: 1,
  H: 1.25,
  J: 1.35,
};

const EMITTER_CATEGORY_LEVEL_SCALES = {
  0: 1,
  1: 0.8,
  2: 0.95,
  3: 1.1,
  4: 1.18,
  5: 1.28,
  6: 1,
  7: 0.85,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function getWakeTurbulenceScale(entry) {
  const raw = typeof entry.wtc === 'string' ? entry.wtc.trim().toUpperCase() : '';
  if (!raw) return null;
  const key = raw.charAt(0);
  const scale = WAKE_TURBULENCE_SCALES[key];
  return typeof scale === 'number' ? scale : null;
}

function getEmitterCategoryScale(entry) {
  const category = typeof entry.category === 'string' ? entry.category.trim().toUpperCase() : '';
  if (!category || category.length < 2) return null;
  const levelDigit = category.charAt(1);
  const level = Number.parseInt(levelDigit, 10);
  if (!Number.isFinite(level)) return null;
  const scale = EMITTER_CATEGORY_LEVEL_SCALES[level];
  return typeof scale === 'number' ? scale : null;
}

// Determine a display scale for the aircraft icon using available ADS-B metadata.
function resolveAircraftIconScale(entry) {
  const wakeScale = getWakeTurbulenceScale(entry);
  if (typeof wakeScale === 'number') {
    return clamp(wakeScale, ICON_SCALE_MIN, ICON_SCALE_MAX);
  }

  const categoryScale = getEmitterCategoryScale(entry);
  if (typeof categoryScale === 'number') {
    return clamp(categoryScale, ICON_SCALE_MIN, ICON_SCALE_MAX);
  }

  return ICON_SCALE_DEFAULT;
}

function getBlipIconScale(blip) {
  return Number.isFinite(blip?.iconScale) ? blip.iconScale : ICON_SCALE_DEFAULT;
}

// The label offsets depend on the rendered marker height so inbound callouts clear the icon.
function getIconState(blip) {
  const key = blip?.iconKey;
  if (key && iconLibrary[key]) {
    return iconLibrary[key];
  }
  return iconLibrary[DEFAULT_ICON_KEY];
}

function getBlipMarkerHeight(blip, radarRadius) {
  const scale = getBlipIconScale(blip);
  const iconState = getIconState(blip);
  if (iconState?.ready) {
    return radarRadius * 0.14 * scale * iconState.aspect;
  }
  return radarRadius * 0.04 * scale;
}

function getBlipMarkerWidth(blip, radarRadius) {
  const scale = getBlipIconScale(blip);
  const iconState = getIconState(blip);
  if (iconState?.ready) {
    return radarRadius * 0.14 * scale;
  }
  return radarRadius * 0.04 * scale;
}

function createTransparentIconCanvas(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    throw new Error('Icon has invalid dimensions');
  }

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;

  const offscreenCtx = offscreen.getContext('2d', { willReadFrequently: true });
  offscreenCtx.drawImage(image, 0, 0, width, height);

  try {
    const imageData = offscreenCtx.getImageData(0, 0, width, height);
    const { data } = imageData;
    const threshold = 40;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const isBackground = r < threshold && g < threshold && b < threshold;
      if (isBackground) {
        data[i + 3] = 0;
        continue;
      }

      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }

    offscreenCtx.putImageData(imageData, 0, 0);
  } catch (error) {
    console.warn('Unable to process icon transparency', error);
  }

  return {
    canvas: offscreen,
    aspect: height / width,
  };
}

for (const state of Object.values(iconLibrary)) {
  const { image, src } = state;
  image.decoding = 'async';
  image.addEventListener('load', () => {
    try {
      const processed = createTransparentIconCanvas(image);
      state.canvas = processed.canvas;
      state.aspect = processed.aspect;
      state.ready = true;
    } catch (error) {
      state.ready = image.naturalWidth > 0;
      state.aspect = image.naturalWidth > 0
        ? image.naturalHeight / image.naturalWidth
        : 1;
      console.warn(`Icon ${src} loaded without transparency adjustments`, error);
    }
  });
  image.addEventListener('error', (error) => {
    state.ready = false;
    console.warn(`Failed to load icon ${src}`, error);
  });
  image.src = src;
}

const DEFAULT_BASE_PATH = 'dump1090-fa/data';
const SERVER_PATH_OPTIONS = [DEFAULT_BASE_PATH, 'data'];
const savedAircraftDetailsSetting = readCookie(AIRCRAFT_DETAILS_STORAGE_KEY);
const savedBeepVolume = readIntPreference(BEEP_VOLUME_STORAGE_KEY, DEFAULT_BEEP_VOLUME, 0, 20);
const savedRangeStepIndex = readIntPreference(
  RANGE_INDEX_STORAGE_KEY,
  DEFAULT_RANGE_STEP_INDEX,
  0,
  Math.max(RANGE_STEPS.length - 1, 0),
);
const savedAlertRadius = readIntPreference(
  ALERT_DISTANCE_STORAGE_KEY,
  INBOUND_ALERT_DISTANCE_KM,
  1,
  20,
);
const savedRadarOrientation = readIntPreference(
  RADAR_ORIENTATION_STORAGE_KEY,
  0,
  0,
  3,
);
const state = {
  server: {
    protocol: DUMP1090_PROTOCOL,
    host: DUMP1090_HOST,
    port: DUMP1090_PORT,
    basePath: readCookie('dump1090BasePath') || DEFAULT_BASE_PATH,
  },
  receiver: {
    lat: receiverLatConfig.value,
    lon: receiverLonConfig.value,
    hasOverride: receiverHasOverride,
  },
  running: true,
  trackedAircraft: [],
  previousPositions: new Map(),
  paintedRotation: new Map(),
  currentSweepId: 0,
  activeBlips: [],
  airspacesInRange: [],
  lastPingedAircraft: null,
  inboundAlertDistanceKm: savedAlertRadius,
  rangeStepIndex: savedRangeStepIndex,
  beepVolume: savedBeepVolume,
  sweepAngle: 0,
  lastFrameTime: performance.now(),
  rotationPeriodMs: 0,
  radarRotationQuarterTurns: savedRadarOrientation,
  dataConnectionOk: false,
  message: '',
  messageAlert: false,
  messageUntil: 0,
  showAircraftDetails: savedAircraftDetailsSetting === 'true',
};

state.rotationPeriodMs = (360 / SWEEP_SPEED_DEG_PER_SEC) * 1000;

let audioStreamError = false;
let audioAutoplayBlocked = false;
let audioUnlockListenerAttached = false;
let desiredAudioMuted = false;
let pendingAutoUnmute = false;
let audioRetryTimer = null;
let autoplayHintShown = false;

function updateAudioStatus(text, options = {}) {
  if (!audioStatusEl) {
    return;
  }

  const { alert = false } = options;
  audioStatusEl.textContent = text;
  audioStatusEl.classList.toggle('alert', alert);
}

function refreshAudioStreamControls() {
  if (!audioStreamEl) {
    return;
  }

  const isMuted = desiredAudioMuted;
  if (audioMuteToggleBtn) {
    audioMuteToggleBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    audioMuteToggleBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    const highlight = !isMuted && !audioStreamError && !audioAutoplayBlocked && !pendingAutoUnmute;
    audioMuteToggleBtn.classList.toggle('primary', highlight);
  }

  if (audioStreamError) {
    updateAudioStatus('Stream unavailable', { alert: true });
    return;
  }

  if (audioAutoplayBlocked && !isMuted) {
    updateAudioStatus('Autoplay blocked. Tap anywhere to start audio.', { alert: true });
    if (!autoplayHintShown) {
      autoplayHintShown = true;
      showMessage('Browser blocked autoplay—tap anywhere to enable the live feed.', {
        alert: true,
        duration: DISPLAY_TIMEOUT_MS * 4,
      });
    }
    return;
  }

  if (pendingAutoUnmute) {
    updateAudioStatus('Starting audio…');
    return;
  }

  if (isMuted) {
    updateAudioStatus('Muted');
    return;
  }

  if (audioStreamEl.paused) {
    updateAudioStatus('Connecting…');
    return;
  }

  updateAudioStatus('Live');
}

function refreshAircraftDetailsControls() {
  if (!aircraftDetailsToggleBtn) {
    return;
  }

  const enabled = state.showAircraftDetails;
  aircraftDetailsToggleBtn.textContent = enabled ? 'Hide' : 'Show';
  aircraftDetailsToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  aircraftDetailsToggleBtn.classList.toggle('primary', enabled);

  if (aircraftDetailsStateEl) {
    aircraftDetailsStateEl.textContent = enabled ? 'Visible' : 'Hidden';
  }
}

function ensureAudioUnlockListener() {
  if (audioUnlockListenerAttached) {
    return;
  }

  const handleFirstInteraction = () => {
    if (!audioUnlockListenerAttached) {
      return;
    }

    audioUnlockListenerAttached = false;
    if (audioStreamEl) {
      attemptAudioPlayback();
    }
  };

  audioUnlockListenerAttached = true;
  const options = { once: true };
  const unlockEvents = [
    'pointerdown',
    'pointerup',
    'touchstart',
    'touchend',
    'click',
    'keydown',
    'keyup',
  ];
  unlockEvents.forEach((eventName) => {
    document.addEventListener(eventName, handleFirstInteraction, options);
  });
}

function clearAudioRetryTimer() {
  if (audioRetryTimer !== null) {
    window.clearTimeout(audioRetryTimer);
    audioRetryTimer = null;
  }
}

function scheduleAudioRetry() {
  clearAudioRetryTimer();
  audioRetryTimer = window.setTimeout(() => {
    audioRetryTimer = null;
    attemptAudioPlayback();
  }, AUDIO_RETRY_INTERVAL_MS);
}

function handleAudioPlaybackSuccess() {
  audioAutoplayBlocked = false;
  audioStreamError = false;
  autoplayHintShown = false;
  if (!desiredAudioMuted && pendingAutoUnmute) {
    audioStreamEl.muted = false;
  } else {
    audioStreamEl.muted = desiredAudioMuted;
  }
  pendingAutoUnmute = false;
  clearAudioRetryTimer();
  refreshAudioStreamControls();
}

function handleAudioPlaybackFailure(error) {
  autoplayHintShown = false;
  if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') {
    audioAutoplayBlocked = true;
    ensureAudioUnlockListener();
  } else {
    audioStreamError = true;
    showMessage('Audio stream unavailable. Check the receiver.', {
      alert: true,
      duration: DISPLAY_TIMEOUT_MS * 2,
    });
    console.warn('Unable to start audio stream', error);
    scheduleAudioRetry();
  }
  refreshAudioStreamControls();
}

function attemptAudioPlayback() {
  if (!audioStreamEl) {
    return Promise.resolve();
  }

  if (
    typeof HTMLMediaElement !== 'undefined' &&
    audioStreamEl.readyState === HTMLMediaElement.HAVE_NOTHING
  ) {
    audioStreamEl.load();
  }

  if (desiredAudioMuted) {
    pendingAutoUnmute = false;
    audioStreamEl.muted = true;
  } else {
    pendingAutoUnmute = true;
    audioStreamEl.muted = true;
  }

  refreshAudioStreamControls();

  try {
    const playResult = audioStreamEl.play();
    if (playResult && typeof playResult.then === 'function') {
      return playResult.then(handleAudioPlaybackSuccess).catch((error) => {
        handleAudioPlaybackFailure(error);
      });
    }

    handleAudioPlaybackSuccess();
    return Promise.resolve();
  } catch (error) {
    handleAudioPlaybackFailure(error);
    return Promise.resolve();
  }
}

if (versionEl) {
  versionEl.textContent = APP_VERSION;
  versionEl.setAttribute('title', `Build ${APP_VERSION}`);
}

refreshAircraftDetailsControls();

if (aircraftDetailsToggleBtn) {
  aircraftDetailsToggleBtn.addEventListener('click', () => {
    state.showAircraftDetails = !state.showAircraftDetails;
    writeCookie(
      AIRCRAFT_DETAILS_STORAGE_KEY,
      state.showAircraftDetails ? 'true' : 'false',
    );
    refreshAircraftDetailsControls();
  });
}

if (audioStreamEl) {
  audioStreamEl.defaultMuted = true;
  audioStreamEl.muted = true;
  audioStreamEl.autoplay = true;
  if ('playsInline' in audioStreamEl) {
    audioStreamEl.playsInline = true;
  }
  audioStreamEl.src = AUDIO_STREAM_URL;
  const savedMuted = readCookie(AUDIO_MUTED_STORAGE_KEY);
  desiredAudioMuted = savedMuted === 'true';
  pendingAutoUnmute = !desiredAudioMuted;

  refreshAudioStreamControls();

  audioStreamEl.addEventListener('playing', () => {
    audioStreamError = false;
    audioAutoplayBlocked = false;
    clearAudioRetryTimer();
    refreshAudioStreamControls();
  });

  audioStreamEl.addEventListener('pause', () => {
    if (!audioStreamEl.muted) {
      refreshAudioStreamControls();
    }
  });

  audioStreamEl.addEventListener('waiting', () => {
    audioStreamError = false;
    refreshAudioStreamControls();
  });

  audioStreamEl.addEventListener('stalled', () => {
    audioStreamError = false;
    refreshAudioStreamControls();
  });

  audioStreamEl.addEventListener('ended', () => {
    attemptAudioPlayback();
  });

  audioStreamEl.addEventListener('error', (event) => {
    audioStreamError = true;
    refreshAudioStreamControls();
    showMessage('Audio stream unavailable. Check the receiver.', {
      alert: true,
      duration: DISPLAY_TIMEOUT_MS * 2,
    });
    console.warn('Audio stream error', event);
    scheduleAudioRetry();
  });

  attemptAudioPlayback();
}

const retryAutoplayIfVisible = () => {
  if (!audioAutoplayBlocked || !audioStreamEl) {
    return;
  }
  attemptAudioPlayback();
};

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    retryAutoplayIfVisible();
  }
});

window.addEventListener('focus', retryAutoplayIfVisible);

audioMuteToggleBtn?.addEventListener('click', () => {
  if (!audioStreamEl) {
    return;
  }

  const shouldMute = !desiredAudioMuted;
  desiredAudioMuted = shouldMute;
  audioStreamEl.muted = shouldMute;
  pendingAutoUnmute = !shouldMute && audioStreamEl.paused;
  autoplayHintShown = false;

  try {
    writeCookie(AUDIO_MUTED_STORAGE_KEY, shouldMute ? 'true' : 'false');
  } catch (error) {
    console.warn('Unable to persist audio mute preference', error);
  }

  if (shouldMute) {
    refreshAudioStreamControls();
    return;
  }

  audioStreamError = false;
  refreshAudioStreamControls();

  if (audioStreamEl.paused) {
    attemptAudioPlayback();
  }
});

volumeDecreaseBtn?.addEventListener('click', () => adjustVolume(-1));
volumeIncreaseBtn?.addEventListener('click', () => adjustVolume(1));
rangeDecreaseBtn?.addEventListener('click', () => adjustRange(-1));
rangeIncreaseBtn?.addEventListener('click', () => adjustRange(1));
alertDecreaseBtn?.addEventListener('click', () => adjustAlertRadius(-1));
alertIncreaseBtn?.addEventListener('click', () => adjustAlertRadius(1));
canvas?.addEventListener('click', handleRadarTap);

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

function normalizeHeading(value) {
  if (!Number.isFinite(value)) return null;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

// Dump1090 can provide several heading-like fields. Prefer a server-supplied
// bearing when available so newly detected aircraft immediately point in the
// expected direction.
function resolveInitialHeading(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const candidates = [entry.bearing, entry.track, entry.true_track, entry.heading];
  for (const candidate of candidates) {
    const heading = normalizeHeading(candidate);
    if (heading !== null) {
      return heading;
    }
  }
  return null;
}

function calculateHeading(prev, curr, feedHeading) {
  const normalizedFeedHeading = normalizeHeading(feedHeading);
  if (normalizedFeedHeading !== null) {
    return normalizedFeedHeading;
  }

  if (!prev) {
    return curr.bearing;
  }

  const delta = calculateBearing(prev.lat, prev.lon, curr.lat, curr.lon);
  if (Number.isFinite(delta)) {
    return delta;
  }

  return curr.bearing;
}

function forwardAngleDelta(from, to) {
  return (to - from + 360) % 360;
}

function canvasAngleFromNorth(angleDeg) {
  // Canvas angles start at the positive X axis (east) whereas our sweep logic is
  // based on 0° being north. Adjust by 90° so the rendered beam lines up with
  // the computed sweep angle.
  return deg2rad(angleDeg - 90);
}

function getCraftKey(craft) {
  if (craft.hex) return craft.hex;
  if (craft.flight) return craft.flight;
  const lat = Number.isFinite(craft.lat) ? craft.lat.toFixed(3) : 'na';
  const lon = Number.isFinite(craft.lon) ? craft.lon.toFixed(3) : 'na';
  return `${lat},${lon}`;
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
  if (volumeLabelEl) volumeLabelEl.textContent = 'Volume';
  if (volumeDescriptionEl) volumeDescriptionEl.textContent = 'Adjust the audio cue loudness.';
  if (volumeValueEl) volumeValueEl.textContent = `${state.beepVolume}`;
  if (rangeValueEl) rangeValueEl.textContent = `${RANGE_STEPS[state.rangeStepIndex]} km`;
  if (alertValueEl) alertValueEl.textContent = `${state.inboundAlertDistanceKm.toFixed(1)} km`;

  const rangeLines = [
    { label: 'Range', value: `${RANGE_STEPS[state.rangeStepIndex]} km` },
    { label: 'Alert', value: `${state.inboundAlertDistanceKm.toFixed(1)} km` },
    { label: 'Volume', value: `${state.beepVolume}` },
  ];

  const trackedCount = state.trackedAircraft.length;
  rangeLines.push({ label: 'Contacts', value: trackedCount > 0 ? String(trackedCount) : 'None' });

  const radarRangeKm = RANGE_STEPS[state.rangeStepIndex];
  state.airspacesInRange = findAirspacesInRange(radarRangeKm);

  rangeInfoEl.innerHTML = rangeLines
    .map(({ label, value }) => `<div class="info-line"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');
}

function formatCoordinate(value, axis) {
  if (!Number.isFinite(value)) {
    return 'Unknown';
  }

  const hemisphere = (() => {
    if (value > 0) return axis === 'lat' ? 'N' : 'E';
    if (value < 0) return axis === 'lat' ? 'S' : 'W';
    return '';
  })();

  const magnitude = Math.abs(value).toFixed(4);
  return hemisphere ? `${magnitude}° ${hemisphere}` : `${magnitude}°`;
}

function findAirspacesInRange(rangeKm) {
  if (!Array.isArray(CONTROLLED_AIRSPACES) || CONTROLLED_AIRSPACES.length === 0) {
    return [];
  }

  const { lat, lon } = state.receiver;
  return CONTROLLED_AIRSPACES.map((space) => {
    const distanceKm = haversine(lat, lon, space.lat, space.lon);
    if (!Number.isFinite(distanceKm)) {
      return null;
    }

    return {
      ...space,
      distanceKm,
      bearing: calculateBearing(lat, lon, space.lat, space.lon),
    };
  })
    .filter((space) => space && space.distanceKm <= rangeKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function updateReceiverInfo() {
  if (!receiverInfoEl) {
    return;
  }

  const { lat, lon, hasOverride } = state.receiver;
  const lines = [
    { label: 'Latitude', value: formatCoordinate(lat, 'lat') },
    { label: 'Longitude', value: formatCoordinate(lon, 'lon') },
    { label: 'Source', value: hasOverride ? 'Stored override' : 'Default config' },
  ];

  receiverInfoEl.innerHTML = lines
    .map(({ label, value }) => `<div class="info-line"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');
}

function adjustVolume(delta) {
  const nextVolume = Math.min(20, Math.max(0, state.beepVolume + delta));
  if (nextVolume !== state.beepVolume) {
    state.beepVolume = nextVolume;
    showMessage(`Volume: ${state.beepVolume}`);
    writeCookie(BEEP_VOLUME_STORAGE_KEY, String(state.beepVolume));
    updateRangeInfo();
  }
}

function clearRadarContacts() {
  state.trackedAircraft = [];
  state.previousPositions.clear();
  state.activeBlips = [];
  state.paintedRotation.clear();
  state.lastPingedAircraft = null;
}

function adjustRange(delta) {
  const nextIndex = Math.min(
    RANGE_STEPS.length - 1,
    Math.max(0, state.rangeStepIndex + delta)
  );
  if (nextIndex !== state.rangeStepIndex) {
    state.rangeStepIndex = nextIndex;
    clearRadarContacts();
    showMessage(`Range: ${RANGE_STEPS[state.rangeStepIndex]} km`);
    writeCookie(RANGE_INDEX_STORAGE_KEY, String(state.rangeStepIndex));
    updateRangeInfo();
    updateAircraftInfo();
  }
}

function adjustAlertRadius(delta) {
  const nextValue = Math.min(20, Math.max(1, state.inboundAlertDistanceKm + delta));
  if (nextValue !== state.inboundAlertDistanceKm) {
    state.inboundAlertDistanceKm = nextValue;
    showMessage(`Alert radius: ${state.inboundAlertDistanceKm.toFixed(1)} km`);
    writeCookie(ALERT_DISTANCE_STORAGE_KEY, String(state.inboundAlertDistanceKm));
    updateRangeInfo();
  }
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

  if (info.squawk) {
    lines.push({ label: 'Squawk', value: info.squawk });
  }

  if (Number.isFinite(info.verticalRate)) {
    const roundedRate = Math.round(info.verticalRate);
    const climbLabel = roundedRate === 0
      ? 'Level'
      : `${roundedRate > 0 ? '+' : ''}${roundedRate} fpm`;
    lines.push({ label: 'Climb', value: climbLabel });
  }

  if (Number.isFinite(info.signalDb)) {
    const formattedSignal = `${info.signalDb.toFixed(1)} dBFS`;
    lines.push({ label: 'Signal', value: formattedSignal });
  }

  if (Number.isFinite(info.lastMessageAgeSec)) {
    const seconds = info.lastMessageAgeSec;
    const seenLabel = seconds < 0.1 ? 'Live' : `${seconds.toFixed(1)} s ago`;
    lines.push({ label: 'Last seen', value: seenLabel });
  }

  aircraftInfoEl.innerHTML = lines
    .map(({ label, value }) => `<div class="info-line"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');
}

function updateStatus() {
  const status = state.dataConnectionOk ? 'Connected' : 'Waiting for data…';
  statusEl.textContent = status;
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

function isPointInsideRadar(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;

  const { width, height } = canvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const squareSize = Math.min(width, height);
  const labelPadding = squareSize * 0.05;
  const radarRadius = Math.max(10, squareSize / 2 - labelPadding);

  const dx = canvasX - centerX;
  const dy = canvasY - centerY;
  return Math.hypot(dx, dy) <= radarRadius;
}

function handleRadarTap(event) {
  if (!isPointInsideRadar(event.clientX, event.clientY)) {
    return;
  }

  state.radarRotationQuarterTurns = (state.radarRotationQuarterTurns + 1) % 4;
  writeCookie(RADAR_ORIENTATION_STORAGE_KEY, state.radarRotationQuarterTurns);
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
      state.receiver.hasOverride = true;
      writeCookie('receiverLat', String(data.lat));
      writeCookie('receiverLon', String(data.lon));
      updateReceiverInfo();
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
      clearRadarContacts();
      state.server.basePath = null;
      showMessage('Failed to fetch aircraft data. Check receiver connection.', { alert: true, duration: DISPLAY_TIMEOUT_MS * 2 });
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
      writeCookie('dump1090BasePath', safeCandidate);
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
    const heading = calculateHeading(prev, { lat, lon, bearing }, resolveInitialHeading(entry));

    const altitude = Number.isInteger(entry.alt_baro) ? entry.alt_baro : -1;
    const groundSpeed = typeof entry.gs === 'number' ? entry.gs : -1;
    const squawk = typeof entry.squawk === 'string' ? entry.squawk.trim() : '';
    const verticalRate = Number.isFinite(entry.baro_rate)
      ? entry.baro_rate
      : Number.isFinite(entry.geom_rate)
        ? entry.geom_rate
        : null;
    const signalDb = typeof entry.rssi === 'number' ? entry.rssi : null;
    const lastMessageAgeSec = typeof entry.seen === 'number' ? entry.seen : null;

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
      squawk,
      verticalRate,
      signalDb,
      lastMessageAgeSec,
      inbound: false,
    };

    craft.key = getCraftKey(craft);
    craft.iconScale = resolveAircraftIconScale(entry);
    craft.iconKey = resolveAircraftIconKey(entry);

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

  if (state.paintedRotation.size > 0) {
    const activeKeys = new Set(aircraft.map((craft) => craft.key));
    for (const key of state.paintedRotation.keys()) {
      if (!activeKeys.has(key)) {
        state.paintedRotation.delete(key);
      }
    }
  }

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

function getBlipLabelAlpha(blip, alpha) {
  const iconState = getIconState(blip);
  if (iconState?.ready) {
    return blip.inbound ? Math.max(0.6, alpha) : alpha;
  }
  return blip.inbound ? Math.max(0.2, alpha) : alpha * 0.9;
}

function drawBlipMarker(blip, radarRadius, alpha) {
  const iconState = getIconState(blip);
  if (iconState?.ready) {
    const scale = getBlipIconScale(blip);
    const baseSize = radarRadius * 0.14 * scale;
    const width = baseSize;
    const height = baseSize * iconState.aspect;
    const headingRad = deg2rad(blip.heading);
    const iconSource = iconState.canvas || iconState.image;
    ctx.save();
    ctx.translate(blip.x, blip.y);
    if (blip.inbound) {
      const pulseAlpha = Math.max(0.3, alpha);
      const highlightRadius = Math.max(width, height) * 0.55;
      ctx.globalAlpha = pulseAlpha;
      ctx.fillStyle = 'rgba(255,103,103,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, highlightRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(headingRad);
    ctx.globalAlpha = getBlipLabelAlpha(blip, alpha);
    ctx.drawImage(iconSource, -width / 2, -height / 2, width, height);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = getBlipLabelAlpha(blip, alpha);
  ctx.fillStyle = blip.inbound ? 'rgba(255,103,103,1)' : 'rgba(53,255,153,1)';
  ctx.beginPath();
  const scale = getBlipIconScale(blip);
  ctx.arc(blip.x, blip.y, radarRadius * 0.02 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawControlledAirspaces(airspaces, centerX, centerY, radarRadius, radarRangeKm, drawUprightTextAt) {
  if (!airspaces || airspaces.length === 0) {
    return;
  }

  ctx.save();
  ctx.lineWidth = Math.max(1, radarRadius * 0.002);
  const fontSize = Math.max(12, Math.round(radarRadius * 0.045));
  const labelOffset = fontSize * 0.35;

  const drawLabel = (text, anchorX, anchorY, baseline) => {
    if (!text) {
      return;
    }

    const renderLabel = () => {
      ctx.save();
      ctx.font = `${fontSize}px "Share Tech Mono", monospace`;
      ctx.fillStyle = 'rgba(210, 235, 255, 0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = baseline;
      ctx.fillText(text, anchorX, anchorY);
      ctx.restore();
    };

    if (typeof drawUprightTextAt === 'function') {
      drawUprightTextAt(anchorX, anchorY, renderLabel);
    } else {
      renderLabel();
    }
  };

  for (const space of airspaces) {
    if (!Number.isFinite(space.distanceKm) || space.distanceKm > radarRangeKm) {
      continue;
    }

    const distanceRatio = Math.min(space.distanceKm / radarRangeKm, 1);
    const radiusRatio = Math.min(space.radiusKm / radarRangeKm, 1);
    const displayRadius = Math.max(radarRadius * 0.02, radiusRatio * radarRadius);
    const angleRad = deg2rad(space.bearing);
    const centerOffset = distanceRatio * radarRadius;
    const x = centerX + Math.sin(angleRad) * centerOffset;
    const y = centerY - Math.cos(angleRad) * centerOffset;

    const gradient = ctx.createRadialGradient(x, y, displayRadius * 0.35, x, y, displayRadius);
    gradient.addColorStop(0, 'rgba(64, 196, 255, 0.25)');
    gradient.addColorStop(1, 'rgba(64, 196, 255, 0.05)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, displayRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(64, 196, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(x, y, displayRadius, 0, Math.PI * 2);
    ctx.stroke();

    drawLabel(space.name, x, y - displayRadius - labelOffset, 'bottom');

    const distanceLabel = `${Math.round(space.distanceKm)} km`;
    drawLabel(distanceLabel, x, y + displayRadius + labelOffset, 'top');
  }

  ctx.restore();
}

function drawRadar(deltaTime) {
  resizeCanvas();
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const squareSize = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const labelPadding = squareSize * 0.05;
  const radarRadius = Math.max(10, squareSize / 2 - labelPadding);
  const maxCompassOffset = squareSize / 2 - squareSize * 0.02;
  const compassOffset = Math.min(radarRadius + squareSize * 0.03, maxCompassOffset);
  const radarRangeKm = RANGE_STEPS[state.rangeStepIndex];
  const rotationRad = (state.radarRotationQuarterTurns * Math.PI) / 2;

  const drawUprightAt = (pivotX, pivotY, renderFn) => {
    if (typeof renderFn !== 'function') {
      return;
    }

    const anchorX = Number.isFinite(pivotX) ? pivotX : centerX;
    const anchorY = Number.isFinite(pivotY) ? pivotY : centerY;

    ctx.save();
    ctx.translate(anchorX, anchorY);
    ctx.rotate(-rotationRad);
    ctx.translate(-anchorX, -anchorY);
    renderFn();
    ctx.restore();
  };

  const drawUpright = (renderFn) => drawUprightAt(centerX, centerY, renderFn);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotationRad);
  ctx.translate(-centerX, -centerY);

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

  drawControlledAirspaces(state.airspacesInRange, centerX, centerY, radarRadius, radarRangeKm, drawUprightAt);

  // sweep update
  const sweepSpeed = SWEEP_SPEED_DEG_PER_SEC;
  const sweepAdvance = sweepSpeed * deltaTime;
  const previousAngle = state.sweepAngle;
  state.sweepAngle = (state.sweepAngle + sweepAdvance) % 360;
  const sweepWrapped = state.sweepAngle < previousAngle;
  const sweepDelta = forwardAngleDelta(previousAngle, state.sweepAngle);
  const sweepTolerance = Math.min(2.5, Math.max(0.75, sweepAdvance * 0.6));
  if (sweepWrapped) {
    // Increment the sweep identifier when a rotation completes so we can
    // track which aircraft have been painted for the current pass.
    state.currentSweepId += 1;
    if (state.currentSweepId > Number.MAX_SAFE_INTEGER - 1) {
      state.currentSweepId = 0;
      state.paintedRotation.clear();
    }
  }

  // sweep arc
  const sweepCenter = canvasAngleFromNorth(state.sweepAngle);
  const sweepHalfWidth = deg2rad(2);
  const sweepStart = sweepCenter - sweepHalfWidth;
  const sweepEnd = sweepCenter + sweepHalfWidth;
  const sweepGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radarRadius);
  sweepGradient.addColorStop(0, 'rgba(53,255,153,0.6)');
  sweepGradient.addColorStop(1, 'rgba(53,255,153,0)');
  ctx.fillStyle = sweepGradient;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, radarRadius, sweepStart, sweepEnd);
  ctx.closePath();
  ctx.fill();

  // compass labels (positions rotate with the radar, characters stay upright)
  const compassLabels = [
    { text: 'N', x: centerX, y: centerY - compassOffset, align: 'center' },
    { text: 'S', x: centerX, y: centerY + compassOffset, align: 'center' },
    { text: 'E', x: centerX + compassOffset, y: centerY, align: 'left' },
    { text: 'W', x: centerX - compassOffset, y: centerY, align: 'right' },
  ];

  for (const label of compassLabels) {
    drawUprightAt(label.x, label.y, () => {
      ctx.fillStyle = 'rgba(200,230,220,0.75)';
      ctx.font = `${Math.round(radarRadius * 0.1)}px "Share Tech Mono", monospace`;
      ctx.textAlign = label.align;
      ctx.textBaseline = 'middle';
      ctx.fillText(label.text, label.x, label.y);
    });
  }

  const now = performance.now();
  const newBlips = [];

  for (const craft of state.trackedAircraft) {
    const key = craft.key || getCraftKey(craft);
    if (state.paintedRotation.get(key) !== state.currentSweepId) {
      const target = craft.bearing;
      const distanceFromPrevious = forwardAngleDelta(previousAngle, target);
      const crossed = distanceFromPrevious <= sweepDelta + sweepTolerance;
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
          iconScale: craft.iconScale,
          iconKey: craft.iconKey,
          minutesToBase: Number.isFinite(minutesToBase) ? minutesToBase : null,
          distanceKm: Number.isFinite(craft.distanceKm) ? craft.distanceKm : null,
          altitude: Number.isFinite(craft.altitude) && craft.altitude > 0 ? craft.altitude : null,
          hex: craft.hex || craft.flight,
          flight: craft.flight || null,
        });
        state.paintedRotation.set(key, state.currentSweepId);
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
    const headingRad = deg2rad(blip.heading);
    const labelAlpha = getBlipLabelAlpha(blip, alpha);

    ctx.save();
    ctx.globalAlpha = blip.inbound ? Math.max(0.25, alpha) : alpha * 0.8;
    ctx.strokeStyle = blip.inbound ? 'rgba(255,103,103,0.8)' : 'rgba(53,255,153,0.7)';
    ctx.lineWidth = radarRadius * 0.0025;
    ctx.beginPath();
    ctx.moveTo(blip.x, blip.y);
    ctx.lineTo(blip.x + Math.sin(headingRad) * radarRadius * 0.05, blip.y - Math.cos(headingRad) * radarRadius * 0.05);
    ctx.stroke();
    ctx.restore();

    drawBlipMarker(blip, radarRadius, alpha);

    const showAircraftDetails = state.showAircraftDetails;

    if (showAircraftDetails) {
      const fontSize = Math.round(radarRadius * 0.055);
      const markerHeight = getBlipMarkerHeight(blip, radarRadius);
      const markerWidth = getBlipMarkerWidth(blip, radarRadius);
      const verticalSpacing = fontSize * 0.45;
      const horizontalSpacing = fontSize * 0.6;
      const identifierRaw = blip.flight || blip.hex || 'Unknown';
      const identifier = (identifierRaw || 'Unknown').trim().slice(0, 8) || 'Unknown';
      const altitudeLabel = blip.altitude != null ? `${blip.altitude.toLocaleString()} ft` : null;
      const distanceLabel = Number.isFinite(blip.distanceKm)
        ? (() => {
            const km = blip.distanceKm;
            const kmValue = km >= 10 ? Math.round(km) : km.toFixed(1);
            return `${kmValue}km`;
          })()
        : null;
      const etaLabel = blip.minutesToBase != null ? `ETA ${blip.minutesToBase}m` : null;

      const drawAircraftLabel = (text, anchorX, anchorY, align, baseline) => {
        if (!text) {
          return;
        }

        drawUprightAt(anchorX, anchorY, () => {
          ctx.save();
          ctx.globalAlpha = labelAlpha;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = `${fontSize}px "Share Tech Mono", monospace`;
          ctx.textAlign = align;
          ctx.textBaseline = baseline;
          ctx.fillText(text, anchorX, anchorY);
          ctx.restore();
        });
      };

      if (identifier) {
        const identifierY = blip.y - markerHeight / 2 - verticalSpacing;
        drawAircraftLabel(identifier, blip.x, identifierY, 'center', 'bottom');
      }

      if (altitudeLabel) {
        const altitudeY = blip.y + markerHeight / 2 + verticalSpacing;
        drawAircraftLabel(altitudeLabel, blip.x, altitudeY, 'center', 'top');
      }

      if (blip.inbound && (distanceLabel || etaLabel)) {
        const offsetX = markerWidth / 2 + horizontalSpacing;
        if (distanceLabel) {
          drawAircraftLabel(distanceLabel, blip.x - offsetX, blip.y, 'right', 'middle');
        }

        if (etaLabel) {
          drawAircraftLabel(etaLabel, blip.x + offsetX, blip.y, 'left', 'middle');
        }
      }
    } else if (blip.inbound) {
      const distanceLabel = Number.isFinite(blip.distanceKm)
        ? (() => {
            const km = blip.distanceKm;
            const kmValue = km >= 10 ? Math.round(km) : km.toFixed(1);
            return `${kmValue}km`;
          })()
        : null;
      const etaLabel = blip.minutesToBase != null ? `ETA ${blip.minutesToBase}m` : null;
      const altitudeLabel = blip.altitude != null ? `${blip.altitude.toLocaleString()} ft` : null;

      if (distanceLabel || etaLabel || altitudeLabel) {
        const fontSize = Math.round(radarRadius * 0.055);
        const markerHeight = getBlipMarkerHeight(blip, radarRadius);
        const labelSpacing = fontSize * 0.45;

        const drawInboundLabel = (text, anchorX, anchorY, baseline) => {
          if (!text) {
            return;
          }

          drawUprightAt(anchorX, anchorY, () => {
            ctx.save();
            ctx.globalAlpha = labelAlpha;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = `${fontSize}px "Share Tech Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = baseline;
            ctx.fillText(text, anchorX, anchorY);
            ctx.restore();
          });
        };

        if (distanceLabel) {
          const distanceY = blip.y - markerHeight / 2 - labelSpacing;
          drawInboundLabel(distanceLabel, blip.x, distanceY, 'bottom');
        }

        const lowerLabels = [etaLabel, altitudeLabel].filter(Boolean);
        if (lowerLabels.length > 0) {
          const firstLineY = blip.y + markerHeight / 2 + labelSpacing;
          const lineHeight = fontSize * 1.05;
          lowerLabels.forEach((label, index) => {
            const lineY = firstLineY + index * lineHeight;
            drawInboundLabel(label, blip.x, lineY, 'top');
          });
        }
      }
    }
  }

  ctx.restore();

  updateMessage();
  updateAircraftInfo();
}

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
updateReceiverInfo();
updateAircraftInfo();
fetchReceiverLocation().catch(() => {});
pollData();
requestAnimationFrame(loop);
