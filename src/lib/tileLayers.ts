import L from 'leaflet';
import type { ImageryLayerSpec, SpectralMode } from '../types/satellite';

const MERCATOR_HALF_WORLD = 20037508.342789244;

const GLS_RASTER_FUNCTIONS: Record<SpectralMode, string> = {
  natural: 'Natural Color with DRA',
  cir: 'Color Infrared with DRA',
  swir: 'Short-wave Infrared with DRA',
  agriculture: 'Agriculture with DRA',
};

class LandsatGlsTileLayer extends L.TileLayer {
  private glsWhere: string;
  private rasterFunction: string;

  constructor(
    glsWhere: string,
    rasterFunction: string,
    options: L.TileLayerOptions
  ) {
    super('', options);
    this.glsWhere = glsWhere;
    this.rasterFunction = rasterFunction;
  }

  override getTileUrl(coords: L.Coords): string {
    const zoom = this._getZoomForUrl();
    const tilesPerAxis = Math.pow(2, zoom);
    const tileSpan = (MERCATOR_HALF_WORLD * 2) / tilesPerAxis;
    const minX = -MERCATOR_HALF_WORLD + coords.x * tileSpan;
    const maxX = -MERCATOR_HALF_WORLD + (coords.x + 1) * tileSpan;
    const maxY = MERCATOR_HALF_WORLD - coords.y * tileSpan;
    const minY = MERCATOR_HALF_WORLD - (coords.y + 1) * tileSpan;

    const mosaicRule = JSON.stringify({
      mosaicMethod: 'esriMosaicNorthwest',
      where: this.glsWhere,
    });
    const renderingRule = JSON.stringify({
      rasterFunction: this.rasterFunction,
    });

    const params = new URLSearchParams({
      bbox: `${minX.toFixed(2)},${minY.toFixed(2)},${maxX.toFixed(2)},${maxY.toFixed(2)}`,
      bboxSR: '3857',
      imageSR: '3857',
      size: '256,256',
      format: 'jpg',
      mosaicRule,
      renderingRule,
      f: 'image',
    });

    return `https://landsat.arcgis.com/arcgis/rest/services/LandsatGLS/MS/ImageServer/exportImage?${params.toString()}`;
  }
}

export function createLeafletLayer(
  spec: ImageryLayerSpec,
  resolvedTileUrl: string | null,
  spectralMode: SpectralMode,
  pane: string,
  onTileActivity?: (delta: number) => void
): L.Layer {
  let layer: L.Layer;

  if (spec.kind === 'landsat-gls') {
    const rf = GLS_RASTER_FUNCTIONS[spectralMode] || GLS_RASTER_FUNCTIONS.natural;
    layer = new LandsatGlsTileLayer(
      spec.glsWhere || 'Category = 1',
      rf,
      {
        pane,
        maxNativeZoom: spec.maxNativeZoom,
        maxZoom: spec.maxZoom,
        tileSize: 256,
        attribution: spec.attribution,
      }
    );
  } else if (spec.kind === 'wms-eharta') {
    layer = L.tileLayer.wms(spec.wmsUrl || 'https://services.geo-spatial.org/geoserver/eharta/wms', {
      layers: spec.wmsLayer || 'eharta:mozaic_planuri_tragere_20k',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      pane,
      maxNativeZoom: spec.maxNativeZoom,
      maxZoom: spec.maxZoom,
      attribution: spec.attribution,
    });
  } else {
    const url =
      resolvedTileUrl ||
      spec.tileUrl ||
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    layer = L.tileLayer(url, {
      pane,
      maxNativeZoom: spec.maxNativeZoom,
      maxZoom: spec.maxZoom,
      tileSize: 256,
      attribution: spec.attribution,
    });
  }

  if (onTileActivity && layer instanceof L.GridLayer) {
    layer.on('loading', () => onTileActivity(1));
    layer.on('load', () => onTileActivity(-1));
  }

  return layer;
}

export function createReferenceOverlayGroup(pane: string): L.LayerGroup {
  const boundaries = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {
      pane,
      maxNativeZoom: 18,
      maxZoom: 19,
      opacity: 0.96,
    }
  );
  return L.layerGroup([boundaries]);
}
