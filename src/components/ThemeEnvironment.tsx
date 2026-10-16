import { useLocation } from 'react-router-dom';

/** Decorative layers animate independently of the page and never intercept input. */
export default function ThemeEnvironment({ embedded = false }: { embedded?: boolean }) {
  const { pathname } = useLocation();
  // The landing hero owns its gradient and needs the sky inside that layer.
  if (!embedded && pathname === '/') return null;
  return <div className={`theme-environment${embedded ? ' theme-environment-embedded' : ''}`} aria-hidden="true">
    {!embedded && <div className="theme-night" />}
    <div className="theme-atmosphere atmosphere-one" /><div className="theme-atmosphere atmosphere-two" />
    <div className="theme-stars">{Array.from({ length: 32 }, (_, i) => <i key={i}
      style={{ left: `${(i * 37 + 11) % 100}%`, top: `${(i * 23 + 7) % 88}%`, animationDelay: `${i % 6}s` }} />)}</div>
    <div className="theme-celestial theme-sun"><span /></div>
    <div className="theme-celestial theme-moon"><span><i /><i /><i /></span></div>
  </div>;
}
