import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

export default function CompanionNavigationButton({ open, onLaunch, badge }: { open: boolean; onLaunch: () => void; badge?: ReactNode }) {
  return <button type="button" className="ux-mobile-destination pv-companion-nav-launcher" data-navigation-id="companion" data-nav-active={open || undefined} aria-label="Ask AI" aria-haspopup="dialog" aria-expanded={open} onClick={onLaunch}>
    <span className="pv-nav-icon"><Sparkles className="pv-companion-ai-icon" size={25} aria-hidden="true" />{badge}</span><span className="pv-nav-label">Ask AI</span>
  </button>;
}
