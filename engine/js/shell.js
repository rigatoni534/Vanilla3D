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
        const defaultSettings = () => ({ leftDrag: true, rightClick: false, gizmoOffset: 0.5, rotOffset: 45, camSpeed: 0.1, axisLength: 8, lookSens: 1, invertY: false, fov: 75, lighting: 'enhanced', shadows: 'medium', haze: true, renderDistance: 0, showAxes: true, showViewfinder: true, hintMode: 'auto', showStatus: true, alwaysShowUI: false, uiGrid: 1, seFont: 13, autosave: 3, saveWhat: {}, accent: 'vanilla', light: false, showUid: false, syntax: true, defaultNames: {}, preinclude: {} });
        const settings = defaultSettings();
        let autosaveTimer = null, autosaveMins = -1, autosaveBase = '';
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
        function applyAccent() {
            let el = document.getElementById('accent-style');
            const preset = ACCENT_PRESETS.find(p => p.id === settings.accent);
            if (!preset && !hexOk(settings.accent)) settings.accent = 'vanilla';
            if (settings.accent === 'vanilla') { if (el) el.remove(); return; }
            let dark, light;
            if (preset) { dark = hexToRgb(preset.dark); light = hexToRgb(preset.light); }
            else { dark = hexToRgb(settings.accent); light = lumOf(dark) > 0.25 ? mixRgb(dark, [0, 0, 0], 0.3) : dark; }
            if (!el) { el = document.createElement('style'); el.id = 'accent-style'; document.head.appendChild(el); }
            el.textContent = ':root{' + accentVars(dark, false) + '}body.light-theme{' + accentVars(light, true) + '}';
        }
        try { Object.assign(settings, JSON.parse(localStorage.getItem('vanilla-editor-settings') || '{}')); } catch (e) {}
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
            document.getElementById('set-lighting').value = settings.lighting;
            document.getElementById('set-shadows').value = settings.shadows;
            document.getElementById('set-shadows').disabled = settings.lighting === 'classic';
            document.getElementById('opt-haze').checked = settings.haze !== false;
            document.getElementById('opt-haze').disabled = settings.lighting === 'classic';
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
        bindSel('set-lighting', 'lighting', v => v); bindSel('set-shadows', 'shadows', v => v); bindChk('opt-haze', 'haze');
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
            if (!(settings.autosave > 0)) return;
            autosaveTimer = setInterval(() => autosaveNow(), settings.autosave * 60000);
        }
        // Writes the Autosave slot when the world has changed since the last autosave. The timer, the tab closing and
        // the reload button on the update prompt all come through here.
        function autosaveNow() {
            if (simulationRunning) return false;             // a running simulation is a snapshot, not the saved world
            let json; try { json = JSON.stringify(buildWorldFile()); } catch (e) { return false; }
            if (!json || json === autosaveBase) return false;
            if (!writeSlot('autosave', json)) return false;
            autosaveBase = json;
            if (!fileMenu.hidden) refreshFileStatus();
            return true;
        }
        const saveOnExit = () => { try { autosaveNow(); } catch (e) {} };
        window.addEventListener('pagehide', saveOnExit);
        window.addEventListener('beforeunload', saveOnExit);
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
        function renderWorldAssets(ws) {
            const box = document.getElementById('world-asset-list');
            if (!box) return;
            box.innerHTML = ws.assets.length ? ws.assets.map((a, i) => `
                <div class="asset-row">
                    <input class="text" type="text" data-asset="${i}" data-key="name" maxlength="48" placeholder="Name" value="${esc(a.name || '')}" aria-label="Asset ${i + 1} name">
                    <input class="text" type="text" data-asset="${i}" data-key="url" maxlength="400" spellcheck="false" placeholder="https://…" value="${esc(a.url || '')}" aria-label="Asset ${i + 1} URL">
                    <button class="btn icon-btn" type="button" data-remove-asset="${i}" aria-label="Remove asset ${i + 1}">${icon('i-trash')}</button>
                </div>`).join('') : '<div class="asset-empty">No assets yet. Add the first one below.</div>';
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
            });
            document.getElementById('world-asset-add').addEventListener('click', () => {
                const ws = currentWorld(); if (!ws) return;
                if (ws.assets.length >= 100) { toast('A world can list up to 100 assets.', 'warn'); return; }
                ws.assets.push({ name: '', url: '' });
                renderWorldAssets(ws);
                const first = assetList.querySelector('.asset-row:last-child input');
                if (first) first.focus();
            });
        }
        bindWorldSettings();
        document.getElementById('version-btn').addEventListener('click', () => {
            document.getElementById('info-version').textContent = ENGINE_VERSION;
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
        document.getElementById('docs-foot').textContent = 'Engine v' + ENGINE_VERSION;
        docsArticle.querySelectorAll('.ver-chip').forEach(c => c.textContent = ENGINE_VERSION);
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
        document.getElementById('status-version').textContent = 'v' + ENGINE_VERSION;
