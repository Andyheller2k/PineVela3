import { sessionFetch as fetch } from '../lib/session';
import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  Check, 
  RotateCcw, 
  User, 
  Sparkles, 
  Smile,
  X,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PineLogo from './PineLogo';
import { compressImageFileToLowRes } from '../lib/imageOptimizer';

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
  if (avatarStr.startsWith('data:image/') || avatarStr.startsWith('http://') || avatarStr.startsWith('https://')) {
    return (
      <img 
        src={avatarStr} 
        alt="Profile Avatar" 
        className={`${sizeClass} rounded-full object-cover border-2 border-white shadow-md shrink-0`} 
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
    <div className={`${sizeClass} rounded-full ${preset.bgColor} ${preset.textColor} flex items-center justify-center border-2 border-white shadow-md shrink-0 overflow-hidden`}>
      <PineLogo size={pxSize} hideText={true} />
    </div>
  );
};

export default function UserAvatarSelector({ onAvatarSave }: UserAvatarSelectorProps) {
  const { user, updateUser } = useAuth();
  
  // Storage key based on user email or ID
  const cleanEmail = (user?.email || '').toLowerCase().trim();
  const storageKey = cleanEmail ? `pinevela_avatar_${cleanEmail}` : 'pinevela_user_avatar';
  
  // Current active avatar (URL, base64 camera photo, or preset ID)
  const [currentAvatar, setCurrentAvatar] = useState<string>(() => {
    return user?.avatar || user?.photo || user?.photoUrl || user?.avatarUrl || user?.profilePicture || localStorage.getItem(storageKey) || localStorage.getItem('pinevela_user_avatar') || 'preset:pine-classic';
  });

  const [activeTab, setActiveTab] = useState<"presets" | "upload">("presets");
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    return currentAvatar.startsWith('preset:') ? currentAvatar.replace('preset:', '') : 'pine-classic';
  });


  // File upload state
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Success alert state
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state if user prop changes
  useEffect(() => {
    const saved = user?.avatar || user?.photo || user?.photoUrl || user?.avatarUrl || user?.profilePicture || localStorage.getItem(storageKey) || localStorage.getItem('pinevela_user_avatar');
    if (saved) {
      setCurrentAvatar(saved);
      if (saved.startsWith('preset:')) {
        setSelectedPresetId(saved.replace('preset:', ''));
      }
    }
  }, [user?.avatar, user?.photo, user?.photoUrl, user?.avatarUrl, user?.profilePicture, storageKey]);


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
      setUploadPreview(await compressImageFileToLowRes(file, 360, 0.55));
    } catch (err) {
      console.error('Profile photo compression failed:', err);
      console.error("We could not prepare that photo. Please try a different image.");
    }
  };

  const applyAvatar = async (newAvatarVal: string) => {
    setCurrentAvatar(newAvatarVal);
    const cleanMail = (user?.email || '').toLowerCase().trim();
    try {
      if (cleanMail) localStorage.setItem(`pinevela_avatar_${cleanMail}`, newAvatarVal);
      localStorage.setItem('pinevela_user_avatar', newAvatarVal);
    } catch (err) {
      // A storage quota must not block the authenticated server-side save.
      console.warn('[UserAvatarSelector] Avatar could not be cached locally:', err);
    }
    
    if (onAvatarSave) {
      try {
        onAvatarSave(newAvatarVal);
      } catch (e) {
        console.warn('[UserAvatarSelector] onAvatarSave error:', e);
      }
    }

    // Persist avatar to backend so it survives logout/login
    try {
      const token = user?.token;
      if (user) {
        const res = await fetch('/api/auth/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            avatar: newAvatarVal,
            avatarUrl: newAvatarVal,
            photo: newAvatarVal,
            photoUrl: newAvatarVal,
            profilePicture: newAvatarVal
          })
        });
        if (!res.ok) {
          console.warn('[UserAvatarSelector] Server responded with error status:', res.status);
        }
      }
    } catch (err) {
      console.warn('[UserAvatarSelector] Failed to persist avatar to server:', err);
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Render Preset Icon helper
  const renderPresetIcon = (_iconName: string, className = "w-6 h-6") => {
    const numMatch = className.match(/w-(\d+)/);
    const sizeNum = numMatch ? parseInt(numMatch[1], 10) : 6;
    return <PineLogo size={Math.max(16, sizeNum * 4)} hideText={true} />;
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-6">
      
      {/* SECTION HEADER & CURRENT AVATAR DISPLAY */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 pb-6 border-b border-slate-100">
        <div className="flex items-center gap-4 text-center sm:text-left">
          <div className="relative group">
            {renderAvatarGraphic(currentAvatar, "w-20 h-20 text-3xl")}
            <div className="absolute -bottom-1 -right-1 p-1.5 bg-blue-900 text-amber-300 rounded-full border-2 border-white shadow-xs">
            </div>
          </div>

          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h4 className="text-base font-black text-slate-900">{user?.name || 'PineVela User'}</h4>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-[10px] font-extrabold uppercase">
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
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Profile Avatar Saved!</span>
          </div>
        )}
      </div>

      {/* TABS FOR SELECTING METHOD */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
        <button
          type="button"
          onClick={() => {

            setActiveTab('presets');
          }}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'presets' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Smile className="w-4 h-4 text-blue-600" />
          <span>System Icons</span>
        </button>


        <button
          type="button"
          onClick={() => {

            setActiveTab('upload');
          }}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'upload' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Upload className="w-4 h-4 text-blue-600" />
          <span>Upload Image</span>
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
                  onClick={() => {
                    setSelectedPresetId(preset.id);
                    applyAvatar(`preset:${preset.id}`);
                  }}
                  className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center text-center space-y-2 relative ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20'
                      : 'border-slate-150 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-100/50'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-full ${preset.bgColor} ${preset.textColor} flex items-center justify-center shadow-xs`}>
                    {renderPresetIcon(preset.iconName, "w-7 h-7")}
                  </div>

                  <span className="text-xs font-bold text-slate-800 line-clamp-1">{preset.name}</span>

                  {isSelected && (
                    <div className="absolute top-2 right-2 p-1 bg-blue-600 text-white rounded-full">
                      <Check className="w-3 h-3" />
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

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-sky-300 hover:border-blue-600 bg-sky-50/30 hover:bg-sky-50/70 transition-all rounded-3xl p-8 text-center cursor-pointer space-y-3"
          >
            {uploadPreview ? (
              <div className="space-y-3">
                <img
                  src={uploadPreview}
                  alt="Uploaded Preview"
                  className="w-32 h-32 rounded-full object-cover mx-auto border-4 border-blue-600 shadow-md"
                />
                <div className="text-xs font-bold text-blue-900">Click to change file</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto shadow-xs">
                  <Upload className="w-7 h-7" />
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
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUploadPreview(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => applyAvatar(uploadPreview)}
                className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Save Uploaded Profile Photo</span>
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
