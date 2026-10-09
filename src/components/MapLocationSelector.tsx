import React, { useEffect, useRef, useState } from 'react';
import { safeJson } from '../lib/api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Search,
  Navigation,
  CheckCircle2,
  Copy,
  Check,
  Compass,
  Building,
  RotateCcw,
  Sparkles,
  Layers,
  Map as MapIcon
} from 'lucide-react';

// Configure standard high-contrast pin icon
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export interface ReverseGeocodedAddress {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  district?: string;
  country?: string;
  postalCode?: string;
  landmark?: string;
  digitalAddress?: string;
  formattedAddress?: string;
}

export interface MapLocationSelectorProps {
  latitude: number;
  longitude: number;
  onLocationChange: (data: {
    lat: number;
    lng: number;
    formattedAddress: string;
    addressDetails?: ReverseGeocodedAddress;
  }) => void;
  initialAddressHint?: string;
  disabled?: boolean;
}

// KNUST & Kumasi Student Residential & Campus Hubs
const GHANA_CAMPUS_PRESETS = [
  { name: 'KNUST, Kumasi', lat: 6.6745, lng: -1.5716, region: 'Ashanti', city: 'Kumasi' },
  { name: 'Ayeduase (KNUST Gate)', lat: 6.6702, lng: -1.5643, region: 'Ashanti', city: 'Kumasi' },
  { name: 'Kotei (KNUST Gate)', lat: 6.6621, lng: -1.5582, region: 'Ashanti', city: 'Kumasi' },
  { name: 'Kentinkrono (KNUST Area)', lat: 6.6854, lng: -1.5598, region: 'Ashanti', city: 'Kumasi' },
  { name: 'Bomso (KNUST Area)', lat: 6.6811, lng: -1.5835, region: 'Ashanti', city: 'Kumasi' },
  { name: 'Gaza / Gaza-Ayeduase', lat: 6.6685, lng: -1.5661, region: 'Ashanti', city: 'Kumasi' }
];

export default function MapLocationSelector({
  latitude,
  longitude,
  onLocationChange,
  initialAddressHint,
  disabled = false
}: MapLocationSelectorProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [searchQuery, setSearchQuery] = useState(initialAddressHint || '');
  const [isSearching, setIsSearching] = useState(false);
  const [mapError, setMapError] = useState('');
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [detectedAddress, setDetectedAddress] = useState<string>('');
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize interactive Leaflet map instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialLat = latitude && !isNaN(latitude) ? latitude : 5.6506;
    const initialLng = longitude && !isNaN(longitude) ? longitude : -0.1866;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: true
      });

      // Add OpenStreetMap default tile layer
      const layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);
      tileLayerRef.current = layer;

      // Add draggable Marker Pin
      const marker = L.marker([initialLat, initialLng], {
        draggable: !disabled,
        title: 'Drag or click to position exact hostel entrance'
      }).addTo(map);

      marker.bindPopup(
        `<div style="font-size:12px;font-family:sans-serif;">
          <strong style="color:#0F172A;">Hostel Location Pin</strong><br/>
          <span style="color:#64748B;">Drag marker or click anywhere on the map</span>
        </div>`
      );

      // Handle marker drag completion
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        handleUpdateCoordinates(pos.lat, pos.lng);
      });

      // Handle direct map click
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (disabled) return;
        marker.setLatLng(e.latlng);
        handleUpdateCoordinates(e.latlng.lat, e.latlng.lng);
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;

      // Ensure smooth re-renders when container size changes or toggles
      const resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);

      return () => {
        resizeObserver.disconnect();
        map.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      };
    }
  }, []);

  // Update map center when props change from external source
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && latitude && longitude) {
      const currentPos = markerRef.current.getLatLng();
      if (Math.abs(currentPos.lat - latitude) > 0.0001 || Math.abs(currentPos.lng - longitude) > 0.0001) {
        markerRef.current.setLatLng([latitude, longitude]);
        mapInstanceRef.current.panTo([latitude, longitude]);
      }
    }
  }, [latitude, longitude]);

  // Toggle map layer (OpenStreetMap vs Satellite)
  const toggleMapStyle = () => {
    if (!mapInstanceRef.current) return;
    const nextStyle = mapStyle === 'streets' ? 'satellite' : 'streets';
    setMapStyle(nextStyle);

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    if (nextStyle === 'satellite') {
      tileLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
          maxZoom: 18
        }
      ).addTo(mapInstanceRef.current);
    } else {
      tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(mapInstanceRef.current);
    }
  };

  // Reverse geocode selected coordinates and emit structured address parts
  const handleUpdateCoordinates = async (lat: number, lng: number) => {
    const roundedLat = Number(lat.toFixed(6));
    const roundedLng = Number(lng.toFixed(6));
    setIsReverseGeocoding(true);

    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${roundedLat}&lon=${roundedLng}&zoom=18&addressdetails=1`,
        { headers: { 'User-Agent': 'PineVela-Hostel-App/2.0' } }
      );

      if (resp.ok) {
        const data = await safeJson(resp);
        const address = data.address || {};
        const displayName = data.display_name || '';

        // Extract structured components
        const structured: ReverseGeocodedAddress = {
          addressLine1: address.road || address.pedestrian || address.neighbourhood || '',
          addressLine2: address.suburb || address.quarter || address.hamlet || '',
          city: address.city || address.town || address.village || address.municipality || 'Accra',
          region: address.state || address.region || address.county || 'Greater Accra',
          district: address.county || address.district || address.city_district || '',
          country: address.country || 'Ghana',
          postalCode: address.postcode || '',
          landmark: address.amenity || address.building || address.shop || address.tourism || '',
          formattedAddress: displayName
        };

        setDetectedAddress(displayName);

        if (markerRef.current) {
          const shortAddress = displayName.length > 60 ? `${displayName.substring(0, 60)}...` : displayName;
          markerRef.current
            .setPopupContent(
              `<div style="font-size:12px;font-family:sans-serif;">
                <strong style="color:#0F172A;">Hostel Pin (${roundedLat}, ${roundedLng})</strong><br/>
                <span style="color:#2563EB;">${shortAddress}</span>
              </div>`
            )
            .openPopup();
        }

        onLocationChange({
          lat: roundedLat,
          lng: roundedLng,
          formattedAddress: displayName,
          addressDetails: structured
        });
        return;
      }
    } catch (err) {
      console.warn('Reverse geocoding network notice:', err);
    } finally {
      setIsReverseGeocoding(false);
    }

    // Fallback if network fails
    const fallbackDesc = `Coordinates: ${roundedLat}, ${roundedLng}`;
    setDetectedAddress(fallbackDesc);
    onLocationChange({
      lat: roundedLat,
      lng: roundedLng,
      formattedAddress: fallbackDesc
    });
  };

  // Search Address / Landmark via Nominatim Geocoding
  const handleSearch = async (e?: React.FormEvent | React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const queryStr = (searchQuery || '').toLowerCase().includes('ghana') ? searchQuery : `${searchQuery}, Ghana`;
      const encoded = encodeURIComponent(queryStr);
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1&addressdetails=1`,
        { headers: { 'User-Agent': 'PineVela-Hostel-App/2.0' } }
      );

      if (resp.ok) {
        const results = await safeJson(resp);
        if (results && results.length > 0) {
          const first = results[0];
          const lat = parseFloat(first.lat);
          const lon = parseFloat(first.lon);

          if (mapInstanceRef.current && markerRef.current) {
            mapInstanceRef.current.setView([lat, lon], 16);
            markerRef.current.setLatLng([lat, lon]);
            handleUpdateCoordinates(lat, lon);
          }
        }
      }
    } catch (err) {
      console.warn('Geocoding search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Locate Current User Geolocation
  const handleUseCurrentLocation = () => {
    setMapError('');
    if (!navigator.geolocation) {
      setMapError('Geolocation is not supported by your browser.');
      return;
    }

    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGeolocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([lat, lng], 17);
          markerRef.current.setLatLng([lat, lng]);
          handleUpdateCoordinates(lat, lng);
        }
      },
      (err) => {
        setIsGeolocating(false);
        console.warn('Geolocation access failed:', err.message);
        setMapError('Could not detect your position. Select a location on the map.');
      },
      { timeout: 12000, enableHighAccuracy: true }
    );
  };

  const copyCoordinates = () => {
    navigator.clipboard.writeText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  return (
    <div className="space-y-4">
      {mapError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{mapError}</p>}
      {/* Top Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <input aria-label="Search campus, district, road or Ghanaian landmark..."
            type="text"
            placeholder="Search campus, district, road or Ghanaian landmark..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleSearch(e);
              }
            }}
            disabled={disabled}
            className="w-full pl-9 pr-24 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent text-slate-800 shadow-xs"
          />
          <Search className="absolute left-3 top-3 text-slate-400" size={15} />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSearch(e);
            }}
            disabled={isSearching || disabled}
            className="absolute right-1.5 top-1.5 px-3 py-1.5 bg-blue-900 hover:bg-blue-850 text-white rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
          >
            {isSearching ? <span>Searching...</span> : <span>Find Place</span>}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Use Current Geolocation */}
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isGeolocating || disabled}
            title="Locate via device GPS"
            className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Navigation size={14} className={isGeolocating ? 'animate-spin text-blue-600' : 'text-slate-600'} />
            <span className="hidden sm:inline">Current GPS</span>
          </button>

          {/* Toggle Satellite / Streets */}
          <button
            type="button"
            onClick={toggleMapStyle}
            title="Toggle Map Style"
            className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Layers size={14} className="text-slate-600" />
            <span className="capitalize">{mapStyle}</span>
          </button>
        </div>
      </div>

      {/* Quick Campus Hub Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
        <span className="text-slate-400 font-bold text-[10px] uppercase shrink-0 flex items-center gap-1">
          <Building size={11} /> Quick Hubs:
        </span>
        {GHANA_CAMPUS_PRESETS.map((hub) => (
          <button
            key={hub.name}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (mapInstanceRef.current && markerRef.current) {
                mapInstanceRef.current.setView([hub.lat, hub.lng], 16);
                markerRef.current.setLatLng([hub.lat, hub.lng]);
                handleUpdateCoordinates(hub.lat, hub.lng);
              }
            }}
            className="px-2.5 py-1 bg-slate-50 hover:bg-blue-50 hover:text-blue-900 border border-slate-200 rounded-lg text-slate-600 font-semibold shrink-0 transition-colors"
          >
            {hub.name}
          </button>
        ))}
      </div>

      {/* Interactive Map Container */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
        <div
          ref={mapContainerRef}
          className="w-full h-72 sm:h-80 md:h-96 z-10 bg-slate-100"
          style={{ minHeight: '300px' }}
        />

        {/* Live Pin Information Floating Badge */}
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-md z-20 bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200/80 shadow-lg text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  {isReverseGeocoding ? 'Reverse-geocoding Pin...' : 'Selected Location Coordinates'}
                </p>
              </div>
              <p className="text-xs font-mono font-bold text-slate-900">
                Lat: {latitude.toFixed(6)}, Lng: {longitude.toFixed(6)}
              </p>
              {detectedAddress && (
                <p className="text-[11px] font-medium text-slate-600 line-clamp-2 mt-0.5">
                  {detectedAddress}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={copyCoordinates}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors shrink-0"
              title="Copy GPS coordinates"
            >
              {copiedCoords ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Reverse Geocoding Status Note */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-blue-600 shrink-0" />
          <span>
            Pin accurately positioned on campus. Address fields in Step 2 will be automatically synchronized.
          </span>
        </div>
        <span className="font-mono text-[10px] font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200 shrink-0">
          Precision: ±2m
        </span>
      </div>
    </div>
  );
}
