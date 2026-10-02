import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, ChevronDown, X } from 'lucide-react';
import { motion, useAnimationControls, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import PineLogo from './PineLogo';
import { companyContacts, companySections, CompanySection } from './companyStoryContent';
import './CompanyStory.css';

function ContactDestination({ contact, className, children }: {
  contact: typeof companyContacts[number]; className?: string; children: React.ReactNode;
}) {
  return contact.href ? (
    <a className={className} href={contact.href} target="_blank" rel="noopener noreferrer" aria-label={`Connect with PineVela on ${contact.name}`}>{children}</a>
  ) : <div className={className}>{children}</div>;
}

function StorySection({ section, index, container, controls }: {
  section: CompanySection; index: number; container: React.RefObject<HTMLDivElement>;
  controls: ReturnType<typeof useAnimationControls>;
}) {
  const target = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ container, target, offset: ['start end', 'end start'] });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.0001 });
  const x = useTransform(progress, [0, 0.18, 0.82, 1], ['4vw', '0vw', '0vw', '-4vw']);
  const opacity = useTransform(progress, [0, 0.12, 0.88, 1], [0, 1, 1, 0]);
  const scale = useTransform(progress, [0, 0.18, 0.82, 1], [0.98, 1, 1, 0.98]);
  const rotateY = useTransform(progress, [0, 0.18, 0.82, 1], [1.5, 0, 0, -1.5]);
  const imageY = useTransform(progress, [0, 0.18, 0.82, 1], [10, 0, 0, -10]);

  return (
    <section ref={target} id={`story-${section.id}`} className={`company-chapter ${index % 2 ? 'company-chapter-reversed' : ''} ${section.id === 'contact-us' ? 'company-chapter-contact' : ''}`} aria-labelledby={`title-${section.id}`}>
      <motion.div className="company-chapter-transition" animate={controls} initial={false}>
        <motion.div className="company-chapter-grid" style={reduced ? { x: 0, opacity: 1, scale: 1, rotateY: 0 } : { x, opacity, scale, rotateY }}>
          {section.image ? (
            <motion.div className={`company-image-card company-image-${section.id}`} style={{ y: reduced ? 0 : imageY }}>
              <img src={`/images/company/${section.image}`} alt={section.alt} width="1024" height="1024" loading={index === 0 ? 'eager' : 'lazy'} />
            </motion.div>
          ) : null}
          <div className="company-copy">
            <p className="company-eyebrow">{section.eyebrow}</p>
            <h2 id={`title-${section.id}`} tabIndex={-1}>{section.title}</h2>
            <div className="company-paragraphs">
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <motion.p key={paragraphIndex} className={paragraphIndex === 0 ? 'company-lead' : paragraph === 'So, who are we really?' ? 'company-subheading' : undefined}
                  initial={reduced ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ root: container, once: true, amount: 0.12 }} transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : Math.min(paragraphIndex * 0.045, 0.18) }}>
                  {paragraph}
                </motion.p>
              ))}
            </div>
            {section.id === 'contact-us' && <div className="company-contact-links">
              {companyContacts.map(contact => <ContactDestination key={contact.name} contact={contact} className="company-contact-row">
                <span className="company-contact-icon" aria-hidden="true"><img className={`company-platform-${contact.name.toLowerCase()}`} src={`/images/company/${contact.icon}`} alt="" width="28" height="28" loading="lazy" /></span>
                <span className="company-contact-details"><span className="company-contact-name">{contact.name}</span><span className="company-contact-url">{contact.href ? (contact.name === 'WhatsApp' ? contact.label : contact.href.replace(/^https?:\/\//, '')) : 'PineVela · Contact details coming soon'}</span></span>
                {contact.href && <ArrowUpRight size={20} aria-hidden="true" />}
              </ContactDestination>)}
            </div>}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

export default function CompanyStory({ onClose, initialSection = 'about-us' }: {
  onClose: () => void; initialSection?: CompanySection['id'];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const controls = useAnimationControls();
  const closeControls = useAnimationControls();
  const reduced = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(initialSection === 'about-us');
  const [active, setActive] = useState(() => Math.max(0, companySections.findIndex(section => section.id === initialSection)));
  const [fogEdges, setFogEdges] = useState({ top: false, bottom: true });
  const [isClosing, setIsClosing] = useState(false);
  const closing = useRef(false);
  const switching = useRef(false);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    const root = container.current;
    const chapter = root?.querySelector<HTMLElement>(`#story-${initialSection}`);
    if (root && chapter) root.scrollTo({ top: chapter.offsetTop, behavior: 'instant' });
    if (initialSection !== 'about-us') chapter?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    return () => {
      mounted.current = false;
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menuOpen]);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = root.scrollTop > 2;
        const bottom = root.scrollTop + root.clientHeight < root.scrollHeight - 2;
        setFogEdges(previous => previous.top === top && previous.bottom === bottom ? previous : { top, bottom });
        const line = root.getBoundingClientRect().top + root.clientHeight * 0.35;
        const chapters = Array.from(root.querySelectorAll<HTMLElement>('.company-chapter'));
        const current = chapters.findIndex(chapter => {
          const bounds = chapter.getBoundingClientRect();
          return bounds.top <= line && bounds.bottom > line;
        });
        if (current >= 0 && !switching.current) setActive(current);
      });
    };
    root.addEventListener('scroll', update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(root);
    update();
    return () => { root.removeEventListener('scroll', update); resize.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  const goToSection = async (index: number) => {
    if (switching.current || closing.current) return;
    switching.current = true;
    setMenuOpen(false);
    try {
      const root = container.current;
      const chapter = root?.querySelector<HTMLElement>(`#story-${companySections[index].id}`);
      const photo = chapter?.querySelector<HTMLImageElement>('.company-image-card img');
      if (photo) {
        photo.loading = 'eager';
        await photo.decode().catch(() => {});
      }
      if (!mounted.current || closing.current) return;
      // Animate individual chapter frames so long copy does not distort the scroll height.
      if (!reduced) await controls.start({ opacity: 0, scale: 0.86, z: -160, rotateX: 5, transition: { duration: 0.3, ease: [0.4, 0, 0.6, 1] } });
      if (!mounted.current || closing.current) return;
      if (root && chapter) root.scrollTo({ top: chapter.offsetTop, behavior: 'instant' });
      setActive(index);
      chapter?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      if (!reduced) controls.set({ opacity: 0, scale: 0.9, z: -120, rotateX: -3 });
      await controls.start({ opacity: 1, scale: 1, z: 0, rotateX: 0, transition: { duration: reduced ? 0 : 0.55, ease: [0.16, 1, 0.3, 1] } });
    } finally { switching.current = false; }
  };

  const requestClose = async () => {
    if (closing.current) return;
    closing.current = true;
    setIsClosing(true);
    setMenuOpen(false);
    if (!reduced) {
      await closeControls.start({
        opacity: 0,
        scale: 0.97,
        y: 8,
        transition: { duration: 0.36, ease: [0.4, 0, 0.2, 1] },
      });
    }
    if (mounted.current) onClose();
  };

  return createPortal(
    <motion.dialog ref={dialog} animate={closeControls} initial={false} className={`company-story${isClosing ? ' company-story-closing' : ''}`} aria-label="About PineVela" onCancel={event => { event.preventDefault(); void requestClose(); }}>
      <div className="company-background" aria-hidden="true"><div className="company-background-logo"><PineLogo size={480} hideText /></div></div>
      <header className="company-story-header">
        <div className="company-wordmark"><PineLogo size={34} /><span> / Our story</span></div>
        <div className="company-story-actions">
          <div ref={menu} className="company-menu">
            <button className="company-menu-trigger" aria-expanded={menuOpen} aria-controls="company-section-menu" onClick={() => setMenuOpen(open => !open)}>{companySections[active].title} <ChevronDown size={16} aria-hidden="true" /></button>
            {menuOpen && <nav id="company-section-menu" className="company-menu-dropdown" aria-label="Company sections">
              {companySections.map((section, index) => <button key={section.id} aria-current={active === index ? 'location' : undefined} onClick={() => void goToSection(index)}><span>0{index + 1}</span>{section.title}</button>)}
            </nav>}
          </div>
          <button className="company-close" onClick={() => void requestClose()} aria-label="Close About PineVela"><X size={21} /></button>
        </div>
      </header>
      <div ref={container} className="company-story-scroll" data-fog-top={fogEdges.top} data-fog-bottom={fogEdges.bottom}>
        <div className="company-story-content">
          {companySections.map((section, index) => <StorySection key={section.id} section={section} index={index} container={container} controls={controls} />)}
          <footer className="company-story-footer"><span>PineVela</span><button onClick={() => void requestClose()}>Back to explore <ArrowUpRight size={16} aria-hidden="true" /></button></footer>
        </div>
      </div>
      <div className="company-scroll-fog" data-fog-top={fogEdges.top} data-fog-bottom={fogEdges.bottom} aria-hidden="true" />
      <div className="company-progress" aria-hidden="true">{companySections.map((section, index) => <span key={section.id} className={active === index ? 'is-active' : ''} />)}</div>
    </motion.dialog>, document.body,
  );
}
