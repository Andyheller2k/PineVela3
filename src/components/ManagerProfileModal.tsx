import React, { useState } from 'react';
import { User, Phone, Mail, Camera, Building, Briefcase, Check, X, Sparkles, Upload, Lock } from 'lucide-react';

interface ManagerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onSaveProfile?: (updatedProfile: any) => Promise<void> | void;
  onSave?: (updatedProfile: any) => Promise<void> | void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=300&q=80'
];

export default function ManagerProfileModal({
  isOpen,
  onClose,
  currentUser,
  onSaveProfile,
  onSave
}: ManagerProfileModalProps) {
  if (!isOpen) return null;

  const isVerified = Boolean(
    currentUser?.isVerified === true || 
    currentUser?.verificationStatus === 'approved' || 
    currentUser?.verificationStatus === 'verified' || 
    currentUser?.isApproved === true
  );

  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [organization, setOrganization] = useState(currentUser?.organization || 'PineVela Property Holdings');
  const [roleTitle, setRoleTitle] = useState(currentUser?.roleTitle || 'Residence Operations Manager');
  const [photo, setPhoto] = useState(currentUser?.photo || currentUser?.avatar || currentUser?.photoUrl || PRESET_AVATARS[0]);
  const [isSaving, setIsSaving] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setPhoto(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        organization: isVerified ? (currentUser?.organization || organization.trim()) : organization.trim(),
        roleTitle: isVerified ? (currentUser?.roleTitle || roleTitle.trim()) : roleTitle.trim(),
        photo,
        avatar: photo,
        photoUrl: photo,
        avatarUrl: photo
      };
      if (onSaveProfile) {
        await onSaveProfile(payload);
      } else if (onSave) {
        await onSave(payload);
      }
      onClose();
    } catch (err) {
      console.error("Profile save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white border border-blue-200/80 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-sky-400/25 via-blue-500/20 to-indigo-400/25 backdrop-blur-xl border-b border-sky-200/80 text-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center border border-blue-200 shadow-xs">
              <User className="w-5 h-5 text-blue-900" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Manager Profile Settings</h3>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Photo Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700">Profile Photo</label>
            <div className="flex items-center gap-4">
              <div className="relative">
                <img 
                  src={photo} 
                  alt="Profile" 
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-500 shadow-md"
                />
                <label className="absolute -bottom-2 -right-2 w-7 h-7 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-110">
                  <Upload className="w-3.5 h-3.5" />
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              <div className="flex-1 space-y-2">
                <p className="text-[11px] text-slate-500 font-medium">Choose from presets or paste image link:</p>
                <div className="flex gap-2">
                  {PRESET_AVATARS.map((av, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setPhoto(av)}
                      className={`w-8 h-8 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                        photo === av ? 'border-blue-600 ring-2 ring-blue-400/40 scale-105' : 'border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={av} alt="preset" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <input 
                type="text" 
                value={photo} 
                onChange={(e) => setPhoto(e.target.value)}
                placeholder="Or paste image URL (https://...)" 
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>
          </div>

          {/* Full Name & Phone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
              <input 
                type="text" 
                required
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g. Samuel Appiah" 
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Official Phone Number</label>
              <input 
                type="text" 
                required
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                placeholder="+233 24 123 4567" 
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>
          </div>

          {/* Organization & Role */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Organization / Entity</label>
              <input 
                type="text" 
                disabled={isVerified}
                value={organization} 
                onChange={(e) => setOrganization(e.target.value)} 
                placeholder="e.g. PineVela Prime Properties" 
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  isVerified 
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none' 
                    : 'bg-slate-50 border-slate-200 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Manager Role Title</label>
              <input 
                type="text" 
                disabled={isVerified}
                value={roleTitle} 
                onChange={(e) => setRoleTitle(e.target.value)} 
                placeholder="e.g. Lead Property Manager" 
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  isVerified 
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none' 
                    : 'bg-slate-50 border-slate-200 text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white'
                }`}
              />
            </div>
          </div>

          {/* Email Info (read-only for account integrity) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Account Email (Verified Login)</label>
            <input 
              type="email" 
              disabled
              value={currentUser?.email || 'manager@pinevela.com'} 
              className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-500 cursor-not-allowed"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Updating...' : 'Save Profile Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
