import { Banknote, RotateCcw, X } from 'lucide-react';

interface Props {
  id: string;
  min: number; max: number;
  onMinChange: (value: number) => void; onMaxChange: (value: number) => void;
  onClose: () => void;
  showClose?: boolean;
}

export default function MarketPricePanel({ id, min, max, onMinChange, onMaxChange, onClose, showClose = true }: Props) {
  const filtered = min > 0 || max < 5000;
  const maximum = max >= 5000 ? '5,000+' : max.toLocaleString();
  return <div id={id} role="group" aria-label="Price filters" className="market-price-panel rounded-2xl border">
    <div className="market-price-heading flex items-center justify-between gap-2">
      <p className="flex min-w-0 items-center gap-1.5 text-xs font-bold tabular-nums">
        <Banknote size={16} aria-hidden="true" className="shrink-0" />
        <span><span className="sr-only">Price range: </span>GHS {min.toLocaleString()}–{maximum}</span>
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label="Reset price filters" disabled={!filtered}
          onClick={() => { onMinChange(0); onMaxChange(5000); }}
          className="inline-flex items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold disabled:opacity-40">
          <RotateCcw size={14} aria-hidden="true" /><span>Reset</span>
        </button>
        {showClose && <button type="button" aria-label="Close price filters" onClick={onClose} className="inline-flex items-center justify-center rounded-lg">
          <X size={17} aria-hidden="true" />
        </button>}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <label className="min-w-0 text-xs font-semibold">Minimum
        <input type="range" aria-label="Minimum price" min="0" max={Math.min(max, 5000)} step="10" value={min}
          onChange={event => onMinChange(Number(event.target.value))} className="block w-full cursor-pointer" />
      </label>
      <label className="min-w-0 text-xs font-semibold">Maximum
        <input type="range" aria-label="Maximum price" min={min} max="5000" step="25" value={max}
          onChange={event => onMaxChange(Number(event.target.value))} className="block w-full cursor-pointer" />
      </label>
    </div>
    <div role="group" aria-label="Quick price ranges in GHS" className="market-price-presets flex items-center gap-1.5 overflow-x-auto">
      {[
        { label: 'Under 100', min: 0, max: 100 },
        { label: '100–500', min: 100, max: 500 },
        { label: '500–1,500', min: 500, max: 1500 },
        { label: '1,500–5,000+', min: 1500, max: 5000 },
        { label: 'All prices', min: 0, max: 5000 },
      ].map(preset => <button key={preset.label} type="button" aria-pressed={min === preset.min && max === preset.max}
        aria-label={preset.max === 5000 && preset.min === 0 ? 'All prices' : `GHS ${preset.min} to ${preset.max >= 5000 ? '5,000 and above' : preset.max}`}
        onClick={() => { onMinChange(preset.min); onMaxChange(preset.max); }}
        className="shrink-0 rounded-lg border px-2 text-[11px] font-bold whitespace-nowrap">{preset.label}</button>)}
    </div>
  </div>;
}
