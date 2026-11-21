// Vanilla Engine — selection, properties panel, move/scale modes and resize. Loaded in order by index.html.
                // ───────── Selection & properties ─────────
        function uncollapseAncestors(id) {
            let o = sceneObjects[id], n = 0;
            while (o && n++ < 64) {
                if (collapsed.has(o.parent)) collapsed.delete(o.parent);
                o = sceneObjects[o.parent];
            }
        }
        function selectItem(id) {
            selectedObjectId = id || null;
            selectedSpaceId = null;
            if (id) uncollapseAncestors(id);
            multiSel.clear(); if (id) multiSel.add(id); anchorId = id || null;
            renderExplorer();
            renderProperties();
            applyModeHint();
        }
        window.selectItem = selectItem;

        const objHead = (id, o, ic, extra = '') =>
            `<div class="obj-head">${icon(ic)}<div class="obj-meta"><div class="obj-name">${esc(o.name)}</div>
                <div class="obj-id"><span title="Instance type">${o.type}</span><span class="uid" title="Unique ID">${id}</span></div></div>${extra}</div>`;
        const defaultNames = { prism6: 'Block', ball: 'Ball', wedge: 'Wedge', cylinder: 'Cylinder', model: 'Model', script: 'Script', worldsettings: 'Settings', human: 'Player', sound: 'Sound', highlight: 'Highlight', frame: 'Frame', text: 'Text', button: 'Button', image: 'Image', input: 'Input', progressbar: 'ProgressBar' };
        const nameField = (o, dis = '') =>
            `<div class="field-label">Name</div><input class="text" type="text" id="prop-name" maxlength="48" value="${esc(o.name)}" aria-label="Name" ${dis}>`;
        function bindName(obj) {
            const nameEl = document.getElementById('prop-name');
            if (!nameEl || nameEl.disabled) return;
            const refresh = () => {
                const head = document.querySelector('#properties-content .obj-name');
                if (head) head.textContent = obj.name;
                renderExplorer();
            };
            nameEl.addEventListener('input', () => { obj.name = nameEl.value; refresh(); });
            nameEl.addEventListener('change', () => {
                obj.name = nameEl.value.trim() || dn(obj.type);
                nameEl.value = obj.name;
                refresh();
            });
            nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameEl.blur(); });
        }
        const numField = (id, tag, axis, title, value, dis) =>
            `<label class="num" title="${title}"><span class="tag ${axis}">${tag}</span><input type="number" id="${id}" step="0.1" value="${value}" aria-label="${title}" ${dis}></label>`;
        const switchRow = (id, label, checked, dis) =>
            `<label class="row${dis ? ' is-disabled' : ''}"><span>${label}</span><input class="switch" type="checkbox" id="${id}" ${checked ? 'checked' : ''} ${dis}></label>`;
        const section = (title, body) =>
            `<details class="sec" open><summary>${icon('i-chev', 'chev')}${title}</summary><div class="sec-body">${body}</div></details>`;

        const propFields = [['prop-x', 'x'], ['prop-y', 'y'], ['prop-z', 'z'], ['prop-length', 'length'], ['prop-width', 'width'], ['prop-height', 'height'], ['prop-rx', 'rotX'], ['prop-ry', 'rotY'], ['prop-rz', 'rotZ']];
        function syncPropInputs() {
            const o = sceneObjects[selectedObjectId];
            if (!isShape(o)) return;
            for (const [elId, key] of propFields) {
                const el = document.getElementById(elId);
                if (el && document.activeElement !== el) el.value = o[key];
            }
        }

        // While a UI element is dragged its four numbers in the panel follow the drag.
        function syncUIPropInputs() {
            const o = sceneObjects[selectedObjectId];
            if (!isUI(o)) return;
            for (const key of ['posX', 'posY', 'sizeX', 'sizeY']) {
                const el = document.getElementById('prop-ui-' + key);
                if (el && document.activeElement !== el) el.value = r3(o[key]);
            }
        }

        function renderProperties() {
            const container = document.getElementById('properties-content');
            if (!selectedObjectId) {
                if (selectedSpaceId === 'ui') {
                    const count = Object.values(sceneObjects).filter(o => isUI(o) && spaceOf(o) === 'ui').length;
                    container.innerHTML = `
                        ${objHead('ui', { name: 'UI', type: 'space' }, 'i-ui-frame')}
                        ${section('Layout', `<div class="field-note">The UI space is the whole screen. Elements are sized and placed in percentages of what they sit in, and Position is the centre of the element: <code>50, 50</code> is the middle of the screen and a Size of <code>100, 5</code> is a strip across the top.</div>`)}
                        ${section('Handed to the player', `<div class="field-note">When a player joins in the simulation, ${count ? 'these ' + count + ' element' + (count === 1 ? '' : 's') + ' go' : 'these elements go'} inside that Player in Players and are drawn for them. Stop puts them back.</div>`)}`;
                    return;
                }
                container.innerHTML = `<div class="empty">${icon('i-pointer')}<p>Nothing selected</p><span>Pick an item in the explorer or click one in the viewport.</span></div>`;
                return;
            }
            const obj = sceneObjects[selectedObjectId];

            if (obj.type === 'player') {
                const pm = obj.currentModel && sceneObjects[obj.currentModel];
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-human')}
                    ${section('Player', `
                        <div class="field-label">Name</div>
                        <input class="text" value="${esc(obj.name)}" aria-label="Name" disabled>
                        <div class="field-label">Current model</div>
                        <input class="text" value="${pm ? esc(pm.name) : 'None'}" aria-label="Current model" disabled>
                        <div class="field-note">${obj.dead ? 'This player is dead and waiting for a new model. ' : ''}Players are read-only in the editor. Scripts give them a model with Players.AssignModelToPlayer.</div>`)}`;
                return;
            }
            if (obj.readOnly) {
                container.innerHTML = `<div class="empty">${icon('i-lock')}<p>${esc(obj.name)}</p><span>This is an engine component and can’t be edited.</span></div>`;
                return;
            }

            if (isUI(obj)) {
                const number = (key, label, tag, min, max, step) => `
                    <div class="field-label">${label}</div>
                    <label class="num" title="${label} (percent of the parent)"><span class="tag">${tag}</span><input type="number" id="prop-ui-${key}" min="${min}" max="${max}" step="${step}" value="${r3(uiClamp(obj[key], min, max))}" aria-label="${label}"></label>`;
                const colorRow = (key, label) => `
                    <div class="field-label">${label}</div>
                    <div class="accent-ctl"><input type="color" class="color-pick" id="prop-ui-${key}-pick" value="${HEX6.test(obj[key]) ? obj[key] : '#000000'}" aria-label="${label}"><input class="text hex-in" id="prop-ui-${key}-hex" maxlength="7" spellcheck="false" value="${HEX6.test(obj[key]) ? obj[key] : '#000000'}" aria-label="${label} hex code"></div>`;
                const textRow = (key, label, value, max) => `
                    <div class="field-label">${label}</div>
                    <input class="text" type="text" id="prop-ui-${key}" maxlength="${max}" value="${esc(value)}" aria-label="${label}">`;
                const transparencyRow = (label = 'Transparency') => `
                    <div class="field-label">${label}</div>
                    <div class="tod-row">
                        <input type="range" class="tod" id="prop-ui-transparency" min="0" max="1" step="0.01" value="${uiClamp(obj.transparency, 0, 1)}" aria-label="${label}">
                        <span class="field-note" id="prop-ui-transparency-note" style="margin:0;min-width:44px;text-align:right">${Math.round(uiClamp(obj.transparency, 0, 1) * 100)}%</span>
                    </div>`;
                const fillTransparencyRow = `
                    <div class="field-label">Fill transparency</div>
                    <div class="tod-row">
                        <input type="range" class="tod" id="prop-ui-fillTransparency" min="0" max="1" step="0.01" value="${uiClamp(obj.fillTransparency, 0, 1)}" aria-label="Fill transparency">
                        <span class="field-note" id="prop-ui-fillTransparency-note" style="margin:0;min-width:44px;text-align:right">${Math.round(uiClamp(obj.fillTransparency, 0, 1) * 100)}%</span>
                    </div>`;
                const typeLook = obj.type === 'text' || obj.type === 'button' || obj.type === 'input' ? `
                    ${colorRow('textColor', 'Text color')}
                    ${number('textSize', 'Text size', 'px', 4, 200, 1)}
                    <div class="field-label">Align</div>
                    <div class="pill-row">${UI_ALIGNS.map(a => `<button class="pill" data-align="${a}" aria-pressed="${obj.align === a}">${a}</button>`).join('')}</div>` : '';
                const look = obj.type === 'progressbar' ? `
                    <div class="field-label">Shape</div>
                    <div class="pill-row">${['Straight', 'Circular'].map(s => `<button class="pill" data-shape="${s}" aria-pressed="${(obj.shape === 'Circular' ? 'Circular' : 'Straight') === s}">${s}</button>`).join('')}</div>
                    ${colorRow('color', 'Background color')}
                    ${transparencyRow('Background transparency')}
                    ${number('backgroundBlur', 'Background blur', 'px', 0, 20, 1)}
                    <div class="set-sub">Progress</div>
                    ${colorRow('fillColor', 'Fill color')}
                    ${fillTransparencyRow}
                    ${number('fillBlur', 'Fill blur', 'px', 0, 20, 1)}
                    ${number('length', 'Length', '%', 0, 100, 1)}
                    <div class="field-note">Straight fills from the left. Circular wraps clockwise from the top; use equal Width and Height for a true circle. Background blur frosts what is behind the bar.</div>`
                    : obj.type === 'frame' ? `
                    ${colorRow('color', 'Background color')}
                    ${transparencyRow()}
                    ${number('borderWidth', 'Border width', 'px', 0, 20, 1)}
                    ${colorRow('borderColor', 'Border color')}
                    ${number('backgroundBlur', 'Background blur', 'px', 0, 20, 1)}
                    ${number('borderBlur', 'Border blur', 'px', 0, 20, 1)}
                    <div class="field-note">Background blur frosts what is behind the frame; border blur softens its stroke.</div>
                    ${switchRow('prop-ui-clip', 'Clip children', !!obj.clipChildren, '')}`
                    : obj.type === 'image' ? `
                    ${textRow('image', 'Image URL', obj.image || '', 400)}
                    ${transparencyRow()}
                    <div class="field-note">A full URL to a PNG, JPEG, GIF or WebP image. It fills the element.</div>`
                    : obj.type === 'text' ? `
                    ${textRow('text', 'Text', obj.text || '', 200)}
                    ${typeLook}
                    ${switchRow('prop-ui-bold', 'Bold', !!obj.bold, '')}`
                    : obj.type === 'button' ? `
                    ${textRow('text', 'Text', obj.text || '', 120)}
                    ${typeLook}
                    ${switchRow('prop-ui-bold', 'Bold', !!obj.bold, '')}
                    ${colorRow('color', 'Background color')}
                    ${transparencyRow()}
                    <div class="field-note">While the simulation runs, pressing the button fires its <code>Clicked</code> event.</div>`
                    : `
                    ${textRow('placeholder', 'Placeholder', obj.placeholder || '', 120)}
                    ${textRow('text', 'Starting text', obj.text || '', 200)}
                    ${typeLook}
                    ${colorRow('color', 'Background color')}
                    ${transparencyRow()}
                    <div class="field-note">While the simulation runs, the player can type here. Pressing Enter fires <code>Submitted</code> with the text.</div>`;
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, typeIcon[obj.type])}
                    ${section('Editor', nameField(obj))}
                    ${section('Layout', `
                        ${number('posX', 'Position X', '%', 0, 100, 1)}
                        ${number('posY', 'Position Y', '%', 0, 100, 1)}
                        ${number('sizeX', 'Width', '%', 1, 100, 1)}
                        ${number('sizeY', 'Height', '%', 1, 100, 1)}
                        ${switchRow('prop-ui-visible', 'Visible', obj.visible !== false, '')}
                        <div class="field-note">Position is the centre of the element. Percentages are of the screen, or of the Frame it sits in.</div>
                    `)}
                    ${section('Appearance', look)}`;
                bindName(obj);
                for (const [key, lo, hi] of [['posX', 0, 100], ['posY', 0, 100], ['sizeX', UI_MIN_SIZE, 100], ['sizeY', UI_MIN_SIZE, 100], ['textSize', 4, 200], ['borderWidth', 0, 20], ['backgroundBlur', 0, 20], ['borderBlur', 0, 20], ['fillBlur', 0, 20], ['length', 0, 100]]) {
                    const el = document.getElementById('prop-ui-' + key);
                    if (!el) continue;
                    el.addEventListener('input', () => { const v = parseFloat(el.value); if (Number.isFinite(v)) obj[key] = uiClamp(v, lo, hi); });
                    el.addEventListener('change', () => { el.value = r3(obj[key]); });
                }
                for (const key of ['color', 'textColor', 'borderColor', 'fillColor']) {
                    const pick = document.getElementById('prop-ui-' + key + '-pick'), hex = document.getElementById('prop-ui-' + key + '-hex');
                    if (!pick || !hex) continue;
                    pick.addEventListener('input', () => { obj[key] = pick.value.toLowerCase(); hex.value = obj[key]; });
                    hex.addEventListener('change', () => {
                        let v = hex.value.trim().replace(/^#/, '');
                        if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map(c => c + c).join('');
                        if (/^[0-9a-f]{6}$/i.test(v)) { obj[key] = ('#' + v).toLowerCase(); pick.value = obj[key]; }
                        hex.value = HEX6.test(obj[key]) ? obj[key] : '#000000';
                    });
                }
                for (const key of ['text', 'placeholder', 'image']) {
                    const el = document.getElementById('prop-ui-' + key);
                    if (el) el.addEventListener('input', () => { obj[key] = el.value; });
                }
                const trans = document.getElementById('prop-ui-transparency');
                if (trans) trans.addEventListener('input', () => {
                    obj.transparency = uiClamp(parseFloat(trans.value), 0, 1);
                    document.getElementById('prop-ui-transparency-note').textContent = Math.round(obj.transparency * 100) + '%';
                });
                const fillTrans = document.getElementById('prop-ui-fillTransparency');
                if (fillTrans) fillTrans.addEventListener('input', () => {
                    obj.fillTransparency = uiClamp(parseFloat(fillTrans.value), 0, 1);
                    document.getElementById('prop-ui-fillTransparency-note').textContent = Math.round(obj.fillTransparency * 100) + '%';
                });
                container.querySelectorAll('[data-shape]').forEach(b => b.addEventListener('click', () => {
                    obj.shape = b.dataset.shape;
                    container.querySelectorAll('[data-shape]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.shape === obj.shape)));
                }));
                container.querySelectorAll('[data-align]').forEach(b => b.addEventListener('click', () => {
                    obj.align = b.dataset.align;
                    container.querySelectorAll('[data-align]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.align === obj.align)));
                }));
                document.getElementById('prop-ui-visible').addEventListener('change', (e) => { obj.visible = e.target.checked; });
                const boldEl = document.getElementById('prop-ui-bold');
                if (boldEl) boldEl.addEventListener('change', (e) => { obj.bold = e.target.checked; });
                const clipEl = document.getElementById('prop-ui-clip');
                if (clipEl) clipEl.addEventListener('change', (e) => { obj.clipChildren = e.target.checked; });
                return;
            }

            if (obj.type === 'texture') {
                const parent = sceneObjects[obj.parent];
                if (!Array.isArray(obj.faces)) obj.faces = [];
                if (!TEXTURES[obj.texture]) obj.texture = 'grid';
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-grid')}
                    ${section('Editor', nameField(obj))}
                    ${section('Texture', `
                        <div class="field-label">Texture</div>
                        <select class="text" id="prop-texture" aria-label="Texture">${Object.entries(TEXTURES).map(([k, t]) => `<option value="${k}"${obj.texture === k ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
                        <div class="field-note" id="prop-texture-note">${esc(TEXTURES[obj.texture].note)}</div>
                        <div class="field-label">Faces</div>
                        <div class="pill-row">${FACE_PICK_ORDER.map(i => `<button class="pill" data-face="${i}" aria-pressed="${obj.faces.includes(i)}">${FACE_LABELS[i]}</button>`).join('')}</div>
                        <div class="pill-row"><button class="pill" data-faceset="all" aria-pressed="false">All faces</button><button class="pill" data-faceset="none" aria-pressed="false">None</button></div>
                        ${parent && parent.type === 'prism6' ? `<div class="field-note">Applies to ${esc(parent.name)}.</div>` : '<div class="field-note">A texture only shows when it is a child of a Rectangular Prism.</div>'}
                    `)}
                `;
                bindName(obj);
                const facePills = [...container.querySelectorAll('[data-face]')];
                const syncFaces = () => facePills.forEach(b => b.setAttribute('aria-pressed', String(obj.faces.includes(Number(b.dataset.face)))));
                facePills.forEach(b => b.addEventListener('click', () => {
                    const f = Number(b.dataset.face);
                    obj.faces = obj.faces.includes(f) ? obj.faces.filter(x => x !== f) : obj.faces.concat(f).sort((a, b2) => a - b2);
                    syncFaces();
                }));
                container.querySelectorAll('[data-faceset]').forEach(b => b.addEventListener('click', () => {
                    obj.faces = b.dataset.faceset === 'all' ? [0, 1, 2, 3, 4, 5] : [];
                    syncFaces();
                }));
                document.getElementById('prop-texture').addEventListener('change', (e) => {
                    obj.texture = TEXTURES[e.target.value] ? e.target.value : 'grid';
                    document.getElementById('prop-texture-note').textContent = TEXTURES[obj.texture].note;
                });
                return;
            }

            if (obj.type === 'model') {
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-model')}
                    ${section('Editor', nameField(obj))}
                `;
                bindName(obj);
                return;
            }

            if (obj.type === 'worldsettings') {
                const presets = [['Dawn', 6], ['Noon', 12], ['Dusk', 18], ['Night', 0]];
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-sun')}
                    ${section('Editor', nameField(obj))}
                    ${section('Lighting', `
                        <div class="field-label">Time of day</div>
                        <div class="tod-row">
                            <input type="range" class="tod" id="prop-tod-range" min="0" max="24" step="0.05" value="${obj.timeOfDay}" aria-label="Time of day">
                            <input type="time" class="time" id="prop-tod" value="${fmtTime(obj.timeOfDay)}" aria-label="Time of day (24 hour clock)">
                        </div>
                        <div class="pill-row">${presets.map(([n, h]) => `<button class="pill" data-tod="${h}" aria-pressed="false">${n}</button>`).join('')}</div>
                    `)}
                    ${section('Simulation', `
                        <div class="field-label">Gravity</div>
                        <div class="tod-row">
                            <input type="range" class="tod" id="prop-grav-range" min="0" max="30" step="0.1" value="${Math.min(30, Number.isFinite(obj.gravity) ? obj.gravity : DEFAULT_GRAVITY)}" aria-label="Gravity">
                            <label class="num grav" title="Gravity in meters per second squared"><input type="number" id="prop-grav" min="0" max="${GRAVITY_MAX}" step="0.1" value="${Number.isFinite(obj.gravity) ? obj.gravity : DEFAULT_GRAVITY}" aria-label="Gravity (m/s²)"><span class="tag">m/s²</span></label>
                        </div>
                        <div class="pill-row">${GRAVITY_PRESETS.map(([n, g]) => `<button class="pill" data-grav="${g}" aria-pressed="false" title="${g} m/s²">${n}</button>`).join('')}</div>
                        <div class="field-label">Kill layer height</div>
                        <label class="num" title="Kill layer height (Y)"><span class="tag y">Y</span><input type="number" id="prop-killy" step="100" value="${Number.isFinite(obj.killY) ? obj.killY : DEFAULT_KILL_Y}" aria-label="Kill layer height"></label>
                        <div class="field-note">Simulated objects that fall below this height are deleted from the world.</div>
                    `)}`;
                const range = document.getElementById('prop-tod-range'), time = document.getElementById('prop-tod');
                range.style.background = 'linear-gradient(to right,' + Array.from({ length: 13 }, (_, i) => { const c = skyAt(i * 2); return rgbStr(mixRGB(c.top, c.hor, 0.5)); }).join(',') + ')';
                const pills = [...container.querySelectorAll('.pill')];
                const sync = () => {
                    pills.forEach(b => b.setAttribute('aria-pressed', String(Math.abs((obj.timeOfDay % 24) - Number(b.dataset.tod)) < 0.01)));
                };
                const setT = (h) => {
                    obj.timeOfDay = Math.max(0, Math.min(24, h));
                    if (document.activeElement !== range) range.value = obj.timeOfDay;
                    if (document.activeElement !== time) time.value = fmtTime(obj.timeOfDay);
                    sync();
                };
                range.addEventListener('input', () => setT(parseFloat(range.value) || 0));
                time.addEventListener('input', () => { const h = parseTime(time.value); if (h !== null) { obj.timeOfDay = h; range.value = h; sync(); } });
                pills.forEach(b => b.addEventListener('click', () => setT(Number(b.dataset.tod))));
                sync();
                const gRange = document.getElementById('prop-grav-range'), gNum = document.getElementById('prop-grav');
                const gPills = [...container.querySelectorAll('[data-grav]')];
                const gSync = () => gPills.forEach(b => b.setAttribute('aria-pressed', String(Math.abs(obj.gravity - Number(b.dataset.grav)) < 0.005)));
                const setG = (g) => {
                    obj.gravity = Math.max(0, Math.min(GRAVITY_MAX, Math.round(g * 100) / 100));
                    if (document.activeElement !== gRange) gRange.value = Math.min(30, obj.gravity);
                    if (document.activeElement !== gNum) gNum.value = obj.gravity;
                    gSync();
                };
                gRange.addEventListener('input', () => setG(parseFloat(gRange.value) || 0));
                gNum.addEventListener('input', () => { const g = parseFloat(gNum.value); if (Number.isFinite(g)) setG(g); });
                gNum.addEventListener('change', () => { const g = parseFloat(gNum.value); setG(Number.isFinite(g) ? g : DEFAULT_GRAVITY); gNum.value = obj.gravity; });
                gPills.forEach(b => b.addEventListener('click', () => setG(Number(b.dataset.grav))));
                gSync();
                const killEl = document.getElementById('prop-killy');
                killEl.addEventListener('input', () => { const v = parseFloat(killEl.value); if (Number.isFinite(v)) obj.killY = v; });
                killEl.addEventListener('change', () => {
                    const v = parseFloat(killEl.value);
                    obj.killY = Number.isFinite(v) ? v : DEFAULT_KILL_Y;
                    killEl.value = obj.killY;
                });
                bindName(obj);
                return;
            }

            if (obj.type === 'human') {
                const HF = (key, label, unit, step) => `
                    <div class="field-label">${label}</div>
                    <label class="num hnum"><input type="number" id="prop-h-${key}" min="0" step="${step}" value="${Number.isFinite(obj[key]) ? obj[key] : HUMAN_DEFAULTS[key]}" aria-label="${label}"><span class="tag">${unit}</span></label>`;
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-human')}
                    ${section('Editor', `
                        <div class="field-label">Name</div>
                        <input class="text" value="Human" aria-label="Name" disabled>
                        <div class="field-label">Player name</div>
                        <input class="text" id="prop-h-playername" maxlength="24" value="${esc(obj.playerName || '')}" aria-label="Player name">`)}
                    ${section('Health', HF('health', 'Health', 'HP', 1) + HF('maxHealth', 'Max health', 'HP', 1))}
                    ${section('Movement', HF('walkSpeed', 'Walk speed', 'Vm/s', 0.1) + HF('runSpeed', 'Run speed', 'Vm/s', 0.1) + HF('jumpHeight', 'Jump height', 'Vm', 0.05))}
                    ${section('Stamina', HF('stamina', 'Stamina', '', 1) + HF('maxStamina', 'Max stamina', '', 1) + HF('runStaminaLoss', 'Run stamina loss', '/s', 0.5) + HF('jumpStaminaLoss', 'Jump stamina loss', '/jump', 1) + HF('staminaGain', 'Stamina gain', '/s', 0.5))}
                    <div class="sec-body"><div class="field-note">These values are used by the player you control, and at 0 Health the player dies.</div></div>`;
                for (const key of Object.keys(HUMAN_DEFAULTS)) {
                    const el = document.getElementById('prop-h-' + key);
                    el.addEventListener('input', () => { const v = parseFloat(el.value); if (Number.isFinite(v) && v >= 0) obj[key] = v; });
                    el.addEventListener('change', () => {
                        const v = parseFloat(el.value);
                        obj[key] = Number.isFinite(v) && v >= 0 ? v : HUMAN_DEFAULTS[key];
                        el.value = obj[key];
                    });
                }
                document.getElementById('prop-h-playername').addEventListener('input', (e) => { obj.playerName = e.target.value; });
                return;
            }

            if (obj.type === 'script') {
                ensureScript(obj);
                const opts = (list, cur) => list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');
                const runNotes = { simulation: '', join: 'Nothing can join inside the editor yet, so this never runs here.', manual: 'Runs when another script calls Run() on this script.' };
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-script')}
                    <div class="sec-body"><button class="btn btn-outline" id="prop-open-script" style="width:100%;justify-content:center">${icon('i-script')}<span>Open script</span></button></div>
                    ${section('Editor', nameField(obj))}
                    ${section('Execution', `
                        <div class="field-label">Script type</div>
                        <select class="text" id="prop-script-type" aria-label="Script type">${opts([['Local', 'Local'], ['Server', 'Server']], obj.scriptType)}</select>
                        <div class="field-label">Run when</div>
                        <select class="text" id="prop-run-when" aria-label="Run when">${opts([['simulation', 'Simulation start'], ['join', 'Client join'], ['manual', 'Manual call by other script']], obj.runWhen)}</select>
                        <div class="field-note" id="prop-run-note">${runNotes[obj.runWhen]}</div>
                    `)}
                    ${section('Miscellaneous', `
                        <div class="field-label">Language</div>
                        <select class="text" id="prop-language" aria-label="Language">${opts([['vanillalua', 'Vanillalua'], ['json', 'JSON']], obj.language)}</select>
                    `)}`;
                bindName(obj);
                const id = selectedObjectId;
                document.getElementById('prop-open-script').addEventListener('click', () => openScriptTab(id));
                document.getElementById('prop-script-type').addEventListener('change', (e) => { obj.scriptType = e.target.value; });
                document.getElementById('prop-run-when').addEventListener('change', (e) => {
                    obj.runWhen = e.target.value;
                    document.getElementById('prop-run-note').textContent = runNotes[obj.runWhen];
                });
                document.getElementById('prop-language').addEventListener('change', (e) => {
                    obj.language = e.target.value;
                    if (editorScriptId === id) refreshEditor();
                });
                return;
            }

            if (obj.type === 'sound') {
                if (!SOUND_PRESETS[obj.preset]) obj.preset = 'beep';
                obj.volume = Math.max(0, Math.min(1, Number.isFinite(obj.volume) ? obj.volume : 0.6));
                if (!Number.isFinite(obj.maxDistance)) obj.maxDistance = 20;
                const parent = sceneObjects[obj.parent];
                const isChild = parent && !SPACE_KEYS.includes(obj.parent);
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-sound')}
                    ${section('Editor', nameField(obj))}
                    ${section('Playback', `
                        <div class="field-label">Sound</div>
                        <select class="text" id="prop-sound-preset" aria-label="Sound">${Object.entries(SOUND_PRESETS).map(([k, p]) => `<option value="${k}"${obj.preset === k ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
                        <div class="switch-stack">
                        ${switchRow('prop-sound-playing', 'Playing', !!obj.playing, '')}
                        ${switchRow('prop-sound-looped', 'Looped', !!obj.looped, '')}
                        </div>
                        <div class="field-label">Volume</div>
                        <div class="tod-row">
                            <input type="range" class="tod" id="prop-sound-volume" min="0" max="1" step="0.01" value="${obj.volume}" aria-label="Volume">
                            <span class="field-note" id="prop-sound-volume-note" style="margin:0;min-width:44px;text-align:right">${Math.round(obj.volume * 100)}%</span>
                        </div>
                        <div class="field-label">Max distance</div>
                        <div class="tod-row">
                            <input type="range" class="tod" id="prop-sound-distance" min="0" max="200" step="1" value="${Math.min(200, obj.maxDistance)}" aria-label="Max distance">
                            <label class="num" title="Max distance in meters"><input type="number" id="prop-sound-distance-num" min="0" step="1" value="${obj.maxDistance}" aria-label="Max distance in meters"><span class="tag">m</span></label>
                        </div>
                        <div class="field-note">${isChild ? 'Heard within this many meters of ' + esc(parent.name) + ', fading with distance from the camera.' : 'Max distance only applies when a Sound is a child of an object. A sound straight in a Space is heard at the same volume everywhere.'}</div>
                    `)}`;
                bindName(obj);
                const id = selectedObjectId;
                document.getElementById('prop-sound-preset').addEventListener('change', (e) => {
                    obj.preset = SOUND_PRESETS[e.target.value] ? e.target.value : 'beep';
                    if (obj.playing) startSound(id);
                });
                document.getElementById('prop-sound-playing').addEventListener('change', (e) => {
                    obj.playing = e.target.checked;
                    if (obj.playing) startSound(id); else stopSound(id);
                });
                document.getElementById('prop-sound-looped').addEventListener('change', (e) => {
                    obj.looped = e.target.checked;
                    if (obj.playing) startSound(id);
                });
                const volEl = document.getElementById('prop-sound-volume'), volNote = document.getElementById('prop-sound-volume-note');
                volEl.addEventListener('input', () => {
                    obj.volume = Math.max(0, Math.min(1, parseFloat(volEl.value) || 0));
                    volNote.textContent = Math.round(obj.volume * 100) + '%';
                });
                const distR = document.getElementById('prop-sound-distance'), distN = document.getElementById('prop-sound-distance-num');
                const setDist = (v) => {
                    obj.maxDistance = Math.max(0, Number.isFinite(v) ? v : 0);
                    if (document.activeElement !== distR) distR.value = Math.min(200, obj.maxDistance);
                    if (document.activeElement !== distN) distN.value = obj.maxDistance;
                };
                distR.addEventListener('input', () => setDist(parseFloat(distR.value)));
                distN.addEventListener('input', () => setDist(parseFloat(distN.value)));
                distN.addEventListener('change', () => { setDist(parseFloat(distN.value)); distN.value = obj.maxDistance; });
                return;
            }

            if (obj.type === 'highlight') {
                const parent = sceneObjects[obj.parent];
                const targets = highlightTargets(obj).length;
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-highlight')}
                    ${section('Editor', nameField(obj))}
                    ${section('Outline', `
                        <div class="field-label">Color</div>
                        <div class="accent-ctl"><input type="color" class="color-pick" id="prop-hi-color" value="${prismColor(obj)}" aria-label="Outline color"><input class="text hex-in" id="prop-hi-hex" maxlength="7" spellcheck="false" value="${prismColor(obj)}" aria-label="Outline color hex code"></div>
                        ${switchRow('prop-hi-over', 'Appears over objects', obj.overObjects !== false, '')}
                        <div class="field-note">${targets ? 'Outlining ' + targets + ' part' + (targets === 1 ? '' : 's') + ' under ' + esc(parent ? parent.name : '') + '.' : 'Put a Highlight inside a model or a part to outline it.'}</div>
                    `)}`;
                bindName(obj);
                const pick = document.getElementById('prop-hi-color'), hex = document.getElementById('prop-hi-hex');
                pick.addEventListener('input', () => { obj.color = pick.value.toLowerCase(); hex.value = obj.color; });
                hex.addEventListener('change', () => {
                    let v = hex.value.trim().replace(/^#/, '');
                    if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map(c => c + c).join('');
                    if (/^[0-9a-f]{6}$/i.test(v)) { obj.color = ('#' + v).toLowerCase(); pick.value = obj.color; }
                    hex.value = prismColor(obj);
                });
                document.getElementById('prop-hi-over').addEventListener('change', (e) => { obj.overObjects = e.target.checked; });
                return;
            }

            const dis = obj.locked ? 'disabled' : '';
            const sizeDis = obj.type === 'union' ? 'disabled' : dis;
            container.innerHTML = `
                ${objHead(selectedObjectId, obj, obj.type === 'ball' ? 'i-ball' : obj.type === 'wedge' ? 'i-wedge' : obj.type === 'cylinder' ? 'i-cylinder' : obj.type === 'union' ? 'i-union' : 'i-cube', obj.locked ? `<span class="chip">${icon('i-lock')}Locked</span>` : '')}
                ${section('Position', `<div class="field-row">
                    ${numField('prop-x', 'X', 'x', 'X', obj.x, dis)}
                    ${numField('prop-y', 'Y', 'y', 'Y', obj.y, dis)}
                    ${numField('prop-z', 'Z', 'z', 'Z', obj.z, dis)}
                </div>`)}
                ${section('Size', `<div class="field-row">
                    ${numField('prop-length', 'L', 'z', 'Length (Z)', obj.length, sizeDis)}
                    ${numField('prop-width', 'W', 'x', 'Width (X)', obj.width, sizeDis)}
                    ${numField('prop-height', 'H', 'y', 'Height (Y)', obj.height, sizeDis)}
                </div>${obj.type === 'union' ? '<div class="field-note">A union keeps the size of the parts it was built from.</div>' : ''}`)}
                ${obj.type === 'union' ? section('Union', `<div class="field-note">Built from ${(obj.cells || []).length} merged block${(obj.cells || []).length === 1 ? '' : 's'}. To change it, select parts in World and choose Union Selected or Intersect Selected.</div>`) : ''}
                ${section('Rotation', `<div class="field-row">
                    ${numField('prop-rx', 'X', 'x', 'Rotation X in degrees', obj.rotX || 0, dis)}
                    ${numField('prop-ry', 'Y', 'y', 'Rotation Y in degrees', obj.rotY || 0, dis)}
                    ${numField('prop-rz', 'Z', 'z', 'Rotation Z in degrees', obj.rotZ || 0, dis)}
                </div>`)}
                ${section('Editor', `
                    ${nameField(obj, dis)}
                    <div class="switch-stack">
                    ${switchRow('prop-locked', 'Locked', obj.locked, '')}
                    ${obj.type === 'prism6' ? switchRow('prop-spawnpoint', 'Spawnpoint', !!obj.spawnpoint, (dis || (!obj.spawnpoint && spawnTaken(selectedObjectId))) ? 'disabled' : '') : ''}
                    ${switchRow('prop-face-coloring', 'Face coloring', obj.faceColoring, dis)}
                    ${switchRow('prop-labels', 'Face labels', obj.showLabels, dis)}
                    ${obj.type !== 'union' ? switchRow('prop-negated', 'Negated (subtract in a union)', !!obj.negated, dis) : ''}
                    </div>
                `)}
                ${section('Render', `
                    <div class="field-label">Color</div>
                    <div class="accent-ctl"><input type="color" class="color-pick" id="prop-color" value="${prismColor(obj)}" aria-label="Color" ${dis}><input class="text hex-in" id="prop-color-hex" maxlength="7" spellcheck="false" value="${prismColor(obj)}" aria-label="Color hex code" ${dis}></div>
                    ${obj.faceColoring ? '<div class="field-note">Face coloring is on, so each face uses its own color instead of this one.</div>' : ''}
                    ${switchRow('prop-wireframe', 'Wireframe', obj.wireframe, dis)}
                    ${obj.type !== 'ball' ? switchRow('prop-outline', 'Outline', obj.outline !== false, dis) : ''}
                `)}
                ${section('Simulation', `
                    ${switchRow('prop-physics', 'Reacts to physics', obj.reactsToPhysics, dis)}
                    ${switchRow('prop-collidable', 'Collidable', obj.collidable !== false, dis)}
                    ${switchRow('prop-anchored', 'Anchored', !!obj.anchored, dis)}
                `)}
            `;

            document.getElementById('prop-locked').addEventListener('change', (e) => { obj.locked = e.target.checked; renderProperties(); });
            const spawnEl = document.getElementById('prop-spawnpoint');
            if (spawnEl) spawnEl.addEventListener('change', (e) => { if (e.target.checked && spawnTaken(selectedObjectId)) { e.target.checked = false; return; } obj.spawnpoint = e.target.checked; renderProperties(); });

            if (!obj.locked) {
                bindName(obj);
                for (const [elId, key] of propFields) {
                    document.getElementById(elId).addEventListener('input', (e) => { obj[key] = parseFloat(e.target.value) || 0; });
                }
                document.getElementById('prop-face-coloring').addEventListener('change', (e) => { obj.faceColoring = e.target.checked; renderProperties(); });
                const colPick = document.getElementById('prop-color'), colHex = document.getElementById('prop-color-hex');
                colPick.addEventListener('input', () => { obj.color = colPick.value.toLowerCase(); colHex.value = obj.color; });
                colHex.addEventListener('change', () => {
                    let v = colHex.value.trim().replace(/^#/, '');
                    if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map(c => c + c).join('');
                    if (/^[0-9a-f]{6}$/i.test(v)) { obj.color = ('#' + v).toLowerCase(); colPick.value = obj.color; }
                    colHex.value = prismColor(obj);
                });
                document.getElementById('prop-labels').addEventListener('change', (e) => { obj.showLabels = e.target.checked; });
                const negEl = document.getElementById('prop-negated');
                if (negEl) negEl.addEventListener('change', (e) => { obj.negated = e.target.checked; });
                document.getElementById('prop-wireframe').addEventListener('change', (e) => { obj.wireframe = e.target.checked; });
                const outlineEl = document.getElementById('prop-outline');
                if (outlineEl) outlineEl.addEventListener('change', (e) => { obj.outline = e.target.checked; });
                document.getElementById('prop-physics').addEventListener('change', (e) => {
                    obj.reactsToPhysics = e.target.checked;
                    renderProperties();
                });
                document.getElementById('prop-collidable').addEventListener('change', (e) => { obj.collidable = e.target.checked; });
                document.getElementById('prop-anchored').addEventListener('change', (e) => {
                    obj.anchored = e.target.checked;
                    if (obj.anchored) physicsVelocity.set(selectedObjectId, { x: 0, y: 0, z: 0 });
                });
            }
        }

        // ───────── Modes ─────────
        const hintText = { select: 'Click an instance to select it', move: 'Drag an arrow to move', scale: 'Drag a sphere to resize', rotate: 'Drag an arc to rotate' };
        // The same tools act on the interface when it is being previewed, so the hint follows what will happen.
        function applyModeHint() {
            const o = sceneObjects[selectedObjectId];
            const ui = !simulationRunning && (selectedSpaceId === 'ui' || isUI(o) || (!settings.alwaysShowUI && uiContainers().length > 0));
            document.getElementById('hint-mode').textContent = !ui ? hintText[mode] : mode === 'move'
                ? 'Drag a UI element to move it'
                : mode === 'scale' ? 'Drag a UI corner to resize it'
                : mode === 'select' ? 'Click a UI element to select it' : hintText[mode];
        }
        function setMode(m) {
            mode = m;
            document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
            applyModeHint();
            hoverKey = null;
            canvas.style.cursor = '';
        }
        document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

        // ───────── Resize ─────────
        let width, height, cx, cy;
        function resize() {
            const container = document.getElementById('canvas-container');
            width = container.clientWidth;
            height = container.clientHeight;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            for (const c of [canvas, skyCanvas, glCanvas]) { c.width = Math.round(width * dpr); c.height = Math.round(height * dpr); }
            ctx.scale(dpr, dpr);
            skyCtx.scale(dpr, dpr);
            cx = width / 2; cy = height / 2;
        }
        resize();
        window.addEventListener('resize', resize);
        new ResizeObserver(resize).observe(document.getElementById('canvas-container'));
        setTimeout(resize, 0);
