import { useQuery } from '@tanstack/react-query';
import { useEffect,useRef,useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { sessionFetch } from '../lib/session';

const groups: Record<string, string> = { managers: 'Managers', residents: 'Residents', users: 'Primary users', marketers: 'Marketers / sellers', staff: 'Staff' };
const control = 'mt-1 w-full rounded-xl border border-blue-200 bg-white p-3 text-sm text-slate-900';
const button = 'rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40';
export default function AdminMessageGateway() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <MessageGateway key={user.id} /> : null;
}
function MessageGateway() {
  const { user } = useAuth();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function request(path: string, body?: unknown, signal?: AbortSignal) {
    const response = await sessionFetch(path, { method: body === undefined ? 'GET' : 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-PineVela-Account-Context': user!.id },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'The message request could not complete.'), { status: response.status });
    return result;
  }
  const { data: accounts = [], error, isPending, refetch } = useQuery<any[]>({ queryKey: ['adminMessageAccounts', user?.id], queryFn: async ({ signal }) => {
    const result = await request('/api/admin/messages/accounts', undefined, signal); if (!Array.isArray(result)) throw new Error('Recipient accounts could not load. Sign in again.'); return result;
  } });
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]), [selected, setSelected] = useState<string[]>([]), [search, setSearch] = useState('');
  const [title, setTitle] = useState(''), [message, setMessage] = useState(''), [type, setType] = useState('info');
  const [preview, setPreview] = useState<any>(null), [receipt, setReceipt] = useState<any>(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const key = (account: any) => JSON.stringify([account.role, account.id]);
  const selection = { groups: selectedGroups, accounts: selected.map(value => { const [role, id] = JSON.parse(value); return { role, id }; }) };
  async function act(send: boolean) {
    if (busy) return; setBusy(true); setFailure(''); setReceipt(null);
    try {
      const result = await request(send ? '/api/admin/messages' : '/api/admin/messages/preview', send ? { ...selection, title, message, type, fingerprint: preview?.fingerprint } : selection);
      if (!mounted.current) return;
      if (!result || Array.isArray(result)) throw new Error('Sign in again to continue.');
      if (send) { setReceipt(result); setPreview(null); setTitle(''); setMessage(''); setSelected([]); setSelectedGroups([]); }
      else setPreview(result);
    } catch (err: any) { if (mounted.current) {
      setFailure(err.message || 'The message could not be delivered.');
      if (err.status === 409 || send && false) setPreview(null);
      if (err.status === 409) { setSelected([]); void refetch(); }
    } }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section aria-label="Admin Message Gateway" className="space-y-5 rounded-3xl border border-blue-200 bg-white/70 p-5 text-slate-900">
    <h2 className="text-xl font-bold">Message Gateway</h2>
    <p className="text-sm">Send an announcement to selected accounts. Each recipient receives a notification and a popup they can dismiss once. Role groups reach only that account type.</p>
    {error && <p role="alert" className="text-red-700">{error.message}</p>}
    {isPending && <p role="status">Loading recipient accounts…</p>}
    <fieldset disabled={busy} className="space-y-5">
    <fieldset className="flex flex-wrap gap-4"><legend className="mb-3 text-sm font-bold">Recipient groups</legend>{Object.entries(groups).map(([id, label]) => <label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedGroups.includes(id)} onChange={e => { setSelectedGroups(current => e.target.checked ? [...current, id] : current.filter(v => v !== id)); setPreview(null); }} />{label} ({accounts.filter(account => (id === 'managers' ? ['manager'] : id === 'residents' ? ['student', 'resident'] : id === 'users' ? ['user'] : id === 'marketers' ? ['merchant'] : ['staff']).includes(account.role)).length})</label>)}</fieldset>
    <label className="block text-sm font-semibold">Find specific accounts<input type="search" value={search} onChange={e => setSearch(e.target.value)} className={control} /></label>
    <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-blue-100 p-3">{accounts.filter(account => `${account.name} ${account.email} ${account.role}`.toLowerCase().includes(search.toLowerCase())).map(account => <label key={key(account)} className="flex items-start gap-2 rounded-xl bg-white p-2 text-sm"><input className="mt-1" type="checkbox" checked={selected.includes(key(account))} onChange={e => { setSelected(current => e.target.checked ? [...current, key(account)] : current.filter(v => v !== key(account))); setPreview(null); }} /><span className="min-w-0 break-words"><strong>{account.name || account.email}</strong> · {account.role}<span className="block break-all text-xs text-slate-500">{account.email}</span></span></label>)}{!isPending && !accounts.length && !error && <p className="text-sm">No recipient accounts are registered.</p>}</div>
    <label className="block text-sm font-semibold">Message title<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} className={control} /></label>
    <label className="block text-sm font-semibold">Message<textarea required rows={5} maxLength={4000} value={message} onChange={e => setMessage(e.target.value)} className={control} /></label>
    <label className="block text-sm">Message type<select value={type} onChange={e => setType(e.target.value)} className={control}>{['info', 'success', 'warning', 'error'].map(value => <option key={value}>{value}</option>)}</select></label>
    <button className={button} disabled={busy || isPending || !!error || (!selected.length && !selectedGroups.length)} onClick={() => act(false)}>Review recipients</button>
    {preview && <div className="space-y-3 rounded-xl bg-blue-50 p-4"><p className="font-semibold">Delivery preview: {preview.count} distinct accounts</p>{Object.entries(preview.counts).map(([role, count]) => <p key={role} className="text-sm">{role}: {String(count)}</p>)}<button className={button} disabled={busy || !title.trim() || !message.trim()} onClick={() => act(true)}>{busy ? 'Sending…' : 'Send announcement'}</button></div>}
    </fieldset>
    {failure && <p role="alert" className="text-red-700">{failure}</p>}
    {receipt && <p role="status" className="rounded-xl bg-blue-50 p-4">Announcement delivered to {receipt.count} accounts.</p>}
  </section>;
}
