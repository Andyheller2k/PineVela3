import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export default function MarketPhotoUpload({ value, onChange, label = 'Add photo', disabled = false, onBusyChange }:
  { value?: string; onChange: (url: string) => void; label?: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const { apiFetch, user } = useAuth();
  const currentAccount = useRef(user?.id); currentAccount.current = user?.id;
  const mounted = useRef(true), busyAccount = useRef<string | undefined>(undefined);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (busyAccount.current) {onBusyChange?.(false);busyAccount.current=undefined;} }; }, []);
  useEffect(() => {
    if (busyAccount.current && busyAccount.current !== user?.id) { onBusyChange?.(false); busyAccount.current = undefined; }
    setBusy(false); setError('');
  }, [user?.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="min-w-0 space-y-1">
    {value && <div className="flex items-center gap-2"><img src={value} alt={label} className="h-16 w-16 rounded-lg object-cover" /><button type="button" disabled={busy || disabled} onClick={() => onChange('')} className="text-xs text-red-700 underline">Remove photo</button></div>}
    <label className={`inline-flex cursor-pointer rounded-lg border border-blue-200 px-2 py-1 text-xs font-bold text-blue-800 ${busy || disabled ? 'opacity-50' : ''}`}>
      {busy ? 'Checking & uploading…' : label}
      <input type="file" aria-label={label} accept="image/jpeg,image/png,image/webp" disabled={busy || disabled} className="sr-only" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        setError('');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { setError('Choose a JPEG, PNG or WebP photograph up to 20MB.'); return; }
        setBusy(true); onBusyChange?.(true);
        const accountId = user?.id; busyAccount.current = accountId;
        const current = () => mounted.current && currentAccount.current === accountId;
        try {
          const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read photograph.')); reader.readAsDataURL(file); });
          if (!current()) return;
          const result = await apiFetch('/api/storage/upload-market-image', { method: 'POST', body: JSON.stringify({ fileType: file.type, fileData: data, fileName: file.name }) });
          if (current()) onChange(result.imageUrl);
        } catch (err: any) { if (current()) setError(err.message || 'Could not upload photograph.'); }
        finally { if (current()) { busyAccount.current = undefined; setBusy(false); onBusyChange?.(false); } }
      }} />
    </label>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
