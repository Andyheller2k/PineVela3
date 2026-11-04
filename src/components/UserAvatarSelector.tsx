import {
Check,
Smile,
Upload
} from 'lucide-react';
import React,{ useEffect,useRef,useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { compressImageFileToLowRes } from '../lib/imageOptimizer';
import { activateOnKeyboard } from '../lib/keyboardActivation';
import { uploadProfileImage } from '../lib/profileImages';
import { sessionFetch as fetch } from '../lib/session';
import PineLogo from './PineLogo';

// System-provided avatar presets with custom styles (PineVela logo in varied colors)
export interface PresetAvatar {
  id: string;
  name: string;
  bgColor: string;
  textColor: string;
  iconName: string;
  svgDataUrl?: string;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'pine-classic', name: 'Classic Avatar', bgColor: 'bg-gradient-to-br from-blue-700 to-indigo-900', textColor: 'text-white', iconName: 'Pine' },
  { id: 'pine-emerald', name: 'Emerald Pine', bgColor: 'bg-gradient-to-br from-emerald-600 to-teal-800', textColor: 'text-emerald-100', iconName: 'Pine' },
  { id: 'pine-amber', name: 'Amber Pine', bgColor: 'bg-gradient-to-br from-amber-500 to-orange-600', textColor: 'text-amber-100', iconName: 'Pine' },
  { id: 'pine-rose', name: 'Rose Pine', bgColor: 'bg-gradient-to-br from-rose-500 to-red-600', textColor: 'text-rose-100', iconName: 'Pine' },
  { id: 'pine-violet', name: 'Violet Pine', bgColor: 'bg-gradient-to-br from-violet-600 to-indigo-800', textColor: 'text-violet-200', iconName: 'Pine' },
  { id: 'pine-dark', name: 'Midnight Pine', bgColor: 'bg-gradient-to-br from-slate-800 to-slate-950', textColor: 'text-slate-200', iconName: 'Pine' },
  { id: 'pine-cyan', name: 'Ocean Cyan Pine', bgColor: 'bg-gradient-to-br from-cyan-600 to-blue-700', textColor: 'text-cyan-100', iconName: 'Pine' },
  { id: 'pine-golden', name: 'Golden Sun Pine', bgColor: 'bg-gradient-to-br from-yellow-500 to-amber-700', textColor: 'text-amber-50', iconName: 'Pine' },
  { id: 'pine-crimson', name: 'Crimson Ruby Pine', bgColor: 'bg-gradient-to-br from-rose-700 to-red-900', textColor: 'text-rose-100', iconName: 'Pine' },
  { id: 'pine-forest', name: 'Deep Forest Pine', bgColor: 'bg-gradient-to-br from-green-700 to-emerald-950', textColor: 'text-emerald-100', iconName: 'Pine' }
];

interface UserAvatarSelectorProps {
  onAvatarSave?: (avatarUrl: string) => void;
}

export const renderAvatarGraphic = (avatarStr: string | null | undefined, sizeClass = "w-20 h-20 text-2xl") => {
  if (!avatarStr) avatarStr = 'preset:pine-classic';
  if (avatarStr.startsWith('/api/media/') || avatarStr.startsWith('data:image/') || avatarStr.startsWith('http://') || avatarStr.startsWith('https://')) {
    return (
      <img 
        src={avatarStr} 
        alt="Profile Avatar" 
        className={`${sizeClass} aspect-square max-w-none rounded-full object-cover border-2 border-white shadow-md shrink-0`}
      />
    );
  }

  const presetId = avatarStr.replace('preset:', '');
  const preset = PRESET_AVATARS.find(p => p.id === presetId) || PRESET_AVATARS[0];
  
  // Calculate pixel size for PineLogo inside the avatar
  const numMatch = sizeClass.match(/w-(\d+)/);
  const sizeNum = numMatch ? parseInt(numMatch[1], 10) : 10;
  const pxSize = Math.max(16, Math.min(80, Math.round(sizeNum * 2.6)));

  return (
    <div data-avatar-preset={preset.id} className={`${sizeClass} aspect-square rounded-full ${preset.bgColor} ${preset.textColor} flex items-center justify-center border-2 border-white shadow-md shrink-0 overflow-hidden`}>
      <PineLogo size={pxSize} hideText={true} />
    </div>
  );
};

export default function UserAvatarSelector({ onAvatarSave }: UserAvatarSelectorProps) {
  const { user, updateUser } = useAuth();
  
  const accountKey = JSON.stringify([user?.role, user?.id]);
  const activeAccountRef = useRef(accountKey);
  activeAccountRef.current = accountKey;
  
  // Current active avatar (URL, base64 camera photo, or preset ID)
  const currentAvatar = user?.avatar || user?.photo || user?.photoUrl || user?.avatarUrl || user?.profilePicture || 'preset:pine-classic';

  const [activeTab, setActiveTab] = useState<"presets" | "upload">("presets");
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    return currentAvatar.startsWith('preset:') ? currentAvatar.replace('preset:', '') : 'pine-classic';
  });


  // File upload state
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Success alert state
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving,setSaving] = useState(false);
  const savingAccount = useRef('');

  // Sync state if user prop changes
  useEffect(() => {
    const saved = user?.avatar || user?.photo || user?.photoUrl || user?.avatarUrl || user?.profilePicture || 'preset:pine-classic';
    setSelectedPresetId(saved.startsWith('preset:') ? saved.replace('preset:', '') : 'pine-classic');
  }, [user?.avatar, user?.photo, user?.photoUrl, user?.avatarUrl, user?.profilePicture, accountKey]);

  useEffect(() => {
    activeAccountRef.current = accountKey;
    setUploadPreview(null);
    setSaveSuccess(false);
    setSaveError('');
    setSaving(false);
    savingAccount.current='';
    if (fileInputRef.current) fileInputRef.current.value = '';
    return () => { activeAccountRef.current = ''; };
  }, [accountKey]);


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      console.warn("Please choose a valid image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      console.warn("File size exceeds 5MB limit. Please choose a smaller photo.");
      return;
    }


    try {
      // Keep the persisted avatar safely below browser-storage and API payload limits.
      const preview = await compressImageFileToLowRes(file, 360, 0.55);
      if (activeAccountRef.current === accountKey) setUploadPreview(preview);
    } catch (err) {
      console.error('Profile photo compression failed:', err);
      console.error("We could not prepare that photo. Please try a different image.");
    }
  };

  const applyAvatar = async (newAvatarVal: string) => {
    if (!user || savingAccount.current===accountKey) return;
    savingAccount.current=accountKey;setSaving(true);
    setSaveError('');
    setSaveSuccess(false);

    // Persist avatar to backend so it survives logout/login
    try {
      newAvatarVal=await uploadProfileImage(newAvatarVal,String(user.id));
      if(activeAccountRef.current!==accountKey)return;
      const token = user?.token;
      if (user) {
        const res = await fetch(user.role === 'manager' ? '/api/auth/profile/avatar' : '/api/auth/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-PineVela-Profile-Context':String(user.id),
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(user.role === 'manager' ? { photo: newAvatarVal } : {
            avatar: newAvatarVal,
            avatarUrl: newAvatarVal,
            photo: newAvatarVal,
            photoUrl: newAvatarVal,
            profilePicture: newAvatarVal
          })
        });
        const result=await res.json().catch(()=>null);
        if (!res.ok) throw new Error(result?.error || 'Could not save your profile picture. Please try again.');
        newAvatarVal=result?.user?.avatar || 'preset:pine-classic';
      }
    } catch (err) {
      if (activeAccountRef.current === accountKey) setSaveError(err instanceof Error?err.message:'Could not save your profile picture. Please try again.');
      return;
    } finally {
      if(activeAccountRef.current===accountKey){savingAccount.current='';setSaving(false);}
    }

    if (activeAccountRef.current !== accountKey) return;
    updateUser?.({ avatar: newAvatarVal, avatarUrl: newAvatarVal, photo: newAvatarVal, photoUrl: newAvatarVal, profilePicture: newAvatarVal },String(user.id));
    onAvatarSave?.(newAvatarVal);
    setSaveSuccess(true);
    setTimeout(() => { if (activeAccountRef.current === accountKey) setSaveSuccess(false); }, 3000);
  };

  // Render Preset Icon helper
  const renderPresetIcon = (_iconName: string, className = "w-6 h-6") => {
    const numMatch = className.match(/w-(\d+)/);
    const sizeNum = numMatch ? parseInt(numMatch[1], 10) : 6;
    return <PineLogo size={Math.max(16, sizeNum * 4)} hideText={true} />;
  };

  return (
    <div className="user-avatar-selector min-w-0 bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-md space-y-6">
      
      {/* SECTION HEADER & CURRENT AVATAR DISPLAY */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 pb-6 border-b border-slate-100">
        <div className="flex w-full min-w-0 items-center gap-3 sm:gap-4 text-left">
          <div className="relative group h-20 w-20 shrink-0 aspect-square">
            {renderAvatarGraphic(currentAvatar, "w-20 h-20 text-3xl")}
            <div className="absolute -bottom-1 -right-1 p-1.5 bg-blue-900 text-amber-300 rounded-full border-2 border-white shadow-xs">
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="min-w-0 break-words text-base font-black text-slate-900">{user?.name || 'PineVela User'}</h4>
              <span className="shrink-0 px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-[10px] font-extrabold uppercase">
                {user?.role || 'Resident'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Select a system avatar or upload your own photo.
            </p>
          </div>
        </div>

        {saveSuccess && (
          <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>Profile Avatar Saved!</span>
          </div>
        )}
        {saveError && <p role="alert" className="text-xs font-bold text-red-700">{saveError}</p>}
      </div>

      {/* TABS FOR SELECTING METHOD */}
      <div className="user-avatar-methods flex items-stretch gap-2 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
        <button
          type="button"
          aria-pressed={activeTab === 'presets'}
          onClick={() => {

            setActiveTab('presets');
          }}
          className={`pv-secondary-action min-w-0 min-h-11 flex-1 basis-0 px-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'presets' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Smile className="w-4 h-4 shrink-0 text-blue-600" />
          <span className="min-w-0">System Icons</span>
        </button>


        <button
          type="button"
          aria-pressed={activeTab === 'upload'}
          onClick={() => {

            setActiveTab('upload');
          }}
          className={`pv-secondary-action min-w-0 min-h-11 flex-1 basis-0 px-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'upload' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Upload className="w-4 h-4 shrink-0 text-blue-600" />
          <span className="min-w-0">Upload Image</span>
        </button>
      </div>

      {/* TAB CONTENT 1: SYSTEM PRESETS GRID */}
      {activeTab === 'presets' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Choose a System Icon Avatar
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {PRESET_AVATARS.map((preset) => {
              const isSelected = selectedPresetId === preset.id && currentAvatar.startsWith('preset:');
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={saving}
                  onClick={() => {
                    applyAvatar(`preset:${preset.id}`);
                  }}
                  className={`min-w-0 p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center text-center space-y-2 relative ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20'
                      : 'border-slate-150 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-100/50'
                  }`}
                >
                  <div data-avatar-preset={preset.id} className={`w-14 h-14 shrink-0 aspect-square rounded-full ${preset.bgColor} ${preset.textColor} flex items-center justify-center shadow-xs`}>
                    {renderPresetIcon(preset.iconName, "w-7 h-7")}
                  </div>

                  <span className="min-w-0 break-words text-xs font-bold text-slate-800">{preset.name}</span>

                  {isSelected && (
                    <div className="absolute top-2 right-2 p-1 bg-blue-600 text-white rounded-full">
                      <Check className="w-3 h-3 shrink-0" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}


      {/* TAB CONTENT 3: FILE UPLOAD */}
      {activeTab === 'upload' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Upload Image File from Device
          </div>

          <div role="button" tabIndex={0} aria-label="Upload profile photograph" onKeyDown={activateOnKeyboard}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-sky-300 hover:border-blue-600 bg-sky-50/30 hover:bg-sky-50/70 transition-all rounded-3xl p-4 sm:p-8 text-center cursor-pointer space-y-3"
          >
            {uploadPreview ? (
              <div className="space-y-3">
                <img
                  src={uploadPreview}
                  alt="Uploaded Preview"
                  className="w-32 h-32 shrink-0 aspect-square rounded-full object-cover mx-auto border-4 border-blue-600 shadow-md"
                />
                <div className="text-xs font-bold text-blue-900">Click to change file</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto shadow-xs">
                  <Upload className="w-7 h-7 shrink-0" />
                </div>
                <div className="text-xs font-black text-slate-800">
                  Click to select an image from your device
                </div>
                <p className="text-[11px] text-slate-500">
                  PNG, JPG, WEBP or GIF up to 5MB
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {uploadPreview && (
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUploadPreview(null)}
                className="pv-secondary-action min-h-11 shrink-0 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => applyAvatar(uploadPreview)}
                className="pv-primary-action min-w-0 min-h-11 flex-1 sm:flex-none px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span className="min-w-0">{saving?'Checking & saving profile photo…':'Save Uploaded Profile Photo'}</span>
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
