import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LogIn } from 'lucide-react';
import HelpLink from '../components/HelpLink';
import PineLogo from '../components/PineLogo';
import ThemeToggle from '../components/ThemeToggle';
import welcomeArtwork from '../../assets/landing-welcome-transparent.png';
import './welcome.css';

export default function NativeWelcome({ restoringSession = false }: { restoringSession?: boolean }) {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Welcome to PineVela';
    return () => { document.title = previous; };
  }, []);

  return <div className="native-welcome" data-native-welcome>
    <div className="native-welcome-artwork" aria-hidden="true">
      <img src={welcomeArtwork} width={1448} height={1086} alt="" fetchPriority="high" decoding="async" />
    </div>
    <header className="native-welcome-header">
      <PineLogo />
      <div className="native-welcome-tools"><HelpLink compact /><ThemeToggle showSystemDefault={false} /></div>
    </header>
    <main className="native-welcome-main">
      <section className="native-welcome-card" aria-labelledby="native-welcome-title">
        <h1 id="native-welcome-title">Welcome to <span>PineVela</span></h1>
        <p>Sign in or create an account.<br />Your next chapter starts here.</p>
        <nav className="native-welcome-actions" aria-label="Account access">
          <Link to="/login?mode=login" data-native-welcome-login className="native-welcome-primary">
            <LogIn size={19} aria-hidden="true" /><span>Sign in</span>
          </Link>
          <Link to="/login?mode=register" data-native-welcome-signup className="native-welcome-secondary">
            <span>Create an account</span><ArrowRight size={19} aria-hidden="true" />
          </Link>
        </nav>
        {restoringSession && <p className="native-welcome-restoring" role="status">Checking your saved sign-in…</p>}
      </section>
    </main>
    <footer className="native-welcome-footer"><Link to="/help">Help & support</Link><a href="/privacy.html">Privacy policy</a><a href="/terms.html">Terms of service</a></footer>
  </div>;
}
