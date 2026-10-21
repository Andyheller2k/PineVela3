import { useTheme } from '../context/ThemeContext';

/** Light product pages retain their atmosphere; dark pages use a solid canvas. */
export default function ThemeEnvironment() {
  const { theme, publicAppearance } = useTheme();
  if (publicAppearance || theme === 'dark') return null;
  return <div className="theme-environment" aria-hidden="true">
    <div className="theme-atmosphere atmosphere-one" /><div className="theme-atmosphere atmosphere-two" />
  </div>;
}
