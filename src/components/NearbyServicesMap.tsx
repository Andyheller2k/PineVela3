import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, X, LocateFixed } from 'lucide-react';
import { distanceKm, mappedService, serviceDirections, servicePoint, type MapPoint } from '../../serviceLocation';
import type { MarketProductItem } from './MarketItemCard';
import DashboardOverlay from './DashboardOverlay';
import ThemeToggle from './ThemeToggle';
import '../nearby-map.css';

type Props = { products: MarketProductItem[]; onClose: () => void; onInspect: (product: MarketProductItem, directions: string) => void };
export default function NearbyServicesMap({ products, onClose, onInspect }: Props) {
  const element = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), markers = useRef<L.LayerGroup | null>(null), positionLayer = useRef<L.LayerGroup | null>(null);
  const [origin, setOrigin] = useState<MapPoint>(), [accuracy, setAccuracy] = useState<number>(), [error, setError] = useState(''), [locating, setLocating] = useState(false);
  const [query, setQuery] = useState(''), [radius, setRadius] = useState(10), [focusedId, setFocusedId] = useState(''), [waypoint, setWaypoint] = useState<MapPoint>(), [placingWaypoint, setPlacingWaypoint] = useState(false);
  const live = useRef(true), placing = useRef(false);
  const services = useMemo(() => products.filter(mappedService), [products]);
  const search = query.trim().toLowerCase();
  const matches = useMemo(() => search.length >= 2 ? services.filter(p => [p.title, p.storeName, p.serviceCategory, p.description].some(value => value?.toLowerCase().includes(search))) : [], [services, search]);
  const nearby = useMemo(() => origin ? services.filter(p => distanceKm(origin, servicePoint(p.lat, p.lng)!) <= radius).sort((a, b) => distanceKm(origin, servicePoint(a.lat, a.lng)!) - distanceKm(origin, servicePoint(b.lat, b.lng)!)) : [], [services, origin, radius]);
  const shown = search.length >= 2 ? matches : nearby;
  const focused = services.find(p => p.id === focusedId);
  const locate = () => {
    setError('');
    if (!navigator.geolocation) { setError('Location is unavailable in this browser. You can still search for a service.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (!live.current) return;
      const point = servicePoint(position.coords.latitude, position.coords.longitude);
      if (!point || (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy < 0)) { setError('The device returned an invalid location. Please try again.'); setLocating(false); return; }
      setOrigin(point); setAccuracy(position.coords.accuracy); setLocating(false); map.current?.setView([point.lat, point.lng], 13);
    }, failure => {
      if (!live.current) return;
      setLocating(false); setError(failure.code === 1 ? 'Location permission was denied. Allow it to find services near you, or search by service name.' : 'Your location could not be found. Please retry or search by service name.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  };
  useEffect(() => {
    live.current = true;
    const first = services[0] && servicePoint(services[0].lat, services[0].lng);
    const instance = L.map(element.current!, { zoomControl: false }).setView(first ? [first.lat, first.lng] : [0, 0], first ? 12 : 2);
    map.current = instance;
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance); positionLayer.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => { if (placing.current) { const point = servicePoint(event.latlng.lat, event.latlng.lng); if (point) { setWaypoint(point); setPlacingWaypoint(false); placing.current = false; } } });
    const resize = new ResizeObserver(() => instance.invalidateSize()); resize.observe(element.current!);
    locate();
    return () => { live.current = false; resize.disconnect(); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => { placing.current = placingWaypoint; }, [placingWaypoint]);
  useEffect(() => {
    markers.current?.clearLayers();
    for (const product of shown) {
      const point = servicePoint(product.lat, product.lng)!;
      const root = document.createElement('div'); root.className = 'nearby-store-icon'; root.textContent = '🏪';
      if (product.storeLogoUrl) {
        try {
          const url = new URL(product.storeLogoUrl, window.location.origin);
          if (url.origin === window.location.origin && /^\/(uploads|assets)\//.test(url.pathname) || url.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) && url.pathname.startsWith('/storage/v1/object/public/')) {
            const img = document.createElement('img'); img.src = url.toString(); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = () => { img.remove(); root.textContent = '🏪'; }; root.textContent = ''; root.append(img);
          }
        } catch { /* Invalid profile URLs use the store icon. */ }
      }
      const marker = L.marker([point.lat, point.lng], { title: `${product.storeName}: ${product.title}`, icon: L.divIcon({ html: root, className: '', iconSize: [42, 42], iconAnchor: [21, 21] }), draggable: false });
      marker.on('click', () => { setFocusedId(product.id); onInspect(product, serviceDirections(point, origin, waypoint)); });
      marker.on('add', () => { marker.getElement()?.setAttribute('aria-label', `Inspect ${product.title} on map`); marker.getElement()?.setAttribute('data-service-marker', product.id); }); markers.current?.addLayer(marker);
    }
  }, [shown, onInspect, origin, waypoint]);
  useEffect(() => {
    positionLayer.current?.clearLayers();
    if (origin) {
      L.circle([origin.lat, origin.lng], { radius: radius * 1000, color: 'var(--pv-blue-primary)', weight: 1, fillOpacity: .07 }).addTo(positionLayer.current!);
      L.circleMarker([origin.lat, origin.lng], { radius: 7, color: 'var(--pv-panel)', weight: 2, fillColor: 'var(--pv-blue-primary)', fillOpacity: 1 }).bindTooltip('Your device location').addTo(positionLayer.current!);
    }
    if (waypoint) L.circleMarker([waypoint.lat, waypoint.lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#e8790c', fillOpacity: 1 }).bindTooltip('Your waypoint').addTo(positionLayer.current!);
  }, [origin, radius, waypoint]);
  const goTo = (product: MarketProductItem) => { setFocusedId(product.id); const p = servicePoint(product.lat, product.lng)!; map.current?.setView([p.lat, p.lng], 16); };
  return <DashboardOverlay aria-label="Services near you" onClose={onClose} className="fixed inset-0 bg-white">
    <div className="nearby-services-screen flex h-dvh w-full flex-col bg-white">
      <header className="z-10 shrink-0 border-b border-blue-200 bg-white/95 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><MapPin size={20} />Services near you</h2><div className="flex items-center gap-3"><ThemeToggle /><button type="button" onClick={onClose} aria-label="Close services map" className="rounded-xl p-2 text-slate-700"><X size={22} /></button></div></div>
        <div className="flex flex-wrap gap-2"><input aria-label="Search PineVela services on map" value={query} maxLength={120} onChange={e => { setQuery(e.target.value); setFocusedId(''); }} placeholder="Search any PineVela service or store" className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900" /><select aria-label="Nearby service radius" value={radius} onChange={e => setRadius(Number(e.target.value))} className="rounded-xl border border-blue-200 bg-white p-2 text-sm text-slate-900">{[5,10,25].map(km => <option key={km} value={km}>{km} km</option>)}</select><button type="button" onClick={locate} disabled={locating} className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><LocateFixed size={16} />{locating ? 'Finding location…' : 'Use my location'}</button></div>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <p role="status" className="text-xs text-slate-600">{search.length >= 2 ? `${shown.length} matching services across all locations` : origin ? `${shown.length} services within ${radius} km · device accuracy about ${Math.round(accuracy || 0)} m` : 'Use your location for nearby services, or enter at least two characters to search.'}</p>
      </header>
      <div className="relative min-h-0 flex-1"><div ref={element} className="nearby-map h-full w-full" />
        {(shown.length > 0 || focused) && <aside className="absolute left-3 top-3 z-[500] max-h-[40%] w-64 max-w-[calc(100%_-_5rem)] overflow-y-auto rounded-2xl border border-blue-200 bg-white/95 p-3 shadow-lg space-y-2">{shown.slice(0,30).map(p => <button type="button" key={p.id} onClick={() => goTo(p)} className="block w-full rounded-xl px-2 py-2 text-left hover:bg-blue-50" data-map-search-result={p.id}><span className="block text-xs font-bold text-slate-900">{p.title}</span><span className="block text-[11px] text-slate-500">{p.storeName}{origin ? ` · ${distanceKm(origin, servicePoint(p.lat,p.lng)!).toFixed(1)} km` : ''}</span></button>)}{focused && <><button type="button" onClick={() => onInspect(focused, serviceDirections(servicePoint(focused.lat,focused.lng)!,origin,waypoint))} className="w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">View service details</button><a href={serviceDirections(servicePoint(focused.lat,focused.lng)!,origin,waypoint)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="flex items-center gap-2 text-xs font-semibold text-blue-700"><Navigation size={14} />Google Maps directions</a></>}</aside>}
      </div>
      <footer className="shrink-0 border-t border-blue-200 bg-white p-3 space-y-2"><div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => setPlacingWaypoint(v => !v)} aria-pressed={placingWaypoint} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{placingWaypoint ? 'Cancel waypoint placement' : 'Set a waypoint'}</button>{waypoint && <button type="button" onClick={() => setWaypoint(undefined)} className="text-xs font-semibold text-slate-600">Clear waypoint</button>}<span className="text-xs text-slate-600">{placingWaypoint ? 'Tap the map to place your waypoint.' : waypoint ? 'Waypoint added to Google Maps directions.' : 'Tap a store icon to inspect and book its service.'}</span></div><p className="text-[10px] text-slate-500">PineVela does not save your location. Map tiles use OpenStreetMap; opening directions shares selected points with Google.</p></footer>
    </div>
  </DashboardOverlay>;
}
