// Vanilla Engine — script tabs, editor and output panel. Loaded in order by index.html; all files share one global scope.
        // ───────── Tabs and script editor ─────────
        const tabbarEl = document.getElementById('tabbar');
        const editorEl = document.getElementById('script-editor');
        const seInput = document.getElementById('se-input');
        const seHl = document.getElementById('se-hl');
        const seLinesInner = document.getElementById('se-lines-inner');
        const seMarkersInner = document.getElementById('se-markers-inner');
        const seTitle = document.getElementById('se-title');
        const seLang = document.getElementById('se-lang');
        const seCounts = document.getElementById('se-counts');
        const seNote = document.getElementById('se-note');
        const seOutList = document.getElementById('se-out-list');
        const SE_LH = 20;
        const openTabs = ['world'];
        let activeTab = 'world';
        let editorScriptId = null;
        let editorDiags = [];
        let diagTimer = 0;
        let lineCount = 0;

        function renderTabs() {
            for (let i = openTabs.length - 1; i > 0; i--) if (!sceneObjects[openTabs[i]]) openTabs.splice(i, 1);
            if (!openTabs.includes(activeTab)) { activeTab = 'world'; applyActiveTab(); }
            tabbarEl.innerHTML = openTabs.map(id => {
                const isWorld = id === 'world';
                const name = isWorld ? 'World' : sceneObjects[id].name;
                const on = id === activeTab;
                return `<div class="tab${on ? ' active' : ''}" role="tab" tabindex="0" aria-selected="${on}" data-tab="${id}" title="${esc(name)}">
                    ${icon(isWorld ? 'i-world' : 'i-script')}<span class="tab-name">${esc(name)}</span>${isWorld ? '' : `<button class="tab-close" data-close-tab="${id}" aria-label="Close ${esc(name)}" title="Close">${icon('i-close')}</button>`}
                </div>`;
            }).join('');
        }
        function applyActiveTab() {
            const isScript = activeTab !== 'world';
            editorEl.hidden = !isScript;
            if (isScript) loadEditor(activeTab); else editorScriptId = null;
        }
        function setActiveTab(id) {
            if (id === activeTab) return;
            activeTab = id;
            applyActiveTab();
            renderTabs();
        }
        function openScriptTab(id) {
            const o = sceneObjects[id];
            if (!o || o.type !== 'script') return;
            if (!openTabs.includes(id)) openTabs.push(id);
            activeTab = id;
            applyActiveTab();
            renderTabs();
            seInput.focus();
        }
        function closeTab(id) {
            const i = openTabs.indexOf(id);
            if (i < 1) return;
            openTabs.splice(i, 1);
            if (activeTab === id) { activeTab = openTabs[Math.min(i, openTabs.length - 1)] || 'world'; applyActiveTab(); }
            renderTabs();
        }
        tabbarEl.addEventListener('click', (e) => {
            const close = e.target.closest('[data-close-tab]');
            if (close) { closeTab(close.dataset.closeTab); return; }
            const tab = e.target.closest('.tab');
            if (tab) setActiveTab(tab.dataset.tab);
        });
        tabbarEl.addEventListener('auxclick', (e) => {
            const tab = e.target.closest('.tab');
            if (e.button === 1 && tab) { e.preventDefault(); closeTab(tab.dataset.tab); }
        });
        tabbarEl.addEventListener('keydown', (e) => {
            const tab = e.target.closest('.tab');
            if (tab && !e.target.closest('.tab-close') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActiveTab(tab.dataset.tab); }
        });

        // ── Syntax highlighting (a coloured copy of the text sits behind the transparent textarea) ──
        const HL_BUILTINS = new Set(['Instance', 'vanilla3D', 'World', 'Storage', 'Scripts', 'print']);
        const HL_LITERALS = new Set(['True', 'False', 'nil']);
        function hlVanillalua(src) {
            const re = /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
            let out = '', m, prev = '';
            while ((m = re.exec(src))) {
                if (m[1] !== undefined) out += `<span class="tk-com">${esc(m[1])}</span>`;
                else if (m[2] !== undefined) out += `<span class="tk-str">${esc(m[2])}</span>`;
                else if (m[3] !== undefined) out += `<span class="tk-num">${m[3]}</span>`;
                else if (m[4] !== undefined) {
                    const w = m[4];
                    const cls = prev === '.' ? 'tk-prop' : VL_KEYWORDS.has(w) ? 'tk-kw' : HL_LITERALS.has(w) ? 'tk-lit' : HL_BUILTINS.has(w) ? 'tk-bi' : '';
                    out += cls ? `<span class="${cls}">${w}</span>` : w;
                } else out += esc(m[5]);
                if (m[5] !== undefined) { if (!/\s/.test(m[5])) prev = m[5]; } else prev = 'x';
            }
            return out;
        }
        function hlJson(src) {
            const re = /("(?:[^"\\\n]|\\.)*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([\s\S])/g;
            let out = '', m;
            while ((m = re.exec(src))) {
                if (m[1] !== undefined) out += `<span class="${m[2] ? 'tk-prop' : 'tk-str'}">${esc(m[1])}</span>${m[2] ? esc(m[2]) : ''}`;
                else if (m[3] !== undefined) out += `<span class="tk-num">${m[3]}</span>`;
                else if (m[4] !== undefined) out += `<span class="tk-lit">${m[4]}</span>`;
                else out += esc(m[5]);
            }
            return out;
        }

        // ── Editor view ──
        function loadEditor(id) {
            const o = sceneObjects[id];
            if (!o) return;
            ensureScript(o);
            editorScriptId = id;
            seInput.value = o.source;
            seInput.scrollTop = 0;
            seInput.scrollLeft = 0;
            lineCount = 0;
            refreshEditor();
            updateEditorState();
        }
        function refreshEditor() {
            const o = sceneObjects[editorScriptId];
            if (!o) return;
            const src = seInput.value;
            seTitle.textContent = o.name;
            seLang.textContent = o.language === 'json' ? 'JSON' : 'Vanillalua';
            seHl.innerHTML = (o.language === 'json' ? hlJson(src) : settings.syntax === false ? esc(src) : hlVanillalua(src)) + '\n ';
            renderLineNumbers(src);
            runDiagnostics();
            syncEditorScroll();
        }
        function renderLineNumbers(src) {
            const n = src.split('\n').length;
            if (n !== lineCount) {
                lineCount = n;
                let html = '';
                for (let i = 1; i <= n; i++) html += `<div>${i}</div>`;
                seLinesInner.innerHTML = html;
                seMarkersInner.style.height = (n * SE_LH + 56) + 'px';
            }
            updateActiveLine();
        }
        function updateActiveLine() {
            const line = seInput.value.slice(0, seInput.selectionStart).split('\n').length;
            const prev = seLinesInner.querySelector('.cur');
            if (prev) prev.classList.remove('cur');
            const el = seLinesInner.children[line - 1];
            if (el) el.classList.add('cur');
        }
        function syncEditorScroll() {
            seHl.scrollTop = seInput.scrollTop;
            seHl.scrollLeft = seInput.scrollLeft;
            const t = `translateY(${-seInput.scrollTop}px)`;
            seLinesInner.style.transform = t;
            seMarkersInner.style.transform = t;
        }
        function runDiagnostics() {
            const o = sceneObjects[editorScriptId];
            if (!o) return;
            editorDiags = computeDiagnostics({ language: o.language, source: seInput.value }).diags;
            const byLine = new Map();
            for (const d of editorDiags) {
                if (!byLine.has(d.line)) byLine.set(d.line, []);
                byLine.get(d.line).push(d);
            }
            let html = '';
            for (const [line, list] of byLine) {
                const sev = list.some(d => d.sev === 'error') ? 'error' : 'warning';
                const text = list.map(d => (d.sev === 'error' ? 'Error: ' : 'Warning: ') + d.msg).join('\n');
                html += `<button class="se-marker ${sev}" style="top:${8 + (line - 1) * SE_LH}px" data-line="${line}" title="${esc(text)}" aria-label="${esc(text)}">${icon(sev === 'error' ? 'i-err' : 'i-warn')}</button>`;
            }
            seMarkersInner.innerHTML = html;
            const errs = editorDiags.filter(d => d.sev === 'error').length, warns = editorDiags.length - errs;
            seCounts.innerHTML = errs || warns
                ? `${errs ? `<span class="se-count error"><i></i>${errs} error${errs === 1 ? '' : 's'}</span>` : ''}${warns ? `<span class="se-count warning"><i></i>${warns} warning${warns === 1 ? '' : 's'}</span>` : ''}`
                : `<span class="se-count ok"><i></i>No problems</span>`;
        }
        function updateEditorState() {
            seInput.readOnly = simulationRunning;
            seNote.hidden = !simulationRunning;
        }
        function jumpToLine(line) {
            const v = seInput.value;
            let pos = 0;
            for (let i = 1; i < line; i++) { const nl = v.indexOf('\n', pos); if (nl === -1) break; pos = nl + 1; }
            seInput.focus();
            seInput.setSelectionRange(pos, pos);
            const top = (line - 1) * SE_LH;
            if (top < seInput.scrollTop || top > seInput.scrollTop + seInput.clientHeight - 60) seInput.scrollTop = Math.max(0, top - seInput.clientHeight / 3);
            updateActiveLine();
        }
        seMarkersInner.addEventListener('click', (e) => {
            const m = e.target.closest('.se-marker');
            if (m) jumpToLine(parseInt(m.dataset.line, 10));
        });
        seInput.addEventListener('input', () => {
            const o = sceneObjects[editorScriptId];
            if (!o || simulationRunning) return;
            o.source = seInput.value;
            const src = seInput.value;
            seHl.innerHTML = (o.language === 'json' ? hlJson(src) : settings.syntax === false ? esc(src) : hlVanillalua(src)) + '\n ';
            renderLineNumbers(src);
            syncEditorScroll();
            clearTimeout(diagTimer);
            diagTimer = setTimeout(runDiagnostics, 150);
        });
        seInput.addEventListener('scroll', syncEditorScroll);
        ['keyup', 'click', 'focus'].forEach(ev => seInput.addEventListener(ev, updateActiveLine));

        function seInsert(text) {
            seInput.focus();
            if (!document.execCommand('insertText', false, text)) {
                seInput.setRangeText(text, seInput.selectionStart, seInput.selectionEnd, 'end');
                seInput.dispatchEvent(new Event('input'));
            }
        }
        seInput.addEventListener('keydown', (e) => {
            if (seInput.readOnly) return;
            if (e.key === 'Tab') {
                e.preventDefault();
                const v = seInput.value, s = seInput.selectionStart, en = seInput.selectionEnd;
                const multi = v.slice(s, en).includes('\n');
                if (!e.shiftKey && !multi) { seInsert('  '); return; }
                const ls = v.lastIndexOf('\n', s - 1) + 1;
                let le = v.indexOf('\n', en);
                if (le === -1) le = v.length;
                const out = v.slice(ls, le).split('\n').map(l => e.shiftKey ? l.replace(/^( {1,2}|\t)/, '') : '  ' + l).join('\n');
                seInput.setSelectionRange(ls, le);
                seInsert(out);
                seInput.setSelectionRange(ls, ls + out.length);
            } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                const o = sceneObjects[editorScriptId];
                const v = seInput.value, s = seInput.selectionStart;
                const ls = v.lastIndexOf('\n', s - 1) + 1;
                const before = v.slice(ls, s);
                const indent = before.match(/^[ \t]*/)[0];
                const opens = o && o.language === 'json' ? /[{\[]\s*$/.test(before) : /(\bdo|\bthen|\belse)\s*$/.test(before);
                seInsert('\n' + indent + (opens ? '  ' : ''));
            }
        });

        // ── Output panel ──
        function renderOutput() {
            seOutList.innerHTML = outputLog.length
                ? outputLog.map(l => `<div class="out-line ${l.kind}">${esc(l.text)}</div>`).join('')
                : '<div class="out-empty">Output from running scripts appears here.</div>';
            seOutList.scrollTop = seOutList.scrollHeight;
        }
        document.getElementById('se-out-clear').addEventListener('click', () => { outputLog.length = 0; renderOutput(); });
        renderOutput();


        let accentRGB = [0.95, 0.69, 0.2];
        function refreshTheme() {
            accentCol = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#f2b134';
            if (/^#[0-9a-f]{6}$/i.test(accentCol)) accentRGB = [1, 3, 5].map(i => parseInt(accentCol.slice(i, i + 2), 16) / 255);
        }

        function addInstance(kind, space) {
            const id = newId();
            let obj;
            if (UI_TYPES.includes(kind)) {
                obj = makeUI(kind, newUIName(kind), space);
                sceneObjects[id] = obj;
                collapsed.delete(space);
                selectItem(id);
                return;
            }
            if (kind === 'prism6') {
                const n = ++counters.prism;
                const k = n - 2;
                const offset = (k % 2 === 0 ? 1 : -1) * 3 * (Math.floor(k / 2) + 1);
                obj = makePrism(dn('prism6') + ' ' + n, space, { x: offset, y: 0.5 });
            } else if (kind === 'ball') {
                const n = ++counters.ball;
                const k = n - 1;
                const offset = (k % 2 === 0 ? 1 : -1) * 2 * (Math.floor(k / 2) + 1);
                obj = makeBall(dn('ball') + (n === 1 ? '' : ' ' + n), space, { x: offset, y: 0.5, z: 2 });
            } else if (kind === 'wedge') {
                const n = ++counters.wedge;
                const k = n - 1;
                const offset = (k % 2 === 0 ? 1 : -1) * 2 * (Math.floor(k / 2) + 1);
                obj = makeWedge(dn('wedge') + (n === 1 ? '' : ' ' + n), space, { x: offset, y: 0.5, z: -2 });
            } else if (kind === 'cylinder') {
                const n = ++counters.cylinder;
                const k = n - 1;
                const offset = (k % 2 === 0 ? 1 : -1) * 2 * (Math.floor(k / 2) + 1);
                obj = makeCylinder(dn('cylinder') + (n === 1 ? '' : ' ' + n), space, { x: offset, y: 0.5, z: -4 });
            } else if (kind === 'sound') {
                const n = ++counters.sound;
                obj = makeSound(dn('sound') + (n === 1 ? '' : ' ' + n), space);
            } else if (kind === 'highlight') {
                const n = ++counters.highlight;
                obj = makeHighlight(dn('highlight') + (n === 1 ? '' : ' ' + n), space);
            } else if (kind === 'texture') {
                const n = ++counters.texture;
                obj = makeTexture(dn('texture') + (n === 1 ? '' : ' ' + n), space, [4], 'grid');
            } else if (kind === 'model') {
                const n = ++counters.model;
                obj = { type: 'model', name: dn('model') + (n === 1 ? '' : ' ' + n), parent: space };
            } else if (kind === 'human') {
                // Nobody can join inside the editor yet, so the join number is the order Humans are created in.
                obj = makeHuman(dn('human') + (++counters.human), space);
            } else if (CONNECTION_TYPES.includes(kind)) {
                // Connections belong to the Communications space, so they are always created there.
                obj = makeConnection(kind, 'communications');
            } else if (kind === 'worldsettings') {
                const n = ++counters.worldsettings;
                obj = makeWorldSettings(dn('worldsettings') + ' ' + n, space);
            } else {
                const n = ++counters.script;
                // A script on a UI element belongs to the player's side, so it starts Local.
                obj = newScriptData(n === 1 ? dn('script') : dn('script') + ' ' + n, space, isUI(sceneObjects[space]) ? 'Local' : 'Server');
            }
            sceneObjects[id] = obj;
            collapsed.delete(space);
            selectItem(id);
        }
