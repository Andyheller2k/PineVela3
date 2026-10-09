import { useState } from 'react';
import { Building2, Eye, Key, MapPin } from 'lucide-react';
import { residenceImages, type Residence } from '../lib/residenceCatalog';

export default function ResidenceCard({ hostel, onInspect, onActivate }: { hostel: Residence; onInspect: (hostel: Residence) => void; onActivate: (hostel: Residence) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const coverImg = imageFailed ? undefined : residenceImages(hostel)[0];
  const managerName = hostel.managerName || hostel.managerEmail || 'Manager not provided';
  return (
    <div data-residence-id={hostel.id} className="bg-slate-50/80 border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
      <div>
        <div className="relative h-36 w-full bg-slate-200 overflow-hidden">
          {coverImg ? <img src={coverImg} alt={hostel.name} referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="w-full h-full object-cover" /> : <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500"><Building2 size={28} /><span className="text-xs">No residence photos uploaded</span></div>}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
            {hostel.hostelType && (
              <span className="px-2.5 py-0.5 bg-white/90 backdrop-blur-sm text-slate-800 text-[10px] font-black rounded-full shadow-xs">
                {hostel.hostelType}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-2.5">
          <div>
            <h4 className="font-extrabold text-slate-900 text-sm tracking-tight">{hostel.name}</h4>
            <div className="flex items-center gap-1 text-slate-500 text-xs mt-0.5">
              <MapPin size={12} className="shrink-0 text-slate-400" />
              <span className="truncate">{hostel.location || hostel.addressLine1 || hostel.address_line_1 || 'Location not provided'}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-600">
            <span className="text-slate-400 font-medium">Manager:</span>
            <span className="font-bold text-slate-800 truncate max-w-[150px]">{managerName}</span>
          </div>
        </div>
      </div>

      <div className="p-4 pt-0 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onInspect(hostel)}
          className="py-2 px-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs"
        >
          <Eye size={13} className="text-slate-600" />
          <span>View Details</span>
        </button>
        <button
          type="button"
          onClick={() => onActivate(hostel)}
          className="py-2 px-2.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs"
        >
          <Key size={13} className="text-amber-300" />
          <span>Activate Key</span>
        </button>
      </div>
    </div>
  );
}
