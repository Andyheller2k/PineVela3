import DashboardOverlay from './DashboardOverlay';
import React, {useRef,useState} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, X } from 'lucide-react';
import PineLogo from './PineLogo';

interface LogoutConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void | boolean>;
  userRole?: string;
  userName?: string;
}

export default function LogoutConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  userName
}: LogoutConfirmationModalProps) {
  const [pending,setPending]=useState(false);
  const pendingRef=useRef(false);
  const confirm=async()=>{
    if(pendingRef.current)return;
    pendingRef.current=true;setPending(true);
    try{await onConfirm();}
    finally{pendingRef.current=false;setPending(false);}
  };
  // The shared authentication overlay owns feedback while sign-out is pending.
  if (!isOpen || pending) return null;

  return (
    <AnimatePresence>
      <DashboardOverlay aria-label="Confirm Sign Out" aria-busy={pending} onClose={pending?null:onClose} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-blue-950/30 backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-blue-950/20 border border-slate-100 overflow-hidden"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center shadow-xs">
              <PineLogo size={32} hideText={true} />
            </div>
            <button aria-label="Close dialog"
              disabled={pending}
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-900/5 hover:bg-slate-900/10 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 pt-3 space-y-2">
            <h3 className="text-xl font-black text-blue-950 tracking-tight">
              Confirm Sign Out
            </h3>
            <p aria-live="polite" className="text-sm font-medium text-slate-700 leading-relaxed">
              {`Are you sure you want to sign out${userName ? `, ${userName}` : ''}? You can sign back in to PineVela at any time.`}
            </p>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 pt-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              disabled={pending}
              onClick={onClose}
              className="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-extrabold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              disabled={pending}
              onClick={confirm}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </motion.div>
      </DashboardOverlay>
    </AnimatePresence>
  );
}
