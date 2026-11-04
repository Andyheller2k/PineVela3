import { useEffect,useId,useRef,useState } from 'react';
import { MapPin } from 'lucide-react';
import { sessionFetch } from '../lib/session';
import { useAuth } from '../context/AuthContext';
import DashboardOverlay from './DashboardOverlay';
import CampusMeetupMapPicker from './LazyCampusMeetupMapPicker';

type Place = {label:string;latitude:number;longitude:number};
const recordedPoint=(value:string)=>{
  const parts=value.match(/\((-?\d{1,2}\.\d{6}),\s*(-?\d{1,3}\.\d{6})\)$/);
  return parts&&Math.abs(Number(parts[1]))<=90&&Math.abs(Number(parts[2]))<=180?{latitude:Number(parts[1]),longitude:Number(parts[2])}:null;
};

/** Suggestions fetch only while typing; the lazy map runs only while open. */
export default function StoreLocationInput({value,onChange,error}:{value:string;onChange:(value:string)=>void;error?:string}) {
  const id=useId(),input=useRef<HTMLInputElement>(null),{user}=useAuth();
  const [places,setPlaces]=useState<Place[]>([]),[focused,setFocused]=useState(false),[busy,setBusy]=useState(false),[unavailable,setUnavailable]=useState(false),[active,setActive]=useState(-1),[openMap,setOpenMap]=useState(false);
  const selected=useRef('');
  useEffect(()=>{
    setPlaces([]);setActive(-1);setUnavailable(false);setBusy(false);
    if(!focused || value.trim().length<3 || value.length>120 || selected.current===value)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{setBusy(true);void sessionFetch(`/api/locations/suggestions?q=${encodeURIComponent(value.trim())}`,{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error('Place search unavailable');return response.json();})
      .then(data=>{if(!controller.signal.aborted)setPlaces(Array.isArray(data.places)?data.places:[]);})
      .catch(()=>{if(!controller.signal.aborted)setUnavailable(true);})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});},500);
    return()=>{clearTimeout(timer);controller.abort();};
  },[value,focused,user?.id]);
  const choose=(place:Place)=>{
    const name=place.label.replace(/\s*\((-?\d{1,2}\.\d{6}),\s*(-?\d{1,3}\.\d{6})\)$/,'').trim();
    const next=`${name.slice(0,550)} (${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)})`;
    selected.current=next;onChange(next);setPlaces([]);setActive(-1);setFocused(false);
  };
  const point=recordedPoint(value),expanded=focused&&places.length>0;
  return <div className="space-y-2" data-store-location>
    <label htmlFor={id} className="block text-xs font-black text-slate-800">Campus Location / Residence *</label>
    <div className="relative">
      <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-places`} aria-activedescendant={active>=0?`${id}-place-${active}`:undefined}
        aria-label="Campus Location / Residence" aria-invalid={!!error} aria-describedby={error?`${id}-error`:`${id}-help`} required maxLength={600} value={value} autoComplete="off"
        placeholder="Start typing a campus, area or landmark" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-900"
        onChange={e=>{selected.current='';onChange(e.target.value);setFocused(true);}} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        onKeyDown={e=>{
          if(e.key==='Escape'&&expanded){e.preventDefault();e.stopPropagation();setPlaces([]);setActive(-1);return;}
          if(!expanded)return;
          if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setActive(n=>(n+(e.key==='ArrowDown'?1:places.length-1)+places.length)%places.length);}
          if(e.key==='Enter'&&active>=0){e.preventDefault();choose(places[active]);}
        }} />
      {expanded&&<ul id={`${id}-places`} role="listbox" aria-label="Suggested campus locations" className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-blue-200 bg-white p-1 shadow-xl">
        {places.map((place,index)=><li key={place.label} id={`${id}-place-${index}`} role="option" aria-selected={active===index} className="rounded-xl">
          <button type="button" tabIndex={-1} className="w-full rounded-xl p-3 text-left text-xs leading-relaxed text-slate-800 hover:bg-blue-50" onMouseDown={e=>e.preventDefault()} onClick={()=>choose(place)}>{place.label}</button>
        </li>)}
      </ul>}
    </div>
    {error&&<p id={`${id}-error`} role="alert" className="text-xs text-rose-700">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p id={`${id}-help`} role="status" className="text-[11px] text-slate-500">{busy?'Finding locations…':unavailable?'Suggestions are unavailable. You can type the address or select a map pin.':'Choose a suggestion, enter an address, or select a map pin.'}</p>
      <button type="button" onClick={()=>setOpenMap(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-800"><MapPin size={15} />Select on map</button>
    </div>
    <p className="text-[10px] text-slate-500">Place suggestions: <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer" className="underline">Photon</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors</a></p>
    {openMap&&<DashboardOverlay data-market-dialog data-pv-onboarding aria-label="Choose your store location" onClose={()=>setOpenMap(false)} className="fixed inset-0 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl">
        <CampusMeetupMapPicker latitude={point?.latitude} longitude={point?.longitude} initialLocationName={value}
          onLocationSelect={p=>choose({label:p.locationName,latitude:p.latitude,longitude:p.longitude})} onClose={()=>{setOpenMap(false);input.current?.focus();}}
          searchPlaces={async(query,signal)=>{const res=await sessionFetch(`/api/locations/suggestions?q=${encodeURIComponent(query)}`,{signal});if(!res.ok)return [];return (await res.json()).places||[];}}
          resolvePin={async(latitude,longitude,signal)=>{const res=await sessionFetch(`/api/locations/reverse?lat=${latitude}&lng=${longitude}`,{signal});if(!res.ok)return null;return (await res.json()).places?.[0]?.label||null;}} />
      </div>
    </DashboardOverlay>}
  </div>;
}
