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
        const defaultNames = { prism6: 'Block', ball: 'Ball', wedge: 'Wedge', cylinder: 'Cylinder', model: 'Model', script: 'Script', worldsettings: 'Settings', human: 'Player', sound: 'Sound', highlight: 'Highlight', light: 'Light', simpleeffect: 'SimpleEffect', advancedeffect: 'AdvancedEffect', frame: 'Frame', text: 'Text', button: 'Button', image: 'Image', input: 'Input', progressbar: 'ProgressBar' };
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
            if (o && (o.type === 'light' || isEffect(o))) {
                for (const [elId, key] of [['prop-x', 'x'], ['prop-y', 'y'], ['prop-z', 'z'], ['prop-rx', 'rotX'], ['prop-ry', 'rotY'], ['prop-rz', 'rotZ']]) {
                    const el = document.getElementById(elId);
                    if (el && document.activeElement !== el) el.value = Number.isFinite(o[key]) ? o[key] : 0;
                }
                return;
            }
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
                        <div class="field-label">Character</div>
                        <input class="text" value="${pm ? esc(pm.name) : 'None'}" aria-label="Character" disabled>
                        <div class="field-note">${obj.dead ? 'This player is dead and waiting for a new model. ' : ''}Players are read-only in the editor. Read the model in scripts with <code>player.Character</code> or wait for <code>player.ModelAdded</code>; give the player a model with Players.AssignModelToPlayer.</div>`)}`;
                return;
            }
            if (obj.readOnly) {
                container.innerHTML = `<div class="empty">${icon('i-lock')}<p>${esc(obj.name)}</p><span>This is an engine component and can’t be edited.</span></div>`;
                return;
            }

            if (isConnection(obj)) {
                if (!Array.isArray(obj.clients)) obj.clients = [];
                const players = Object.entries(sceneObjects).filter(([, p]) => p.type === 'player').map(([, p]) => p.name);
                const playerList = `<datalist id="prop-conn-players">${players.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
                const field = (id, label, value, max, note, placeholder, list) => `
                    <div class="field-label">${label}</div>
                    <input class="text" type="text" id="${id}" maxlength="${max}" spellcheck="false" value="${esc(value || '')}" placeholder="${placeholder ? esc(placeholder) : ''}"${list ? ` list="${list}"` : ''} aria-label="${label}">
                    ${note ? `<div class="field-note">${note}</div>` : ''}`;
                const numRow = (id, label, value, min, max, step, unit) => `
                    <div class="field-label">${label}</div>
                    <label class="num hnum"><input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"><span class="tag">${unit}</span></label>`;
                // A ClientSocket may be Uncapped, stored as 0 kbps; a ServerSocket always has a limit.
                const bandSection = (uncapped) => `
                    <div class="field-label">Bandwidth</div>
                    <label class="num hnum"><input type="number" id="prop-conn-bandwidth" min="${uncapped ? 0 : 1}" max="${CONNECTION_BANDWIDTH_MAX}" step="1" value="${obj.bandwidth}" aria-label="Bandwidth in kilobits per second"><span class="tag">kbps</span></label>
                    ${uncapped ? switchRow('prop-conn-uncapped', 'Uncapped', !(obj.bandwidth > 0), '') : ''}
                    <div class="field-note">${uncapped ? 'Uncapped means the socket is never throttled; 0 kbps is shown for it.' : 'The most this socket may send or receive. The default is 4096 kbps.'}</div>`;
                let body;
                if (obj.type === 'clientsocket') {
                    body = `
                        ${section('Editor', nameField(obj))}
                        ${section('Socket', `
                            ${switchRow('prop-conn-active', 'Active', obj.active !== false, '')}
                            ${bandSection(true)}
                        `)}
                        ${section('Addressing', `
                            ${field('prop-conn-client', 'Client', obj.client, 120, 'The client\u2019s IPv4 address. It is filled in when the socket connects.', '192.168.1.20')}
                            ${field('prop-conn-player', 'Player', obj.player, 48, 'The Player in Players this socket is addressed to.', 'Player1', 'prop-conn-players')}
                        `)}${playerList}`;
                } else if (obj.type === 'serversocket') {
                    body = `
                        ${section('Editor', nameField(obj))}
                        ${section('Socket', `
                            ${switchRow('prop-conn-active', 'Active', obj.active !== false, '')}
                            ${bandSection(false)}
                            ${numRow('prop-conn-maxclients', 'Max clients', obj.maxClients, 1, 100, 1, 'clients')}
                            <div class="field-note">Keep this at the world\u2019s max player count (${worldMaxPlayers()}).</div>
                            <button class="btn btn-outline" id="prop-conn-usemax" type="button" style="width:100%;justify-content:center;margin-top:8px">Use the world max (${worldMaxPlayers()})</button>
                        `)}`;
                } else if (obj.type === 'peerconnection') {
                    body = `
                        ${section('Editor', nameField(obj))}
                        ${section('Connection', `
                            ${switchRow('prop-conn-active', 'Active', obj.active !== false, '')}
                            ${field('prop-conn-password', 'Entry Password', obj.password, 64, 'The password the other peer needs to join this connection.', 'Password')}
                        `)}
                        ${section('Clients', `
                            ${field('prop-conn-client1', 'Client 1', obj.client1, 120, '', '192.168.1.20')}
                            ${field('prop-conn-client2', 'Client 2', obj.client2, 120, '', '192.168.1.21')}
                        `)}
                        ${section('Players', `
                            ${field('prop-conn-player1', 'Player 1', obj.player1, 48, 'The first Player in Players on this connection.', 'Player1', 'prop-conn-players')}
                            ${field('prop-conn-player2', 'Player 2', obj.player2, 48, 'The second Player in Players on this connection.', 'Player2', 'prop-conn-players')}
                        `)}`;
                } else {
                    const rows = obj.clients.map((c, i) => `
                        <div class="asset-row conn-row">
                            <input class="text" type="text" data-client="${i}" data-key="ip" maxlength="120" spellcheck="false" value="${esc(c.ip || '')}" placeholder="192.168.1.20" aria-label="Client ${i + 1} IPv4">
                            <input class="text" type="text" data-client="${i}" data-key="player" maxlength="48" value="${esc(c.player || '')}" placeholder="Player1" list="prop-conn-players" aria-label="Client ${i + 1} player">
                            <button class="btn icon-btn" type="button" data-remove-client="${i}" aria-label="Remove client ${i + 1}">${icon('i-trash')}</button>
                        </div>`).join('');
                    body = `
                        ${section('Editor', nameField(obj))}
                        ${section('Connection', `
                            ${switchRow('prop-conn-active', 'Active', obj.active !== false, '')}
                            ${field('prop-conn-password', 'Entry Password', obj.password, 64, 'The password every client needs to join.', 'Password')}
                        `)}
                        ${section('Clients', `
                            <div class="field-note" style="margin-top:0">Anyone with the password can join. There is no client limit; add each client\u2019s IPv4 and player below.</div>
                            <div class="asset-rows" id="prop-conn-clients">${rows || '<div class="asset-empty">No clients yet.</div>'}</div>
                            <button class="btn btn-outline" id="prop-conn-addclient" type="button" style="width:100%;justify-content:center;margin-top:8px">Add client</button>
                        `)}${playerList}`;
                }
                container.innerHTML = `${objHead(selectedObjectId, obj, typeIcon[obj.type])}${body}`;
                bindName(obj);
                document.getElementById('prop-conn-active').addEventListener('change', (e) => { obj.active = e.target.checked; });
                const bindText = (id, key) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.addEventListener('input', () => { obj[key] = el.value; });
                    el.addEventListener('change', () => { obj[key] = el.value.trim(); el.value = obj[key]; });
                };
                for (const key of ['client', 'player', 'client1', 'client2', 'player1', 'player2']) bindText('prop-conn-' + key, key);
                const pw = document.getElementById('prop-conn-password');
                if (pw) pw.addEventListener('input', () => { obj.password = pw.value; });
                const bw = document.getElementById('prop-conn-bandwidth');
                if (bw) {
                    bw.addEventListener('input', () => {
                        const v = parseFloat(bw.value);
                        if (Number.isFinite(v)) obj.bandwidth = Math.max(0, Math.min(CONNECTION_BANDWIDTH_MAX, Math.round(v)));
                    });
                    bw.addEventListener('change', () => { bw.value = obj.bandwidth; });
                }
                const unc = document.getElementById('prop-conn-uncapped');
                if (unc) unc.addEventListener('change', (e) => { obj.bandwidth = e.target.checked ? 0 : 4096; renderProperties(); });
                const mc = document.getElementById('prop-conn-maxclients');
                if (mc) {
                    const clampClients = () => Math.max(1, Math.min(100, Math.round(parseFloat(mc.value) || 1)));
                    mc.addEventListener('input', () => { if (Number.isFinite(parseFloat(mc.value))) obj.maxClients = clampClients(); });
                    mc.addEventListener('change', () => { obj.maxClients = clampClients(); mc.value = obj.maxClients; });
                    document.getElementById('prop-conn-usemax').addEventListener('click', () => { obj.maxClients = worldMaxPlayers(); renderProperties(); });
                }
                const clientList = document.getElementById('prop-conn-clients');
                if (clientList) {
                    clientList.addEventListener('input', (e) => {
                        const input = e.target.closest('[data-client]'); if (!input) return;
                        const c = obj.clients[Number(input.dataset.client)]; if (!c) return;
                        c[input.dataset.key] = input.value;
                    });
                    clientList.addEventListener('click', (e) => {
                        const btn = e.target.closest('[data-remove-client]'); if (!btn) return;
                        obj.clients.splice(Number(btn.dataset.removeClient), 1);
                        renderProperties();
                    });
                }
                const addClient = document.getElementById('prop-conn-addclient');
                if (addClient) addClient.addEventListener('click', () => { obj.clients.push({ ip: '', player: '' }); renderProperties(); });
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
                const defaultHuman = (() => {
                    const parent = sceneObjects[obj.parent];
                    return !!parent && parent.type === 'model' && parent.name === 'DefaultPlayer' && spaceOf(parent) === 'storage';
                })();
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
                        // The DefaultPlayer's Human is the world's default player: keep World Settings in step.
                        if (defaultHuman) {
                            const ws = activeWorldSettings();
                            if (ws) { ws.defaults = ws.defaults || {}; ws.defaults.player = ws.defaults.player || {}; ws.defaults.player[key] = obj[key]; }
                        }
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

            if (obj.type === 'light') {
                if (!LIGHT_TYPES.includes(obj.lightType)) obj.lightType = 'point';
                obj.brightness = Math.max(0, Math.min(8, Number.isFinite(obj.brightness) ? obj.brightness : 1.5));
                obj.range = Math.max(0.5, Math.min(100, Number.isFinite(obj.range) ? obj.range : 14));
                obj.angle = Math.max(5, Math.min(80, Number.isFinite(obj.angle) ? obj.angle : 45));
                const lc = HEX6.test(obj.color) ? obj.color : '#ffe3ad';
                const spot = obj.lightType === 'spot';
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-sun')}
                    ${section('Editor', nameField(obj))}
                    ${section('Position', `<div class="field-row">
                        ${numField('prop-x', 'X', 'x', 'X', obj.x, '')}
                        ${numField('prop-y', 'Y', 'y', 'Y', obj.y, '')}
                        ${numField('prop-z', 'Z', 'z', 'Z', obj.z, '')}
                    </div>`)}
                    ${spot ? section('Direction', `<div class="field-row">
                        ${numField('prop-rx', 'X', 'x', 'Rotation X in degrees', obj.rotX || 0, '')}
                        ${numField('prop-ry', 'Y', 'y', 'Rotation Y in degrees', obj.rotY || 0, '')}
                        ${numField('prop-rz', 'Z', 'z', 'Rotation Z in degrees', obj.rotZ || 0, '')}
                    </div><div class="field-note">A spot shines along its local +Z. The default rotation points it down.</div>`) : ''}
                    ${section('Light', `
                        <div class="field-label">Type</div>
                        <select class="text" id="prop-light-type" aria-label="Light type">${LIGHT_TYPES.map(k => `<option value="${k}"${obj.lightType === k ? ' selected' : ''}>${k === 'spot' ? 'Spot' : 'Point'}</option>`).join('')}</select>
                        ${switchRow('prop-light-enabled', 'Enabled', obj.enabled !== false, '')}
                        <div class="field-label">Color</div>
                        <div class="accent-ctl"><input type="color" class="color-pick" id="prop-light-color" value="${lc}" aria-label="Light color"><input class="text hex-in" id="prop-light-hex" maxlength="7" spellcheck="false" value="${lc}" aria-label="Light color hex code"></div>
                        <div class="field-label">Brightness</div>
                        <label class="num hnum"><input type="number" id="prop-light-brightness" min="0" max="8" step="0.1" value="${obj.brightness}" aria-label="Brightness"><span class="tag">×</span></label>
                        <div class="field-label">Range</div>
                        <label class="num hnum"><input type="number" id="prop-light-range" min="0.5" max="100" step="0.5" value="${obj.range}" aria-label="Range in meters"><span class="tag">m</span></label>
                        ${spot ? `<div class="field-label">Cone angle</div><label class="num hnum"><input type="number" id="prop-light-angle" min="5" max="80" step="1" value="${obj.angle}" aria-label="Cone angle in degrees"><span class="tag">°</span></label>` : ''}
                        ${switchRow('prop-light-shadows', 'Cast shadows', obj.castShadows !== false, '')}
                        <div class="field-note">Enhanced lighting only. Up to the 8 nearest lights are drawn; the nearest 2 shadow-casting lights get a map. Spots use a cone map and points use a six-face cube map.</div>
                    `)}`;
                bindName(obj);
                for (const [elId, key] of [['prop-x', 'x'], ['prop-y', 'y'], ['prop-z', 'z'], ['prop-rx', 'rotX'], ['prop-ry', 'rotY'], ['prop-rz', 'rotZ']]) {
                    const el = document.getElementById(elId);
                    if (el) el.addEventListener('input', (e) => { obj[key] = parseFloat(e.target.value) || 0; });
                }
                document.getElementById('prop-light-type').addEventListener('change', (e) => {
                    obj.lightType = e.target.value === 'spot' ? 'spot' : 'point';
                    renderProperties();
                });
                document.getElementById('prop-light-enabled').addEventListener('change', (e) => { obj.enabled = e.target.checked; });
                const lp = document.getElementById('prop-light-color'), lh = document.getElementById('prop-light-hex');
                lp.addEventListener('input', () => { obj.color = lp.value.toLowerCase(); lh.value = obj.color; });
                lh.addEventListener('change', () => {
                    let v = lh.value.trim().replace(/^#/, '');
                    if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map(c => c + c).join('');
                    if (/^[0-9a-f]{6}$/i.test(v)) { obj.color = ('#' + v).toLowerCase(); lp.value = obj.color; }
                    lh.value = HEX6.test(obj.color) ? obj.color : '#ffe3ad';
                });
                const bn = document.getElementById('prop-light-brightness');
                bn.addEventListener('input', () => { obj.brightness = Math.max(0, Math.min(8, parseFloat(bn.value) || 0)); });
                const rn = document.getElementById('prop-light-range');
                rn.addEventListener('input', () => { obj.range = Math.max(0.5, Math.min(100, parseFloat(rn.value) || 0.5)); });
                const an = document.getElementById('prop-light-angle');
                if (an) an.addEventListener('input', () => { obj.angle = Math.max(5, Math.min(80, parseFloat(an.value) || 5)); });
                const ls = document.getElementById('prop-light-shadows');
                if (ls) ls.addEventListener('change', (e) => { obj.castShadows = e.target.checked; });
                return;
            }

            if (isEffect(obj)) {
                normalizeEffect(obj);
                const id = selectedObjectId, simple = obj.type === 'simpleeffect';
                const parent = sceneObjects[obj.parent], childOf = parent && !SPACE_KEYS.includes(obj.parent);
                const cfg = effectConfig(obj);
                const n = (fid, label, value, min, max, step, unit) => `
                    <div class="field-label">${label}</div>
                    <label class="num hnum"><input type="number" id="${fid}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"><span class="tag">${unit}</span></label>`;
                const colorRow = (fid, label, value) => `
                    <div class="field-label">${label}</div>
                    <div class="accent-ctl"><input type="color" class="color-pick" id="${fid}-pick" value="${value}" aria-label="${label}"><input class="text hex-in" id="${fid}-hex" maxlength="7" spellcheck="false" value="${value}" aria-label="${label} hex code"></div>`;
                const simpleHtml = `
                    <div class="field-label">Preset</div>
                    <select class="text" id="prop-fx-preset" aria-label="Effect preset">${EFFECT_PRESET_ORDER.map(k => `<option value="${k}"${obj.preset === k ? ' selected' : ''}>${esc(EFFECT_PRESETS[k].name)}</option>`).join('')}</select>
                    <div class="field-note" id="prop-fx-note">${esc(effectPreset(obj).note)}</div>
                    ${switchRow('prop-fx-emitting', 'Emitting', obj.emitting !== false, '')}
                    ${n('prop-fx-rate', 'Rate', obj.rate, 0, 300, 1, '/s')}
                    ${n('prop-fx-speed', 'Speed', obj.speed, 0, 4, 0.05, '×')}
                    ${n('prop-fx-size', 'Size', obj.size, 0.05, 5, 0.05, '×')}
                    ${colorRow('prop-fx-color', 'Color', obj.color)}
                    <div class="field-row" style="margin-top:8px"><button class="btn btn-outline" id="prop-fx-play" type="button">Play</button><button class="btn btn-outline" id="prop-fx-stop" type="button">Stop</button></div>`;
                const advancedHtml = `
                    ${switchRow('prop-fx-emitting', 'Emitting', obj.emitting !== false, '')}
                    ${n('prop-fx-rate', 'Rate', obj.rate, 0, 300, 1, '/s')}
                    ${n('prop-fx-burst', 'Burst', obj.burst, 0, 300, 1, '')}
                    <div class="field-label">Emitter shape</div>
                    <select class="text" id="prop-fx-shape" aria-label="Emitter shape">${EFFECT_SHAPES.map(k => `<option value="${k}"${obj.shape === k ? ' selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select>
                    <div class="field-label">Space</div>
                    <select class="text" id="prop-fx-space" aria-label="Effect space">${EFFECT_SPACES.map(k => `<option value="${k}"${obj.space === k ? ' selected' : ''}>${k === 'local' ? 'Local (follows parent)' : 'World'}</option>`).join('')}</select>
                    ${n('prop-fx-radius', 'Emitter size', obj.radius, 0.01, 50, 0.05, 'm')}
                    <div class="field-label">Image (world asset name or URL)</div>
                    <input class="text" type="text" id="prop-fx-image" maxlength="400" value="${esc(obj.image || '')}" placeholder="Built-in sprite" aria-label="Effect image">
                    ${n('prop-fx-frames', 'Frames', obj.frames, 1, 64, 1, '')}
                    ${n('prop-fx-fps', 'Frame rate', obj.fps, 1, 60, 1, 'fps')}
                    <div class="field-label">Blend</div>
                    <select class="text" id="prop-fx-blend" aria-label="Blend mode">${EFFECT_BLENDS.map(k => `<option value="${k}"${obj.blend === k ? ' selected' : ''}>${k === 'additive' ? 'Additive' : 'Alpha'}</option>`).join('')}</select>
                    <div class="field-label">Sprite</div>
                    <select class="text" id="prop-fx-sprite" aria-label="Sprite">${EFFECT_SPRITES.map(k => `<option value="${k}"${obj.sprite === k ? ' selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select>
                    ${n('prop-fx-life', 'Lifetime', obj.lifetime, 0.05, 20, 0.05, 's')}
                    ${n('prop-fx-size-start', 'Start size', obj.sizeStart, 0.01, 10, 0.05, 'm')}
                    ${n('prop-fx-size-end', 'End size', obj.sizeEnd, 0.01, 10, 0.05, 'm')}
                    ${n('prop-fx-speed', 'Speed', obj.speed, 0, 30, 0.1, 'm/s')}
                    ${n('prop-fx-spread', 'Spread', obj.spread, 0, 180, 1, '°')}
                    ${n('prop-fx-gravity', 'Gravity', obj.gravity, -50, 50, 0.1, 'm/s²')}
                    ${n('prop-fx-drag', 'Drag', obj.drag, 0, 10, 0.05, '')}
                    ${n('prop-fx-rotation', 'Spin', obj.rotation, 0, 720, 1, '°/s')}
                    ${colorRow('prop-fx-color-start', 'Start color', cfg.colorStart)}
                    ${colorRow('prop-fx-color-end', 'End color', cfg.colorEnd)}
                    ${n('prop-fx-fade-in', 'Fade in', obj.fadeIn, 0, 1, 0.01, '')}
                    ${n('prop-fx-fade-out', 'Fade out', obj.fadeOut, 0, 1, 0.01, '')}
                    <div class="field-row" style="margin-top:8px"><button class="btn btn-outline" id="prop-fx-play" type="button">Play</button><button class="btn btn-outline" id="prop-fx-stop" type="button">Stop</button><button class="btn btn-outline" id="prop-fx-emit" type="button">Emit burst</button></div>`;
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-highlight')}
                    ${section('Editor', nameField(obj))}
                    ${section('Position', `<div class="field-row">
                        ${numField('prop-x', 'X', 'x', 'X', obj.x, '')}
                        ${numField('prop-y', 'Y', 'y', 'Y', obj.y, '')}
                        ${numField('prop-z', 'Z', 'z', 'Z', obj.z, '')}
                    </div><div class="field-note">${childOf ? 'Position is an offset from ' + esc(parent.name) + '. The effect follows that parent; Local particles turn with it.' : 'Position in the world. Set Space to Local and put the effect inside a shape or model to have it follow.'}</div>`)}
                    ${section(simple ? 'Effect' : 'Emitter', simple ? simpleHtml : advancedHtml)}
                    <div class="sec-body"><div class="field-note">Effects animate in the editor and while the simulation runs. SimpleEffect presets are ready to use; AdvancedEffect uses a horizontal sprite sheet when an image is set.</div></div>`;
                bindName(obj);
                for (const [elId, key] of [['prop-x', 'x'], ['prop-y', 'y'], ['prop-z', 'z']]) {
                    document.getElementById(elId).addEventListener('input', (e) => { obj[key] = parseFloat(e.target.value) || 0; });
                }
                document.getElementById('prop-fx-emitting').addEventListener('change', (e) => { obj.emitting = e.target.checked; });
                document.getElementById('prop-fx-play').addEventListener('click', () => { effectPlay(id); renderProperties(); });
                document.getElementById('prop-fx-stop').addEventListener('click', () => { effectStop(id); renderProperties(); });
                const numBind = (fid, key, min, max, integer) => {
                    const el = document.getElementById(fid); if (!el) return;
                    el.addEventListener('input', () => {
                        let v = parseFloat(el.value); if (!Number.isFinite(v)) return;
                        v = Math.max(min, Math.min(max, v)); obj[key] = integer ? Math.round(v) : v;
                    });
                };
                numBind('prop-fx-rate', 'rate', 0, 300, false);
                numBind('prop-fx-speed', 'speed', 0, 30, false);
                if (document.getElementById('prop-fx-size')) numBind('prop-fx-size', 'size', 0.05, 5, false);
                const simplePick = document.getElementById('prop-fx-color-pick');
                if (simplePick) {
                    simplePick.addEventListener('input', (e) => { obj.color = e.target.value; document.getElementById('prop-fx-color-hex').value = obj.color; });
                    document.getElementById('prop-fx-color-hex').addEventListener('change', (e) => { let v = e.target.value.trim().replace(/^#/, ''); if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map(c => c + c).join(''); if (/^[0-9a-f]{6}$/i.test(v)) { obj.color = ('#' + v).toLowerCase(); simplePick.value = obj.color; } e.target.value = obj.color; });
                }
                if (document.getElementById('prop-fx-preset')) document.getElementById('prop-fx-preset').addEventListener('change', (e) => {
                    if (!EFFECT_KEYS.has(e.target.value)) return;
                    obj.preset = e.target.value; obj.color = effectPreset(obj).colorStart;
                    effectPlay(id);
                    renderProperties();
                });
                if (simple) return;
                const selectBind = (fid, key, allowed) => { const el = document.getElementById(fid); if (el) el.addEventListener('change', (e) => { if (allowed.includes(e.target.value)) obj[key] = e.target.value; }); };
                selectBind('prop-fx-shape', 'shape', EFFECT_SHAPES); selectBind('prop-fx-space', 'space', EFFECT_SPACES);
                selectBind('prop-fx-blend', 'blend', EFFECT_BLENDS); selectBind('prop-fx-sprite', 'sprite', EFFECT_SPRITES);
                numBind('prop-fx-burst', 'burst', 0, 300, true); numBind('prop-fx-radius', 'radius', 0.01, 50, false);
                numBind('prop-fx-frames', 'frames', 1, 64, true); numBind('prop-fx-fps', 'fps', 1, 60, true);
                numBind('prop-fx-life', 'lifetime', 0.05, 20, false); numBind('prop-fx-size-start', 'sizeStart', 0.01, 10, false);
                numBind('prop-fx-size-end', 'sizeEnd', 0.01, 10, false); numBind('prop-fx-spread', 'spread', 0, 180, false);
                numBind('prop-fx-gravity', 'gravity', -50, 50, false); numBind('prop-fx-drag', 'drag', 0, 10, false);
                numBind('prop-fx-rotation', 'rotation', 0, 720, false); numBind('prop-fx-fade-in', 'fadeIn', 0, 1, false);
                numBind('prop-fx-fade-out', 'fadeOut', 0, 1, false);
                document.getElementById('prop-fx-image').addEventListener('input', (e) => { obj.image = e.target.value; });
                const bindColor = (fid, key) => {
                    const pick = document.getElementById(fid + '-pick'), hex = document.getElementById(fid + '-hex');
                    pick.addEventListener('input', () => { obj[key] = pick.value; hex.value = pick.value; });
                    hex.addEventListener('change', () => { let v = hex.value.trim().replace(/^#/, ''); if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map(c => c + c).join(''); if (/^[0-9a-f]{6}$/i.test(v)) { obj[key] = ('#' + v).toLowerCase(); pick.value = obj[key]; } hex.value = obj[key]; });
                };
                bindColor('prop-fx-color-start', 'colorStart'); bindColor('prop-fx-color-end', 'colorEnd');
                document.getElementById('prop-fx-emit').addEventListener('click', () => { effectEmit(id, Math.max(1, obj.burst || 20)); });
                return;
            }

            if (obj.type === 'sound') {
                normalizeSound(obj);
                const parent = sceneObjects[obj.parent];
                const isChild = parent && !SPACE_KEYS.includes(obj.parent);
                const id = selectedObjectId;
                const sources = soundSourceOptions(obj.source);
                const audioAssets = activeWorldSettings() && Array.isArray(activeWorldSettings().assets)
                    ? activeWorldSettings().assets.filter(a => a && a.url && (/^audio\//i.test(a.type || '') || /^data:audio\//i.test(a.url || ''))).length : 0;
                container.innerHTML = `
                    ${objHead(selectedObjectId, obj, 'i-sound')}
                    ${section('Editor', nameField(obj))}
                    ${section('Playback', `
                        <div class="field-label">Sound</div>
                        <select class="text" id="prop-sound-source" aria-label="Sound source">${sources.map(o => `<option value="${esc(o.value)}"${obj.source === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
                        <div class="field-note">${audioAssets ? 'Uploaded audio files appear here from World Settings → Assets.' : 'Upload an audio file in World Settings → Assets to use your own sound.'}</div>
                        <div class="switch-stack">
                        ${switchRow('prop-sound-playing', 'Playing', !!obj.playing, '')}
                        ${switchRow('prop-sound-looped', 'Looped', !!obj.looped, '')}
                        ${switchRow('prop-sound-spatial', '3D sound', obj.spatial !== false, '')}
                        </div>
                        <div class="field-label">Volume</div>
                        <div class="tod-row">
                            <input type="range" class="tod" id="prop-sound-volume" min="0" max="1" step="0.01" value="${obj.volume}" aria-label="Volume">
                            <span class="field-note" id="prop-sound-volume-note" style="margin:0;min-width:44px;text-align:right">${Math.round(obj.volume * 100)}%</span>
                        </div>
                        <div class="field-label">Pitch</div>
                        <div class="tod-row">
                            <input type="range" class="tod" id="prop-sound-pitch" min="0.25" max="4" step="0.01" value="${obj.pitch}" aria-label="Pitch">
                            <span class="field-note" id="prop-sound-pitch-note" style="margin:0;min-width:44px;text-align:right">${obj.pitch.toFixed(2)}×</span>
                        </div>
                        <div class="field-label">Rolloff</div>
                        <div class="tod-row">
                            <input type="range" class="tod" id="prop-sound-rolloff" min="0" max="4" step="0.05" value="${obj.rolloff}" aria-label="Distance rolloff">
                            <span class="field-note" id="prop-sound-rolloff-note" style="margin:0;min-width:44px;text-align:right">${obj.rolloff.toFixed(2)}×</span>
                        </div>
                        <div class="field-label">Max distance</div>
                        <div class="tod-row">
                            <input type="range" class="tod" id="prop-sound-distance" min="0" max="200" step="1" value="${Math.min(200, obj.maxDistance)}" aria-label="Max distance">
                            <label class="num" title="Max distance in meters"><input type="number" id="prop-sound-distance-num" min="0" step="1" value="${obj.maxDistance}" aria-label="Max distance in meters"><span class="tag">m</span></label>
                        </div>
                        <div class="field-note">${obj.spatial === false ? '3D sound is off, so this plays at the same volume everywhere.' : (isChild ? 'Heard from ' + esc(parent.name) + ', with HRTF panning and distance rolloff.' : 'Put the Sound inside an object for 3D panning. A sound straight in a Space plays at the same volume everywhere.')}</div>
                    `)}`;
                bindName(obj);
                const restart = () => { if (obj.playing) startSound(id); };
                document.getElementById('prop-sound-source').addEventListener('change', (e) => {
                    obj.source = e.target.value;
                    normalizeSound(obj);
                    restart();
                });
                document.getElementById('prop-sound-playing').addEventListener('change', (e) => {
                    obj.playing = e.target.checked;
                    if (obj.playing) startSound(id); else stopSound(id);
                });
                document.getElementById('prop-sound-looped').addEventListener('change', (e) => {
                    obj.looped = e.target.checked;
                    restart();
                });
                document.getElementById('prop-sound-spatial').addEventListener('change', (e) => { obj.spatial = e.target.checked; restart(); });
                const volEl = document.getElementById('prop-sound-volume'), volNote = document.getElementById('prop-sound-volume-note');
                volEl.addEventListener('input', () => {
                    obj.volume = Math.max(0, Math.min(1, parseFloat(volEl.value) || 0));
                    volNote.textContent = Math.round(obj.volume * 100) + '%';
                });
                const pitchEl = document.getElementById('prop-sound-pitch'), pitchNote = document.getElementById('prop-sound-pitch-note');
                pitchEl.addEventListener('input', () => {
                    obj.pitch = Math.max(0.25, Math.min(4, parseFloat(pitchEl.value) || 1));
                    pitchNote.textContent = obj.pitch.toFixed(2) + '×';
                });
                pitchEl.addEventListener('change', restart);
                const rollEl = document.getElementById('prop-sound-rolloff'), rollNote = document.getElementById('prop-sound-rolloff-note');
                rollEl.addEventListener('input', () => {
                    obj.rolloff = Math.max(0, Math.min(4, parseFloat(rollEl.value) || 0));
                    rollNote.textContent = obj.rolloff.toFixed(2) + '×';
                });
                rollEl.addEventListener('change', restart);
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
                ${obj.type === 'union' ? section('Union', `<div class="field-note">One real surface: its outline follows the creases of the shape, and cut-out parts stay hollow. Its ${(obj.cells || []).length} collision cell${(obj.cells || []).length === 1 ? '' : 's'} decide where the player and falling bodies are blocked, so a hole through it is a hole for both. To change it, select parts in World and choose Union Selected or Intersect Selected.</div>`) : ''}
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
                    <div class="field-label">Material</div>
                    <select class="text" id="prop-material" aria-label="Material" ${dis}>${MATERIAL_ORDER.map(k => `<option value="${k}"${materialKey(obj) === k ? ' selected' : ''}>${esc(MATERIALS[k].name)}</option>`).join('')}</select>
                    <div class="field-note" id="prop-material-note">${esc(materialDef(obj).note)}</div>
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
                document.getElementById('prop-material').addEventListener('change', (e) => {
                    obj.material = MATERIAL_KEYS.has(e.target.value) ? e.target.value : 'plastic';
                    document.getElementById('prop-material-note').textContent = materialDef(obj).note;
                });
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
            markUISceneChanged();
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
            // The graphics preset picks the drawing resolution: a cap on the device pixel ratio times a render scale.
            // Low presets draw fewer pixels, higher presets draw more than the screen for a sharper image.
            const dpr = Math.max(0.5, Math.min(3,
                Math.min(window.devicePixelRatio || 1, Number(settings.dprCap) || 2) * (Number(settings.renderScale) || 1)));
            const setSize = (c, ratio) => {
                const cw = Math.round(width * ratio), ch = Math.round(height * ratio);
                // Only touch a canvas when its size changes: assigning width clears it and costs an allocation.
                if (c.width !== cw) c.width = cw;
                if (c.height !== ch) c.height = ch;
            };
            setSize(skyCanvas, dpr); setSize(glCanvas, dpr);
            // The 2D canvas carries the editor's own outlines and guides, so it keeps the screen's resolution even when
            // a low preset draws the scene itself smaller.
            const uiDpr = Math.min(window.devicePixelRatio || 1, 2);
            setSize(canvas, uiDpr);
            ctx.setTransform(uiDpr, 0, 0, uiDpr, 0, 0);
            skyCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            cx = width / 2; cy = height / 2;
        }
        resize();
        window.addEventListener('resize', resize);
        new ResizeObserver(resize).observe(document.getElementById('canvas-container'));
        setTimeout(resize, 0);
