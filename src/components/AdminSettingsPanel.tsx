import { useActionFeedback } from '../lib/useActionFeedback';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import { useAdminGovernance } from './AdminGovernancePanel';
import { queryClient } from '../lib/queryClient';
import type { PricingSettings } from '../../platformSettings';

const input = 'w-full min-w-0 rounded-xl border border-blue-200 bg-white/80 px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500';
const button = 'rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40';
const priceRows: { label: string; value: (prices: PricingSettings) => number; unit: string }[] = [
  { label: 'Registration fee', value: p => p.registrationFee, unit: 'GHS' }, { label: 'Commission', value: p => p.commission, unit: '%' },
  { label: 'Semester fee (two months)', value: p => p.semesterFee, unit: 'GHS' },
  ...(['default', 'star', 'pro'] as const).map(plan => ({ label: `Pine ${plan[0].toUpperCase() + plan.slice(1)} (monthly)`, value: (p: PricingSettings) => p.subscriptionPrices[plan], unit: 'GHS' }))
];
export default function AdminSettingsPanel() {
  const feedback = useActionFeedback();
  const { apiFetch, user, updateUser } = useAuth(), { settings } = usePlatformSettings(), { data: governance } = useAdminGovernance();
  const self = governance?.members.find((member: any) => member.id === user?.id);
  const [fee, setFee] = useState(''), [commission, setCommission] = useState(''), [announcement, setAnnouncement] = useState(''), [maintenance, setMaintenance] = useState(false);
  const [semesterFee, setSemesterFee] = useState(''), [planPrices, setPlanPrices] = useState({ default: '', star: '', pro: '' });
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [key, setKey] = useState(''), [password, setPassword] = useState(''), [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState(false), [, setError] = useState(''), [notice, setNotice] = useState(''), [dirty, setDirty] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [receiving, setReceiving] = useState<any>(null), [receivingCode, setReceivingCode] = useState('');
  const [pricingReason, setPricingReason] = useState(''), [portalDirty, setPortalDirty] = useState(false);
  const activeAdmins = governance?.members.filter((member: any) => member.active) || [];
  const pricingReady = activeAdmins.length >= 3 && activeAdmins.length <= 5 && activeAdmins.filter((member: any) => member.settingsKeyEnrolled).length >= 3 && activeAdmins.some((member: any) => member.id === governance?.mainId && member.settingsKeyEnrolled);
  const main = user?.id === governance?.mainId;
  useEffect(() => { if (settings && !dirty) { setFee(String(settings.registrationFee)); setSemesterFee(String(settings.semesterFee)); setPlanPrices({ default: String(settings.subscriptionPrices.default), star: String(settings.subscriptionPrices.star), pro: String(settings.subscriptionPrices.pro) }); setCommission(String(settings.commission)); } }, [settings, dirty]);
  useEffect(() => { if (settings && !portalDirty) { setAnnouncement(settings.announcement); setMaintenance(settings.maintenanceMode); } }, [settings, portalDirty]);
  async function act(action: () => Promise<void>) {
    if (busy) return;
    const origin = feedback.begin();
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err: any) { setError(err.message || 'This change could not be saved.'); feedback.fail(err.message || 'This change could not be saved.', origin); }
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
  return <section onClickCapture={feedback.capture} onSubmitCapture={feedback.capture} className="space-y-6 text-slate-900" aria-label="Administrator settings">
    <header className="rounded-3xl border border-blue-200 bg-white/65 p-6"><h3 className="text-xl font-bold">PineVela Admin Settings</h3><p className="mt-2 text-xs text-slate-600">Configure marketplace registration and subscription fees in GHS, commission accounting, system announcements, and platform maintenance.</p></header>
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">{notice}</p>}
    {!self ? <p role="status">Loading administrator key status…</p> : !self.settingsKeyEnrolled && <form className="space-y-4 rounded-3xl border border-blue-200 bg-white/65 p-6" onSubmit={event => { event.preventDefault(); void act(async () => { const result = await post('/api/admin/governance/keys/settings/enroll', { password }); setNewKey(result.settingsKey); setNotice(result.message); await queryClient.invalidateQueries({ queryKey: ['adminGovernance'] }); }); }}>
      <h4 className="font-bold">Enroll your separate settings key</h4><p className="text-sm text-slate-600">Verify your own login password to receive a private settings key. Wipe approval keys cannot change these settings.</p>
      <label className="block text-sm">Current login password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className={input} /></label><button className={button} disabled={busy}>Generate my settings key</button>
    </form>}
    {newKey && <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5"><p className="text-sm font-semibold">Save this settings key privately. This is its only display.</p><code className="block select-all break-all text-sm">{newKey}</code><button type="button" className={button} onClick={() => setNewKey('')}>I saved my settings key</button></div>}
    <div className="rounded-2xl border border-blue-200 bg-white/65 p-5"><label className="block text-sm font-semibold">Your private settings key<input type="password" autoComplete="off" value={key} maxLength={128} onChange={event => setKey(event.target.value)} className={input} /></label><p className="mt-2 text-xs text-slate-600">Required for every settings or profile change. Lost keys can be reset under Admin Approvals by two other administrators.</p></div>
    <form aria-label="Propose marketplace pricing" className="space-y-6 rounded-3xl border border-blue-200 bg-white/65 p-6" onSubmit={event => { event.preventDefault(); void act(async () => { const result = await post('/api/admin/governance/pricing', { prices: { registrationFee: Number(fee), semesterFee: Number(semesterFee), subscriptionPrices: Object.fromEntries(Object.entries(planPrices).map(([plan, value]) => [plan, Number(value)])), commission: Number(commission) }, reason: pricingReason, settingsKey: key }); if (!result.success) throw new Error('Pricing proposal could not be saved.'); setDirty(false); setPricingReason(''); setNotice(result.message); await queryClient.invalidateQueries({ queryKey: ['adminGovernance'] }); }); }}>
      <h4 className="font-bold">Propose marketplace pricing</h4><p className="text-sm text-slate-600">At least three distinct administrators must approve. Up to five may vote. Only administrator #1 can make the final push; submitting or voting never changes live prices.</p>
      {!pricingReady && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Pricing needs at least three active administrators with enrolled settings keys, including administrator #1. Invite/enroll the required administrators through Admin Approvals.</p>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">New marketplace registration fee (GHS)<input type="number" required min="0" max="1000000" step="0.01" value={fee} onChange={event => { setDirty(true); setFee(event.target.value); }} className={input} /></label><label className="text-sm font-semibold">Marketplace commission (%)<input type="number" required min="0" max="100" step="0.01" value={commission} onChange={event => { setDirty(true); setCommission(event.target.value); }} className={input} /></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Semester fee — every two months (GHS)<input type="number" required min="0" max="1000000" step="0.01" value={semesterFee} onChange={event => { setDirty(true); setSemesterFee(event.target.value); }} className={input} /></label>{(['default', 'star', 'pro'] as const).map(plan => <label key={plan} className="text-sm font-semibold">Pine {plan[0].toUpperCase() + plan.slice(1)} — monthly (GHS)<input type="number" required min="0" max="1000000" step="0.01" value={planPrices[plan]} onChange={event => { setDirty(true); setPlanPrices(previous => ({ ...previous, [plan]: event.target.value })); }} className={input} /></label>)}</div><p className="text-xs text-slate-600">Prices apply to new Paystack checkouts. Existing payment quotes and paid periods retain their agreed amounts. Registration is one-time; plans renew monthly and the semester fee renews every two calendar months. Renewal requires checkout; there is no automatic debit.</p>
      <label className="block text-sm font-semibold">Reason for pricing change<input type="text" required minLength={3} maxLength={500} value={pricingReason} onChange={event => setPricingReason(event.target.value)} className={input} /></label>
      <button className={button} disabled={busy || !key || !self?.settingsKeyEnrolled || !settings || !pricingReady}>Submit pricing proposal</button>
    </form>
    <section aria-label="Marketplace pricing approvals" className="space-y-4">
      <h4 className="text-lg font-bold">Shared pricing proposals</h4>
      {!governance?.pricingProposals?.length && <p className="text-sm text-slate-600">No pricing proposals have been submitted.</p>}
      {governance?.pricingProposals?.slice().reverse().map((proposal: any) => {
        const approvals = proposal.votes.filter((vote: any) => vote.decision === 'approved').length;
        const open = ['pending', 'approved'].includes(proposal.status), voted = proposal.votes.some((vote: any) => vote.id === user?.id);
        return <article key={proposal.id} data-pricing-proposal={proposal.id} className="min-w-0 space-y-4 rounded-3xl border border-blue-200 bg-white/65 p-5">
          <div className="flex flex-wrap justify-between gap-2"><strong>{approvals} approvals · minimum 3</strong><span className="text-sm capitalize text-blue-800">{proposal.status === 'approved' ? 'Ready for main admin’s final push' : proposal.status}</span></div>
          <p className="break-words text-sm">{proposal.reason}</p><p className="break-all text-xs text-slate-600">Proposed by {proposal.roster.find((member: any) => member.id === proposal.createdBy)?.name} · {proposal.createdBy}</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-2">Setting</th><th className="px-2">Current at proposal</th><th className="px-2">Proposed</th></tr></thead><tbody>{priceRows.map(row => <tr key={row.label} className="border-t border-blue-100"><th className="py-2 font-medium">{row.label}</th><td className="px-2">{row.value(proposal.before).toFixed(2)} {row.unit}</td><td className="px-2 font-semibold">{row.value(proposal.prices).toFixed(2)} {row.unit}</td></tr>)}</tbody></table></div>
          <ul className="space-y-1 text-xs">{proposal.roster.map((member: any) => { const vote = proposal.votes.find((entry: any) => entry.id === member.id); return <li key={member.id} className="break-words">#{member.slot} · {member.name} · {vote ? `${vote.decision} · ${new Date(vote.at).toLocaleString()}` : 'Awaiting vote'}</li>; })}</ul>
          <p className="text-xs text-slate-600">Expires {new Date(proposal.expiresAt).toLocaleString()}</p>
          {open && !voted && proposal.roster.some((member: any) => member.id === user?.id) && <div className="flex flex-wrap gap-2">{(['approved', 'rejected'] as const).map(decision => <button key={decision} type="button" className={button} disabled={busy || !key || !self?.settingsKeyEnrolled} onClick={() => void act(async () => { const result = await post(`/api/admin/governance/pricing/${proposal.id}/vote`, { decision, settingsKey: key }); setNotice(result.message); await queryClient.invalidateQueries({ queryKey: ['adminGovernance'] }); })}>{decision === 'approved' ? 'Approve pricing' : 'Reject pricing'}</button>)}</div>}
          {open && main && <button type="button" className={button} disabled={busy || !key || !self?.settingsKeyEnrolled || proposal.status !== 'approved' || approvals < 3} onClick={() => void act(async () => { const result = await post(`/api/admin/governance/pricing/${proposal.id}/apply`, { settingsKey: key }); if (!result.success) throw new Error('Pricing could not be applied.'); setDirty(false); queryClient.setQueryData(['settings'], result.settings); setNotice(result.message); await queryClient.invalidateQueries({ queryKey: ['adminGovernance'] }); await queryClient.invalidateQueries({ queryKey: ['settings'] }); })}>Final push — apply approved pricing</button>}
          {open && !main && <p className="text-xs text-blue-800">Administrator #1 makes the final push after at least three approvals.</p>}
          {proposal.status === 'applied' && <p className="break-all text-xs text-blue-800">Applied by administrator #1 · {proposal.appliedBy} · {new Date(proposal.appliedAt).toLocaleString()}</p>}
        </article>;
      })}
    </section>
    <form aria-label="Portal settings" className="space-y-6 rounded-3xl border border-blue-200 bg-white/65 p-6" onSubmit={event => { event.preventDefault(); void act(async () => { const result = await post('/api/settings', { announcement, maintenanceMode: maintenance, settingsKey: key, ...(settings?.maintenanceMode && !maintenance ? { maintenanceRecoveryMessage: recoveryMessage } : {}) }); if (!result.success) throw new Error('Settings could not be saved.'); setPortalDirty(false); setRecoveryMessage(''); queryClient.setQueryData(['settings'], result.settings); setNotice('Platform settings saved. All portals will receive the update.'); }); }}>
      <h4 className="font-bold">Announcements and maintenance</h4>
      <label className="block text-sm font-semibold">Global System Announcement<textarea rows={3} maxLength={2000} value={announcement} onChange={event => { setPortalDirty(true); setAnnouncement(event.target.value); }} className={input} /><span className="text-xs font-normal text-slate-600">Sent to non-admin accounts’ notifications. Clear the text to stop publishing an announcement.</span></label>
      <label className="flex items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-4"><span><strong className="block text-sm">Platform Maintenance Mode</strong><span className="text-xs text-slate-600">Temporary restrict non admin accounts during database updates</span></span><input aria-label="Platform Maintenance Mode" type="checkbox" checked={maintenance} onChange={event => { setPortalDirty(true); setMaintenance(event.target.checked); }} className="h-5 w-5 accent-blue-600" /></label>
      {settings?.maintenanceMode && !maintenance && <label className="block text-sm font-semibold">Message for returning users<textarea required rows={4} maxLength={2000} value={recoveryMessage} onChange={event => setRecoveryMessage(event.target.value)} className={input} /><span className="text-xs font-normal text-slate-600">Users will see this message in a popup when they sign in after maintenance. Each account can dismiss it.</span></label>}
      <button className={button} disabled={busy || !key || !self?.settingsKeyEnrolled || !settings}>Save Admin Settings</button>
    </form>
    <section className="space-y-4 rounded-3xl border border-blue-200 bg-white/65 p-6" aria-label="Payment receiving account">
      <h4 className="font-bold">Payment receiving account</h4>
      <p className="text-sm text-slate-600">Payments settle to your main Paystack account unless you select a verified receiving account below. Add or update your bank or supported mobile-money settlement account in <a href="https://dashboard.paystack.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline">Paystack</a>, then reload the accounts here. Sellers are not shown receiving bank or wallet numbers.</p>
      <button type="button" className={button} disabled={busy} onClick={() => void act(async () => { const result = await apiFetch('/api/admin/payments/receiving-account'); if (!result || !Array.isArray(result.accounts)) throw new Error('Receiving accounts could not be loaded.'); setReceiving(result); setReceivingCode(result.selected); })}>Load Paystack receiving accounts</button>
      {receiving && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void act(async () => { const result = await post('/api/admin/payments/receiving-account', { code: receivingCode, settingsKey: key }); if (!result.success) throw new Error('Receiving account could not be saved.'); setReceiving({ ...receiving, selected: result.selected }); setNotice('Receiving account saved for new checkouts. Existing checkouts keep their original destination.'); }); }}>
        <p className="text-xs text-slate-600">Paystack environment: {receiving.mode}</p>
        <label className="block text-sm font-semibold">Receive payments into<select className={input} value={receivingCode} onChange={event => setReceivingCode(event.target.value)}><option value="">Main Paystack settlement account</option>{receiving.selected && !receiving.accounts.some((account: any) => account.code === receiving.selected) && <option disabled value={receiving.selected}>Previously selected account unavailable — choose another</option>}{receiving.accounts.map((account: any) => <option key={account.code} value={account.code}>{account.name} · {account.bank} · ending {account.last4}</option>)}</select></label>
        {!receiving.accounts.length && <p className="text-xs text-slate-600">No active, verified GHS subaccounts were returned. Configure and verify the receiving account in Paystack first.</p>}
        {receiving.possiblyMore && <p className="text-xs text-slate-600">Showing the first 100 Paystack accounts. Manage additional accounts in Paystack.</p>}
        <button className={button} disabled={busy || !key || !self?.settingsKeyEnrolled}>Save receiving account with settings key</button>
      </form>}
    </section>
    <form className="space-y-4 rounded-3xl border border-blue-200 bg-white/65 p-6" onSubmit={event => { event.preventDefault(); void act(savePhoto); }}>
      <h4 className="font-bold">Your administrator profile photograph</h4><div className="flex items-center gap-4">{user?.photo || user?.avatar ? <img src={user.photo || user.avatar} alt="Your administrator profile" className="h-20 w-20 rounded-full object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-900">{user?.name?.slice(0, 1)}</span>}<p className="text-xs text-slate-600">JPEG, PNG or WebP up to 5 MB. Photographs are decoded, checked and re-encoded with a maximum dimension of 800 pixels.</p></div>
      <label className="block text-sm">Choose profile photograph<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setPhotoFile(event.target.files?.[0] || null)} className={input} /></label><button className={button} disabled={busy || !photoFile || !key || !self?.settingsKeyEnrolled}>Save profile photograph</button>
    </form>
  </section>;
}
