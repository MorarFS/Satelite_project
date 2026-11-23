import type {
  GeocodeResult,
  ImageryLayerSpec,
  OamScene,
  SpectralMode,
  StacScene,
  WaybackMetadata,
  WaybackRelease,
} from '../types/satellite';

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
const PC_STAC_BASE_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1';
const PC_DATA_BASE_URL = 'https://planetarycomputer.microsoft.com/api/data/v1';

interface CachedWaybackStore {
  releases: WaybackRelease[];
  byRel: Map<string, WaybackRelease & { index: number }>;
}

let waybackConfigPromise: Promise<CachedWaybackStore> | null = null;
const changesCache = new Map<string, Promise<{ zoom: number; totalReleases: number; changes: WaybackRelease[] }>>();
const metadataCache = new Map<string, Promise<WaybackMetadata>>();
const mosaicUrlCache = new Map<string, Promise<string>>();
const tileJsonUrlCache = new Map<string, Promise<string>>();
let oamSnapshotPromise: Promise<{ total: number; items: OamScene[] }> | null = null;

function latLonToTile(lat: number, lon: number, z: number): { x: number; y: number } {
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

async function getWaybackStore(): Promise<CachedWaybackStore> {
  if (waybackConfigPromise) return waybackConfigPromise;

  waybackConfigPromise = (async () => {
    const res = await fetch(WAYBACK_CONFIG_URL);
    if (!res.ok) throw new Error(`Eroare configurare Wayback (${res.status})`);
    const raw = (await res.json()) as Record<
      string,
      { itemTitle?: string; itemURL?: string; metadataLayerUrl?: string }
    >;

    const releases: WaybackRelease[] = Object.entries(raw)
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
      .filter((r) => Boolean(r.tileUrl) && r.date !== '0000-00-00')
      .sort(
        (a, b) => a.date.localeCompare(b.date) || Number(a.releaseNum) - Number(b.releaseNum)
      );

    const byRel = new Map<string, WaybackRelease & { index: number }>();
    releases.forEach((r, index) => byRel.set(r.releaseNum, { ...r, index }));
    return { releases, byRel };
  })();

  waybackConfigPromise.catch(() => {
    waybackConfigPromise = null;
  });
  return waybackConfigPromise;
}

export async function fetchWaybackConfig(): Promise<WaybackRelease[]> {
  const store = await getWaybackStore();
  return store.releases;
}

export function getWaybackTileKey(lat: number, lon: number, zoom: number): string {
  const z = Math.max(12, Math.min(17, Math.round(zoom) || 14));
  const { x, y } = latLonToTile(lat, lon, z);
  return `${z}/${x}/${y}`;
}

export async function fetchWaybackChanges(
  lat: number,
  lon: number,
  zoom: number
): Promise<{ zoom: number; totalReleases: number; changes: WaybackRelease[] }> {
  const z = Math.max(12, Math.min(17, Math.round(zoom) || 14));
  const { x, y } = latLonToTile(lat, lon, z);
  const key = getWaybackTileKey(lat, lon, zoom);
  const existing = changesCache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const { releases, byRel } = await getWaybackStore();
    const seen = new Set<string>();
    const foundDesc: WaybackRelease[] = [];

    let i = releases.length - 1;
    let steps = 0;
    const maxSteps = 95;

    while (i >= 0 && steps < maxSteps) {
      steps += 1;
      const rel = releases[i];
      const tmUrl = `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tilemap/${rel.releaseNum}/${z}/${y}/${x}?f=json`;
      let tm: { select?: Array<string | number>; data?: number[] };
      try {
        const res = await fetch(tmUrl);
        if (!res.ok) {
          i -= 1;
          continue;
        }
        tm = await res.json();
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

    return {
      zoom: z,
      totalReleases: releases.length,
      changes: foundDesc.reverse(),
    };
  })();

  changesCache.set(key, promise);
  promise.catch(() => changesCache.delete(key));
  return promise;
}

export async function fetchWaybackMetadata(
  releaseNum: string,
  lat: number,
  lon: number
): Promise<WaybackMetadata> {
  const key = `${releaseNum}/${lat.toFixed(3)}/${lon.toFixed(3)}`;
  const existing = metadataCache.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<WaybackMetadata> => {
    const { releases, byRel } = await getWaybackStore();
    const target =
      releaseNum === 'current'
        ? releases[releases.length - 1]
        : byRel.get(String(releaseNum)) || releases[releases.length - 1];

    if (!target || !target.metadataUrl) {
      return {
        releaseNum,
        captureDate: null,
        resolutionM: null,
        provider: null,
        description: null,
      };
    }

    let attrs: Record<string, unknown> | null = null;

    try {
      const params = new URLSearchParams({
        geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        outFields: 'SRC_DATE2,SRC_RES,NICE_NAME,NICE_DESC',
        returnGeometry: 'false',
        f: 'json',
      });
      const res = await fetch(`${target.metadataUrl}/0/query?${params.toString()}`);
      if (res.ok) {
        const qData = await res.json();
        if (Array.isArray(qData.features) && qData.features.length > 0) {
          attrs = qData.features[0].attributes;
        }
      }
    } catch {
      // Fallback to identify
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
        const res = await fetch(`${target.metadataUrl}/identify?${idParams.toString()}`);
        if (res.ok) {
          const idData = await res.json();
          if (Array.isArray(idData.results) && idData.results.length > 0) {
            attrs = idData.results[0].attributes;
          }
        }
      } catch {
        // Ignore transient identify error
      }
    }

    let captureDate: string | null = null;
    if (attrs && attrs.SRC_DATE2) {
      const num = Number(attrs.SRC_DATE2);
      if (Number.isFinite(num) && num > 100000000) {
        captureDate = new Date(num).toISOString().slice(0, 10);
      } else {
        captureDate = String(attrs.SRC_DATE2);
      }
    }
    const resRaw =
      attrs?.SRC_RES !== undefined && attrs?.SRC_RES !== null ? Number(attrs.SRC_RES) : null;

    return {
      releaseNum: target.releaseNum,
      releaseDate: target.date,
      captureDate,
      resolutionM: resRaw !== null && Number.isFinite(resRaw) ? resRaw : null,
      provider: attrs?.NICE_NAME ? String(attrs.NICE_NAME) : null,
      description: attrs?.NICE_DESC ? String(attrs.NICE_DESC) : null,
    };
  })();

  metadataCache.set(key, promise);
  promise.catch(() => metadataCache.delete(key));
  return promise;
}

function buildPcTileQuery(collection: string, spectralMode: SpectralMode = 'natural'): string {
  if (collection === 'landsat-c2-l1') {
    if (spectralMode === 'natural') {
      return (
        'assets=red&assets=green&assets=green&color_formula=' +
        encodeURIComponent('gamma RGB 2.5, saturation 0.8, sigmoidal RGB 14 0.5')
      );
    }
    return (
      'assets=nir08&assets=red&assets=green&color_formula=' +
      encodeURIComponent('gamma RGB 2.6, saturation 1.0, sigmoidal RGB 14 0.5')
    );
  }
  if (collection === 'landsat-c2-l2') {
    if (spectralMode === 'cir') {
      return (
        'assets=nir08&assets=red&assets=green&color_formula=' +
        encodeURIComponent('gamma RGB 2.7, saturation 1.3, sigmoidal RGB 15 0.55')
      );
    }
    if (spectralMode === 'swir') {
      return (
        'assets=swir16&assets=nir08&assets=red&color_formula=' +
        encodeURIComponent('gamma RGB 2.7, saturation 1.3, sigmoidal RGB 15 0.55')
      );
    }
    if (spectralMode === 'agriculture') {
      return (
        'assets=swir16&assets=nir08&assets=blue&color_formula=' +
        encodeURIComponent('gamma RGB 2.7, saturation 1.3, sigmoidal RGB 15 0.55')
      );
    }
    return (
      'assets=red&assets=green&assets=blue&color_formula=' +
      encodeURIComponent('gamma RGB 2.7, saturation 1.5, sigmoidal RGB 15 0.55')
    );
  }
  if (collection === 'sentinel-2-l2a') {
    if (spectralMode === 'cir') return 'assets=B08&assets=B04&assets=B03&rescale=0,3500';
    if (spectralMode === 'swir') return 'assets=B11&assets=B08&assets=B04&rescale=0,3500';
    if (spectralMode === 'agriculture') return 'assets=B11&assets=B08&assets=B02&rescale=0,3500';
    return 'assets=visual';
  }
  if (collection === 'aster-l1t') {
    return 'assets=VNIR&asset_bidx=' + encodeURIComponent('VNIR|3,2,1');
  }
  if (collection === 'sentinel-1-rtc') {
    return (
      'assets=vv&assets=vh&expression=' +
      encodeURIComponent('vv;vh;vv/vh') +
      '&rescale=0,0.3&rescale=0,0.1&rescale=0,5'
    );
  }
  return 'assets=visual';
}

export async function registerPcMosaic(params: {
  collection: string;
  startDate: string;
  endDate: string;
  maxCloud: number;
  spectralMode: SpectralMode;
}): Promise<string> {
  const key = `${params.collection}|${params.startDate}|${params.endDate}|${params.maxCloud}|${params.spectralMode}`;
  const existing = mosaicUrlCache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const args: unknown[] = [
      { op: '=', args: [{ property: 'collection' }, params.collection] },
      {
        op: 't_intersects',
        args: [{ property: 'datetime' }, { interval: [params.startDate, params.endDate] }],
      },
      { op: 's_intersects', args: [{ property: 'geometry' }, ROMANIA_POLYGON] },
    ];
    if (params.collection !== 'sentinel-1-rtc') {
      args.push({ op: '<=', args: [{ property: 'eo:cloud_cover' }, params.maxCloud] });
    }
    const payload = {
      collections: [params.collection],
      'filter-lang': 'cql2-json',
      filter: { op: 'and', args },
      sortby:
        params.collection === 'sentinel-1-rtc'
          ? [{ field: 'datetime', direction: 'desc' }]
          : [{ field: 'eo:cloud_cover', direction: 'asc' }],
    };

    const res = await fetch(`${PC_DATA_BASE_URL}/mosaic/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Înregistrarea mozaicului a eșuat (${res.status})`);
    }
    const data = await res.json();
    const searchId = data.id || data.searchid;
    if (!searchId) {
      throw new Error('Planetary Computer nu a returnat un searchId valid');
    }
    const query = buildPcTileQuery(params.collection, params.spectralMode);
    return `${PC_DATA_BASE_URL}/mosaic/${searchId}/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=${encodeURIComponent(
      params.collection
    )}&${query}`;
  })();

  mosaicUrlCache.set(key, promise);
  promise.catch(() => mosaicUrlCache.delete(key));
  return promise;
}

export async function fetchPcItemTileJson(
  collection: string,
  item: string
): Promise<string> {
  const key = `${collection}|${item}`;
  const existing = tileJsonUrlCache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const itemUrl = `${PC_STAC_BASE_URL}/collections/${encodeURIComponent(
      collection
    )}/items/${encodeURIComponent(item)}`;
    const itemRes = await fetch(itemUrl);
    if (!itemRes.ok) {
      throw new Error(`Interogarea scenei STAC a eșuat (${itemRes.status})`);
    }
    const stacItem = await itemRes.json();
    const tjHref = stacItem.assets?.tilejson?.href as string | undefined;
    if (!tjHref) {
      return buildPcItemTileUrl(
        collection,
        item,
        collection === 'landsat-c2-l1' ? 'cir' : 'natural'
      );
    }
    const tjRes = await fetch(tjHref);
    if (!tjRes.ok) throw new Error(`Interogarea TileJSON a eșuat (${tjRes.status})`);
    const tj = await tjRes.json();
    const tiles = tj.tiles as string[] | undefined;
    if (!tiles || tiles.length === 0) {
      throw new Error('TileJSON nu a returnat niciun URL de tile');
    }
    return tiles[0];
  })();

  tileJsonUrlCache.set(key, promise);
  promise.catch(() => tileJsonUrlCache.delete(key));
  return promise;
}

export function buildPcItemTileUrl(
  collection: string,
  itemId: string,
  spectralMode: SpectralMode
): string {
  const base = `${PC_DATA_BASE_URL}/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=${encodeURIComponent(
    collection
  )}&item=${encodeURIComponent(itemId)}`;
  return `${base}&${buildPcTileQuery(collection, spectralMode)}`;
}

export async function resolveLayerTileUrl(
  spec: ImageryLayerSpec,
  spectralMode: SpectralMode
): Promise<string | null> {
  if (spec.kind === 'landsat-gls' || spec.kind === 'wms-eharta') {
    return null;
  }
  if (spec.kind === 'pc-mosaic') {
    return registerPcMosaic({
      collection: spec.pcCollection || 'landsat-c2-l2',
      startDate: spec.pcStartDate || '1984-05-01T00:00:00Z',
      endDate: spec.pcEndDate || '1986-10-31T23:59:59Z',
      maxCloud: spec.pcMaxCloud ?? 20,
      spectralMode,
    });
  }
  if (spec.kind === 'pc-item' && spec.pcCollection && spec.pcItemId) {
    if (spec.pcCollection === 'aster-l1t' || spec.pcCollection === 'sentinel-1-rtc') {
      return fetchPcItemTileJson(spec.pcCollection, spec.pcItemId);
    }
    return buildPcItemTileUrl(spec.pcCollection, spec.pcItemId, spectralMode);
  }
  if (spec.kind === 'nasa-gibs') {
    const layer = spec.gibsLayer || 'MODIS_Terra_CorrectedReflectance_TrueColor';
    const dt = spec.gibsDate || '2000-07-15';
    const matrix = spec.gibsMatrixSet || 'GoogleMapsCompatible_Level9';
    const ext = spec.gibsExt || 'jpg';
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${dt}/${matrix}/{z}/{y}/{x}.${ext}`;
  }
  return spec.tileUrl || null;
}

export async function searchPcScenes(params: {
  collections: string[];
  bbox: [number, number, number, number];
  startDate: string;
  endDate: string;
  maxCloud: number;
  limit?: number;
  sortDir?: 'asc' | 'desc';
}): Promise<StacScene[]> {
  const stacReq: Record<string, unknown> = {
    collections: params.collections,
    bbox: params.bbox,
    datetime: `${params.startDate}/${params.endDate}`,
    limit: params.limit ?? 16,
    sortby:
      params.sortDir === 'desc'
        ? [{ field: 'datetime', direction: 'desc' }]
        : [{ field: 'datetime', direction: 'asc' }],
  };
  if (!params.collections.includes('sentinel-1-rtc')) {
    stacReq.query = { 'eo:cloud_cover': { lte: params.maxCloud } };
  }

  const res = await fetch(`${PC_STAC_BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stacReq),
  });
  if (!res.ok) {
    throw new Error(`Căutarea STAC a eșuat (${res.status})`);
  }
  const stacRes = await res.json();
  const features = (stacRes.features || []) as Array<{
    id: string;
    collection?: string;
    bbox: [number, number, number, number];
    geometry: GeoJSON.Geometry;
    properties?: Record<string, unknown>;
    assets?: Record<string, { href?: string }>;
  }>;

  return features.map((f) => {
    const props = f.properties || {};
    const col = f.collection || params.collections[0];
    const query = buildPcTileQuery(col, col === 'landsat-c2-l1' ? 'cir' : 'natural');
    const previewUrl =
      f.assets?.rendered_preview?.href ||
      f.assets?.['vnir-browse']?.href ||
      f.assets?.thumbnail?.href ||
      null;
    const cloudVal = props['eo:cloud_cover'];

    return {
      id: f.id,
      collection: col,
      datetime: typeof props.datetime === 'string' ? props.datetime : '',
      platform: typeof props.platform === 'string' ? props.platform : col,
      cloudCover: typeof cloudVal === 'number' ? Math.round(cloudVal * 10) / 10 : null,
      bbox: f.bbox,
      geometry: f.geometry,
      previewUrl,
      tileJsonHref: f.assets?.tilejson?.href || null,
      tileUrl: `${PC_DATA_BASE_URL}/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=${encodeURIComponent(
        col
      )}&item=${encodeURIComponent(f.id)}&${query}`,
    };
  });
}

function bboxesIntersect(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export async function searchOamScenes(
  bbox: [number, number, number, number]
): Promise<{ total: number; items: OamScene[] }> {
  if (!oamSnapshotPromise) {
    oamSnapshotPromise = (async () => {
      const res = await fetch('./data/oam-romania.json');
      if (!res.ok) throw new Error(`Catalogul OpenAerialMap nu a putut fi încărcat (${res.status})`);
      const data = await res.json();
      return {
        total: Number(data.total || 0),
        items: (data.items || []) as OamScene[],
      };
    })();
    oamSnapshotPromise.catch(() => {
      oamSnapshotPromise = null;
    });
  }

  const snapshot = await oamSnapshotPromise;
  const matched = snapshot.items.filter(
    (item) => Array.isArray(item.bbox) && item.bbox.length === 4 && bboxesIntersect(item.bbox, bbox)
  );
  return {
    total: matched.length,
    items: matched.slice(0, 40),
  };
}

export async function geocodeRomania(q: string): Promise<GeocodeResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
    trimmed
  )}&bbox=20.26,43.62,29.72,48.27&limit=8`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const features = (data.features || []) as Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: {
      name?: string;
      city?: string;
      county?: string;
      state?: string;
      country?: string;
      countrycode?: string;
      osm_value?: string;
    };
  }>;

  const results: GeocodeResult[] = [];
  for (const f of features) {
    const coords = f.geometry?.coordinates;
    const props = f.properties || {};
    if (!coords || coords.length < 2) continue;
    const [lon, lat] = coords;
    const inRoBbox = lon >= 20.2 && lon <= 29.8 && lat >= 43.6 && lat <= 48.35;
    const isRoCountry =
      props.countrycode === 'RO' ||
      props.country === 'România' ||
      props.country === 'Romania';
    if (!isRoCountry && !inRoBbox) continue;

    const shortName = props.name || props.city || props.county || trimmed;
    const parts = [shortName, props.city && props.city !== shortName ? props.city : null, props.county, props.state, 'România'].filter(
      Boolean
    );
    results.push({
      shortName,
      name: Array.from(new Set(parts)).join(', '),
      lat,
      lon,
      type: props.osm_value || 'place',
    });
    if (results.length >= 6) break;
  }
  return results;
}
