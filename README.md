# România din Orbită — Arhiva de Imagini Satelitare Istorice (1972–2026)

Aplicație web interactivă pentru explorarea și compararea tuturor arhivelor satelitare istorice disponibile pentru România (1972–2026) față de imaginile satelitare actuale.

**Site live (GitHub Pages):** https://morarfs.github.io/Satelite_project/

## Funcționalități
- **4 moduri de comparație:** Glisare (Swipe), Paralel (Side-by-Side), Lupă (Spyglass) și Estompare / Clipire (`Space`).
- **Timelapse lin cu dublu-buffer și preîncărcare:** Crossfade de 480 ms fără ecrane negre între cadre, cu preîncărcare în fundal și 4 serii dedicate (`50 Ani 1975–2025`, `Sentinel-2 Anual 2016–2025`, `Wayback Sub-metric 2014–2026`, `Toată Arhiva 1972–2025`), viteze `0,5× / 1× / 2×` și mod `Tot ecranul`.
- **Numele localităților pe harta actuală:** Strat transparent activ implicit pe partea curentă pentru orientare rapidă.
- **Căutare localități în România:** Autocomplete prin Photon / OpenStreetMap cu retragerea automată a panoului din stânga în timpul căutării.
- **12 repere istorice din România:** București (Centrul Civic & Lacul Morii), Canalul Dunăre–Marea Neagră, Delta Dunării & Insula Sacalin, Roșia Poieni / Geamăna, Portul Constanța, Podul Brăila, Aeroportul Brașov-Ghimbav, Cluj–Florești, Porțile de Fier II, Pipera / A0, Munții Făgăraș, Timișoara.

## Surse de date integrate direct (100% static în browser)
- **USGS / Esri Landsat Global Land Survey (GLS):** epocile `~1975`, `~1990`, `~2000`, `~2005`, `~2010` (`30–60 m`) cu combinații spectrale (`RGB`, `CIR`, `SWIR`, `AGRI`).
- **Microsoft Planetary Computer STAC + TiTiler:** mozaicuri dinamice și căutare scene individuale (`Landsat 1–5 MSS` 1972–2013, `Landsat 4–9 L2` 1982–2026, `Terra ASTER` 15 m, `Sentinel-2 L2A` 10 m, `Sentinel-1 SAR`).
- **Esri World Imagery Wayback:** 199 ediții sub-metrice (`2014–2026`, `0,3–0,6 m`) cu detecție locală a schimbărilor și dată de captură per pixel.
- **Copernicus Sentinel-2 Cloudless (EOX):** mozaicuri anuale fără nori (`2016–2025`, `10 m`).
- **NASA GIBS:** imagini zilnice `MODIS Terra/Aqua`, `VIIRS` și `HLS L30` (`2000–prezent`).
- **OpenAerialMap România:** catalog cu 183 ortofotoplanuri la rezoluție centimetrică.
- **Arhive externe Pre-1972 & Naționale:** linkuri dinamice pe coordonatele curente către USGS EarthExplorer (CORONA/GAMBIT/HEXAGON 1960–1984), Fostul București, SpaceFromSpace, Geoportal ANCPI și Google Earth Engine Timelapse.

## Rulare locală
```bash
npm install
npm run dev
```

Build de producție:
```bash
npm run build
```
