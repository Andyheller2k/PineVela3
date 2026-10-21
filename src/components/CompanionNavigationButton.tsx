import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

export default function CompanionNavigationButton({ open, onLaunch, badge }: { open: boolean; onLaunch: () => void; badge?: ReactNode }) {
  return <button type="button" className="ux-mobile-destination pv-companion-nav-launcher" aria-label="Ask AI" aria-haspopup="dialog" aria-expanded={open} onClick={onLaunch}>
    <span className="relative inline-flex"><Sparkles className="pv-companion-ai-icon" size={24} aria-hidden="true" />{badge}</span><span>Ask AI</span>
  </button>;
}
