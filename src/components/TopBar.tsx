import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Columns2,
  Eye,
  Layers,
  MapPin,
  PanelLeft,
  Satellite,
  Search,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Tag,
  X,
} from 'lucide-react';
import { geocodeRomania } from '../lib/api';
import type { ComparisonMode, GeocodeResult } from '../types/satellite';

interface TopBarProps {
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onSearchActiveChange: (active: boolean) => void;
  comparisonMode: ComparisonMode;
  onComparisonModeChange: (mode: ComparisonMode) => void;
  fadeOpacity: number;
  onFadeOpacityChange: (val: number) => void;
  blinkToCurrent: boolean;
  onToggleBlink: () => void;
  spyglassRadius: number;
  onSpyglassRadiusChange: (r: number) => void;
  showLabelsOverlay: boolean;
  onToggleLabelsOverlay: () => void;
  showBorderOutline: boolean;
  onToggleBorderOutline: () => void;
  onSelectLocation: (lat: number, lon: number, zoom: number) => void;
  onOpenDirectory: () => void;
}

const MODE_OPTIONS: Array<{
  id: ComparisonMode;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'split', label: 'Glisare', icon: <SplitSquareHorizontal className="w-3.5 h-3.5" /> },
  { id: 'side-by-side', label: 'Paralel', icon: <Columns2 className="w-3.5 h-3.5" /> },
  { id: 'spyglass', label: 'Lupă', icon: <Search className="w-3.5 h-3.5" /> },
  { id: 'fade', label: 'Estompare', icon: <Layers className="w-3.5 h-3.5" /> },
];

export const TopBar: React.FC<TopBarProps> = ({
  drawerOpen,
  onToggleDrawer,
  onSearchActiveChange,
  comparisonMode,
  onComparisonModeChange,
  fadeOpacity,
  onFadeOpacityChange,
  blinkToCurrent,
  onToggleBlink,
  spyglassRadius,
  onSpyglassRadiusChange,
  showLabelsOverlay,
  onToggleLabelsOverlay,
  showBorderOutline,
  onToggleBorderOutline,
  onSelectLocation,
  onOpenDirectory,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchDismissedRef = useRef(false);

  useEffect(() => {
    const isEscapeKey = (e: KeyboardEvent) =>
      e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape' || e.keyCode === 27;

    const dismissSearch = () => {
      searchDismissedRef.current = true;
      setDropdownOpen(false);
      onSearchActiveChange(false);
      inputRef.current?.blur();
    };
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        searchDismissedRef.current = true;
        setDropdownOpen(false);
        onSearchActiveChange(false);
      }
    };
    const onDocKey = (e: KeyboardEvent) => {
      if (isEscapeKey(e)) {
        dismissSearch();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onDocKey, true);
    document.addEventListener('keyup', onDocKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onDocKey, true);
      document.removeEventListener('keyup', onDocKey, true);
    };
  }, [onSearchActiveChange]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchedOnce(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await geocodeRomania(trimmed);
        if (!cancelled && !searchDismissedRef.current) {
          setResults(res);
          setSearchedOnce(true);
          setDropdownOpen(true);
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await geocodeRomania(query);
      setResults(res);
      setSearchedOnce(true);
      if (res.length > 0) {
        searchDismissedRef.current = true;
        onSelectLocation(res[0].lat, res[0].lon, 13);
        setQuery(res[0].shortName);
        setDropdownOpen(false);
        onSearchActiveChange(false);
        inputRef.current?.blur();
      } else {
        setDropdownOpen(true);
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <header className="pointer-events-none fixed top-3 left-3 right-3 z-[800] flex flex-wrap md:flex-nowrap items-center justify-between gap-2">
      {/* Stânga: Brand + Comutare panou + Căutare localități */}
      <div className="pointer-events-auto flex items-center gap-2 obs-panel rounded-2xl px-2.5 py-1.5 min-w-0">
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-expanded={drawerOpen}
          title={drawerOpen ? 'Restrânge panoul de control' : 'Deschide panoul de arhive și instrumente'}
          className={`select-none inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[2.125rem] rounded-xl border text-xs font-medium transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2 ${
            drawerOpen
              ? 'bg-amber-500/22 border-amber-400/55 text-amber-200 shadow-[0_0_16px_rgba(245,158,11,0.18)]'
              : 'obs-arhive-cta hover:bg-amber-500/22 hover:border-amber-300'
          }`}
        >
          <PanelLeft className="w-4 h-4 shrink-0" />
          <span className={drawerOpen ? '' : 'obs-arhive-cta-word'}>Arhive</span>
        </button>

        <div className="flex items-center gap-2 pr-2 border-r border-white/10 shrink-0 select-none">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/25 to-sky-500/25 border border-amber-400/35 flex items-center justify-center text-amber-300">
            <Satellite className="w-4 h-4" />
          </div>
          <div className="leading-tight hidden sm:block">
            <div className="font-[var(--font-display)] text-sm font-semibold tracking-[-0.02em] text-white flex items-center gap-1.5 whitespace-nowrap">
              <span>România din Orbită</span>
              <span className="hidden xl:inline text-[0.6875rem] font-mono tabular-nums px-1.5 py-0.5 rounded-md bg-white/8 text-amber-300 border border-amber-500/25">
                1972–2026
              </span>
            </div>
            <div className="hidden xl:block text-xs text-slate-300/85 whitespace-nowrap leading-snug">
              Arhiva Satelitară Istorică vs. Prezent
            </div>
          </div>
        </div>

        {/* Căutare în România */}
        <div ref={searchBoxRef} className="relative min-w-0">
          <form onSubmit={handleSubmit} className="flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-300/80 absolute left-2.5 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                const val = e.target.value;
                searchDismissedRef.current = false;
                setQuery(val);
                const hasText = val.trim().length > 0;
                onSearchActiveChange(hasText);
                if (!hasText) {
                  setResults([]);
                  setSearchedOnce(false);
                  setDropdownOpen(false);
                }
              }}
              onFocus={() => {
                if (query.trim().length > 0) {
                  searchDismissedRef.current = false;
                  onSearchActiveChange(true);
                  if (results.length > 0 || searchedOnce) {
                    setDropdownOpen(true);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (
                  e.key === 'Escape' ||
                  e.key === 'Esc' ||
                  e.code === 'Escape' ||
                  e.keyCode === 27
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  searchDismissedRef.current = true;
                  setDropdownOpen(false);
                  onSearchActiveChange(false);
                  inputRef.current?.blur();
                }
              }}
              placeholder="Caută în România..."
              className="w-32 sm:w-36 lg:w-44 xl:w-60 min-h-[2.125rem] pl-8 pr-7 py-1.5 rounded-xl bg-white/6 border border-white/12 text-[0.8125rem] text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-amber-400/65 focus:ring-2 focus:ring-amber-400/25 focus:bg-white/10 transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setSearchedOnce(false);
                  setDropdownOpen(false);
                  onSearchActiveChange(false);
                }}
                aria-label="Șterge căutarea"
                className="select-none absolute right-2 p-0.5 rounded text-slate-300 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {dropdownOpen && (results.length > 0 || searching || searchedOnce) && (
            <div className="absolute left-0 min-w-[17.5rem] sm:min-w-[21rem] mt-2 obs-panel rounded-xl overflow-hidden z-[900]">
              {searching && (
                <div className="px-3.5 py-2.5 text-xs text-slate-300">Se caută în România...</div>
              )}
              {!searching && searchedOnce && results.length === 0 && (
                <div className="px-3.5 py-2.5 text-xs text-slate-300">
                  Niciun rezultat în România
                </div>
              )}
              {results.map((item, idx) => (
                <button
                  key={`${item.lat}-${item.lon}-${idx}`}
                  type="button"
                  onClick={() => {
                    searchDismissedRef.current = true;
                    onSelectLocation(item.lat, item.lon, 13);
                    setQuery(item.shortName);
                    setDropdownOpen(false);
                    onSearchActiveChange(false);
                  }}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-white/10 flex items-start gap-2.5 border-b border-white/8 last:border-0 transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-[-2px]"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-[0.8125rem] font-medium text-slate-100 truncate leading-snug">
                      {item.shortName}
                    </div>
                    <div className="text-xs text-slate-300/85 truncate leading-snug">{item.name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Centru / Dreapta: Moduri de comparație + Slidere + Straturi + Arhive */}
      <div className="pointer-events-auto select-none flex items-center gap-1.5 obs-panel rounded-2xl px-2 py-1.5 shrink-0">
        <div className="flex items-center bg-black/45 p-0.5 rounded-xl border border-white/10 gap-0.5">
          {MODE_OPTIONS.map((m) => {
            const active = comparisonMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onComparisonModeChange(m.id)}
                title={m.label}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[2rem] rounded-lg text-xs font-medium transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2 ${
                  active
                    ? 'obs-active-gradient text-white border border-white/25 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-white/6 border border-transparent'
                }`}
              >
                {m.icon}
                <span className="hidden lg:inline">{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Rază lupă */}
        {comparisonMode === 'spyglass' && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/6 border border-white/12">
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-slate-200 font-mono tabular-nums">{spyglassRadius}px</span>
            <input
              type="range"
              min={80}
              max={260}
              step={10}
              value={spyglassRadius}
              onChange={(e) => onSpyglassRadiusChange(Number(e.target.value))}
              className="w-20 accent-amber-400 cursor-pointer"
            />
          </div>
        )}

        {/* Opacitate Estompare & Clipire */}
        {comparisonMode === 'fade' && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/6 border border-white/12">
            <span className="text-xs text-amber-300 font-mono tabular-nums">
              {Math.round(fadeOpacity * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={fadeOpacity}
              onChange={(e) => onFadeOpacityChange(Number(e.target.value))}
              className="w-20 accent-amber-400 cursor-pointer"
            />
            <button
              type="button"
              onClick={onToggleBlink}
              title="Alternează rapid între Istoric și Actual (tasta Space)"
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                blinkToCurrent
                  ? 'bg-sky-500/25 border-sky-400/60 text-sky-100'
                  : 'bg-amber-500/20 border-amber-400/45 text-amber-100 hover:bg-amber-500/30'
              }`}
            >
              <Eye className="w-3 h-3 inline mr-1" />
              {blinkToCurrent ? 'Actual' : 'Clipire'}
            </button>
          </div>
        )}

        {/* Comutatoare suprapuneri */}
        <div className="flex items-center gap-1 pl-1.5 border-l border-white/12">
          <button
            type="button"
            onClick={onToggleLabelsOverlay}
            title="Afișează sau ascunde numele localităților pe harta actuală"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[2.125rem] rounded-xl text-xs font-medium border transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2 ${
              showLabelsOverlay
                ? 'bg-sky-500/22 border-sky-400/55 text-sky-100'
                : 'bg-white/6 border-white/12 text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Localități</span>
          </button>

          <button
            type="button"
            onClick={onToggleBorderOutline}
            title="Afișează sau ascunde conturul graniței României"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[2.125rem] rounded-xl text-xs font-medium border transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2 ${
              showBorderOutline
                ? 'bg-amber-500/22 border-amber-400/55 text-amber-100'
                : 'bg-white/6 border-white/12 text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-sm border border-current border-dashed" />
            <span className="hidden lg:inline">Graniță RO</span>
          </button>

          <button
            type="button"
            onClick={onOpenDirectory}
            title="Inventar complet incluzând sateliții spion CORONA 1960–1984 și Geoportal ANCPI"
            className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[2.125rem] rounded-xl text-xs font-medium bg-white/8 hover:bg-white/14 border border-white/15 text-slate-100 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2"
          >
            <Archive className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden xl:inline">Toate Arhivele</span>
          </button>
        </div>
      </div>
    </header>
  );
};
