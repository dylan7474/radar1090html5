export const DEFAULT_RECEIVER_LOCATION = Object.freeze({
  lat: 54,
  lon: -1,
});

export const CONTROLLED_AIRSPACES = Object.freeze([
  Object.freeze({
    icao: 'EGNV',
    shortIdentifier: 'MME',
    name: 'Teesside International',
    lat: 54.5092,
    lon: -1.4294,
    radiusKm: 18,
  }),
  Object.freeze({
    icao: 'EGNT',
    shortIdentifier: 'NCL',
    name: 'Newcastle',
    lat: 55.0375,
    lon: -1.6917,
    radiusKm: 22,
  }),
  Object.freeze({
    icao: 'EGNM',
    shortIdentifier: 'LBA',
    name: 'Leeds Bradford',
    lat: 53.8659,
    lon: -1.6606,
    radiusKm: 20,
  }),
  Object.freeze({
    icao: 'EGCN',
    shortIdentifier: 'DSA',
    name: 'Doncaster Sheffield',
    lat: 53.4806,
    lon: -1.0107,
    radiusKm: 18,
  }),
  Object.freeze({
    icao: 'EGNJ',
    shortIdentifier: 'HUY',
    name: 'Humberside',
    lat: 53.5744,
    lon: -0.3508,
    radiusKm: 17,
  }),
]);

export const LAND_MASS_OUTLINES = Object.freeze([]);

export const LAND_MASS_SOURCES = Object.freeze([
  Object.freeze({
    id: 'natural-earth-land-110m',
    name: 'Natural Earth Land (110m)',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson',
    maxDistanceKm: 500,
    minVertexSpacingKm: 1.2,
  }),
]);
