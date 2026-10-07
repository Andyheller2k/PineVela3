import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { internationalPhone, phoneCountries, getCountryCallingCode, type CountryCode } from '../../internationalPhone';

type Props = { value: string; country: CountryCode; onChange: (value: string, country: CountryCode) => void; error?: string };
export default function InternationalPhoneInput({ value, country, onChange, error }: Props) {
  const id = useId(), root = useRef<HTMLDivElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [inputError, setInputError] = useState(''), [touched, setTouched] = useState(false);
  const selected = phoneCountries.find(item => item.code === country)!;
  const query = search.trim().toLowerCase().replace(/^\+/, '');
  const countries = phoneCountries.filter(item => !query || `${item.name} ${item.code} ${item.callingCode}`.toLowerCase().includes(query));
  let validation = '';
  if (touched && value) try { internationalPhone(value, country); } catch (err) { validation = (err as Error).message; }
  const message = error || inputError || validation;
  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={root} className="relative space-y-1.5" onKeyDown={event => { if (open && event.key === 'Escape') { event.stopPropagation(); setOpen(false); root.current?.querySelector('button')?.focus(); } }}>
    <label htmlFor={id} className="text-xs font-bold text-slate-700">Primary Contact Phone <span className="text-rose-500">*</span></label>
    <div className={`flex min-w-0 rounded-xl border bg-slate-50 ${message ? 'border-rose-400' : 'border-slate-200'}`}>
      <button type="button" aria-label={`Phone country: ${selected.name} +${selected.callingCode}`} aria-expanded={open} aria-controls={`${id}-countries`} onClick={() => { setSearch(''); setOpen(v => !v); }} className="flex shrink-0 items-center gap-1 border-r border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-800"><span>{country} +{getCountryCallingCode(country)}</span><ChevronDown size={14} /></button>
      <input id={id} type="tel" inputMode="numeric" autoComplete="tel-national" aria-label="Primary contact phone number" aria-describedby={message ? `${id}-error` : `${id}-help`} aria-invalid={!!message} value={value} maxLength={17}
        onChange={event => { if (/^[0-9]*$/.test(event.target.value)) { setInputError(''); onChange(event.target.value, country); } else setInputError('Enter digits only.'); }}
        onBlur={() => setTouched(true)} onPaste={event => {
          const text = event.clipboardData.getData('text').trim();
          if (/^\+?[0-9][0-9\s().-]*$/.test(text)) {
            event.preventDefault();
            if (text.startsWith('+')) try { onChange(internationalPhone(text, country).nationalNumber, country); setInputError(''); } catch (err) { setInputError((err as Error).message); }
            else { onChange(text.replace(/\D/g, ''), country); setInputError(''); }
          } else { event.preventDefault(); setInputError('Enter digits only.'); }
        }} className="min-w-0 w-full bg-transparent px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600" />
    </div>
    {open && <div id={`${id}-countries`} className="absolute left-0 top-full z-30 mt-1 w-full rounded-2xl border border-blue-200 bg-white p-2 shadow-xl">
      <input ref={searchInput} aria-label="Search phone countries" value={search} onChange={event => setSearch(event.target.value)} autoComplete="off" className="mb-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900" placeholder="Search country or calling code" />
      <ul aria-label="Phone countries in alphabetical order" className="max-h-52 overflow-y-auto">{countries.map(item => <li key={item.code}><button type="button" aria-pressed={item.code === country} onClick={() => { onChange(value, item.code); setTouched(true); setInputError(''); setOpen(false); root.current?.querySelector('button')?.focus(); }} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs text-slate-800 hover:bg-blue-50"><span>{item.name} ({item.code})</span><span className="flex items-center gap-1 font-bold">+{item.callingCode}{item.code === country && <Check size={13} />}</span></button></li>)}</ul>
      {!countries.length && <p className="p-2 text-xs text-slate-500">No countries match your search.</p>}
    </div>}
    {message ? <p id={`${id}-error`} role="alert" className="text-[11px] font-semibold text-rose-600">{message}</p> : <p id={`${id}-help`} className="text-[11px] text-slate-500">Mobile, landline and other phone numbers. Select the country, then enter the local number.</p>}
  </div>;
}
