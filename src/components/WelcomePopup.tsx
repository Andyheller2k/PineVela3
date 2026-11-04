import {X} from 'lucide-react';
import DashboardOverlay from './DashboardOverlay';
import PineLogo from './PineLogo';

export default function WelcomePopup({onClose}: {onClose: () => void}) {
  return <DashboardOverlay data-pv-onboarding aria-label="Welcome to PineVela" onClose={onClose} className="pv-welcome-overlay fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-blue-100 space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/30">
          <PineLogo size={42} hideText />
        </div>
        <button aria-label="Close dialog" type="button" onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="space-y-3">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Welcome to the PineVela Community!</h2>
        <p className="text-sm text-slate-600 leading-relaxed font-medium">We're excited to have you here. Discover student residences, activate your digital room key, track maintenance requests, and shop on the student marketplace.</p>
        <p className="text-sm text-slate-600 leading-relaxed font-medium">You can also use this account to apply to become a merchant or a hostel manager.</p>
      </div>
      <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
        <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md transition-all cursor-pointer">Got It, Let's Go!</button>
      </div>
    </div>
  </DashboardOverlay>;
}
