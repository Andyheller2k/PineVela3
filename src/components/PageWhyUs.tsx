import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Building2, Check, ShoppingBag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PublicHeader from './PublicHeader';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import { whyUsSections } from './whyUsContent';
import '../whyUs.css';

export default function PageWhyUs() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [search, setSearch] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.title;
    document.title = 'Why choose PineVela? | PineVela';
    window.scrollTo({ top: 0, behavior: 'instant' });
    title.current?.focus({ preventScroll: true });
    return () => { document.title = previous; };
  }, []);
  const jumpTo = (id: string) => {
    const section = document.getElementById(id);
    section?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };
  return <div className="why-us-page public-typography">
    <PublicHeader compact searchQuery={search} setSearchQuery={setSearch}
      onSearch={() => navigate(`/?search=${encodeURIComponent(search)}`)} onHome={() => navigate('/')}
      onCompanySection={section => navigate(`/?section=${section}`)} setShowLogoutConfirm={setConfirmLogout} />
    <main id="why-us-main" className="why-us-main">
      <section className="why-us-intro" aria-labelledby="why-us-title">
        <Link to="/" className="why-us-back"><ArrowLeft size={16} aria-hidden="true" /> Back to campus life</Link>
        <p className="why-us-eyebrow">Made for student life</p>
        <h1 id="why-us-title" ref={title} tabIndex={-1}>Why choose <span>PineVela?</span></h1>
        <p className="why-us-lead">Less chasing. More student life.</p>
        <p className="why-us-description">A clearer way to buy, sell, and navigate hostel living.</p>
        <nav aria-label="Why PineVela topics" className="why-us-topics">
          <button type="button" onClick={() => jumpTo('why-market')}><ShoppingBag size={18} aria-hidden="true" /> Buying & selling <span>08</span></button>
          <button type="button" onClick={() => jumpTo('why-residence')}><Building2 size={18} aria-hidden="true" /> Hostel living <span>06</span></button>
        </nav>
      </section>
      {whyUsSections.map(section => <section key={section.id} id={section.id} className="why-us-section" aria-labelledby={`${section.id}-title`}>
        <header className="why-us-section-heading"><p className="why-us-eyebrow">{section.number} / {section.id === 'why-market' ? 'Student Market' : 'Student residences'}</p>
          <h2 id={`${section.id}-title`} tabIndex={-1}>{section.title}</h2><p>{section.intro}</p>
        </header>
        <div className="why-us-comparisons">{section.comparisons.map((comparison, index) => <article key={comparison.id} className="why-us-comparison" aria-labelledby={`why-${comparison.id}`}>
          <div className="why-us-comparison-heading"><span className="why-us-comparison-icon"><comparison.icon size={21} strokeWidth={1.7} aria-hidden="true" /></span>
            <h3 id={`why-${comparison.id}`}>{comparison.title}</h3><span className="why-us-comparison-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          </div>
          <div className="why-us-pair">
            <div className="why-us-traditional"><p className="why-us-side-label">The usual way</p><p>{comparison.traditional}</p></div>
            <div className="why-us-advantage"><p className="why-us-side-label"><Check size={15} aria-hidden="true" /> With PineVela</p><p>{comparison.pinevela}</p></div>
          </div>
        </article>)}</div>
      </section>)}
      <section className="why-us-closing" aria-labelledby="why-us-closing-title"><div><p className="why-us-eyebrow">Your next step</p>
        <h2 id="why-us-closing-title">Make room for an easier student day.</h2><p>From finding room essentials to reporting a repair, keep your student life moving in one place.</p></div>
        <div className="why-us-closing-actions"><Link className="why-us-primary" to="/login?mode=register" state={{ mode: 'register' }}>Create your free account<ArrowUpRight size={18} aria-hidden="true" /></Link>
          <Link className="why-us-secondary" to="/pinemarket">Explore student market<ArrowUpRight size={17} aria-hidden="true" /></Link></div>
      </section>
    </main>
    <footer className="why-us-footer"><span>Built for the modern campus.</span><nav aria-label="More about PineVela"><Link to="/">Home</Link><Link to="/faq?from=/why-us">FAQ</Link><Link to="/help?from=/why-us">Help</Link></nav></footer>
    <LogoutConfirmationModal isOpen={confirmLogout} onClose={() => setConfirmLogout(false)} userName={user?.name}
      onConfirm={async () => { if (await logout()) setConfirmLogout(false); }} />
  </div>;
}
