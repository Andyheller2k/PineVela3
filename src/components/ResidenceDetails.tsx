import { useState } from 'react';
import { Building2, Key, MapPin, X } from 'lucide-react';
import DashboardOverlay from './DashboardOverlay';
import { residenceImages, type Residence } from '../lib/residenceCatalog';

export default function ResidenceDetails({ hostel, onClose, onActivate }: { hostel: Residence; onClose: () => void; onActivate: (hostel: Residence) => void }) {
  const [activeImage, setActiveImage] = useState('');
  return (
    <DashboardOverlay aria-label="Hostel Accommodation Details" onClose={() => onClose()} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto border border-slate-100 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        
        {/* Gallery header */}
        {(() => {
          const galleryList = residenceImages(hostel);
          const displayImg = activeImage || galleryList[0];

          return (
            <div className="space-y-2 p-4 bg-slate-900 rounded-t-3xl">
              <div className="relative h-56 w-full rounded-2xl overflow-hidden bg-slate-800 border border-slate-700">
                {displayImg ? <img src={displayImg} alt={hostel.name} referrerPolicy="no-referrer" className="w-full h-full object-cover transition-all" /> : <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-300"><Building2 size={32} /><span className="text-xs">No residence photos uploaded</span></div>}
                <button aria-label="Close dialog"
                  onClick={() => onClose()}
                  className="absolute top-3 right-3 bg-black/70 hover:bg-black text-white p-2 rounded-full cursor-pointer transition-all border border-white/20"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {galleryList.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                  {galleryList.map((gUrl, gIdx) => (
                    <button
                      key={gIdx}
                      onClick={() => setActiveImage(gUrl)}
                      className={`relative w-16 h-12 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer transition-all ${
                        displayImg === gUrl ? 'border-amber-400 ring-2 ring-amber-400/30 scale-105' : 'border-slate-700 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={gUrl} alt={`Gallery ${gIdx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <div className="p-6 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                {hostel?.hostelType || hostel?.wing || 'Student Residence'}
              </span>
            </div>
            <h3 className="text-xl font-black text-slate-900 mt-1">{hostel?.name}</h3>
            <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-1">
              <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>{hostel.location || hostel.addressLine1 || hostel.address_line_1 || 'Location not provided'}</span>
            </p>
          </div>

          {hostel?.description && (
            <p className="text-xs text-slate-600 leading-relaxed font-medium bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              {hostel.description}
            </p>
          )}

          {/* Manager Details */}
          <div className="p-3.5 bg-blue-50/60 rounded-2xl border border-blue-200/60 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-900 text-white font-black flex items-center justify-center shrink-0 border border-blue-300">
              {hostel?.managerName ? hostel.managerName.substring(0, 2).toUpperCase() : 'MG'}
            </div>
            <div className="text-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Property Residence Manager</span>
              <p className="font-black text-slate-900">{hostel.managerName || 'Manager not provided'}</p>
              <p className="text-[11px] text-slate-600 font-semibold">{[hostel.managerPhone, hostel.managerEmail].filter(Boolean).join(' • ')}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => onClose()}
              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-2xl transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={() => onActivate(hostel)}
              className="flex-1 py-3 px-4 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-2xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4 text-amber-300" />
              <span>Activate Digital Key</span>
            </button>
          </div>
        </div>
      </div>
    </DashboardOverlay>
  );
}
