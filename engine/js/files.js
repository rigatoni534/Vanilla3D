// Vanilla Engine — world saves, imports and update checks. Loaded in order by index.html; all files share one global scope.
        // ───────── Vanilla World (.vnw) save/import ─────────
        const VN_WORLD_SAVE_KEY = 'vanilla-engine-world-save-v1';   // the one browser save from before save slots
        // Browser saves: an autosave plus two slots you save into by hand. Anything else is a .vnw file on your computer.
        const SAVE_SLOTS = [
            { id: 'autosave', label: 'Autosave', key: 'vanilla-engine-slot-autosave-v1' },
            { id: 'slot1', label: 'Browser Slot 1', key: 'vanilla-engine-slot-1-v1' },
            { id: 'slot2', label: 'Browser Slot 2', key: 'vanilla-engine-slot-2-v1' },
        ];
        const slotOf = (id) => SAVE_SLOTS.find(s => s.id === id) || null;
        const VN_RELOAD_RESTORE_KEY = 'vanilla-engine-reload-restore';
        // What a save can include. Settings > What gets saved switches these off one by one.
        const SAVED_SPACES = [['world', 'World'], ['storage', 'Storage'], ['scripts', 'Scripts'], ['ui', 'UI'], ['communications', 'Communications']];
        const SAVED_TYPES = [['prism6', 'Blocks'], ['ball', 'Balls'], ['wedge', 'Wedges'], ['cylinder', 'Cylinders'], ['union', 'Unions'], ['model', 'Models'], ['human', 'Humans'], ['script', 'Script instances'], ['worldsettings', 'World Settings'], ['texture', 'Textures'], ['sound', 'Sounds'], ['highlight', 'Highlights'], ['frame', 'UI frames'], ['text', 'UI text'], ['button', 'UI buttons'], ['image', 'UI images'], ['input', 'UI inputs']];
        for (const [id] of SAVED_SPACES) document.getElementById('sv-' + id).addEventListener('change', (e) => { settings.saveWhat[id] = e.target.checked; saveSettings(); });
        for (const [t] of SAVED_TYPES) document.getElementById('sv-' + t).addEventListener('change', (e) => { settings.saveWhat.types[t] = e.target.checked; saveSettings(); });
        // The single browser save older versions wrote becomes Browser Slot 1, so nothing is lost.
        try { const legacy = localStorage.getItem(VN_WORLD_SAVE_KEY); if (legacy && !localStorage.getItem(SAVE_SLOTS[1].key)) localStorage.setItem(SAVE_SLOTS[1].key, legacy); } catch (e) {}
        const fileBtn = document.getElementById('file-btn');
        const fileMenu = document.getElementById('file-menu');
        const fileStatus = document.getElementById('file-status');
        const vnwInput = document.getElementById('vnw-file-input');
        const vanillaInput = document.getElementById('vanilla-file-input');
        const SPACE_IDS = ['world', 'storage', 'scripts', 'ui', 'communications'];
        function toast(msg, kind) {
            const el = document.createElement('div');
            el.className = 'toast ' + (kind || '');
            el.innerHTML = icon(kind === 'bad' ? 'i-err' : kind === 'warn' ? 'i-warn' : 'i-check') + '<span>' + esc(msg) + '</span>';
            document.getElementById('toast-host').appendChild(el);
            setTimeout(() => el.remove(), 3200);
        }
        let askEl = null;
        function clearAsk() { if (askEl) { askEl.remove(); askEl = null; } }
        function askToast(text, yesLabel, noLabel, onYes) {
            clearAsk();
            const el = document.createElement('div');
            el.className = 'toast ask'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', text);
            el.innerHTML = icon('i-info') + '<span>' + esc(text) + '</span><div class="ask-actions"><button type="button" class="btn btn-outline" data-ask="no">' + esc(noLabel) + '</button><button type="button" class="btn btn-primary" data-ask="yes">' + esc(yesLabel) + '</button></div>';
            el.querySelector('[data-ask="no"]').addEventListener('click', clearAsk);
            el.querySelector('[data-ask="yes"]').addEventListener('click', () => { if (simulationRunning) { toast('Stop the simulation first. Stop restores your world.', 'warn'); return; } clearAsk(); onYes(); });
            document.getElementById('toast-host').appendChild(el);
            askEl = el;
        }
        function createPlate() {
            const id = newId();
            sceneObjects[id] = makePrism('Plate', 'world', { x: 0, y: -1, z: 0, length: 100, width: 100, height: 1, anchored: true });
            sceneObjects[newId()] = makeTexture(dn('texture'), id, [4], 'grid');
            counters.prism++; counters.texture++;
            uiDirty = true; renderExplorer();
            toast('Plate created.');
        }
        // The controls hint hides itself 10 seconds after the editor opens.
        setTimeout(() => { const h = document.getElementById('hint'); h.dataset.elapsed = '1'; if (settings.hintMode === 'auto') h.classList.add('dismissed'); }, 10000);
        // Worlds saved before players existed are offered the default player setup. Nothing changes unless the person agrees.
        async function maybeOfferPlayerSetup(data) {
            const major = parseInt(String(data.engineVersion || '0').split('.')[0], 10) || 0;
            if (major >= 3) return;
            const objs = data.objects, entries = Object.entries(objs);
            const hasScript = entries.some(([, o]) => o && o.type === 'script' && o.name === 'PlayerManagement');
            const modelEntry = entries.find(([, o]) => o && o.type === 'model' && o.name === 'DefaultPlayer');
            const hasHuman = (mid) => entries.some(([, o]) => o && o.type === 'human' && o.parent === mid);
            if (hasScript && modelEntry && modelEntry[1].parent === 'storage' && hasHuman(modelEntry[0])) return;
            const what = modelEntry ? 'This moves the DefaultPlayer model into Storage and adds a Human inside it' : 'This adds a DefaultPlayer model to Storage with a Human inside it';
            const text = 'This world was made before players existed. ' + what + (hasScript ? '' : ', and adds the PlayerManagement script that gives every player a model') + '. Choose Cancel to open the world without it.';
            if (!(await confirmDialog('Add the player setup?', text, 'Add', false))) return;
            const used = new Set(Object.keys(objs));
            const gen = () => { let id; do { id = newId(); } while (used.has(id)); used.add(id); return id; };
            if (modelEntry) {
                if (modelEntry[1].parent === 'world') modelEntry[1].parent = 'storage';
                if (!hasHuman(modelEntry[0])) objs[gen()] = makeHuman(dn('human') + 1, modelEntry[0]);
            }
            for (const [id, o] of makePlayerSetup(gen)) {
                if (o.type === 'script' ? hasScript : !!modelEntry) continue;
                objs[id] = o;
            }
        }
        function confirmDialog(title, text, okLabel, danger) {
            return new Promise(resolve => {
                const ov = document.getElementById('confirm-overlay'), ok = document.getElementById('cf-ok'), no = document.getElementById('cf-cancel');
                document.getElementById('cf-title').textContent = title;
                document.getElementById('cf-text').textContent = text;
                ok.textContent = okLabel; ok.classList.toggle('danger', !!danger);
                const prev = document.activeElement;
                const done = (v) => { ov.classList.remove('active'); ok.onclick = no.onclick = null; document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); resolve(v); };
                const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } };
                ok.onclick = () => done(true); no.onclick = () => done(false);
                ov.onmousedown = (e) => { if (e.target === ov) done(false); };
                document.addEventListener('keydown', onKey, true);
                ov.classList.add('active'); no.focus();
            });
        }
        function readSlot(id) { const s = slotOf(id); if (!s) return null; try { return JSON.parse(localStorage.getItem(s.key) || 'null'); } catch (e) { return null; } }
        function writeSlot(id, json) { const s = slotOf(id); if (!s) return false; try { localStorage.setItem(s.key, json); return true; } catch (e) { return false; } }
        function slotTime(id) {
            const saved = readSlot(id);
            if (!saved || !saved.savedAt) return '';
            const d = new Date(saved.savedAt);
            return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }
        function refreshFileStatus() {
            const stamps = [];
            for (const s of SAVE_SLOTS) {
                const saved = readSlot(s.id), when = slotTime(s.id);
                fileMenu.querySelectorAll('[data-slot="' + s.id + '"]').forEach(el => el.textContent = when || 'empty');
                fileMenu.querySelectorAll('[data-file-act="open-' + s.id + '"]').forEach(el => el.disabled = !saved);
                stamps.push(s.label + ': ' + (when || 'empty'));
            }
            fileStatus.textContent = stamps.join('  ·  ');
        }
        function toggleFileMenu(force) {
            const show = typeof force === 'boolean' ? force : fileMenu.hidden;
            if (show) refreshFileStatus();
            fileMenu.hidden = !show;
            fileBtn.setAttribute('aria-expanded', String(show));
            if (show) fileMenu.querySelector('.menu-item:not(:disabled)').focus();
        }
        // Which spaces and instance types a save takes, from Settings > What gets saved.
        function saveIncludes() {
            const w = settings.saveWhat && typeof settings.saveWhat === 'object' ? settings.saveWhat : {};
            const types = w.types && typeof w.types === 'object' ? w.types : {};
            const spaces = {}, keepTypes = {};
            for (const [id] of SAVED_SPACES) spaces[id] = w[id] !== false;
            for (const [t] of SAVED_TYPES) keepTypes[t] = types[t] !== false;
            return { spaces, types: keepTypes };
        }
        function buildWorldFile() {
            const inc = saveIncludes(), objects = {};
            const allowed = new Map();
            // An object is only saved if its space, its type and its whole parent chain are included.
            const included = (uid, depth = 0) => {
                if (allowed.has(uid)) return allowed.get(uid);
                const obj = sceneObjects[uid];
                let keep = false;
                if (obj && depth < 64) {
                    const sp = spaceOf(obj);
                    keep = SPACE_IDS.includes(sp) && !!inc.spaces[sp] && !!inc.types[obj.type];
                    // A child can only be saved if everything it sits inside is saved too, or the file would not load.
                    if (keep && !SPACE_IDS.includes(obj.parent)) keep = included(obj.parent, depth + 1);
                }
                allowed.set(uid, keep);
                return keep;
            };
            for (const [uid, obj] of Object.entries(sceneObjects)) if (SPACE_IDS.includes(spaceOf(obj)) && included(uid)) objects[uid] = JSON.parse(JSON.stringify(obj));
            return { format: 'VanillaWorld', formatVersion: 1, engineVersion: ENGINE_VERSION, savedAt: new Date().toISOString(), spaces: SPACE_IDS, objects };
        }
        // Engine-owned objects (the Viewfinder) are built in and never come from a file: strip them, and re-key any file object that reuses an engine UID.
        function sanitizeWorldFile(data) {
            const objs = data.objects, isEngineObj = (o) => !o || o.type === 'viewfinder' || o.readOnly || o.parent === 'engine';
            for (const uid of Object.keys(objs)) if (isEngineObj(objs[uid])) delete objs[uid];
            const engineIds = new Set(Object.entries(sceneObjects).filter(([, o]) => o.parent === 'engine' || o.readOnly).map(([k]) => k));
            const remap = {};
            for (const uid of Object.keys(objs)) if (engineIds.has(uid)) {
                let nid; do { nid = newId(); } while (objs[nid] || engineIds.has(nid));
                remap[uid] = nid;
            }
            for (const [old, nid] of Object.entries(remap)) { objs[nid] = objs[old]; delete objs[old]; }
            for (const o of Object.values(objs)) {
                if (remap[o.parent]) o.parent = remap[o.parent];
                if (o && typeof o === 'object' && !SPACE_IDS.includes(o.parent) && !objs[o.parent]) o.parent = UI_TYPES.includes(o.type) ? 'ui' : 'world'; // parent was removed: fall back to its space
            }
        }
        function validateWorldFile(data) {
            if (!data || data.format !== 'VanillaWorld' || data.formatVersion !== 1 || !data.objects || typeof data.objects !== 'object' || Array.isArray(data.objects)) throw new Error('This is not a supported .vnw Vanilla World file.');
            sanitizeWorldFile(data);
            { let spawnSeen = false; for (const o of Object.values(data.objects)) { if (!o || typeof o !== 'object') continue; if (o.type === 'prism6' && o.spawnpoint === true && !spawnSeen) spawnSeen = true; else if (o.spawnpoint !== undefined) delete o.spawnpoint; } }
            for (const [uid, obj] of Object.entries(data.objects)) {
                if (!/^[A-Za-z][A-Za-z0-9]*$/.test(uid) || !obj || typeof obj !== 'object' || !(SPACE_IDS.includes(obj.parent) || (data.objects[obj.parent] && obj.parent !== uid))) throw new Error('The file contains an invalid object or UID: ' + uid);
                if (!['prism6', 'ball', 'wedge', 'cylinder', 'union', 'model', 'worldsettings', 'script', 'texture', 'human', 'sound', 'highlight'].concat(UI_TYPES).includes(obj.type)) throw new Error('Unsupported object type for UID ' + uid + '.');
                // The interface and the 3D world are separate trees.
                if (UI_TYPES.includes(obj.type)) {
                    const parent = data.objects[obj.parent];
                    if (obj.parent !== 'ui' && !(parent && UI_TYPES.includes(parent.type))) throw new Error('UI instance ' + uid + ' must sit in the UI space or inside another UI instance.');
                } else if (obj.parent === 'ui') throw new Error(uid + ' is not a UI instance, so it cannot sit in the UI space.');
            }
            for (const [uid, obj] of Object.entries(data.objects)) { let p = obj, n = 0; while (p && !SPACE_IDS.includes(p.parent) && n++ < 64) p = data.objects[p.parent]; if (!p) throw new Error('Object ' + uid + ' has a circular parent chain.'); }
            return data;
        }
        // The type counters decide the default names (Block, Block2, ...), so they are rebuilt whenever objects change.
        const COUNTER_TYPES = [['prism', 'prism6'], ['model', 'model'], ['script', 'script'], ['worldsettings', 'worldsettings'], ['texture', 'texture'], ['ball', 'ball'], ['human', 'human'], ['wedge', 'wedge'], ['cylinder', 'cylinder'], ['union', 'union'], ['sound', 'sound'], ['highlight', 'highlight'], ['frame', 'frame'], ['text', 'text'], ['button', 'button'], ['image', 'image'], ['input', 'input']];
        function recountTypes() {
            for (const [k] of COUNTER_TYPES) counters[k] = 0;
            for (const o of Object.values(sceneObjects)) { const hit = COUNTER_TYPES.find(c => c[1] === o.type); if (hit) counters[hit[0]]++; }
        }
        function applyWorldFile(raw) {
            const data = validateWorldFile(raw);
            clearAsk();
            for (const [uid, obj] of Object.entries(sceneObjects)) if (SPACE_IDS.includes(spaceOf(obj))) delete sceneObjects[uid];
            for (const [uid, obj] of Object.entries(data.objects)) {
                if (obj.type === 'script') {
                    if (obj.scriptType !== 'Local' && obj.scriptType !== 'Server') {
                        const parent = data.objects[obj.parent];
                        obj.scriptType = parent && UI_TYPES.includes(parent.type) ? 'Local' : 'Server';
                    }
                    if (!['simulation', 'join', 'manual'].includes(obj.runWhen)) obj.runWhen = 'simulation';
                    if (obj.language !== 'vanillalua' && obj.language !== 'json') obj.language = 'vanillalua';
                    if (typeof obj.source !== 'string') obj.source = '';
                }
                if (obj.type === 'human') {
                    for (const k of Object.keys(HUMAN_DEFAULTS)) if (!Number.isFinite(obj[k]) || obj[k] < 0) obj[k] = HUMAN_DEFAULTS[k];
                    if (typeof obj.playerName !== 'string' || !obj.playerName) obj.playerName = (typeof obj.name === 'string' && obj.name && obj.name !== 'Human') ? obj.name : 'Player1';
                    obj.name = 'Human';
                }
                if (isShape(obj) && !HEX6.test(obj.color)) obj.color = '#888888';
                if (isShape(obj)) for (const k of ['rotX', 'rotY', 'rotZ']) if (!Number.isFinite(obj[k])) obj[k] = 0;
                if (obj.type === 'texture') {
                    obj.faces = Array.isArray(obj.faces) ? [...new Set(obj.faces.filter(i => Number.isInteger(i) && i >= 0 && i < 6))] : [4];
                    if (!TEXTURES[obj.texture]) obj.texture = 'grid';
                }
                if (obj.type === 'sound') {
                    if (!SOUND_PRESETS[obj.preset]) obj.preset = 'beep';
                    obj.playing = !!obj.playing;
                    obj.looped = !!obj.looped;
                    obj.volume = Math.max(0, Math.min(1, Number.isFinite(obj.volume) ? obj.volume : 0.6));
                    obj.maxDistance = Number.isFinite(obj.maxDistance) && obj.maxDistance >= 0 ? obj.maxDistance : 20;
                }
                if (obj.type === 'highlight') {
                    if (!HEX6.test(obj.color)) obj.color = '#ffd23f';
                    obj.overObjects = obj.overObjects !== false;
                }
                if (isUI(obj)) {
                    obj.posX = uiClamp(obj.posX, 0, 100); obj.posY = uiClamp(obj.posY, 0, 100);
                    obj.sizeX = uiClamp(obj.sizeX, 1, 100); obj.sizeY = uiClamp(obj.sizeY, 1, 100);
                    obj.transparency = uiClamp(obj.transparency, 0, 1);
                    if (!HEX6.test(obj.color)) obj.color = '#1c2230';
                    if (!HEX6.test(obj.textColor)) obj.textColor = '#ffffff';
                    if (!HEX6.test(obj.borderColor)) obj.borderColor = '#000000';
                    if (typeof obj.text !== 'string') obj.text = '';
                    if (typeof obj.image !== 'string') obj.image = '';
                    if (typeof obj.placeholder !== 'string') obj.placeholder = '';
                    if (!UI_ALIGNS.includes(obj.align)) obj.align = 'Center';
                    if (!Number.isFinite(obj.textSize)) obj.textSize = 18;
                    if (!Number.isFinite(obj.borderWidth)) obj.borderWidth = 0;
                    obj.visible = obj.visible !== false;
                }
                if (obj.type === 'union') {
                    const okNum = (v) => Number.isFinite(v) && v > 0;
                    obj.cells = Array.isArray(obj.cells) ? obj.cells.filter(c => c && Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z) && okNum(c.width) && okNum(c.height) && okNum(c.length))
                        .map(c => ({ x: c.x, y: c.y, z: c.z, width: c.width, height: c.height, length: c.length })) : [];
                    if (!obj.cells.length) obj.cells = [{ x: 0, y: 0, z: 0, width: Math.max(0.05, obj.width || 0.5), height: Math.max(0.05, obj.height || 0.5), length: Math.max(0.05, obj.length || 0.5) }];
                }
                sceneObjects[uid] = obj;
            }
            for (const sid of [...activeSounds.keys()]) stopSound(sid);
            vlInstCache.clear(); physicsVelocity.clear(); ballRot.clear(); ballSpin.clear(); ballContacts.clear(); selectedObjectId = null; renamingId = null; menuItemId = null;
            recountTypes();
            uiDirty = true;
            renderTabs(); renderExplorer(); renderProperties();
        }
        function downloadWorldFile() {
            const blob = new Blob([JSON.stringify(buildWorldFile(), null, 2)], { type: 'application/vnd.vanilla.world+json' });
            const url = URL.createObjectURL(blob); const a = document.createElement('a');
            a.href = url; a.download = 'World.vnw'; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        function saveToSlot(id, quiet) {
            const s = slotOf(id);
            if (!s) return false;
            let json; try { json = JSON.stringify(buildWorldFile()); } catch (e) { json = ''; }
            if (!json) { toast('Could not build the save.', 'bad'); return false; }
            if (!writeSlot(id, json)) { toast('Could not save: browser storage is full or disabled.', 'bad'); return false; }
            if (id === 'autosave') autosaveBase = json;
            if (!quiet) { toast('Saved to ' + s.label + '.'); refreshFileStatus(); }
            return true;
        }
        async function openSlot(id) {
            const s = slotOf(id);
            if (!s) return;
            const saved = readSlot(id);
            if (!saved) { toast('Nothing saved in ' + s.label + ' yet.', 'warn'); return; }
            try { validateWorldFile(saved); } catch (err) { toast(s.label + ' is damaged: ' + err.message, 'bad'); return; }
            if (!(await confirmDialog('Open ' + s.label + '?', 'This replaces everything in World, Storage and Scripts. Unsaved changes will be lost.', 'Open', true))) return;
            try { await maybeOfferPlayerSetup(saved); applyWorldFile(saved); toast(s.label + ' opened.'); }
            catch (err) { toast('Could not open: ' + err.message, 'bad'); }
        }
        async function runFileAction(action) {
            if (action === 'docs') { openDocs('file'); return; }
            if (simulationRunning) { toast('Stop the simulation first. Stop restores your world.', 'warn'); return; }
            if (action === 'save-autosave') saveToSlot('autosave');
            else if (action === 'save-slot1') saveToSlot('slot1');
            else if (action === 'save-slot2') saveToSlot('slot2');
            else if (action === 'save-file') { downloadWorldFile(); toast('Downloaded World.vnw.'); }
            else if (action === 'open-file') vnwInput.click();
            else if (action === 'add-vanilla') vanillaInput.click();
            else if (action.startsWith('open-') && slotOf(action.slice(5))) openSlot(action.slice(5));
            else if (action === 'new-world') {
                if (!(await confirmDialog('Start a new world?', 'This clears World, Storage and Scripts. Unsaved changes will be lost.', 'Clear world', true))) return;
                const objs = { Amber417: { type: 'worldsettings', name: 'Settings', parent: 'world', timeOfDay: 14, gravity: 9.8, killY: -5000 } };
                for (const [id, o] of makePlayerSetup(() => { let id; do { id = newId(); } while (id === 'Amber417'); return id; })) objs[id] = o;
                applyWorldFile({ format: 'VanillaWorld', formatVersion: 1, engineVersion: ENGINE_VERSION, objects: objs });
                toast('New empty world.');
                askToast('Do you want to create the plate?', 'Yes', 'No', createPlate);
            }
        }
        fileBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFileMenu(); });
        document.addEventListener('click', (e) => { if (!e.target.closest('.file-menu-wrap')) toggleFileMenu(false); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !fileMenu.hidden) { toggleFileMenu(false); fileBtn.focus(); }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); runFileAction(e.shiftKey ? 'save-file' : 'save-autosave'); }
        });
        fileMenu.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const items = Array.from(fileMenu.querySelectorAll('.menu-item:not(:disabled)')); const i = items.indexOf(document.activeElement);
            items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        });
        fileMenu.querySelectorAll('[data-file-act]').forEach(item => item.addEventListener('click', () => { toggleFileMenu(false); runFileAction(item.dataset.fileAct); }));
        vnwInput.addEventListener('change', async () => {
            const file = vnwInput.files && vnwInput.files[0]; if (!file) return;
            try {
                const data = validateWorldFile(JSON.parse(await file.text()));
                if (!(await confirmDialog('Open "' + file.name + '"?', 'This replaces everything in World, Storage and Scripts. Unsaved changes will be lost.', 'Open', true))) return;
                await maybeOfferPlayerSetup(data);
                applyWorldFile(data); toast('Opened ' + file.name + '.');
            } catch (err) { toast('Could not open file: ' + (err instanceof SyntaxError ? 'it is not valid JSON.' : err.message), 'bad'); }
            finally { vnwInput.value = ''; }
        });

        // ───────── Premade instances (.vanilla) ─────────
        // A .vanilla file holds one instance at the top of a space plus any children it has. Adding it leaves the rest of
        // the world alone, so a model or a script can be dropped in without opening a whole world.
        function readInstanceFile(raw) {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('this is not a .vanilla file.');
            if (raw.format !== 'VanillaInstance' && raw.format !== 'VanillaWorld') throw new Error('this is not a .vanilla file.');
            if (raw.formatVersion !== 1) throw new Error('the file was made by a newer version of the engine.');
            if (!raw.objects || typeof raw.objects !== 'object' || Array.isArray(raw.objects)) throw new Error('the file has no instances in it.');
            if (Object.values(raw.objects).some(o => o && o.parent === 'players')) throw new Error('players are made by the engine and cannot be added from a file.');
            const objects = JSON.parse(JSON.stringify(raw.objects));
            validateWorldFile({ format: 'VanillaWorld', formatVersion: 1, objects });   // the same checks a world file gets
            // Counted after validation: a stray parent becomes its own top instance there, which must be refused rather
            // than silently added next to the one the file means to bring.
            const roots = Object.entries(objects).filter(([, o]) => o && typeof o === 'object' && SPACE_IDS.includes(o.parent));
            if (roots.length !== 1) throw new Error(roots.length ? 'a .vanilla file holds one instance at the top, and this one holds ' + roots.length + '.' : 'the file has no instance at the top of a space.');
            return { rootId: roots[0][0], objects };
        }
        function addInstanceFile(raw) {
            const { rootId, objects } = readInstanceFile(raw);
            // Anything whose UID is already taken is renamed, and the links inside the file follow the rename.
            const remap = new Map();
            for (const uid of Object.keys(objects)) {
                if (!sceneObjects[uid]) continue;
                let nid; do { nid = newId(); } while (sceneObjects[nid] || objects[nid]);
                remap.set(uid, nid);
            }
            for (const [uid, obj] of Object.entries(objects)) {
                if (remap.has(obj.parent)) obj.parent = remap.get(obj.parent);
                sceneObjects[remap.get(uid) || uid] = obj;
            }
            vlInstCache.clear();
            recountTypes();
            selectedObjectId = remap.get(rootId) || rootId;
            multiSel.clear();
            uiDirty = true; renderTabs(); renderExplorer(); renderProperties();
            const root = sceneObjects[selectedObjectId];
            const where = root && spaces[spaceOf(root)] ? spaces[spaceOf(root)].name : 'the world';
            const how = objects[rootId] && objects[rootId].name ? '"' + objects[rootId].name + '"' : 'one instance';
            toast('Added ' + how + ' to ' + where + '.');
        }
        vanillaInput.addEventListener('change', async () => {
            const file = vanillaInput.files && vanillaInput.files[0]; if (!file) return;
            try {
                addInstanceFile(JSON.parse(await file.text()));
            } catch (err) {
                toast('Could not add ' + file.name + ': ' + (err instanceof SyntaxError ? 'it is not valid JSON.' : err.message), 'bad');
            } finally { vanillaInput.value = ''; }
        });

        // ───────── Update check ─────────
        // Every 30 seconds the page asks the site whether this file or vanillalua.js has a newer version. Header
        // checks keep that cheap; a file is only downloaded when its header says it changed.
        const UPDATE_CHECK_MS = 30000;
        const versionCompare = (a, b) => {
            const A = String(a).split('.').map(n => parseInt(n, 10) || 0), B = String(b).split('.').map(n => parseInt(n, 10) || 0);
            for (let i = 0; i < Math.max(A.length, B.length); i++) { const d = (A[i] || 0) - (B[i] || 0); if (d) return d > 0 ? 1 : -1; }
            return 0;
        };
        const vlScriptUrl = () => {
            const el = [...document.querySelectorAll('script[src]')].find(s => /vanillalua\.js/i.test(s.src));
            return el ? el.src : '';
        };
        async function fetchText(url) { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.text() : ''; } catch (e) { return ''; } }
        async function fetchTag(url) {
            try {
                const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                if (!r.ok) return '';
                return r.headers.get('etag') || r.headers.get('last-modified') || '';
            } catch (e) { return ''; }
        }
        let updateTags = null, updateSeen = '';
        async function checkForUpdates() {
            if (location.protocol === 'file:' || navigator.onLine === false) return;   // a local copy has nothing to compare
            const pageUrl = location.href.split('#')[0], vlUrl = vlScriptUrl();
            const tags = { page: await fetchTag(pageUrl), vl: vlUrl ? await fetchTag(vlUrl) : null };
            if (!updateTags) { updateTags = tags; return; }                            // the first pass only records the state
            // A server that sends no header is always re-downloaded, which is the only way to tell then.
            const pageMoved = !tags.page || tags.page !== updateTags.page;
            const vlMoved = tags.vl !== null && (!tags.vl || tags.vl !== updateTags.vl);
            updateTags = tags;
            if (!pageMoved && !vlMoved) return;
            const [page, vl] = await Promise.all([pageMoved ? fetchText(pageUrl) : Promise.resolve(''), vlMoved ? fetchText(vlUrl) : Promise.resolve('')]);
            const pageVer = (page.match(/const ENGINE_VERSION = '([\d.]+)'/) || [])[1] || '';
            const vlVer = (vl.match(/const VL_VERSION = '([\d.]+)'/) || [])[1] || '';
            const loadedVl = window.VanillaluaShared && window.VanillaluaShared.version;
            const engineNewer = !!pageVer && versionCompare(pageVer, ENGINE_VERSION) > 0;
            const vlNewer = !!vlVer && !!loadedVl && versionCompare(vlVer, loadedVl) > 0;
            if (!engineNewer && !vlNewer) return;
            const found = (engineNewer ? 'engine ' + pageVer : '') + (engineNewer && vlNewer ? ' and ' : '') + (vlNewer ? 'Vanillalua ' + vlVer : '');
            if (found === updateSeen) return;                                          // this version was already offered
            updateSeen = found;
            document.getElementById('mu-ver').textContent = 'A newer ' + found + ' is available. You are on engine ' + ENGINE_VERSION + (loadedVl ? ' with Vanillalua ' + loadedVl : '') + '.';
            openModal('modal-update', '#mu-reload');
        }
        document.getElementById('mu-reload').addEventListener('click', () => {
            if (!simulationRunning) { autosaveNow(); saveToSlot('autosave', true); }   // keep the world, changed or not
            try { localStorage.setItem(VN_RELOAD_RESTORE_KEY, 'autosave'); } catch (e) {}
            closeModals();
            const base = location.href.split('#')[0];
            location.replace(base + (base.includes('?') ? '&' : '?') + 'v=' + Date.now());
        });
        setInterval(checkForUpdates, UPDATE_CHECK_MS);

        // Puts the world back after the reload button, and opens your autosave when the editor loads.
        function bootRestore() {
            let pending = '';
            try { pending = localStorage.getItem(VN_RELOAD_RESTORE_KEY) || ''; } catch (e) {}
            if (pending) { try { localStorage.removeItem(VN_RELOAD_RESTORE_KEY); } catch (e) {} }
            const slotId = pending && slotOf(pending) ? pending : (settings.autosave > 0 ? 'autosave' : '');
            if (!slotId) return;
            const saved = readSlot(slotId);
            if (!saved) return;
            try { validateWorldFile(saved); applyWorldFile(saved); }
            catch (e) { if (pending) toast('Could not restore the last save: ' + e.message, 'bad'); return; }
            if (pending) toast('Your world was saved and reopened in the new version.');
        }
