import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowUpRight } from 'lucide-react';
import SupportLayout, { supportHome } from './SupportLayout';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { faqSections } from './faqContent';

export default function PageFAQ() {
  const [search, setSearch] = useState('');
  const { publicAppearance } = useTheme();
  const { user } = useAuth();
  const term = search.trim().toLowerCase();
  const sections = faqSections.map(section => ({ ...section, questions: section.questions.filter(([q, a]) => `${q} ${a}`.toLowerCase().includes(term)) })).filter(s => s.questions.length);
  return <SupportLayout publicPage={publicAppearance}>
    <section className="support-intro mb-10 max-w-3xl space-y-5">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">A little clarity goes a long way</p>
      <h1 className="text-4xl font-black tracking-tight sm:text-6xl">How can we help?</h1>
      <p className="text-base leading-relaxed text-slate-600 sm:text-lg">Straightforward answers about campus purchases, seller subscriptions, room access and care.</p>
      <label className="faq-search relative block max-w-xl"><span className="sr-only">Search frequently asked questions</span><Search size={19} aria-hidden="true" className="absolute left-4 top-4 text-slate-500" />
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions" className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm text-slate-900" /></label>
      <nav aria-label="FAQ topics" className="faq-topics flex flex-wrap gap-2">{sections.map(s => <a key={s.id} href={`#faq-${s.id}`} onClick={e => { e.preventDefault(); const section = document.getElementById(`faq-${s.id}`); section?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); }} className="rounded-xl border border-blue-200 px-4 py-2.5 text-xs font-bold text-blue-800">{s.title}</a>)}</nav>
    </section>
    <div className="space-y-12">{sections.map(section => <section id={`faq-${section.id}`} key={section.id} className="scroll-mt-6 space-y-5">
      <div><h2 tabIndex={-1} className="text-2xl font-black sm:text-3xl">{section.title}</h2><p className="mt-2 text-sm text-slate-500">{section.intro}</p></div>
      <div className="divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white">{section.questions.map(([question, answer]) => <details key={question} className="group px-5 sm:px-7">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-5 text-left text-base font-bold text-slate-900 focus-visible:rounded-lg focus-visible:outline-2"><span>{question}</span><span aria-hidden="true" className="text-xl text-blue-700 group-open:rotate-45">+</span></summary>
        <p className="max-w-4xl pb-6 text-sm leading-7 text-slate-600 sm:text-base">{answer}</p>
      </details>)}</div>
    </section>)}</div>
    {!sections.length && <p role="status" className="rounded-2xl border border-slate-200 p-6 text-sm text-slate-600">No matching questions. Try another search or send us your question.</p>}
    <section className="support-contact-card mt-12 flex flex-wrap items-center justify-between gap-5 rounded-3xl border p-6 sm:p-8"><div><h2 className="text-2xl font-bold">Still need a hand?</h2><p className="mt-2 text-sm text-slate-600">Ask a question or tell us what went wrong. Keep track of every reply.</p></div><Link to={`/help?from=${publicAppearance ? '/faq' : encodeURIComponent(supportHome(user))}`} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Contact support<ArrowUpRight aria-hidden="true" size={18} /></Link></section>
  </SupportLayout>;
}
