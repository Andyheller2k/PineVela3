import { useLayoutEffect } from 'react';

// Observe individual pieces, including real catalog cards arriving asynchronously.
const targets = [
  '.landing-peak-copy > h1', '.landing-peak-copy > p', '.landing-peak-cta', '.landing-peak-shortcuts', '.landing-peak-artwork',
  '.landing-peak-brand', '[data-public-market] > div', '[data-public-residence] > div',
  '[data-public-market] > .grid > *', '[data-public-residence] > .grid > *',
  '.public-catalog-track > *', '.public-catalog-controls',
  '.landing-benefit', '.company-image-card', '.company-eyebrow', '.company-copy h2',
  '.company-chapter',
  '.company-paragraphs > p', '.company-contact-row',
  '#footer-section .grid > div', '#footer-section .pt-6',
].join(',');

export function useLandingReveal() {
  useLayoutEffect(() => {
    const page = document.querySelector<HTMLElement>('.landing-peak-page');
    if (!page || !('IntersectionObserver' in window)) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observed = new Set<Element>();
    page.setAttribute('data-landing-motion', 'ready');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add(entry.target.matches('.company-chapter') ? 'landing-divider-drawn' : 'landing-revealed');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
    const delayFor = (element: HTMLElement) => {
      if (element.matches('.landing-peak-copy > h1, .landing-peak-artwork')) return 0;
      if (element.matches('.landing-peak-copy > p')) return 60;
      if (element.matches('.landing-peak-cta, .landing-peak-brand')) return 110;
      if (element.matches('.landing-peak-shortcuts')) return 150;
      const group = element.closest('.company-copy, .public-catalog-track, .company-contact-links') || element.parentElement;
      const siblings = group ? [...group.querySelectorAll<HTMLElement>(targets)].filter(item => !item.classList.contains('grid') && !item.hasAttribute('data-public-catalog-rail')) : [];
      return Math.min(Math.max(0, siblings.indexOf(element)), 3) * 60;
    };
    const register = (root: ParentNode) => {
      const candidates = root instanceof HTMLElement && root.matches(targets) ? [root, ...root.querySelectorAll<HTMLElement>(targets)] : [...root.querySelectorAll<HTMLElement>(targets)];
      for (const element of candidates) {
        // Reveal cards separately rather than hiding their whole grid parent.
        if (element.classList.contains('grid') || element.hasAttribute('data-public-catalog-rail') || observed.has(element)) continue;
        observed.add(element);
        element.style.setProperty('--landing-reveal-delay', `${delayFor(element)}ms`);
        const divider = element.matches('.company-chapter');
        element.classList.add(divider ? 'landing-divider' : 'landing-reveal');
        if (preference.matches) element.classList.add(divider ? 'landing-divider-drawn' : 'landing-revealed');
        else observer.observe(element);
      }
    };
    const showAll = () => {
      if (preference.matches) {
        observer.disconnect();
        for (const element of observed) element.classList.add(element.matches('.company-chapter') ? 'landing-divider-drawn' : 'landing-revealed');
      }
    };
    // Keyboard focus must never land inside visually hidden content.
    const revealFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      for (let element: Element | null = event.target; element && element !== page; element = element.parentElement) {
        if (element.classList.contains('landing-reveal')) {
          (element as HTMLElement).style.setProperty('--landing-reveal-delay', '0ms');
          element.classList.add('landing-revealed', 'landing-focus-revealed');
          observer.unobserve(element);
        }
      }
    };
    register(page);
    const mutations = new MutationObserver(records => {
      // Catalog results arrive asynchronously. Inspect only the changed subtree;
      // do not rescan every story paragraph for each catalog/text update.
      for (const record of records) {
        for (const node of record.addedNodes) if (node instanceof HTMLElement) register(node);
        for (const node of record.removedNodes) if (node instanceof Element) {
          for (const element of observed) if (element === node || node.contains(element)) {
            observer.unobserve(element); observed.delete(element);
          }
        }
      }
    });
    mutations.observe(page, { childList: true, subtree: true });
    preference.addEventListener('change', showAll);
    page.addEventListener('focusin', revealFocus);
    return () => {
      observer.disconnect(); mutations.disconnect();
      preference.removeEventListener('change', showAll);
      page.removeEventListener('focusin', revealFocus);
      page.removeAttribute('data-landing-motion');
      for (const element of observed) {
        element.classList.remove('landing-reveal', 'landing-revealed', 'landing-focus-revealed', 'landing-divider', 'landing-divider-drawn');
        (element as HTMLElement).style.removeProperty('--landing-reveal-delay');
      }
    };
  }, []);
}
