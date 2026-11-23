import React, { useState } from 'react';
import {
  Calendar,
  ChevronUp,
  Compass,
  Database,
  Globe2,
  History,
  Layers,
  Loader2,
  MapPin,
  Radar,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  CURRENT_PRESETS,
  HISTORICAL_PRESETS,
  REFERENCE_PRE_SATELLITE_LAYERS,
  SPECTRAL_MODE_LABELS,
  waybackReleaseToSpec,
} from '../data/presets';
import { ROMANIA_LANDMARKS } from '../data/landmarks';
import { searchOamScenes, searchPcScenes } from '../lib/api';
import type {
  EraGroup,
  ImageryLayerSpec,
  OamScene,
  RomaniaLandmark,
  SpectralMode,
  StacScene,
  WaybackRelease,
} from '../types/satellite';

type DrawerTab = 'sources' | 'scenes' | 'landmarks';

interface LeftDrawerProps {
  open: boolean;
  onClose: () => void;
  historicalSpec: ImageryLayerSpec;
  currentSpec: ImageryLayerSpec;
  spectralMode: SpectralMode;
  onSelectHistorical: (spec: ImageryLayerSpec) => void;
  onSelectCurrent: (spec: ImageryLayerSpec) => void;
  onSpectralModeChange: (mode: SpectralMode) => void;
  waybackReleases: WaybackRelease[];
  localWaybackChanges: WaybackRelease[] | null;
  loadingChanges: boolean;
  onDetectLocalWayback: () => void;
  viewportBbox: [number, number, number, number];
  onHighlightFootprint: (scene: StacScene | OamScene | null) => void;
  onSelectLandmark: (landmark: RomaniaLandmark) => void;
  onFlyToBbox: (bbox: [number, number, number, number]) => void;
}

const ERA_ORDER: Array<{ id: EraGroup; label: string }> = [
  { id: '1970s', label: 'Anii 1970 · Primele Imagini Orbitale (60m)' },
  { id: '1980s', label: 'Anii 1980 · Thematic Mapper (30m)' },
  { id: '1990s', label: 'Anii 1990 · Tranziția Post-1989 (30m)' },
  { id: '2000s', label: 'Anii 2000 · Mileniu și Preaderare UE' },
  { id: '2010s', label: 'Anii 2010 · Sub-metric și Sentinel-2' },
  { id: '2020s', label: 'Anii 2020 · Mozaicuri Anuale Fără Nori' },
];

export const LeftDrawer: React.FC<LeftDrawerProps> = ({
  open,
  onClose,
  historicalSpec,
  currentSpec,
  spectralMode,
  onSelectHistorical,
  onSelectCurrent,
  onSpectralModeChange,
  waybackReleases,
  localWaybackChanges,
  loadingChanges,
  onDetectLocalWayback,
  viewportBbox,
  onHighlightFootprint,
  onSelectLandmark,
  onFlyToBbox,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('sources');

  // Mozaic personalizat Planetary Computer
  const [pcCollection, setPcCollection] = useState('landsat-c2-l2');
  const [pcYearFrom, setPcYearFrom] = useState(1987);
  const [pcYearTo, setPcYearTo] = useState(1989);
  const [pcCloud, setPcCloud] = useState(15);

  // Selector dată zilnică NASA GIBS
  const [gibsSensor, setGibsSensor] = useState('MODIS_Terra_CorrectedReflectance_TrueColor');
  const [gibsDate, setGibsDate] = useState('2003-08-12');

  // Comutator filtru Wayback
  const [showAllWayback, setShowAllWayback] = useState(false);

  // Căutare scene individuale (Scene Live)
  const [sceneDataset, setSceneDataset] = useState<string>('landsat-c2-l1');
  const [sceneScope, setSceneScope] = useState<'viewport' | 'romania'>('viewport');
  const [sceneStartYear, setSceneStartYear] = useState(1972);
  const [sceneEndYear, setSceneEndYear] = useState(1982);
  const [sceneMaxCloud, setSceneMaxCloud] = useState(20);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [stacResults, setStacResults] = useState<StacScene[]>([]);
  const [oamResults, setOamResults] = useState<OamScene[]>([]);
  const [oamTotal, setOamTotal] = useState<number | null>(null);

  // Filtru repere
  const [landmarkFilter, setLandmarkFilter] = useState<'all' | RomaniaLandmark['category']>('all');

  const handleBuildCustomMosaic = () => {
    const start = Math.min(pcYearFrom, pcYearTo);
    const end = Math.max(pcYearFrom, pcYearTo);
    const isMss = pcCollection === 'landsat-c2-l1';
    const isS2 = pcCollection === 'sentinel-2-l2a';
    const isSar = pcCollection === 'sentinel-1-rtc';

    const spec: ImageryLayerSpec = {
      id: `custom-pc-${pcCollection}-${start}-${end}-${pcCloud}`,
      label: `${start}–${end} · Mozaic Personalizat ${
        isMss
          ? 'Landsat MSS'
          : isS2
          ? 'Sentinel-2 L2A'
          : isSar
          ? 'Sentinel-1 Radar'
          : 'Landsat TM/OLI'
      }`,
      shortLabel: `${start}${start !== end ? `–${String(end).slice(2)}` : ''} Custom`,
      year: start,
      dateLabel: `${start}–${end}`,
      era:
        start < 1980
          ? '1970s'
          : start < 1990
          ? '1980s'
          : start < 2000
          ? '1990s'
          : start < 2010
          ? '2000s'
          : start < 2020
          ? '2010s'
          : '2020s',
      kind: 'pc-mosaic',
      pcCollection,
      pcStartDate: `${start}-04-01T00:00:00Z`,
      pcEndDate: `${end}-10-31T23:59:59Z`,
      pcMaxCloud: pcCloud,
      sensor: isMss
        ? 'Landsat 1–5 MSS'
        : isS2
        ? 'Sentinel-2 MSI'
        : isSar
        ? 'Sentinel-1 SAR Bandă C'
        : 'Landsat 4–9 L2',
      resolutionLabel: isMss ? '60 m / px' : isS2 || isSar ? '10 m / px' : '30 m / px',
      sourceOrg: 'Microsoft Planetary Computer TiTiler',
      description: `Mozaic național generat dinamic pentru România (${start}–${end}, max. ${pcCloud}% nori).`,
      attribution: `${pcCollection} prin Microsoft Planetary Computer`,
      maxNativeZoom: isMss ? 12 : isS2 || isSar ? 14 : 13,
      maxZoom: 19,
      supportsSpectral: !isSar,
      availableSpectral: isMss
        ? ['cir', 'natural']
        : isSar
        ? undefined
        : ['natural', 'cir', 'swir', 'agriculture'],
      defaultSpectral: isMss ? 'cir' : 'natural',
    };
    if (isMss && spectralMode !== 'cir' && spectralMode !== 'natural') {
      onSpectralModeChange('cir');
    }
    onSelectHistorical(spec);
  };

  const handleLoadGibs = () => {
    const isHls = gibsSensor === 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance';
    const year = parseInt(gibsDate.slice(0, 4), 10) || 2003;
    const spec: ImageryLayerSpec = {
      id: `gibs-${gibsSensor}-${gibsDate}`,
      label: `${gibsDate} · NASA ${
        isHls
          ? 'HLS Landsat 30m'
          : gibsSensor.includes('VIIRS')
          ? 'VIIRS'
          : gibsSensor.includes('Aqua')
          ? 'MODIS Aqua'
          : 'MODIS Terra'
      }`,
      shortLabel: gibsDate,
      year,
      dateLabel: gibsDate,
      era: year < 2010 ? '2000s' : year < 2020 ? '2010s' : '2020s',
      kind: 'nasa-gibs',
      gibsLayer: gibsSensor,
      gibsDate,
      gibsMatrixSet: isHls ? 'GoogleMapsCompatible_Level12' : 'GoogleMapsCompatible_Level9',
      gibsExt: isHls ? 'png' : 'jpg',
      sensor: isHls ? 'NASA Harmonized Landsat (HLS)' : 'NASA EOSDIS Reflectanță Zilnică',
      resolutionLabel: isHls ? '30 m / px' : '250 m / px',
      sourceOrg: 'NASA GIBS',
      description: `Data calendaristică exactă ${gibsDate} din arhiva NASA GIBS.`,
      attribution: 'NASA EOSDIS GIBS',
      maxNativeZoom: isHls ? 12 : 9,
      maxZoom: 19,
      supportsSpectral: false,
    };
    onSelectHistorical(spec);
  };

  const handleSelectWayback = (rel: WaybackRelease) => {
    onSelectHistorical(waybackReleaseToSpec(rel));
  };

  const handleDatasetPresetSwitch = (col: string) => {
    setSceneDataset(col);
    if (col === 'landsat-c2-l1') {
      setSceneStartYear(1972);
      setSceneEndYear(1982);
    } else if (col === 'landsat-c2-l2') {
      setSceneStartYear(1984);
      setSceneEndYear(1999);
    } else if (col === 'aster-l1t') {
      setSceneStartYear(2000);
      setSceneEndYear(2009);
    } else if (col === 'sentinel-2-l2a') {
      setSceneStartYear(2016);
      setSceneEndYear(2026);
    } else if (col === 'sentinel-1-rtc') {
      setSceneStartYear(2024);
      setSceneEndYear(2026);
    }
  };

  const handleSearchScenes = async () => {
    setSceneLoading(true);
    setSceneError(null);
    onHighlightFootprint(null);
    const bbox: [number, number, number, number] =
      sceneScope === 'romania' ? [20.26, 43.62, 29.72, 48.27] : viewportBbox;

    try {
      if (sceneDataset === 'oam') {
        setStacResults([]);
        const res = await searchOamScenes(bbox);
        setOamResults(res.items);
        setOamTotal(res.total);
      } else {
        setOamResults([]);
        setOamTotal(null);
        const start = Math.min(sceneStartYear, sceneEndYear);
        const end = Math.max(sceneStartYear, sceneEndYear);
        const items = await searchPcScenes({
          collections: [sceneDataset],
          bbox,
          startDate: `${start}-01-01T00:00:00Z`,
          endDate: `${end}-12-31T23:59:59Z`,
          maxCloud: sceneMaxCloud,
          limit: 16,
          sortDir: start >= 2020 ? 'desc' : 'asc',
        });
        setStacResults(items);
      }
    } catch (err) {
      setSceneError(err instanceof Error ? err.message : 'Căutarea a eșuat');
    } finally {
      setSceneLoading(false);
    }
  };

  const loadStacScene = (scene: StacScene, side: 'historical' | 'current') => {
    const dt = scene.datetime.slice(0, 10);
    const year = parseInt(dt.slice(0, 4), 10) || 1972;
    const isMss = scene.collection === 'landsat-c2-l1';
    const isAster = scene.collection === 'aster-l1t';
    const isSar = scene.collection === 'sentinel-1-rtc';
    const isS2 = scene.collection === 'sentinel-2-l2a';

    const spec: ImageryLayerSpec = {
      id: `pc-item-${scene.id}`,
      label: `${dt} · ${scene.platform.toUpperCase()} (${scene.id.slice(0, 16)})`,
      shortLabel: `Pasaj ${dt}`,
      year,
      dateLabel: dt,
      era:
        year < 1980
          ? '1970s'
          : year < 1990
          ? '1980s'
          : year < 2000
          ? '1990s'
          : year < 2010
          ? '2000s'
          : year < 2020
          ? '2010s'
          : '2020s',
      kind: 'pc-item',
      pcCollection: scene.collection,
      pcItemId: scene.id,
      sensor: `${scene.platform} (${scene.collection})`,
      resolutionLabel: isMss
        ? '60 m / px'
        : isAster
        ? '15 m / px'
        : isS2 || isSar
        ? '10 m / px'
        : '30 m / px',
      sourceOrg: 'Microsoft Planetary Computer STAC',
      description: `Pasaj individual ${scene.id} achiziționat la ${scene.datetime}${
        scene.cloudCover !== null ? ` (${scene.cloudCover}% nori)` : ''
      }.`,
      attribution: `${scene.collection} prin Planetary Computer`,
      maxNativeZoom: isMss ? 12 : isS2 || isSar || isAster ? 14 : 13,
      maxZoom: 19,
      supportsSpectral: !isAster && !isSar,
      availableSpectral: isMss
        ? ['cir', 'natural']
        : isAster || isSar
        ? undefined
        : ['natural', 'cir', 'swir', 'agriculture'],
      defaultSpectral: isMss ? 'cir' : 'natural',
    };

    if (side === 'historical') {
      if (isMss && spectralMode !== 'cir' && spectralMode !== 'natural') {
        onSpectralModeChange('cir');
      }
      onSelectHistorical(spec);
    } else {
      onSelectCurrent(spec);
    }
    if (scene.bbox && scene.bbox.length === 4) {
      onFlyToBbox(scene.bbox);
    }
  };

  const loadOamScene = (scene: OamScene, side: 'historical' | 'current') => {
    const year = parseInt(scene.date.slice(0, 4), 10) || 2023;
    const spec: ImageryLayerSpec = {
      id: `oam-${scene.id}`,
      label: `${scene.date || 'OAM'} · ${scene.title}`,
      shortLabel: scene.title.slice(0, 14),
      year,
      dateLabel: scene.date || 'OpenAerialMap',
      era: year < 2020 ? '2010s' : '2020s',
      kind: 'oam-tms',
      tileUrl: scene.tmsUrl,
      sensor: `Ortofotoplan Dronă / Aerian (${scene.provider})`,
      resolutionLabel: scene.gsdM ? `${Math.round(scene.gsdM * 100)} cm / px` : 'Rezoluție Ultra-Înaltă',
      sourceOrg: 'OpenAerialMap',
      description: `${scene.title} (${scene.date}) · ${scene.provider}`,
      attribution: `OpenAerialMap / ${scene.provider}`,
      maxNativeZoom: 20,
      maxZoom: 21,
      supportsSpectral: false,
    };
    if (side === 'historical') onSelectHistorical(spec);
    else onSelectCurrent(spec);
    if (scene.bbox && scene.bbox.length === 4) {
      onFlyToBbox(scene.bbox);
    }
  };

  const waybackDisplayList = showAllWayback
    ? [...waybackReleases].reverse()
    : localWaybackChanges
    ? [...localWaybackChanges].reverse()
    : [...waybackReleases]
        .filter((_, idx) => idx % 10 === 0 || idx === 0 || idx === waybackReleases.length - 1)
        .reverse();

  const filteredLandmarks =
    landmarkFilter === 'all'
      ? ROMANIA_LANDMARKS
      : ROMANIA_LANDMARKS.filter((l) => l.category === landmarkFilter);

  return (
    <aside
      data-open={open}
      aria-hidden={!open}
      className="fixed top-[4.625rem] left-3 bottom-[7.375rem] w-[23.5rem] max-w-[92vw] z-[750] flex flex-col obs-panel obs-drawer rounded-[1.125rem] overflow-hidden"
    >
      {/* Antet compact panou */}
      <div className="select-none flex items-center justify-between px-3.5 py-2 border-b border-white/10 bg-black/35 shrink-0">
        <span className="font-[var(--font-display)] text-[0.8125rem] font-semibold tracking-[-0.01em] text-slate-100">
          Observator & Arhive
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Restrânge panoul"
          aria-label="Restrânge panoul"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[0.6875rem] font-medium text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          <span>Ascunde</span>
        </button>
      </div>

      {/* File */}
      <div className="select-none grid grid-cols-3 border-b border-white/10 bg-black/25 p-1.5 gap-1 shrink-0">
        {[
          { id: 'sources' as const, label: 'Arhive', icon: <History className="w-3.5 h-3.5" /> },
          { id: 'scenes' as const, label: 'Scene Live', icon: <Database className="w-3.5 h-3.5" /> },
          { id: 'landmarks' as const, label: 'Repere', icon: <Compass className="w-3.5 h-3.5" /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-amber-400 ${
              activeTab === t.id
                ? 'obs-active-gradient text-white border border-white/20 shadow-sm'
                : 'text-slate-300/85 hover:text-white hover:bg-white/6 border border-transparent'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Conținut derulabil */}
      <div className="flex-1 overflow-y-auto obs-scroll p-3.5 space-y-4">
        {activeTab === 'sources' && (
          <>
            {/* Referința actuală (Dreapta) */}
            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-sky-300">
                  Partea Dreaptă · Harta Satelitară Actuală
                </span>
              </div>
              <select
                aria-label="Harta Satelitară Actuală"
                value={currentSpec.id}
                onChange={(e) => {
                  const found = CURRENT_PRESETS.find((c) => c.id === e.target.value);
                  if (found) onSelectCurrent(found);
                }}
                className="obs-select w-full border-sky-400/35"
              >
                {CURRENT_PRESETS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                {!CURRENT_PRESETS.some((c) => c.id === currentSpec.id) && (
                  <option value={currentSpec.id}>
                    {currentSpec.label}
                  </option>
                )}
              </select>
            </section>

            {/* Selector benzi spectrale */}
            {historicalSpec.supportsSpectral && historicalSpec.availableSpectral && (
              <section className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/25 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Combinație Benzi Spectrale
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {historicalSpec.availableSpectral.map((mode) => {
                    const meta = SPECTRAL_MODE_LABELS[mode];
                    const active = spectralMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        title={meta.description}
                        onClick={() => onSpectralModeChange(mode)}
                        className={`px-2.5 py-2 rounded-lg text-left border transition-colors ${
                          active
                            ? 'bg-amber-500/25 border-amber-400/70 text-amber-100'
                            : 'bg-black/35 border-white/10 text-slate-300 hover:text-white hover:bg-white/6'
                        }`}
                      >
                        <div className="text-xs font-semibold leading-snug">{meta.short}</div>
                        <div className="text-[0.6875rem] opacity-85 truncate leading-snug">{meta.label}</div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Catalog pe decenii */}
            <section className="space-y-3">
              <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-amber-300">
                Partea Stângă · Arhive Istorice (1972–2025)
              </div>

              {ERA_ORDER.map((era) => {
                const items = HISTORICAL_PRESETS.filter((p) => p.era === era.id);
                if (items.length === 0) return null;
                return (
                  <div key={era.id} className="space-y-1.5">
                    <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5 leading-snug">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400/90" />
                      <span>{era.label}</span>
                    </div>
                    <div className="space-y-1.5">
                      {items.map((preset) => {
                        const active = historicalSpec.id === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              if (preset.defaultSpectral && preset.supportsSpectral) {
                                onSpectralModeChange(preset.defaultSpectral);
                              }
                              onSelectHistorical(preset);
                            }}
                            className={`relative w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 overflow-hidden ${
                              active
                                ? 'bg-amber-500/18 border-amber-400/70 text-white shadow-[0_0_20px_rgba(245,158,11,0.14)]'
                                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/9 hover:border-white/18'
                            }`}
                          >
                            {active && (
                              <span
                                aria-hidden="true"
                                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-amber-400"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="text-[0.8125rem] font-medium truncate leading-snug">
                                {preset.label}
                              </div>
                              <div className="text-[0.6875rem] text-slate-300/85 truncate leading-snug mt-0.5">
                                {preset.sensor}
                              </div>
                            </div>
                            <span className="shrink-0 text-[0.6875rem] font-mono tabular-nums px-1.5 py-0.5 rounded-md bg-black/45 border border-white/12 text-amber-300">
                              {preset.resolutionLabel.replace(' / px', '')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Detector schimbări locale Esri Wayback */}
            <section className="p-3 rounded-xl bg-white/5 border border-white/12 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-[var(--font-display)] text-[0.8125rem] font-semibold text-white leading-snug">
                    Esri Wayback Sub-metric ({waybackReleases.length || 199})
                  </div>
                  <div className="text-[0.6875rem] text-slate-300 leading-snug">
                    Ediții la 0,3–0,6 m (2014–2026)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onDetectLocalWayback}
                  disabled={loadingChanges}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-xs font-medium text-amber-100 flex items-center gap-1.5 disabled:opacity-60 transition-colors"
                >
                  {loadingChanges ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Schimbări Locale</span>
                </button>
              </div>

              {localWaybackChanges && (
                <div className="flex items-center justify-between text-xs text-emerald-200 bg-emerald-500/12 border border-emerald-500/30 rounded-lg px-2.5 py-1.5">
                  <span>
                    S-au găsit <strong className="tabular-nums">{localWaybackChanges.length}</strong> capturi unice în centru
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllWayback((v) => !v)}
                    className="underline text-slate-200 hover:text-white"
                  >
                    {showAllWayback ? 'Doar locale' : 'Arată toate'}
                  </button>
                </div>
              )}

              <div className="max-h-44 overflow-y-auto obs-scroll space-y-1 pr-1">
                {waybackDisplayList.map((rel) => {
                  const active = historicalSpec.id === `wayback-${rel.releaseNum}`;
                  return (
                    <button
                      key={rel.releaseNum}
                      type="button"
                      onClick={() => handleSelectWayback(rel)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs border flex items-center justify-between transition-colors ${
                        active
                          ? 'bg-amber-500/22 border-amber-400/65 text-white'
                          : 'bg-black/30 border-white/8 text-slate-200 hover:bg-white/8'
                      }`}
                    >
                      <span className="font-mono tabular-nums">{rel.date}</span>
                      <span className="text-[0.6875rem] font-mono tabular-nums text-slate-300">
                        #{rel.releaseNum}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Constructor mozaic personalizat */}
            <section className="p-3 rounded-xl bg-white/5 border border-white/12 space-y-2.5">
              <div className="font-[var(--font-display)] text-[0.8125rem] font-semibold text-white flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Mozaic Personalizat România (1972–2026)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="col-span-2 space-y-1">
                  <span className="text-[0.6875rem] text-slate-300">Colecție</span>
                  <select
                    value={pcCollection}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPcCollection(v);
                      if (v === 'landsat-c2-l1') {
                        setPcYearFrom(1972);
                        setPcYearTo(1977);
                      } else if (v === 'landsat-c2-l2') {
                        setPcYearFrom(1986);
                        setPcYearTo(1989);
                      } else if (v === 'sentinel-2-l2a') {
                        setPcYearFrom(2020);
                        setPcYearTo(2021);
                      } else {
                        setPcYearFrom(2024);
                        setPcYearTo(2025);
                      }
                    }}
                    className="obs-select w-full"
                  >
                    <option value="landsat-c2-l1">Landsat 1–5 MSS (1972–2013, 60m)</option>
                    <option value="landsat-c2-l2">Landsat 4–9 L2 (1982–2026, 30m)</option>
                    <option value="sentinel-2-l2a">Sentinel-2 L2A (2015–2026, 10m)</option>
                    <option value="sentinel-1-rtc">Sentinel-1 Radar SAR (2014–2026)</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[0.6875rem] text-slate-300">Din anul</span>
                  <input
                    type="number"
                    min={1972}
                    max={2026}
                    value={pcYearFrom}
                    onChange={(e) => setPcYearFrom(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#101724] border border-white/14 text-slate-100 font-mono tabular-nums focus:outline-none focus:border-amber-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[0.6875rem] text-slate-300">Până în anul</span>
                  <input
                    type="number"
                    min={1972}
                    max={2026}
                    value={pcYearTo}
                    onChange={(e) => setPcYearTo(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#101724] border border-white/14 text-slate-100 font-mono tabular-nums focus:outline-none focus:border-amber-400"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-200">
                <span className="tabular-nums">Acoperire nori max.: {pcCloud}%</span>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={pcCloud}
                  onChange={(e) => setPcCloud(Number(e.target.value))}
                  className="w-28 accent-amber-400 cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={handleBuildCustomMosaic}
                className="w-full py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-xs font-semibold text-amber-100 transition-colors"
              >
                Generează Mozaic Național
              </button>
            </section>

            {/* Selector dată exactă NASA GIBS */}
            <section className="p-3 rounded-xl bg-white/5 border border-white/12 space-y-2.5">
              <div className="font-[var(--font-display)] text-[0.8125rem] font-semibold text-white flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Satelit Zilnic NASA GIBS (2000–2026)</span>
              </div>
              <select
                aria-label="Senzor NASA GIBS"
                value={gibsSensor}
                onChange={(e) => setGibsSensor(e.target.value)}
                className="obs-select w-full"
              >
                <option value="MODIS_Terra_CorrectedReflectance_TrueColor">
                  MODIS Terra Zilnic (24 feb. 2000 → Prezent, 250m)
                </option>
                <option value="MODIS_Aqua_CorrectedReflectance_TrueColor">
                  MODIS Aqua Zilnic (4 iul. 2002 → Prezent, 250m)
                </option>
                <option value="VIIRS_SNPP_CorrectedReflectance_TrueColor">
                  VIIRS SNPP Zilnic (24 noi. 2015 → Prezent, 250m)
                </option>
                <option value="HLS_L30_Nadir_BRDF_Adjusted_Reflectance">
                  Landsat Armonizat HLS L30 (2013 → Prezent, 30m)
                </option>
              </select>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  min="2000-02-24"
                  max="2026-11-23"
                  value={gibsDate}
                  onChange={(e) => setGibsDate(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#101724] border border-white/14 text-xs text-slate-100 font-mono tabular-nums focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={handleLoadGibs}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-xs font-medium text-amber-100 transition-colors"
                >
                  Încarcă Data
                </button>
              </div>
            </section>

            {/* Context topografic pre-satelit */}
            <section className="p-3 rounded-xl bg-white/4 border border-white/10 space-y-2">
              <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-slate-300">
                Context Topografic Pre-Satelitar (geo-spatial.org)
              </div>
              <div className="space-y-1.5">
                {REFERENCE_PRE_SATELLITE_LAYERS.map((refLayer) => {
                  const active = historicalSpec.id === refLayer.id;
                  return (
                    <button
                      key={refLayer.id}
                      type="button"
                      onClick={() => onSelectHistorical(refLayer)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-colors ${
                        active
                          ? 'bg-amber-500/22 border-amber-400/65 text-white'
                          : 'bg-black/30 border-white/10 text-slate-200 hover:bg-white/8'
                      }`}
                    >
                      {refLayer.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {activeTab === 'scenes' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-200/90 leading-[1.45] text-pretty">
              Caută treceri satelitare individuale din catalogul Microsoft Planetary Computer STAC
              și OpenAerialMap România. Treceți cu mouse-ul peste un rezultat pentru a-i vedea amprenta pe hartă.
            </p>

            <div className="p-3 rounded-xl bg-white/5 border border-white/12 space-y-2.5">
              <label className="block space-y-1">
                <span className="text-[0.6875rem] text-slate-300 uppercase tracking-[0.06em] font-semibold">
                  Colecție Arhivă
                </span>
                <select
                  value={sceneDataset}
                  onChange={(e) => handleDatasetPresetSwitch(e.target.value)}
                  className="obs-select w-full"
                >
                  <option value="landsat-c2-l1">Landsat 1–5 MSS (1972–2013, 60m)</option>
                  <option value="landsat-c2-l2">Landsat 4–9 L2 (1982–2026, 30m)</option>
                  <option value="aster-l1t">Terra ASTER VNIR (2000–2026, 15m)</option>
                  <option value="sentinel-2-l2a">Sentinel-2 L2A (2015–2026, 10m)</option>
                  <option value="sentinel-1-rtc">Sentinel-1 Radar SAR (2014–2026, 10m)</option>
                  <option value="oam">OpenAerialMap Ortofotoplanuri (1–15cm)</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSceneScope('viewport')}
                  className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    sceneScope === 'viewport'
                      ? 'bg-amber-500/22 border-amber-400/65 text-amber-100'
                      : 'bg-black/35 border-white/12 text-slate-300 hover:text-white'
                  }`}
                >
                  Zona Vizibilă
                </button>
                <button
                  type="button"
                  onClick={() => setSceneScope('romania')}
                  className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    sceneScope === 'romania'
                      ? 'bg-amber-500/22 border-amber-400/65 text-amber-100'
                      : 'bg-black/35 border-white/12 text-slate-300 hover:text-white'
                  }`}
                >
                  Toată România
                </button>
              </div>

              {sceneDataset !== 'oam' && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="space-y-1">
                      <span className="text-[0.6875rem] text-slate-300">Din anul</span>
                      <input
                        type="number"
                        min={1972}
                        max={2026}
                        value={sceneStartYear}
                        onChange={(e) => setSceneStartYear(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#101724] border border-white/14 text-slate-100 font-mono tabular-nums focus:outline-none focus:border-amber-400"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[0.6875rem] text-slate-300">Până în anul</span>
                      <input
                        type="number"
                        min={1972}
                        max={2026}
                        value={sceneEndYear}
                        onChange={(e) => setSceneEndYear(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#101724] border border-white/14 text-slate-100 font-mono tabular-nums focus:outline-none focus:border-amber-400"
                      />
                    </label>
                  </div>
                  {sceneDataset !== 'sentinel-1-rtc' && (
                    <div className="flex items-center justify-between text-xs text-slate-200">
                      <span className="tabular-nums">Acoperire nori max.: {sceneMaxCloud}%</span>
                      <input
                        type="range"
                        min={5}
                        max={60}
                        step={5}
                        value={sceneMaxCloud}
                        onChange={(e) => setSceneMaxCloud(Number(e.target.value))}
                        className="w-28 accent-amber-400 cursor-pointer"
                      />
                    </div>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={handleSearchScenes}
                disabled={sceneLoading}
                className="w-full py-2 rounded-xl bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/60 text-xs font-semibold text-amber-100 flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
              >
                {sceneLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Se interoghează arhiva...</span>
                  </>
                ) : (
                  <>
                    <Globe2 className="w-3.5 h-3.5" />
                    <span>Caută Pasaje Live</span>
                  </>
                )}
              </button>
            </div>

            {sceneError && (
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200">
                {sceneError}
              </div>
            )}

            {stacResults.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-300 tabular-nums">
                  S-au găsit {stacResults.length} scene satelitare
                </div>
                {stacResults.map((sc) => (
                  <div
                    key={sc.id}
                    onMouseEnter={() => onHighlightFootprint(sc)}
                    onMouseLeave={() => onHighlightFootprint(null)}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/9 border border-white/12 hover:border-amber-400/50 transition-colors space-y-2"
                  >
                    <div className="flex gap-2.5">
                      {sc.previewUrl ? (
                        <img
                          src={sc.previewUrl}
                          alt={sc.id}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          className="w-14 h-14 rounded-lg object-cover bg-black/50 shrink-0 border border-white/12"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-black/40 border border-white/12 flex items-center justify-center shrink-0 text-slate-400">
                          <Radar className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-white font-mono tabular-nums leading-snug">
                          {sc.datetime.slice(0, 10)}
                        </div>
                        <div className="text-xs text-amber-300 truncate leading-snug">{sc.platform}</div>
                        <div className="text-[0.6875rem] text-slate-300/85 truncate font-mono leading-snug">
                          {sc.id}
                        </div>
                        {sc.cloudCover !== null && (
                          <div className="text-[0.6875rem] text-slate-300/85 tabular-nums leading-snug">
                            Acoperire nori: {sc.cloudCover}%
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => loadStacScene(sc, 'historical')}
                        className="py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-xs font-medium text-amber-100 transition-colors"
                      >
                        Încarcă Stânga (Istoric)
                      </button>
                      <button
                        type="button"
                        onClick={() => loadStacScene(sc, 'current')}
                        className="py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-xs font-medium text-sky-100 transition-colors"
                      >
                        Încarcă Dreapta (Actual)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {oamResults.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-300 tabular-nums">
                  OpenAerialMap: {oamResults.length} afișate ({oamTotal ?? oamResults.length} total în zonă)
                </div>
                {oamResults.map((sc) => (
                  <div
                    key={sc.id}
                    onMouseEnter={() => onHighlightFootprint(sc)}
                    onMouseLeave={() => onHighlightFootprint(null)}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/9 border border-white/12 hover:border-amber-400/50 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate leading-snug">
                          {sc.title}
                        </div>
                        <div className="text-[0.6875rem] text-slate-300 leading-snug">
                          {sc.date || 'Fără dată'} · {sc.provider}
                        </div>
                      </div>
                      {sc.gsdM !== null && (
                        <span className="shrink-0 text-[0.6875rem] font-mono tabular-nums px-1.5 py-0.5 rounded bg-emerald-500/18 border border-emerald-500/35 text-emerald-200">
                          {Math.round(sc.gsdM * 100)} cm
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => loadOamScene(sc, 'historical')}
                        className="py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-xs font-medium text-amber-100 transition-colors"
                      >
                        Încarcă Stânga
                      </button>
                      <button
                        type="button"
                        onClick={() => loadOamScene(sc, 'current')}
                        className="py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-xs font-medium text-sky-100 transition-colors"
                      >
                        Încarcă Dreapta
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'landmarks' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'Toate (12)' },
                  { id: 'urban', label: 'Urban' },
                  { id: 'infrastructure', label: 'Infrastructură' },
                  { id: 'ecology', label: 'Ecologie' },
                  { id: 'industry', label: 'Industrie' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setLandmarkFilter(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    landmarkFilter === cat.id
                      ? 'bg-amber-500/22 border-amber-400/65 text-amber-100'
                      : 'bg-white/6 border-white/12 text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredLandmarks.map((lm) => (
                <button
                  key={lm.id}
                  type="button"
                  onClick={() => onSelectLandmark(lm)}
                  className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/9 border border-white/12 hover:border-amber-400/55 transition-all space-y-1.5 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-[var(--font-display)] text-[0.8125rem] font-semibold text-white group-hover:text-amber-200 transition-colors flex items-center gap-1.5 leading-snug">
                      <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{lm.name}</span>
                    </div>
                    <span className="shrink-0 text-[0.6875rem] font-mono tabular-nums px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-200">
                      {lm.spanLabel}
                    </span>
                  </div>
                  <div className="text-[0.6875rem] uppercase tracking-[0.05em] text-sky-300 font-medium">
                    {lm.region}
                  </div>
                  <p className="text-xs text-slate-200/90 leading-[1.45] text-pretty">{lm.summary}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
