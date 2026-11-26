// Vanilla3D site — navigation, scroll reveal and small shared behaviours.
// Loaded on every public page; the editor uses its own modules instead.
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('has-js');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Page-load reveal ──
  requestAnimationFrame(() => document.body.classList.add('is-loaded'));

  // ── Scroll reveal ──
  const revealItems = [...document.querySelectorAll('[data-reveal]')];
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach(el => el.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.style.setProperty('--reveal-delay', (Number(el.dataset.revealDelay) || 0) + 'ms');
        el.classList.add('is-visible');
        observer.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealItems.forEach(el => observer.observe(el));
  }

  // ── Header: mobile menu ──
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    const setOpen = (open) => {
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(!nav.classList.contains('open'));
    });
    nav.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('click', (event) => {
      if (!nav.classList.contains('open')) return;
      if (!event.target.closest('.site-header')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); toggle.focus(); }
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 840) setOpen(false); }, { passive: true });
  }

  // ── Toolbox: category + search filtering ──
  const grid = document.getElementById('tool-grid');
  const search = document.getElementById('tool-search');
  const chips = [...document.querySelectorAll('[data-tool-filter]')];
  const count = document.getElementById('tool-count');
  const empty = document.getElementById('tool-empty');
  if (grid && search && chips.length) {
    let filter = 'all';
    let query = '';
    const apply = () => {
      let shown = 0;
      [...grid.querySelectorAll('[data-tool]')].forEach(card => {
        const type = card.dataset.type || '';
        const text = (card.textContent || '').toLowerCase();
        const hit = (filter === 'all' || type === filter) && (!query || text.includes(query));
        card.hidden = !hit;
        if (hit) shown++;
      });
      if (count) count.textContent = shown + (shown === 1 ? ' item' : ' items');
      if (empty) empty.hidden = shown !== 0;
    };
    chips.forEach(chip => chip.addEventListener('click', () => {
      filter = chip.dataset.toolFilter;
      chips.forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
      apply();
    }));
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      apply();
    });
    apply();
  }

  // ── Language docs: search + scrollspy TOC ──
  const docsSearch = document.getElementById('docs-search');
  const docsNav = document.getElementById('docs-nav');
  const docsMain = document.getElementById('docs-main');
  if (docsSearch && docsNav && docsMain) {
    const links = () => [...docsNav.querySelectorAll('a')];
    docsSearch.addEventListener('input', () => {
      const q = docsSearch.value.trim().toLowerCase();
      let shown = 0;
      links().forEach(link => {
        const hit = !q || (link.textContent || '').toLowerCase().includes(q);
        link.hidden = !hit;
        if (hit) shown++;
      });
      const none = document.getElementById('docs-no-results');
      if (none) none.hidden = shown !== 0;
    });

    if ('IntersectionObserver' in window && !reduceMotion) {
      const headings = [...document.querySelectorAll('#docs-article h3')];
      const byId = new Map(links().map(link => [link.getAttribute('href').slice(1), link]));
      let current = null;
      const setActive = (id) => {
        if (id === current) return;
        current = id;
        links().forEach(link => link.classList.toggle('active', link.getAttribute('href') === '#' + id));
      };
      const spy = new IntersectionObserver((entries) => {
        const visible = entries.filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      }, { root: docsMain, rootMargin: '0px 0px -70% 0px', threshold: 0 });
      headings.forEach(heading => { if (byId.has(heading.id)) spy.observe(heading); });
    }
  }

  // ── Footer year ──
  const year = document.getElementById('footer-year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
