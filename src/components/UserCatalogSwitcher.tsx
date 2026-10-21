import { useId } from 'react';
import NavigationHighlight from './NavigationHighlight';

export default function UserCatalogSwitcher({ value, onChange }: {
  value: 'market' | 'hostels'; onChange: (value: 'market' | 'hostels') => void;
}) {
  const id = useId();
  return <div role="group" aria-label="Home catalog" className="user-catalog-switcher home-catalog-switcher flex gap-1 rounded-2xl border p-1.5 sm:max-w-md">
    {(['market', 'hostels'] as const).map(catalog => <button key={catalog} type="button" aria-pressed={value === catalog}
      onClick={() => onChange(catalog)} className="min-h-11 flex-1 rounded-xl px-4 text-sm font-black transition-colors cursor-pointer">
      {value === catalog && <NavigationHighlight id={`catalog-${id}`} />}<span>{catalog === 'market' ? 'Market' : 'Residences'}</span>
    </button>)}
  </div>;
}
