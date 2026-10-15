// Text for the city prayer-times pages (src/pages/tools/CityPrayerTimesPage.jsx)
// and the city list on /tools/prayer-times. Italian and French only: each city
// page exists only in its own country's language (see src/data/prayerCities.js).
//
// Religious statements here (the method, the Asr rule, the high-latitude note
// and the advice to follow the local mosque) are for review by the academy's
// content reviewer before publication.

const fmtNumber = (lang, n, digits = 0) =>
  new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

const coords = (lang, city) => {
  const lat = `${fmtNumber(lang, Math.abs(city.lat), 2)}° ${city.lat >= 0 ? 'N' : 'S'}`;
  // West is O in both Italian (ovest) and French (ouest).
  return `${lat}, ${fmtNumber(lang, Math.abs(city.lng), 2)}° ${city.lng >= 0 ? 'E' : 'O'}`;
};

// 16-point compass names are not needed: every city here has a Qibla between
// 111 and 126 degrees.
const qiblaWay = (lang, deg) => {
  if (lang === 'fr') return deg >= 112.5 ? 'vers le sud-est' : "vers l'est-sud-est";
  return deg >= 112.5 ? 'verso sud-est' : 'verso est-sud-est';
};

export const PRAYER_CITY_TEXT = {
  it: {
    seo: {
      title: (city) => `Orari di preghiera a ${city.name}`,
      description: (city, year) =>
        `Orari di preghiera a ${city.name}: Fajr, Dhuhr, Asr, Maghrib e Isha di oggi, tabella del ${year}, direzione della Qibla e metodo di calcolo.`,
    },
    breadcrumbs: { tools: 'Strumenti', prayerTools: 'Strumenti per la preghiera', prayerTimes: 'Orari di preghiera' },
    h1: (city) => `Orari di preghiera a ${city.name}`,
    intro: (city, year) =>
      `Gli orari delle cinque preghiere a ${city.name} (${city.region}), calcolati per il centro città (${coords('it', city)}) con il metodo della Lega Musulmana Mondiale. Qui sotto trovi gli orari di oggi e una tabella per tutto il ${year}.`,
    today: {
      title: (city) => `Oggi a ${city.name}`,
      loading: 'Caricamento degli orari di oggi…',
      error: 'Non è stato possibile caricare gli orari di oggi. La tabella qui sotto resta valida.',
    },
    table: {
      title: (city, year) => `Orari indicativi a ${city.name} nel ${year}`,
      note: 'Il 1° e il 15 di ogni mese, in ora locale (ora legale inclusa). Negli altri giorni gli orari cambiano di pochi minuti.',
      caption: (city, year) => `Orari di preghiera a ${city.name}, ${year}`,
      afterMidnight: 'Un orario dopo la mezzanotte appartiene alla notte che inizia quel giorno.',
    },
    qibla: {
      title: (city) => `Direzione della Qibla da ${city.name}`,
      text: (city) =>
        `La Qibla da ${city.name} è a ${fmtNumber('it', city.qiblaDegrees, 1)}° rispetto al nord geografico, ${qiblaWay('it', city.qiblaDegrees)}. La Kaaba, alla Mecca, dista circa ${fmtNumber('it', city.kaabaKm)} km.`,
    },
    method: {
      title: 'Metodo di calcolo',
      angles:
        "Fajr e Isha seguono la Lega Musulmana Mondiale: Fajr quando il sole è 18° sotto l'orizzonte, Isha quando è 17° sotto l'orizzonte. L'Asr segue la scuola maggioritaria (shafi'ita, malikita e hanbalita): quando l'ombra di un oggetto è uguale alla sua altezza, più l'ombra di mezzogiorno.",
      highLatitude: (city) =>
        `A ${city.name}, nelle notti intorno al solstizio d'estate, il sole non scende mai 18° sotto l'orizzonte: in quelle notti Fajr e Isha vengono stimati con la regola dell'angolo, e le differenze tra i calendari locali sono maggiori.`,
      mosque: (city) =>
        `Le moschee di ${city.name} possono usare un altro metodo, con differenze di alcuni minuti. Per la preghiera in congregazione e per l'inizio del digiuno segui il calendario della tua moschea.`,
      hanafi: "Chi segue la scuola hanafita ha l'Asr più tardi: puoi sceglierla nello strumento completo.",
    },
    tool: {
      text: "Per la tua posizione esatta, un altro metodo di calcolo, l'Asr hanafita o il calendario del mese, usa lo strumento completo.",
      link: 'Apri lo strumento Orari di preghiera',
    },
    otherCities: 'Orari di preghiera in altre città',
    trial: {
      text: (minutes) =>
        `Vuoi imparare a leggere il Corano con il Tajweed? Prenota una lezione di prova gratuita di ${minutes} minuti con un insegnante di Al-Rahma Academy.`,
      link: 'Prenota la lezione di prova gratuita',
    },
    hubList: {
      title: 'Orari di preghiera per città',
      ariaLabel: 'Orari di preghiera per città',
    },
  },
  fr: {
    seo: {
      title: (city) => `Horaires de prière à ${city.name}`,
      description: (city, year) =>
        `Horaires de prière à ${city.name} : Fajr, Dhuhr, Asr, Maghrib et Isha du jour, tableau ${year}, direction de la Qibla et méthode de calcul.`,
    },
    breadcrumbs: { tools: 'Outils', prayerTools: 'Outils de prière', prayerTimes: 'Horaires de prière' },
    h1: (city) => `Horaires de prière à ${city.name}`,
    intro: (city, year) =>
      `Les horaires des cinq prières à ${city.name} (${city.region}), calculés pour le centre-ville (${coords('fr', city)}) selon la Ligue islamique mondiale. Vous trouverez ci-dessous les horaires du jour et un tableau pour toute l'année ${year}.`,
    today: {
      title: (city) => `Aujourd'hui à ${city.name}`,
      loading: 'Chargement des horaires du jour…',
      error: "Impossible de charger les horaires du jour. Le tableau ci-dessous reste valable.",
    },
    table: {
      title: (city, year) => `Horaires indicatifs à ${city.name} en ${year}`,
      note: "Le 1er et le 15 de chaque mois, en heure locale (heure d'été comprise). Les autres jours, les horaires ne varient que de quelques minutes.",
      caption: (city, year) => `Horaires de prière à ${city.name}, ${year}`,
      afterMidnight: 'Un horaire après minuit appartient à la nuit qui commence ce jour-là.',
    },
    qibla: {
      title: (city) => `Direction de la Qibla depuis ${city.name}`,
      text: (city) =>
        `Depuis ${city.name}, la Qibla est à ${fmtNumber('fr', city.qiblaDegrees, 1)}° par rapport au nord géographique, ${qiblaWay('fr', city.qiblaDegrees)}. La Kaaba, à La Mecque, est à environ ${fmtNumber('fr', city.kaabaKm)} km.`,
    },
    method: {
      title: 'Méthode de calcul',
      angles:
        "Fajr et Isha suivent la Ligue islamique mondiale : Fajr quand le soleil est à 18° sous l'horizon, Isha quand il est à 17° sous l'horizon. L'Asr suit l'avis majoritaire (écoles chaféite, malékite et hanbalite) : quand l'ombre d'un objet est égale à sa hauteur, plus l'ombre de midi.",
      highLatitude: (city) =>
        `À ${city.name}, pendant les nuits proches du solstice d'été, le soleil ne descend jamais à 18° sous l'horizon : ces nuits-là, Fajr et Isha sont estimés par la règle de l'angle, et les écarts entre calendriers locaux sont plus grands.`,
      mosque: (city) =>
        `Les mosquées de ${city.name} peuvent suivre une autre méthode (par exemple 12°, la méthode de l'UOIF), avec des écarts de plusieurs minutes. Pour la prière en assemblée et le début du jeûne, suivez le calendrier de votre mosquée.`,
      hanafi: "Selon l'école hanafite, l'Asr est plus tard : vous pouvez la choisir dans l'outil complet.",
    },
    tool: {
      text: "Pour votre position exacte, une autre méthode de calcul, l'Asr hanafite ou le calendrier du mois, utilisez l'outil complet.",
      link: "Ouvrir l'outil Horaires de prière",
    },
    otherCities: 'Horaires de prière dans d’autres villes',
    trial: {
      text: (minutes) =>
        `Vous voulez apprendre à lire le Coran avec le Tajwid ? Réservez un cours d'essai gratuit de ${minutes} minutes avec un enseignant d'Al-Rahma Academy.`,
      link: "Réserver le cours d'essai gratuit",
    },
    hubList: {
      title: 'Horaires de prière par ville',
      ariaLabel: 'Horaires de prière par ville',
    },
  },
};

// The sun never reaches 18 degrees below the horizon at local midnight near the
// June solstice when latitude > 90 - 23.44 - 18 (about 48.56 degrees).
export const HIGH_LATITUDE_LIMIT = 90 - 23.44 - 18;

export const needsHighLatitudeNote = (city) => Math.abs(city.lat) > HIGH_LATITUDE_LIMIT;
