import PineLogo from './PineLogo';

/** Decorative layers animate independently of the page and never intercept input. */
export default function ThemeEnvironment({ showBrand = true }: { showBrand?: boolean }) {
  return <div className="theme-environment" aria-hidden="true">
    <div className="theme-night" />
    <div className="theme-atmosphere atmosphere-one" /><div className="theme-atmosphere atmosphere-two" />
    <div className="theme-stars">{Array.from({ length: 32 }, (_, i) => <i key={i}
      style={{ left: `${(i * 37 + 11) % 100}%`, top: `${(i * 23 + 7) % 88}%`, animationDelay: `${i % 6}s` }} />)}</div>
    <div className="theme-celestial theme-sun"><span /></div>
    <div className="theme-celestial theme-moon"><span><i /><i /><i /></span></div>
    {showBrand && <div className="theme-watermark"><PineLogo size={520} hideText /></div>}
  </div>;
}
