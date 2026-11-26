// Vanilla3D — one-time 4.0 launch popup.
// Shown once per browser on every entry page (including the editor), independent of the
// version that browser last opened. After it is dismissed the engine's normal version
// history takes over again. ?release=1 forces it open for testing; ?play=1 never shows it.
(() => {
  'use strict';

  const KEY = 'vanilla3d-release-4.0.0.0-seen';
  const ENGINE_SEEN_KEY = 'vanilla-engine-last-seen-version';
  const RELEASE_VERSION = '4.0.0.0';
  const params = new URLSearchParams(location.search);
  const force = params.get('release') === '1';
  const playMode = params.get('play') === '1';

  if (playMode) {
    window.VanillaRelease = { pending: false, open() {}, close() {} };
    return;
  }

  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (e) {}
  const pending = !seen || force;

  // The site is served from either the root or a project subpath, and from page folders.
  const dir = location.pathname.replace(/[^/]*$/, '');
  const nested = /(?:^|\/)(engine|language|toolbox|player)\/$/.test(dir);
  const root = nested ? '../' : '';
  const onEditor = /(?:^|\/)engine(?:\/index\.html)?\/?$/.test(location.pathname);
  const icon = (id) => `<svg class="ic" aria-hidden="true"><use href="${root}assets/icons.svg#${id}"/></svg>`;

  const features = [
    {
      icon: 'i-users',
      title: 'Build together, live',
      copy: 'Host a room, send the world, and co-edit with up to four guests. The Player lobby runs the same room as a game.',
      tags: ['Rooms', 'Co-edit', 'Lobby']
    },
    {
      icon: 'i-sun',
      title: 'Fifteen materials. Real light.',
      copy: 'Plastic to marble, with patterns and highlights. Point and spot lights cast shadows; bloom and sun rays finish the scene.',
      tags: ['Materials', 'Lights', 'Shadows']
    },
    {
      icon: 'i-sparkles',
      title: 'Particles and spatial audio',
      copy: 'Eight effect presets and a full advanced emitter. Web Audio gives every sound position, pitch and real falloff.',
      tags: ['Effects', 'Audio', '3D sound']
    },
    {
      icon: 'i-human',
      title: 'A player, not a camera',
      copy: 'Walk, sprint, jump and land with procedural animation, health, stamina and a player stats HUD.',
      tags: ['Animation', 'Stats', 'HUD']
    },
    {
      icon: 'i-download-cloud',
      title: 'Share it, then play it',
      copy: 'Open a .vnw, trust it, and run fullscreen. Old worlds migrate without losing anything.',
      tags: ['Import', 'Trust', 'Migration']
    },
    {
      icon: 'i-layers',
      title: 'Sharper. Faster. Yours.',
      copy: 'One design system, 24px icons, searchable docs, six graphics presets, offline mode and a 2D fallback.',
      tags: ['Design', 'Docs', 'Performance']
    }
  ];

  const cards = features.map((feature, index) => `
    <article class="release-card" style="--i:${index}">
      <span class="release-card-icon">${icon(feature.icon)}</span>
      <h4>${feature.title}</h4>
      <p>${feature.copy}</p>
      <div class="release-tags">${feature.tags.map(tag => `<span>${tag}</span>`).join('')}</div>
    </article>`).join('');

  const art = `
    <svg viewBox="0 0 560 370" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="relGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#f2b134" stop-opacity=".3"/>
          <stop offset=".55" stop-color="#f2b134" stop-opacity=".08"/>
          <stop offset="1" stop-color="#f2b134" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="relPlateTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#444e63"/>
          <stop offset="1" stop-color="#2c3444"/>
        </linearGradient>
        <linearGradient id="relPlateLeft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#252c39"/>
          <stop offset="1" stop-color="#171c25"/>
        </linearGradient>
        <linearGradient id="relPlateRight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#323b4c"/>
          <stop offset="1" stop-color="#202634"/>
        </linearGradient>
        <linearGradient id="relGoldTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffd982"/>
          <stop offset="1" stop-color="#e7a52c"/>
        </linearGradient>
        <linearGradient id="relGoldLeft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d69522"/>
          <stop offset="1" stop-color="#9a6412"/>
        </linearGradient>
        <linearGradient id="relGoldRight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#b67b18"/>
          <stop offset="1" stop-color="#7e500e"/>
        </linearGradient>
        <linearGradient id="relBlueTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9bd2ff"/>
          <stop offset="1" stop-color="#4e9be8"/>
        </linearGradient>
        <linearGradient id="relBlueLeft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3b82c9"/>
          <stop offset="1" stop-color="#245b97"/>
        </linearGradient>
        <linearGradient id="relBlueRight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2f70b2"/>
          <stop offset="1" stop-color="#1d4d80"/>
        </linearGradient>
        <linearGradient id="relGreenTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9aefc2"/>
          <stop offset="1" stop-color="#43c282"/>
        </linearGradient>
        <linearGradient id="relGreenLeft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#34a76d"/>
          <stop offset="1" stop-color="#207b4d"/>
        </linearGradient>
        <linearGradient id="relGreenRight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a9460"/>
          <stop offset="1" stop-color="#19643d"/>
        </linearGradient>
        <linearGradient id="relScan" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#f2b134" stop-opacity="0"/>
          <stop offset=".5" stop-color="#f2b134" stop-opacity=".65"/>
          <stop offset="1" stop-color="#f2b134" stop-opacity="0"/>
        </linearGradient>
        <radialGradient id="relSun" cx="42%" cy="38%" r="60%">
          <stop offset="0" stop-color="#fff2c8"/>
          <stop offset=".55" stop-color="#ffd777"/>
          <stop offset="1" stop-color="#f2b134"/>
        </radialGradient>
      </defs>

      <circle class="rel-glow" cx="330" cy="210" r="190" fill="url(#relGlow)"/>
      <g fill="#fff">
        <circle class="rel-star" cx="88" cy="82" r="1.5" opacity=".55"/>
        <circle class="rel-star" cx="138" cy="124" r="1" opacity=".4"/>
        <circle class="rel-star" cx="202" cy="58" r="1.2" opacity=".7"/>
        <circle class="rel-star" cx="288" cy="102" r="1" opacity=".45"/>
        <circle class="rel-star" cx="478" cy="132" r="1.2" opacity=".5"/>
        <circle class="rel-star" cx="512" cy="72" r="1" opacity=".4"/>
        <circle class="rel-star" cx="64" cy="174" r="1" opacity=".35"/>
        <circle class="rel-star" cx="526" cy="232" r="1.4" opacity=".4"/>
      </g>

      <g opacity=".9">
        <circle cx="438" cy="86" r="66" fill="#f2b134" opacity=".07"/>
        <circle cx="438" cy="86" r="31" fill="url(#relSun)"/>
        <circle cx="438" cy="86" r="43" fill="none" stroke="#f2b134" stroke-opacity=".22" stroke-width="1"/>
      </g>

      <text class="rel-40" x="296" y="248" text-anchor="middle" fill="none" stroke="#f2b134" stroke-opacity=".17" stroke-width="1.4"
        font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="205" font-weight="900" letter-spacing="-16">4.0</text>

      <g class="rel-orbit" fill="none" stroke="#f2b134" stroke-opacity=".3">
        <ellipse cx="290" cy="246" rx="218" ry="84" stroke-width="1" stroke-dasharray="4 9" transform="rotate(-14 290 246)"/>
        <circle cx="508" cy="238" r="3.5" fill="#f2b134" stroke="none"/>
        <circle cx="508" cy="238" r="9" fill="#f2b134" fill-opacity=".14" stroke="none"/>
      </g>

      <g opacity=".97">
        <path d="M92 300 L278 230 L464 300 L278 370 Z" fill="url(#relPlateTop)"/>
        <path d="M92 300 L278 370 V402 L92 332 Z" fill="url(#relPlateLeft)"/>
        <path d="M464 300 L278 370 V402 L464 332 Z" fill="url(#relPlateRight)"/>
        <g stroke="#fff" stroke-opacity=".08" stroke-width="1">
          <path d="M129 287 L315 217M166 274 L352 204M203 261 L389 191M240 248 L426 178"/>
          <path d="M129 313 L315 383M166 326 L352 396M203 339 L389 409"/>
        </g>
        <path d="M92 300 L278 230 L464 300 L278 370 Z" fill="none" stroke="#f2b134" stroke-opacity=".22" stroke-width="1"/>
      </g>

      <g>
        <path d="M245 216 L291 239 L245 262 L199 239 Z" fill="url(#relGoldTop)"/>
        <path d="M199 239 L245 262 V308 L199 285 Z" fill="url(#relGoldLeft)"/>
        <path d="M291 239 L245 262 V308 L291 285 Z" fill="url(#relGoldRight)"/>
        <path d="M245 216 L291 239 L245 262 L199 239 Z" fill="none" stroke="#ffe6ae" stroke-opacity=".7" stroke-width="1.2"/>
        <path d="M245 262 V308" stroke="#ffe6ae" stroke-opacity=".18" stroke-width="1"/>
      </g>
      <g>
        <path d="M330 266 L358 280 L330 294 L302 280 Z" fill="url(#relBlueTop)"/>
        <path d="M302 280 L330 294 V316 L302 302 Z" fill="url(#relBlueLeft)"/>
        <path d="M358 280 L330 294 V316 L358 302 Z" fill="url(#relBlueRight)"/>
        <path d="M330 266 L358 280 L330 294 L302 280 Z" fill="none" stroke="#c9e8ff" stroke-opacity=".55" stroke-width="1"/>
      </g>
      <g>
        <path d="M190 272 L210 282 L190 292 L170 282 Z" fill="url(#relGreenTop)"/>
        <path d="M170 282 L190 292 V310 L170 300 Z" fill="url(#relGreenLeft)"/>
        <path d="M210 282 L190 292 V310 L210 300 Z" fill="url(#relGreenRight)"/>
        <path d="M190 272 L210 282 L190 292 L170 282 Z" fill="none" stroke="#c7ffdf" stroke-opacity=".5" stroke-width="1"/>
      </g>

      <g class="rel-float-a" fill="none" stroke="#f2b134" stroke-opacity=".75" stroke-width="1.3" stroke-dasharray="3 3">
        <path d="M392 124 L428 142 L392 160 L356 142 Z"/>
        <path d="M356 142 V182 L392 200 V160"/>
        <path d="M428 142 V182 L392 200"/>
        <path d="M392 160 V200"/>
      </g>
      <g class="rel-float-b">
        <path d="M170 146 L192 157 L170 168 L148 157 Z" fill="url(#relBlueTop)"/>
        <path d="M148 157 L170 168 V190 L148 179 Z" fill="url(#relBlueLeft)"/>
        <path d="M192 157 L170 168 V190 L192 179 Z" fill="url(#relBlueRight)"/>
      </g>
      <g class="rel-float-c">
        <circle cx="382" cy="296" r="9" fill="url(#relSun)"/>
        <circle cx="382" cy="296" r="16" fill="none" stroke="#f2b134" stroke-opacity=".28" stroke-width="1"/>
      </g>

      <rect class="rel-scan" x="58" y="142" width="444" height="1.6" fill="url(#relScan)"/>
    </svg>`;

  const primary = onEditor
    ? `<button type="button" class="release-btn primary" data-release-close>Start building ${icon('i-arrow-right')}</button>`
    : `<a class="release-btn primary" href="${root}engine/">Open the editor ${icon('i-arrow-up-right')}</a>`;

  const markup = `
    <div class="release-popup" id="release-popup" hidden aria-hidden="true">
      <div class="release-backdrop" data-release-close></div>
      <div class="release-dialog" role="dialog" aria-modal="true" aria-labelledby="release-title" aria-describedby="release-lede" tabindex="-1">
        <header class="release-hero">
          <div class="release-topbar">
            <span class="release-brand">
              <svg aria-hidden="true"><use href="${root}assets/icons.svg#i-vanilla-mark"/></svg>
              <b>Vanilla3D</b>
              <span>4.0.0.0 Golden</span>
            </span>
            <button class="release-close" type="button" data-release-close aria-label="Close release notes">${icon('i-close')}</button>
          </div>
          <div class="release-copy">
            <span class="eyebrow">4.0.0.0 Golden · November 26, 2026</span>
            <h2 class="release-title" id="release-title">A whole new <em>world.</em></h2>
            <p class="release-lede" id="release-lede">The biggest Vanilla3D release yet. Build together, light it up, and bring it to life — right in the tab.</p>
            <div class="release-meta">
              <span>13 releases</span><i></i><span>Still zero installs</span><i></i><span>One design system</span>
            </div>
          </div>
          <div class="release-art">${art}</div>
        </header>
        <div class="release-body">
          <div class="release-head">
            <div>
              <h3>Everything that's new</h3>
              <p>Six pillars, plus the details that make 4.0 feel new.</p>
            </div>
            <span class="release-count"><i></i> Golden</span>
          </div>
          <div class="release-grid">${cards}</div>
          <div class="release-more">
            <b>Also in 4.0</b>
            <span>Touch events</span><span>Player colours</span><span>Chat</span><span>UI progress bars</span>
            <span>Union collision</span><span>Undo history</span><span>Shortcuts</span><span>Offline ZIP</span>
            <span>Six Toolbox items</span><span>World versioning</span>
          </div>
          <div class="release-foot">
            <span class="release-foot-note">One-time release note. It won't interrupt you again.</span>
            <a class="release-btn ghost" href="${root}player/">Play a world</a>
            ${primary}
          </div>
        </div>
      </div>
    </div>`;

  if (document.getElementById('release-popup')) return;
  const holder = document.createElement('div');
  holder.innerHTML = markup.trim();
  const overlay = holder.firstElementChild;
  document.body.appendChild(overlay);

  const dialog = overlay.querySelector('.release-dialog');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let isOpen = false;
  let closeTimer = 0;
  let lastFocus = null;
  let previousPadding = '';

  const focusable = () => [...dialog.querySelectorAll('a[href], button:not([disabled])')].filter(el => el.offsetParent !== null);

  function persist() {
    try {
      localStorage.setItem(KEY, '1');
      // The popup already covered every 4.0 change, so the editor's version list should not repeat it.
      localStorage.setItem(ENGINE_SEEN_KEY, RELEASE_VERSION);
    } catch (e) {}
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    // "Once" means once it has been shown, not only once it has been dismissed.
    persist();
    window.clearTimeout(closeTimer);
    lastFocus = document.activeElement;
    overlay.hidden = false;
    overlay.classList.remove('is-closing');
    overlay.setAttribute('aria-hidden', 'false');
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    previousPadding = document.body.style.paddingRight;
    if (scrollbar > 0) document.body.style.paddingRight = scrollbar + 'px';
    document.documentElement.classList.add('release-lock');
    window.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      const close = overlay.querySelector('.release-close');
      (close || dialog).focus({ preventScroll: true });
    });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    persist();
    overlay.classList.remove('is-open');
    overlay.classList.add('is-closing');
    document.documentElement.classList.remove('release-lock');
    document.body.style.paddingRight = previousPadding;
    window.removeEventListener('keydown', onKey, true);
    const finish = () => {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('is-closing');
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
    };
    if (reduceMotion) finish();
    else closeTimer = window.setTimeout(finish, 200);
  }

  function onKey(event) {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') {
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    // Keep editor shortcuts from firing behind the dialog.
    event.stopPropagation();
  }

  overlay.addEventListener('click', (event) => {
    if (event.target.closest('[data-release-close]')) {
      event.preventDefault();
      close();
    }
  });
  overlay.querySelectorAll('a[href]').forEach(link => link.addEventListener('click', close));

  window.VanillaRelease = { pending, open, close, key: KEY };

  if (pending) {
    const show = () => window.setTimeout(open, reduceMotion ? 0 : 420);
    if (window.VanillaLoader && window.VanillaLoader.active) {
      window.addEventListener('vanilla-loader-done', show, { once: true });
    } else if (document.readyState === 'complete') {
      show();
    } else {
      window.addEventListener('load', show, { once: true });
    }
  }
})();
