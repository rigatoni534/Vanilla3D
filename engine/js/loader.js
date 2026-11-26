// Vanilla Engine — Golden boot loader.
// Renders before the deferred engine scripts execute, tracks the real script
// elements as they settle, then wipes into the editor.
(() => {
  'use strict';

  const root = document.getElementById('boot-loader');
  if (!root) return;

  // Play mode opens straight into the world; the editor boot splash would only
  // get in the way and would describe the wrong destination.
  if (new URLSearchParams(location.search).get('play') === '1') {
    root.hidden = true;
    window.VanillaLoader = {
      active: false,
      done: true,
      ready() {},
      progress: 100
    };
    return;
  }

  const byId = (id) => document.getElementById(id);
  const statusEl = byId('boot-status');
  const percentEl = byId('boot-percent');
  const fillEl = byId('boot-fill');
  const progressEl = byId('boot-progress');
  const countEl = byId('boot-count');
  const currentEl = byId('boot-current');
  const artEl = root.querySelector('.boot-art');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const allScripts = Array.from(document.querySelectorAll('script[src]'));
  const self = document.currentScript;
  const selfIndex = allScripts.indexOf(self);
  const scripts = allScripts
    .map((script, index) => {
      const raw = script.getAttribute('src') || '';
      let url;
      try { url = new URL(raw, document.baseURI); } catch (e) { return null; }
      return {
        script,
        index,
        href: url.href,
        origin: url.origin,
        name: decodeURIComponent(url.pathname.split('/').pop() || 'script.js'),
        settled: false,
        state: 'queued'
      };
    })
    .filter(entry => entry && entry.script !== self && entry.origin === location.origin);

  const total = scripts.length;
  let uiSettled = 0;
  let uiErrors = 0;
  let errors = 0;
  let displayProgress = 0;
  let ready = false;
  let readyRequested = false;
  let readyApplied = false;
  const uiQueue = [];
  let queueTimer = 0;
  let revealing = false;
  let exited = false;
  let revealTimer = 0;

  const started = performance.now();
  const MIN_SHOW = reduceMotion ? 260 : 1350;
  const HOLD = reduceMotion ? 80 : 850;

  // Lock the app behind the loader without losing focus order.
  const appRoots = ['toolbar', 'workspace', 'statusbar']
    .map(byId)
    .filter(Boolean);
  const appState = appRoots.map(el => ({
    el,
    inert: el.inert,
    aria: el.getAttribute('aria-hidden')
  }));
  appRoots.forEach(el => {
    try { el.inert = true; } catch (e) {}
    el.setAttribute('aria-hidden', 'true');
  });

  window.VanillaLoader = {
    active: true,
    done: false,
    ready: markReady,
    get progress() { return Math.round(displayProgress); }
  };

  scripts.forEach(entry => {
    if (selfIndex >= 0 && entry.index < selfIndex) {
      settle(entry, 'loaded');
      return;
    }
    entry.script.addEventListener('load', () => settle(entry, 'loaded'), { once: true });
    entry.script.addEventListener('error', () => settle(entry, 'error'), { once: true });
  });
  paintSummary();
  updateProgress();

  function settle(entry, state) {
    if (entry.settled) return;
    entry.settled = true;
    entry.state = state;
    if (state === 'error') errors++;
    uiQueue.push({ entry, state });
    pumpQueue();
  }

  function pumpQueue() {
    if (queueTimer || exited) return;
    const step = () => {
      queueTimer = 0;
      const item = uiQueue.shift();
      if (!item) {
        if (readyRequested) applyReady();
        return;
      }
      const { entry, state } = item;
      uiSettled++;
      if (state === 'error') uiErrors++;
      currentEl.textContent = state === 'loaded'
        ? entry.name
        : entry.name + ' failed';
      paintSummary();
      updateProgress();
      queueTimer = window.setTimeout(step, reduceMotion ? 0 : 30);
    };
    queueTimer = window.setTimeout(step, reduceMotion ? 0 : 30);
  }

  function paintSummary() {
    countEl.textContent = uiSettled + ' / ' + total + ' scripts';
    if (readyApplied) return;
    const ratio = total ? uiSettled / total : 1;
    let text;
    if (!total) text = 'No scripts to load. Opening the editor…';
    else if (uiErrors) text = 'Some assets were blocked; checking the fallback…';
    else if (!uiSettled) text = 'Starting the Golden runtime…';
    else if (ratio < .35) text = 'Loading editor scripts…';
    else if (ratio < .8) text = 'Wiring the editor…';
    else text = 'Finishing the runtime…';
    if (statusEl.textContent !== text) statusEl.textContent = text;
  }

  function updateProgress() {
    const target = readyApplied ? 100 : (total ? Math.min(92, (uiSettled / total) * 92) : 0);
    displayProgress = Math.round(target);
    fillEl.style.width = displayProgress + '%';
    percentEl.textContent = displayProgress + '%';
    progressEl.setAttribute('aria-valuenow', String(displayProgress));
  }

  function markReady() {
    if (readyRequested || exited) return;
    readyRequested = true;
    scripts.forEach(entry => {
      if (!entry.settled) settle(entry, 'loaded');
    });
    if (!uiQueue.length) applyReady();
  }

  function applyReady() {
    if (readyApplied || exited) return;
    readyApplied = true;
    ready = true;
    displayProgress = 100;
    fillEl.style.width = '100%';
    percentEl.textContent = '100%';
    progressEl.setAttribute('aria-valuenow', '100');
    statusEl.textContent = uiErrors ? 'Ready with warnings. Opening the editor…' : 'Ready. Opening the editor…';
    currentEl.textContent = uiErrors ? 'All available scripts ready' : 'All scripts ready';
    root.classList.add('is-ready');
    scheduleReveal();
  }

  function scheduleReveal() {
    const elapsed = performance.now() - started;
    const wait = Math.max(0, MIN_SHOW - elapsed) + HOLD;
    window.clearTimeout(revealTimer);
    revealTimer = window.setTimeout(reveal, reduceMotion ? Math.min(wait, 120) : wait);
  }

  function reveal() {
    if (exited || revealing) return;
    revealing = true;
    window.clearTimeout(revealTimer);
    root.classList.remove('is-ready');
    root.classList.add('is-leaving');
    document.body.classList.add('boot-entering');
    window.setTimeout(finish, reduceMotion ? 0 : 880);
  }

  function finish() {
    if (exited) return;
    exited = true;
    window.clearTimeout(queueTimer);
    window.removeEventListener('keydown', onKey, true);
    root.hidden = true;
    root.classList.remove('is-leaving', 'is-ready');
    document.body.classList.remove('boot-entering');
    appState.forEach(({ el, inert, aria }) => {
      try { el.inert = inert; } catch (e) {}
      if (aria === null) el.removeAttribute('aria-hidden');
      else el.setAttribute('aria-hidden', aria);
    });
    if (window.VanillaLoader) {
      window.VanillaLoader.active = false;
      window.VanillaLoader.done = true;
    }
    window.dispatchEvent(new CustomEvent('vanilla-loader-done', { detail: { errors } }));
    const canvas = document.getElementById('screen');
    if (canvas) {
      canvas.tabIndex = -1;
      try { canvas.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  function onKey(event) {
    if (exited) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopImmediatePropagation();
      try { root.focus({ preventScroll: true }); } catch (e) {}
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // The editor's shortcuts are attached to window. Keep them from firing
    // behind the splash.
    event.stopImmediatePropagation();
  }

  document.addEventListener('keydown', onKey, true);
  try { root.focus({ preventScroll: true }); } catch (e) {}

  if (artEl && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    let frame = 0;
    let nx = 0;
    let ny = 0;
    const reset = () => {
      artEl.style.setProperty('--rx', '0deg');
      artEl.style.setProperty('--ry', '0deg');
    };
    root.addEventListener('pointermove', (event) => {
      nx = event.clientX / Math.max(1, window.innerWidth) - .5;
      ny = event.clientY / Math.max(1, window.innerHeight) - .5;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        artEl.style.setProperty('--ry', (nx * 8).toFixed(2) + 'deg');
        artEl.style.setProperty('--rx', (-ny * 6).toFixed(2) + 'deg');
      });
    });
    root.addEventListener('pointerleave', reset);
  }

  // If the editor never calls ready (a blocked script, an early exception),
  // open it anyway rather than trapping the user on the splash forever.
  window.addEventListener('load', () => {
    window.setTimeout(() => {
      if (ready || exited) return;
      scripts.forEach(entry => {
        if (!entry.settled) settle(entry, 'error');
      });
      statusEl.textContent = 'Some scripts did not finish. Opening the editor…';
      markReady();
    }, reduceMotion ? 300 : 1800);
  }, { once: true });
  window.setTimeout(() => {
    if (ready || exited) return;
    scripts.forEach(entry => {
      if (!entry.settled) settle(entry, 'error');
    });
    statusEl.textContent = 'The loader timed out. Opening the editor…';
    markReady();
  }, 20000);
})();
