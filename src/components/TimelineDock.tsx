import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
} from 'lucide-react';
import { TIMELAPSE_TRACKS } from '../data/presets';
import type {
  ComparisonMode,
  ImageryLayerSpec,
  TimelapseSpeed,
  TimelapseTrackId,
  WaybackMetadata,
} from '../types/satellite';

interface TimelineDockProps {
  historicalSpec: ImageryLayerSpec;
  currentSpec: ImageryLayerSpec;
  sequenceSpecs: ImageryLayerSpec[];
  onSelectHistorical: (spec: ImageryLayerSpec) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  timelapseTrack: TimelapseTrackId;
  onTimelapseTrackChange: (track: TimelapseTrackId) => void;
  timelapseSpeed: TimelapseSpeed;
  onCycleSpeed: () => void;
  comparisonMode: ComparisonMode;
  timelapseFullScreen: boolean;
  onToggleTimelapseFullScreen: () => void;
  loadingWaybackTrack: boolean;
  center: [number, number];
  zoom: number;
  cursorCoords: { lat: number; lon: number } | null;
  historicalLoading: boolean;
  historicalError: string | null;
  historicalMeta: WaybackMetadata | null;
  currentMeta: WaybackMetadata | null;
}

export const TimelineDock: React.FC<TimelineDockProps> = ({
  historicalSpec,
  currentSpec,
  sequenceSpecs,
  onSelectHistorical,
  isPlaying,
  onTogglePlay,
  timelapseTrack,
  onTimelapseTrackChange,
  timelapseSpeed,
  onCycleSpeed,
  comparisonMode,
  timelapseFullScreen,
  onToggleTimelapseFullScreen,
  loadingWaybackTrack,
  center,
  zoom,
  cursorCoords,
  historicalLoading,
  historicalError,
  historicalMeta,
  currentMeta,
}) => {
  const currentIdx = sequenceSpecs.findIndex((p) => p.id === historicalSpec.id);

  const stepPreset = (dir: -1 | 1) => {
    if (sequenceSpecs.length === 0) return;
    if (currentIdx === -1) {
      onSelectHistorical(sequenceSpecs[dir > 0 ? 0 : sequenceSpecs.length - 1]);
      return;
    }
    const nextIdx = (currentIdx + dir + sequenceSpecs.length) % sequenceSpecs.length;
    onSelectHistorical(sequenceSpecs[nextIdx]);
  };

  const displayCoords = cursorCoords || { lat: center[0], lon: center[1] };
  const speedLabel = timelapseSpeed === 0.5 ? '0,5×' : timelapseSpeed === 2 ? '2×' : '1×';

  return (
    <footer className="pointer-events-none fixed bottom-3 left-3 right-3 z-[750] flex justify-center">
      <div className="pointer-events-auto w-full max-w-6xl bg-[#0c1119]/92 border border-white/12 backdrop-blur-xl rounded-2xl px-3.5 py-2.5 shadow-[0_16px_44px_rgba(0,0,0,0.65)] space-y-2">
        {/* Bandă telemetrie */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          {/* Telemetrie Istoric */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <span className="font-semibold text-amber-200 truncate max-w-[260px] md:max-w-xs">
              {historicalSpec.label}
            </span>
            <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-white/6 border border-white/10 font-mono text-[10px] text-slate-300">
              {historicalSpec.resolutionLabel}
            </span>
            {historicalMeta?.captureDate && (
              <span className="hidden md:inline px-1.5 py-0.5 rounded bg-amber-500/12 border border-amber-500/25 font-mono text-[10px] text-amber-200">
                Capturat {historicalMeta.captureDate}
                {historicalMeta.provider ? ` · ${historicalMeta.provider}` : ''}
              </span>
            )}
            {(historicalLoading || loadingWaybackTrack) && (
              <span className="flex items-center gap-1 text-[10px] text-amber-300">
                <Loader2 className="w-3 h-3 animate-spin" />
                {loadingWaybackTrack ? 'Detectare capturi' : 'Se încarcă'}
              </span>
            )}
            {historicalError && (
              <span className="text-[10px] text-rose-300 truncate max-w-[180px]">
                {historicalError}
              </span>
            )}
          </div>

          {/* Coordonate centru / cursor */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-black/40 border border-white/8 font-mono text-[10px] text-slate-300">
            <span>
              {displayCoords.lat.toFixed(4)}°N, {displayCoords.lon.toFixed(4)}°E
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-amber-300">Z{zoom}</span>
          </div>

          {/* Telemetrie Actual */}
          <div className="flex items-center gap-2 min-w-0">
            {currentMeta?.captureDate && (
              <span className="hidden md:inline px-1.5 py-0.5 rounded bg-sky-500/12 border border-sky-500/25 font-mono text-[10px] text-sky-200">
                Dată pixel {currentMeta.captureDate}
                {currentMeta.resolutionM ? ` · ${currentMeta.resolutionM}m` : ''}
              </span>
            )}
            <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-white/6 border border-white/10 font-mono text-[10px] text-slate-300">
              {currentSpec.resolutionLabel}
            </span>
            <span className="font-semibold text-sky-200 truncate max-w-[220px]">
              {currentSpec.shortLabel}
            </span>
            <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
          </div>
        </div>

        {/* Axă cronologică interactivă și controale Timelapse */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <div className="flex items-center gap-1 shrink-0">
            <select
              aria-label="Seria timelapse"
              value={timelapseTrack}
              onChange={(e) => onTimelapseTrackChange(e.target.value as TimelapseTrackId)}
              title="Alege seria de imagini pentru derulare"
              className="px-2 py-1.5 rounded-lg bg-white/6 hover:bg-white/10 border border-white/12 text-[11px] font-medium text-slate-100 focus:outline-none focus:border-amber-400/60 cursor-pointer"
            >
              {TIMELAPSE_TRACKS.map((tr) => (
                <option key={tr.id} value={tr.id} className="bg-[#0d131d]">
                  {tr.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => stepPreset(-1)}
              title="Epoca anterioară (Săgeată Stânga)"
              className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 border border-white/10 text-slate-200 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              title={isPlaying ? 'Pauză timelapse' : 'Pornește timelapse lin cu preîncărcare'}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                isPlaying
                  ? 'bg-amber-500/25 border-amber-400 text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                  : 'bg-white/6 hover:bg-white/12 border-white/10 text-slate-200'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isPlaying ? 'Pauză' : 'Timelapse'}</span>
            </button>

            <button
              type="button"
              onClick={() => stepPreset(1)}
              title="Epoca următoare (Săgeată Dreapta)"
              className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 border border-white/10 text-slate-200 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onCycleSpeed}
              title="Schimbă viteza timelapse (0,5× / 1× / 2×)"
              className="px-2 py-1.5 rounded-lg bg-white/6 hover:bg-white/12 border border-white/10 text-[11px] font-mono text-amber-200 flex items-center gap-1 transition-colors"
            >
              <Gauge className="w-3 h-3 text-amber-400" />
              <span>{speedLabel}</span>
            </button>

            {comparisonMode === 'split' && (
              <button
                type="button"
                onClick={onToggleTimelapseFullScreen}
                title={
                  timelapseFullScreen
                    ? 'Revino la comparația 50/50 cu prezentul'
                    : 'Extinde istoria pe tot ecranul pentru timelapse'
                }
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-colors ${
                  timelapseFullScreen
                    ? 'bg-amber-500/22 border-amber-400/60 text-amber-100'
                    : 'bg-white/6 hover:bg-white/12 border-white/10 text-slate-300'
                }`}
              >
                {timelapseFullScreen ? (
                  <>
                    <Minimize2 className="w-3 h-3" />
                    <span className="hidden md:inline">50/50</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3 h-3" />
                    <span className="hidden md:inline">Tot ecranul</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-x-auto obs-scroll flex items-center gap-1 py-0.5">
            {sequenceSpecs.map((preset) => {
              const active = historicalSpec.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectHistorical(preset)}
                  title={`${preset.label} (${preset.resolutionLabel})`}
                  className={`shrink-0 px-2 py-1 rounded-lg font-mono text-[11px] border transition-all ${
                    active
                      ? 'bg-amber-500/25 border-amber-400 text-amber-100 font-semibold shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'bg-white/4 border-white/8 text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {preset.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
};
