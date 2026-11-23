import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { ROMANIA_BORDER_GEOJSON } from '../data/landmarks';
import { resolveLayerTileUrl } from '../lib/api';
import { createLeafletLayer, createReferenceOverlayGroup } from '../lib/tileLayers';
import type {
  ComparisonMode,
  ImageryLayerSpec,
  OamScene,
  SpectralMode,
  StacScene,
} from '../types/satellite';

interface MapComparatorProps {
  historicalSpec: ImageryLayerSpec;
  currentSpec: ImageryLayerSpec;
  spectralMode: SpectralMode;
  nextPreloadSpec?: ImageryLayerSpec | null;
  nextPreloadSpectral?: SpectralMode;
  comparisonMode: ComparisonMode;
  splitPercent: number;
  onSplitPercentChange: (pct: number) => void;
  fadeOpacity: number;
  blinkToCurrent: boolean;
  spyglassRadius: number;
  showLabelsOverlay: boolean;
  showBorderOutline: boolean;
  center: [number, number];
  zoom: number;
  flyTrigger: number;
  onViewportChange: (center: [number, number], zoom: number, bbox: [number, number, number, number]) => void;
  onCursorCoords: (coords: { lat: number; lon: number } | null) => void;
  highlightedFootprint: StacScene | OamScene | null;
  onHistoricalLoadStateChange?: (loading: boolean, error: string | null) => void;
  onHistoricalFrameReady?: (specId: string) => void;
}

export const MapComparator: React.FC<MapComparatorProps> = ({
  historicalSpec,
  currentSpec,
  spectralMode,
  nextPreloadSpec,
  nextPreloadSpectral,
  comparisonMode,
  splitPercent,
  onSplitPercentChange,
  fadeOpacity,
  blinkToCurrent,
  spyglassRadius,
  showLabelsOverlay,
  showBorderOutline,
  center,
  zoom,
  flyTrigger,
  onViewportChange,
  onCursorCoords,
  highlightedFootprint,
  onHistoricalLoadStateChange,
  onHistoricalFrameReady,
}) => {
  // Single-map container (used by split, spyglass, fade)
  const singleContainerRef = useRef<HTMLDivElement | null>(null);
  const singleMapRef = useRef<L.Map | null>(null);
  const histLayersRef = useRef<L.Layer[]>([]);
  const preloadLayerRef = useRef<L.Layer | null>(null);
  const currLayerRef = useRef<L.Layer | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const borderLayerRef = useRef<L.GeoJSON | null>(null);
  const footprintLayerRef = useRef<L.GeoJSON | null>(null);

  // Side-by-side dual containers
  const leftContainerRef = useRef<HTMLDivElement | null>(null);
  const rightContainerRef = useRef<HTMLDivElement | null>(null);
  const leftMapRef = useRef<L.Map | null>(null);
  const rightMapRef = useRef<L.Map | null>(null);
  const leftHistLayersRef = useRef<L.Layer[]>([]);
  const leftPreloadLayerRef = useRef<L.Layer | null>(null);
  const rightCurrLayerRef = useRef<L.Layer | null>(null);
  const rightOverlayRef = useRef<L.LayerGroup | null>(null);
  const leftBorderRef = useRef<L.GeoJSON | null>(null);
  const rightBorderRef = useRef<L.GeoJSON | null>(null);
  const leftCrosshairRef = useRef<L.CircleMarker | null>(null);
  const rightCrosshairRef = useRef<L.CircleMarker | null>(null);
  const syncingDualRef = useRef(false);
  const histZIndexRef = useRef(10);
  const histSwapTokenRef = useRef(0);

  const [spyglassPos, setSpyglassPos] = useState<{ x: number; y: number } | null>(null);
  const [spyglassLocked, setSpyglassLocked] = useState(false);
  const isDraggingSplitRef = useRef(false);

  // Store latest dynamic props in refs for Leaflet event listeners
  const splitPercentRef = useRef(splitPercent);
  splitPercentRef.current = splitPercent;
  const comparisonModeRef = useRef(comparisonMode);
  comparisonModeRef.current = comparisonMode;
  const spyglassPosRef = useRef(spyglassPos);
  spyglassPosRef.current = spyglassPos;
  const spyglassRadiusRef = useRef(spyglassRadius);
  spyglassRadiusRef.current = spyglassRadius;
  const fadeOpacityRef = useRef(fadeOpacity);
  fadeOpacityRef.current = fadeOpacity;
  const blinkRef = useRef(blinkToCurrent);
  blinkRef.current = blinkToCurrent;

  const updateSinglePaneStyles = () => {
    const map = singleMapRef.current;
    const container = singleContainerRef.current;
    if (!map || !container) return;

    const histPane = map.getPane('historicalPane');
    const currPane = map.getPane('currentPane');
    const currLabelsPane = map.getPane('currentLabelsPane');
    if (!histPane || !currPane) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    const nw = map.containerPointToLayerPoint([0, 0]);
    const se = map.containerPointToLayerPoint([w, h]);
    const mode = comparisonModeRef.current;

    if (mode === 'split') {
      histPane.style.zIndex = '250';
      histPane.style.opacity = '1';
      histPane.style.clipPath = 'none';

      currPane.style.zIndex = '260';
      currPane.style.opacity = '1';
      const splitX = (splitPercentRef.current / 100) * w;
      const splitPt = map.containerPointToLayerPoint([splitX, 0]);
      const rightClip = `polygon(${splitPt.x}px ${nw.y}px, ${se.x}px ${nw.y}px, ${se.x}px ${se.y}px, ${splitPt.x}px ${se.y}px)`;
      currPane.style.clipPath = rightClip;
      if (currLabelsPane) {
        currLabelsPane.style.zIndex = '270';
        currLabelsPane.style.opacity = '1';
        currLabelsPane.style.clipPath = rightClip;
      }
    } else if (mode === 'spyglass') {
      currPane.style.zIndex = '250';
      currPane.style.opacity = '1';
      currPane.style.clipPath = 'none';
      if (currLabelsPane) {
        currLabelsPane.style.zIndex = '255';
        currLabelsPane.style.opacity = '1';
        currLabelsPane.style.clipPath = 'none';
      }

      histPane.style.zIndex = '265';
      histPane.style.opacity = '1';
      const pos = spyglassPosRef.current || { x: w / 2, y: h / 2 };
      const layerCenter = map.containerPointToLayerPoint([pos.x, pos.y]);
      histPane.style.clipPath = `circle(${spyglassRadiusRef.current}px at ${layerCenter.x}px ${layerCenter.y}px)`;
    } else if (mode === 'fade') {
      currPane.style.zIndex = '250';
      currPane.style.opacity = '1';
      currPane.style.clipPath = 'none';
      if (currLabelsPane) {
        currLabelsPane.style.zIndex = '270';
        currLabelsPane.style.opacity = '1';
        currLabelsPane.style.clipPath = 'none';
      }

      histPane.style.zIndex = '265';
      histPane.style.clipPath = 'none';
      histPane.style.opacity = blinkRef.current ? '0' : String(fadeOpacityRef.current);
    }
  };

  // Initialize / teardown single map when mode !== 'side-by-side'
  useEffect(() => {
    if (comparisonMode === 'side-by-side') {
      if (singleMapRef.current) {
        singleMapRef.current.remove();
        singleMapRef.current = null;
        histLayersRef.current = [];
        preloadLayerRef.current = null;
        currLayerRef.current = null;
        overlayGroupRef.current = null;
        borderLayerRef.current = null;
        footprintLayerRef.current = null;
      }
      return;
    }

    const container = singleContainerRef.current;
    if (!container || singleMapRef.current) return;

    const map = L.map(container, {
      center,
      zoom,
      minZoom: 6,
      maxZoom: 19,
      zoomControl: false,
      preferCanvas: true,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

    const preloadPane = map.createPane('preloadPane');
    preloadPane.style.zIndex = '100';
    preloadPane.style.opacity = '0.001';
    preloadPane.style.pointerEvents = 'none';
    map.createPane('historicalPane').style.zIndex = '250';
    map.createPane('currentPane').style.zIndex = '260';
    const labelsPane = map.createPane('currentLabelsPane');
    labelsPane.style.zIndex = '270';
    labelsPane.style.pointerEvents = 'none';
    map.createPane('footprintPane').style.zIndex = '420';
    map.createPane('overlayPaneCustom').style.zIndex = '460';

    const border = L.geoJSON(ROMANIA_BORDER_GEOJSON, {
      pane: 'overlayPaneCustom',
      style: {
        color: '#f59e0b',
        weight: 1.5,
        opacity: 0.65,
        dashArray: '5 5',
        fillOpacity: 0,
      },
      interactive: false,
    });
    if (showBorderOutline) border.addTo(map);
    borderLayerRef.current = border;

    const overlay = createReferenceOverlayGroup('currentLabelsPane');
    if (showLabelsOverlay) overlay.addTo(map);
    overlayGroupRef.current = overlay;

    singleMapRef.current = map;

    const emitState = () => {
      const c = map.getCenter();
      const b = map.getBounds();
      onViewportChange([c.lat, c.lng], map.getZoom(), [
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      ]);
    };

    map.on('move', updateSinglePaneStyles);
    map.on('zoom', updateSinglePaneStyles);
    map.on('viewreset', updateSinglePaneStyles);
    map.on('resize', updateSinglePaneStyles);
    map.on('moveend', () => {
      updateSinglePaneStyles();
      emitState();
    });

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      onCursorCoords({ lat: e.latlng.lat, lon: e.latlng.lng });
      if (comparisonModeRef.current === 'spyglass' && !spyglassLocked) {
        const pt = map.latLngToContainerPoint(e.latlng);
        setSpyglassPos({ x: pt.x, y: pt.y });
      }
    });

    map.on('mouseout', () => onCursorCoords(null));
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (comparisonModeRef.current === 'spyglass') {
        const pt = map.latLngToContainerPoint(e.latlng);
        setSpyglassPos({ x: pt.x, y: pt.y });
        setSpyglassLocked((v) => !v);
      }
    });

    updateSinglePaneStyles();
    emitState();

    const resizeObs = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      updateSinglePaneStyles();
    });
    resizeObs.observe(container);

    return () => {
      resizeObs.disconnect();
      map.remove();
      singleMapRef.current = null;
      histLayersRef.current = [];
      preloadLayerRef.current = null;
      currLayerRef.current = null;
      overlayGroupRef.current = null;
      borderLayerRef.current = null;
      footprintLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonMode === 'side-by-side']);

  // Initialize / teardown dual maps when mode === 'side-by-side'
  useEffect(() => {
    if (comparisonMode !== 'side-by-side') {
      if (leftMapRef.current) {
        leftMapRef.current.remove();
        leftMapRef.current = null;
      }
      if (rightMapRef.current) {
        rightMapRef.current.remove();
        rightMapRef.current = null;
      }
      leftHistLayersRef.current = [];
      leftPreloadLayerRef.current = null;
      rightCurrLayerRef.current = null;
      rightOverlayRef.current = null;
      leftBorderRef.current = null;
      rightBorderRef.current = null;
      leftCrosshairRef.current = null;
      rightCrosshairRef.current = null;
      return;
    }

    const leftEl = leftContainerRef.current;
    const rightEl = rightContainerRef.current;
    if (!leftEl || !rightEl || leftMapRef.current || rightMapRef.current) return;

    const leftMap = L.map(leftEl, {
      center,
      zoom,
      minZoom: 6,
      maxZoom: 19,
      zoomControl: false,
      preferCanvas: true,
    });
    const rightMap = L.map(rightEl, {
      center,
      zoom,
      minZoom: 6,
      maxZoom: 19,
      zoomControl: false,
      preferCanvas: true,
    });
    L.control.zoom({ position: 'topright' }).addTo(rightMap);
    L.control.scale({ position: 'bottomright', imperial: false }).addTo(rightMap);

    const leftPreloadPane = leftMap.createPane('preloadPane');
    leftPreloadPane.style.zIndex = '100';
    leftPreloadPane.style.opacity = '0.001';
    leftPreloadPane.style.pointerEvents = 'none';
    leftMap.createPane('historicalPane').style.zIndex = '250';
    leftMap.createPane('overlayPaneCustom').style.zIndex = '460';
    rightMap.createPane('currentPane').style.zIndex = '250';
    const rLabelsPane = rightMap.createPane('currentLabelsPane');
    rLabelsPane.style.zIndex = '270';
    rLabelsPane.style.pointerEvents = 'none';
    rightMap.createPane('overlayPaneCustom').style.zIndex = '460';

    const lBorder = L.geoJSON(ROMANIA_BORDER_GEOJSON, {
      pane: 'overlayPaneCustom',
      style: { color: '#f59e0b', weight: 1.5, opacity: 0.65, dashArray: '5 5', fillOpacity: 0 },
      interactive: false,
    });
    const rBorder = L.geoJSON(ROMANIA_BORDER_GEOJSON, {
      pane: 'overlayPaneCustom',
      style: { color: '#38bdf8', weight: 1.5, opacity: 0.55, dashArray: '5 5', fillOpacity: 0 },
      interactive: false,
    });
    if (showBorderOutline) {
      lBorder.addTo(leftMap);
      rBorder.addTo(rightMap);
    }
    leftBorderRef.current = lBorder;
    rightBorderRef.current = rBorder;

    const rOv = createReferenceOverlayGroup('currentLabelsPane');
    if (showLabelsOverlay) {
      rOv.addTo(rightMap);
    }
    rightOverlayRef.current = rOv;

    const lCross = L.circleMarker([center[0], center[1]], {
      radius: 6,
      color: '#f59e0b',
      weight: 2,
      fillOpacity: 0.15,
      interactive: false,
    });
    const rCross = L.circleMarker([center[0], center[1]], {
      radius: 6,
      color: '#38bdf8',
      weight: 2,
      fillOpacity: 0.15,
      interactive: false,
    });
    leftCrosshairRef.current = lCross;
    rightCrosshairRef.current = rCross;

    const syncFrom = (src: L.Map, dst: L.Map) => {
      if (syncingDualRef.current) return;
      syncingDualRef.current = true;
      dst.setView(src.getCenter(), src.getZoom(), { animate: false });
      syncingDualRef.current = false;
    };

    const emitDualState = () => {
      const c = leftMap.getCenter();
      const b = leftMap.getBounds();
      onViewportChange([c.lat, c.lng], leftMap.getZoom(), [
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      ]);
    };

    leftMap.on('move', () => syncFrom(leftMap, rightMap));
    rightMap.on('move', () => syncFrom(rightMap, leftMap));
    leftMap.on('moveend', emitDualState);
    rightMap.on('moveend', emitDualState);

    leftMap.on('mousemove', (e: L.LeafletMouseEvent) => {
      onCursorCoords({ lat: e.latlng.lat, lon: e.latlng.lng });
      rCross.setLatLng(e.latlng);
      if (!rightMap.hasLayer(rCross)) rCross.addTo(rightMap);
      if (leftMap.hasLayer(lCross)) leftMap.removeLayer(lCross);
    });
    rightMap.on('mousemove', (e: L.LeafletMouseEvent) => {
      onCursorCoords({ lat: e.latlng.lat, lon: e.latlng.lng });
      lCross.setLatLng(e.latlng);
      if (!leftMap.hasLayer(lCross)) lCross.addTo(leftMap);
      if (rightMap.hasLayer(rCross)) rightMap.removeLayer(rCross);
    });
    leftMap.on('mouseout', () => {
      onCursorCoords(null);
      if (rightMap.hasLayer(rCross)) rightMap.removeLayer(rCross);
    });
    rightMap.on('mouseout', () => {
      onCursorCoords(null);
      if (leftMap.hasLayer(lCross)) leftMap.removeLayer(lCross);
    });

    leftMapRef.current = leftMap;
    rightMapRef.current = rightMap;
    emitDualState();

    const resizeObs = new ResizeObserver(() => {
      leftMap.invalidateSize({ animate: false });
      rightMap.invalidateSize({ animate: false });
    });
    resizeObs.observe(leftEl);
    resizeObs.observe(rightEl);

    return () => {
      resizeObs.disconnect();
      leftMap.remove();
      rightMap.remove();
      leftMapRef.current = null;
      rightMapRef.current = null;
      leftHistLayersRef.current = [];
      leftPreloadLayerRef.current = null;
      rightCurrLayerRef.current = null;
      rightOverlayRef.current = null;
      leftBorderRef.current = null;
      rightBorderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonMode === 'side-by-side']);

  // Keep pane styles reactive to split/spyglass/fade updates
  useEffect(() => {
    updateSinglePaneStyles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonMode, splitPercent, spyglassPos, spyglassRadius, fadeOpacity, blinkToCurrent]);

  // Programmatic flyTo when user searches or selects a landmark
  useEffect(() => {
    if (flyTrigger === 0) return;
    if (singleMapRef.current) {
      singleMapRef.current.flyTo(center, zoom, { duration: 1.0 });
    }
    if (leftMapRef.current && rightMapRef.current) {
      syncingDualRef.current = true;
      leftMapRef.current.setView(center, zoom, { animate: true });
      rightMapRef.current.setView(center, zoom, { animate: true });
      setTimeout(() => {
        syncingDualRef.current = false;
      }, 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTrigger]);

  // Toggle locality names overlay (Current satellite map only)
  useEffect(() => {
    if (singleMapRef.current && overlayGroupRef.current) {
      if (showLabelsOverlay && !singleMapRef.current.hasLayer(overlayGroupRef.current)) {
        overlayGroupRef.current.addTo(singleMapRef.current);
      } else if (!showLabelsOverlay && singleMapRef.current.hasLayer(overlayGroupRef.current)) {
        singleMapRef.current.removeLayer(overlayGroupRef.current);
      }
    }
    if (rightMapRef.current && rightOverlayRef.current) {
      if (showLabelsOverlay) {
        if (!rightMapRef.current.hasLayer(rightOverlayRef.current)) {
          rightOverlayRef.current.addTo(rightMapRef.current);
        }
      } else if (rightMapRef.current.hasLayer(rightOverlayRef.current)) {
        rightMapRef.current.removeLayer(rightOverlayRef.current);
      }
    }
  }, [showLabelsOverlay, comparisonMode]);

  // Toggle Romania border outline
  useEffect(() => {
    if (singleMapRef.current && borderLayerRef.current) {
      if (showBorderOutline && !singleMapRef.current.hasLayer(borderLayerRef.current)) {
        borderLayerRef.current.addTo(singleMapRef.current);
      } else if (!showBorderOutline && singleMapRef.current.hasLayer(borderLayerRef.current)) {
        singleMapRef.current.removeLayer(borderLayerRef.current);
      }
    }
    if (leftMapRef.current && leftBorderRef.current && rightMapRef.current && rightBorderRef.current) {
      if (showBorderOutline) {
        if (!leftMapRef.current.hasLayer(leftBorderRef.current)) leftBorderRef.current.addTo(leftMapRef.current);
        if (!rightMapRef.current.hasLayer(rightBorderRef.current)) rightBorderRef.current.addTo(rightMapRef.current);
      } else {
        if (leftMapRef.current.hasLayer(leftBorderRef.current)) leftMapRef.current.removeLayer(leftBorderRef.current);
        if (rightMapRef.current.hasLayer(rightBorderRef.current)) rightMapRef.current.removeLayer(rightBorderRef.current);
      }
    }
  }, [showBorderOutline, comparisonMode]);

  // Double-buffered Historical Layer crossfade (zero blank-tile flash)
  useEffect(() => {
    let cancelled = false;
    const swapToken = ++histSwapTokenRef.current;
    const cleanups: Array<() => void> = [];
    onHistoricalLoadStateChange?.(true, null);

    const swapHistoricalBuffer = (
      map: L.Map,
      stackRef: React.MutableRefObject<L.Layer[]>,
      tileUrl: string | null,
      activeSpectral: SpectralMode,
      onReady?: () => void
    ) => {
      const incoming = createLeafletLayer(
        historicalSpec,
        tileUrl,
        activeSpectral,
        'historicalPane'
      );
      if (incoming instanceof L.GridLayer) {
        incoming.setZIndex(++histZIndexRef.current);
      }
      incoming.addTo(map);
      const hadPrevious = stackRef.current.length > 0;
      stackRef.current.push(incoming);

      const el = incoming instanceof L.GridLayer ? incoming.getContainer() : null;
      if (el && hadPrevious) {
        el.style.opacity = '0';
        el.style.transition = 'opacity 480ms ease-in-out';
      }

      let done = false;
      let fallbackTimer: number | undefined;
      let cleanupTimer: number | undefined;

      const finish = () => {
        if (done) return;
        done = true;
        if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
        if (cancelled || swapToken !== histSwapTokenRef.current) return;

        onHistoricalLoadStateChange?.(false, null);

        if (el && hadPrevious) {
          void el.offsetWidth;
          el.style.opacity = '1';
          cleanupTimer = window.setTimeout(() => {
            if (cancelled || swapToken !== histSwapTokenRef.current) return;
            const stale = stackRef.current.filter((l) => l !== incoming);
            stale.forEach((l) => {
              if (map.hasLayer(l)) map.removeLayer(l);
            });
            stackRef.current = [incoming];
            onReady?.();
          }, 500);
        } else {
          const stale = stackRef.current.filter((l) => l !== incoming);
          stale.forEach((l) => {
            if (map.hasLayer(l)) map.removeLayer(l);
          });
          stackRef.current = [incoming];
          onReady?.();
        }
      };

      if (incoming instanceof L.GridLayer) {
        incoming.once('load', finish);
        fallbackTimer = window.setTimeout(finish, 3800);
      } else {
        finish();
      }

      return () => {
        if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
        if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
      };
    };

    resolveLayerTileUrl(historicalSpec, spectralMode)
      .then((tileUrl) => {
        if (cancelled || swapToken !== histSwapTokenRef.current) return;
        const activeSpectral = historicalSpec.supportsSpectral
          ? historicalSpec.availableSpectral?.includes(spectralMode)
            ? spectralMode
            : historicalSpec.defaultSpectral || 'natural'
          : 'natural';

        if (singleMapRef.current) {
          cleanups.push(
            swapHistoricalBuffer(
              singleMapRef.current,
              histLayersRef,
              tileUrl,
              activeSpectral,
              () => onHistoricalFrameReady?.(historicalSpec.id)
            )
          );
          updateSinglePaneStyles();
        }
        if (leftMapRef.current) {
          cleanups.push(
            swapHistoricalBuffer(
              leftMapRef.current,
              leftHistLayersRef,
              tileUrl,
              activeSpectral,
              () => onHistoricalFrameReady?.(historicalSpec.id)
            )
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        onHistoricalLoadStateChange?.(
          false,
          err instanceof Error ? err.message : 'Încărcarea stratului a eșuat'
        );
      });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicalSpec, spectralMode, comparisonMode]);

  // Background next-frame preloader (caches viewport tiles ahead of timelapse tick)
  useEffect(() => {
    let cancelled = false;

    const clearPreloads = () => {
      if (singleMapRef.current && preloadLayerRef.current) {
        if (singleMapRef.current.hasLayer(preloadLayerRef.current)) {
          singleMapRef.current.removeLayer(preloadLayerRef.current);
        }
        preloadLayerRef.current = null;
      }
      if (leftMapRef.current && leftPreloadLayerRef.current) {
        if (leftMapRef.current.hasLayer(leftPreloadLayerRef.current)) {
          leftMapRef.current.removeLayer(leftPreloadLayerRef.current);
        }
        leftPreloadLayerRef.current = null;
      }
    };

    clearPreloads();
    if (!nextPreloadSpec) return;

    const preloadSpectral = nextPreloadSpec.supportsSpectral
      ? nextPreloadSpec.availableSpectral?.includes(nextPreloadSpectral || 'natural')
        ? nextPreloadSpectral || 'natural'
        : nextPreloadSpec.defaultSpectral || 'natural'
      : 'natural';

    resolveLayerTileUrl(nextPreloadSpec, preloadSpectral)
      .then((tileUrl) => {
        if (cancelled) return;
        if (singleMapRef.current) {
          const layer = createLeafletLayer(
            nextPreloadSpec,
            tileUrl,
            preloadSpectral,
            'preloadPane'
          );
          layer.addTo(singleMapRef.current);
          preloadLayerRef.current = layer;
        }
        if (leftMapRef.current) {
          const layer = createLeafletLayer(
            nextPreloadSpec,
            tileUrl,
            preloadSpectral,
            'preloadPane'
          );
          layer.addTo(leftMapRef.current);
          leftPreloadLayerRef.current = layer;
        }
      })
      .catch(() => {
        // Ignore silent preload failures
      });

    return () => {
      cancelled = true;
      clearPreloads();
    };
  }, [nextPreloadSpec, nextPreloadSpectral, comparisonMode]);

  // Update Current Layer (single map or dual right map)
  useEffect(() => {
    let cancelled = false;

    resolveLayerTileUrl(currentSpec, 'natural')
      .then((tileUrl) => {
        if (cancelled) return;
        if (singleMapRef.current) {
          if (currLayerRef.current && singleMapRef.current.hasLayer(currLayerRef.current)) {
            singleMapRef.current.removeLayer(currLayerRef.current);
          }
          const layer = createLeafletLayer(currentSpec, tileUrl, 'natural', 'currentPane');
          layer.addTo(singleMapRef.current);
          currLayerRef.current = layer;
          updateSinglePaneStyles();
        }
        if (rightMapRef.current) {
          if (rightCurrLayerRef.current && rightMapRef.current.hasLayer(rightCurrLayerRef.current)) {
            rightMapRef.current.removeLayer(rightCurrLayerRef.current);
          }
          const layer = createLeafletLayer(currentSpec, tileUrl, 'natural', 'currentPane');
          layer.addTo(rightMapRef.current);
          rightCurrLayerRef.current = layer;
        }
      })
      .catch(() => {
        // Ignore transient current layer error
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpec, comparisonMode]);

  // Render hovered scene footprint polygon on map
  useEffect(() => {
    const map = singleMapRef.current;
    if (!map) return;
    if (footprintLayerRef.current && map.hasLayer(footprintLayerRef.current)) {
      map.removeLayer(footprintLayerRef.current);
      footprintLayerRef.current = null;
    }
    if (!highlightedFootprint) return;
    const geom =
      'geometry' in highlightedFootprint ? highlightedFootprint.geometry : highlightedFootprint.geojson;
    if (!geom) return;

    const layer = L.geoJSON(geom as GeoJSON.GeoJsonObject, {
      pane: 'footprintPane',
      style: {
        color: '#f59e0b',
        weight: 2,
        dashArray: '4 4',
        fillColor: '#f59e0b',
        fillOpacity: 0.12,
      },
      interactive: false,
    });
    layer.addTo(map);
    footprintLayerRef.current = layer;
  }, [highlightedFootprint, comparisonMode]);

  // Pointer drag handlers for split divider
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!isDraggingSplitRef.current || !singleContainerRef.current) return;
      const rect = singleContainerRef.current.getBoundingClientRect();
      const pct = Math.max(4, Math.min(96, ((e.clientX - rect.left) / rect.width) * 100));
      onSplitPercentChange(pct);
    };
    const handleUp = () => {
      isDraggingSplitRef.current = false;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [onSplitPercentChange]);

  const effectiveSpyglassPos = spyglassPos || {
    x: (singleContainerRef.current?.clientWidth || 1000) / 2,
    y: (singleContainerRef.current?.clientHeight || 700) / 2,
  };

  if (comparisonMode === 'side-by-side') {
    return (
      <div className="relative w-full h-full grid grid-cols-2 gap-[2px] bg-slate-800/80">
        <div className="relative w-full h-full">
          <div ref={leftContainerRef} className="w-full h-full" />
          <div className="pointer-events-none absolute top-[76px] right-4 z-[500] px-3 py-1 rounded-full bg-[#090d12]/85 border border-amber-500/40 backdrop-blur-md text-xs font-medium text-amber-200 shadow-lg flex items-center gap-2 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>ISTORIC · {historicalSpec.dateLabel}</span>
          </div>
        </div>
        <div className="relative w-full h-full">
          <div ref={rightContainerRef} className="w-full h-full" />
          <div className="pointer-events-none absolute top-[76px] left-4 z-[500] px-3 py-1 rounded-full bg-[#090d12]/85 border border-sky-400/40 backdrop-blur-md text-xs font-medium text-sky-200 shadow-lg flex items-center gap-2 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            <span>ACTUAL · {currentSpec.dateLabel}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={singleContainerRef} className="w-full h-full" />

      {comparisonMode === 'split' && (
        <>
          {/* Vertical glowing divider line */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-[480] w-[2px] bg-gradient-to-b from-amber-400/70 via-white/90 to-sky-400/70 shadow-[0_0_16px_rgba(245,158,11,0.5)]"
            style={{ left: `${splitPercent}%`, transform: 'translateX(-1px)' }}
          />
          {/* Draggable handle grip */}
          <button
            type="button"
            aria-label="Trage separatorul de comparație"
            onPointerDown={(e) => {
              e.preventDefault();
              isDraggingSplitRef.current = true;
            }}
            style={{ left: `${splitPercent}%` }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-[490] w-10 h-10 rounded-full bg-[#0d131d]/95 border border-white/25 hover:border-amber-400/80 shadow-[0_6px_24px_rgba(0,0,0,0.65)] backdrop-blur-md flex items-center justify-center cursor-ew-resize transition-colors group"
          >
            <div className="flex items-center gap-1">
              <span className="w-0 h-0 border-y-[5px] border-y-transparent border-r-[6px] border-r-amber-400" />
              <span className="w-[2px] h-4 bg-white/40 rounded-full group-hover:bg-white/80" />
              <span className="w-0 h-0 border-y-[5px] border-y-transparent border-l-[6px] border-l-sky-400" />
            </div>
          </button>

          {/* Left / Right corner callouts */}
          <div className="pointer-events-none absolute top-[76px] left-1/2 -translate-x-1/2 z-[475] flex items-center gap-2">
            <div className="px-2.5 py-1 rounded-full bg-[#090d12]/80 border border-amber-500/35 backdrop-blur-md text-[11px] font-medium text-amber-200 flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Stânga: {historicalSpec.shortLabel}</span>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-[#090d12]/80 border border-sky-400/35 backdrop-blur-md text-[11px] font-medium text-sky-200 flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Dreapta: {currentSpec.shortLabel}</span>
            </div>
          </div>
        </>
      )}

      {comparisonMode === 'spyglass' && (
        <>
          <div
            className="pointer-events-none absolute z-[480] rounded-full border-2 border-amber-400/90 shadow-[0_0_32px_rgba(0,0,0,0.65),inset_0_0_24px_rgba(245,158,11,0.18)]"
            style={{
              width: spyglassRadius * 2,
              height: spyglassRadius * 2,
              left: effectiveSpyglassPos.x - spyglassRadius,
              top: effectiveSpyglassPos.y - spyglassRadius,
            }}
          >
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-0.5 rounded-full bg-[#090d12]/90 border border-amber-500/40 text-[10px] font-mono text-amber-200">
              {historicalSpec.shortLabel} · {spyglassLocked ? 'BLOCATĂ (clic pt. mutare)' : 'Clic pt. blocare lupă'}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
