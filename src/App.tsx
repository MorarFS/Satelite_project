import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ArchiveDirectoryModal } from './components/ArchiveDirectoryModal';
import { LeftDrawer } from './components/LeftDrawer';
import { MapComparator } from './components/MapComparator';
import { TimelineDock } from './components/TimelineDock';
import { TopBar } from './components/TopBar';
import {
  CURRENT_PRESETS,
  FIFTY_YEAR_TRACK_IDS,
  HISTORICAL_PRESETS,
  TIMELAPSE_TRACKS,
  waybackReleaseToSpec,
} from './data/presets';
import {
  fetchWaybackChanges,
  fetchWaybackConfig,
  fetchWaybackMetadata,
  getWaybackTileKey,
} from './lib/api';
import type {
  ComparisonMode,
  ImageryLayerSpec,
  OamScene,
  RomaniaLandmark,
  SpectralMode,
  StacScene,
  TimelapseSpeed,
  TimelapseTrackId,
  WaybackMetadata,
  WaybackRelease,
} from './types/satellite';

function getInitialFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get('lat') || '44.4325');
  const lon = parseFloat(params.get('lon') || '26.0865');
  const zoom = parseInt(params.get('z') || '12', 10);
  const modeParam = params.get('mode') as ComparisonMode | null;
  const histId = params.get('hist') || 'gls-1975';
  const currId = params.get('curr') || 'esri-current';

  const hist = HISTORICAL_PRESETS.find((p) => p.id === histId) || HISTORICAL_PRESETS[1];
  const curr = CURRENT_PRESETS.find((p) => p.id === currId) || CURRENT_PRESETS[0];
  const mode: ComparisonMode =
    modeParam && ['split', 'side-by-side', 'spyglass', 'fade'].includes(modeParam)
      ? modeParam
      : 'split';

  return {
    center: [
      Number.isFinite(lat) ? lat : 44.4325,
      Number.isFinite(lon) ? lon : 26.0865,
    ] as [number, number],
    zoom: Number.isFinite(zoom) ? Math.max(6, Math.min(18, zoom)) : 12,
    mode,
    hist,
    curr,
  };
}

export function App() {
  const initRef = useRef(getInitialFromUrl());

  const [drawerOpen, setDrawerOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [searchActive, setSearchActive] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);

  const [historicalSpec, setHistoricalSpec] = useState<ImageryLayerSpec>(initRef.current.hist);
  const [currentSpec, setCurrentSpec] = useState<ImageryLayerSpec>(initRef.current.curr);
  const [spectralMode, setSpectralMode] = useState<SpectralMode>(
    initRef.current.hist.defaultSpectral || 'cir'
  );
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>(initRef.current.mode);

  const [splitPercent, setSplitPercent] = useState(50);
  const savedSplitRef = useRef(50);
  const [timelapseFullScreen, setTimelapseFullScreen] = useState(false);

  const [fadeOpacity, setFadeOpacity] = useState(0.95);
  const [blinkToCurrent, setBlinkToCurrent] = useState(false);
  const [spyglassRadius, setSpyglassRadius] = useState(150);

  const [showLabelsOverlay, setShowLabelsOverlay] = useState(true);
  const [showBorderOutline, setShowBorderOutline] = useState(true);

  const [center, setCenter] = useState<[number, number]>(initRef.current.center);
  const [zoom, setZoom] = useState<number>(initRef.current.zoom);
  const [viewportBbox, setViewportBbox] = useState<[number, number, number, number]>([
    25.8, 44.2, 26.4, 44.6,
  ]);
  const [flyTrigger, setFlyTrigger] = useState(0);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);

  const [waybackReleases, setWaybackReleases] = useState<WaybackRelease[]>([]);
  const [localWaybackChanges, setLocalWaybackChanges] = useState<WaybackRelease[] | null>(null);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const changesReqRef = useRef(0);
  const viewportRef = useRef({ center, zoom });
  viewportRef.current = { center, zoom };
  const waybackTileKey = getWaybackTileKey(center[0], center[1], zoom);

  const [historicalMeta, setHistoricalMeta] = useState<WaybackMetadata | null>(null);
  const [currentMeta, setCurrentMeta] = useState<WaybackMetadata | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState<string | null>(null);

  const [highlightedFootprint, setHighlightedFootprint] = useState<StacScene | OamScene | null>(null);
  const [activeLandmark, setActiveLandmark] = useState<RomaniaLandmark | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [timelapseTrack, setTimelapseTrack] = useState<TimelapseTrackId>('fifty-years');
  const [timelapseSpeed, setTimelapseSpeed] = useState<TimelapseSpeed>(1);
  const [readyFrameId, setReadyFrameId] = useState<string | null>(null);

  // Active sequence of frames for the selected timelapse track
  const activeSequence = useMemo<ImageryLayerSpec[]>(() => {
    if (timelapseTrack === 'fifty-years') {
      return FIFTY_YEAR_TRACK_IDS.map((id) => HISTORICAL_PRESETS.find((p) => p.id === id)).filter(
        (x): x is ImageryLayerSpec => Boolean(x)
      );
    }
    if (timelapseTrack === 'sentinel-annual') {
      return HISTORICAL_PRESETS.filter((p) => p.id.startsWith('eox-s2-'));
    }
    if (timelapseTrack === 'wayback-local') {
      if (localWaybackChanges && localWaybackChanges.length > 0) {
        return localWaybackChanges.map(waybackReleaseToSpec);
      }
      const fallback = HISTORICAL_PRESETS.find((p) => p.id === 'wayback-2014-02-20');
      return fallback ? [fallback] : HISTORICAL_PRESETS;
    }
    return HISTORICAL_PRESETS;
  }, [timelapseTrack, localWaybackChanges]);

  const activeSequenceIdx = useMemo(() => {
    const idx = activeSequence.findIndex((p) => p.id === historicalSpec.id);
    return idx;
  }, [activeSequence, historicalSpec.id]);

  const nextPreloadSpec = useMemo<ImageryLayerSpec | null>(() => {
    if (!isPlaying || activeSequence.length <= 1) return null;
    const idx = activeSequenceIdx >= 0 ? activeSequenceIdx : 0;
    return activeSequence[(idx + 1) % activeSequence.length];
  }, [isPlaying, activeSequence, activeSequenceIdx]);

  const nextPreloadSpectral = useMemo<SpectralMode | undefined>(() => {
    if (!nextPreloadSpec) return undefined;
    if (nextPreloadSpec.supportsSpectral) {
      return nextPreloadSpec.availableSpectral?.includes(spectralMode)
        ? spectralMode
        : nextPreloadSpec.defaultSpectral || 'natural';
    }
    return undefined;
  }, [nextPreloadSpec, spectralMode]);

  const selectHistoricalFrame = useCallback(
    (spec: ImageryLayerSpec) => {
      if (spec.supportsSpectral) {
        if (!spec.availableSpectral?.includes(spectralMode)) {
          setSpectralMode(spec.defaultSpectral || 'natural');
        } else if (spec.defaultSpectral && spec.id === 'gls-1975' && !isPlaying) {
          setSpectralMode(spec.defaultSpectral);
        }
      }
      setHistoricalSpec(spec);
    },
    [spectralMode, isPlaying]
  );

  // Load Esri Wayback config once
  useEffect(() => {
    fetchWaybackConfig()
      .then((list) => setWaybackReleases(list))
      .catch(() => {
        // Fallback silently; static presets still operate
      });
  }, []);

  // Auto-detect local Wayback changes when switching to 'wayback-local' track
  useEffect(() => {
    if (timelapseTrack !== 'wayback-local') return;
    if (localWaybackChanges) return;
    const reqId = ++changesReqRef.current;
    let cancelled = false;
    const { center: activeCenter, zoom: activeZoom } = viewportRef.current;
    setLoadingChanges(true);
    fetchWaybackChanges(activeCenter[0], activeCenter[1], activeZoom)
      .then((res) => {
        if (cancelled || reqId !== changesReqRef.current) return;
        setLocalWaybackChanges(res.changes);
        if (res.changes.length > 0) {
          setHistoricalSpec(waybackReleaseToSpec(res.changes[0]));
        }
      })
      .catch(() => {
        // Keep fallback frame
      })
      .finally(() => {
        if (reqId === changesReqRef.current) {
          setLoadingChanges(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [timelapseTrack, localWaybackChanges, waybackTileKey]);

  // Sync URL query params
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('lat', center[0].toFixed(4));
    params.set('lon', center[1].toFixed(4));
    params.set('z', String(zoom));
    params.set('mode', comparisonMode);
    params.set('hist', historicalSpec.id);
    params.set('curr', currentSpec.id);
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [center, zoom, comparisonMode, historicalSpec.id, currentSpec.id]);

  // Live capture metadata for Esri Wayback / Current pixels at map center
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentSpec.kind === 'esri-current' || currentSpec.kind === 'esri-wayback') {
        const rel = currentSpec.waybackReleaseNum || 'current';
        fetchWaybackMetadata(rel, center[0], center[1])
          .then(setCurrentMeta)
          .catch(() => setCurrentMeta(null));
      } else {
        setCurrentMeta(null);
      }

      if (historicalSpec.kind === 'esri-wayback' && historicalSpec.waybackReleaseNum) {
        fetchWaybackMetadata(historicalSpec.waybackReleaseNum, center[0], center[1])
          .then(setHistoricalMeta)
          .catch(() => setHistoricalMeta(null));
      } else {
        setHistoricalMeta(null);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [center, currentSpec, historicalSpec]);

  // Smooth Wait-for-Load Timelapse Scheduler
  useEffect(() => {
    if (!isPlaying || activeSequence.length <= 1) return;

    const currentIdx = activeSequence.findIndex((p) => p.id === historicalSpec.id);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % activeSequence.length : 0;
    const nextSpec = activeSequence[nextIdx];
    const dwellMs = timelapseSpeed === 2 ? 700 : timelapseSpeed === 0.5 ? 2600 : 1400;

    const advance = () => {
      selectHistoricalFrame(nextSpec);
    };

    const timers: number[] = [];
    if (readyFrameId === historicalSpec.id) {
      timers.push(window.setTimeout(advance, dwellMs));
    } else {
      // Safety cap so a slow remote tile never stalls playback indefinitely
      timers.push(window.setTimeout(advance, 5200));
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [isPlaying, activeSequence, historicalSpec.id, readyFrameId, timelapseSpeed, selectHistoricalFrame]);

  // Keyboard shortcuts: ArrowLeft / ArrowRight step active timeline; Space = blink
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        const idx = activeSequence.findIndex((p) => p.id === historicalSpec.id);
        const nextIdx = idx <= 0 ? activeSequence.length - 1 : idx - 1;
        if (activeSequence[nextIdx]) selectHistoricalFrame(activeSequence[nextIdx]);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        const idx = activeSequence.findIndex((p) => p.id === historicalSpec.id);
        const nextIdx = (idx + 1) % activeSequence.length;
        if (activeSequence[nextIdx]) selectHistoricalFrame(activeSequence[nextIdx]);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (comparisonMode === 'fade') {
          setBlinkToCurrent((v) => !v);
        } else if (comparisonMode === 'split') {
          setSplitPercent((p) => (p < 10 ? 50 : 5));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [comparisonMode, activeSequence, historicalSpec.id, selectHistoricalFrame]);

  const handleViewportChange = useCallback(
    (newCenter: [number, number], newZoom: number, bbox: [number, number, number, number]) => {
      setCenter(newCenter);
      setZoom(newZoom);
      setViewportBbox(bbox);
    },
    []
  );

  const handleSelectLocation = useCallback((lat: number, lon: number, targetZoom: number) => {
    setCenter([lat, lon]);
    setZoom(targetZoom);
    setFlyTrigger((t) => t + 1);
    setLocalWaybackChanges(null);
    setSearchActive(false);
    setDrawerOpen(true);
  }, []);

  const handleFlyToBbox = useCallback((bbox: [number, number, number, number]) => {
    const lon = (bbox[0] + bbox[2]) / 2;
    const lat = (bbox[1] + bbox[3]) / 2;
    const span = Math.max(Math.abs(bbox[2] - bbox[0]), Math.abs(bbox[3] - bbox[1]));
    const targetZoom = span > 2 ? 9 : span > 0.8 ? 11 : span > 0.2 ? 12 : 14;
    setCenter([lat, lon]);
    setZoom(targetZoom);
    setFlyTrigger((t) => t + 1);
  }, []);

  const handleSelectLandmark = useCallback((lm: RomaniaLandmark) => {
    setIsPlaying(false);
    setActiveLandmark(lm);
    const preset = HISTORICAL_PRESETS.find((p) => p.id === lm.recommendedPresetId);
    if (preset) {
      setHistoricalSpec(preset);
      if (lm.recommendedSpectral) {
        setSpectralMode(lm.recommendedSpectral);
      } else if (preset.defaultSpectral) {
        setSpectralMode(preset.defaultSpectral);
      }
    }
    setCenter([lm.lat, lm.lon]);
    setZoom(lm.zoom);
    setFlyTrigger((t) => t + 1);
    setLocalWaybackChanges(null);
  }, []);

  const handleDetectLocalWayback = async () => {
    const reqId = ++changesReqRef.current;
    setLoadingChanges(true);
    try {
      const res = await fetchWaybackChanges(center[0], center[1], zoom);
      if (reqId === changesReqRef.current) {
        setLocalWaybackChanges(res.changes);
      }
    } catch {
      // Ignore if endpoint is temporarily slow
    } finally {
      if (reqId === changesReqRef.current) {
        setLoadingChanges(false);
      }
    }
  };

  const handleHistoricalLoadState = useCallback((loading: boolean, error: string | null) => {
    setHistoricalLoading(loading);
    setHistoricalError(error);
  }, []);

  const handleHistoricalFrameReady = useCallback((specId: string) => {
    setReadyFrameId(specId);
  }, []);

  const handleTogglePlay = () => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next && activeSequence.length > 0 && activeSequenceIdx === -1) {
        const startFrame =
          activeSequence.find((s) => s.year >= historicalSpec.year) || activeSequence[0];
        selectHistoricalFrame(startFrame);
      }
      return next;
    });
  };

  const handleTimelapseTrackChange = (track: TimelapseTrackId) => {
    setTimelapseTrack(track);
    if (track === 'fifty-years') {
      const first = HISTORICAL_PRESETS.find((p) => p.id === FIFTY_YEAR_TRACK_IDS[0]);
      if (first) selectHistoricalFrame(first);
    } else if (track === 'sentinel-annual') {
      const firstS2 = HISTORICAL_PRESETS.find((p) => p.id.startsWith('eox-s2-'));
      if (firstS2) selectHistoricalFrame(firstS2);
    } else if (track === 'wayback-local') {
      if (localWaybackChanges && localWaybackChanges.length > 0) {
        selectHistoricalFrame(waybackReleaseToSpec(localWaybackChanges[0]));
      }
    } else if (track === 'all-presets') {
      selectHistoricalFrame(HISTORICAL_PRESETS[0]);
    }
  };

  const handleCycleSpeed = () => {
    setTimelapseSpeed((s) => (s === 1 ? 2 : s === 2 ? 0.5 : 1));
  };

  const handleToggleTimelapseFullScreen = () => {
    setTimelapseFullScreen((prev) => {
      if (!prev) {
        savedSplitRef.current = splitPercent;
        setSplitPercent(96);
        return true;
      }
      setSplitPercent(savedSplitRef.current < 90 ? savedSplitRef.current : 50);
      return false;
    });
  };

  const activeTrackMeta = TIMELAPSE_TRACKS.find((t) => t.id === timelapseTrack);
  const framePosition = activeSequenceIdx >= 0 ? activeSequenceIdx + 1 : 1;
  const progressPct =
    activeSequence.length > 0 ? Math.round((framePosition / activeSequence.length) * 100) : 100;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090d12] text-slate-100 select-none">
      {/* Fullscreen Map Comparator */}
      <MapComparator
        historicalSpec={historicalSpec}
        currentSpec={currentSpec}
        spectralMode={spectralMode}
        nextPreloadSpec={nextPreloadSpec}
        nextPreloadSpectral={nextPreloadSpectral}
        comparisonMode={comparisonMode}
        splitPercent={splitPercent}
        onSplitPercentChange={(pct) => {
          setSplitPercent(pct);
          if (timelapseFullScreen && pct < 90) {
            setTimelapseFullScreen(false);
          }
        }}
        fadeOpacity={fadeOpacity}
        blinkToCurrent={blinkToCurrent}
        spyglassRadius={spyglassRadius}
        showLabelsOverlay={showLabelsOverlay}
        showBorderOutline={showBorderOutline}
        center={center}
        zoom={zoom}
        flyTrigger={flyTrigger}
        onViewportChange={handleViewportChange}
        onCursorCoords={setCursorCoords}
        highlightedFootprint={highlightedFootprint}
        onHistoricalLoadStateChange={handleHistoricalLoadState}
        onHistoricalFrameReady={handleHistoricalFrameReady}
      />

      {/* Top Navigation & Mode Bar */}
      <TopBar
        drawerOpen={drawerOpen}
        onToggleDrawer={() => {
          setSearchActive(false);
          setDrawerOpen((v) => !v);
        }}
        onSearchActiveChange={setSearchActive}
        comparisonMode={comparisonMode}
        onComparisonModeChange={setComparisonMode}
        fadeOpacity={fadeOpacity}
        onFadeOpacityChange={setFadeOpacity}
        blinkToCurrent={blinkToCurrent}
        onToggleBlink={() => setBlinkToCurrent((v) => !v)}
        spyglassRadius={spyglassRadius}
        onSpyglassRadiusChange={setSpyglassRadius}
        showLabelsOverlay={showLabelsOverlay}
        onToggleLabelsOverlay={() => setShowLabelsOverlay((v) => !v)}
        showBorderOutline={showBorderOutline}
        onToggleBorderOutline={() => setShowBorderOutline((v) => !v)}
        onSelectLocation={handleSelectLocation}
        onOpenDirectory={() => setDirectoryOpen(true)}
      />

      {/* Cinematic Timelapse HUD Overlay */}
      {isPlaying && (
        <div className="pointer-events-none fixed top-[112px] left-1/2 -translate-x-1/2 z-[740] bg-[#0c1119]/90 border border-amber-400/45 backdrop-blur-xl rounded-2xl px-4 py-2 shadow-[0_12px_36px_rgba(0,0,0,0.6)] min-w-[240px] max-w-[90vw]">
          <div className="flex items-baseline justify-between gap-4">
            <div className="font-mono text-lg sm:text-xl font-bold text-amber-300 tracking-tight">
              {historicalSpec.shortLabel}
            </div>
            <div className="text-[11px] font-mono text-slate-300">
              {activeTrackMeta?.shortLabel} · {framePosition}/{activeSequence.length}
            </div>
          </div>
          <div className="text-[10px] text-slate-300 truncate mt-0.5">
            {historicalSpec.sensor}
          </div>
          <div className="mt-1.5 h-1 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-sky-400 transition-[width] duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Left Observatory Drawer */}
      <LeftDrawer
        open={drawerOpen && !searchActive}
        historicalSpec={historicalSpec}
        currentSpec={currentSpec}
        spectralMode={spectralMode}
        onSelectHistorical={(spec) => {
          setIsPlaying(false);
          setHistoricalSpec(spec);
        }}
        onSelectCurrent={setCurrentSpec}
        onSpectralModeChange={setSpectralMode}
        waybackReleases={waybackReleases}
        localWaybackChanges={localWaybackChanges}
        loadingChanges={loadingChanges}
        onDetectLocalWayback={handleDetectLocalWayback}
        viewportBbox={viewportBbox}
        onHighlightFootprint={setHighlightedFootprint}
        onSelectLandmark={handleSelectLandmark}
        onFlyToBbox={handleFlyToBbox}
      />

      {/* Active Landmark Story Callout */}
      {activeLandmark && (
        <div className="pointer-events-auto fixed top-[74px] right-14 z-[650] max-w-xs bg-[#0c1119]/92 border border-amber-500/35 backdrop-blur-xl rounded-2xl p-3 shadow-2xl hidden md:block">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
                {activeLandmark.spanLabel} · {activeLandmark.region}
              </div>
              <div className="text-xs font-semibold text-white mt-0.5">
                {activeLandmark.name}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveLandmark(null)}
              className="text-slate-400 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">
            {activeLandmark.summary}
          </p>
        </div>
      )}

      {/* Bottom Interactive Timeline & Telemetry */}
      <TimelineDock
        historicalSpec={historicalSpec}
        currentSpec={currentSpec}
        sequenceSpecs={activeSequence}
        onSelectHistorical={(spec) => {
          setIsPlaying(false);
          selectHistoricalFrame(spec);
        }}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        timelapseTrack={timelapseTrack}
        onTimelapseTrackChange={handleTimelapseTrackChange}
        timelapseSpeed={timelapseSpeed}
        onCycleSpeed={handleCycleSpeed}
        comparisonMode={comparisonMode}
        timelapseFullScreen={timelapseFullScreen}
        onToggleTimelapseFullScreen={handleToggleTimelapseFullScreen}
        loadingWaybackTrack={loadingChanges && timelapseTrack === 'wayback-local'}
        center={center}
        zoom={zoom}
        cursorCoords={cursorCoords}
        historicalLoading={historicalLoading}
        historicalError={historicalError}
        historicalMeta={historicalMeta}
        currentMeta={currentMeta}
      />

      {/* Full Archive Inventory & Pre-1972 Spy Satellite Vaults Modal */}
      <ArchiveDirectoryModal
        open={directoryOpen}
        onClose={() => setDirectoryOpen(false)}
        lat={center[0]}
        lon={center[1]}
        zoom={zoom}
      />
    </div>
  );
}

export default App;
