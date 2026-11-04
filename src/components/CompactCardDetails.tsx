import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Secondary listing information expands on phones and stays visible on desktop. */
export default function CompactCardDetails({ children }: { children: ReactNode }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  return <div className="compact-card-details" data-expanded={expanded}>
    <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)} className="compact-card-details-toggle">
      <span>{expanded ? 'Less detail' : 'More detail'}</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    <div id={id} className="compact-card-details-content">{children}</div>
  </div>;
}
