export interface ArchiveCatalogEntry {
  id: string;
  name: string;
  era: string;
  resolution: string;
  coverage: string;
  integrationStatus: 'live-streamed' | 'external-vault';
  provider: string;
  notes: string;
  buildUrl?: (lat: number, lon: number, zoom: number) => string;
}

export const EXTERNAL_AND_LIVE_ARCHIVES: ArchiveCatalogEntry[] = [
  {
    id: 'pc-landsat-l1',
    name: 'USGS Landsat 1–5 MSS Colecția 2 L1',
    era: '1972–2013',
    resolution: '60 m',
    coverage: 'Întreaga Românie (primele scene din sep. 1972)',
    integrationStatus: 'live-streamed',
    provider: 'USGS / Microsoft Planetary Computer TiTiler',
    notes: 'Transmisă direct în hartă prin mozaicuri dinamice TiTiler și căutare individuală în Scene Live.',
  },
  {
    id: 'esri-gls',
    name: 'USGS / Esri Landsat Global Land Survey (GLS)',
    era: '1975, 1990, 2000, 2005, 2010',
    resolution: '30–60 m',
    coverage: 'Acoperire 100% continuă a României',
    integrationStatus: 'live-streamed',
    provider: 'Esri / USGS ArcGIS ImageServer',
    notes: 'Cinci epoci decenale curate fără nori, cu combinații spectrale dinamice (RGB, CIR, SWIR, Agricultură).',
  },
  {
    id: 'pc-landsat-l2',
    name: 'USGS Landsat 4–9 TM / ETM+ / OLI Colecția 2 L2',
    era: '1982–2026',
    resolution: '30 m',
    coverage: 'Întreaga Românie (44 de ani continuu)',
    integrationStatus: 'live-streamed',
    provider: 'USGS / Microsoft Planetary Computer STAC + TiTiler',
    notes: 'Permite construirea de mozaicuri pentru orice interval de ani (1982–2026) sau încărcarea pasajelor individuale.',
  },
  {
    id: 'nasa-gibs',
    name: 'NASA GIBS Zilnic: MODIS / VIIRS / HLS L30',
    era: '2000-02-24 – Prezent',
    resolution: '30–250 m',
    coverage: 'Acoperire zilnică completă a României',
    integrationStatus: 'live-streamed',
    provider: 'NASA EOSDIS GIBS WMTS',
    notes: 'Selectează orice dată calendaristică exactă începând cu feb. 2000 pentru MODIS Terra/Aqua, VIIRS sau Landsat HLS 30 m.',
  },
  {
    id: 'pc-aster',
    name: 'NASA/METI Terra ASTER L1T',
    era: '2000–2026',
    resolution: '15 m VNIR',
    coverage: 'Fâșii selective pe teritoriul României',
    integrationStatus: 'live-streamed',
    provider: 'NASA / Microsoft Planetary Computer',
    notes: 'Scene VNIR în fals-color la 15 m căutabile în Scene Live, excelente pentru perioada 2000–2008.',
  },
  {
    id: 'esri-wayback',
    name: 'Esri World Imagery Wayback (199 Ediții)',
    era: '2014-02-20 – 2026-11-18',
    resolution: '0,3 – 0,6 m',
    coverage: 'Acoperire sub-metrică în România',
    integrationStatus: 'live-streamed',
    provider: 'Esri ArcGIS Wayback WMTS',
    notes: 'Toate cele 199 de ediții cu detecție automată a schimbărilor locale și metadate de captură per pixel.',
  },
  {
    id: 'eox-s2',
    name: 'Copernicus Sentinel-2 Mozaicuri Anuale Fără Nori',
    era: '2016–2025 (10 ani consecutivi)',
    resolution: '10 m',
    coverage: 'Acoperire 100% continuă a României',
    integrationStatus: 'live-streamed',
    provider: 'ESA Copernicus / EOX IT Services',
    notes: 'Fiecare an din 2016 până în 2025 redat unitar la rezoluție de 10 m.',
  },
  {
    id: 'pc-sentinel1',
    name: 'Copernicus Sentinel-1 RTC (Radar SAR Bandă C)',
    era: '2014–2026',
    resolution: '10 m',
    coverage: 'Întreaga Românie, indiferent de nori',
    integrationStatus: 'live-streamed',
    provider: 'ESA / Microsoft Planetary Computer',
    notes: 'Imagini radar ce pătrund prin stratul de nori de iarnă, ideale pentru inundații, Delta Dunării și structuri urbane.',
  },
  {
    id: 'oam-ro',
    name: 'Ortofotoplanuri OpenAerialMap România (183 seturi)',
    era: '2015–2025',
    resolution: '1 – 15 cm',
    coverage: 'Orașe și coridoare cartografiate din România',
    integrationStatus: 'live-streamed',
    provider: 'Comunitatea OpenAerialMap',
    notes: 'Mozaicuri aeriene și de dronă cu licență deschisă, căutabile direct după zona afișată pe hartă.',
  },
  // External specialized vaults (pre-1972 spy satellites, national orthos, GEE WebM)
  {
    id: 'usgs-declass-corona',
    name: 'Sateliți Spion Declasificați USGS (CORONA KH-1..4B, GAMBIT KH-7, HEXAGON KH-9)',
    era: '1960–1984',
    resolution: '0,6 – 7,5 m (film pancromatic)',
    coverage: 'Benzi dense din Războiul Rece peste România (1962–1984)',
    integrationStatus: 'external-vault',
    provider: 'U.S. Geological Survey EarthExplorer',
    notes:
      'Scanările brute de film panoramic nu sunt ortorectificate și necesită descărcare gratuită cu cont USGS și georeferențiere locală.',
    buildUrl: (lat, lon) =>
      `https://earthexplorer.usgs.gov/?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&zoom=10`,
  },
  {
    id: 'fostul-bucuresti',
    name: 'Fostul București (CORONA KH-4A 1966 și KH-9 Hexagon 1972–1984)',
    era: '1927, 1938, 1943, 1966, 1978, 1980',
    resolution: '~1 – 2 m',
    coverage: 'Zona Metropolitană București',
    integrationStatus: 'external-vault',
    provider: 'fostulbucuresti.github.io (Ionuț Săndric / USGS)',
    notes:
      'Tile-uri ortorectificate ale Bucureștiului din sateliți spion din Războiul Rece, găzduite într-un cont Mapbox dedicat.',
    buildUrl: (lat, lon, zoom) =>
      `https://fostulbucuresti.github.io/#${Math.max(11, Math.min(17, zoom))}/${lat.toFixed(4)}/${lon.toFixed(4)}!a3`,
  },
  {
    id: 'space-from-space',
    name: 'SpaceFromSpace · Index Sateliți Spion Războiul Rece',
    era: '1960–1984',
    resolution: '0,6 – 9 m',
    coverage: 'Explorer interactiv al amprentelor din Europa de Est',
    integrationStatus: 'external-vault',
    provider: 'spacefromspace.com',
    notes: 'Vizualizează amprentele zborurilor CORONA, GAMBIT și HEXAGON pe o hartă globală.',
    buildUrl: (lat, lon, zoom) =>
      `https://spacefromspace.com/#map=${zoom}/${lat.toFixed(4)}/${lon.toFixed(4)}`,
  },
  {
    id: 'ancpi-geoportal',
    name: 'Geoportal ANCPI · Ortofotoplanuri Naționale',
    era: '2005, 2008–2010, 2012, 2016, 2020–2023',
    resolution: '0,2 – 0,5 m',
    coverage: 'Rețeaua Cadastrală Națională a României',
    integrationStatus: 'external-vault',
    provider: 'Agenția Națională de Cadastru și Publicitate Imobiliară',
    notes:
      'Campanii aeriene oficiale ale României (geoportal.ancpi.ro restricționează de obicei integrarea directă a tile-urilor externe în afara QGIS/portalului).',
    buildUrl: () => 'https://geoportal.ancpi.ro/imobile.html',
  },
  {
    id: 'gee-timelapse',
    name: 'Google Earth Engine · Timelapse Anual (1984–2022)',
    era: '1984–2022 (39 de cadre anuale)',
    resolution: '~19 – 30 m',
    coverage: 'Întreaga Românie',
    integrationStatus: 'external-vault',
    provider: 'Google Earth Engine',
    notes:
      'Timelapse video continuu Landsat/Sentinel fără goluri, centrat automat pe coordonatele curente de pe hartă.',
    buildUrl: (lat, lon, zoom) =>
      `https://earthengine.google.com/timelapse/#v=${lat.toFixed(4)},${lon.toFixed(4)},${Math.max(
        6,
        Math.min(13, zoom)
      )},latLng&t=0.03`,
  },
];
