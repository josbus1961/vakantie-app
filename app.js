/* Vakantie-app – bezienswaardigheden & camperplaatsen rond een locatie.
 *
 * Bronnen (gratis, geen API-sleutel nodig):
 *  - Kaart       : OpenStreetMap via Leaflet
 *  - Adreszoek   : Nominatim (OSM-geocoder)
 *  - POI's       : Overpass API (OSM-data) – attracties, historie, natuur
 *  - Campers     : Overpass – caravan/camperplaatsen (fee/charge/maxstay)
 *  - Weer        : Open-Meteo – 3-daagse verwachting
 *  - Route       : OSRM – routeafstand en -duur
 * Namen en labels worden in het Nederlands getoond (name:nl gaat vóór name).
 */

'use strict';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const MAX_RESULTATEN = 25; // toon de dichtstbijzijnde resultaten

const KAARTCENTRUM = [52.3702, 4.8952]; // Amsterdam als startpunt

const TYPE_LABELS = {
  tourism: {
    attraction: 'Attractie',
    museum: 'Museum',
    viewpoint: 'Uitzichtpunt',
    gallery: 'Galerie',
    zoo: 'Dierentuin',
    theme_park: 'Attractiepark',
    aquarium: 'Aquarium',
    artwork: 'Kunstwerk',
    information: 'Toeristeninformatie',
    alpine_hut: 'Berghut',
    wilderness_hut: 'Wildernishut',
    caravan_site: 'Camperplaats',
    camp_site: 'Camping',
  },
  historic: {
    monument: 'Monument',
    memorial: 'Gedenkteken',
    castle: 'Kasteel',
    ruins: 'Ruïne',
    fort: 'Vesting / fort',
    archaeological_site: 'Opgravingslocatie',
    battlefield: 'Historisch slagveld',
  },
  man_made: {
    lighthouse: 'Vuurtoren',
    windmill: 'Molen',
    watermill: 'Watermolen',
    tower: 'Toren (bezienswaardigheid)',
    pier: 'Pier / aanlegsteiger',
  },
  natural: {
    beach: 'Strand',
    peak: 'Bergtop',
    cave_entrance: 'Grot',
    spring: 'Natuurlijke bron',
    waterfall: 'Waterval',
    cliff: 'Klif',
    volcano: 'Vulkaan',
    geyser: 'Geiser',
    dune: 'Duin',
    rock: 'Rotsformatie',
  },
  leisure: {
    park: 'Park',
    garden: 'Tuin / tuinen',
    nature_reserve: 'Natuurgebied',
    water_park: 'Zwemparadijs',
    playground: 'Speeltuin',
  },
};

const CATEGORIE_LABELS = {
  attracties: 'Attracties',
  historie: 'Historie',
  natuur: 'Natuur',
  campers: 'Camperplaatsen',
};

const CATEGORIE_ICONEN = {
  attracties: '🎡',
  historie: '🏛️',
  natuur: '🌿',
  campers: '🚐',
};

const WMO_NEDERLANDS = {
  0: ['☀️', 'Onbewolkt'],
  1: ['🌤️', 'Vrijwel onbewolkt'],
  2: ['⛅', 'Half bewolkt'],
  3: ['☁️', 'Bewolkt'],
  45: ['🌫️', 'Mist'],
  48: ['🌫️', 'Mist met rijpvorming'],
  51: ['🌦️', 'Lichte motregen'],
  53: ['🌦️', 'Motregen'],
  55: ['🌧️', 'Dichte motregen'],
  56: ['🌧️❄️', 'Lichte vriesmotregen'],
  57: ['🌧️❄️', 'Vriesmotregen'],
  61: ['🌦️', 'Lichte regen'],
  63: ['🌧️', 'Regen'],
  65: ['🌧️', 'Zware regen'],
  66: ['🌧️❄️', 'Lichte vriesregen'],
  67: ['🌧️❄️', 'Vriesregen'],
  71: ['🌨️', 'Lichte sneeuwval'],
  73: ['🌨️', 'Sneeuwval'],
  75: ['❄️', 'Zware sneeuwval'],
  77: ['🌨️', 'Sneeuwkorrels'],
  80: ['🌦️', 'Lichte regenbuien'],
  81: ['🌧️', 'Regenbuien'],
  82: ['⛈️', 'Hevige regenbuien'],
  85: ['🌨️', 'Lichte sneeuwbuien'],
  86: ['🌨️', 'Zware sneeuwbuien'],
  95: ['⛈️', 'Onweer'],
  96: ['⛈️', 'Onweer met lichte hagel'],
  99: ['⛈️', 'Onweer met zware hagel'],
};

/* ------- staat ------- */

let kaart;
let startpunt = null; // { lat, lon, naam }
let pois = [];
let markersById = new Map();
let kiesModus = false;
let zoekGeneratie = 0;

/* ------- helperfuncties ------- */

function $id(id) {
  return document.getElementById(id);
}

function setBericht(tekst, lader = false) {
  $id('status').innerHTML = (lader ? '<span class="lader"></span>' : '') + tekst;
}

function hemelsbreedKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatKm(km) {
  return km < 1
    ? `${Math.round(km * 1000)} m`
    : `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}

async function haalJson(url, opties = {}, timeoutMs = 0) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = timeoutMs
    ? setTimeout(
        () => controller.abort(new Error(`geen antwoord binnen ${Math.round(timeoutMs / 1000)} s`)),
        timeoutMs,
      )
    : null;
  try {
    const antw = await fetch(url, controller ? { ...opties, signal: controller.signal } : opties);
    if (!antw.ok) throw new Error(`HTTP ${antw.status} bij ${new URL(url).host}`);
    return await antw.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* Nederlands label voor een OSM-type-tag. */
function typeLabel(tags) {
  for (const groep of Object.keys(TYPE_LABELS)) {
    if (tags[groep] && TYPE_LABELS[groep][tags[groep]]) return TYPE_LABELS[groep][tags[groep]];
  }
  if (tags.historic) return 'Historische plek';
  if (tags.natural) return 'Natuurlijke bezienswaardigheid';
  if (tags.leisure) return 'Recreatie';
  if (tags.man_made) return 'Bijzonder bouwwerk';
  if (tags.tourism) return 'Toeristisch';
  return 'Bezienswaardigheid';
}

function categorie(tags) {
  return tags.tourism === 'caravan_site' || tags.tourism === 'camp_site' ? 'campers' : 'attracties';
}

function poiIcoon(tags) {
  if (tags.tourism === 'museum') return '🏛️';
  return CATEGORIE_ICONEN[categorie(tags)];
}

function besteNaam(element, label) {
  const t = element.tags || {};
  return t['name:nl'] || t.name || t.brand || `${label} (naam onbekend)`;
}

/* Windrichting in het Nederlands. */
const RICHTINGEN = ['noorden', 'noordoosten', 'oosten', 'zuidoosten', 'zuiden', 'zuidwesten', 'westen', 'noordwesten'];

function windrichting(lat1, lon1, lat2, lon2) {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const graden = (Math.atan2(y, x) * 180) / Math.PI;
  return RICHTINGEN[Math.round((graden + 360) % 360 / 45) % 8];
}

/* ------- Wikipedia: echte beschrijving + detailwebpagina ------- */

const wikiCache = new Map(); // "lang:titel" -> { extract, url }

function wikiVanTags(tags) {
  const waarde = tags['wikipedia:nl'] || tags.wikipedia;
  if (!waarde || !/[a-zA-Z]/.test(waarde)) return null;
  const idx = waarde.indexOf(':');
  return /^[a-z-]+$/.test(waarde.slice(0, idx))
    ? { lang: waarde.slice(0, idx), titel: waarde.slice(idx + 1) }
    : { lang: 'nl', titel: waarde };
}

function wikiArtikelUrl(lang, titel) {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(titel.trim().replace(/ /g, '_'))}`;
}

function isZelfdeOnderwerp(query, resultTitel) {
  const woorden = (tekst) =>
    tekst
      .toLowerCase()
      .split(/[^a-z0-9\u00c0-\u017f']+/)
      .filter((w) => w.length > 3);
  const q = new Set(woorden(query));
  if (!q.size) return false;
  return woorden(resultTitel).some((w) => q.has(w));
}

/* Zoek de Nederlandstalige tegenhanger van een buitenlands artikel. */
async function nederlandseTegenhanger(lang, titel) {
  if (lang === 'nl') return { lang: 'nl', titel };
  const params = new URLSearchParams({
    action: 'query',
    titles: titel,
    prop: 'langlinks',
    lllang: 'nl',
    format: 'json',
    formatversion: '2',
    redirects: '1',
  });
  try {
    const data = await haalJson(`https://${lang}.wikipedia.org/w/api.php?${params}`, {}, 15000);
    const link = data.query?.pages?.[0]?.langlinks?.[0];
    if (link?.title) return { lang: 'nl', titel: link.title };
  } catch (fout) {
    console.error(fout);
  }
  return null;
}

async function wikiSamenvattingVoor(lang, titel) {
  const key = `${lang}:${titel.toLowerCase()}`;
  if (wikiCache.has(key)) return wikiCache.get(key);
  try {
    const params = new URLSearchParams({ redirect: 'true' });
    const data = await haalJson(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titel.replace(/ /g, '_'))}?${params}`,
      {},
      15000,
    );
    const extract = (data.extract || '').trim();
    const gevonden = data.title || titel;
    if (extract && data.type !== 'disambiguation' && isZelfdeOnderwerp(titel, gevonden)) {
      const info = {
        extract,
        url: data.content_urls?.desktop?.page || wikiArtikelUrl(lang, gevonden),
      };
      wikiCache.set(key, info);
      return info;
    }
    wikiCache.set(key, null);
    return null;
  } catch (fout) {
    wikiCache.set(key, null);
    return null;
  }
}

async function haalWikiSamenvatting(p) {
  const uitTags = wikiVanTags(p.tags);
  const pogingen = [];
  if (uitTags) {
    pogingen.push({ lang: 'nl', titel: uitTags.titel });
    if (uitTags.lang !== 'nl') pogingen.push(uitTags);
  }
  pogingen.push({ lang: 'nl', titel: p.naam });

  for (const poging of pogingen) {
    const info = await wikiSamenvattingVoor(poging.lang, poging.titel);
    if (!info) continue;
    if (poging.lang !== 'nl') {
      const tegenhanger = await nederlandseTegenhanger(poging.lang, poging.titel);
      const nlInfo = tegenhanger ? await wikiSamenvattingVoor('nl', tegenhanger.titel) : null;
      if (nlInfo) return nlInfo;
    }
    return info;
  }
  return null;
}

function gecachteSamenvatting(p) {
  const uitTags = wikiVanTags(p.tags);
  const pogingen = [];
  if (uitTags) {
    pogingen.push(`${uitTags.lang}:${uitTags.titel.toLowerCase()}`);
    if (uitTags.lang !== 'nl') pogingen.push(`nl:${uitTags.titel.toLowerCase()}`);
  }
  pogingen.push(`nl:${p.naam.toLowerCase()}`);
  for (const key of pogingen) {
    if (wikiCache.has(key) && wikiCache.get(key)) return wikiCache.get(key);
  }
  return null;
}

/* Vervoersmiddel voor de routeberekening: per auto of te voet. */
function routeModus() {
  return $id('route-voet').checked ? 'voet' : 'auto';
}

function kortSamenvatting(extract, maximaal = 260) {
  if (extract.length <= maximaal) return extract;
  const afgekapt = extract.slice(0, maximaal);
  return afgekapt.slice(0, afgekapt.lastIndexOf('.') + 1 || afgekapt.length) + ' …';
}

/* Duidelijke beschrijving van drie regels per resultaat. */
function beschrijving(p, extract) {
  const t = p.tags;

  const eigenTekst = t['description:nl'] || t.description;
  const regel1 = extract
    ? kortSamenvatting(extract)
    : eigenTekst
      ? kortSamenvatting(eigenTekst.trim())
      : null;
  const beschrijvingTekst = regel1 ? `${regel1}<br>` : '';

  const richting = startpunt ? windrichting(startpunt.lat, startpunt.lon, p.lat, p.lon) : null;
  let regel2 = richting
    ? `Ligt ${formatKm(p.afstandKm)} ten ${richting} van ${startpunt.naam}.`
    : `Ligt ${formatKm(p.afstandKm)} van het startpunt.`;

  const delen = [];
  const kostenKern = p.kosten?.gratis === true
    ? { tekst: isCamper(p) ? 'overnachten gratis' : 'toegang gratis', klas: 'gratis' }
    : p.kosten?.gratis === false
      ? { tekst: isCamper(p) ? 'overnachten betaald' : 'toegang betaald', klas: 'betaald' }
      : null;
  const kap = (txt) => txt.charAt(0).toUpperCase() + txt.slice(1);
  if (kostenKern)
    delen.push(`<span class="${kostenKern.klas}">${kap(kostenKern.tekst)}</span>`);
  if (t.opening_hours) delen.push(`geopend: ${t.opening_hours}`);
  if (p.isCamper && t.capacity) delen.push(`${t.capacity} plaatsen`);
  if (t.wikipedia || t.website || t['contact:website']) delen.push('meer info via de website');
  const samengevat = delen.length ? `${delen.join(' \u00b7 ')}.` : '';
  const heel = samengevat && !kostenKern
    ? kap(samengevat)
    : samengevat || 'Kosten en openingstijden niet bekend; raadpleeg ter plaatse een informatiebord.';
  return `${beschrijvingTekst}${regel2}<br>${heel}`;
}

function isCamper(p) {
  return p.categorie === 'campers';
}

/* Kosten-informatie in Nederlands. */
function kostenTekst(tags, isCamper) {
  const onderwerp = isCamper ? 'Overnachten' : 'Toegang';
  if (tags.fee === 'no') return { tekst: `${onderwerp}: gratis`, gratis: true };
  if (tags.fee === 'yes') {
    let extra = '';
    if (tags.charge) extra = ` (${tags.charge})`;
    if (tags.maxstay) extra += ` · max. ${tags.maxstay}`;
    return { tekst: `${onderwerp}: betaald${extra}`, gratis: false };
  }
  if (isCamper) {
    if (tags.maxstay) return { tekst: `Kosten onbekend · max. ${tags.maxstay}`, gratis: null };
    return { tekst: 'Kosten onbekend', gratis: null };
  }
  return null;
}

/* ------- kaart ------- */

function initKaart() {
  kaart = L.map('kaart', { zoomControl: true }).setView(KAARTCENTRUM, 10);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap-bijdragers',
  }).addTo(kaart);

  kaart.on('click', (e) => {
    if (!kiesModus) return;
    kiesModus = false;
    $id('kaart').style.cursor = '';
    const knop = $id('btn-kies-punt');
    knop.textContent = '🗺️ Kies punt op kaart';
    stelStartpunt(e.latlng.lat, e.latlng.lng, 'Handmatig gekozen punt op de kaart');
  });
}

/* ------- startpunt ------- */

function stelStartpunt(lat, lon, naam) {
  startpunt = { lat, lon, naam: naam || `${lat.toFixed(4)}, ${lon.toFixed(4)}` };

  L.marker([lat, lon], {
    title: 'Gekozen locatie',
    icon: L.divIcon({
      className: '',
      html: '<div style="font-size:26px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))">📍</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 26],
    }),
  })
    .addTo(kaart)
    .bindPopup(`<b>Gekozen locatie</b><br>${startpunt.naam}`)
    .openPopup();

  kaart.setView([lat, lon], Math.max(kaart.getZoom(), 11), { animate: true });

  const info = $id('huidige-locatie');
  info.classList.remove('verbergen');
  info.textContent = `Gekozen locatie: ${startpunt.naam}`;

  $id('weer').classList.remove('verbergen');
  haalWeer(lat, lon);
  zoekInGebied();
}

function gebruikMijnLocatie() {
  const knop = $id('btn-locatie');
  if (!navigator.geolocation) {
    setBericht('Locatiebepaling wordt niet door deze browser ondersteund. Gebruik het zoekveld.');
    return;
  }
  knop.disabled = true;
  setBericht('Locatie bepalen…', true);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      knop.disabled = false;
      stelStartpunt(pos.coords.latitude, pos.coords.longitude, 'Mijn huidige locatie');
    },
    (fout) => {
      knop.disabled = false;
      const reden =
        fout.code === 1 ? 'toestemming geweigerd' : fout.code === 2 ? 'locatie niet beschikbaar' : 'time-out';
      setBericht(
        `Huidige locatie ophalen mislukt (${reden}). Gebruik het zoekveld of “Kies punt op kaart”.`,
      );
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

function wisselKiesModus() {
  kiesModus = !kiesModus;
  $id('kaart').style.cursor = kiesModus ? 'crosshair' : '';
  $id('btn-kies-punt').textContent = kiesModus ? '✖️ Annuleer keuze' : '🗺️ Kies punt op kaart';
  if (kiesModus) setBericht('Klik op de kaart om een startpunt te kiezen.');
}

/* ------- Nominatim zoeken ------- */

async function zoekLocatie(term) {
  const params = new URLSearchParams({
    q: term,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
    'accept-language': 'nl',
  });
  return haalJson(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'Accept-Language': 'nl' },
  });
}

async function zoekEnGa() {
  const term = $id('zoekveld').value.trim();
  const lijst = $id('zoekresultaten');
  if (!term) return;
  setBericht(`Zoeken naar “${term}”…`, true);
  lijst.classList.add('verbergen');

  let resultaten;
  try {
    resultaten = await zoekLocatie(term);
  } catch (fout) {
    console.error(fout);
    lijst.innerHTML = '<li class="muted">Zoekservice onbereikbaar, probeer het later opnieuw.</li>';
    lijst.classList.remove('verbergen');
    return;
  }

  lijst.innerHTML = '';
  if (!resultaten.length) {
    lijst.innerHTML = '<li class="muted">Niets gevonden voor deze zoekopdracht.</li>';
    lijst.classList.remove('verbergen');
    return;
  }

  resultaten.forEach((r) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.innerHTML = `<div>${r.name || (r.display_name || '').split(',')[0]}</div>
      <div class="muted">${(r.display_name || '').split(',').slice(1).join(',').trim()}</div>`;
    li.addEventListener('click', () => {
      lijst.classList.add('verbergen');
      const naam = r.name || (r.display_name || '').split(',')[0];
      stelStartpunt(parseFloat(r.lat), parseFloat(r.lon), naam);
    });
    lijst.appendChild(li);
  });
  lijst.classList.remove('verbergen');
}

/* ------- Overpass: attracties + camperplaatsen ------- */

function bouwOverpassQuery(radiusM, lat, lon, metCampers) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon}`;
  const attracties = [
    '["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|aquarium|artwork)$"]',
  ].map((s) => `nwr${s};`);
  const camper = metCampers
    ? ['nwr["tourism"="caravan_site"];', 'nwr["tourism"="camp_site"];', 'nwr["amenity"="parking"]["motorhome"~"^(yes|designated)$"];'].join('')
    : '';
  return `[out:json][timeout:60][bbox:${bbox}];( ${attracties.join(' ')} ${camper} );out center;`;
}

let overpassController = null;

/* Vraag alle mirrors tegelijk op; het eerste geldige antwoord wint.
 * Overpass zet verzoeken in de wachtrij bij drukte, dus 45 s geduld +
 * automatische tweede golf als alle mirrors kuren overlopen. */
function mirrorPoging(url, query, signal) {
  const params = new URLSearchParams({ data: query });
  return haalJson(url, { method: 'POST', body: params, signal }, 45000);
}

async function overpassVerzoek(query) {
  if (overpassController) overpassController.abort();
  overpassController = new AbortController();
  const huidige = overpassController;

  let laatstefouten = null;
  for (let golf = 0; golf < 2; golf++) {
    try {
      return await Promise.any(
        OVERPASS_MIRRORS.map((url) => mirrorPoging(url, query, huidige.signal)),
      );
    } catch (fouten) {
      if (huidige !== overpassController) throw new Error('zoekopdracht vervangen door nieuwe');
      laatstefouten = fouten;
      if (golf === 0) await new Promise((r) => window.setTimeout(r, 4000));
    }
  }
  const oorzaken = ((laatstefouten && laatstefouten.errors) || [laatstefouten])
    .map((f) => f.message || String(f))
    .slice(0, 3)
    .join(' | ');
  const fout = new Error(oorzaken || 'onbekende fout');
  fout.oorzaken = oorzaken;
  throw fout;
}

function overpassTurboLink(query) {
  return `https://overpass-turbo.eu/?Q=${encodeURIComponent(query)}&R`;
}

async function zoekInGebied() {
  if (!startpunt) return;
  const radiusKm = parseInt($id('straal').value, 10);
  const metCampers = $id('toon-campers').checked;
  const knop = $id('btn-opnieuw');
  knop.disabled = true;
  zoekGeneratie++;
  pois = [];
  $id('resultaten').innerHTML = '';
  $id('aantal').textContent = String(0);
  tekenMarkers();
  setBericht(`Toeristische attracties & camperplaatsen binnen ${radiusKm} km laden…`, true);

  const query = bouwOverpassQuery(radiusKm * 1000, startpunt.lat, startpunt.lon, metCampers);
  const laadstart = Date.now();
  const klok = window.setInterval(() => {
    const sec = Math.round((Date.now() - laadstart) / 1000);
    setBericht(
      `Toeristische attracties & camperplaatsen binnen ${radiusKm} km laden… (${sec} s)`,
      true,
    );
  }, 1000);

  let data;
  try {
    data = await overpassVerzoek(query);
  } catch (fout) {
    window.clearInterval(klok);
    if (fout.message === 'zoekopdracht vervangen door nieuwe' || fout.name === 'AbortError') return;
    console.error(fout);
    setBericht(
      `Kon Overpass niet bereiken: ${fout.oorzaken || fout.message}. ` +
        `<a href="${overpassTurboLink(query)}" target="_blank" rel="noopener">Test de query in Overpass Turbo</a>.`,
    );
    knop.disabled = false;
    return;
  }
  window.clearInterval(klok);
  knop.disabled = false;

  pois = dedupliceer(data.elements || [])
    .map((el) => {
      const tags = el.tags || {};
      const lat = el.lat ?? (el.center ? el.center.lat : undefined);
      const lon = el.lon ?? (el.center ? el.center.lon : undefined);
      const label = typeLabel(tags);
      const camper = categorie(tags) === 'campers';
      return {
        id: `${el.type}/${el.id}`,
        lat,
        lon,
        nauwkeurig: lat !== undefined,
        naam: besteNaam(el, label),
        label,
        categorie: categorie(tags),
        icoon: poiIcoon(tags),
        tags,
        isCamper: camper,
        kosten: kostenTekst(tags, camper),
        afstandKm: lat !== undefined ? hemelsbreedKm(startpunt.lat, startpunt.lon, lat, lon) : Infinity,
      };
    })
    .filter((p) => p.nauwkeurig && p.afstandKm <= radiusKm)
    .sort((a, b) => a.afstandKm - b.afstandKm)
    .slice(0, MAX_RESULTATEN);

  tekenResultaten();
  tekenMarkers();

  let tekst = pois.length
    ? `De ${pois.length} dichtstbijzijnde resultaten binnen ${radiusKm} km (gesorteerd op afstand).`
    : 'Geen resultaten binnen deze straal. Probeer een grotere straal of een andere locatie.';
  if (!pois.length) {
    tekst += ` <a href="${overpassTurboLink(query)}" target="_blank" rel="noopener">Bekijk de query in Overpass Turbo</a>.`;
  }
  if (data.elements.length > pois.length) {
    tekst += ' (gefilterd op toeristische trekpleisters)';
  }
  const gratisCampers = pois.filter((p) => p.isCamper && p.kosten && p.kosten.gratis === true).length;
  if (metCampers && gratisCampers) tekst += ` Waarvan ${gratisCampers} gratis camperplaats(en).`;
  setBericht(tekst);
}

function dedupliceer(elementen) {
  const gezien = new Set();
  return elementen.filter((el) => {
    const key = `${el.type}/${el.id}`;
    if (gezien.has(key)) return false;
    gezien.add(key);
    return true;
  });
}

/* ------- lijst ------- */

function zichtbarePois() {
  return pois.filter((p) => $id(`f-${p.categorie}`).checked);
}

function tekenResultaten() {
  const lijst = $id('resultaten');
  const zichtbaar = zichtbarePois();
  $id('aantal').textContent = String(zichtbaar.length);
  lijst.innerHTML = '';

  for (const p of zichtbaar) {
    const li = document.createElement('li');
    li.id = `item-${p.id.replace(/\//g, '_')}`;
    if (p.isCamper) li.classList.add('camping');
    if (p.isCamper && p.kosten && p.kosten.gratis === false) li.classList.add('betaald');

    const tags = p.tags;
    const website = tags.website || tags['contact:website']
      ? `<div class="info"><a href="${tags.website || tags['contact:website']}" target="_blank" rel="noopener">🌐 Website</a></div>`
      : '';

    li.innerHTML = `
      <div class="titel">${p.icoon} ${p.naam}</div>
      <div class="type">${p.label}</div>
      <div class="beschrijving" id="beschrijving-${p.id.replace(/\//g, '_')}">${beschrijving(p, gecachteSamenvatting(p)?.extract)}</div>
      ${website}
      <div class="actierij">
        <button type="button" class="btn-route">🛣️ Route afstand</button>
        <a href="https://www.google.com/maps/dir/?api=1&origin=${startpunt.lat},${startpunt.lon}&destination=${p.lat},${p.lon}&travelmode=${routeModus() === 'voet' ? 'walking' : 'driving'}"
           target="_blank" rel="noopener">🧭 Navigeren</a>
      </div>
      <div class="route-uit verbergen"></div>`;
    lijst.appendChild(li);

    li.querySelector('.titel').addEventListener('click', () => {
      const m = markersById.get(p.id);
      if (m) {
        kaart.flyTo([p.lat, p.lon], Math.max(kaart.getZoom(), 14), { animate: true });
        m.openPopup();
      }
      $id('kaarthouder').scrollIntoView({ behavior: 'smooth' });
    });
    li.querySelector('.btn-route').addEventListener('click', (e) => haalRoute(p, e.target));
  }
  if (paginaAutoBeschrijvingen !== null) {
    window.clearTimeout(paginaAutoBeschrijvingen);
  }
  const generatie = zoekGeneratie;
  paginaAutoBeschrijvingen = window.setTimeout(() => vulBeschrijvingenAan(generatie), 150);
}

let paginaAutoBeschrijvingen = null;

/* Vult per zichtbaar resultaat een echte beschrijving aan vanuit Wikipedia,
 * met meerdere parallelle opvragers zodat de lijst snel volloopt. */
async function vulBeschrijvingenAan(generatie) {
  if (generatie !== undefined && generatie !== zoekGeneratie) return;
  const wachtrij = zichtbarePois().filter((p) => p.nauwkeurig);
  let index = 0;

  async function werker() {
    while (generatie === zoekGeneratie && index < wachtrij.length) {
      const p = wachtrij[index++];
      const info = gecachteSamenvatting(p) || (await haalWikiSamenvatting(p));
      if (!info) continue;
      const el = document.getElementById(`beschrijving-${p.id.replace(/\//g, '_')}`);
      if (el) el.innerHTML = beschrijving(p, info.extract);
    }
  }

  await Promise.all([werker(), werker(), werker()]);
}

/* ------- route (OSRM) ------- */

async function haalRoute(poi, knop) {
  const uit = knop.closest('li').querySelector('.route-uit');
  knop.disabled = true;
  uit.classList.remove('verbergen');
  uit.innerHTML = '<span class="lader"></span> Route berekenen…';

  const voet = routeModus() === 'voet';
  const basis = voet
    ? 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/'
    : 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
  const url = `${basis}${startpunt.lon},${startpunt.lat};${poi.lon},${poi.lat}?overview=false`;
  try {
    const data = await haalJson(url, {}, 15000);
    if (!data.routes || !data.routes.length) throw new Error('geen route gevonden');
    const route = data.routes[0];
    const km = route.distance / 1000;
    const min = Math.round(route.duration / 60);
    uit.innerHTML = `🛣️ Over de weg: <b>${formatKm(km)}</b> · ca. ${min} min reistijd (${voet ? 'te voet' : 'per auto'}).`;
  } catch (fout) {
    console.error(fout);
    uit.innerHTML = 'Kon de route afstand niet opvragen. Gebruik de navigatielink hierboven.';
  }
  knop.disabled = false;
}

/* ------- markers ------- */

function tekenMarkers() {
  markersById.forEach((m) => kaart.removeLayer(m));
  markersById.clear();

  for (const p of zichtbarePois()) {
    if (!p.nauwkeurig) continue;
    const marker = L.marker([p.lat, p.lon], {
      title: p.naam,
      icon: L.divIcon({
        className: '',
        html: `<div style="font-size:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))">${p.icoon}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
      }),
    }).addTo(kaart);

    const kosten = p.kosten
      ? `<div><span class="${p.kosten.gratis === true ? 'gratis' : ''}">${p.kosten.tekst}</span></div>`
      : '';
    marker.bindPopup(
      `<b>${p.icoon} ${p.naam}</b><br>
       <span class="muted">${p.label}</span><br>
       ${kosten}
       <div>📍 ${formatKm(p.afstandKm)} hemelsbreed</div>`
    );
    markersById.set(p.id, marker);
  }
}

/* ------- weer (Open-Meteo) ------- */

async function haalWeer(lat, lon) {
  const inhoud = $id('weer-inhoud');
  inhoud.innerHTML = '<span class="lader"></span> Weer ophalen…';
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    timezone: 'auto',
    forecast_days: '3',
  });
  try {
    const data = await haalJson(`https://api.open-meteo.com/v1/forecast?${params}`, {}, 15000);
    const d = data.daily;
    const formatter = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' });
    inhoud.innerHTML = d.time
      .map((tijd, i) => {
        const [emoji, omschrijving] = WMO_NEDERLANDS[d.weather_code[i]] || ['🌡️', 'Onbekend'];
        const dagNaam = i === 0 ? 'Vandaag' : i === 1 ? 'Morgen' : formatter.format(new Date(tijd));
        return `<div class="dag">
          <span class="icoon">${emoji}</span>
          <span class="dagnaam">${dagNaam}</span>
          <span class="details">${omschrijving}<br>
            <span class="temp-hoog">${Math.round(d.temperature_2m_max[i])}°C</span> /
            <span class="temp-laag">${Math.round(d.temperature_2m_min[i])}°C</span>
            · 💧 ${d.precipitation_probability_max[i] ?? '–'}% · 💨 ${Math.round(d.wind_speed_10m_max[i] ?? 0)} km/u
          </span>
        </div>`;
      })
      .join('');
  } catch (fout) {
    console.error(fout);
    inhoud.innerHTML = 'Kon de weersverwachting niet opvragen (Open-Meteo onbereikbaar).';
  }
}

/* ------- filters ------- */

function filtersToegepast() {
  tekenResultaten();
  tekenMarkers();
  const n = zichtbarePois().length;
  setBericht(`${n} zichtbare resultaten binnen ${$id('straal').value} km.`);
}

/* ------- init ------- */

function init() {
  initKaart();

  $id('btn-locatie').addEventListener('click', gebruikMijnLocatie);
  $id('btn-kies-punt').addEventListener('click', wisselKiesModus);
  $id('btn-zoek').addEventListener('click', zoekEnGa);
  $id('zoekveld').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') zoekEnGa();
  });
  $id('straal').addEventListener('input', () => {
    $id('straal-uit').value = $id('straal').value;
  });
  $id('straal').addEventListener('change', zoekInGebied);
  $id('toon-campers').addEventListener('change', zoekInGebied);
  $id('btn-opnieuw').addEventListener('click', zoekInGebied);

  ['f-attracties', 'f-campers'].forEach((id) => {
    $id(id).addEventListener('change', filtersToegepast);
  });
  ['route-auto', 'route-voet'].forEach((id) => {
    $id(id).addEventListener('change', tekenResultaten);
  });
}

document.addEventListener('DOMContentLoaded', init);
