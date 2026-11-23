import React, { useEffect } from 'react';
import { CheckCircle2, ExternalLink, Satellite, X } from 'lucide-react';
import { EXTERNAL_AND_LIVE_ARCHIVES } from '../data/externalArchives';

interface ArchiveDirectoryModalProps {
  open: boolean;
  onClose: () => void;
  lat: number;
  lon: number;
  zoom: number;
}

export const ArchiveDirectoryModal: React.FC<ArchiveDirectoryModalProps> = ({
  open,
  onClose,
  lat,
  lon,
  zoom,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const liveArchives = EXTERNAL_AND_LIVE_ARCHIVES.filter(
    (a) => a.integrationStatus === 'live-streamed'
  );
  const externalVaults = EXTERNAL_AND_LIVE_ARCHIVES.filter(
    (a) => a.integrationStatus === 'external-vault'
  );

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/72 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-modal-title"
        className="w-full max-w-4xl max-h-[86vh] flex flex-col obs-panel rounded-[1.125rem] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/12 flex items-center justify-between gap-3 bg-black/35">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/45 flex items-center justify-center text-amber-300 shrink-0">
              <Satellite className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="archive-modal-title"
                className="font-[var(--font-display)] text-base font-semibold tracking-[-0.015em] text-white text-balance leading-snug"
              >
                Inventarul Complet de Arhive Satelitare și Aeriene pentru România
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 leading-snug text-pretty">
                9 surse satelitare transmise live (1972–2026) + 5 arhive spion din Războiul Rece și portaluri naționale centrate pe{' '}
                <span className="font-mono tabular-nums text-amber-300">
                  {lat.toFixed(3)}°N, {lon.toFixed(3)}°E
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide fereastra"
            className="p-2 rounded-xl bg-white/6 hover:bg-white/14 border border-white/12 text-slate-200 hover:text-white transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto obs-scroll p-5 space-y-6">
          {/* Secțiunea 1: Surse transmise live */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              <span>Transmise Live Direct în Aplicație (1972–2026)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {liveArchives.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-white/5 border border-white/12 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-[var(--font-display)] text-[0.8125rem] font-semibold text-white leading-snug">
                      {item.name}
                    </div>
                    <span className="shrink-0 text-[0.6875rem] font-mono tabular-nums px-1.5 py-0.5 rounded bg-emerald-500/18 border border-emerald-500/35 text-emerald-200">
                      {item.era}
                    </span>
                  </div>
                  <div className="text-[0.6875rem] text-amber-300 font-mono tabular-nums">
                    {item.resolution} · {item.provider}
                  </div>
                  <p className="text-xs text-slate-200/90 leading-[1.45] text-pretty">{item.notes}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Secțiunea 2: Sateliți spion pre-1972 și arhive naționale */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.06em] text-amber-300">
                Sateliți Spion Declasificați Pre-1972 și Arhive Naționale
              </div>
              <span className="text-xs text-slate-300">
                Linkurile se deschid centrate pe coordonatele curente de pe hartă
              </span>
            </div>

            <div className="space-y-2.5">
              {externalVaults.map((vault) => {
                const href = vault.buildUrl ? vault.buildUrl(lat, lon, zoom) : undefined;
                return (
                  <div
                    key={vault.id}
                    className="p-3.5 rounded-xl bg-amber-500/8 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-[var(--font-display)] text-[0.8125rem] font-semibold text-white leading-snug">
                          {vault.name}
                        </span>
                        <span className="text-[0.6875rem] font-mono tabular-nums px-1.5 py-0.5 rounded bg-amber-500/18 border border-amber-400/35 text-amber-200">
                          {vault.era} · {vault.resolution}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300">
                        {vault.provider} · {vault.coverage}
                      </div>
                      <p className="text-xs text-slate-200/90 leading-[1.45] text-pretty">
                        {vault.notes}
                      </p>
                    </div>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 px-3.5 py-2 rounded-xl bg-amber-500/22 hover:bg-amber-500/32 border border-amber-400/55 text-xs font-semibold text-amber-100 flex items-center gap-1.5 self-start sm:self-center transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
                      >
                        <span>Deschide Arhiva</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
