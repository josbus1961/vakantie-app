# vakantie-app

Web-app die rond jouw huidige locatie (of een ingevoerde/gekozen locatie) toeristische
attracties, bezienswaardigheden en bijzonderheden toont binnen een instelbare straal
(1–50 km), inclusief gratis overnachtingsplaatsen voor campers, eventuele kosten,
routeafstand en een 3-daagse weersverwachting. De interface en alle resultaten zijn
in het Nederlands.

## Functionaliteit

- **Locatie bepalen** via drie routes:
  - 📍 huidige locatie (browser-geolocatie),
  - 🔍 zoekveld voor plaats, adres of postcode (Nominatim, Nederlandse namen),
  - 🗺️ klik op de kaart om een startpunt te kiezen.
- **Instelbare straal** van 1 tot 50 km met schuifregelaar.
- **Resultaten** (gesorteerd op afstand, gefilterd per categorie):
  - Attracties (tourism=attraction, museum, viewpoint, theme_park, zoo, aquarium, artwork, gallery),
  - Historie (kasteel, monument, ruïne, fort, gedenkteken, opgravingslocatie, molen, vuurtoren, …),
  - Natuur (strand, park, tuin, natuurgebied, grot, waterval, bergtop, duin, …),
  - 🚐 Camperplaatsen (camperplaatsen/campings én parkeerplaatsen die openstaan voor campers).
- **Kaart** met locatie-marker en emoji-markers per categorie; klik op een resultaat om naar de plek te vliegen.
- **Route afstand**: hemelsbrede afstand direct zichtbaar; per resultaat de routeafstand en
  reistijd over de weg via OSRM, plus een navigatielink (Google Maps).
- **Gratis overnachtingsplaatsen voor campers**: camperplaatsen met `fee=no` worden als
  *gratis* gemarkeerd (groen); `fee=yes` als *betaald* (rood) met eventuele toeslag-informatie
  (`charge`, `maxstay`, capaciteit). Onbekende kosten worden eerlijk als "kosten onbekend" getoond.
- **Weer**: actuele 3-daagse verwachting (temperatuur, neerslagkans, wind) met Nederlandse
  omschrijvingen van de weersomstandigheden.

## Gebruikte bronnen (allemaal gratis, geen API-sleutel)

| Functie | Bron | Vertaling naar NL |
| --- | --- | --- |
| Kaart & POI-data | [OpenStreetMap / Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | `name:nl` gaat vóór `name`; types worden vertaald via een Nederlands labelwoordenboek |
| Locatie zoeken | [Nominatim](https://nominatim.org/) | `accept-language=nl` |
| Routeafstand | [OSRM](https://project-osrm.org/) (demo-server) | afstand/tijd in NL-notatie |
| Weer | [Open-Meteo](https://open-meteo.com/) | WMO-weercodes → Nederlandse omschrijvingen |

## Starten

Geen build-stap nodig – gewone statische bestanden:

```bash
# optie 1: direct openen
open index.html        # of dubbelklik in je bestandsbeheerder

# optie 2: lokale server (aanbevolen)
python3 -m http.server 8000
# daarna http://localhost:8000 openen
```

> Voor browser-geolocatie en openbare API's is `http://localhost` of HTTPS het
> betrouwbaarst; start daarom bij voorkeur de lokale server.

## Publiceren (GitHub Pages)

1. Ga in GitHub naar **Settings → Pages**.
2. Kies bij *Source* voor **Deploy from a branch**, branch `main`, map `/ (root)`.
3. Na enkele ogenblikken staat de app op `https://josbus1961.github.io/vakantie-app/`.

## Bestanden

- `index.html` – paginastructuur (Nederlands, `lang="nl"`)
- `style.css` – opmaak, donker thema, mobiel-responsief
- `app.js` – alle logica: locatie, Overpass-queries, filters, kaart, weer, routes

## Data en eerlijk gebruik

- Overpass/Nominatim zijn gratis gemeenschapsdiensten: houd zoekopdrachten beperkt.
  De app vraagt alleen opnieuw als de straal, locatie of camper-instelling wijzigt.
- OSM-data is beschikbaar onder de [ODbL](https://opendatacommons.org/licenses/odbl/)-licentie.
- Weergegeven kosten en openingstijden komen uit OSM-tags en kunnen onvolledig zijn.
