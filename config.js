export const DEFAULT_RECEIVER_LOCATION = Object.freeze({
  lat: 54,
  lon: -1,
});

export const CONTROLLED_AIRSPACES = Object.freeze([
  Object.freeze({
    icao: 'EGNV',
    name: 'Teesside International',
    lat: 54.5092,
    lon: -1.4294,
    radiusKm: 18,
  }),
  Object.freeze({
    icao: 'EGNT',
    name: 'Newcastle',
    lat: 55.0375,
    lon: -1.6917,
    radiusKm: 22,
  }),
  Object.freeze({
    icao: 'EGNM',
    name: 'Leeds Bradford',
    lat: 53.8659,
    lon: -1.6606,
    radiusKm: 20,
  }),
  Object.freeze({
    icao: 'EGCN',
    name: 'Doncaster Sheffield',
    lat: 53.4806,
    lon: -1.0107,
    radiusKm: 18,
  }),
  Object.freeze({
    icao: 'EGNJ',
    name: 'Humberside',
    lat: 53.5744,
    lon: -0.3508,
    radiusKm: 17,
  }),
]);
