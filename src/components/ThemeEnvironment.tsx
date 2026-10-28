import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

/** Light product pages retain their atmosphere; dark pages use a solid canvas. */
export default function ThemeEnvironment() {
  const { theme, publicAppearance } = useTheme();
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  if (publicAppearance || theme === 'dark') return null;
  return <div className="theme-environment" aria-hidden="true" data-active={visible}>
    <div className="theme-atmosphere atmosphere-one" /><div className="theme-atmosphere atmosphere-two" />
  </div>;
}
