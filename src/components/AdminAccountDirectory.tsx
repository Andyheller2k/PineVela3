import { useState } from 'react';
import DashboardOverlay from './DashboardOverlay';
import { X, Users } from 'lucide-react';

export default function AdminAccountDirectory({ accounts, onManage }: { accounts: any[]; onManage: (account: any) => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const primaries = accounts.filter(account => account.role === 'user');
  const family = (primary: any) => accounts.filter(account => account.primaryAccountId === primary.id || account.id === primary.id && account.role === 'user');
  const visible = primaries.filter(primary => !search.trim() || family(primary).some(account => [account.name, account.email, account.phone, account.role].some(value => String(value || '').toLowerCase().includes(search.toLowerCase().trim()))));
  function branch(account: any, members: any[], visited = new Set<string>()) {
    const key = `${account.role}:${account.id}`;
    if (visited.has(key)) return null;
    const seen = new Set(visited).add(key);
    const children = members.filter(child => child.parentId === account.id && child.parentRole === account.role);
    return <li key={key} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-3">
        <div className="min-w-0 flex-1"><strong className="block break-words text-sm">{account.name}</strong><span className="block break-all text-xs text-slate-600">{account.role === 'user' ? 'Primary account' : account.role} · {account.email}</span><span className="text-xs text-blue-700">{account.status}</span></div>
        <button type="button" onClick={() => onManage(account)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white">Manage {account.role === 'user' ? 'primary account' : 'account'}</button>
      </div>
      {children.length > 0 && <ul className="ml-3 mt-3 space-y-3 border-l-2 border-blue-200 pl-3 sm:ml-5 sm:pl-5">{children.map(child => branch(child, members, seen))}</ul>}
    </li>;
  }
  return <section aria-label="Primary user accounts" className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-blue-200 bg-white/80 p-5"><div><h3 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Users size={20} />Primary user accounts</h3><p className="mt-1 text-xs text-slate-600">Open an account to manage its linked room, manager, staff and seller accounts.</p></div><input aria-label="Search primary users and linked accounts" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-xl border border-blue-200 bg-white p-3 text-sm sm:w-72" placeholder="Search name, email or linked account" /></header>
    <p className="text-sm text-slate-600">{visible.length} of {primaries.length} primary users</p>
    {visible.map(primary => <article key={primary.id} data-primary-account={primary.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-white/70 p-5"><div className="min-w-0 flex-1"><h4 className="break-words font-bold text-slate-900">{primary.name}</h4><p className="break-all text-sm text-slate-600">{primary.email}</p><p className="mt-1 text-xs text-blue-700">{primary.status} · {family(primary).length - 1} linked accounts</p></div><button type="button" onClick={() => setSelected(primary)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Manage account</button></article>)}
    {!visible.length && <p className="rounded-2xl bg-white/70 p-5 text-sm text-slate-600">No primary users match this search.</p>}
    {selected && <DashboardOverlay aria-label="Registered account tree" onClose={() => setSelected(null)} className="flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm"><section className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-blue-200 bg-white p-5 text-slate-900 shadow-2xl"><header className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{selected.name}’s registered accounts</h3><p className="mt-1 text-xs text-slate-600">Choose the individual account you want to manage. Existing approval rules apply.</p></div><button aria-label="Close account tree" onClick={() => setSelected(null)} className="rounded-full p-2 hover:bg-blue-50"><X size={20} /></button></header><ul className="space-y-3">{branch(accounts.find(account => account.id === selected.id && account.role === 'user') || selected, family(selected))}</ul></section></DashboardOverlay>}
  </section>;
}
