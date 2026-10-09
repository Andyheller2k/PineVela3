import { useLayoutEffect } from 'react';

// Observe individual pieces, including real catalog cards arriving asynchronously.
const targets = [
  '.landing-peak-copy > h1', '.landing-peak-copy > p', '.landing-peak-copy > .flex',
  '.landing-peak-brand', '[data-public-market] > div', '[data-public-residence] > div',
  '[data-public-market] > .grid > *', '[data-public-residence] > .grid > *',
  '.public-catalog-track > *', '.public-catalog-controls',
  '.landing-benefit', '.company-image-card', '.company-eyebrow', '.company-copy h2',
  '.company-paragraphs > p', '.company-contact-row',
  '#footer-section .grid > div', '#footer-section .pt-6',
].join(',');

export function useLandingReveal() {
  useLayoutEffect(() => {
    const page = document.querySelector<HTMLElement>('.landing-peak-page');
    if (!page || !('IntersectionObserver' in window)) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observed = new Set<Element>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('landing-revealed');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
    const register = () => {
      for (const element of page.querySelectorAll<HTMLElement>(targets)) {
        // Reveal cards separately rather than hiding their whole grid parent.
        if (element.classList.contains('grid') || element.hasAttribute('data-public-catalog-rail') || observed.has(element)) continue;
        observed.add(element);
        element.classList.add('landing-reveal');
        if (preference.matches) element.classList.add('landing-revealed');
        else observer.observe(element);
      }
    };
    const showAll = () => {
      if (preference.matches) {
        observer.disconnect();
        for (const element of observed) element.classList.add('landing-revealed');
      }
    };
    // Keyboard focus must never land inside visually hidden content.
    const revealFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      for (let element: Element | null = event.target; element && element !== page; element = element.parentElement) {
        if (element.classList.contains('landing-reveal')) {
          element.classList.add('landing-revealed');
          observer.unobserve(element);
        }
      }
    };
    register();
    const mutations = new MutationObserver(register);
    mutations.observe(page, { childList: true, subtree: true });
    preference.addEventListener('change', showAll);
    page.addEventListener('focusin', revealFocus);
    return () => {
      observer.disconnect(); mutations.disconnect();
      preference.removeEventListener('change', showAll);
      page.removeEventListener('focusin', revealFocus);
      for (const element of observed) element.classList.remove('landing-reveal', 'landing-revealed');
    };
  }, []);
}
