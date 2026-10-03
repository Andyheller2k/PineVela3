import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function MarketPhotoUpload({ value, onChange, label = 'Add photo', disabled = false, onBusyChange }:
  { value?: string; onChange: (url: string) => void; label?: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const { apiFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="min-w-0 space-y-1">
    {value && <div className="flex items-center gap-2"><img src={value} alt={label} className="h-16 w-16 rounded-lg object-cover" /><button type="button" disabled={busy || disabled} onClick={() => onChange('')} className="text-xs text-red-700 underline">Remove photo</button></div>}
    <label className={`inline-flex cursor-pointer rounded-lg border border-blue-200 px-2 py-1 text-xs font-bold text-blue-800 ${busy || disabled ? 'opacity-50' : ''}`}>
      {busy ? 'Uploading…' : label}
      <input type="file" aria-label={label} accept="image/jpeg,image/png,image/webp" disabled={busy || disabled} className="sr-only" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        setError('');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { setError('Choose a JPEG, PNG or WebP photograph up to 20MB.'); return; }
        setBusy(true); onBusyChange?.(true);
        try {
          const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read photograph.')); reader.readAsDataURL(file); });
          const result = await apiFetch('/api/storage/upload-market-image', { method: 'POST', body: JSON.stringify({ fileType: file.type, fileData: data }) });
          onChange(result.imageUrl);
        } catch (err: any) { setError(err.message || 'Could not upload photograph.'); }
        finally { setBusy(false); onBusyChange?.(false); }
      }} />
    </label>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
