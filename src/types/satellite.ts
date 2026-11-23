export type ComparisonMode = 'split' | 'side-by-side' | 'spyglass' | 'fade';

export type SpectralMode = 'natural' | 'cir' | 'swir' | 'agriculture';

export type LayerKind =
  | 'landsat-gls'
  | 'pc-mosaic'
  | 'eox-s2'
  | 'esri-wayback'
  | 'esri-current'
  | 'nasa-gibs'
  | 'pc-item'
  | 'oam-tms'
  | 'wms-eharta';

export type EraGroup =
  | '1970s'
  | '1980s'
  | '1990s'
  | '2000s'
  | '2010s'
  | '2020s'
  | 'reference';

export interface ImageryLayerSpec {
  id: string;
  label: string;
  shortLabel: string;
  year: number;
  dateLabel: string;
  era: EraGroup;
  kind: LayerKind;
  sensor: string;
  resolutionLabel: string;
  sourceOrg: string;
  description: string;
  attribution: string;
  maxNativeZoom: number;
  maxZoom: number;
  supportsSpectral?: boolean;
  availableSpectral?: SpectralMode[];
  defaultSpectral?: SpectralMode;
  // Kind-specific fields
  tileUrl?: string;
  glsWhere?: string;
  pcCollection?: string;
  pcStartDate?: string;
  pcEndDate?: string;
  pcMaxCloud?: number;
  pcItemId?: string;
  gibsLayer?: string;
  gibsDate?: string;
  gibsMatrixSet?: string;
  gibsExt?: string;
  waybackReleaseNum?: string;
  waybackMetadataUrl?: string;
  wmsUrl?: string;
  wmsLayer?: string;
}

export interface WaybackRelease {
  releaseNum: string;
  date: string;
  title: string;
  tileUrl: string;
  metadataUrl: string;
}

export interface WaybackMetadata {
  releaseNum: string;
  releaseDate?: string;
  captureDate: string | null;
  resolutionM: number | null;
  provider: string | null;
  description: string | null;
}

export interface StacScene {
  id: string;
  collection: string;
  datetime: string;
  platform: string;
  cloudCover: number | null;
  bbox: [number, number, number, number];
  geometry: GeoJSON.Geometry;
  previewUrl: string | null;
  tileJsonHref: string | null;
  tileUrl: string;
}

export interface OamScene {
  id: string;
  title: string;
  date: string;
  gsdM: number | null;
  provider: string;
  bbox: [number, number, number, number];
  geojson: GeoJSON.Geometry;
  tmsUrl: string;
  thumbnail: string | null;
}

export interface RomaniaLandmark {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  zoom: number;
  recommendedPresetId: string;
  recommendedSpectral?: SpectralMode;
  spanLabel: string;
  summary: string;
  category: 'urban' | 'infrastructure' | 'ecology' | 'industry';
}

export interface GeocodeResult {
  name: string;
  shortName: string;
  lat: number;
  lon: number;
  type: string;
}

export type TimelapseTrackId =
  | 'fifty-years'
  | 'sentinel-annual'
  | 'wayback-local'
  | 'all-presets';

export type TimelapseSpeed = 0.5 | 1 | 2;

export interface TimelapseTrackSpec {
  id: TimelapseTrackId;
  label: string;
  shortLabel: string;
  description: string;
}
