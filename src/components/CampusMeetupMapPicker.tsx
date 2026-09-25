import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Search, Navigation, CheckCircle2, Copy, Check, ExternalLink, Compass, School } from 'lucide-react';

// Fix Leaflet default icon paths in modern Vite bundlers
const MeetupPinIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = MeetupPinIcon;

interface CampusMeetupMapPickerProps {
  latitude?: number;
  longitude?: number;
  initialLocationName?: string;
  readOnly?: boolean;
  onLocationSelect?: (data: { locationName: string; latitude: number; longitude: number }) => void;
  onClose?: () => void;
  preferredUniversity?: string;
}

// KNUST Kumasi Campus & Residential Hubs
const CAMPUS_HUBS: { name: string; university: string; lat: number; lng: number; spots: string[] }[] = [
  {
    name: 'KNUST - Commercial Area / Library',
    university: 'Kwame Nkrumah University of Science and Technology',
    lat: 6.6745,
    lng: -1.5716,
    spots: ['KNUST Main Library Car Park', 'Commercial Area (Banks)', 'Republic Hall Forecourt', 'Unity Hall (Conti) Entrance', 'Great Hall Forecourt']
  },
  {
    name: 'KNUST - Ayeduase Gate Hub',
    university: 'Kwame Nkrumah University of Science and Technology',
    lat: 6.6702,
    lng: -1.5643,
    spots: ['Ayeduase Gate Police Station', 'Gaza Road Junction', 'Brunei Complex Gate', 'Evandy Hostel Junction']
  },
  {
    name: 'KNUST - Kotei Gate Hub',
    university: 'Kwame Nkrumah University of Science and Technology',
    lat: 6.6621,
    lng: -1.5582,
    spots: ['Kotei Station', 'Evandy Hostel Forecourt', 'Boadi Junction', 'Engineering Gate']
  },
  {
    name: 'KNUST - Kentinkrono / Bomso Hub',
    university: 'Kwame Nkrumah University of Science and Technology',
    lat: 6.6854,
    lng: -1.5598,
    spots: ['Kentinkrono Junction', 'Bomso Hospital Gate', 'Tech Junction Station']
  }
];

export default function CampusMeetupMapPicker({
  latitude,
  longitude,
  initialLocationName = '',
  readOnly = false,
  onLocationSelect,
  onClose,
  preferredUniversity
}: CampusMeetupMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Auto-detect default center based on preferred university or coordinates
  const defaultHub = CAMPUS_HUBS.find(h => 
    preferredUniversity && h.university.toLowerCase().includes(preferredUniversity.toLowerCase())
  ) || CAMPUS_HUBS[0];

  const [currentLat, setCurrentLat] = useState<number>(
    latitude && !isNaN(latitude) && latitude !== 0 ? latitude : defaultHub.lat
  );
  const [currentLng, setCurrentLng] = useState<number>(
    longitude && !isNaN(longitude) && longitude !== 0 ? longitude : defaultHub.lng
  );
  const [locationName, setLocationName] = useState<string>(initialLocationName || defaultHub.spots[0]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isGeolocating, setIsGeolocating] = useState<boolean>(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState<boolean>(false);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const startLat = currentLat;
    const startLng = currentLng;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [startLat, startLng],
        zoom: 16,
        zoomControl: true,
        scrollWheelZoom: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      const marker = L.marker([startLat, startLng], {
        draggable: !readOnly,
        title: readOnly ? 'Meetup Location' : 'Drag to adjust exact meetup location'
      }).addTo(map);

      marker.bindPopup(`<b>📍 Campus Meetup Spot</b><br/>${locationName || 'Selected Location'}`);

      if (!readOnly) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          handleCoordsChanged(pos.lat, pos.lng);
        });

        map.on('click', (e: L.LeafletMouseEvent) => {
          marker.setLatLng(e.latlng);
          handleCoordsChanged(e.latlng.lat, e.latlng.lng);
        });
      }

      mapInstanceRef.current = map;
      markerRef.current = marker;

      // Handle container resizing
      const observer = new ResizeObserver(() => {
        map.invalidateSize();
      });
      observer.observe(mapContainerRef.current);

      return () => {
        observer.disconnect();
        map.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      };
    }
  }, []);

  const handleCoordsChanged = async (lat: number, lng: number) => {
    setCurrentLat(lat);
    setCurrentLng(lng);

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setPopupContent(`<b>📍 Campus Meetup Spot</b><br/>Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`);
    }

    if (!readOnly) {
      // Reverse geocode via OpenStreetMap Nominatim
      setIsReverseGeocoding(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.display_name) {
            const shortName = data.address?.amenity || data.address?.building || data.address?.road || data.address?.suburb || data.display_name.split(',')[0];
            if (shortName && (!locationName || locationName.includes('Library') || locationName.includes('Car Park'))) {
              setLocationName(shortName);
            }
          }
        }
      } catch (err) {
        console.warn('Reverse geocode error:', err);
      } finally {
        setIsReverseGeocoding(false);
      }
    }
  };

  const handleSelectCampusHub = (hub: typeof CAMPUS_HUBS[0], spot?: string) => {
    const lat = hub.lat;
    const lng = hub.lng;
    const loc = spot || hub.spots[0];

    setCurrentLat(lat);
    setCurrentLng(lng);
    setLocationName(loc);

    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([lat, lng], 17);
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setPopupContent(`<b>📍 ${loc}</b><br/>${hub.name}`);
      markerRef.current.openPopup();
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGeolocating(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCurrentLat(lat);
        setCurrentLng(lng);
        setLocationName('My Current Live Campus Location');

        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([lat, lng], 17);
          markerRef.current.setLatLng([lat, lng]);
          markerRef.current.setPopupContent('<b>📍 Your Current Location</b>');
          markerRef.current.openPopup();
        }
        handleCoordsChanged(lat, lng);
      },
      (err) => {
        setIsGeolocating(false);
        console.warn('Geolocation failed:', err.message);
        alert('Could not detect your exact position. Please click or drag the marker manually on the campus map.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSearchAddress = async (e?: React.FormEvent | React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!searchQuery.trim()) return;

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery + ' Ghana')}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const first = data[0];
          const lat = parseFloat(first.lat);
          const lng = parseFloat(first.lon);
          setCurrentLat(lat);
          setCurrentLng(lng);
          setLocationName(searchQuery);

          if (mapInstanceRef.current && markerRef.current) {
            mapInstanceRef.current.setView([lat, lng], 17);
            markerRef.current.setLatLng([lat, lng]);
            markerRef.current.setPopupContent(`<b>📍 ${searchQuery}</b>`);
            markerRef.current.openPopup();
          }
        } else {
          alert(`No exact location match for "${searchQuery}". Try a campus landmark like "KNUST Commercial Area" or drag the marker directly.`);
        }
      }
    } catch (err) {
      console.warn('Search error:', err);
    }
  };

  const handleCopyCoords = () => {
    const text = `${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const handleConfirmLocation = () => {
    if (onLocationSelect) {
      onLocationSelect({
        locationName: locationName.trim() || 'Designated Campus Meetup Spot',
        latitude: currentLat,
        longitude: currentLng
      });
    }
    if (onClose) onClose();
  };

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${currentLat},${currentLng}`;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5 text-blue-300 animate-spin-slow" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black tracking-tight">
              {readOnly ? 'Verified Campus Meetup Location' : 'Select Exact Campus Meetup Spot'}
            </h3>
            <p className="text-[11px] text-blue-200 font-medium">
              {readOnly
                ? 'Review the precise GPS coordinates pinned by the student buyer'
                : 'Click or drag the marker on the map to pin where you want to meet'}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer text-xs font-bold"
          >
            ✕
          </button>
        )}
      </div>

      {/* Control Bar (When not readOnly) */}
      {!readOnly && (
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 space-y-3">
          {/* Search + GPS Button */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search campus landmark (e.g. Balme Library, KNUST Commercial Area)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSearchAddress(e);
                  }
                }}
                className="w-full pl-9 pr-20 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSearchAddress(e);
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
              >
                Search
              </button>
            </div>

            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isGeolocating}
              className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Navigation className={`w-3.5 h-3.5 text-blue-600 ${isGeolocating ? 'animate-pulse' : ''}`} />
              <span>{isGeolocating ? 'Locating...' : 'Use My GPS'}</span>
            </button>
          </div>

          {/* Quick Campus Hub Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1">
              <School className="w-3 h-3 text-slate-400" />
              Quick Hubs:
            </span>
            {CAMPUS_HUBS.map((hub, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectCampusHub(hub)}
                className="px-2.5 py-1 bg-white hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 shrink-0 transition-colors cursor-pointer"
              >
                {hub.name.split(' - ')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map Container */}
      <div className="relative w-full h-72 sm:h-80 bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Coordinates Chip */}
        <div className="absolute top-3 right-3 z-[400] bg-slate-900/90 backdrop-blur-md text-white px-3 py-1.5 rounded-xl border border-slate-700 shadow-lg flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="text-[11px] font-mono font-bold">
            {currentLat.toFixed(5)}, {currentLng.toFixed(5)}
          </div>
          <button
            type="button"
            onClick={handleCopyCoords}
            className="p-1 hover:bg-white/20 rounded-md transition-colors cursor-pointer"
            title="Copy GPS coordinates"
          >
            {copiedCoords ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-300" />}
          </button>
        </div>

        {!readOnly && (
          <div className="absolute bottom-3 left-3 z-[400] bg-blue-900/90 backdrop-blur-md text-white px-3 py-1 rounded-lg text-[10px] font-semibold shadow-md pointer-events-none">
            💡 Click anywhere or drag the red pin to select spot
          </div>
        )}
      </div>

      {/* Footer Location Details & Actions */}
      <div className="p-4 sm:p-5 bg-white border-t border-slate-200 space-y-3.5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>Meetup Landmark / Description</span>
            </label>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>Open in Google Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {!readOnly ? (
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g. KNUST Commercial Area near CalBank ATM"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="text-xs font-black text-blue-950">{locationName || 'Campus Landmark'}</div>
              <div className="text-[10px] text-blue-700 font-mono mt-0.5">
                Exact Coordinates: {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-slate-500 font-medium hidden sm:block">
            {!readOnly ? 'Coordinates will be transmitted to the seller for confirmation.' : 'GPS Verified Location'}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {readOnly ? 'Close' : 'Cancel'}
              </button>
            )}

            {!readOnly && onLocationSelect && (
              <button
                type="button"
                onClick={handleConfirmLocation}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Attach Location</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
