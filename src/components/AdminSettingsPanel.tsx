import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import { useAdminGovernance } from './AdminGovernancePanel';
import { queryClient } from '../lib/queryClient';

const input = 'w-full min-w-0 rounded-xl border border-blue-200 bg-white/80 px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500';
const button = 'rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40';
export default function AdminSettingsPanel() {
  const { apiFetch, user, updateUser } = useAuth(), { settings } = usePlatformSettings(), { data: governance } = useAdminGovernance();
  const self = governance?.members.find((member: any) => member.id === user?.id);
  const [fee, setFee] = useState(''), [commission, setCommission] = useState(''), [announcement, setAnnouncement] = useState(''), [maintenance, setMaintenance] = useState(false);
  const [key, setKey] = useState(''), [password, setPassword] = useState(''), [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [dirty, setDirty] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  useEffect(() => { if (settings && !dirty) { setFee(String(settings.registrationFee)); setCommission(String(settings.commission)); setAnnouncement(settings.announcement); setMaintenance(settings.maintenanceMode); } }, [settings, dirty]);
  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err: any) { setError(err.message || 'This change could not be saved.'); }
    finally { setBusy(false); setPassword(''); setKey(''); }
  }
  async function post(path: string, body: any) {
    const result = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
    if (!result || Array.isArray(result)) throw new Error('Your administrator session has ended. Sign in again.');
    return result;
  }
  async function savePhoto() {
    if (!photoFile || !key) throw new Error('Choose a photograph and enter your settings key.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photoFile.type) || photoFile.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP photograph up to 5 MB.');
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Photograph could not be read.')); reader.readAsDataURL(photoFile); });
    const uploaded = await post('/api/storage/upload-admin-profile', { fileData: data, fileType: photoFile.type, fileName: photoFile.name, settingsKey: key });
    const result = await post('/api/auth/profile', { photo: uploaded.imageUrl, settingsKey: key });
    if (!result.success || !result.user) throw new Error('Your profile photograph could not be saved.');
    updateUser?.({ photo: result.user.photo, avatar: result.user.photo }); setPhotoFile(null); setNotice('Your profile photograph has been saved.');
  }
  return <section className="space-y-6 text-slate-900" aria-label="Administrator settings">
    <header className="rounded-3xl border border-blue-200 bg-white/65 p-6"><h3 className="text-xl font-bold">PineVela Admin Settings</h3><p className="mt-2 text-xs text-slate-600">Configure marketplace registration fees in GHS, commission accounting, system announcements, and platform maintenance.</p></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">{notice}</p>}
    {!self ? <p role="status">Loading administrator key status…</p> : !self.settingsKeyEnrolled && <form className="space-y-4 rounded-3xl border border-blue-200 bg-white/65 p-6" onSubmit={event => { event.preventDefault(); void act(async () => { const result = await post('/api/admin/governance/keys/settings/enroll', { password }); setNewKey(result.settingsKey); setNotice(result.message); await queryClient.invalidateQueries({ queryKey: ['adminGovernance'] }); }); }}>
      <h4 className="font-bold">Enroll your separate settings key</h4><p className="text-sm text-slate-600">Verify your own login password to receive a private settings key. Wipe approval keys cannot change these settings.</p>
      <label className="block text-sm">Current login password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className={input} /></label><button className={button} disabled={busy}>Generate my settings key</button>
    </form>}
    {newKey && <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5"><p className="text-sm font-semibold">Save this settings key privately. This is its only display.</p><code className="block select-all break-all text-sm">{newKey}</code><button type="button" className={button} onClick={() => setNewKey('')}>I saved my settings key</button></div>}
    <div className="rounded-2xl border border-blue-200 bg-white/65 p-5"><label className="block text-sm font-semibold">Your private settings key<input type="password" autoComplete="off" value={key} maxLength={128} onChange={event => setKey(event.target.value)} className={input} /></label><p className="mt-2 text-xs text-slate-600">Required for every settings or profile change. Lost keys can be reset under Admin Approvals by two other administrators.</p></div>
    <form className="space-y-6 rounded-3xl border border-blue-200 bg-white/65 p-6" onSubmit={event => { event.preventDefault(); void act(async () => { const result = await post('/api/settings', { registrationFee: Number(fee), commission: Number(commission), announcement, maintenanceMode: maintenance, settingsKey: key }); if (!result.success) throw new Error('Settings could not be saved.'); setDirty(false); queryClient.setQueryData(['settings'], result.settings); setNotice('Platform settings saved. All portals will receive the update.'); }); }}>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">New marketplace registration fee (GHS)<input type="number" required min="0" max="1000000" step="0.01" value={fee} onChange={event => { setDirty(true); setFee(event.target.value); }} className={input} /></label><label className="text-sm font-semibold">Marketplace commission (%)<input type="number" required min="0" max="100" step="0.01" value={commission} onChange={event => { setDirty(true); setCommission(event.target.value); }} className={input} /></label></div>
      <p className="text-xs text-slate-600">New applications retain their quoted fee; new orders retain their commission rate. This records amounts and does not collect or transfer payments.</p>
      <label className="block text-sm font-semibold">Global System Announcement<textarea rows={3} maxLength={2000} value={announcement} onChange={event => { setDirty(true); setAnnouncement(event.target.value); }} className={input} /><span className="text-xs font-normal text-slate-600">Sent to non-admin accounts’ notifications. Clear the text to stop publishing an announcement.</span></label>
      <label className="flex items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-4"><span><strong className="block text-sm">Platform Maintenance Mode</strong><span className="text-xs text-slate-600">Temporary restrict non admin accounts during database updates</span></span><input aria-label="Platform Maintenance Mode" type="checkbox" checked={maintenance} onChange={event => { setDirty(true); setMaintenance(event.target.checked); }} className="h-5 w-5 accent-blue-600" /></label>
      <button className={button} disabled={busy || !key || !self?.settingsKeyEnrolled || !settings}>Save Admin Settings</button>
    </form>
    <form className="space-y-4 rounded-3xl border border-blue-200 bg-white/65 p-6" onSubmit={event => { event.preventDefault(); void act(savePhoto); }}>
      <h4 className="font-bold">Your administrator profile photograph</h4><div className="flex items-center gap-4">{user?.photo || user?.avatar ? <img src={user.photo || user.avatar} alt="Your administrator profile" className="h-20 w-20 rounded-full object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-900">{user?.name?.slice(0, 1)}</span>}<p className="text-xs text-slate-600">JPEG, PNG or WebP up to 5 MB. Photographs are decoded, checked and re-encoded with a maximum dimension of 800 pixels.</p></div>
      <label className="block text-sm">Choose profile photograph<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setPhotoFile(event.target.files?.[0] || null)} className={input} /></label><button className={button} disabled={busy || !photoFile || !key || !self?.settingsKeyEnrolled}>Save profile photograph</button>
    </form>
  </section>;
}
