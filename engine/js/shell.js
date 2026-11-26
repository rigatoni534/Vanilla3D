// Vanilla Engine — canvas, settings, docs and status bar. Loaded in order by index.html; all files share one global scope.
        // ───────── Canvas & UI elements ─────────
        const canvas = document.getElementById('screen');
        const ctx = canvas.getContext('2d');
        const skyCanvas = document.getElementById('sky-canvas');
        const skyCtx = skyCanvas.getContext('2d');
        const glCanvas = document.getElementById('gl-canvas');
        const vfCanvas = document.getElementById('viewfinder-canvas');
        const vfCtx = vfCanvas.getContext('2d');

        const statFps = document.getElementById('stat-fps');
        const statCpu = document.getElementById('stat-cpu');
        const statMem = document.getElementById('stat-mem');
        const statVerts = document.getElementById('stat-verts');
        const statFaces = document.getElementById('stat-faces');
        const statObjects = document.getElementById('stat-objects');
        const statUI = document.getElementById('stat-ui');
        const statScripts = document.getElementById('stat-scripts');
        const statDraws = document.getElementById('stat-draws');
        const statSim = document.getElementById('stat-sim');

        // Camera control settings (saved in this browser)
        let FOV = 450;
        const defaultSettings = () => ({
            leftDrag: true, rightClick: false, gizmoOffset: 0.5, rotOffset: 45, camSpeed: 0.1, axisLength: 8,
            lookSens: 1, invertY: false, fov: 75, lighting: 'enhanced', shadows: 'medium', haze: true, renderDistance: 0,
            // Graphics preset and the values it writes. See GRAPHICS_PRESETS.
            quality: 'standard', texDetail: 2, msaa: 2, renderScale: 1, dprCap: 1.5, bloom: 0.3, rays: 0.38, bloomDiv: 4,
            showAxes: true, showViewfinder: true, hintMode: 'auto', showStatus: true, alwaysShowUI: false, uiGrid: 1,
            seFont: 13, autosave: 3, saveWhat: {}, accent: 'vanilla', light: false, showUid: false, syntax: true,
            defaultNames: {}, preinclude: {}
        });
        // A graphics preset is a bundle of rendering settings. Choosing one writes each value into settings, so the
        // renderer reads plain numbers and one setting can still be changed without losing the others (that turns the
        // preset into Custom). texDetail is the texture quality level the shaders understand: 0 is the coarsest grid
        // and 4 adds the finest lines and surface grain. bloom and rays are strengths, 0 turns them off.
        const GRAPHICS_PRESETS = {
            low:       { name: 'Low',        shadows: 'off',    texDetail: 0, msaa: 0, renderScale: 0.7,  dprCap: 1,   bloom: 0,    rays: 0,    bloomDiv: 4 },
            medium:    { name: 'Medium',     shadows: 'low',    texDetail: 1, msaa: 0, renderScale: 0.85, dprCap: 1,   bloom: 0,    rays: 0,    bloomDiv: 4 },
            standard:  { name: 'Standard',   shadows: 'medium', texDetail: 2, msaa: 2, renderScale: 1,    dprCap: 1.5, bloom: 0.3,  rays: 0.38, bloomDiv: 4 },
            high:      { name: 'High',       shadows: 'high',   texDetail: 3, msaa: 4, renderScale: 1,    dprCap: 2,   bloom: 0.4,  rays: 0.48, bloomDiv: 2 },
            extra:     { name: 'Extra High', shadows: 'high',   texDetail: 4, msaa: 4, renderScale: 1.25, dprCap: 2,   bloom: 0.48, rays: 0.55, bloomDiv: 2 },
            unlimited: { name: 'Unlimited',  shadows: 'high',   texDetail: 4, msaa: 8, renderScale: 1.5,  dprCap: 2,   bloom: 0.56, rays: 0.62, bloomDiv: 1 }
        };
        const GRAPHICS_KEYS = ['shadows', 'texDetail', 'msaa', 'renderScale', 'dprCap', 'bloom', 'rays', 'bloomDiv'];
        function applyGraphicsPreset(id) {
            const p = GRAPHICS_PRESETS[id];
            if (!p) return false;
            for (const k of GRAPHICS_KEYS) settings[k] = p[k];
            settings.quality = id;
            return true;
        }
        const settings = defaultSettings();
        let autosaveTimer = null, autosaveMins = -1, autosaveBase = '';
        let autosaveSuppressed = false, autosaveFailureNotified = false;
        // Accent colors: each preset has a dark-theme and a light-theme shade.
        const ACCENT_PRESETS = [
            { id: 'vanilla', name: 'Vanilla yellow', dark: '#f2b134', light: '#b86f00' },
            { id: 'coral', name: 'Coral', dark: '#ff7a59', light: '#c8431f' },
            { id: 'rose', name: 'Rose', dark: '#f472b6', light: '#be2a75' },
            { id: 'violet', name: 'Violet', dark: '#a78bfa', light: '#6d3fd1' },
            { id: 'blue', name: 'Blue', dark: '#5aa2ff', light: '#1f62c9' },
            { id: 'teal', name: 'Teal', dark: '#2dd4bf', light: '#0b7f73' },
            { id: 'green', name: 'Green', dark: '#4ade80', light: '#1c8c4a' },
            { id: 'graphite', name: 'Graphite', dark: '#b6bdcc', light: '#4a5368' }
        ];
        const hexOk = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
        const hexToRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
        const rgbToHex = (a) => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
        const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
        const lumOf = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        function accentVars(rgb, light) {
            const hover = mixRgb(rgb, light ? [0, 0, 0] : [255, 255, 255], light ? 0.12 : 0.18);
            const ink = lumOf(rgb) > (light ? 0.3 : 0.35) ? rgbToHex(mixRgb(rgb, [0, 0, 0], 0.85)) : '#ffffff';
            return '--accent:' + rgbToHex(rgb) + ';--accent-hover:' + rgbToHex(hover) + ';--accent-ink:' + ink + ';--accent-soft:rgba(' + rgb.map(Math.round).join(',') + ',' + (light ? 0.12 : 0.15) + ');';
        }
        // The favicon is the Vanilla3D mark, drawn here so it uses the current accent and panel colours.
        function updateFavicon() {
            const cs = getComputedStyle(document.body);
            const accent = (cs.getPropertyValue('--accent') || '#f2b134').trim();
            const panel = (cs.getPropertyValue('--panel') || '#1d212a').trim();
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill="' + panel + '"/><path d="M11 13h8l13 29 13-29h8L39 51H25z" fill="' + accent + '"/><rect x="11" y="55" width="42" height="4" rx="2" fill="' + accent + '"/></svg>';
            let link = document.getElementById('favicon');
            if (!link) {
                link = document.createElement('link');
                link.id = 'favicon'; link.rel = 'icon'; link.type = 'image/svg+xml';
                document.head.appendChild(link);
            }
            link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
        }
        function applyAccent() {
            let el = document.getElementById('accent-style');
            const preset = ACCENT_PRESETS.find(p => p.id === settings.accent);
            if (!preset && !hexOk(settings.accent)) settings.accent = 'vanilla';
            if (settings.accent === 'vanilla') { if (el) el.remove(); updateFavicon(); return; }
            let dark, light;
            if (preset) { dark = hexToRgb(preset.dark); light = hexToRgb(preset.light); }
            else { dark = hexToRgb(settings.accent); light = lumOf(dark) > 0.25 ? mixRgb(dark, [0, 0, 0], 0.3) : dark; }
            if (!el) { el = document.createElement('style'); el.id = 'accent-style'; document.head.appendChild(el); }
            el.textContent = ':root{' + accentVars(dark, false) + '}body.light-theme{' + accentVars(light, true) + '}';
            updateFavicon();
        }
        try {
            const rawSettings = localStorage.getItem('vanilla-editor-settings');
            const savedSettings = rawSettings ? JSON.parse(rawSettings) : null;
            if (savedSettings && typeof savedSettings === 'object') {
                // A file saved before graphics presets has no quality. It becomes Custom, so the shadows it already has
                // stay exactly as they were instead of being reset by a preset.
                if (!('quality' in savedSettings)) savedSettings.quality = 'custom';
                Object.assign(settings, savedSettings);
            }
        } catch (e) {}
        const AXIS_MIN = 0.1, AXIS_MAX = 100;
        const clampAxis = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(AXIS_MAX, Math.max(AXIS_MIN, Math.round(n * 1000) / 1000)) : 8; };
        // Origin marker geometry: half-length, tick spacing (about ten ticks per side) and tick size.
        function axisGeom() {
            const lim = clampAxis(settings.axisLength), x = lim / 10, e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e;
            const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
            return { lim, step, n: Math.round(lim / step), tk: step * 0.2 };
        }
        function applySettings() {
            const pick = (v, list, d) => list.includes(+v) ? +v : d;
            settings.lookSens = pick(settings.lookSens, [0.5, 0.75, 1, 1.5, 2], 1);
            settings.seFont = pick(settings.seFont, [12, 13, 15, 17], 13);
            settings.autosave = pick(settings.autosave, [0, 1, 2, 3, 5, 10], 3);
            settings.uiGrid = pick(settings.uiGrid, [0.5, 1, 2, 5], 1);
            settings.fov = Math.round(Math.min(110, Math.max(40, Number.isFinite(parseFloat(settings.fov)) ? parseFloat(settings.fov) : 75)));
            if (!['auto', 'always', 'never'].includes(settings.hintMode)) settings.hintMode = 'auto';
            if (!['enhanced', 'classic'].includes(settings.lighting)) settings.lighting = 'enhanced';
            if (!['off', 'low', 'medium', 'high'].includes(settings.shadows)) settings.shadows = 'medium';
            // An unknown preset (a hand-edited file, or a preset removed in a later version) keeps its values and is
            // shown as Custom rather than being snapped back to a preset.
            if (!GRAPHICS_PRESETS[settings.quality]) settings.quality = 'custom';
            settings.texDetail = pick(settings.texDetail, [0, 1, 2, 3, 4], 2);
            settings.msaa = pick(settings.msaa, [0, 2, 4, 8], 2);
            settings.renderScale = pick(settings.renderScale, [0.5, 0.7, 0.85, 1, 1.25, 1.5], 1);
            settings.dprCap = pick(settings.dprCap, [1, 1.5, 2, 3], 1.5);
            settings.bloom = Math.max(0, Math.min(1.5, Number.isFinite(settings.bloom) ? settings.bloom : 0.45));
            settings.rays = Math.max(0, Math.min(1.5, Number.isFinite(settings.rays) ? settings.rays : 0.42));
            settings.bloomDiv = pick(settings.bloomDiv, [1, 2, 4], 2);
            document.getElementById('set-lighting').value = settings.lighting;
            document.getElementById('set-quality').value = GRAPHICS_PRESETS[settings.quality] ? settings.quality : 'custom';
            document.getElementById('set-shadows').value = settings.shadows;
            document.getElementById('set-shadows').disabled = settings.lighting === 'classic';
            document.getElementById('opt-haze').checked = settings.haze !== false;
            document.getElementById('opt-haze').disabled = settings.lighting === 'classic';
            document.getElementById('opt-bloom').checked = settings.bloom > 0 || settings.rays > 0;
            {
                const q = GRAPHICS_PRESETS[settings.quality];
                const scale = Math.min(3, Math.min(window.devicePixelRatio || 1, settings.dprCap) * settings.renderScale);
                document.getElementById('quality-note').textContent = (q ? q.name : 'Custom') +
                    ': draws at ' + (Math.round(scale * 100) / 100) + '× screen pixels, ' +
                    (settings.msaa > 0 ? settings.msaa + '× anti-aliasing' : 'no anti-aliasing') + ', ' +
                    (settings.bloom > 0 || settings.rays > 0 ? 'bloom and sun rays on' : 'no bloom or rays') +
                    ', ' + settings.shadows + ' shadows, texture detail ' + (settings.texDetail + 1) + '/5.';
            }
            settings.renderDistance = pick(settings.renderDistance, [0, 40, 60, 80, 120, 160, 250, 400], 0);
            document.getElementById('set-renderdist').value = String(settings.renderDistance);
            isLightMode = !!settings.light;
            document.body.classList.toggle('light-theme', isLightMode);
            document.getElementById('theme-toggle').checked = isLightMode;
            applyAccent();
            document.getElementById('set-looksens').value = String(settings.lookSens);
            document.getElementById('opt-inverty').checked = !!settings.invertY;
            document.getElementById('set-fov').value = settings.fov;
            document.getElementById('set-fov-out').textContent = settings.fov + '°';
            FOV = 450 * Math.tan(75 * Math.PI / 360) / Math.tan(settings.fov * Math.PI / 360);
            document.getElementById('opt-axes').checked = settings.showAxes !== false;
            document.getElementById('opt-viewcube').checked = settings.showViewfinder !== false;
            document.getElementById('viewfinder-container').style.display = settings.showViewfinder === false ? 'none' : '';
            document.getElementById('set-hint').value = settings.hintMode;
            { const h = document.getElementById('hint'); h.classList.toggle('dismissed', settings.hintMode === 'never' || (settings.hintMode === 'auto' && h.dataset.elapsed === '1')); }
            document.getElementById('opt-status').checked = settings.showStatus !== false;
            document.getElementById('statusbar').style.display = settings.showStatus === false ? 'none' : '';
            document.getElementById('opt-ui-always').checked = !!settings.alwaysShowUI;
            document.getElementById('set-uigrid').value = String(settings.uiGrid);
            { const g = document.getElementById('set-gizmooffset'); if (g && g !== document.activeElement) g.value = settings.gizmoOffset; }
            { const r = document.getElementById('set-rotstep'); if (r && r !== document.activeElement) r.value = settings.rotOffset; }
            document.getElementById('set-sefont').value = String(settings.seFont);
            document.documentElement.style.setProperty('--se-fs', settings.seFont + 'px');
            document.getElementById('set-autosave').value = String(settings.autosave);
            if (settings.autosave !== autosaveMins) { autosaveMins = settings.autosave; setupAutosave(); }
            document.querySelectorAll('#acc-swatches .swatch').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.accent === settings.accent)));
            { const custom = hexOk(settings.accent), pr = ACCENT_PRESETS.find(p => p.id === settings.accent), cur = custom ? settings.accent.toLowerCase() : (pr ? pr.dark : '#f2b134');
              const cp = document.getElementById('acc-custom'), hx = document.getElementById('acc-hex');
              cp.value = cur; cp.classList.toggle('on', custom); if (hx !== document.activeElement) hx.value = cur; }
            refreshTheme();
            if (typeof settings.defaultNames !== 'object' || !settings.defaultNames) settings.defaultNames = {};
            if (typeof settings.preinclude !== 'object' || !settings.preinclude) settings.preinclude = {};
            document.getElementById('set-cam').value = settings.rightClick && !settings.leftDrag ? 'right' : 'drag';
            // The render resolution depends on the preset, so a change has to re-size the canvases.
            if (typeof resize === 'function') resize();
            if (!(settings.camSpeed > 0)) settings.camSpeed = 0.1;
            document.getElementById('set-camspeed').value = String(settings.camSpeed);
            if (document.getElementById('set-camspeed').value !== String(settings.camSpeed)) document.getElementById('set-camspeed').value = '0.1';
            settings.axisLength = clampAxis(settings.axisLength);
            { const ax = document.getElementById('set-axislen'); if (ax !== document.activeElement) ax.value = settings.axisLength; }
            // What gets saved: normalise to a plan, then show it in the settings panel.
            { const w = settings.saveWhat && typeof settings.saveWhat === 'object' ? settings.saveWhat : {};
              const types = w.types && typeof w.types === 'object' ? w.types : {};
              settings.saveWhat = { types: {} };
              for (const [id] of SAVED_SPACES) { settings.saveWhat[id] = w[id] !== false; document.getElementById('sv-' + id).checked = settings.saveWhat[id]; }
              for (const [t] of SAVED_TYPES) { settings.saveWhat.types[t] = types[t] !== false; document.getElementById('sv-' + t).checked = settings.saveWhat.types[t]; } }
            document.getElementById('opt-uid').checked = !!settings.showUid;
            document.getElementById('opt-syntax').checked = settings.syntax !== false;
            ['prism6', 'ball', 'model', 'human', 'script', 'worldsettings'].forEach(t => { const el = document.getElementById('dn-' + t); if (el && el !== document.activeElement) el.value = dn(t); });
            ['Scripts', 'Instance', 'World', 'Storage', 'Scripting', 'Players', 'GetPlayers'].forEach(n => { document.getElementById('pre-' + n).checked = !!settings.preinclude[n]; });
            canvas.classList.toggle('no-grab', !settings.leftDrag);
            const look = document.getElementById('hint-look');
            look.hidden = !settings.leftDrag && !settings.rightClick;
            look.querySelector('kbd').textContent = settings.leftDrag && settings.rightClick ? 'Drag / Right-drag' : settings.rightClick ? 'Right-drag' : 'Drag';
        }
        function saveSettings() {
            applySettings();
            try { localStorage.setItem('vanilla-editor-settings', JSON.stringify(settings)); } catch (e) {}
        }
        const reCheckEditor = () => { if (typeof activeTab !== 'undefined' && activeTab !== 'world') seInput.dispatchEvent(new Event('input')); };
        document.getElementById('set-cam').addEventListener('change', (e) => { settings.leftDrag = e.target.value === 'drag'; settings.rightClick = e.target.value === 'right'; saveSettings(); });
        document.getElementById('set-camspeed').addEventListener('change', (e) => { settings.camSpeed = parseFloat(e.target.value) || 0.1; saveSettings(); });
        document.getElementById('set-axislen').addEventListener('input', (e) => { if (e.target.value !== '' && Number.isFinite(parseFloat(e.target.value))) { settings.axisLength = clampAxis(e.target.value); try { localStorage.setItem('vanilla-editor-settings', JSON.stringify(settings)); } catch (err) {} } });
        document.getElementById('set-axislen').addEventListener('change', (e) => { settings.axisLength = clampAxis(e.target.value); e.target.value = settings.axisLength; saveSettings(); });
        const bindSel = (id, key, parse) => document.getElementById(id).addEventListener('change', (e) => { settings[key] = parse(e.target.value); saveSettings(); });
        const bindChk = (id, key) => document.getElementById(id).addEventListener('change', (e) => { settings[key] = e.target.checked; saveSettings(); });
        bindSel('set-looksens', 'lookSens', parseFloat); bindSel('set-hint', 'hintMode', v => v); bindSel('set-sefont', 'seFont', Number); bindSel('set-autosave', 'autosave', Number);
        bindSel('set-lighting', 'lighting', v => v); bindChk('opt-haze', 'haze');
        document.getElementById('set-quality').addEventListener('change', (e) => {
            if (!applyGraphicsPreset(e.target.value)) settings.quality = 'custom';
            saveSettings();
            const q = GRAPHICS_PRESETS[settings.quality];
            toast('Graphics set to ' + (q ? q.name : 'Custom') + '.');
        });
        // Changing one graphics setting by hand keeps the others and marks the preset Custom.
        document.getElementById('set-shadows').addEventListener('change', (e) => { settings.shadows = e.target.value; settings.quality = 'custom'; saveSettings(); });
        document.getElementById('opt-bloom').addEventListener('change', (e) => {
            settings.bloom = e.target.checked ? (GRAPHICS_PRESETS[settings.quality] || GRAPHICS_PRESETS.standard).bloom || 0.45 : 0;
            settings.rays = e.target.checked ? (GRAPHICS_PRESETS[settings.quality] || GRAPHICS_PRESETS.standard).rays || 0.42 : 0;
            settings.quality = 'custom';
            saveSettings();
        });
        bindSel('set-renderdist', 'renderDistance', Number); bindSel('set-uigrid', 'uiGrid', Number);
        bindChk('opt-inverty', 'invertY'); bindChk('opt-axes', 'showAxes'); bindChk('opt-viewcube', 'showViewfinder'); bindChk('opt-status', 'showStatus');
        bindChk('opt-ui-always', 'alwaysShowUI');
        document.getElementById('set-fov').addEventListener('input', (e) => { settings.fov = parseInt(e.target.value, 10); saveSettings(); });
        // Accent color: preset swatches, a custom picker, a hex box and a reset button
        ACCENT_PRESETS.forEach(p => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'swatch'; b.dataset.accent = p.id; b.title = p.name; b.setAttribute('aria-label', p.name);
            b.style.setProperty('--sw', p.dark); b.style.setProperty('--sw-l', p.light);
            b.addEventListener('click', () => { settings.accent = p.id; saveSettings(); });
            document.getElementById('acc-swatches').appendChild(b);
        });
        document.getElementById('acc-custom').addEventListener('input', (e) => { settings.accent = e.target.value.toLowerCase(); saveSettings(); });
        document.getElementById('acc-hex').addEventListener('change', (e) => {
            let v = e.target.value.trim().replace(/^#/, '');
            if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map(c => c + c).join('');
            if (/^[0-9a-f]{6}$/i.test(v)) { settings.accent = ('#' + v).toLowerCase(); saveSettings(); }
            e.target.value = hexOk(settings.accent) ? settings.accent : (ACCENT_PRESETS.find(p => p.id === settings.accent) || ACCENT_PRESETS[0]).dark;
        });
        document.getElementById('acc-reset').addEventListener('click', () => { settings.accent = 'vanilla'; saveSettings(); });
        document.getElementById('reset-settings').addEventListener('click', async () => {
            if (!(await confirmDialog('Reset all settings?', 'Every setting goes back to its default. Your world is not changed.', 'Reset', false))) return;
            Object.keys(settings).forEach(k => delete settings[k]); Object.assign(settings, defaultSettings());
            document.getElementById('offset-input').value = settings.gizmoOffset;
            document.getElementById('rot-offset-input').value = settings.rotOffset;
            saveSettings(); reCheckEditor(); toast('Settings reset.');
        });
        function setupAutosave() {
            clearInterval(autosaveTimer); autosaveTimer = null;
            if (autosaveSuppressed) return;                  // play mode owns its own world, not the editor's save
            if (!(settings.autosave > 0)) return;
            autosaveTimer = setInterval(() => autosaveNow(), settings.autosave * 60000);
        }
        // A failed write is shown once as a toast and stays visible as a status-bar chip until a write succeeds.
        function setAutosaveFailure(failed) {
            const chip = document.getElementById('autosave-warning');
            if (chip) chip.hidden = !failed;
            if (!failed) { autosaveFailureNotified = false; return; }
            if (autosaveFailureNotified) return;
            autosaveFailureNotified = true;
            toast('Autosave failed. ' + storageFailureText() + ' Your latest edit is not saved; download a .vnw to keep it.', 'bad');
        }
        // The tab-close path saves the world the editor owns, not a live simulation: while Run is active, the saved
        // world is the snapshot Run took. The live objects are put back immediately after the file is built.
        function worldFileJsonForSave() {
            if (!simulationRunning || !simSnapshot) return JSON.stringify(buildWorldFile());
            const live = {};
            for (const id of Object.keys(sceneObjects)) { live[id] = sceneObjects[id]; delete sceneObjects[id]; }
            Object.assign(sceneObjects, simSnapshot.objects);
            try { return JSON.stringify(buildWorldFile()); }
            finally {
                for (const id of Object.keys(sceneObjects)) delete sceneObjects[id];
                Object.assign(sceneObjects, live);
            }
        }
        // buildWorldFile stamps every call with the current time, so the comparison ignores savedAt. Without this
        // every timer tick and every tab close would rewrite an unchanged world just to update the timestamp.
        function autosaveFingerprint(json) {
            return typeof json === 'string' ? json.replace(/"savedAt":"[^"]*"/, '') : '';
        }
        // Writes the Autosave slot when the world has changed since the last autosave. The timer, the tab closing and
        // the reload button on the update prompt all come through here.
        async function autosaveNow() {
            if (autosaveSuppressed) return false;            // play mode and guests must never touch the editor's save
            if (simulationRunning) return false;             // a running simulation is a snapshot, not the saved world
            let json; try { json = JSON.stringify(buildWorldFile()); } catch (e) { return false; }
            const fingerprint = autosaveFingerprint(json);
            if (!json || fingerprint === autosaveBase) return false;
            if (!(await writeSlot('autosave', json))) { setAutosaveFailure(true); return false; }
            autosaveBase = fingerprint;
            setAutosaveFailure(false);
            if (!fileMenu.hidden) refreshFileStatus();
            return true;
        }
        // A closing tab cannot wait for IndexedDB. localStorage writes are synchronous, so this copy is complete before
        // the page can go away; the next open migrates it into IndexedDB. A world too large for localStorage starts the
        // IndexedDB write immediately instead.
        function autosaveSync(persistAsync) {
            if (autosaveSuppressed) return false;
            let json; try { json = worldFileJsonForSave(); } catch (e) { return false; }
            const fingerprint = autosaveFingerprint(json);
            if (!json || fingerprint === autosaveBase) return false;
            let localSaved = false;
            try {
                localStorage.setItem(slotOf('autosave').key, json);
                localSaved = true;
            } catch (e) {
                lastSlotWriteError = e;
            }
            if (localSaved) {
                autosaveBase = fingerprint;
                setAutosaveFailure(false);
            }
            // IndexedDB is written here only when asked (the close prompt) or when localStorage could not hold the
            // world. Without a close prompt the localStorage copy is authoritative until the next open migrates it.
            if (persistAsync || !localSaved) {
                writeSlot('autosave', json).then(ok => {
                    if (ok) { autosaveBase = fingerprint; setAutosaveFailure(false); }
                    else if (!localSaved) setAutosaveFailure(true);
                }).catch(() => { if (!localSaved) setAutosaveFailure(true); });
            }
            return true;
        }
        const saveOnExit = () => { try { autosaveSync(false); } catch (e) {} };
        window.addEventListener('pagehide', saveOnExit);
        // Mobile browsers can discard a hidden tab without a pagehide, so hiding the tab saves as well.
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveOnExit(); });
        // A close with changes still waiting to be written asks first. The synchronous copy above is already complete,
        // and the IndexedDB write starts before the prompt, so the time the prompt is open also gives it time to finish.
        window.addEventListener('beforeunload', (event) => {
            let changed = false;
            try { changed = autosaveSync(true); } catch (e) {}
            if (!changed) return;
            event.preventDefault();
            event.returnValue = '';
            return '';
        });
        document.getElementById('opt-uid').addEventListener('change', (e) => { settings.showUid = e.target.checked; saveSettings(); renderExplorer(); });
        document.getElementById('opt-syntax').addEventListener('change', (e) => { settings.syntax = e.target.checked; saveSettings(); reCheckEditor(); });
        ['prism6', 'ball', 'model', 'human', 'script', 'worldsettings'].forEach(t => { const el = document.getElementById('dn-' + t); if (el) el.addEventListener('change', () => { const v = el.value.trim().slice(0, 24); if (v) settings.defaultNames[t] = v; else delete settings.defaultNames[t]; el.value = dn(t); saveSettings(); }); });
        ['Scripts', 'Instance', 'World', 'Storage', 'Scripting', 'Players', 'GetPlayers'].forEach(n => document.getElementById('pre-' + n).addEventListener('change', (e) => { settings.preinclude[n] = e.target.checked; saveSettings(); reCheckEditor(); }));
        document.querySelectorAll('.set-tab').forEach(b => b.addEventListener('click', () => {
            // Each settings card has its own tabs, so Editor Settings and World Settings never hide each other's panes.
            const card = b.closest('.modal-card') || document;
            card.querySelectorAll('.set-tab').forEach(x => x.setAttribute('aria-selected', String(x === b)));
            card.querySelectorAll('.set-pane').forEach(p => p.hidden = p.id !== 'set-' + b.dataset.pane);
        }));

        // Offset: the step the Move and Scale gizmos snap to (Vanillameters). 0 means free movement.
        const offsetEl = document.getElementById('offset-input');
        const parseOffset = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : null; };
        if (parseOffset(settings.gizmoOffset) === null) settings.gizmoOffset = 0.5;
        offsetEl.value = settings.gizmoOffset;
        const persistOffset = () => { try { localStorage.setItem('vanilla-editor-settings', JSON.stringify(settings)); } catch (e) {} };
        offsetEl.addEventListener('input', () => {
            const n = parseOffset(offsetEl.value);
            if (n !== null) {
                settings.gizmoOffset = n; persistOffset();
                const g = document.getElementById('set-gizmooffset'); if (g && g !== document.activeElement) g.value = settings.gizmoOffset;
            }
        });
        offsetEl.addEventListener('change', () => { offsetEl.value = settings.gizmoOffset; });
        offsetEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') offsetEl.blur(); });
        // Rotation: the step in degrees the Rotate gizmo snaps to (0 means free)
        const rotEl = document.getElementById('rot-offset-input');
        if (parseOffset(settings.rotOffset) === null) settings.rotOffset = 45;
        rotEl.value = settings.rotOffset;
        rotEl.addEventListener('input', () => {
            const n = parseOffset(rotEl.value);
            if (n !== null) {
                settings.rotOffset = n; persistOffset();
                const r = document.getElementById('set-rotstep'); if (r && r !== document.activeElement) r.value = settings.rotOffset;
            }
        });
        rotEl.addEventListener('change', () => { rotEl.value = settings.rotOffset; });
        rotEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') rotEl.blur(); });
        const gizmoStepEl = document.getElementById('set-gizmooffset');
        if (gizmoStepEl) gizmoStepEl.addEventListener('change', () => {
            const n = parseOffset(gizmoStepEl.value);
            if (n !== null) settings.gizmoOffset = n;
            gizmoStepEl.value = settings.gizmoOffset; offsetEl.value = settings.gizmoOffset; saveSettings();
        });
        const rotStepEl = document.getElementById('set-rotstep');
        if (rotStepEl) rotStepEl.addEventListener('change', () => {
            const n = parseOffset(rotStepEl.value);
            if (n !== null) settings.rotOffset = n;
            rotStepEl.value = settings.rotOffset; rotEl.value = settings.rotOffset; saveSettings();
        });

        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('change', (e) => {
            settings.light = e.target.checked;
            saveSettings();
        });

        // Modals
        let lastFocus = null;
        function openModal(id, focusSel) {
            lastFocus = document.activeElement;
            const m = document.getElementById(id);
            m.classList.add('active');
            (m.querySelector(focusSel) || m.querySelector('[data-close]')).focus();
        }
        function closeModals() {
            const open = document.querySelector('.modal-overlay.active');
            if (!open) return;
            if (open.id === 'modal-world') finalizeWorldSettings();
            open.classList.remove('active');
            if (lastFocus) lastFocus.focus();
        }

        // ───────── World menu and World Settings ─────────
        // The dialog edits the World Settings instance in the World space, so every value is saved with the world.
        const worldBtn = document.getElementById('world-btn');
        const worldMenu = document.getElementById('world-menu');
        let worldSettingsId = null;
        function toggleWorldMenu(force) {
            const show = typeof force === 'boolean' ? force : worldMenu.hidden;
            worldMenu.hidden = !show;
            worldBtn.setAttribute('aria-expanded', String(show));
            if (show) worldMenu.querySelector('.menu-item').focus();
        }
        worldBtn.addEventListener('click', () => toggleWorldMenu());
        worldMenu.addEventListener('click', (e) => {
            const it = e.target.closest('[data-world-act]');
            if (!it) return;
            toggleWorldMenu(false);
            if (it.dataset.worldAct === 'settings') openWorldSettings();
        });
        document.addEventListener('mousedown', (e) => {
            if (!worldMenu.hidden && !worldMenu.contains(e.target) && !worldBtn.contains(e.target)) toggleWorldMenu(false);
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !worldMenu.hidden) toggleWorldMenu(false); });
        function currentWorld() { return worldSettingsId && sceneObjects[worldSettingsId] ? sceneObjects[worldSettingsId] : null; }
        function worldSettingsTarget() {
            let ws = activeWorldSettings();
            if (!ws) {
                const id = newId(), n = ++counters.worldsettings;
                ws = makeWorldSettings(dn('worldsettings') + (n === 1 ? '' : ' ' + n), 'world');
                sceneObjects[id] = ws;
                renderExplorer();
            }
            normalizeWorldSettings(ws);
            return ws;
        }
        function openWorldSettings() {
            const ws = worldSettingsTarget();
            worldSettingsId = Object.keys(sceneObjects).find(k => sceneObjects[k] === ws) || null;
            fillWorldSettings(ws);
            openModal('modal-world', '#world-name');
        }
        function finalizeWorldSettings() {
            const ws = currentWorld();
            if (!ws) return;
            normalizeWorldSettings(ws);
            if (selectedObjectId === worldSettingsId) renderProperties();
            worldSettingsId = null;
        }
        function refreshWorldProperties() { if (selectedObjectId === worldSettingsId) renderProperties(); }
        function syncWorldPills(ws) {
            document.querySelectorAll('#modal-world [data-world-tod]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs((ws.timeOfDay % 24) - Number(b.dataset.worldTod)) < 0.01)));
            document.querySelectorAll('#modal-world [data-world-grav]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(ws.gravity - Number(b.dataset.worldGrav)) < 0.005)));
        }
        const assetBytes = (n) => {
            if (!(n > 0)) return '';
            if (n < 1024) return n + ' B';
            if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
            return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
        };
        function renderWorldAssets(ws) {
            const box = document.getElementById('world-asset-list');
            if (!box) return;
            const assets = Array.isArray(ws.assets) ? ws.assets : [];
            box.innerHTML = assets.length ? assets.map((a, i) => {
                const image = /^image\//i.test(a.type || '') || /^data:image\//i.test(a.url || '');
                const thumb = image
                    ? `<img src="${esc(a.url)}" alt="">`
                    : `<svg class="ic"><use href="../assets/icons.svg#i-folder"/></svg>`;
                const meta = [a.type || 'file', assetBytes(a.size)].filter(Boolean).join(' \u00b7 ');
                return `<div class="asset-row asset-upload">
                    <div class="asset-thumb">${thumb}</div>
                    <div class="asset-meta">
                        <input class="text" type="text" data-asset="${i}" data-key="name" maxlength="120" placeholder="Asset name" value="${esc(a.name || '')}" aria-label="Asset ${i + 1} name">
                        <span class="asset-sub">${esc(meta)}</span>
                    </div>
                    <button class="btn icon-btn" type="button" data-remove-asset="${i}" aria-label="Remove asset ${i + 1}">${icon('i-trash')}</button>
                </div>`;
            }).join('') : '<div class="asset-empty">No assets yet. Upload the first one below.</div>';
            const total = assets.reduce((n, a) => n + (Number.isFinite(+a.size) ? +a.size : 0), 0);
            const note = document.getElementById('world-asset-size');
            if (note) note.textContent = assets.length
                ? `${assets.length} asset${assets.length === 1 ? '' : 's'} \u00b7 ${assetBytes(total)}. Everything is saved inside the .vnw file.`
                : 'Assets are saved inside the .vnw file, not linked from the web.';
        }
        function audioEventOptions(ws, selected) {
            const out = [{ value: 'procedural', label: 'Procedural (default)' }, { value: 'none', label: 'None' }];
            for (const [k, p] of Object.entries(SOUND_PRESETS)) out.push({ value: 'preset:' + k, label: 'Preset · ' + p.name });
            for (const a of (Array.isArray(ws.assets) ? ws.assets : [])) {
                if (!a || !a.name || !a.url) continue;
                if (!/^audio\//i.test(a.type || '') && !/^data:audio\//i.test(a.url || '')) continue;
                out.push({ value: 'asset:' + a.name, label: 'Asset · ' + a.name });
            }
            if (selected && !out.some(o => o.value === selected)) out.push({ value: selected, label: 'Missing · ' + (typeof soundSourceLabel === 'function' ? soundSourceLabel(selected) : selected) });
            return out.map(o => `<option value="${esc(o.value)}"${o.value === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
        }
        function fillWorldAudio(ws) {
            const a = normalizeAudioSettings(ws.audio);
            ws.audio = a;
            const master = document.getElementById('world-audio-master');
            const note = document.getElementById('world-audio-master-note');
            if (master) master.value = a.master;
            if (note) note.textContent = Math.round(a.master * 100) + '%';
            for (const key of ['footsteps', 'impacts', 'death']) {
                const sel = document.getElementById('world-audio-' + key);
                if (sel) sel.innerHTML = audioEventOptions(ws, a[key]);
            }
        }
        function fillWorldDefaults(ws) {
            const stats = ws.defaults && ws.defaults.player ? ws.defaults.player : DEFAULT_PLAYER_STATS;
            for (const key of Object.keys(DEFAULT_PLAYER_STATS)) {
                const el = document.getElementById('world-def-' + key);
                if (el && el !== document.activeElement) el.value = Number.isFinite(+stats[key]) ? stats[key] : DEFAULT_PLAYER_STATS[key];
            }
        }
        function fillWorldVersion(ws) {
            const pending = pendingWorldMigrations(ws);
            const latest = currentEngineVersion();
            const created = document.getElementById('world-created-version');
            const current = document.getElementById('world-current-version');
            const newest = document.getElementById('world-latest-version');
            const button = document.getElementById('world-migrate');
            const note = document.getElementById('world-version-note');
            if (created) created.textContent = worldVersionLabel(ws.createdVersion);
            if (current) current.textContent = worldVersionLabel(ws.currentVersion);
            if (newest) newest.textContent = latest;
            if (button) {
                button.disabled = !pending.length;
                button.textContent = pending.length ? 'Migrate to ' + latest : (worldVersionCompare(ws.currentVersion, latest) > 0 ? 'Newer than this editor' : 'Up to date');
            }
            if (note) note.textContent = pending.length
                ? 'Migration: ' + pending.flatMap(m => m.notes).join(' ')
                : (worldVersionCompare(ws.currentVersion, latest) > 0
                    ? 'This world was saved by a newer engine. Open it there to migrate it.'
                    : 'This world has the latest engine features for its content.');
        }
        function fillWorldSettings(ws) {
            document.getElementById('world-name').value = ws.worldName;
            document.getElementById('world-creator').value = ws.creator;
            document.getElementById('world-description').value = ws.description;
            document.getElementById('world-maxplayers').value = ws.maxPlayers;
            const tod = document.getElementById('world-tod'), time = document.getElementById('world-tod-time');
            tod.value = ws.timeOfDay; time.value = fmtTime(ws.timeOfDay);
            tod.style.background = 'linear-gradient(to right,' + Array.from({ length: 13 }, (_, i) => { const c = skyAt(i * 2); return rgbStr(mixRGB(c.top, c.hor, 0.5)); }).join(',') + ')';
            const gr = document.getElementById('world-grav-range'), gn = document.getElementById('world-grav');
            gr.value = Math.min(30, ws.gravity); gn.value = ws.gravity;
            document.getElementById('world-kill').value = ws.killY;
            syncWorldPills(ws);
            fillWorldDefaults(ws);
            fillWorldVersion(ws);
            fillWorldAudio(ws);
            renderWorldAssets(ws);
        }
        function bindWorldSettings() {
            const name = document.getElementById('world-name');
            name.addEventListener('input', () => { const ws = currentWorld(); if (ws) ws.worldName = name.value; });
            name.addEventListener('change', () => {
                const ws = currentWorld(); if (!ws) return;
                ws.worldName = name.value.trim() || 'My World';
                name.value = ws.worldName;
            });
            const creator = document.getElementById('world-creator');
            creator.addEventListener('input', () => { const ws = currentWorld(); if (ws) ws.creator = creator.value; });
            const desc = document.getElementById('world-description');
            desc.addEventListener('input', () => { const ws = currentWorld(); if (ws) ws.description = desc.value; });
            const max = document.getElementById('world-maxplayers');
            const clampPlayers = () => Math.max(1, Math.min(100, Math.round(parseFloat(max.value) || DEFAULT_MAX_PLAYERS)));
            max.addEventListener('input', () => { const ws = currentWorld(); if (ws && Number.isFinite(parseFloat(max.value))) ws.maxPlayers = clampPlayers(); });
            max.addEventListener('change', () => { const ws = currentWorld(); if (!ws) return; ws.maxPlayers = clampPlayers(); max.value = ws.maxPlayers; });
            const tod = document.getElementById('world-tod'), time = document.getElementById('world-tod-time');
            const setTod = (h) => {
                const ws = currentWorld(); if (!ws) return;
                ws.timeOfDay = Math.max(0, Math.min(24, h));
                if (document.activeElement !== tod) tod.value = ws.timeOfDay;
                if (document.activeElement !== time) time.value = fmtTime(ws.timeOfDay);
                syncWorldPills(ws);
            };
            tod.addEventListener('input', () => setTod(parseFloat(tod.value) || 0));
            tod.addEventListener('change', refreshWorldProperties);
            time.addEventListener('input', () => { const h = parseTime(time.value); if (h !== null) setTod(h); });
            time.addEventListener('change', refreshWorldProperties);
            document.querySelectorAll('#modal-world [data-world-tod]').forEach(b => b.addEventListener('click', () => setTod(Number(b.dataset.worldTod))));
            const gr = document.getElementById('world-grav-range'), gn = document.getElementById('world-grav');
            const setGrav = (g) => {
                const ws = currentWorld(); if (!ws) return;
                ws.gravity = Math.max(0, Math.min(GRAVITY_MAX, Math.round(g * 100) / 100));
                if (document.activeElement !== gr) gr.value = Math.min(30, ws.gravity);
                if (document.activeElement !== gn) gn.value = ws.gravity;
                syncWorldPills(ws);
            };
            gr.addEventListener('input', () => setGrav(parseFloat(gr.value) || 0));
            gr.addEventListener('change', refreshWorldProperties);
            gn.addEventListener('input', () => { const g = parseFloat(gn.value); if (Number.isFinite(g)) setGrav(g); });
            gn.addEventListener('change', () => {
                const ws = currentWorld(); if (!ws) return;
                setGrav(Number.isFinite(parseFloat(gn.value)) ? parseFloat(gn.value) : 9.8);
                gn.value = ws.gravity;
                refreshWorldProperties();
            });
            document.querySelectorAll('#modal-world [data-world-grav]').forEach(b => b.addEventListener('click', () => setGrav(Number(b.dataset.worldGrav))));
            const kill = document.getElementById('world-kill');
            kill.addEventListener('input', () => { const ws = currentWorld(); const v = parseFloat(kill.value); if (ws && Number.isFinite(v)) ws.killY = v; });
            kill.addEventListener('change', () => {
                const ws = currentWorld(); if (!ws) return;
                const v = parseFloat(kill.value);
                ws.killY = Number.isFinite(v) ? v : DEFAULT_KILL_Y;
                kill.value = ws.killY;
                refreshWorldProperties();
            });
            // Defaults: the engine's own defaults stay put, and every change goes straight to the DefaultPlayer's Human.
            for (const key of Object.keys(DEFAULT_PLAYER_STATS)) {
                const el = document.getElementById('world-def-' + key);
                if (!el) continue;
                el.addEventListener('input', () => {
                    const ws = currentWorld(); if (!ws) return;
                    const v = parseFloat(el.value);
                    if (!Number.isFinite(v) || v < 0) return;
                    ws.defaults.player[key] = v;
                    applyDefaultPlayerStats(ws);
                    refreshWorldProperties();
                });
                el.addEventListener('change', () => {
                    const ws = currentWorld(); if (!ws) return;
                    normalizeWorldSettings(ws);
                    applyDefaultPlayerStats(ws);
                    el.value = ws.defaults.player[key];
                    refreshWorldProperties();
                });
            }
            document.getElementById('world-def-reset').addEventListener('click', () => {
                const ws = currentWorld(); if (!ws) return;
                ws.defaults.player = Object.assign({}, DEFAULT_PLAYER_STATS);
                applyDefaultPlayerStats(ws);
                fillWorldDefaults(ws);
                refreshWorldProperties();
                toast('Default player settings reset.');
            });
            // World version: created, current and the engine it can migrate to. Migrations only add what is missing.
            document.getElementById('world-migrate').addEventListener('click', async () => {
                if (simulationRunning) { toast('Stop the simulation first. Stop restores your world.', 'warn'); return; }
                const ws = currentWorld(); if (!ws) return;
                const pending = pendingWorldMigrations(ws);
                if (!pending.length) return;
                const latest = currentEngineVersion();
                const text = 'This world is at ' + worldVersionLabel(ws.currentVersion) + '. Migrating to ' + latest +
                    ' adds: ' + pending.map(m => m.title).join('; ') + '. Existing instances and scripts are kept.';
                if (!(await confirmDialog('Migrate this world to ' + latest + '?', text, 'Migrate', false))) return;
                const changes = applyWorldMigrations(ws);
                fillWorldSettings(ws);
                renderExplorer();
                refreshWorldProperties();
                if (pendingWorldMigrations(ws).length) {
                    toast('Migration could not finish. The world is still at ' + worldVersionLabel(ws.currentVersion) + '.', 'bad');
                    return;
                }
                if (settings.autosave > 0) autosaveNow();
                toast(changes.length
                    ? 'World migrated to ' + latest + ': ' + changes.join(', ') + '.'
                    : 'World migrated to ' + latest + '.');
            });
            // Assets: picked files are read as data URLs, so they travel inside the saved world.
            const assetList = document.getElementById('world-asset-list');
            assetList.addEventListener('input', (e) => {
                const input = e.target.closest('[data-asset]'), ws = currentWorld();
                if (!input || !ws) return;
                const a = ws.assets[Number(input.dataset.asset)]; if (!a) return;
                a[input.dataset.key] = input.value;
            });
            assetList.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-remove-asset]'), ws = currentWorld();
                if (!btn || !ws) return;
                ws.assets.splice(Number(btn.dataset.removeAsset), 1);
                renderWorldAssets(ws);
                fillWorldAudio(ws);
                refreshWorldProperties();
            });
            const assetFile = document.getElementById('world-asset-file');
            document.getElementById('world-asset-upload').addEventListener('click', () => {
                const ws = currentWorld(); if (!ws) return;
                if (ws.assets.length >= 100) { toast('A world can hold up to 100 assets.', 'warn'); return; }
                assetFile.click();
            });
            assetFile.addEventListener('change', async () => {
                const ws = currentWorld(), files = Array.from(assetFile.files || []);
                assetFile.value = '';
                if (!ws || !files.length) return;
                const MAX_FILE = 25 * 1024 * 1024;
                for (const file of files) {
                    if (ws.assets.length >= 100) { toast('A world can hold up to 100 assets.', 'warn'); break; }
                    if (file.size > MAX_FILE) { toast('"' + file.name + '" is larger than 25 MB, so it was not added.', 'warn'); continue; }
                    try {
                        const url = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result || ''));
                            reader.onerror = () => reject(reader.error || new Error('could not read the file'));
                            reader.readAsDataURL(file);
                        });
                        if (!url) continue;
                        ws.assets.push({ name: file.name.slice(0, 120), type: file.type || '', size: file.size, url });
                    } catch (err) { toast('Could not add "' + file.name + '": ' + err.message, 'bad'); }
                }
                renderWorldAssets(ws);
                fillWorldAudio(ws);
                refreshWorldProperties();
            });
            document.getElementById('world-asset-clear').addEventListener('click', () => {
                const ws = currentWorld(); if (!ws) return;
                if (!ws.assets.length) return;
                ws.assets.length = 0;
                renderWorldAssets(ws);
                fillWorldAudio(ws);
            });
            const audioMaster = document.getElementById('world-audio-master'), audioMasterNote = document.getElementById('world-audio-master-note');
            audioMaster.addEventListener('input', () => {
                const ws = currentWorld(); if (!ws) return;
                const a = normalizeAudioSettings(ws.audio); ws.audio = a;
                a.master = Math.max(0, Math.min(1, parseFloat(audioMaster.value) || 0));
                audioMasterNote.textContent = Math.round(a.master * 100) + '%';
                if (typeof audioUpdateMaster === 'function') audioUpdateMaster();
            });
            for (const key of ['footsteps', 'impacts', 'death']) {
                document.getElementById('world-audio-' + key).addEventListener('change', (e) => {
                    const ws = currentWorld(); if (!ws) return;
                    const a = normalizeAudioSettings(ws.audio); ws.audio = a;
                    a[key] = e.target.value;
                });
            }
        }
        bindWorldSettings();
        document.getElementById('version-btn').addEventListener('click', () => {
            document.getElementById('info-version').textContent = typeof ENGINE_RELEASE === 'string' ? ENGINE_RELEASE : ENGINE_VERSION;
            openModal('modal-version');
        });
        document.getElementById('settings-btn').addEventListener('click', () => openModal('modal-settings', '#theme-toggle'));
        document.getElementById('script-docs-btn').addEventListener('click', () => openDocs('settings'));
        // Build the docs: grouped sidebar, search, highlighting, copy buttons.
        let docsFrom = 'settings';
        function openDocs(from) {
            docsFrom = from;
            document.getElementById('docs-return-label').textContent = from === 'file' ? 'Back to editor' : 'Return to Settings';
            document.querySelectorAll('.modal-overlay.active').forEach(x => x.classList.remove('active'));
            openModal('modal-script-docs', '#docs-search');
        }
        document.getElementById('script-docs-btn').onclick = null;
        const docsArticle = document.getElementById('docs-article');
        const docsNav = document.getElementById('docs-nav');
        const docsMain = document.querySelector('.docs-main');
        const docsHeadings = Array.from(docsArticle.querySelectorAll('h3'));
        const releaseLabel = typeof ENGINE_RELEASE === 'string' ? ENGINE_RELEASE : ENGINE_VERSION;
        document.getElementById('docs-foot').textContent = 'Engine v' + releaseLabel;
        docsArticle.querySelectorAll('.ver-chip').forEach(c => c.textContent = releaseLabel);
        let lastGroup = null;
        docsHeadings.forEach((heading, index) => {
            heading.id = 'docs-section-' + (index + 1);
            heading.textContent = heading.textContent.replace(/^\d+\.\s*/, '');
            const group = heading.dataset.group || '';
            if (group !== lastGroup) { lastGroup = group; const g = document.createElement('div'); g.className = 'docs-nav-group'; g.textContent = group; g.dataset.group = group; docsNav.appendChild(g); }
            let text = heading.textContent.toLowerCase();
            for (let n = heading.nextElementSibling; n && n.tagName !== 'H3'; n = n.nextElementSibling) text += ' ' + n.textContent.toLowerCase();
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'docs-nav-btn' + (index === 0 ? ' active' : ''); button.dataset.group = group; button.dataset.q = text;
            button.textContent = heading.textContent;
            button.addEventListener('click', () => {
                docsNav.querySelectorAll('.docs-nav-btn').forEach(b => b.classList.toggle('active', b === button));
                heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            docsNav.appendChild(button);
        });
        document.getElementById('docs-search').addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase(); const shown = new Set();
            docsNav.querySelectorAll('.docs-nav-btn').forEach(b => { const hit = !q || b.dataset.q.includes(q); b.hidden = !hit; if (hit) shown.add(b.dataset.group); });
            docsNav.querySelectorAll('.docs-nav-group').forEach(g => g.hidden = !shown.has(g.dataset.group));
        });
        docsArticle.querySelectorAll('pre').forEach(pre => {
            const code = pre.querySelector('code');
            if (code) code.innerHTML = hlVanillalua(code.textContent);
            const copy = document.createElement('button');
            copy.type = 'button'; copy.className = 'docs-copy'; copy.textContent = 'Copy';
            copy.addEventListener('click', async () => {
                try { await navigator.clipboard.writeText(code ? code.textContent : ''); copy.textContent = 'Copied'; copy.classList.add('copied'); }
                catch (_) { copy.textContent = 'Select to copy'; }
                setTimeout(() => { copy.textContent = 'Copy'; copy.classList.remove('copied'); }, 1500);
            });
            pre.appendChild(copy);
        });
        docsMain.addEventListener('scroll', () => {
            let activeIndex = 0;
            docsHeadings.forEach((heading, index) => { if (heading.getBoundingClientRect().top < 170) activeIndex = index; });
            docsNav.querySelectorAll('.docs-nav-btn').forEach((b, index) => b.classList.toggle('active', index === activeIndex));
        }, { passive: true });
                document.getElementById('docs-return-settings').addEventListener('click', () => {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            if (docsFrom === 'settings') { document.getElementById('modal-settings').classList.add('active'); document.getElementById('theme-toggle').focus(); }
            else if (lastFocus) lastFocus.focus();
        });
        document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModals));
        document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('mousedown', (e) => { if (e.target === m) closeModals(); }));
        document.getElementById('status-version').textContent = 'v' + (typeof ENGINE_RELEASE === 'string' ? ENGINE_RELEASE : ENGINE_VERSION);
