import React from 'react';
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
  if (!open) return null;

  const liveArchives = EXTERNAL_AND_LIVE_ARCHIVES.filter(
    (a) => a.integrationStatus === 'live-streamed'
  );
  const externalVaults = EXTERNAL_AND_LIVE_ARCHIVES.filter(
    (a) => a.integrationStatus === 'external-vault'
  );

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[86vh] flex flex-col bg-[#0c1119] border border-white/15 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-black/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <Satellite className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-[var(--font-display)] text-base font-semibold text-white">
                Inventarul Complet de Arhive Satelitare și Aeriene pentru România
              </h2>
              <p className="text-xs text-slate-400">
                9 surse satelitare transmise live (1972–2026) + 5 arhive spion din Războiul Rece și portaluri naționale centrate pe{' '}
                <span className="font-mono text-amber-300">
                  {lat.toFixed(3)}°N, {lon.toFixed(3)}°E
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide fereastra"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/12 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto obs-scroll p-5 space-y-6">
          {/* Secțiunea 1: Surse transmise live */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              <span>Transmise Live Direct în Aplicație (1972–2026)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {liveArchives.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-white/4 border border-white/10 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold text-white">{item.name}</div>
                    <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                      {item.era}
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-300 font-mono">
                    {item.resolution} · {item.provider}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{item.notes}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Secțiunea 2: Sateliți spion pre-1972 și arhive naționale */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Sateliți Spion Declasificați Pre-1972 și Arhive Naționale
              </div>
              <span className="text-[11px] text-slate-400">
                Linkurile se deschid centrate pe coordonatele curente de pe hartă
              </span>
            </div>

            <div className="space-y-2.5">
              {externalVaults.map((vault) => {
                const href = vault.buildUrl ? vault.buildUrl(lat, lon, zoom) : undefined;
                return (
                  <div
                    key={vault.id}
                    className="p-3.5 rounded-xl bg-amber-500/6 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-white">{vault.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-200">
                          {vault.era} · {vault.resolution}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {vault.provider} · {vault.coverage}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{vault.notes}</p>
                    </div>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-xs font-medium text-amber-100 flex items-center gap-1.5 self-start sm:self-center transition-colors"
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
