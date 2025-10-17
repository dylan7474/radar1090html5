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

export const LAND_MASS_OUTLINES = Object.freeze([
  Object.freeze({
    id: 'north-east-england',
    name: 'North East England Coast',
    points: Object.freeze([
      Object.freeze({ lat: 55.6, lon: -3.8 }),
      Object.freeze({ lat: 55.6, lon: -2.4 }),
      Object.freeze({ lat: 55.4, lon: -1.6 }),
      Object.freeze({ lat: 55.1, lon: -1.1 }),
      Object.freeze({ lat: 54.8, lon: -1.0 }),
      Object.freeze({ lat: 54.5, lon: -1.2 }),
      Object.freeze({ lat: 54.2, lon: -0.9 }),
      Object.freeze({ lat: 53.9, lon: -0.6 }),
      Object.freeze({ lat: 53.6, lon: -0.2 }),
      Object.freeze({ lat: 53.3, lon: 0.2 }),
      Object.freeze({ lat: 52.9, lon: 0.2 }),
      Object.freeze({ lat: 52.9, lon: -3.8 }),
    ]),
  }),
]);
