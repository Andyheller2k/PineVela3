import {mapLogoUrl} from '../lib/mapLogo';
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, X, LocateFixed, Footprints, Car, Route, Flag, Crosshair, Pause, ChevronDown } from 'lucide-react';
import { distanceKm, mappedService, serviceDirections, servicePoint, type MapPoint } from '../../serviceLocation';
import { fetchMapRoute, routeProgress, formatRouteDistance, formatRouteDuration, type MapRoute, type RouteMode } from '../lib/mapRoute';
import type { MarketProductItem } from './MarketItemCard';
import DashboardOverlay from './DashboardOverlay';
import '../nearby-map.css';

type Props = { products: MarketProductItem[]; onClose: () => void; onInspect: (product: MarketProductItem, directions: string) => void };
type Position = { point: MapPoint; source: 'device' | 'manual'; accuracy?: number; heading?: number; measuredAt?: number };
type Placement = 'origin' | 'waypoint' | null;

export default function NearbyServicesMap({ products, onClose, onInspect }: Props) {
  const element = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null), positionLayer = useRef<L.LayerGroup | null>(null), routeLayer = useRef<L.LayerGroup | null>(null);
  const [position, setPosition] = useState<Position>(), [locationError, setLocationError] = useState(''), [locating, setLocating] = useState(false);
  const [query, setQuery] = useState(''), [radius, setRadius] = useState(10), [focusedId, setFocusedId] = useState('');
  const [waypoint, setWaypoint] = useState<MapPoint>(), [destinationName, setDestinationName] = useState('Your waypoint'), [placement, setPlacement] = useState<Placement>(null);
  const [mode, setMode] = useState<RouteMode>('walking'), [route, setRoute] = useState<MapRoute>();
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle'), [routeError, setRouteError] = useState('');
  const [originRevision, setOriginRevision] = useState(0), [routeRevision, setRouteRevision] = useState(0);
  const [following, setFollowing] = useState(false), [followCamera, setFollowCamera] = useState(true), [tracking, setTracking] = useState(false);
  const live = useRef(true), placing = useRef<Placement>(null), locationRequest = useRef(0), routeRequest = useRef(0);
  const watch = useRef<number | null>(null), watchRevision = useRef(0), lastRouteRequest = useRef(0), offRouteFixes = useRef(0);
  const lastReliablePosition = useRef<Position | undefined>(undefined);
  const navigation = useRef({ following, followCamera }); navigation.current = { following, followCamera };
  const origin = position?.point;
  const services = useMemo(() => products.filter(mappedService), [products]);
  const search = query.trim().toLowerCase();
  const matches = useMemo(() => search.length >= 2 ? services.filter(p => [p.title, p.storeName, p.serviceCategory, p.description].some(value => value?.toLowerCase().includes(search))) : [], [services, search]);
  const nearby = useMemo(() => origin ? services.filter(p => distanceKm(origin, servicePoint(p.lat, p.lng)!) <= radius).sort((a, b) => distanceKm(origin, servicePoint(a.lat, a.lng)!) - distanceKm(origin, servicePoint(b.lat, b.lng)!)) : [], [services, origin, radius]);
  const shown = search.length >= 2 ? matches : nearby, focused = services.find(p => p.id === focusedId);
  const reliablePosition = position?.source === 'device' && position.accuracy !== undefined && position.accuracy <= 80;
  const guidanceOrigin = position?.source === 'manual' || reliablePosition ? origin : lastReliablePosition.current?.point || route?.origin;
  const progress = useMemo(() => route && guidanceOrigin ? routeProgress(route, guidanceOrigin, reliablePosition ? position?.accuracy : undefined) : undefined, [route, guidanceOrigin, reliablePosition, position?.accuracy]);
  const arrived = position?.source === 'device' && !!progress?.arrived;
  const directionsTo = (point: MapPoint) => { const url = new URL(serviceDirections(point, origin)); url.searchParams.set('travelmode', mode); return url.toString(); };
  const stopGuidance = () => {
    watchRevision.current++;
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null; navigation.current.following = false; offRouteFixes.current = 0;
    setFollowing(false); setTracking(false);
  };

  const acceptDevicePosition = (value: GeolocationPosition): Position | undefined => {
    const point = servicePoint(value.coords.latitude, value.coords.longitude), accuracy = value.coords.accuracy, heading = value.coords.heading;
    if (!point || !Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(value.timestamp) || Date.now() - value.timestamp > 30000 || value.timestamp > Date.now() + 60000) return;
    const next: Position = { point, accuracy, source: 'device', measuredAt: value.timestamp, ...(heading !== null && Number.isFinite(heading) && heading >= 0 && heading < 360 ? { heading } : {}) };
    if (accuracy <= 80) lastReliablePosition.current = next;
    return next;
  };
  const locate = () => {
    setLocationError('');
    if (!navigator.geolocation) { setLocationError('Location is unavailable. Choose a starting point on the map to preview a route.'); return; }
    const request = ++locationRequest.current; setLocating(true);
    navigator.geolocation.getCurrentPosition(value => {
      if (!live.current || request !== locationRequest.current) return;
      const next = acceptDevicePosition(value); setLocating(false);
      if (!next) { setLocationError('The device returned an invalid location. Try again or choose a starting point.'); return; }
      setPosition(next); setOriginRevision(value => value + 1); map.current?.setView([next.point.lat, next.point.lng], 15);
    }, failure => {
      if (!live.current || request !== locationRequest.current) return;
      setLocating(false);
      setLocationError(failure.code === 1 ? 'Location access is off. Allow it for live guidance, or choose a starting point on the map.' : 'Your location could not be found. Try again or choose a starting point on the map.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
  };
  const beginPlacement = (kind: Placement) => { const next = placing.current === kind ? null : kind; placing.current = next; setPlacement(next); setFollowCamera(false); };
  const placePoint = (point: MapPoint, kind: Placement) => {
    if (!kind) return;
    const valid = Number.isFinite(point.lng) && servicePoint(point.lat, ((point.lng + 180) % 360 + 360) % 360 - 180);
    if (!valid) return;
    point = valid;
    stopGuidance(); placing.current = null; setPlacement(null);
    if (kind === 'origin') { locationRequest.current++; lastReliablePosition.current = undefined; setLocating(false); setPosition({ point, source: 'manual' }); setOriginRevision(value => value + 1); setLocationError(''); }
    else { setWaypoint(point); setDestinationName('Your waypoint'); setFocusedId(''); }
  };
  const selectService = (product: MarketProductItem) => {
    const point = servicePoint(product.lat, product.lng); if (!point) return;
    setFocusedId(product.id); setWaypoint(point); setDestinationName(product.title); stopGuidance();
    placing.current = null; setPlacement(null); map.current?.setView([point.lat, point.lng], 16);
  };

  useEffect(() => {
    live.current = true;
    const first = services[0] && servicePoint(services[0].lat, services[0].lng);
    const instance = L.map(element.current!, { zoomControl: false, scrollWheelZoom: false, zoomAnimation: false }).setView(first ? [first.lat, first.lng] : [0, 0], first ? 12 : 2); map.current = instance;
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(instance);
    routeLayer.current = L.layerGroup().addTo(instance); markers.current = L.layerGroup().addTo(instance); positionLayer.current = L.layerGroup().addTo(instance);
    const reflectView = () => {
      if (!live.current || map.current !== instance || !element.current) return;
      const center = instance.getCenter(); element.current.dataset.mapCenterLat = String(center.lat); element.current.dataset.mapCenterLng = String(center.lng); element.current.dataset.mapZoom = String(instance.getZoom());
    };
    instance.on('moveend zoomend', reflectView); reflectView(); instance.on('dragstart', () => setFollowCamera(false));
    instance.on('click', (event: L.LeafletMouseEvent) => placePoint({ lat: event.latlng.lat, lng: event.latlng.lng }, placing.current));
    // Leaflet 1.9 leaves its debounced wheel callback alive after remove(). Own
    // the short debounce so closing this modal cannot zoom a destroyed map.
    const container = instance.getContainer();
    let wheelTimer: ReturnType<typeof setTimeout> | undefined, wheelDelta = 0;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation();
      wheelDelta -= event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? 120 : 1);
      const point = instance.mouseEventToContainerPoint(event);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        if (!live.current || map.current !== instance || !wheelDelta) return;
        const change = Math.sign(wheelDelta) * Math.min(3, Math.ceil(Math.abs(wheelDelta) / 120)); wheelDelta = 0;
        const zoom = Math.max(instance.getMinZoom(), Math.min(instance.getMaxZoom(), instance.getZoom() + change));
        instance.setZoomAround(point, zoom, { animate: false });
      }, 80);
    };
    container.addEventListener('wheel', wheel, { passive: false });
    const resize = new ResizeObserver(() => { if (live.current && map.current === instance) instance.invalidateSize(); }); resize.observe(element.current!); locate();
    return () => {
      live.current = false; locationRequest.current++; routeRequest.current++; watchRevision.current++;
      if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
      watch.current = null; clearTimeout(wheelTimer); container.removeEventListener('wheel', wheel); resize.disconnect(); instance.remove(); map.current = null;
    };
  }, []);

  useEffect(() => {
    markers.current?.clearLayers();
    for (const product of shown) {
      const point = servicePoint(product.lat, product.lng)!;
      const root = document.createElement('div'); root.className = 'nearby-store-icon'; root.textContent = '🏪';
      if (product.storeLogoUrl) {
        try {
          const url = mapLogoUrl(product.storeLogoUrl,window.location.origin);
          if (url) {
            const img = document.createElement('img'); img.src = url; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = () => { img.remove(); root.textContent = '🏪'; }; root.textContent = ''; root.append(img);
          }
        } catch { /* Invalid profile URLs use the store icon. */ }
      }
      const marker = L.marker([point.lat, point.lng], { title: `${product.storeName}: ${product.title}`, icon: L.divIcon({ html: root, className: '', iconSize: [42, 42], iconAnchor: [21, 21] }), draggable: false });
      marker.on('click', () => placing.current ? placePoint(point, placing.current) : selectService(product));
      marker.on('add', () => { marker.getElement()?.setAttribute('aria-label', `Route to ${product.title} on map`); marker.getElement()?.setAttribute('data-service-marker', product.id); }); markers.current?.addLayer(marker);
    }
  }, [shown]);

  useEffect(() => {
    const request = ++routeRequest.current, abort = new AbortController();
    setRoute(undefined); setRouteError(''); offRouteFixes.current = 0;
    if (!origin || !waypoint) { setRouteState('idle'); return () => abort.abort(); }
    setRouteState('loading'); lastRouteRequest.current = Date.now();
    void fetchMapRoute(origin, waypoint, mode, { signal: abort.signal }).then(next => {
      if (!live.current || abort.signal.aborted || request !== routeRequest.current) return;
      setRoute(next); setRouteState('ready');
      if (!navigation.current.following) map.current?.fitBounds(L.latLngBounds([...next.points, next.origin, next.destination].map(p => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 17 });
    }).catch(failure => {
      if (!live.current || abort.signal.aborted || request !== routeRequest.current) return;
      stopGuidance(); setRouteState('error'); setRouteError(failure.message || 'The route could not be found. Try again or open Google Maps.');
    });
    return () => abort.abort();
    // GPS fixes update progress; only explicit changes or confirmed deviations reroute.
  }, [waypoint?.lat, waypoint?.lng, mode, originRevision, routeRevision]);

  useEffect(() => {
    positionLayer.current?.clearLayers(); if (!positionLayer.current) return;
    if (origin) {
      if (!waypoint) L.circle([origin.lat, origin.lng], { radius: radius * 1000, color: '#003566', weight: 1, fillOpacity: .06, interactive: false }).addTo(positionLayer.current);
      if (position?.source === 'device' && position.accuracy) L.circle([origin.lat, origin.lng], { radius: position.accuracy, color: '#2577d9', weight: 1, fillOpacity: .1, interactive: false }).addTo(positionLayer.current);
      const icon = document.createElement('span'); icon.className = 'nearby-location-dot';
      if (position?.source === 'device' && position.heading !== undefined) { icon.classList.add('has-heading'); icon.style.setProperty('--location-heading', `${position.heading}deg`); }
      L.marker([origin.lat, origin.lng], { interactive: false, icon: L.divIcon({ html: icon, className: 'nearby-location-marker', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(positionLayer.current);
    }
    if (waypoint) {
      const icon = document.createElement('span'); icon.className = 'nearby-waypoint-pin'; icon.textContent = '●';
      L.marker([waypoint.lat, waypoint.lng], { title: 'Your destination', interactive: false, icon: L.divIcon({ html: icon, className: '', iconSize: [28, 34], iconAnchor: [14, 33] }) }).addTo(positionLayer.current);
    }
  }, [position, radius, waypoint]);

  useEffect(() => {
    routeLayer.current?.clearLayers(); if (!route || !routeLayer.current) return;
    const points = (progress?.remainingPoints.length ? progress.remainingPoints : route.points).map(point => [point.lat, point.lng] as L.LatLngTuple);
    const options = { interactive: false, lineCap: 'round' as const, lineJoin: 'round' as const };
    L.polyline(points, { ...options, color: '#001d3d', opacity: .85, weight: 10, className: 'nearby-route-casing' }).addTo(routeLayer.current);
    L.polyline(points, { ...options, color: '#ffd60a', opacity: 1, weight: 6, className: 'nearby-route-path' }).addTo(routeLayer.current).getElement()?.setAttribute('data-route-path', 'true');
    L.polyline(points, { ...options, color: '#fff7c2', opacity: .8, weight: 2, dashArray: '2 18', className: 'nearby-route-flow' }).addTo(routeLayer.current);
  }, [route, progress]);

  useEffect(() => {
    if (!following || !navigator.geolocation) return;
    let epoch = ++watchRevision.current;
    const stop = () => { watchRevision.current++; if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; if (live.current) setTracking(false); };
    const start = () => {
      stop(); if (document.hidden) return; epoch = ++watchRevision.current; const activeEpoch = epoch; setTracking(true); setLocationError('');
      watch.current = navigator.geolocation.watchPosition(value => {
        if (!live.current || watchRevision.current !== activeEpoch || document.hidden) return;
        const next = acceptDevicePosition(value); if (!next) return;
        setPosition(next); setLocationError('');
        if (navigation.current.followCamera && next.accuracy! <= 80) map.current?.setView([next.point.lat, next.point.lng], Math.max(16, map.current.getZoom()), { animate: false });
      }, failure => {
        if (!live.current || watchRevision.current !== activeEpoch) return;
        setLocationError(failure.code === 1 ? 'Live location access was denied. Your route preview is still available.' : 'Live location was interrupted. Use my location to reconnect.'); stopGuidance(); stop();
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 });
    };
    const visibility = () => { if (document.hidden) stop(); else start(); };
    start(); document.addEventListener('visibilitychange', visibility);
    return () => { watchRevision.current++; stop(); document.removeEventListener('visibilitychange', visibility); };
  }, [following]);

  useEffect(() => {
    if (!following || !progress) { offRouteFixes.current = 0; return; }
    if (progress.arrived) { stopGuidance(); return; }
    if (!progress.offRoute || !progress.reliableLocation) { offRouteFixes.current = 0; return; }
    offRouteFixes.current++;
    if (offRouteFixes.current >= 2 && Date.now() - lastRouteRequest.current >= 15000) { offRouteFixes.current = 0; setRouteRevision(value => value + 1); }
  }, [following, origin?.lat, origin?.lng, position?.measuredAt, progress?.offRoute, progress?.arrived, progress?.reliableLocation]);

  const clearWaypoint = () => { routeRequest.current++; setWaypoint(undefined); setRoute(undefined); setRouteState('idle'); setRouteError(''); setFocusedId(''); stopGuidance(); placing.current = null; setPlacement(null); };
  const showOverview = () => { setFollowCamera(false); if (route) map.current?.fitBounds(L.latLngBounds([...route.points, route.origin, route.destination].map(point => [point.lat, point.lng])), { padding: [36, 36], maxZoom: 17 }); };
  const recenter = () => { setFollowCamera(true); if (origin) map.current?.setView([origin.lat, origin.lng], 16, { animate: false }); };
  const distanceToWaypoint = guidanceOrigin && waypoint ? distanceKm(guidanceOrigin, waypoint) * 1000 : 0;
  const finalApproach = !!route && !!progress && position?.source === 'device' && progress.remainingMeters < 20 && !arrived && distanceToWaypoint > 35;
  const remainingMeters = Math.max(progress?.remainingMeters ?? route?.distanceMeters ?? 0, distanceToWaypoint), remainingSeconds = progress?.remainingSeconds ?? route?.durationSeconds ?? 0;

  return <DashboardOverlay aria-label="Services near you" onClose={onClose} className="fixed inset-0 bg-white">
    <div className="nearby-services-screen flex h-dvh w-full flex-col bg-white" data-route-state={routeState} data-route-points={route?.points.length || 0} data-origin-source={position?.source || ''} data-origin-lat={origin?.lat} data-origin-lng={origin?.lng} data-waypoint-lat={waypoint?.lat} data-waypoint-lng={waypoint?.lng} data-following={following}>
      <header className="nearby-map-header z-10 shrink-0 space-y-2 border-b border-blue-200 bg-white/95 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><MapPin size={20} />Services near you</h2><div className="flex gap-2">{following && <button type="button" onClick={stopGuidance} aria-label="Stop live guidance" className="nearby-map-action"><Pause size={14} />Stop</button>}<button type="button" onClick={onClose} aria-label="Close services map" className="rounded-xl p-2 text-slate-700"><X size={22} /></button></div></div>
        <div className="flex flex-wrap gap-2"><input aria-label="Search PineVela services on map" value={query} maxLength={120} onChange={e => { setQuery(e.target.value); setFocusedId(''); }} placeholder="Search a service or store" className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900" /><select aria-label="Nearby service radius" value={radius} onChange={e => setRadius(Number(e.target.value))} className="rounded-xl border border-blue-200 bg-white p-2 text-sm text-slate-900">{[5, 10, 25].map(km => <option key={km} value={km}>{km} km</option>)}</select><button type="button" onClick={locate} disabled={locating} className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><LocateFixed size={16} />{locating ? 'Finding location…' : 'Use my location'}</button></div>
        {locationError && <p role="alert" className="text-xs leading-5 text-rose-700">{locationError}</p>}
        <p className="text-xs text-slate-600">{search.length >= 2 ? `${shown.length} matching services across all locations` : origin ? `${shown.length} services within ${radius} km${position?.source === 'device' ? ` · accuracy about ${Math.round(position.accuracy || 0)} m` : ' · chosen starting point'}` : 'Search for a service, or choose your starting point and waypoint on the map.'}</p>
      </header>
      <div className="relative min-h-0 flex-1"><div ref={element} role="region" aria-label="Waypoint map" className="nearby-map h-full w-full" data-placement={placement || ''} />
        {(shown.length > 0 || focused) && <aside aria-label="Mapped services" className="nearby-map-results absolute left-3 top-3 z-[500] max-h-[40%] w-64 max-w-[calc(100%_-_5rem)] space-y-2 overflow-y-auto rounded-2xl border border-blue-200 bg-white/95 p-3 shadow-lg">{shown.slice(0, 30).map(product => <button type="button" key={product.id} onClick={() => selectService(product)} className="block w-full rounded-xl px-2 py-2 text-left hover:bg-blue-50" data-map-search-result={product.id}><span className="block text-xs font-bold text-slate-900">{product.title}</span><span className="block text-[11px] text-slate-500">{product.storeName}{origin ? ` · ${distanceKm(origin, servicePoint(product.lat, product.lng)!).toFixed(1)} km away` : ''}</span></button>)}{focused && <button type="button" onClick={() => onInspect(focused, directionsTo(servicePoint(focused.lat, focused.lng)!))} className="w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">View service details</button>}</aside>}
        {following && <button type="button" onClick={recenter} aria-pressed={followCamera} className="absolute bottom-4 left-3 z-[500] inline-flex items-center gap-2 rounded-full border border-yellow-400 bg-blue-950 px-4 py-3 text-xs font-bold text-yellow-300 shadow-lg"><LocateFixed size={16} />{followCamera ? 'Following you' : 'Recenter'}</button>}
        {placement && <div className="nearby-placement-hint absolute inset-x-3 bottom-4 z-[500] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-yellow-400/60 bg-blue-950 p-3 text-xs font-semibold text-yellow-100 shadow-lg"><p>Tap the map to set {placement === 'origin' ? 'your starting point' : 'your waypoint'}.</p><button type="button" onClick={() => { const center = map.current?.getCenter(); if (center) placePoint({ lat: center.lat, lng: center.lng }, placement); }} className="shrink-0 rounded-xl bg-yellow-400 px-3 py-2 font-bold text-blue-950">Use map center</button></div>}
      </div>
      <footer className="nearby-map-footer shrink-0 space-y-3 border-t border-blue-200 bg-white p-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => beginPlacement('waypoint')} aria-pressed={placement === 'waypoint'} className="nearby-map-action"><Flag size={14} />{placement === 'waypoint' ? 'Cancel waypoint' : 'Set a waypoint'}</button><button type="button" onClick={() => beginPlacement('origin')} aria-pressed={placement === 'origin'} className="nearby-map-action"><Crosshair size={14} />{placement === 'origin' ? 'Cancel starting point' : 'Set starting point'}</button>{waypoint && <button type="button" onClick={clearWaypoint} className="nearby-map-action">Clear waypoint</button>}</div>
          <div role="group" aria-label="Travel mode" className="nearby-travel-modes inline-flex rounded-xl border border-blue-200 p-1">{([{ value: 'walking', label: 'Walk', icon: Footprints }, { value: 'driving', label: 'Drive', icon: Car }] as const).map(item => <button type="button" key={item.value} aria-pressed={mode === item.value} onClick={() => { setMode(item.value); stopGuidance(); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold"><item.icon size={14} />{item.label}</button>)}</div>
        </div>
        {waypoint && <section aria-label="Waypoint directions" className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="flex items-center gap-2 text-sm font-extrabold text-blue-950"><Route size={17} />{arrived ? 'You have arrived' : routeState === 'loading' ? 'Finding your route…' : following ? tracking ? 'Follow the yellow trail' : 'Live guidance paused' : 'Route to'} <span className="truncate">{!arrived && destinationName}</span></h3>
            {route && <p role="status" className="mt-1 text-xs font-semibold text-slate-600">{formatRouteDistance(remainingMeters)} · {finalApproach ? 'near the waypoint' : `about ${formatRouteDuration(remainingSeconds)}`}{position?.source === 'manual' ? ' · route preview' : following ? ' · live location' : ''}</p>}
          </div><div className="flex gap-2">{route && <button type="button" onClick={showOverview} className="nearby-map-action">Route overview</button>}<a href={directionsTo(waypoint)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="nearby-map-action"><Navigation size={14} />Google Maps</a></div></div>
          {!origin && <p role="status" className="text-xs text-slate-600">Use your location or set a starting point to draw the route.</p>}
          {routeError && <p role="alert" className="text-xs leading-5 text-rose-700">{routeError}<button type="button" onClick={() => setRouteRevision(value => value + 1)} className="ml-2 font-bold underline">Try route again</button></p>}
          {route && !arrived && <p className="text-sm font-semibold leading-6 text-blue-950">{finalApproach ? 'The mapped trail ends near your waypoint. Check the entrance on the map.' : progress?.offRoute ? 'You are away from the route. Reconnecting to nearby roads…' : progress?.nextStep?.instruction || 'Follow the yellow trail to your destination.'}{following && progress && !progress.offRoute && !finalApproach && progress.metersToNextStep > 20 && <span className="ml-2 text-xs font-medium text-slate-500">{formatRouteDistance(progress.metersToNextStep)}</span>}</p>}
          {following && position?.accuracy !== undefined && position.accuracy > 80 && <p role="status" className="text-xs text-amber-800">Location accuracy is low. Waiting for a clearer fix before checking turns or arrival.</p>}
          {route && <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={position?.source !== 'device' || arrived} onClick={() => { if (following) stopGuidance(); else { setFollowing(true); setFollowCamera(true); } }} className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-xs font-extrabold text-blue-950 disabled:opacity-50">{following ? <Pause size={15} /> : <Navigation size={15} />}{following ? 'Stop following' : 'Start following'}</button>{position?.source === 'manual' && <span className="text-xs text-slate-500">Use my location for live guidance.</span>}{progress?.offRoute && <button type="button" onClick={() => setRouteRevision(value => value + 1)} className="nearby-map-action">Recalculate route</button>}
            <details className="nearby-route-steps w-full"><summary className="flex w-fit cursor-pointer items-center gap-1 py-1 text-xs font-bold text-blue-700">All directions<ChevronDown size={13} /></summary><ol className="mt-2 max-h-32 space-y-2 overflow-y-auto border-l-2 border-yellow-400 pl-4 text-xs leading-5 text-slate-700">{route.steps.map((step, index) => <li key={index}>{step.instruction} <span className="text-slate-500">· {formatRouteDistance(step.distanceMeters)}</span></li>)}</ol></details>
          </div>}
        </section>}
        <p className="nearby-map-privacy text-[10px] leading-4 text-slate-500">Location stays out of PineVela storage. Map tiles: OpenStreetMap. Drawing routes shares selected points with Valhalla; opening Google Maps shares them with Google.</p>
      </footer>
    </div>
  </DashboardOverlay>;
}
