import { ArrowUpDown, Clock3, TrendingDown, TrendingUp } from 'lucide-react';
import '../marketFilters.css';

export type MarketSort = 'featured' | 'price-asc' | 'price-desc' | 'newest';

export default function MarketSortSelect({ value, onChange, inventory = false }: {
  value: MarketSort; onChange: (value: MarketSort) => void; inventory?: boolean;
}) {
  const Icon = value === 'price-asc' ? TrendingUp : value === 'price-desc' ? TrendingDown : value === 'newest' ? Clock3 : ArrowUpDown;
  return <div className="market-sort-control relative inline-flex min-w-0 items-center">
    <Icon size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5" />
    <select aria-label={inventory ? 'Sort store inventory' : 'Sort marketplace'} value={value}
      onChange={event => onChange(event.target.value as MarketSort)}
      className="w-full min-w-0 rounded-xl border py-1.5 pl-8 pr-2 text-xs font-bold cursor-pointer">
      <option value="featured">{inventory ? 'Default' : 'Featured'}</option>
      <option value="price-asc">Price: low to high</option>
      <option value="price-desc">Price: high to low</option>
      <option value="newest">Newest first</option>
    </select>
  </div>;
}
