import { Check,Lock,Upload,User } from 'lucide-react';
import React,{ useEffect,useRef,useState } from 'react';
import { uploadProfileImage } from '../lib/profileImages';
import { renderAvatarGraphic,PRESET_AVATARS as SYSTEM_AVATARS } from './UserAvatarSelector';

interface ManagerProfileSettingsProps {
  currentUser: any;
  onManageAccount?: () => void;
  onSave: (updatedProfile: any) => Promise<void> | void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=300&q=80'
];

export default function ManagerProfileSettings({
  currentUser,
  onManageAccount,
  onSave
}: ManagerProfileSettingsProps) {

  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  const isVerified = Boolean(
    currentUser?.isVerified === true || 
    currentUser?.verificationStatus === 'approved' || 
    currentUser?.verificationStatus === 'verified' || 
    currentUser?.isApproved === true
  );

  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [organization, setOrganization] = useState(currentUser?.organization || '');
  const [roleTitle, setRoleTitle] = useState(currentUser?.roleTitle || '');
  const [photo, setPhoto] = useState(currentUser?.photo || currentUser?.avatar || currentUser?.photoUrl || currentUser?.avatarUrl || currentUser?.profilePicture || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError,setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setSaveError('Choose a JPEG, PNG or WebP picture up to 5MB.');return;}
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          if(mounted.current)setPhoto(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      const savedPhoto=await uploadProfileImage(photo,String(currentUser?.id));
      if(!mounted.current)return;
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        organization: isVerified ? (currentUser?.organization || organization.trim()) : organization.trim(),
        roleTitle: isVerified ? (currentUser?.roleTitle || roleTitle.trim()) : roleTitle.trim(),
        photo:savedPhoto,
        avatar: savedPhoto,
        photoUrl: savedPhoto,
        avatarUrl: savedPhoto
      };
      await onSave(payload);
      if(mounted.current) {
        setPhoto(current => current === photo ? savedPhoto : current);
        setSaved(true);
      }
    } catch (err) {
      if(mounted.current)setSaveError(err instanceof Error?err.message:'Your profile could not be saved.');
    } finally {
      if(mounted.current)setIsSaving(false);
    }
  };

  return (
    <section aria-label="Manager Profile Settings" className="relative z-10 mx-auto w-full max-w-3xl animate-fadeIn">
      <div className="bg-white border border-blue-200/80 rounded-3xl w-full shadow-sm overflow-hidden flex flex-col">
        {/* Settings Header */}
        <div className="p-6 bg-gradient-to-r from-sky-400/25 via-blue-500/20 to-indigo-400/25 backdrop-blur-xl border-b border-sky-200/80 text-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center border border-blue-200 shadow-xs">
              <User className="w-5 h-5 text-blue-900" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Manager Profile Settings</h2>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} onChange={() => setSaved(false)} className="p-6 space-y-5">
          {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
          {saved && <p role="status" className="text-sm text-blue-700">Your profile changes have been saved.</p>}
          {/* Photo Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700">Profile Photo</label>
            <div className="flex items-center gap-4">
              <div className="relative">
                {photo.startsWith('preset:') ? renderAvatarGraphic(photo, "w-20 h-20 text-2xl") : photo ? <img
                  src={photo} 
                  alt="Profile" 
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-500 shadow-md"
                /> : <div aria-label="No profile photograph" className="w-20 h-20 rounded-2xl bg-blue-50 border-2 border-blue-500 flex items-center justify-center"><User size={32} aria-hidden="true" /></div>}
                <label className="absolute -bottom-2 -right-2 w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-110">
                  <Upload className="w-3.5 h-3.5" />
                  <input aria-label="Upload profile photograph" type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </label>
              </div>

              <div className="flex-1 space-y-2">
                <p className="text-[11px] text-slate-500 font-medium">{('Choose a PineVela icon or upload your own picture:')}</p>
                <div className="flex flex-wrap gap-2">
                  {((SYSTEM_AVATARS.map(p=>`preset:${p.id}`))).map((av, idx) => (
                    <button
                      type="button"
                      key={idx}
                      aria-label={`Choose profile photograph ${idx + 1}`}
                      aria-pressed={photo === av}
                      onClick={() => setPhoto(av)}
                      className={`w-8 h-8 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                        photo === av ? 'border-blue-600 ring-2 ring-blue-400/40 scale-105' : 'border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      {(renderAvatarGraphic(av,'w-8 h-8'))}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {false}
          </div>

          {/* Full Name & Phone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
              <input aria-label="Full Name"
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
              <input aria-label="Official Phone Number"
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
              <input aria-label="Organization / Entity"
                type="text" 
                disabled={isVerified || true}
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
              <input aria-label="Manager Role Title"
                type="text" 
                disabled={isVerified || true}
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
            <input aria-label="Account Email (Verified Login)"
              type="email" 
              disabled
              value={currentUser?.email || ''}
              className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-500 cursor-not-allowed"
            />
          </div>

          {currentUser?.role === 'manager' && onManageAccount && <button type="button" onClick={onManageAccount} className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800"><Lock className="h-4 w-4" />Manager Account Security</button>}

          {/* Actions */}
          <div className="ux-action-group pt-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSaving}
              aria-busy={isSaving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Updating...' : 'Save Profile Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
