// City prayer-times pages (Italian and French only): one page per city, published
// only in the language of its country (/it/tools/prayer-times/roma,
// /fr/tools/prayer-times/paris). See src/pages/tools/CityPrayerTimesPage.jsx.
//
// Coordinates are the city centre. qiblaDegrees is the Qibla bearing from true
// north (AlAdhan GET /v1/qibla, cross-checked with adhan-js 4.4.3 within 0.2 deg);
// kaabaKm is the great-circle distance to the Kaaba, rounded to 10 km.
// Plain module with no imports: scripts/prerender-routes.mjs reads it under Node.
export const PRAYER_CITIES = [
  { slug: "roma", locale: "it", name: "Roma", region: "Lazio", lat: 41.9028, lng: 12.4964, timeZone: "Europe/Rome", qiblaDegrees: 123.3, kaabaKm: 3420 },
  { slug: "milano", locale: "it", name: "Milano", region: "Lombardia", lat: 45.4642, lng: 9.19, timeZone: "Europe/Rome", qiblaDegrees: 123.6, kaabaKm: 3860 },
  { slug: "torino", locale: "it", name: "Torino", region: "Piemonte", lat: 45.0703, lng: 7.6869, timeZone: "Europe/Rome", qiblaDegrees: 121.2, kaabaKm: 3930 },
  { slug: "bologna", locale: "it", name: "Bologna", region: "Emilia-Romagna", lat: 44.4949, lng: 11.3426, timeZone: "Europe/Rome", qiblaDegrees: 125.2, kaabaKm: 3660 },
  { slug: "firenze", locale: "it", name: "Firenze", region: "Toscana", lat: 43.7696, lng: 11.2558, timeZone: "Europe/Rome", qiblaDegrees: 124.1, kaabaKm: 3620 },
  { slug: "napoli", locale: "it", name: "Napoli", region: "Campania", lat: 40.8518, lng: 14.2681, timeZone: "Europe/Rome", qiblaDegrees: 124.2, kaabaKm: 3230 },
  { slug: "bergamo", locale: "it", name: "Bergamo", region: "Lombardia", lat: 45.6983, lng: 9.6773, timeZone: "Europe/Rome", qiblaDegrees: 124.5, kaabaKm: 3840 },
  { slug: "brescia", locale: "it", name: "Brescia", region: "Lombardia", lat: 45.5416, lng: 10.2118, timeZone: "Europe/Rome", qiblaDegrees: 125, kaabaKm: 3800 },
  { slug: "verona", locale: "it", name: "Verona", region: "Veneto", lat: 45.4384, lng: 10.9916, timeZone: "Europe/Rome", qiblaDegrees: 125.9, kaabaKm: 3740 },
  { slug: "genova", locale: "it", name: "Genova", region: "Liguria", lat: 44.4056, lng: 8.9463, timeZone: "Europe/Rome", qiblaDegrees: 122, kaabaKm: 3810 },
  { slug: "paris", locale: "fr", name: "Paris", region: "Île-de-France", lat: 48.8566, lng: 2.3522, timeZone: "Europe/Paris", qiblaDegrees: 119.2, kaabaKm: 4500 },
  { slug: "marseille", locale: "fr", name: "Marseille", region: "Provence-Alpes-Côte d'Azur", lat: 43.2965, lng: 5.3698, timeZone: "Europe/Paris", qiblaDegrees: 116.3, kaabaKm: 4000 },
  { slug: "lyon", locale: "fr", name: "Lyon", region: "Auvergne-Rhône-Alpes", lat: 45.764, lng: 4.8357, timeZone: "Europe/Paris", qiblaDegrees: 118.6, kaabaKm: 4170 },
  { slug: "toulouse", locale: "fr", name: "Toulouse", region: "Occitanie", lat: 43.6047, lng: 1.4442, timeZone: "Europe/Paris", qiblaDegrees: 112.4, kaabaKm: 4300 },
  { slug: "lille", locale: "fr", name: "Lille", region: "Hauts-de-France", lat: 50.6292, lng: 3.0573, timeZone: "Europe/Paris", qiblaDegrees: 121.7, kaabaKm: 4550 },
  { slug: "strasbourg", locale: "fr", name: "Strasbourg", region: "Grand Est", lat: 48.5734, lng: 7.7521, timeZone: "Europe/Paris", qiblaDegrees: 125.3, kaabaKm: 4140 },
  { slug: "nice", locale: "fr", name: "Nice", region: "Provence-Alpes-Côte d'Azur", lat: 43.7102, lng: 7.262, timeZone: "Europe/Paris", qiblaDegrees: 119, kaabaKm: 3890 },
  { slug: "montpellier", locale: "fr", name: "Montpellier", region: "Occitanie", lat: 43.6108, lng: 3.8767, timeZone: "Europe/Paris", qiblaDegrees: 115, kaabaKm: 4130 },
  { slug: "bordeaux", locale: "fr", name: "Bordeaux", region: "Nouvelle-Aquitaine", lat: 44.8378, lng: -0.5792, timeZone: "Europe/Paris", qiblaDegrees: 111.8, kaabaKm: 4510 },
  { slug: "nantes", locale: "fr", name: "Nantes", region: "Pays de la Loire", lat: 47.2184, lng: -1.5536, timeZone: "Europe/Paris", qiblaDegrees: 113.3, kaabaKm: 4680 },
];

export const prayerCityRoute = (slug) => `/tools/prayer-times/${slug}`;

export const prayerCitiesFor = (lang) => PRAYER_CITIES.filter((city) => city.locale === lang);

export const findPrayerCity = (slug) => PRAYER_CITIES.find((city) => city.slug === slug) || null;
