import {
  CONTROLLED_AIRSPACES,
  DEFAULT_RECEIVER_LOCATION,
  LAND_MASS_OUTLINES,
  LAND_MASS_SOURCES,
} from './config.js';

const REFRESH_INTERVAL_MS = 5000;
const AUDIO_RETRY_INTERVAL_MS = 8000;
const DISPLAY_TIMEOUT_MS = 1500;
const RANGE_STEPS = [5, 10, 25, 50, 100, 150, 200, 300, 400];
const DEFAULT_RANGE_STEP_INDEX = Math.max(0, Math.min(3, RANGE_STEPS.length - 1));
const MAX_CONFIGURED_RANGE_KM = RANGE_STEPS[RANGE_STEPS.length - 1];
const LAND_MASS_MAX_DISTANCE_KM = MAX_CONFIGURED_RANGE_KM * 1.6;
const LAND_MASS_MIN_VERTEX_SPACING_KM = 0.75;
const DEFAULT_BEEP_VOLUME = 10;
const SWEEP_SPEED_DEG_PER_SEC = 90;
const AUDIO_SILENCE_THRESHOLD = 0.015;
const AUDIO_SILENCE_HOLD_MS = 3500;
const AUDIO_PULSE_PERIOD_MS = 1400;
const AUDIO_PULSE_RING_COUNT = 3;
const AUDIO_PULSE_BASE_RADIUS_RATIO = 0.08;
const AUDIO_PULSE_SPREAD_RATIO = 0.18;
const APP_VERSION = 'V1.9.63';
const ALT_LOW_FEET = 10000;
const ALT_HIGH_FEET = 30000;
const FREQ_LOW = 800;
const FREQ_MID = 1200;
const FREQ_HIGH = 1800;
const EARTH_RADIUS_KM = 6371;
const AUDIO_STREAM_URL = '/airbands';
const AUDIO_MUTED_STORAGE_KEY = 'airbandMuted';
const AIRCRAFT_DETAILS_STORAGE_KEY = 'showAircraftDetails';
const BEEP_VOLUME_STORAGE_KEY = 'beepVolumeLevel';
const RANGE_INDEX_STORAGE_KEY = 'radarRangeIndex';
const ALERT_RANGE_STORAGE_KEY = 'baseAlertDistanceKm';
const RADAR_ORIENTATION_STORAGE_KEY = 'radarOrientationQuarterTurns';
const CONTROLS_PANEL_VISIBLE_STORAGE_KEY = 'controlsPanelVisible';
const DATA_PANEL_VISIBLE_STORAGE_KEY = 'dataPanelVisible';
// Retain the legacy storage key so previously stored preferences continue to work.
const BASEMAP_OVERLAY_STORAGE_KEY = 'googleMapOverlayVisible';
const LEAFLET_ASSET_SOURCES = Object.freeze([
  {
    id: 'unpkg',
    cssHref: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    cssIntegrity: 'sha512-sA+Rw8fK1HgNHQJrWZLxE+nobVhtSGcVwqDAVBBusZT6F4LmSpaV0Uy1Ik5+pNSTsKQWP9k+rquDaXw2C5uXmw==',
    jsSrc: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    jsIntegrity: 'sha512-XQoYMqMTK8LvdlxUMF4Gx7Z7tGDZC1x1i+6whhtj6Vxz41IrT9jpJ1rssZgGSyEtpI0PtmF6TuN7+7e2Jc2RMQ==',
  },
  {
    id: 'jsdelivr',
    cssHref: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    jsSrc: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  },
  {
    id: 'cdnjs',
    cssHref: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
    jsSrc: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  },
]);
const EMERGENCY_SQUAWK_CODES = Object.freeze({
  '7500': 'Possible hijacking',
  '7600': 'Lost communications',
  '7700': 'General emergency',
});
const BASE_ALERT_RANGE_MIN_KM = 0;
const BASE_ALERT_RANGE_MAX_KM = 30;
const BASE_ALERT_RANGE_STEP_KM = 1;
const DEFAULT_BASE_ALERT_RANGE_KM = 15;
const RAPID_DESCENT_THRESHOLD_FPM = -2500;
const ALTITUDE_CORROBORATION_MIN_DELTA_FT = 100;
const ALTITUDE_CORROBORATION_WINDOW_MS = REFRESH_INTERVAL_MS * 3;
const BASE_APPROACH_HEADING_TOLERANCE_DEG = 35;
const BASE_APPROACH_MIN_GROUNDSPEED_KTS = 60;
const COLLISION_ALERT_DISTANCE_KM = 3.5;
const COLLISION_ALTITUDE_DELTA_MAX_FT = 1000;
const COLLISION_HEADING_ALIGNMENT_DEG = 25;
const COLLISION_MIN_GROUNDSPEED_KTS = 80;
const COLLISION_MAX_LAST_SEEN_SEC = 20;
const ALERT_COOLDOWN_MS = 2 * 60 * 1000;
const ALERT_HISTORY_MAX_AGE_MS = 10 * 60 * 1000;
const LIVE_ALERT_GRACE_MS = REFRESH_INTERVAL_MS * 2;
const TICKER_MIN_DURATION_MS = 5500;
const TICKER_MAX_DURATION_MS = 11000;
const TICKER_CHAR_DURATION_MS = 80;
const ALERT_HIGHLIGHT_DURATION_MS = 30 * 1000;
const deriveDefaultServerConfig = () => {
  const { protocol, hostname, port } = window.location;
  const safeProtocol = protocol ? protocol.replace(/:$/, '') : 'https';
  return {
    protocol: safeProtocol,
    host: hostname || 'localhost',
    port: port || '',
  };
};
const GEOLOCATION_TIMEOUT_MS = 15000;
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

const readBooleanPreference = (key, fallback) => {
  const raw = readCookie(key);
  if (raw === null) {
    return fallback;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  return fallback;
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
const messageTickerEl = document.getElementById('message-ticker');
const messageTickerTrackEl = document.getElementById('message-ticker-track');
const versionEl = document.getElementById('version');
const volumeLabelEl = document.getElementById('volume-label');
const volumeDescriptionEl = document.getElementById('volume-description');
const volumeValueEl = document.getElementById('volume-value');
const volumeDecreaseBtn = document.getElementById('volume-decrease');
const volumeIncreaseBtn = document.getElementById('volume-increase');
const rangeValueEl = document.getElementById('range-value');
const rangeDecreaseBtn = document.getElementById('range-decrease');
const rangeIncreaseBtn = document.getElementById('range-increase');
const alertRangeValueEl = document.getElementById('alert-range-value');
const alertRangeDecreaseBtn = document.getElementById('alert-range-decrease');
const alertRangeIncreaseBtn = document.getElementById('alert-range-increase');
const radarRotateBtn = document.getElementById('radar-rotate');
const centerOnLocationBtn = document.getElementById('center-on-location');
const manualLocationBtn = document.getElementById('manual-location');
const geolocationPermissionModal = document.getElementById('geolocation-permission-modal');
const geolocationPermissionBackdrop = document.getElementById('geolocation-permission-backdrop');
const geolocationPermissionCloseBtn = document.getElementById('geolocation-permission-close');
const audioStreamEl = document.getElementById('airband-stream');
const audioMuteToggleBtn = document.getElementById('audio-mute-toggle');
const audioStatusEl = document.getElementById('audio-status');
const aircraftDetailsToggleBtn = document.getElementById('aircraft-details-toggle');
const aircraftDetailsStateEl = document.getElementById('aircraft-details-state');
const openStreetMapOverlayToggleBtn = document.getElementById('openstreetmap-overlay-toggle');
const openStreetMapOverlayStateEl = document.getElementById('openstreetmap-overlay-state');
const openStreetMapOverlayEl = document.getElementById('openstreetmap-overlay');
const openStreetMapFrameEl = document.getElementById('openstreetmap-frame');
const manualLocationModal = document.getElementById('manual-location-modal');
const manualLocationBackdrop = document.getElementById('manual-location-backdrop');
const manualLocationMapEl = document.getElementById('manual-location-map');
const manualLocationStatusEl = document.getElementById('manual-location-status');
const manualLocationCoordinatesEl = document.getElementById('manual-location-coordinates');
const manualLocationConfirmBtn = document.getElementById('manual-location-confirm');
const manualLocationCancelBtn = document.getElementById('manual-location-cancel');
const mainAppEl = document.querySelector('main.app');
const controlsPanelEl = document.getElementById('controls-panel');
const dataPanelEl = document.getElementById('data-panel');
const controlsPanelToggleBtn = document.getElementById('controls-panel-toggle');
const dataPanelToggleBtn = document.getElementById('data-panel-toggle');

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

let manualLocationReturnFocusEl = null;
let manualLocationSelection = null;
let manualLocationMap = null;
let manualLocationMarker = null;
let leafletAssetsPromise = null;

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

let cachedLandMassPattern = null;
let landMassGeoJsonCache = null;
let activeLandMassSettings = null;
let pendingUserLocationRequest = false;
let geolocationPermissionState = null;
let lastFocusBeforeGeolocationHelp = null;

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

// The label offsets depend on the rendered marker height so callouts clear the icon.
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

function getBlipIconBounds(blip, markerWidth, markerHeight) {
  const headingRad = Number.isFinite(blip?.heading) ? deg2rad(blip.heading) : 0;
  const halfWidth = markerWidth / 2;
  const halfHeight = markerHeight / 2;
  const absCos = Math.abs(Math.cos(headingRad));
  const absSin = Math.abs(Math.sin(headingRad));
  const rotatedHalfWidth = halfWidth * absCos + halfHeight * absSin;
  const rotatedHalfHeight = halfWidth * absSin + halfHeight * absCos;

  return {
    x: blip.x - rotatedHalfWidth,
    y: blip.y - rotatedHalfHeight,
    width: rotatedHalfWidth * 2,
    height: rotatedHalfHeight * 2,
  };
}

function rectanglesOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function expandBounds(bounds, margin) {
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
  };
}

function measureLabelDimensions(text, fontSize) {
  if (!text) {
    return null;
  }

  ctx.save();
  ctx.font = `${fontSize}px "Share Tech Mono", monospace`;
  const metrics = ctx.measureText(text);
  ctx.restore();

  const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
    ? metrics.actualBoundingBoxAscent
    : fontSize * 0.78;
  const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
    ? metrics.actualBoundingBoxDescent
    : fontSize * 0.22;

  return {
    width: metrics.width,
    height: Math.max(fontSize * 0.9, ascent + descent),
  };
}

function clampCalloutWithinViewport({
  boxX,
  boxY,
  textWidth,
  textHeight,
  margin,
  viewportWidth,
  viewportHeight,
}) {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) {
    return { boxX, boxY };
  }

  const horizontalSlack = viewportWidth - textWidth;
  const verticalSlack = viewportHeight - textHeight;

  let clampedX = boxX;
  if (horizontalSlack <= 0) {
    clampedX = 0;
  } else {
    const minX = margin;
    const maxX = viewportWidth - textWidth - margin;
    clampedX = Math.min(Math.max(clampedX, minX), Math.max(minX, maxX));
  }

  let clampedY = boxY;
  if (verticalSlack <= 0) {
    clampedY = 0;
  } else {
    const minY = margin;
    const maxY = viewportHeight - textHeight - margin;
    clampedY = Math.min(Math.max(clampedY, minY), Math.max(minY, maxY));
  }

  if (
    clampedX + textWidth < 0 ||
    clampedX > viewportWidth ||
    clampedY + textHeight < 0 ||
    clampedY > viewportHeight
  ) {
    return null;
  }

  return { boxX: clampedX, boxY: clampedY };
}

function createCalloutDirectionCandidates() {
  const prioritizedAngles = [
    -Math.PI / 4,
    Math.PI / 4,
    -((3 * Math.PI) / 4),
    (3 * Math.PI) / 4,
    -Math.PI / 6,
    Math.PI / 6,
    -((5 * Math.PI) / 6),
    (5 * Math.PI) / 6,
    -Math.PI / 3,
    Math.PI / 3,
    -((2 * Math.PI) / 3),
    (2 * Math.PI) / 3,
    0,
    Math.PI,
    -Math.PI / 2,
    Math.PI / 2,
  ];

  const evenlySpacedAngles = [];
  const segments = 16;
  for (let i = 0; i < segments; i += 1) {
    evenlySpacedAngles.push((i / segments) * Math.PI * 2);
  }

  const seen = new Set();
  const candidates = [];
  const recordAngle = (angle) => {
    const dx = Math.cos(angle);
    const dy = -Math.sin(angle);
    const magnitude = Math.hypot(dx, dy);
    if (magnitude < 1e-6) {
      return;
    }

    const unitDx = dx / magnitude;
    const unitDy = dy / magnitude;
    const key = `${unitDx.toFixed(4)}:${unitDy.toFixed(4)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    let align = 'center';
    if (unitDx >= 0.3) {
      align = 'left';
    } else if (unitDx <= -0.3) {
      align = 'right';
    }

    candidates.push({ dx: unitDx, dy: unitDy, align });
  };

  [...prioritizedAngles, ...evenlySpacedAngles].forEach(recordAngle);

  return candidates;
}

// Precompute a pool of direction vectors that cover the full 360° around a blip
// while prioritizing the diagonals and cardinal directions for readability.
const CALLOUT_DIRECTION_CANDIDATES = createCalloutDirectionCandidates();

function computeCalloutPlacement({
  text,
  blip,
  fontSize,
  markerWidth,
  markerHeight,
  existingPlacements,
  iconBounds = [],
  viewportWidth,
  viewportHeight,
}) {
  const dimensions = measureLabelDimensions(text, fontSize);
  if (!dimensions) {
    return null;
  }

  const textWidth = dimensions.width;
  const textHeight = dimensions.height;
  const margin = fontSize * 0.35;
  const planeRadius = Math.max(markerWidth, markerHeight) * 0.5 + margin;
  const labelSlack = Math.max(fontSize * 0.15, Math.min(textWidth, textHeight) * 0.12);
  const baseDistance = planeRadius + labelSlack;
  const stepDistance = Math.max(fontSize * 0.5, Math.min(textWidth, textHeight) * 0.22);
  const maxAttempts = 16;
  const distanceTolerance = Math.max(0.75, fontSize * 0.04);

  const planeBounds = expandBounds(
    {
      x: blip.x - markerWidth / 2,
      y: blip.y - markerHeight / 2,
      width: markerWidth,
      height: markerHeight,
    },
    margin,
  );

  let bestPlacement = null;
  let bestScore = Infinity;
  let bestAttempt = Infinity;
  let bestAlignmentRank = Infinity;

  const getAlignmentRank = (align) => {
    if (align === 'center') {
      return 0;
    }
    if (align === 'left') {
      return 1;
    }
    return 2;
  };

  // Walk each candidate direction and progressively increase the distance
  // until we find a placement that clears the icon and existing callouts.
  for (const direction of CALLOUT_DIRECTION_CANDIDATES) {
    const alignmentRank = getAlignmentRank(direction.align);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const distance = baseDistance + attempt * stepDistance;
      let anchorX = blip.x + direction.dx * distance;
      let anchorY = blip.y + direction.dy * distance;

      let boxX = anchorX;
      if (direction.align === 'right') {
        boxX = anchorX - textWidth;
      } else if (direction.align === 'center') {
        boxX = anchorX - textWidth / 2;
      }
      let boxY = anchorY - textHeight / 2;

      const clamped = clampCalloutWithinViewport({
        boxX,
        boxY,
        textWidth,
        textHeight,
        margin,
        viewportWidth,
        viewportHeight,
      });

      if (!clamped) {
        continue;
      }

      boxX = clamped.boxX;
      boxY = clamped.boxY;

      if (direction.align === 'right') {
        anchorX = boxX + textWidth;
      } else if (direction.align === 'center') {
        anchorX = boxX + textWidth / 2;
      } else {
        anchorX = boxX;
      }

      anchorY = boxY + textHeight / 2;

      const bounds = { x: boxX, y: boxY, width: textWidth, height: textHeight };
      const expandedBounds = expandBounds(bounds, margin);

      if (rectanglesOverlap(expandedBounds, planeBounds)) {
        continue;
      }

      const intersectsIcon = iconBounds.some((entry) => {
        if (!entry) {
          return false;
        }

        const targetBounds = entry.bounds || entry;
        if (!targetBounds) {
          return false;
        }

        if (entry.blip === blip) {
          return false;
        }

        return rectanglesOverlap(expandedBounds, targetBounds);
      });

      if (intersectsIcon) {
        continue;
      }

      const overlapsExisting = existingPlacements.some((placement) =>
        rectanglesOverlap(expandedBounds, placement.expandedBounds),
      );

      if (overlapsExisting) {
        continue;
      }

      const pointerTargetX =
        direction.align === 'left'
          ? boxX - margin * 0.4
          : direction.align === 'right'
          ? boxX + textWidth + margin * 0.4
          : anchorX;
      const pointerTargetY = anchorY;

      const pointerVecX = anchorX - blip.x;
      const pointerVecY = anchorY - blip.y;
      const pointerDistance = Math.hypot(pointerVecX, pointerVecY);
      const pointerVecLength = pointerDistance || 1;
      const pointerStart = {
        x: blip.x + (pointerVecX / pointerVecLength) * markerWidth * 0.45,
        y: blip.y + (pointerVecY / pointerVecLength) * markerHeight * 0.45,
      };
      const pointerEnd = { x: pointerTargetX, y: pointerTargetY };

      const vecX = pointerEnd.x - pointerStart.x;
      const vecY = pointerEnd.y - pointerStart.y;
      const length = Math.hypot(vecX, vecY) || 1;
      const midX = (pointerStart.x + pointerEnd.x) / 2;
      const midY = (pointerStart.y + pointerEnd.y) / 2;
      const controlOffset = Math.min(fontSize * 1.15, length * 0.35);
      const normalX = (-vecY / length) * controlOffset;
      const normalY = (vecX / length) * controlOffset;
      const pointerControl = {
        x: midX + normalX,
        y: midY + normalY,
      };

      if (
        bestPlacement === null ||
        pointerDistance + distanceTolerance < bestScore ||
        (Math.abs(pointerDistance - bestScore) <= distanceTolerance &&
          (attempt < bestAttempt ||
            (attempt === bestAttempt && alignmentRank < bestAlignmentRank)))
      ) {
        bestPlacement = {
          anchorX,
          anchorY,
          textAlign: direction.align,
          textBaseline: 'middle',
          bounds,
          expandedBounds,
          pointerStart,
          pointerEnd,
          pointerControl,
          textWidth,
          textHeight,
        };
        bestScore = pointerDistance;
        bestAttempt = attempt;
        bestAlignmentRank = alignmentRank;

        if (pointerDistance <= baseDistance + distanceTolerance && attempt === 0) {
          return bestPlacement;
        }
      }
    }
  }

  return bestPlacement;
}

function createPersistedCalloutPlacement(placement, blip, fontSize) {
  if (!placement) {
    return null;
  }

  return {
    anchorOffsetX: placement.anchorX - blip.x,
    anchorOffsetY: placement.anchorY - blip.y,
    textAlign: placement.textAlign,
    fontSize,
    textWidth: placement.textWidth,
    textHeight: placement.textHeight,
  };
}

function restorePersistedCalloutPlacement({
  persisted,
  blip,
  fontSize,
  markerWidth,
  markerHeight,
  existingPlacements = [],
  iconBounds = [],
  viewportWidth,
  viewportHeight,
}) {
  if (!persisted) {
    return null;
  }

  if (!Number.isFinite(fontSize) || Math.abs(persisted.fontSize - fontSize) > 0.5) {
    return null;
  }

  const { anchorOffsetX, anchorOffsetY, textAlign, textWidth, textHeight } = persisted;
  if (
    !Number.isFinite(anchorOffsetX) ||
    !Number.isFinite(anchorOffsetY) ||
    !Number.isFinite(textWidth) ||
    !Number.isFinite(textHeight)
  ) {
    return null;
  }

  let anchorX = blip.x + anchorOffsetX;
  let anchorY = blip.y + anchorOffsetY;
  const margin = fontSize * 0.35;

  let boxX = anchorX;
  if (textAlign === 'right') {
    boxX = anchorX - textWidth;
  } else if (textAlign === 'center') {
    boxX = anchorX - textWidth / 2;
  }

  let boxY = anchorY - textHeight / 2;

  const clamped = clampCalloutWithinViewport({
    boxX,
    boxY,
    textWidth,
    textHeight,
    margin,
    viewportWidth,
    viewportHeight,
  });

  if (!clamped) {
    return null;
  }

  ({ boxX, boxY } = clamped);

  if (textAlign === 'right') {
    anchorX = boxX + textWidth;
  } else if (textAlign === 'center') {
    anchorX = boxX + textWidth / 2;
  } else {
    anchorX = boxX;
  }

  anchorY = boxY + textHeight / 2;

  const bounds = { x: boxX, y: boxY, width: textWidth, height: textHeight };
  const expandedBounds = expandBounds(bounds, margin);

  const planeBounds = expandBounds(
    {
      x: blip.x - markerWidth / 2,
      y: blip.y - markerHeight / 2,
      width: markerWidth,
      height: markerHeight,
    },
    margin,
  );

  if (rectanglesOverlap(expandedBounds, planeBounds)) {
    return null;
  }

  const intersectsIcon = iconBounds.some((entry) => {
    if (!entry) {
      return false;
    }

    const targetBounds = entry.bounds || entry;
    if (!targetBounds) {
      return false;
    }

    if (entry.blip === blip) {
      return false;
    }

    return rectanglesOverlap(expandedBounds, targetBounds);
  });

  if (intersectsIcon) {
    return null;
  }

  const overlapsExisting = existingPlacements.some((placement) =>
    rectanglesOverlap(expandedBounds, placement.expandedBounds),
  );

  if (overlapsExisting) {
    return null;
  }

  const pointerTargetX =
    textAlign === 'left'
      ? boxX - margin * 0.4
      : textAlign === 'right'
      ? boxX + textWidth + margin * 0.4
      : anchorX;
  const pointerTargetY = anchorY;

  const pointerVecX = anchorX - blip.x;
  const pointerVecY = anchorY - blip.y;
  const pointerVecLength = Math.hypot(pointerVecX, pointerVecY) || 1;
  const pointerStart = {
    x: blip.x + (pointerVecX / pointerVecLength) * markerWidth * 0.45,
    y: blip.y + (pointerVecY / pointerVecLength) * markerHeight * 0.45,
  };

  const pointerEnd = { x: pointerTargetX, y: pointerTargetY };
  const vecX = pointerEnd.x - pointerStart.x;
  const vecY = pointerEnd.y - pointerStart.y;
  const length = Math.hypot(vecX, vecY) || 1;
  const midX = (pointerStart.x + pointerEnd.x) / 2;
  const midY = (pointerStart.y + pointerEnd.y) / 2;
  const controlOffset = Math.min(fontSize * 1.15, length * 0.35);
  const normalX = (-vecY / length) * controlOffset;
  const normalY = (vecX / length) * controlOffset;
  const pointerControl = {
    x: midX + normalX,
    y: midY + normalY,
  };

  return {
    anchorX,
    anchorY,
    textAlign,
    textBaseline: 'middle',
    bounds,
    expandedBounds,
    pointerStart,
    pointerEnd,
    pointerControl,
    textWidth,
    textHeight,
  };
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
const savedRadarOrientation = readIntPreference(
  RADAR_ORIENTATION_STORAGE_KEY,
  0,
  0,
  3,
);
const savedBaseAlertRangeKm = readIntPreference(
  ALERT_RANGE_STORAGE_KEY,
  DEFAULT_BASE_ALERT_RANGE_KM,
  BASE_ALERT_RANGE_MIN_KM,
  BASE_ALERT_RANGE_MAX_KM,
);
const savedControlsPanelVisible = readBooleanPreference(
  CONTROLS_PANEL_VISIBLE_STORAGE_KEY,
  true,
);
const savedDataPanelVisible = readBooleanPreference(
  DATA_PANEL_VISIBLE_STORAGE_KEY,
  true,
);
const savedOpenStreetMapOverlayVisible = readBooleanPreference(
  BASEMAP_OVERLAY_STORAGE_KEY,
  false,
);
const state = {
  server: {
    ...deriveDefaultServerConfig(),
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
  previousAltitudeSamples: new Map(),
  paintedRotation: new Map(),
  currentSweepId: 0,
  activeBlips: [],
  calloutPlacements: new Map(),
  airspacesInRange: [],
  landMasses: LAND_MASS_OUTLINES,
  landMassSourceId: null,
  landMassSourceName: null,
  lastPingedAircraft: null,
  selectedAircraftKey: null,
  displayOnlySelected: false,
  rangeStepIndex: savedRangeStepIndex,
  beepVolume: savedBeepVolume,
  baseAlertRangeKm: savedBaseAlertRangeKm,
  sweepAngle: 0,
  lastFrameTime: performance.now(),
  rotationPeriodMs: 0,
  radarRotationQuarterTurns: savedRadarOrientation,
  dataConnectionOk: false,
  message: '',
  messageUntil: 0,
  showAircraftDetails: savedAircraftDetailsSetting === 'true',
  controlsPanelVisible: savedControlsPanelVisible,
  dataPanelVisible: savedDataPanelVisible,
  openStreetMapOverlayVisible: savedOpenStreetMapOverlayVisible,
  alertHistory: new Map(),
  alertHighlights: new Map(),
};

const tickerState = {
  queue: [],
  active: null,
  shownKeys: new Set(),
  liveAlerts: new Map(),
  liveRotation: [],
};

state.rotationPeriodMs = (360 / SWEEP_SPEED_DEG_PER_SEC) * 1000;

let audioStreamError = false;
let audioAutoplayBlocked = false;
let audioUnlockListenerAttached = false;
let desiredAudioMuted = false;
let pendingAutoUnmute = false;
let audioRetryTimer = null;
let autoplayHintShown = false;
let audioAnalyserContext = null;
let audioAnalyser = null;
let audioAnalyserSource = null;
let audioAnalyserData = null;
let audioSilenceSinceMs = 0;
let audioMonitorFrame = null;
let audioSignalState = 'unknown';

function updateAudioStatus(text) {
  if (!audioStatusEl) {
    return;
  }

  audioStatusEl.textContent = text;
}

function updateAudioSignalState(nextState) {
  if (audioSignalState === nextState) {
    return;
  }

  audioSignalState = nextState;
  window.dispatchEvent(
    new CustomEvent('audio-signal-state-change', {
      detail: { state: audioSignalState },
    }),
  );
  refreshAudioStreamControls();
}

function ensureAudioAnalyser() {
  if (!audioStreamEl || audioAnalyser) {
    return audioAnalyser;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  audioAnalyserContext = audioAnalyserContext ?? new AudioContextCtor();
  if (audioAnalyserContext.state === 'suspended') {
    audioAnalyserContext.resume().catch(() => {});
  }

  try {
    audioAnalyser = audioAnalyserContext.createAnalyser();
    audioAnalyser.fftSize = 2048;
    audioAnalyser.smoothingTimeConstant = 0.85;
    audioAnalyserData = new Uint8Array(audioAnalyser.fftSize);

    if (!audioAnalyserSource) {
      audioAnalyserSource = audioAnalyserContext.createMediaElementSource(audioStreamEl);
      audioAnalyserSource.connect(audioAnalyser);
      audioAnalyser.connect(audioAnalyserContext.destination);
    }
  } catch (error) {
    console.warn('Unable to initialize audio analyser', error);
    audioAnalyser = null;
    audioAnalyserSource = null;
    audioAnalyserData = null;
    return null;
  }

  return audioAnalyser;
}

function stopAudioSilenceMonitor(nextState = 'unknown') {
  if (audioMonitorFrame !== null) {
    window.cancelAnimationFrame(audioMonitorFrame);
    audioMonitorFrame = null;
  }

  audioSilenceSinceMs = 0;
  updateAudioSignalState(nextState);
}

function startAudioSilenceMonitor() {
  const analyser = ensureAudioAnalyser();
  if (!analyser || desiredAudioMuted || audioStreamError || audioStreamEl.paused) {
    stopAudioSilenceMonitor(desiredAudioMuted ? 'muted' : 'unknown');
    return;
  }

  if (audioMonitorFrame !== null) {
    return;
  }

  const sampleLevel = () => {
    if (!audioAnalyser) {
      stopAudioSilenceMonitor('unknown');
      return;
    }

    if (desiredAudioMuted || audioStreamError || audioStreamEl.paused) {
      stopAudioSilenceMonitor(desiredAudioMuted ? 'muted' : 'unknown');
      return;
    }

    analyser.getByteTimeDomainData(audioAnalyserData);
    let sumSquares = 0;
    for (const sample of audioAnalyserData) {
      const centered = (sample - 128) / 128;
      sumSquares += centered * centered;
    }

    const rms = Math.sqrt(sumSquares / audioAnalyserData.length);
    const now = performance.now();
    const belowThreshold = rms < AUDIO_SILENCE_THRESHOLD;

    if (!belowThreshold) {
      audioSilenceSinceMs = 0;
      updateAudioSignalState('active');
    } else if (audioSilenceSinceMs === 0) {
      audioSilenceSinceMs = now;
      updateAudioSignalState('active');
    } else if (now - audioSilenceSinceMs >= AUDIO_SILENCE_HOLD_MS) {
      updateAudioSignalState('silent');
    }

    audioMonitorFrame = window.requestAnimationFrame(sampleLevel);
  };

  audioMonitorFrame = window.requestAnimationFrame(sampleLevel);
}

function refreshAudioStreamControls() {
  if (!audioStreamEl) {
    return;
  }

  const isMuted = desiredAudioMuted;
  const signalState = audioSignalState;
  if (audioMuteToggleBtn) {
    audioMuteToggleBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    audioMuteToggleBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    const highlight = !isMuted && !audioStreamError && !audioAutoplayBlocked && !pendingAutoUnmute;
    audioMuteToggleBtn.classList.toggle('primary', highlight);
  }

  if (audioStreamError) {
    updateAudioStatus('Stream unavailable');
    return;
  }

  if (audioAutoplayBlocked && !isMuted) {
    updateAudioStatus('Autoplay blocked. Tap anywhere to start audio.');
    if (!autoplayHintShown) {
      autoplayHintShown = true;
      showMessage('Browser blocked autoplay—tap anywhere to enable the live feed.', {
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

  if (signalState === 'silent') {
    updateAudioStatus('Live – silent');
    return;
  }

  if (signalState === 'active') {
    updateAudioStatus('Live');
    return;
  }

  updateAudioStatus('Live – monitoring');
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

function refreshPanelVisibility() {
  if (!mainAppEl) {
    return;
  }

  const controlsVisible = state.controlsPanelVisible;
  const dataVisible = state.dataPanelVisible;

  mainAppEl.classList.toggle('controls-hidden', !controlsVisible);
  mainAppEl.classList.toggle('data-hidden', !dataVisible);

  if (controlsPanelEl) {
    controlsPanelEl.toggleAttribute('hidden', !controlsVisible);
    controlsPanelEl.setAttribute('aria-hidden', controlsVisible ? 'false' : 'true');
  }

  if (dataPanelEl) {
    dataPanelEl.toggleAttribute('hidden', !dataVisible);
    dataPanelEl.setAttribute('aria-hidden', dataVisible ? 'false' : 'true');
  }

  if (controlsPanelToggleBtn) {
    controlsPanelToggleBtn.textContent = controlsVisible ? 'Hide Controls' : 'Show Controls';
    controlsPanelToggleBtn.setAttribute('aria-pressed', controlsVisible ? 'true' : 'false');
    controlsPanelToggleBtn.setAttribute('aria-expanded', controlsVisible ? 'true' : 'false');
    controlsPanelToggleBtn.classList.toggle('primary', !controlsVisible);
  }

  if (dataPanelToggleBtn) {
    dataPanelToggleBtn.textContent = dataVisible ? 'Hide Data' : 'Show Data';
    dataPanelToggleBtn.setAttribute('aria-pressed', dataVisible ? 'true' : 'false');
    dataPanelToggleBtn.setAttribute('aria-expanded', dataVisible ? 'true' : 'false');
    dataPanelToggleBtn.classList.toggle('primary', !dataVisible);
  }

  if (canvas) {
    requestAnimationFrame(() => {
      resizeCanvas();
    });
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
  startAudioSilenceMonitor();
}

function handleAudioPlaybackFailure(error) {
  autoplayHintShown = false;
  if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') {
    audioAutoplayBlocked = true;
    ensureAudioUnlockListener();
  } else {
    audioStreamError = true;
    showMessage('Audio stream unavailable. Check the receiver.', {
      duration: DISPLAY_TIMEOUT_MS * 2,
    });
    console.warn('Unable to start audio stream', error);
    scheduleAudioRetry();
  }
  refreshAudioStreamControls();
  stopAudioSilenceMonitor('unknown');
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
refreshPanelVisibility();
updateOpenStreetMapOverlaySource();
refreshOpenStreetMapOverlay();

if (geolocationPermissionModal) {
  geolocationPermissionModal.setAttribute(
    'aria-hidden',
    geolocationPermissionModal.hasAttribute('hidden') ? 'true' : 'false',
  );
}

if (centerOnLocationBtn) {
  if (!supportsGeolocation()) {
    centerOnLocationBtn.setAttribute('disabled', 'true');
    centerOnLocationBtn.setAttribute('title', 'Geolocation is unavailable in this browser.');
  } else {
    applyGeolocationPermissionState(geolocationPermissionState);
    void watchGeolocationPermissionState();
  }
}

if (manualLocationBtn) {
  manualLocationBtn.addEventListener('click', () => {
    openManualLocationPicker();
  });
}

if (manualLocationCancelBtn) {
  manualLocationCancelBtn.addEventListener('click', () => {
    closeManualLocationPicker();
  });
}

if (manualLocationConfirmBtn) {
  manualLocationConfirmBtn.addEventListener('click', () => {
    applyManualLocationSelection();
  });
}

if (manualLocationBackdrop) {
  manualLocationBackdrop.addEventListener('click', () => {
    closeManualLocationPicker();
  });
}

if (manualLocationModal) {
  manualLocationModal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeManualLocationPicker();
    }
  });
}

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

if (openStreetMapOverlayToggleBtn) {
  openStreetMapOverlayToggleBtn.addEventListener('click', () => {
    state.openStreetMapOverlayVisible = !state.openStreetMapOverlayVisible;
    writeCookie(
      BASEMAP_OVERLAY_STORAGE_KEY,
      state.openStreetMapOverlayVisible ? 'true' : 'false',
    );
    if (state.openStreetMapOverlayVisible) {
      updateOpenStreetMapOverlaySource();
    }
    refreshOpenStreetMapOverlay();
  });
}

if (audioStreamEl) {
  audioStreamEl.defaultMuted = true;
  audioStreamEl.muted = true;
  audioStreamEl.autoplay = true;
  if ('playsInline' in audioStreamEl) {
    audioStreamEl.playsInline = true;
  }
  audioStreamEl.crossOrigin = 'anonymous';
  audioStreamEl.src = AUDIO_STREAM_URL;
  const savedMuted = readCookie(AUDIO_MUTED_STORAGE_KEY);
  desiredAudioMuted = savedMuted === 'true';
  pendingAutoUnmute = !desiredAudioMuted;
  audioSignalState = desiredAudioMuted ? 'muted' : 'unknown';

  refreshAudioStreamControls();

  audioStreamEl.addEventListener('playing', () => {
    audioStreamError = false;
    audioAutoplayBlocked = false;
    clearAudioRetryTimer();
    refreshAudioStreamControls();
    startAudioSilenceMonitor();
  });

  audioStreamEl.addEventListener('pause', () => {
    stopAudioSilenceMonitor(desiredAudioMuted ? 'muted' : 'unknown');
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
    stopAudioSilenceMonitor('unknown');
    attemptAudioPlayback();
  });

  audioStreamEl.addEventListener('error', (event) => {
    audioStreamError = true;
    stopAudioSilenceMonitor('unknown');
    refreshAudioStreamControls();
    showMessage('Audio stream unavailable. Check the receiver.', {
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
    stopAudioSilenceMonitor('muted');
    refreshAudioStreamControls();
    return;
  }

  audioStreamError = false;
  refreshAudioStreamControls();
  startAudioSilenceMonitor();

  if (audioStreamEl.paused) {
    attemptAudioPlayback();
  }
});

volumeDecreaseBtn?.addEventListener('click', () => adjustVolume(-1));
volumeIncreaseBtn?.addEventListener('click', () => adjustVolume(1));
rangeDecreaseBtn?.addEventListener('click', () => adjustRange(-1));
rangeIncreaseBtn?.addEventListener('click', () => adjustRange(1));
alertRangeDecreaseBtn?.addEventListener('click', () => adjustBaseAlertRange(-BASE_ALERT_RANGE_STEP_KM));
alertRangeIncreaseBtn?.addEventListener('click', () => adjustBaseAlertRange(BASE_ALERT_RANGE_STEP_KM));
radarRotateBtn?.addEventListener('click', rotateRadarClockwise);
centerOnLocationBtn?.addEventListener('click', () => {
  if (geolocationPermissionState === 'denied') {
    showGeolocationPermissionHelp();
  }
  centerRadarOnUserLocation();
});
geolocationPermissionCloseBtn?.addEventListener('click', hideGeolocationPermissionHelp);
geolocationPermissionBackdrop?.addEventListener('click', hideGeolocationPermissionHelp);
geolocationPermissionModal?.addEventListener('click', (event) => {
  if (event.target === geolocationPermissionModal) {
    hideGeolocationPermissionHelp();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && geolocationPermissionModal && !geolocationPermissionModal.hasAttribute('hidden')) {
    hideGeolocationPermissionHelp();
  }
});
canvas?.addEventListener('click', handleRadarTap);

controlsPanelToggleBtn?.addEventListener('click', () => {
  state.controlsPanelVisible = !state.controlsPanelVisible;
  writeCookie(
    CONTROLS_PANEL_VISIBLE_STORAGE_KEY,
    state.controlsPanelVisible ? 'true' : 'false',
  );
  refreshPanelVisibility();
});

dataPanelToggleBtn?.addEventListener('click', () => {
  state.dataPanelVisible = !state.dataPanelVisible;
  writeCookie(
    DATA_PANEL_VISIBLE_STORAGE_KEY,
    state.dataPanelVisible ? 'true' : 'false',
  );
  refreshPanelVisibility();
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

// Convert lat/lon pairs into a planar approximation so we can reason about
// approach geometry using straight-line math.
function projectOffsetsKm(originLat, originLon, targetLat, targetLon) {
  const dLatRad = deg2rad(targetLat - originLat);
  const dLonRad = deg2rad(targetLon - originLon);
  const meanLatRad = deg2rad((originLat + targetLat) / 2);
  const eastKm = EARTH_RADIUS_KM * dLonRad * Math.cos(meanLatRad);
  const northKm = EARTH_RADIUS_KM * dLatRad;
  return { eastKm, northKm };
}

function simplifyOutlinePoints(points, minSpacingKm = LAND_MASS_MIN_VERTEX_SPACING_KM) {
  if (!Array.isArray(points) || points.length < 3) {
    return [];
  }

  const validPoints = [];
  for (const point of points) {
    if (!point) {
      continue;
    }

    const lat = Number(point.lat);
    const lon = Number(point.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    validPoints.push({ lat, lon });
  }

  if (validPoints.length < 3) {
    return validPoints;
  }

  const simplified = [];
  let previousKept = null;

  for (let index = 0; index < validPoints.length; index += 1) {
    const point = validPoints[index];
    if (!previousKept) {
      previousKept = point;
      simplified.push(point);
      continue;
    }

    const isLastPoint = index === validPoints.length - 1;
    const spacingKm = haversine(previousKept.lat, previousKept.lon, point.lat, point.lon);
    if (isLastPoint || !Number.isFinite(spacingKm) || spacingKm >= minSpacingKm) {
      previousKept = point;
      simplified.push(point);
    }
  }

  return simplified.length >= 3 ? simplified : validPoints;
}

function convertGeoJsonToOutlines(geoJson, options = {}) {
  if (!geoJson) {
    return [];
  }

  const receiverLat = Number(state.receiver?.lat);
  const receiverLon = Number(state.receiver?.lon);
  const receiverReady = Number.isFinite(receiverLat) && Number.isFinite(receiverLon);

  const {
    maxDistanceKm = LAND_MASS_MAX_DISTANCE_KM,
    minVertexSpacingKm = LAND_MASS_MIN_VERTEX_SPACING_KM,
  } = options;

  const features = [];
  if (geoJson.type === 'FeatureCollection' && Array.isArray(geoJson.features)) {
    features.push(...geoJson.features);
  } else if (geoJson.type === 'Feature') {
    features.push(geoJson);
  } else if (geoJson.type === 'Polygon' || geoJson.type === 'MultiPolygon') {
    features.push({ type: 'Feature', geometry: geoJson });
  } else {
    return [];
  }

  const outlines = [];

  for (const feature of features) {
    const geometry = feature?.geometry || feature;
    if (!geometry) {
      continue;
    }

    const polygons = [];
    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
      polygons.push(geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
      polygons.push(...geometry.coordinates);
    } else {
      continue;
    }

    const rawName =
      typeof feature?.properties?.name === 'string'
        ? feature.properties.name
        : typeof feature?.properties?.NAME === 'string'
          ? feature.properties.NAME
          : null;
    const trimmedName = rawName ? rawName.trim() : '';

    for (const polygon of polygons) {
      const outerRing = Array.isArray(polygon?.[0]) ? polygon[0] : null;
      if (!outerRing || outerRing.length < 4) {
        continue;
      }

      const outlinePoints = [];
      let minDistance = Infinity;

      for (const coordinate of outerRing) {
        if (!Array.isArray(coordinate) || coordinate.length < 2) {
          continue;
        }

        const lon = Number(coordinate[0]);
        const lat = Number(coordinate[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          continue;
        }

        outlinePoints.push({ lat, lon });

        if (receiverReady && Number.isFinite(maxDistanceKm)) {
          const { eastKm, northKm } = projectOffsetsKm(receiverLat, receiverLon, lat, lon);
          const distanceKm = Math.sqrt(eastKm * eastKm + northKm * northKm);
          if (Number.isFinite(distanceKm)) {
            minDistance = Math.min(minDistance, distanceKm);
          }
        }
      }

      if (outlinePoints.length < 3) {
        continue;
      }

      const first = outlinePoints[0];
      const last = outlinePoints[outlinePoints.length - 1];
      if (first && last && Math.abs(first.lat - last.lat) < 1e-6 && Math.abs(first.lon - last.lon) < 1e-6) {
        outlinePoints.pop();
      }

      const simplified = simplifyOutlinePoints(outlinePoints, minVertexSpacingKm);
      if (simplified.length < 3) {
        continue;
      }

      if (
        receiverReady
        && Number.isFinite(maxDistanceKm)
        && minDistance !== Infinity
        && minDistance > maxDistanceKm
      ) {
        continue;
      }

      const points = simplified.map((point) => Object.freeze({ lat: point.lat, lon: point.lon }));
      outlines.push(
        Object.freeze({
          id: feature?.id || null,
          name: trimmedName || null,
          points: Object.freeze(points),
        }),
      );
    }
  }

  return outlines;
}

function getLandMassPattern(context) {
  if (!context) {
    return null;
  }

  if (cachedLandMassPattern) {
    return cachedLandMassPattern;
  }

  const size = 16;
  const spacing = 6;
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = size;
  patternCanvas.height = size;

  const patternCtx = patternCanvas.getContext('2d');
  if (!patternCtx) {
    return null;
  }

  patternCtx.clearRect(0, 0, size, size);
  patternCtx.fillStyle = 'rgba(64, 196, 255, 0.035)';
  patternCtx.fillRect(0, 0, size, size);
  patternCtx.strokeStyle = 'rgba(64, 196, 255, 0.12)';
  patternCtx.lineWidth = 1;

  for (let offset = -size; offset <= size; offset += spacing) {
    patternCtx.beginPath();
    patternCtx.moveTo(offset, size);
    patternCtx.lineTo(offset + size, 0);
    patternCtx.stroke();
  }

  cachedLandMassPattern = context.createPattern(patternCanvas, 'repeat');
  return cachedLandMassPattern;
}

function projectRadarPoint(lat, lon, centerX, centerY, radarRadius, radarRangeKm) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  if (!Number.isFinite(radarRangeKm) || radarRangeKm <= 0) {
    return null;
  }

  const { eastKm, northKm } = projectOffsetsKm(
    state.receiver.lat,
    state.receiver.lon,
    lat,
    lon,
  );

  const distanceKm = Math.sqrt(eastKm * eastKm + northKm * northKm);
  if (!Number.isFinite(distanceKm)) {
    return null;
  }

  const angleRad = Math.atan2(eastKm, northKm);
  const clampedDistanceKm = Math.min(distanceKm, radarRangeKm);
  const radius = (clampedDistanceKm / radarRangeKm) * radarRadius;

  return {
    x: centerX + Math.sin(angleRad) * radius,
    y: centerY - Math.cos(angleRad) * radius,
    distanceKm,
  };
}

function drawLandMasses(centerX, centerY, radarRadius, radarRangeKm) {
  const outlines = state.landMasses;
  if (!Array.isArray(outlines) || outlines.length === 0) {
    return;
  }

  if (!Number.isFinite(radarRadius) || radarRadius <= 0) {
    return;
  }

  if (!Number.isFinite(radarRangeKm) || radarRangeKm <= 0) {
    return;
  }

  const pattern = getLandMassPattern(ctx);
  const fallbackFill = 'rgba(64, 196, 255, 0.05)';
  const outlineColor = 'rgba(64, 196, 255, 0.2)';
  const outlineWidth = Math.max(1, radarRadius * 0.0015);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
  ctx.clip();

  for (const outline of outlines) {
    const points = Array.isArray(outline?.points) ? outline.points : null;
    if (!points || points.length < 3) {
      continue;
    }

    const projected = [];
    for (const point of points) {
      const projectedPoint = projectRadarPoint(
        point?.lat,
        point?.lon,
        centerX,
        centerY,
        radarRadius,
        radarRangeKm,
      );

      if (projectedPoint) {
        projected.push(projectedPoint);
      }
    }

    if (projected.length < 3) {
      continue;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i += 1) {
      ctx.lineTo(projected[i].x, projected[i].y);
    }
    ctx.closePath();

    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.globalAlpha = 0.6;
      ctx.fill();
    } else {
      ctx.globalAlpha = 1;
      ctx.fillStyle = fallbackFill;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = outlineColor;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function rebuildLandMassOutlines({ silent = false } = {}) {
  if (!landMassGeoJsonCache) {
    return;
  }

  const options = {
    maxDistanceKm: activeLandMassSettings?.maxDistanceKm ?? LAND_MASS_MAX_DISTANCE_KM,
    minVertexSpacingKm: activeLandMassSettings?.minVertexSpacingKm ?? LAND_MASS_MIN_VERTEX_SPACING_KM,
  };

  const outlines = convertGeoJsonToOutlines(landMassGeoJsonCache, options);
  if (outlines.length === 0) {
    return;
  }

  state.landMasses = outlines;
  if (!silent && state.landMassSourceName) {
    showMessage(`Coastline recentered for ${state.landMassSourceName}.`, { duration: DISPLAY_TIMEOUT_MS * 2 });
  }
}

async function loadLandMassOutlines() {
  const sources = Array.isArray(LAND_MASS_SOURCES) ? LAND_MASS_SOURCES : [];
  if (sources.length === 0) {
    return;
  }

  for (const source of sources) {
    if (!source || typeof source.url !== 'string' || !source.url) {
      continue;
    }

    const timeoutMs = Number.isFinite(source.timeoutMs) ? source.timeoutMs : 10000;
    const maxDistanceKm = Number.isFinite(source.maxDistanceKm)
      ? source.maxDistanceKm
      : LAND_MASS_MAX_DISTANCE_KM;
    const minVertexSpacingKm = Number.isFinite(source.minVertexSpacingKm)
      ? source.minVertexSpacingKm
      : LAND_MASS_MIN_VERTEX_SPACING_KM;

    try {
      const geoJson = await fetchJson(source.url, { timeout: timeoutMs });
      const outlines = convertGeoJsonToOutlines(geoJson, {
        maxDistanceKm,
        minVertexSpacingKm,
      });

      if (outlines.length === 0) {
        console.warn('Landmass source returned no usable outlines', source);
        continue;
      }

      landMassGeoJsonCache = geoJson;
      activeLandMassSettings = { maxDistanceKm, minVertexSpacingKm };
      state.landMasses = outlines;
      state.landMassSourceId = typeof source.id === 'string' ? source.id : null;
      state.landMassSourceName = typeof source.name === 'string' ? source.name : null;

      const notice = state.landMassSourceName || 'coastline data';
      showMessage(`Loaded ${notice}.`, { duration: DISPLAY_TIMEOUT_MS * 2 });
      return;
    } catch (error) {
      console.warn('Failed to load landmass outlines', source.url, error);
    }
  }

  if (!Array.isArray(state.landMasses) || state.landMasses.length === 0) {
    state.landMasses = Array.isArray(LAND_MASS_OUTLINES) ? LAND_MASS_OUTLINES : [];
    if (!state.landMasses.length) {
      showMessage('Coastline data unavailable. Update LAND_MASS_SOURCES to supply map outlines.', {
        duration: DISPLAY_TIMEOUT_MS * 2,
      });
    }
  }
}

// Estimate how close an aircraft's current trajectory will bring it to the
// receiver. This lets us flag traffic that is still outside the configured
// radius but trending inbound.
function estimateClosestApproachToBaseKm(craft) {
  if (!craft || !Number.isFinite(craft.heading)) {
    return null;
  }

  const heading = normalizeHeading(craft.heading);
  if (heading === null) {
    return null;
  }

  if (!Number.isFinite(craft.lat) || !Number.isFinite(craft.lon)) {
    return null;
  }

  const { eastKm, northKm } = projectOffsetsKm(
    state.receiver.lat,
    state.receiver.lon,
    craft.lat,
    craft.lon,
  );

  const headingRad = deg2rad(heading);
  const dirX = Math.sin(headingRad);
  const dirY = Math.cos(headingRad);
  const dot = eastKm * dirX + northKm * dirY;
  const distanceSq = eastKm * eastKm + northKm * northKm;

  if (dot <= 0) {
    return Math.sqrt(distanceSq);
  }

  const closestSq = Math.max(0, distanceSq - dot * dot);
  return Math.sqrt(closestSq);
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

function getCollisionAlertKey(craftA, craftB) {
  if (!craftA || !craftB) {
    return null;
  }

  const keyA = craftA.key || getCraftKey(craftA);
  const keyB = craftB.key || getCraftKey(craftB);
  if (!keyA || !keyB || keyA === keyB) {
    return null;
  }

  return keyA < keyB
    ? `collision-${keyA}-${keyB}`
    : `collision-${keyB}-${keyA}`;
}

function shouldDisplayCraft(craft) {
  if (!state.displayOnlySelected || !state.selectedAircraftKey) {
    return true;
  }
  const key = craft.key || getCraftKey(craft);
  return key === state.selectedAircraftKey;
}

function shouldDisplayBlip(blip) {
  if (!state.displayOnlySelected || !state.selectedAircraftKey) {
    return true;
  }
  const blipKey = blip.key || blip.hex || blip.flight || null;
  return blipKey === state.selectedAircraftKey;
}

function getBeepFrequencyForAltitude(altitude) {
  if (altitude == null || altitude < 0) return FREQ_MID;
  if (altitude < ALT_LOW_FEET) return FREQ_LOW;
  if (altitude < ALT_HIGH_FEET) return FREQ_MID;
  return FREQ_HIGH;
}

function shortestHeadingDelta(a, b) {
  const normalizedA = normalizeHeading(a);
  const normalizedB = normalizeHeading(b);
  if (normalizedA === null || normalizedB === null) {
    return null;
  }

  let delta = Math.abs(normalizedA - normalizedB) % 360;
  if (delta > 180) {
    delta = 360 - delta;
  }
  return delta;
}

function getCraftIdentifier(craft) {
  if (!craft) {
    return 'Unknown aircraft';
  }

  const flight = typeof craft.flight === 'string' ? craft.flight.trim() : '';
  if (flight) {
    return flight;
  }

  const hex = typeof craft.hex === 'string' ? craft.hex.trim().toUpperCase() : '';
  if (hex) {
    return hex;
  }

  return 'Unknown aircraft';
}

function pruneAlertHistory(now = Date.now()) {
  if (!state.alertHistory) {
    state.alertHistory = new Map();
    return;
  }

  for (const [key, timestamp] of state.alertHistory) {
    if (now - timestamp > ALERT_HISTORY_MAX_AGE_MS) {
      state.alertHistory.delete(key);
    }
  }
}

function registerAlertHighlight(craftKey, durationMs = ALERT_HIGHLIGHT_DURATION_MS) {
  if (!craftKey) {
    return;
  }

  const duration = Math.max(1000, durationMs);
  const expiresAt = Date.now() + duration;
  state.alertHighlights.set(craftKey, expiresAt);
}

function pruneAlertHighlights(activeKeys = [], now = Date.now()) {
  if (!state.alertHighlights) {
    state.alertHighlights = new Map();
    return;
  }

  const activeSet = Array.isArray(activeKeys) ? new Set(activeKeys.filter(Boolean)) : null;

  for (const [key, expiresAt] of state.alertHighlights) {
    if ((activeSet && !activeSet.has(key)) || now >= expiresAt) {
      state.alertHighlights.delete(key);
    }
  }
}

function removeQueuedTickerMessagesByKey(key) {
  if (!key || !Array.isArray(tickerState.queue) || tickerState.queue.length === 0) {
    return;
  }

  tickerState.queue = tickerState.queue.filter((entry) => entry?.key !== key);
}

function pruneInactiveLiveAlerts(now = Date.now()) {
  if (!tickerState.liveAlerts || tickerState.liveAlerts.size === 0) {
    return;
  }

  const cutoff = now - LIVE_ALERT_GRACE_MS;
  const staleKeys = [];
  for (const [key, entry] of tickerState.liveAlerts) {
    if (!entry || !Number.isFinite(entry.lastSeenAt) || entry.lastSeenAt < cutoff) {
      staleKeys.push(key);
    }
  }

  staleKeys.forEach((key) => resolveTickerAlert(key));
}

function getNextLiveTickerAlertEntry() {
  pruneInactiveLiveAlerts();

  if (!Array.isArray(tickerState.liveRotation) || tickerState.liveRotation.length === 0) {
    return null;
  }

  const rotationLength = tickerState.liveRotation.length;
  for (let i = 0; i < rotationLength; i += 1) {
    const key = tickerState.liveRotation.shift();
    if (!key) {
      continue;
    }

    const entry = tickerState.liveAlerts.get(key);
    if (entry) {
      tickerState.liveRotation.push(key);
      return {
        text: entry.message,
        duration: entry.duration,
        key,
      };
    }
  }

  return null;
}

function resolveTickerAlert(alertKey) {
  if (!alertKey) {
    return;
  }

  if (tickerState.liveAlerts?.has(alertKey)) {
    tickerState.liveAlerts.delete(alertKey);
  }

  if (Array.isArray(tickerState.liveRotation) && tickerState.liveRotation.length > 0) {
    tickerState.liveRotation = tickerState.liveRotation.filter((key) => key !== alertKey);
  }

  removeQueuedTickerMessagesByKey(alertKey);
}

function activateLiveTickerAlert(alertKey, message, options = {}) {
  const {
    duration = null,
    cooldownMs = ALERT_COOLDOWN_MS,
    highlightCraftKey = null,
    highlightDurationMs = ALERT_HIGHLIGHT_DURATION_MS,
  } = options;

  if (!alertKey) {
    enqueueTickerMessage(message, { duration });
    if (highlightCraftKey) {
      registerAlertHighlight(highlightCraftKey, highlightDurationMs);
    }
    return;
  }

  const now = Date.now();
  pruneAlertHistory(now);

  const existingEntry = tickerState.liveAlerts.get(alertKey) || null;
  if (!existingEntry) {
    const lastShown = state.alertHistory.get(alertKey) || 0;
    if (now - lastShown < cooldownMs) {
      return;
    }
  }

  const computedDuration = computeTickerDuration(message, duration);
  const updatedEntry = existingEntry ? { ...existingEntry } : {};
  updatedEntry.message = message;
  updatedEntry.duration = computedDuration;
  updatedEntry.lastSeenAt = now;
  tickerState.liveAlerts.set(alertKey, updatedEntry);

  if (!existingEntry) {
    state.alertHistory.set(alertKey, now);
    if (!tickerState.liveRotation.includes(alertKey)) {
      tickerState.liveRotation.push(alertKey);
    }
    enqueueTickerMessage(message, { duration: computedDuration, queueKey: alertKey });
  }

  if (highlightCraftKey) {
    registerAlertHighlight(highlightCraftKey, highlightDurationMs);
  }

  if (!tickerState.active) {
    playNextTickerMessage();
  }
}

function emitTickerAlert(alertKey, message, options = {}) {
  const {
    duration = null,
    cooldownMs = ALERT_COOLDOWN_MS,
    highlightCraftKey = null,
    highlightDurationMs = ALERT_HIGHLIGHT_DURATION_MS,
    repeatWhileActive = false,
  } = options;

  if (repeatWhileActive) {
    activateLiveTickerAlert(alertKey, message, {
      duration,
      cooldownMs,
      highlightCraftKey,
      highlightDurationMs,
    });
    return;
  }

  const now = Date.now();
  pruneAlertHistory(now);

  if (alertKey) {
    const lastShown = state.alertHistory.get(alertKey) || 0;
    if (now - lastShown < cooldownMs) {
      return;
    }
    state.alertHistory.set(alertKey, now);
  }

  enqueueTickerMessage(message, { duration });

  if (highlightCraftKey) {
    registerAlertHighlight(highlightCraftKey, highlightDurationMs);
  }
}

function evaluateSquawkAlert(craft) {
  if (!craft) {
    return;
  }

  const squawk = typeof craft.squawk === 'string' ? craft.squawk.trim() : '';
  const normalized = /^[0-7]{4}$/.test(squawk) ? squawk : '';
  const description = normalized ? EMERGENCY_SQUAWK_CODES[normalized] : null;
  const alertKey = `squawk-${craft.key || getCraftKey(craft)}`;

  if (!description) {
    resolveTickerAlert(alertKey);
    return;
  }

  const identifier = getCraftIdentifier(craft);
  const message = `Squawk alert: ${identifier} transmitting emergency code ${normalized} (${description}).`;

  emitTickerAlert(alertKey, message, {
    cooldownMs: 5 * 60 * 1000,
    highlightCraftKey: craft.key,
    repeatWhileActive: true,
  });
}

function evaluateRapidDescentAlert(craft) {
  if (!craft) {
    return;
  }

  const identifier = getCraftIdentifier(craft);
  const alertKey = `rapid-descent-${craft.key || identifier}`;

  if (
    craft.onGround
    || !Number.isFinite(craft.verticalRate)
    || craft.verticalRate >= RAPID_DESCENT_THRESHOLD_FPM
    || craft.altitudeDescentConfirmed !== true
  ) {
    resolveTickerAlert(alertKey);
    return;
  }

  const descentRate = Math.abs(Math.round(craft.verticalRate));
  const altitudePortion = Number.isFinite(craft.altitude) && craft.altitude > 0
    ? ` at ${craft.altitude.toLocaleString()} ft`
    : '';
  const message = `Rapid descent: ${identifier} dropping ${descentRate.toLocaleString()} fpm${altitudePortion}.`;

  emitTickerAlert(alertKey, message, {
    cooldownMs: 3 * 60 * 1000,
    highlightCraftKey: craft.key,
    repeatWhileActive: true,
  });
}

function evaluateBaseApproachAlert(craft) {
  if (!craft) {
    return;
  }

  const identifier = getCraftIdentifier(craft);
  const alertKey = `base-approach-${craft.key || identifier}`;

  if (craft.onGround || state.baseAlertRangeKm <= BASE_ALERT_RANGE_MIN_KM) {
    resolveTickerAlert(alertKey);
    return;
  }

  if (!Number.isFinite(craft.distanceKm)) {
    resolveTickerAlert(alertKey);
    return;
  }

  if (!Number.isFinite(craft.groundSpeed) || craft.groundSpeed < BASE_APPROACH_MIN_GROUNDSPEED_KTS) {
    resolveTickerAlert(alertKey);
    return;
  }

  const heading = normalizeHeading(craft.heading);
  if (heading === null) {
    resolveTickerAlert(alertKey);
    return;
  }

  const bearingToBase = calculateBearing(craft.lat, craft.lon, state.receiver.lat, state.receiver.lon);
  const delta = shortestHeadingDelta(heading, bearingToBase);
  if (delta === null || delta > BASE_APPROACH_HEADING_TOLERANCE_DEG) {
    resolveTickerAlert(alertKey);
    return;
  }

  const withinRangeNow = craft.distanceKm <= state.baseAlertRangeKm;
  const closestApproachKm = estimateClosestApproachToBaseKm(craft);
  if (!withinRangeNow) {
    if (!Number.isFinite(closestApproachKm) || closestApproachKm > state.baseAlertRangeKm) {
      resolveTickerAlert(alertKey);
      return;
    }
  }

  const distanceLabel = `${Math.round(craft.distanceKm)} km`;
  const message = withinRangeNow
    ? `Inbound alert: ${identifier} ${distanceLabel} out and tracking to base.`
    : `Inbound alert: ${identifier} ${distanceLabel} out and projected to enter the ${state.baseAlertRangeKm} km base radius.`;

  emitTickerAlert(alertKey, message, {
    cooldownMs: 5 * 60 * 1000,
    highlightCraftKey: craft.key,
    repeatWhileActive: true,
  });
}

function evaluateCollisionCourseAlerts(aircraftList) {
  const activePairs = new Set();

  if (Array.isArray(aircraftList) && aircraftList.length >= 2) {
    for (let i = 0; i < aircraftList.length - 1; i += 1) {
      const craftA = aircraftList[i];
      if (!craftA || craftA.onGround) continue;
      if (!Number.isFinite(craftA.lat) || !Number.isFinite(craftA.lon)) continue;
      if (!Number.isFinite(craftA.altitude) || craftA.altitude < 0) continue;
      if (!Number.isFinite(craftA.heading)) continue;
      if (!Number.isFinite(craftA.groundSpeed) || craftA.groundSpeed < COLLISION_MIN_GROUNDSPEED_KTS) continue;
      if (
        Number.isFinite(craftA.lastMessageAgeSec)
        && craftA.lastMessageAgeSec > COLLISION_MAX_LAST_SEEN_SEC
      ) {
        continue;
      }

      for (let j = i + 1; j < aircraftList.length; j += 1) {
        const craftB = aircraftList[j];
        if (!craftB || craftB.onGround) continue;
        if (!Number.isFinite(craftB.lat) || !Number.isFinite(craftB.lon)) continue;
        if (!Number.isFinite(craftB.altitude) || craftB.altitude < 0) continue;
        if (!Number.isFinite(craftB.heading)) continue;
        if (!Number.isFinite(craftB.groundSpeed) || craftB.groundSpeed < COLLISION_MIN_GROUNDSPEED_KTS) continue;
        if (
          Number.isFinite(craftB.lastMessageAgeSec)
          && craftB.lastMessageAgeSec > COLLISION_MAX_LAST_SEEN_SEC
        ) {
          continue;
        }

        const alertKey = getCollisionAlertKey(craftA, craftB);
        if (!alertKey) {
          continue;
        }

        const separationKm = haversine(craftA.lat, craftA.lon, craftB.lat, craftB.lon);
        if (!Number.isFinite(separationKm) || separationKm > COLLISION_ALERT_DISTANCE_KM) {
          resolveTickerAlert(alertKey);
          continue;
        }

        const altitudeDeltaFt = Math.abs(craftA.altitude - craftB.altitude);
        if (!Number.isFinite(altitudeDeltaFt) || altitudeDeltaFt > COLLISION_ALTITUDE_DELTA_MAX_FT) {
          resolveTickerAlert(alertKey);
          continue;
        }

        const headingA = normalizeHeading(craftA.heading);
        const headingB = normalizeHeading(craftB.heading);
        if (headingA === null || headingB === null) {
          resolveTickerAlert(alertKey);
          continue;
        }

        const bearingAToB = calculateBearing(craftA.lat, craftA.lon, craftB.lat, craftB.lon);
        const bearingBToA = calculateBearing(craftB.lat, craftB.lon, craftA.lat, craftA.lon);
        const headingDeltaA = shortestHeadingDelta(headingA, bearingAToB);
        const headingDeltaB = shortestHeadingDelta(headingB, bearingBToA);
        if (
          headingDeltaA === null
          || headingDeltaB === null
          || headingDeltaA > COLLISION_HEADING_ALIGNMENT_DEG
          || headingDeltaB > COLLISION_HEADING_ALIGNMENT_DEG
        ) {
          resolveTickerAlert(alertKey);
          continue;
        }

        const identifierA = getCraftIdentifier(craftA);
        const identifierB = getCraftIdentifier(craftB);
        const distanceLabel = `${separationKm.toFixed(1)} km`;
        const altitudeLabel = `${Math.round(altitudeDeltaFt).toLocaleString()} ft`;
        const message = `Collision alert: ${identifierA} and ${identifierB} converging (${distanceLabel} apart, Δalt ${altitudeLabel}).`;

        emitTickerAlert(alertKey, message, {
          cooldownMs: 60 * 1000,
          highlightCraftKey: craftA.key,
          repeatWhileActive: true,
        });
        registerAlertHighlight(craftB.key, ALERT_HIGHLIGHT_DURATION_MS);
        activePairs.add(alertKey);
      }
    }
  }

  if (tickerState.liveAlerts?.size) {
    const staleKeys = [];
    for (const key of tickerState.liveAlerts.keys()) {
      if (key.startsWith('collision-') && !activePairs.has(key)) {
        staleKeys.push(key);
      }
    }
    staleKeys.forEach((key) => resolveTickerAlert(key));
  }
}

function evaluateAlertTriggers(aircraftList) {
  const crafts = Array.isArray(aircraftList) ? aircraftList : [];

  if (crafts.length > 0) {
    for (const craft of crafts) {
      evaluateSquawkAlert(craft);
      evaluateRapidDescentAlert(craft);
      evaluateBaseApproachAlert(craft);
    }
  }

  evaluateCollisionCourseAlerts(crafts);
  pruneInactiveLiveAlerts();
}

function showMessage(text, options = {}) {
  const { duration = DISPLAY_TIMEOUT_MS } = options;
  state.message = text;
  state.messageUntil = performance.now() + duration;
  updateMessage();
}

function updateMessage() {
  if (!state.message) {
    messageEl.textContent = '';
    return;
  }

  if (performance.now() > state.messageUntil) {
    state.message = '';
    messageEl.textContent = '';
    return;
  }

  messageEl.textContent = state.message;
}

function playNextTickerMessage() {
  if (!messageTickerEl || !messageTickerTrackEl) {
    tickerState.queue.length = 0;
    tickerState.active = null;
    return;
  }

  if (tickerState.active) {
    return;
  }

  if (tickerState.queue.length === 0) {
    const liveEntry = getNextLiveTickerAlertEntry();
    if (liveEntry) {
      tickerState.queue.push(liveEntry);
    }
  }

  if (tickerState.queue.length === 0) {
    messageTickerEl.removeAttribute('data-active');
    return;
  }

  const next = tickerState.queue.shift();
  tickerState.active = next;

  const safeDuration = Math.max(1000, Number(next.duration) || 0);
  messageTickerEl.style.setProperty('--ticker-duration', `${safeDuration}ms`);
  messageTickerTrackEl.textContent = next.text;
  messageTickerTrackEl.classList.remove('message-ticker__track--animate');
  // Force reflow so the animation restarts for successive messages.
  void messageTickerTrackEl.offsetWidth;
  messageTickerTrackEl.classList.add('message-ticker__track--animate');
  messageTickerEl.setAttribute('data-active', 'true');
}

function computeTickerDuration(text, overrideDuration) {
  if (Number.isFinite(overrideDuration)) {
    return Math.max(1000, overrideDuration);
  }

  const lengthWeighted = (text.length || 1) * TICKER_CHAR_DURATION_MS;
  return Math.max(
    TICKER_MIN_DURATION_MS,
    Math.min(TICKER_MAX_DURATION_MS, lengthWeighted),
  );
}

function enqueueTickerMessage(text, options = {}) {
  if (!messageTickerEl || !messageTickerTrackEl) {
    return;
  }

  const { duration = null, key = null, queueKey = null } = options;
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    return;
  }

  if (key && tickerState.shownKeys.has(key)) {
    return;
  }

  const computedDuration = computeTickerDuration(trimmed, duration);
  const queueEntry = {
    text: trimmed,
    duration: computedDuration,
  };

  if (queueKey) {
    queueEntry.key = queueKey;
  } else if (key) {
    queueEntry.key = key;
  }

  tickerState.queue.push(queueEntry);
  if (key) {
    tickerState.shownKeys.add(key);
  }

  if (!tickerState.active) {
    playNextTickerMessage();
  }
}

if (messageTickerTrackEl) {
  const handleTickerAnimationFinished = () => {
    if (!messageTickerEl || !messageTickerTrackEl) {
      tickerState.queue.length = 0;
      tickerState.active = null;
      return;
    }

    tickerState.active = null;
    messageTickerEl.removeAttribute('data-active');
    messageTickerTrackEl.classList.remove('message-ticker__track--animate');
    messageTickerTrackEl.textContent = '';
    playNextTickerMessage();
  };

  messageTickerTrackEl.addEventListener('animationend', handleTickerAnimationFinished);
  messageTickerTrackEl.addEventListener('animationcancel', handleTickerAnimationFinished);
}

function updateRangeInfo() {
  if (volumeLabelEl) volumeLabelEl.textContent = 'Volume';
  if (volumeDescriptionEl) volumeDescriptionEl.textContent = 'Adjust the audio cue loudness.';
  if (volumeValueEl) volumeValueEl.textContent = `${state.beepVolume}`;
  if (rangeValueEl) rangeValueEl.textContent = `${RANGE_STEPS[state.rangeStepIndex]} km`;
  if (alertRangeValueEl) {
    alertRangeValueEl.textContent =
      state.baseAlertRangeKm <= BASE_ALERT_RANGE_MIN_KM ? 'Off' : `${state.baseAlertRangeKm} km`;
  }

  const trackedCount = state.trackedAircraft.filter(shouldDisplayCraft).length;
  const infoLines = [
    { label: 'Contacts', value: trackedCount > 0 ? String(trackedCount) : 'None' },
  ];

  const radarRangeKm = RANGE_STEPS[state.rangeStepIndex];
  state.airspacesInRange = findAirspacesInRange(radarRangeKm);

  rangeInfoEl.innerHTML = infoLines
    .map(({ label, value }) => `<div class="info-line"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');

  updateOpenStreetMapOverlaySource();
}

function calculateBasemapZoom(rangeKm) {
  if (!Number.isFinite(rangeKm)) {
    return 9;
  }

  if (rangeKm <= 10) return 12;
  if (rangeKm <= 25) return 11;
  if (rangeKm <= 50) return 10;
  if (rangeKm <= 100) return 9;
  if (rangeKm <= 200) return 8;
  if (rangeKm <= 300) return 7;
  return 6;
}

function buildOpenStreetMapEmbedUrl(lat, lon, rangeKm) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const safeRangeKm = Number.isFinite(rangeKm) ? Math.max(1, rangeKm) : 50;
  const latDelta = safeRangeKm / 111;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lonScale = Math.max(Math.abs(cosLat), 0.01) * 111;
  const lonDelta = safeRangeKm / lonScale;

  const minLat = Math.max(-90, lat - latDelta);
  const maxLat = Math.min(90, lat + latDelta);
  const minLon = Math.max(-180, lon - lonDelta);
  const maxLon = Math.min(180, lon + lonDelta);

  const toFixed = (value) => value.toFixed(6);
  const bbox = `${toFixed(minLon)},${toFixed(minLat)},${toFixed(maxLon)},${toFixed(maxLat)}`;
  const marker = `${toFixed(lat)},${toFixed(lon)}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
}

function getRadarRotationDegrees() {
  const quarterTurns = Number.isFinite(state?.radarRotationQuarterTurns)
    ? state.radarRotationQuarterTurns
    : 0;
  const normalizedQuarterTurns = ((quarterTurns % 4) + 4) % 4;
  return normalizedQuarterTurns * 90;
}

function applyOpenStreetMapOverlayRotation() {
  if (!openStreetMapOverlayEl) {
    return;
  }

  const rotationDeg = getRadarRotationDegrees();
  openStreetMapOverlayEl.style.setProperty('--radar-rotation', `${rotationDeg}deg`);
}

function updateOpenStreetMapOverlaySource() {
  if (!openStreetMapFrameEl) {
    return;
  }

  const { lat, lon } = state.receiver;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return;
  }

  const rangeKm = RANGE_STEPS[state.rangeStepIndex] ?? RANGE_STEPS[DEFAULT_RANGE_STEP_INDEX];
  const url = buildOpenStreetMapEmbedUrl(lat, lon, rangeKm);

  if (url && openStreetMapFrameEl.getAttribute('src') !== url) {
    openStreetMapFrameEl.setAttribute('src', url);
  }

  applyOpenStreetMapOverlayRotation();
}

function refreshOpenStreetMapOverlay() {
  if (!openStreetMapOverlayToggleBtn || !openStreetMapOverlayEl) {
    return;
  }

  const overlayEnabled = !!state.openStreetMapOverlayVisible;
  const hasReceiverFix = Number.isFinite(state.receiver?.lat) && Number.isFinite(state.receiver?.lon);
  const shouldShowOverlay = overlayEnabled && hasReceiverFix;

  openStreetMapOverlayToggleBtn.textContent = overlayEnabled ? 'Hide' : 'Show';
  openStreetMapOverlayToggleBtn.setAttribute('aria-pressed', overlayEnabled ? 'true' : 'false');
  openStreetMapOverlayToggleBtn.classList.toggle('primary', overlayEnabled);
  openStreetMapOverlayToggleBtn.toggleAttribute('disabled', !hasReceiverFix);

  if (openStreetMapOverlayStateEl) {
    if (!hasReceiverFix) {
      openStreetMapOverlayStateEl.textContent = 'Unavailable';
    } else {
      openStreetMapOverlayStateEl.textContent = overlayEnabled ? 'Visible' : 'Hidden';
    }
  }

  openStreetMapOverlayEl.classList.toggle('openstreetmap-overlay--visible', shouldShowOverlay);
  openStreetMapOverlayEl.toggleAttribute('hidden', !shouldShowOverlay);
  openStreetMapOverlayEl.setAttribute('aria-hidden', shouldShowOverlay ? 'false' : 'true');
  applyOpenStreetMapOverlayRotation();
}

function loadLeafletAssets() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('The manual picker requires a browser environment.'));
  }

  if (window.L && typeof window.L.map === 'function') {
    return Promise.resolve(window.L);
  }

  if (leafletAssetsPromise) {
    return leafletAssetsPromise;
  }

  const ensureLeafletStylesheet = (source) => {
    if (!source || typeof source !== 'object' || !source.cssHref) {
      return null;
    }

    const existing = document.querySelector('link[data-leaflet="css"]');
    if (existing) {
      const currentHref = existing.getAttribute('href');
      if (currentHref === source.cssHref) {
        return existing;
      }
      existing.remove();
    }

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = source.cssHref;
    stylesheet.setAttribute('data-leaflet', 'css');
    if (source.id) {
      stylesheet.setAttribute('data-leaflet-source', source.id);
    }
    if (source.cssIntegrity) {
      stylesheet.integrity = source.cssIntegrity;
      stylesheet.crossOrigin = 'anonymous';
    } else {
      stylesheet.crossOrigin = 'anonymous';
    }

    document.head.appendChild(stylesheet);
    return stylesheet;
  };

  leafletAssetsPromise = new Promise((resolve, reject) => {
    const resolveIfReady = () => {
      if (window.L && typeof window.L.map === 'function') {
        resolve(window.L);
        return true;
      }
      return false;
    };

    const trySource = (index) => {
      if (resolveIfReady()) {
        return;
      }

      if (index >= LEAFLET_ASSET_SOURCES.length) {
        leafletAssetsPromise = null;
        reject(new Error('The map library could not be loaded from any source. Check your connection or firewall and try again.'));
        return;
      }

      const source = LEAFLET_ASSET_SOURCES[index];
      ensureLeafletStylesheet(source);

      let script = null;
      const loadNextSource = () => {
        if (script) {
          if (typeof script.remove === 'function') {
            script.remove();
          } else if (script.parentNode) {
            script.parentNode.removeChild(script);
          }
        }
        // Defer the next attempt slightly to allow error handlers to settle.
        setTimeout(() => {
          trySource(index + 1);
        }, 0);
      };

      script = document.createElement('script');
      script.src = source.jsSrc;
      script.defer = true;
      script.setAttribute('data-leaflet', 'js');
      if (source.id) {
        script.setAttribute('data-leaflet-source', source.id);
      }
      if (source.jsIntegrity) {
        script.integrity = source.jsIntegrity;
        script.crossOrigin = 'anonymous';
      } else {
        script.crossOrigin = 'anonymous';
      }

      script.onload = () => {
        if (!resolveIfReady()) {
          loadNextSource();
        }
      };
      script.onerror = loadNextSource;

      document.head.appendChild(script);
    };

    trySource(0);
  });

  return leafletAssetsPromise;
}

function setManualLocationStatus(message, { isError = false } = {}) {
  if (!manualLocationStatusEl) {
    return;
  }

  manualLocationStatusEl.textContent = message || '';
  manualLocationStatusEl.classList.toggle('manual-location__status--error', !!isError);
  manualLocationStatusEl.toggleAttribute('hidden', !message);
}

function updateManualLocationCoordinatesDisplay(selection) {
  if (!manualLocationCoordinatesEl) {
    return;
  }

  if (!selection) {
    manualLocationCoordinatesEl.textContent = 'Click the map to drop the marker.';
    return;
  }

  const { lat, lon } = selection;
  manualLocationCoordinatesEl.textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
}

function updateManualLocationSelection(lat, lon, { fromMarker = false } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    manualLocationSelection = null;
  } else {
    manualLocationSelection = { lat, lon };
    if (manualLocationMarker && !fromMarker) {
      if (typeof manualLocationMarker.setPosition === 'function') {
        manualLocationMarker.setPosition({ lat, lng: lon });
      } else if (typeof manualLocationMarker.setLatLng === 'function') {
        manualLocationMarker.setLatLng([lat, lon]);
      }
    }
  }

  if (manualLocationConfirmBtn) {
    manualLocationConfirmBtn.toggleAttribute('disabled', !manualLocationSelection);
  }

  updateManualLocationCoordinatesDisplay(manualLocationSelection);
}

function getManualLocationDefaultCenter() {
  const lat = Number.isFinite(state.receiver?.lat)
    ? state.receiver.lat
    : DEFAULT_RECEIVER_LOCATION.lat;
  const lon = Number.isFinite(state.receiver?.lon)
    ? state.receiver.lon
    : DEFAULT_RECEIVER_LOCATION.lon;

  return { lat, lon };
}

function ensureManualLocationMap(leaflet) {
  if (!manualLocationMapEl) {
    return;
  }

  const center = getManualLocationDefaultCenter();
  const latLng = [center.lat, center.lon];
  const zoom = calculateBasemapZoom(
    RANGE_STEPS[state.rangeStepIndex] ?? RANGE_STEPS[DEFAULT_RANGE_STEP_INDEX],
  );

  if (!manualLocationMap) {
    manualLocationMap = leaflet.map(manualLocationMapEl, {
      center: latLng,
      zoom,
      scrollWheelZoom: true,
    });

    leaflet
      .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      })
      .addTo(manualLocationMap);

    manualLocationMarker = leaflet
      .marker(latLng, { draggable: true })
      .addTo(manualLocationMap);

    manualLocationMarker.on('dragend', (event) => {
      const position = typeof event?.target?.getLatLng === 'function'
        ? event.target.getLatLng()
        : null;
      if (position && Number.isFinite(position.lat) && Number.isFinite(position.lng)) {
        updateManualLocationSelection(position.lat, position.lng, { fromMarker: true });
      }
    });

    manualLocationMap.on('click', (event) => {
      if (event && event.latlng) {
        const { lat, lng } = event.latlng;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          updateManualLocationSelection(lat, lng);
        }
      }
    });
  } else {
    manualLocationMap.setView(latLng, zoom);
    if (manualLocationMarker && typeof manualLocationMarker.setLatLng === 'function') {
      manualLocationMarker.setLatLng(latLng);
    }
  }

  updateManualLocationSelection(center.lat, center.lon, { fromMarker: true });

  // Give the modal a moment to settle before forcing a resize so tiles render correctly.
  setTimeout(() => {
    if (manualLocationMap && typeof manualLocationMap.invalidateSize === 'function') {
      manualLocationMap.invalidateSize();
      manualLocationMap.setView(latLng, zoom);
    }
  }, 150);
}

async function openManualLocationPicker() {
  if (!manualLocationModal) {
    return;
  }

  manualLocationReturnFocusEl = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  manualLocationModal.removeAttribute('hidden');
  manualLocationModal.setAttribute('aria-hidden', 'false');

  if (manualLocationConfirmBtn) {
    manualLocationConfirmBtn.setAttribute('disabled', 'true');
  }

  updateManualLocationSelection(NaN, NaN);
  setManualLocationStatus('Loading map…');

  try {
    const leaflet = await loadLeafletAssets();
    ensureManualLocationMap(leaflet);
    setManualLocationStatus('Click the map to drop the marker or drag it into position.');
    if (manualLocationCancelBtn) {
      manualLocationCancelBtn.focus();
    }
  } catch (error) {
    const message = error && typeof error === 'object' && typeof error.message === 'string'
      ? error.message
      : 'The map could not be loaded. Check your connection or firewall and try again.';
    setManualLocationStatus(message, { isError: true });
    if (manualLocationCancelBtn) {
      manualLocationCancelBtn.focus();
    }
  }
}

function closeManualLocationPicker() {
  if (!manualLocationModal) {
    return;
  }

  manualLocationModal.setAttribute('hidden', 'true');
  manualLocationModal.setAttribute('aria-hidden', 'true');

  if (manualLocationReturnFocusEl && typeof manualLocationReturnFocusEl.focus === 'function') {
    manualLocationReturnFocusEl.focus();
  }

  manualLocationReturnFocusEl = null;
}

function applyManualLocationSelection() {
  if (!manualLocationSelection) {
    return;
  }

  const { lat, lon } = manualLocationSelection;
  state.receiver.lat = lat;
  state.receiver.lon = lon;
  state.receiver.hasOverride = true;
  writeCookie('receiverLat', String(lat));
  writeCookie('receiverLon', String(lon));
  updateReceiverInfo();
  updateRangeInfo();
  rebuildLandMassOutlines({ silent: true });
  showMessage('Receiver location updated.', { duration: DISPLAY_TIMEOUT_MS * 2 });
  closeManualLocationPicker();
}

function formatCoordinate(value) {
  if (!Number.isFinite(value)) {
    return 'Unknown';
  }

  return `${value.toFixed(4)}°`;
}

const getAirspaceIdentifier = (space) => {
  if (!space || typeof space !== 'object') {
    return '';
  }

  if (typeof space.shortIdentifier === 'string' && space.shortIdentifier.trim().length > 0) {
    return space.shortIdentifier.trim();
  }

  if (typeof space.icao === 'string' && space.icao.trim().length > 0) {
    return space.icao.trim();
  }

  if (typeof space.name === 'string' && space.name.trim().length > 0) {
    return space.name.trim();
  }

  return '';
};

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

  const { lat, lon } = state.receiver;
  const lines = [
    { label: 'Latitude', value: formatCoordinate(lat) },
    { label: 'Longitude', value: formatCoordinate(lon) },
  ];

  receiverInfoEl.innerHTML = lines
    .map(({ label, value }) => `<div class="info-line"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');

  updateOpenStreetMapOverlaySource();
  refreshOpenStreetMapOverlay();
}

function supportsGeolocation() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.geolocation &&
    typeof navigator.geolocation.getCurrentPosition === 'function'
  );
}

function setCenterOnLocationBusy(busy) {
  if (!centerOnLocationBtn) {
    return;
  }

  if (busy) {
    centerOnLocationBtn.setAttribute('disabled', 'true');
    centerOnLocationBtn.setAttribute('aria-busy', 'true');
  } else {
    centerOnLocationBtn.removeAttribute('disabled');
    centerOnLocationBtn.removeAttribute('aria-busy');
  }
}

function applyGeolocationPermissionState(state) {
  geolocationPermissionState = state;
  if (!centerOnLocationBtn || !supportsGeolocation()) {
    return;
  }

  switch (state) {
    case 'granted': {
      centerOnLocationBtn.setAttribute('title', 'Center radar on your current location.');
      break;
    }
    case 'denied': {
      centerOnLocationBtn.setAttribute(
        'title',
        'Location access is blocked. Click for steps to re-enable.',
      );
      break;
    }
    default: {
      centerOnLocationBtn.removeAttribute('title');
      break;
    }
  }
}

async function watchGeolocationPermissionState() {
  if (
    !centerOnLocationBtn ||
    !supportsGeolocation() ||
    !navigator.permissions ||
    typeof navigator.permissions.query !== 'function'
  ) {
    return;
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    applyGeolocationPermissionState(status.state);
    const handleChange = () => {
      applyGeolocationPermissionState(status.state);
      if (status.state === 'granted') {
        hideGeolocationPermissionHelp();
      }
    };

    if (typeof status.addEventListener === 'function') {
      status.addEventListener('change', handleChange);
    } else {
      status.onchange = handleChange;
    }
  } catch (error) {
    console.warn('Unable to query geolocation permission state', error);
  }
}

function showGeolocationPermissionHelp() {
  if (!geolocationPermissionModal || !geolocationPermissionModal.hasAttribute('hidden')) {
    return;
  }

  const activeElement = document.activeElement;
  lastFocusBeforeGeolocationHelp =
    activeElement && activeElement instanceof HTMLElement ? activeElement : null;

  geolocationPermissionModal.removeAttribute('hidden');
  geolocationPermissionModal.setAttribute('aria-hidden', 'false');

  if (geolocationPermissionCloseBtn && typeof geolocationPermissionCloseBtn.focus === 'function') {
    try {
      geolocationPermissionCloseBtn.focus({ preventScroll: true });
    } catch (error) {
      console.warn('Unable to focus geolocation permission close button', error);
    }
  }
}

function hideGeolocationPermissionHelp() {
  if (!geolocationPermissionModal || geolocationPermissionModal.hasAttribute('hidden')) {
    return;
  }

  geolocationPermissionModal.setAttribute('hidden', 'true');
  geolocationPermissionModal.setAttribute('aria-hidden', 'true');

  const focusTarget = lastFocusBeforeGeolocationHelp;
  if (
    focusTarget &&
    typeof focusTarget.focus === 'function' &&
    document.body &&
    document.body.contains(focusTarget)
  ) {
    try {
      focusTarget.focus({ preventScroll: true });
    } catch (error) {
      console.warn('Unable to restore focus after closing geolocation help', error);
    }
  }

  lastFocusBeforeGeolocationHelp = null;
}

async function centerRadarOnUserLocation() {
  if (pendingUserLocationRequest) {
    return;
  }

  if (!supportsGeolocation()) {
    showMessage('Geolocation is not supported by this browser.', { duration: DISPLAY_TIMEOUT_MS * 2 });
    return;
  }

  pendingUserLocationRequest = true;
  setCenterOnLocationBusy(true);
  showMessage('Locating your position…', { duration: DISPLAY_TIMEOUT_MS * 2 });

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: 0,
      });
    });

    const lat = Number(position?.coords?.latitude);
    const lon = Number(position?.coords?.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error('Received invalid coordinates from geolocation.');
    }

    state.receiver.lat = lat;
    state.receiver.lon = lon;
    state.receiver.hasOverride = true;
    writeCookie('receiverLat', String(lat));
    writeCookie('receiverLon', String(lon));
    updateReceiverInfo();
    updateRangeInfo();
    rebuildLandMassOutlines({ silent: true });
    showMessage('Radar centered on your location.', { duration: DISPLAY_TIMEOUT_MS * 2 });
  } catch (error) {
    let message = 'Unable to access your location. Check browser permissions and try again.';
    if (error && typeof error === 'object' && 'code' in error) {
      switch (error.code) {
        case 1:
          message = 'Location request denied. Update browser permissions to re-enable.';
          applyGeolocationPermissionState('denied');
          showGeolocationPermissionHelp();
          break;
        case 2:
          message = 'Location information is unavailable right now.';
          break;
        case 3:
          message = 'Location request timed out before a fix was received.';
          break;
        default:
          break;
      }
    }
    console.warn('Failed to center on user location', error);
    showMessage(message, { duration: DISPLAY_TIMEOUT_MS * 2 });
  } finally {
    pendingUserLocationRequest = false;
    setCenterOnLocationBusy(false);
  }
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
  state.previousAltitudeSamples.clear();
  state.activeBlips = [];
  state.paintedRotation.clear();
  state.lastPingedAircraft = null;
  state.selectedAircraftKey = null;
  state.displayOnlySelected = false;
}

function adjustRange(delta) {
  const nextIndex = Math.min(
    RANGE_STEPS.length - 1,
    Math.max(0, state.rangeStepIndex + delta)
  );
  if (nextIndex !== state.rangeStepIndex) {
    state.rangeStepIndex = nextIndex;
    clearRadarContacts();
    writeCookie(RANGE_INDEX_STORAGE_KEY, String(state.rangeStepIndex));
    updateRangeInfo();
    updateAircraftInfo();
  }
}

function adjustBaseAlertRange(delta) {
  const nextRange = Math.min(
    BASE_ALERT_RANGE_MAX_KM,
    Math.max(BASE_ALERT_RANGE_MIN_KM, state.baseAlertRangeKm + delta),
  );

  if (nextRange !== state.baseAlertRangeKm) {
    state.baseAlertRangeKm = nextRange;
    writeCookie(ALERT_RANGE_STORAGE_KEY, String(state.baseAlertRangeKm));
    updateRangeInfo();
  }
}

function updateAircraftInfo() {
  const info = state.lastPingedAircraft;
  if (!info) {
    aircraftInfoEl.innerHTML = '<p>Scanning…</p>';
    return;
  }

  const climbLabel = (() => {
    if (info.onGround) {
      return 'GROUND';
    }

    if (Number.isFinite(info.verticalRate)) {
      const roundedRate = Math.round(info.verticalRate);
      if (roundedRate === 0) {
        return 'Level';
      }
      const sign = roundedRate > 0 ? '+' : '';
      return `${sign}${roundedRate} fpm`;
    }

    return '---';
  })();

  const lines = [
    { label: 'Flight', value: info.flight || '-----' },
    { label: 'Hex', value: info.hex || '-----' },
    { label: 'Distance', value: `${info.distanceKm.toFixed(1)} km` },
    { label: 'Altitude', value: info.altitude > 0 ? `${info.altitude} ft` : '-----' },
    { label: 'Speed', value: info.groundSpeed > 0 ? `${info.groundSpeed.toFixed(0)} kt` : '---' },
    { label: 'Climb', value: climbLabel },
  ];

  const hasSquawk = typeof info.squawk === 'string' && info.squawk.trim().length > 0;
  const squawkDisplay = hasSquawk ? info.squawk : 'NODATA';
  // Keep the squawk row visible so the data panel layout remains stable even without a code.
  lines.push({ label: 'Squawk', value: squawkDisplay });

  if (Number.isFinite(info.signalDb)) {
    const formattedSignal = `${info.signalDb.toFixed(1)} dBFS`;
    lines.push({ label: 'Signal', value: formattedSignal });
  }

  if (Number.isFinite(info.lastMessageAgeSec)) {
    const seconds = info.lastMessageAgeSec;
    const seenLabel = seconds < 0.1 ? 'Live' : `${seconds.toFixed(1)} s`;
    lines.push({ label: 'Last seen', value: seenLabel });
  }

  aircraftInfoEl.innerHTML = lines
    .map(({ label, value }) => `<div class="info-line"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');
}

function updateStatus() {
  statusEl.textContent = state.dataConnectionOk ? 'Connected' : 'Waiting for data…';
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

function getCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function getRadarGeometry() {
  const { width, height } = canvas;
  const squareSize = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const labelPadding = squareSize * 0.05;
  const radarRadius = Math.max(10, squareSize / 2 - labelPadding);
  const maxCompassOffset = squareSize / 2 - squareSize * 0.02;
  const compassOffset = Math.min(radarRadius + squareSize * 0.03, maxCompassOffset);
  const rotationRad = (state.radarRotationQuarterTurns * Math.PI) / 2;
  const radarRangeKm = RANGE_STEPS[state.rangeStepIndex];
  return {
    centerX,
    centerY,
    radarRadius,
    compassOffset,
    rotationRad,
    radarRangeKm,
  };
}

function rotateVector(x, y, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function projectCraftToScreen(craft, geometry) {
  const distanceKm = Number.isFinite(craft.distanceKm)
    ? craft.distanceKm
    : geometry.radarRangeKm;
  const bearing = Number.isFinite(craft.bearing) ? craft.bearing : 0;
  const distanceRatio = Math.min(1, distanceKm / geometry.radarRangeKm);
  const angleRad = deg2rad(bearing);
  const relativeX = Math.sin(angleRad) * distanceRatio * geometry.radarRadius;
  const relativeY = -Math.cos(angleRad) * distanceRatio * geometry.radarRadius;
  const rotated = rotateVector(relativeX, relativeY, geometry.rotationRad);
  return {
    x: geometry.centerX + rotated.x,
    y: geometry.centerY + rotated.y,
  };
}

function findAircraftNearPoint(canvasX, canvasY, geometry) {
  let closest = null;
  let closestDistance = Infinity;

  for (const craft of state.trackedAircraft) {
    if (!shouldDisplayCraft(craft)) {
      continue;
    }
    const { x, y } = projectCraftToScreen(craft, geometry);
    const dx = canvasX - x;
    const dy = canvasY - y;
    const distance = Math.hypot(dx, dy);
    const markerWidth = getBlipMarkerWidth(craft, geometry.radarRadius);
    const markerHeight = getBlipMarkerHeight(craft, geometry.radarRadius);
    const hitRadius = Math.max(markerWidth, markerHeight) * 0.55;
    if (distance <= hitRadius && distance < closestDistance) {
      closest = craft;
      closestDistance = distance;
    }
  }

  return closest;
}

function isClickInsideRadar(canvasX, canvasY, geometry) {
  const dx = canvasX - geometry.centerX;
  const dy = canvasY - geometry.centerY;
  return Math.hypot(dx, dy) <= geometry.radarRadius;
}

function rotateRadarClockwise() {
  state.radarRotationQuarterTurns = (state.radarRotationQuarterTurns + 1) % 4;
  writeCookie(RADAR_ORIENTATION_STORAGE_KEY, state.radarRotationQuarterTurns);
  applyOpenStreetMapOverlayRotation();
}

function handleRadarTap(event) {
  const coords = getCanvasCoordinates(event);
  if (!coords) {
    return;
  }

  const geometry = getRadarGeometry();
  if (!isClickInsideRadar(coords.x, coords.y, geometry)) {
    return;
  }

  const selectedCraft = findAircraftNearPoint(coords.x, coords.y, geometry);
  if (selectedCraft) {
    if (state.selectedAircraftKey === selectedCraft.key) {
      state.displayOnlySelected = !state.displayOnlySelected;
      if (state.displayOnlySelected && state.selectedAircraftKey) {
        state.activeBlips = state.activeBlips.filter((blip) => shouldDisplayBlip(blip));
      }
    } else {
      state.selectedAircraftKey = selectedCraft.key;
      state.displayOnlySelected = false;
    }
    state.lastPingedAircraft = selectedCraft;
    updateAircraftInfo();
    updateRangeInfo();
    return;
  }

  state.selectedAircraftKey = null;
  state.lastPingedAircraft = null;
  state.displayOnlySelected = false;
  updateAircraftInfo();
  updateRangeInfo();
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
      rebuildLandMassOutlines({ silent: true });
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
        showMessage(`Unable to reach server: ${error.message}`, { duration: DISPLAY_TIMEOUT_MS * 4 });
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
      showMessage('Failed to fetch aircraft data. Check receiver connection.', { duration: DISPLAY_TIMEOUT_MS * 2 });
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
    pruneAlertHighlights([]);
    return;
  }
  const radarRangeKm = RANGE_STEPS[state.rangeStepIndex];
  const previousPositions = state.previousPositions;
  const previousAltitudeSamples = state.previousAltitudeSamples;
  const nextPositions = new Map();
  const nextAltitudeSamples = new Map();
  const sampleTimestamp = Date.now();
  const aircraft = [];
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
    const hasValidAltitude = altitude >= 0;
    const previousAltitudeSample = hex ? previousAltitudeSamples.get(hex) : null;
    const previousAltitudeAgeMs = previousAltitudeSample?.timestamp != null
      ? sampleTimestamp - previousAltitudeSample.timestamp
      : null;
    const previousAltitude = Number.isInteger(previousAltitudeSample?.altitude)
      && previousAltitudeAgeMs !== null
      && previousAltitudeAgeMs <= ALTITUDE_CORROBORATION_WINDOW_MS
        ? previousAltitudeSample.altitude
        : null;
    const altitudeDelta = hasValidAltitude && previousAltitude !== null
      ? altitude - previousAltitude
      : null;
    // Require a recent drop in reported altitude so we only alert on corroborated descents.
    const altitudeDescentConfirmed = altitudeDelta !== null
      && altitudeDelta <= -ALTITUDE_CORROBORATION_MIN_DELTA_FT;

    const groundSpeed = typeof entry.gs === 'number' ? entry.gs : -1;
    const squawk = typeof entry.squawk === 'string' ? entry.squawk.trim() : '';
    const verticalRate = Number.isFinite(entry.baro_rate)
      ? entry.baro_rate
      : Number.isFinite(entry.geom_rate)
        ? entry.geom_rate
        : null;
    const signalDb = typeof entry.rssi === 'number' ? entry.rssi : null;
    const lastMessageAgeSec = typeof entry.seen === 'number' ? entry.seen : null;
    const onGround = entry.on_ground === true;

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
      onGround,
      previousAltitude,
      altitudeDelta,
      altitudeDescentConfirmed,
    };

    craft.key = getCraftKey(craft);
    craft.iconScale = resolveAircraftIconScale(entry);
    craft.iconKey = resolveAircraftIconKey(entry);

    aircraft.push(craft);
    if (hex) {
      nextPositions.set(hex, { lat, lon });
      if (hasValidAltitude) {
        nextAltitudeSamples.set(hex, { altitude, timestamp: sampleTimestamp });
      } else if (
        previousAltitudeSample
        && Number.isInteger(previousAltitudeSample.altitude)
        && previousAltitudeAgeMs !== null
        && previousAltitudeAgeMs <= ALTITUDE_CORROBORATION_WINDOW_MS
      ) {
        nextAltitudeSamples.set(hex, previousAltitudeSample);
      }
    }
  }

  state.trackedAircraft = aircraft;
  state.previousPositions = nextPositions;
  state.previousAltitudeSamples = nextAltitudeSamples;

  pruneAlertHighlights(
    aircraft.map((craft) => craft.key),
  );

  if (state.paintedRotation.size > 0) {
    const activeKeys = new Set(aircraft.map((craft) => craft.key));
    for (const key of state.paintedRotation.keys()) {
      if (!activeKeys.has(key)) {
        state.paintedRotation.delete(key);
      }
    }
  }

  if (state.selectedAircraftKey) {
    const selected = aircraft.find((craft) => craft.key === state.selectedAircraftKey);
    if (selected) {
      state.lastPingedAircraft = selected;
    } else {
      state.selectedAircraftKey = null;
      state.lastPingedAircraft = null;
      state.displayOnlySelected = false;
    }
  }

  evaluateAlertTriggers(aircraft);
}

function getBlipLabelAlpha(blip, alpha) {
  const iconState = getIconState(blip);
  if (iconState?.ready) {
    return alpha;
  }
  return alpha * 0.9;
}

function isCraftHighlighted(key, now = Date.now()) {
  if (!key || !state.alertHighlights?.size) {
    return false;
  }

  const expiresAt = state.alertHighlights.get(key);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }

  if (now >= expiresAt) {
    state.alertHighlights.delete(key);
    return false;
  }

  return true;
}

function drawBlipHighlight(blip, radarRadius, frameNow) {
  const markerWidth = getBlipMarkerWidth(blip, radarRadius);
  const markerHeight = getBlipMarkerHeight(blip, radarRadius);
  const baseRadius = Math.max(markerWidth, markerHeight) * 0.6;
  const pulsePeriodMs = 1200;
  const phase = ((frameNow % pulsePeriodMs) / pulsePeriodMs) * Math.PI * 2;
  const pulseScale = 1.2 + Math.sin(phase) * 0.15;
  const outerRadius = baseRadius * pulseScale;

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = 'rgba(255, 160, 40, 0.2)';
  ctx.beginPath();
  ctx.arc(blip.x, blip.y, outerRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 210, 90, 0.85)';
  ctx.lineWidth = Math.max(2, radarRadius * 0.0035);
  ctx.beginPath();
  ctx.arc(blip.x, blip.y, outerRadius * 1.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
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
    ctx.rotate(headingRad);
    ctx.globalAlpha = getBlipLabelAlpha(blip, alpha);
    ctx.drawImage(iconSource, -width / 2, -height / 2, width, height);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = getBlipLabelAlpha(blip, alpha);
  ctx.fillStyle = 'rgba(53,255,153,1)';
  ctx.beginPath();
  const scale = getBlipIconScale(blip);
  ctx.arc(blip.x, blip.y, radarRadius * 0.02 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawControlledAirspaces(airspaces, centerX, centerY, radarRadius, radarRangeKm, drawUprightTextAt) {
  if (!airspaces || airspaces.length === 0) {
    return [];
  }

  ctx.save();
  ctx.lineWidth = Math.max(1, radarRadius * 0.002);
  const fontSize = Math.max(12, Math.round(radarRadius * 0.045));
  const labelOffset = fontSize * 0.35;
  const labelMargin = fontSize * 0.4;
  const reservedPlacements = [];

  const drawLabel = (text, anchorX, anchorY, baseline) => {
    if (!text) {
      return;
    }

    const dimensions = measureLabelDimensions(text, fontSize);
    if (!dimensions) {
      return;
    }

    const boxX = anchorX - dimensions.width / 2;
    let boxY;
    switch (baseline) {
      case 'bottom':
        boxY = anchorY - dimensions.height;
        break;
      case 'top':
        boxY = anchorY;
        break;
      default:
        boxY = anchorY - dimensions.height / 2;
        break;
    }

    const bounds = { x: boxX, y: boxY, width: dimensions.width, height: dimensions.height };
    reservedPlacements.push({ bounds, expandedBounds: expandBounds(bounds, labelMargin) });

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

    const nameLabel = getAirspaceIdentifier(space);
    drawLabel(nameLabel, x, y - displayRadius - labelOffset, 'bottom');

  }

  ctx.restore();
  return reservedPlacements;
}

function drawAudioSignalIndicator(centerX, centerY, radarRadius) {
  const unavailable = desiredAudioMuted || audioStreamError || audioAutoplayBlocked;
  const signalState = audioSignalState;
  const showActive = !unavailable && signalState === 'active';
  const showSilent = !unavailable && signalState === 'silent';

  if (!showActive && !showSilent) {
    return;
  }

  const coreRadius = radarRadius * AUDIO_PULSE_BASE_RADIUS_RATIO;
  const lineWidth = Math.max(1.1, radarRadius * 0.0032);

  ctx.save();
  ctx.translate(centerX, centerY);

  if (showSilent) {
    ctx.setLineDash([radarRadius * 0.012, radarRadius * 0.02]);
    ctx.strokeStyle = 'rgba(255, 191, 71, 0.55)';
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius * 1.35, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (showActive) {
    const phase = (performance.now() % AUDIO_PULSE_PERIOD_MS) / AUDIO_PULSE_PERIOD_MS;
    const spread = radarRadius * AUDIO_PULSE_SPREAD_RATIO;

    for (let i = 0; i < AUDIO_PULSE_RING_COUNT; i += 1) {
      const offset = i / AUDIO_PULSE_RING_COUNT;
      const progress = (phase + offset) % 1;
      const radius = coreRadius + spread * progress;
      const alpha = Math.max(0, 0.45 - progress * 0.45);

      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(82, 255, 194, ${alpha.toFixed(3)})`;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    const glowRadius = coreRadius * 1.8;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
    glow.addColorStop(0, 'rgba(82, 255, 194, 0.35)');
    glow.addColorStop(1, 'rgba(82, 255, 194, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();
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

  drawLandMasses(centerX, centerY, radarRadius, radarRangeKm);

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

  drawAudioSignalIndicator(centerX, centerY, radarRadius);

  const reservedLabelPlacements =
    drawControlledAirspaces(state.airspacesInRange, centerX, centerY, radarRadius, radarRangeKm, drawUprightAt) || [];

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
  const highlightCheckTime = Date.now();

  for (const craft of state.trackedAircraft) {
    if (!shouldDisplayCraft(craft)) {
     continue;
    }
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
        newBlips.push({
          key,
          x,
          y,
          spawn: now,
          heading: craft.heading,
          iconScale: craft.iconScale,
          iconKey: craft.iconKey,
          distanceKm: Number.isFinite(craft.distanceKm) ? craft.distanceKm : null,
          altitude: Number.isFinite(craft.altitude) && craft.altitude > 0 ? craft.altitude : null,
          hex: craft.hex || craft.flight,
          flight: craft.flight || null,
        });
        state.paintedRotation.set(key, state.currentSweepId);
        const shouldFocusOnCraft = !state.selectedAircraftKey || state.selectedAircraftKey === key;
        if (shouldFocusOnCraft) {
          state.lastPingedAircraft = craft;
          playBeep(getBeepFrequencyForAltitude(craft.altitude), 50);
        }
      }
    }
  }

  if (newBlips.length > 0) {
    state.activeBlips.push(...newBlips);
  }

  const rotationPeriod = state.rotationPeriodMs || (360 / sweepSpeed) * 1000;
  state.activeBlips = state.activeBlips.filter((blip) => now - blip.spawn < rotationPeriod && shouldDisplayBlip(blip));

  const showAircraftDetails = state.showAircraftDetails;
  const labelPlacements = [...reservedLabelPlacements];
  const iconCollisionBounds = [];
  const blipMarkerDimensions = new Map();
  const latestBlipByAircraft = showAircraftDetails ? new Map() : null;

  if (showAircraftDetails) {
    state.activeBlips.forEach((blip) => {
      const markerWidth = getBlipMarkerWidth(blip, radarRadius);
      const markerHeight = getBlipMarkerHeight(blip, radarRadius);
      blipMarkerDimensions.set(blip, { markerWidth, markerHeight });
      const baseBounds = getBlipIconBounds(blip, markerWidth, markerHeight);
      const padding = Math.max(markerWidth, markerHeight) * 0.12;
      iconCollisionBounds.push({
        blip,
        bounds: expandBounds(baseBounds, padding),
      });

      if (latestBlipByAircraft) {
        const labelKey = blip.key || blip.hex || blip.flight || null;
        if (!labelKey) {
          return;
        }

        const currentLatest = latestBlipByAircraft.get(labelKey);
        if (!currentLatest || blip.spawn > currentLatest.spawn) {
          latestBlipByAircraft.set(labelKey, blip);
        }
      }
    });
  }

  if (!showAircraftDetails) {
    state.calloutPlacements.clear();
  } else if (latestBlipByAircraft) {
    const activeLabelKeys = new Set(latestBlipByAircraft.keys());
    for (const key of [...state.calloutPlacements.keys()]) {
      if (!activeLabelKeys.has(key)) {
        state.calloutPlacements.delete(key);
      }
    }
  }

  // draw blips
  for (const blip of state.activeBlips) {
    const age = (now - blip.spawn) / rotationPeriod;
    const alpha = Math.max(0, 1 - age);
    const headingRad = deg2rad(blip.heading);
    const labelAlpha = getBlipLabelAlpha(blip, alpha);
    const highlighted = isCraftHighlighted(blip.key, highlightCheckTime);

    if (highlighted) {
      drawBlipHighlight(blip, radarRadius, now);
    }

    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = 'rgba(53,255,153,0.7)';
    ctx.lineWidth = radarRadius * 0.0025;
    ctx.beginPath();
    ctx.moveTo(blip.x, blip.y);
    ctx.lineTo(blip.x + Math.sin(headingRad) * radarRadius * 0.05, blip.y - Math.cos(headingRad) * radarRadius * 0.05);
    ctx.stroke();
    ctx.restore();

    drawBlipMarker(blip, radarRadius, alpha);

    if (showAircraftDetails) {
      const fontSize = Math.max(10, Math.round(radarRadius * 0.045));
      const dimensions = blipMarkerDimensions.get(blip);
      const markerWidth = dimensions?.markerWidth ?? getBlipMarkerWidth(blip, radarRadius);
      const markerHeight = dimensions?.markerHeight ?? getBlipMarkerHeight(blip, radarRadius);
      const identifierRaw = blip.flight || blip.hex || 'Unknown';
      const identifier = (identifierRaw || 'Unknown').trim().slice(0, 8) || 'Unknown';

      if (identifier) {
        const labelKey = blip.key || blip.hex || blip.flight || null;
        if (labelKey && latestBlipByAircraft && latestBlipByAircraft.get(labelKey) !== blip) {
          continue;
        }

        let placement = null;
        if (labelKey) {
          const persisted = state.calloutPlacements.get(labelKey);
          if (persisted) {
            placement = restorePersistedCalloutPlacement({
              persisted,
              blip,
              fontSize,
              markerWidth,
              markerHeight,
              existingPlacements: labelPlacements,
              iconBounds: iconCollisionBounds,
              viewportWidth: canvas.width,
              viewportHeight: canvas.height,
            });

            if (!placement) {
              state.calloutPlacements.delete(labelKey);
            }
          }
        }

        if (!placement) {
          placement = computeCalloutPlacement({
            text: identifier,
            blip,
            fontSize,
            markerWidth,
            markerHeight,
            existingPlacements: labelPlacements,
            iconBounds: iconCollisionBounds,
            viewportWidth: canvas.width,
            viewportHeight: canvas.height,
          });

          if (placement && labelKey) {
            const persisted = createPersistedCalloutPlacement(placement, blip, fontSize);
            if (persisted) {
              state.calloutPlacements.set(labelKey, persisted);
            }
          }
        }

        if (placement) {
          // Draw a short curved leader that links the callout back to the aircraft blip.
          ctx.save();
          ctx.globalAlpha = labelAlpha;
          ctx.strokeStyle = 'rgba(82, 255, 194, 0.8)';
          ctx.lineWidth = Math.max(1.1, fontSize * 0.075);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(placement.pointerStart.x, placement.pointerStart.y);
          ctx.quadraticCurveTo(
            placement.pointerControl.x,
            placement.pointerControl.y,
            placement.pointerEnd.x,
            placement.pointerEnd.y,
          );
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.translate(placement.anchorX, placement.anchorY);
          ctx.rotate(-rotationRad);
          ctx.globalAlpha = labelAlpha;
          ctx.font = `${fontSize}px "Share Tech Mono", monospace`;
          ctx.textAlign = placement.textAlign;
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255,255,255,0.88)';
          ctx.fillText(identifier, 0, 0);
          ctx.restore();

          labelPlacements.push(placement);
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
enqueueTickerMessage('Welcome To Radar1090', { key: 'welcome' });
loadLandMassOutlines().catch((error) => {
  console.warn('Unable to load coastline data', error);
});
fetchReceiverLocation().catch(() => {});
pollData();
requestAnimationFrame(loop);
