// Shared Node API handler used by both Vite dev middleware and server/prodServer.mjs

const ROMANIA_POLYGON = {
  type: 'Polygon',
  coordinates: [
    [
      [20.2, 43.6],
      [29.8, 43.6],
      [29.8, 48.3],
      [20.2, 48.3],
      [20.2, 43.6],
    ],
  ],
};

const WAYBACK_CONFIG_URL =
  'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
const PC_STAC_SEARCH_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const PC_MOSAIC_REGISTER_URL =
  'https://planetarycomputer.microsoft.com/api/data/v1/mosaic/register';
const PC_DATA_BASE_URL = 'https://planetarycomputer.microsoft.com/api/data/v1';

// In-memory TTL caches
let waybackCache = { expiresAt: 0, releases: [], byRel: new Map() };
const changesCache = new Map(); // key: `${z}/${x}/${y}` -> { expiresAt, payload }
const metadataCache = new Map(); // key: `${rel}/${lat.toFixed(3)}/${lon.toFixed(3)}` -> { expiresAt, payload }
const mosaicCache = new Map(); // key -> { expiresAt, searchId }
const tileJsonCache = new Map(); // key -> { expiresAt, payload }

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'RomaniaSatelliteArchive/1.0',
        ...(options.headers || {}),
      },
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} from ${url}: ${txt.slice(0, 200)}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function latLonToTile(lat, lon, z) {
  const n = 1 << z;
  const x = Math.max(0, Math.min(n - 1, Math.floor(((lon + 180) / 360) * n)));
  const rad = (lat * Math.PI) / 180;
  const y = Math.max(
    0,
    Math.min(
      n - 1,
      Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)
    )
  );
  return { x, y };
}

async function getWaybackReleases() {
  const now = Date.now();
  if (waybackCache.releases.length > 0 && waybackCache.expiresAt > now) {
    return waybackCache;
  }
  const raw = await fetchJson(WAYBACK_CONFIG_URL, {}, 15000);
  const releases = Object.entries(raw)
    .map(([releaseNum, entry]) => {
      const title = entry.itemTitle || `Wayback ${releaseNum}`;
      const m = title.match(/(\d{4}-\d{2}-\d{2})/);
      const date = m ? m[1] : '0000-00-00';
      const tileUrl = (entry.itemURL || '')
        .replace('{level}', '{z}')
        .replace('{row}', '{y}')
        .replace('{col}', '{x}');
      return {
        releaseNum: String(releaseNum),
        date,
        title,
        tileUrl,
        metadataUrl: entry.metadataLayerUrl || '',
      };
    })
    .filter((r) => r.tileUrl && r.date !== '0000-00-00')
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.releaseNum) - Number(b.releaseNum));

  const byRel = new Map();
  releases.forEach((r, idx) => byRel.set(r.releaseNum, { ...r, index: idx }));
  waybackCache = { expiresAt: now + 3600 * 1000, releases, byRel };
  return waybackCache;
}

async function handleWaybackChanges(reqUrl, res) {
  const lat = parseFloat(reqUrl.searchParams.get('lat') || '44.4268');
  const lon = parseFloat(reqUrl.searchParams.get('lon') || '26.1025');
  const rawZ = parseInt(reqUrl.searchParams.get('z') || '14', 10);
  const z = Math.max(12, Math.min(17, Number.isFinite(rawZ) ? rawZ : 14));
  const { x, y } = latLonToTile(lat, lon, z);
  const cacheKey = `${z}/${x}/${y}`;
  const now = Date.now();
  const cached = changesCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return sendJson(res, 200, cached.payload);
  }

  const { releases, byRel } = await getWaybackReleases();
  const seen = new Set();
  const foundDesc = [];

  let i = releases.length - 1;
  let steps = 0;
  const maxSteps = 95;

  while (i >= 0 && steps < maxSteps) {
    steps += 1;
    const rel = releases[i];
    const tmUrl = `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tilemap/${rel.releaseNum}/${z}/${y}/${x}?f=json`;
    let tm;
    try {
      tm = await fetchJson(tmUrl, {}, 8000);
    } catch {
      i -= 1;
      continue;
    }
    const sel = Array.isArray(tm.select) ? tm.select : [];
    if (sel.length > 0) {
      const targetRel = String(sel[0]);
      const target = byRel.get(targetRel);
      if (target && target.index < i) {
        if (!seen.has(target.releaseNum)) {
          seen.add(target.releaseNum);
          foundDesc.push({
            releaseNum: target.releaseNum,
            date: target.date,
            title: target.title,
            tileUrl: target.tileUrl,
            metadataUrl: target.metadataUrl,
          });
        }
        i = target.index - 1;
        continue;
      }
    }
    if (Array.isArray(tm.data) && tm.data[0] === 1) {
      if (!seen.has(rel.releaseNum)) {
        seen.add(rel.releaseNum);
        foundDesc.push({
          releaseNum: rel.releaseNum,
          date: rel.date,
          title: rel.title,
          tileUrl: rel.tileUrl,
          metadataUrl: rel.metadataUrl,
        });
      }
    }
    i -= 1;
  }

  const changes = foundDesc.reverse();
  const payload = {
    zoom: z,
    x,
    y,
    steps,
    totalReleases: releases.length,
    changes,
  };
  changesCache.set(cacheKey, { expiresAt: now + 20 * 60 * 1000, payload });
  return sendJson(res, 200, payload);
}

async function handleWaybackMetadata(reqUrl, res) {
  const releaseNum = reqUrl.searchParams.get('releaseNum') || 'current';
  const lat = parseFloat(reqUrl.searchParams.get('lat') || '44.4268');
  const lon = parseFloat(reqUrl.searchParams.get('lon') || '26.1025');
  const cacheKey = `${releaseNum}/${lat.toFixed(3)}/${lon.toFixed(3)}`;
  const now = Date.now();
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return sendJson(res, 200, cached.payload);
  }

  const { releases, byRel } = await getWaybackReleases();
  let target = null;
  if (releaseNum === 'current') {
    target = releases[releases.length - 1];
  } else {
    target = byRel.get(String(releaseNum)) || releases[releases.length - 1];
  }

  if (!target || !target.metadataUrl) {
    return sendJson(res, 200, {
      releaseNum,
      captureDate: null,
      resolutionM: null,
      provider: null,
      description: null,
    });
  }

  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    outFields: 'SRC_DATE2,SRC_RES,NICE_NAME,NICE_DESC',
    returnGeometry: 'false',
    f: 'json',
  });

  // Query layer 0 first (highest-resolution sublayer), fallback to identify across visible layers
  let attrs = null;
  try {
    const qData = await fetchJson(`${target.metadataUrl}/0/query?${params.toString()}`, {}, 8000);
    if (Array.isArray(qData.features) && qData.features.length > 0) {
      attrs = qData.features[0].attributes;
    }
  } catch {
    // ignore and fallback to identify
  }

  if (!attrs) {
    try {
      const idParams = new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: 'esriGeometryPoint',
        sr: '4326',
        layers: 'visible',
        tolerance: '2',
        mapExtent: `${lon - 0.02},${lat - 0.02},${lon + 0.02},${lat + 0.02}`,
        imageDisplay: '400,400,96',
        returnGeometry: 'false',
        f: 'json',
      });
      const idData = await fetchJson(
        `${target.metadataUrl}/identify?${idParams.toString()}`,
        {},
        8000
      );
      if (Array.isArray(idData.results) && idData.results.length > 0) {
        attrs = idData.results[0].attributes;
      }
    } catch {
      // ignore
    }
  }

  let captureDate = null;
  if (attrs && attrs.SRC_DATE2) {
    const num = Number(attrs.SRC_DATE2);
    if (Number.isFinite(num) && num > 100000000) {
      captureDate = new Date(num).toISOString().slice(0, 10);
    } else {
      captureDate = String(attrs.SRC_DATE2);
    }
  }
  const resRaw = attrs?.SRC_RES !== undefined && attrs?.SRC_RES !== null ? Number(attrs.SRC_RES) : null;
  const payload = {
    releaseNum: target.releaseNum,
    releaseDate: target.date,
    captureDate,
    resolutionM: Number.isFinite(resRaw) ? resRaw : null,
    provider: attrs?.NICE_NAME || null,
    description: attrs?.NICE_DESC || null,
  };
  metadataCache.set(cacheKey, { expiresAt: now + 15 * 60 * 1000, payload });
  return sendJson(res, 200, payload);
}

function buildPcTileQuery(collection, spectralMode = 'natural') {
  if (collection === 'landsat-c2-l1') {
    // Landsat 1-5 MSS has no blue band; NIR-Red-Green gives classic crisp false-color infrared,
    // or Red-Green-Green for pseudo-natural
    if (spectralMode === 'natural') {
      return 'assets=red&assets=green&assets=green&color_formula=' +
        encodeURIComponent('gamma RGB 2.5, saturation 0.8, sigmoidal RGB 14 0.5');
    }
    return 'assets=nir08&assets=red&assets=green&color_formula=' +
      encodeURIComponent('gamma RGB 2.6, saturation 1.0, sigmoidal RGB 14 0.5');
  }
  if (collection === 'landsat-c2-l2') {
    if (spectralMode === 'cir') {
      return 'assets=nir08&assets=red&assets=green&color_formula=' +
        encodeURIComponent('gamma RGB 2.7, saturation 1.3, sigmoidal RGB 15 0.55');
    }
    if (spectralMode === 'swir') {
      return 'assets=swir16&assets=nir08&assets=red&color_formula=' +
        encodeURIComponent('gamma RGB 2.7, saturation 1.3, sigmoidal RGB 15 0.55');
    }
    if (spectralMode === 'agriculture') {
      return 'assets=swir16&assets=nir08&assets=blue&color_formula=' +
        encodeURIComponent('gamma RGB 2.7, saturation 1.3, sigmoidal RGB 15 0.55');
    }
    return 'assets=red&assets=green&assets=blue&color_formula=' +
      encodeURIComponent('gamma RGB 2.7, saturation 1.5, sigmoidal RGB 15 0.55');
  }
  if (collection === 'sentinel-2-l2a') {
    if (spectralMode === 'cir') {
      return 'assets=B08&assets=B04&assets=B03&rescale=0,3500';
    }
    if (spectralMode === 'swir') {
      return 'assets=B11&assets=B08&assets=B04&rescale=0,3500';
    }
    if (spectralMode === 'agriculture') {
      return 'assets=B11&assets=B08&assets=B02&rescale=0,3500';
    }
    return 'assets=visual';
  }
  if (collection === 'aster-l1t') {
    return 'assets=VNIR&asset_bidx=' + encodeURIComponent('VNIR|3,2,1');
  }
  if (collection === 'sentinel-1-rtc') {
    return 'assets=vv&assets=vh&expression=' +
      encodeURIComponent('vv;vh;vv/vh') +
      '&rescale=0,0.3&rescale=0,0.1&rescale=0,5';
  }
  return 'assets=visual';
}

async function handlePcMosaic(req, res) {
  const body = await readJsonBody(req);
  const collection = body.collection || 'landsat-c2-l2';
  const startDate = body.startDate || '1984-05-01T00:00:00Z';
  const endDate = body.endDate || '1986-10-31T23:59:59Z';
  const maxCloud = Number.isFinite(Number(body.maxCloud)) ? Number(body.maxCloud) : 20;
  const spectralMode = body.spectralMode || 'natural';

  const filterKey = `${collection}|${startDate}|${endDate}|${maxCloud}`;
  const now = Date.now();
  let searchId = null;
  const cached = mosaicCache.get(filterKey);
  if (cached && cached.expiresAt > now) {
    searchId = cached.searchId;
  } else {
    const args = [
      { op: '=', args: [{ property: 'collection' }, collection] },
      { op: 't_intersects', args: [{ property: 'datetime' }, { interval: [startDate, endDate] }] },
      { op: 's_intersects', args: [{ property: 'geometry' }, ROMANIA_POLYGON] },
    ];
    if (collection !== 'sentinel-1-rtc') {
      args.push({ op: '<=', args: [{ property: 'eo:cloud_cover' }, maxCloud] });
    }
    const payload = {
      collections: [collection],
      'filter-lang': 'cql2-json',
      filter: { op: 'and', args },
      sortby:
        collection === 'sentinel-1-rtc'
          ? [{ field: 'datetime', direction: 'desc' }]
          : [{ field: 'eo:cloud_cover', direction: 'asc' }],
    };

    const reg = await fetchJson(
      PC_MOSAIC_REGISTER_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      15000
    );
    searchId = reg.id || reg.searchid;
    if (!searchId) {
      throw new Error('Planetary Computer mosaic register did not return searchId');
    }
    mosaicCache.set(filterKey, { expiresAt: now + 25 * 60 * 1000, searchId });
  }

  const query = buildPcTileQuery(collection, spectralMode);
  const tileUrl = `${PC_DATA_BASE_URL}/mosaic/${searchId}/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=${encodeURIComponent(
    collection
  )}&${query}`;

  return sendJson(res, 200, { searchId, collection, tileUrl });
}

async function handlePcSearch(req, res) {
  const body = await readJsonBody(req);
  const collections = Array.isArray(body.collections) && body.collections.length
    ? body.collections
    : ['landsat-c2-l1'];
  const bbox = Array.isArray(body.bbox) && body.bbox.length === 4
    ? body.bbox
    : [20.26, 43.62, 29.72, 48.27];
  const startDate = body.startDate || '1972-01-01T00:00:00Z';
  const endDate = body.endDate || new Date().toISOString();
  const maxCloud = Number.isFinite(Number(body.maxCloud)) ? Number(body.maxCloud) : 25;
  const limit = Math.min(40, Math.max(1, parseInt(body.limit || '24', 10)));

  const stacReq = {
    collections,
    bbox,
    datetime: `${startDate}/${endDate}`,
    limit,
    sortby: body.sortDir === 'desc'
      ? [{ field: 'datetime', direction: 'desc' }]
      : [{ field: 'datetime', direction: 'asc' }],
  };

  if (!collections.includes('sentinel-1-rtc')) {
    stacReq.query = { 'eo:cloud_cover': { lte: maxCloud } };
  }

  const stacRes = await fetchJson(
    PC_STAC_SEARCH_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stacReq),
    },
    18000
  );

  const items = (stacRes.features || []).map((f) => {
    const props = f.properties || {};
    const col = f.collection || collections[0];
    const query = buildPcTileQuery(col, col === 'landsat-c2-l1' ? 'cir' : 'natural');
    const previewUrl =
      f.assets?.rendered_preview?.href ||
      f.assets?.['vnir-browse']?.href ||
      f.assets?.thumbnail?.href ||
      null;

    return {
      id: f.id,
      collection: col,
      datetime: props.datetime || '',
      platform: props.platform || col,
      cloudCover:
        typeof props['eo:cloud_cover'] === 'number'
          ? Math.round(props['eo:cloud_cover'] * 10) / 10
          : null,
      bbox: f.bbox,
      geometry: f.geometry,
      previewUrl,
      tileJsonHref: f.assets?.tilejson?.href || null,
      tileUrl: `${PC_DATA_BASE_URL}/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=${encodeURIComponent(
        col
      )}&item=${encodeURIComponent(f.id)}&${query}`,
    };
  });

  return sendJson(res, 200, { count: items.length, items });
}

async function handlePcTileJson(reqUrl, res) {
  const collection = reqUrl.searchParams.get('collection');
  const item = reqUrl.searchParams.get('item');
  if (!collection || !item) {
    return sendJson(res, 400, { error: 'collection and item are required' });
  }
  const cacheKey = `${collection}|${item}`;
  const now = Date.now();
  const cached = tileJsonCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return sendJson(res, 200, cached.payload);
  }

  // Fetch STAC item to extract exact signed/configured tilejson href, or query data API directly
  const itemUrl = `https://planetarycomputer.microsoft.com/api/stac/v1/collections/${encodeURIComponent(
    collection
  )}/items/${encodeURIComponent(item)}`;
  const stacItem = await fetchJson(itemUrl, {}, 12000);
  const tjHref = stacItem.assets?.tilejson?.href;
  if (!tjHref) {
    const query = buildPcTileQuery(collection, collection === 'landsat-c2-l1' ? 'cir' : 'natural');
    const fallback = {
      tiles: [
        `${PC_DATA_BASE_URL}/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=${encodeURIComponent(
          collection
        )}&item=${encodeURIComponent(item)}&${query}`,
      ],
    };
    return sendJson(res, 200, fallback);
  }
  const tj = await fetchJson(tjHref, {}, 12000);
  tileJsonCache.set(cacheKey, { expiresAt: now + 30 * 60 * 1000, payload: tj });
  return sendJson(res, 200, tj);
}

async function handleOam(reqUrl, res) {
  const bbox = reqUrl.searchParams.get('bbox') || '20.26,43.62,29.72,48.27';
  const limit = Math.min(60, Math.max(1, parseInt(reqUrl.searchParams.get('limit') || '30', 10)));
  const url = `https://api.openaerialmap.org/meta?bbox=${encodeURIComponent(bbox)}&limit=${limit}`;
  const data = await fetchJson(url, {}, 15000);
  const items = (data.results || [])
    .filter((r) => r.properties?.tms)
    .map((r) => ({
      id: r._id,
      title: r.title || 'Ortofotoplan România',
      date: (r.acquisition_start || r.uploaded_at || '').slice(0, 10),
      gsdM: typeof r.gsd === 'number' ? Math.round(r.gsd * 1000) / 1000 : null,
      provider: r.provider || 'Contribuitor OpenAerialMap',
      bbox: r.bbox,
      geojson: r.geojson,
      tmsUrl: r.properties.tms,
      thumbnail: r.properties?.thumbnail || null,
    }));
  return sendJson(res, 200, {
    total: data.meta?.found ?? items.length,
    items,
  });
}

async function handleGeocode(reqUrl, res) {
  const q = (reqUrl.searchParams.get('q') || '').trim();
  if (!q) {
    return sendJson(res, 200, { results: [] });
  }
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=ro&limit=6&q=${encodeURIComponent(
    q
  )}`;
  const raw = await fetchJson(
    url,
    {
      headers: {
        'User-Agent': 'RomaniaSatelliteArchive/1.0 (https://github.com/romania-satellite-archive)',
        'Accept-Language': 'ro,en',
      },
    },
    10000
  );
  const results = (Array.isArray(raw) ? raw : []).map((r) => ({
    name: r.display_name,
    shortName: r.name || r.display_name.split(',')[0],
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    type: r.type || r.class || 'place',
  }));
  return sendJson(res, 200, { results });
}

export async function handleApiRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }

  const host = req.headers.host || 'localhost';
  const reqUrl = new URL(req.url || '/', `http://${host}`);
  const pathname = reqUrl.pathname;

  if (!pathname.startsWith('/api/')) {
    return false;
  }

  try {
    if (pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, timestamp: new Date().toISOString() });
      return true;
    }
    if (pathname === '/api/wayback/config' && req.method === 'GET') {
      const { releases } = await getWaybackReleases();
      sendJson(res, 200, { count: releases.length, releases });
      return true;
    }
    if (pathname === '/api/wayback/changes' && req.method === 'GET') {
      await handleWaybackChanges(reqUrl, res);
      return true;
    }
    if (pathname === '/api/wayback/metadata' && req.method === 'GET') {
      await handleWaybackMetadata(reqUrl, res);
      return true;
    }
    if (pathname === '/api/pc/mosaic' && req.method === 'POST') {
      await handlePcMosaic(req, res);
      return true;
    }
    if (pathname === '/api/pc/search' && req.method === 'POST') {
      await handlePcSearch(req, res);
      return true;
    }
    if (pathname === '/api/pc/tilejson' && req.method === 'GET') {
      await handlePcTileJson(reqUrl, res);
      return true;
    }
    if (pathname === '/api/oam' && req.method === 'GET') {
      await handleOam(reqUrl, res);
      return true;
    }
    if (pathname === '/api/geocode' && req.method === 'GET') {
      await handleGeocode(reqUrl, res);
      return true;
    }

    sendJson(res, 404, { error: `Unknown API route: ${pathname}` });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    sendJson(res, 502, { error: message });
    return true;
  }
}
