import { CircleHelp } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function HelpLink({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { pathname } = useLocation();
  return <Link to={`/help?from=${encodeURIComponent(pathname)}`} aria-label="Help: ask a question or report a problem" title="Help & support"
    className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-blue-800 ${className}`}>
    <CircleHelp aria-hidden="true" size={19} /><span className={compact ? 'sr-only' : ''}>Help</span>
  </Link>;
}
