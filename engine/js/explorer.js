// Vanilla Engine — explorer, menus, selection, properties and modes. Loaded in order by index.html; all files share one global scope.
        // ───────── Explorer ─────────
        const explorerEl = document.getElementById('explorer-content');
        const collapsed = new Set();
        let lastItemClick = { id: null, t: 0 };
        const multiSel = new Set(); let anchorId = null;
        let renamingId = null, menuItemId = null;

        const treeIconCache = new Map();
        let treeKindCssReady = false;
        // A mask span renders the same sprite symbol without creating an SVG shadow tree for every row. The loader
        // installs the per-symbol data URLs once; until then, fall back to the normal external icon.
        function treeIcon(type) {
            const iconId = typeIcon[type];
            let html = treeIconCache.get(type);
            if (!html) {
                html = treeKindCssReady ? `<span class="tree-kind-icon tree-kind-${iconId}"></span>` : icon(iconId);
                treeIconCache.set(type, html);
            }
            return html;
        }
        function enableTreeIconCss() {
            treeKindCssReady = true;
            refreshTreeIcons();
        }
        let TREE_CHEVRON_ICON = '', TREE_MORE_ICON = '';
        function refreshTreeIcons() {
            TREE_CHEVRON_ICON = icon('i-chev');
            // A text ellipsis is the same affordance without cloning an SVG into every row.
            TREE_MORE_ICON = '<span class="item-more-dots" aria-hidden="true">⋯</span>';
            treeIconCache.clear();
        }
        function rowHtml(id, o, depth) {
            const out = [];
            rowHtmlInto(id, o, depth, out);
            return out.join('');
        }
        function rowHtmlInto(id, o, depth, out) {
            const kids = sceneChildEntries(id);
            const open = !collapsed.has(id);
            out.push(`<div class="tree-item${id === selectedObjectId || multiSel.has(id) ? ' selected' : ''}${id === menuItemId ? ' menu-open' : ''}" style="--depth:${depth}" role="treeitem" ${o.readOnly ? '' : 'draggable="true"'} tabindex="0" data-id="${id}">
                ${kids.length ? `<button class="tree-twist${open ? ' open' : ''}" data-twist="${id}" tabindex="-1" aria-label="${open ? 'Collapse' : 'Expand'} children">${TREE_CHEVRON_ICON}</button>` : '<span class="tree-twist"></span>'}${treeIcon(o.type)}${id === renamingId
                    ? `<input class="rename-input" type="text" maxlength="48" value="${esc(o.name)}" aria-label="Rename">`
                    : `<span class="tree-name">${esc(settings.showUid ? id : o.name)}</span>`}${o.type === 'viewfinder' ? '' : `<span class="tree-id">${o.type}</span>`}${o.readOnly ? ''
                    : `<button class="item-more" data-more="${id}" aria-label="More options for ${esc(o.name)}" aria-haspopup="menu" title="More options">${TREE_MORE_ICON}</button>`}
            </div>`);
            if (kids.length && open) for (const [k, c] of kids) rowHtmlInto(k, c, depth + 1, out);
        }
        function renderExplorer() {
            if (!TREE_CHEVRON_ICON) refreshTreeIcons();
            markUISceneChanged();
            for (const k of [...multiSel]) if (!sceneObjects[k]) multiSel.delete(k);
            if (!selectedObjectId) multiSel.clear();
            explorerEl.innerHTML = Object.entries(spaces).map(([sid, sp]) => {
                const kids = sceneChildEntries(sid);
                const open = !collapsed.has(sid);
                const rows = kids.length ? kids.map(([id, o]) => rowHtml(id, o, 0)).join('')
                    : `<div class="tree-empty">${sid === 'scripts' ? 'No scripts yet' : sid === 'ui' ? 'No interface yet' : sid === 'players' ? 'Players join when the simulation runs' : sid === 'communications' ? 'No connections yet' : 'Empty'}</div>`;
                return `
                    <div class="tree-space">
                        <div class="tree-row">
                            <button class="tree-group${selectedSpaceId === sid ? ' selected' : ''}" data-space="${sid}" aria-expanded="${open}"${selectedSpaceId === sid ? ' aria-current="true"' : ''}>${icon('i-chev', 'chev')}${icon(sp.icon, 'kind')}${sp.name}</button>
                            ${sp.addable ? `<button class="add-btn" data-add="${sid}" aria-label="Add to ${sp.name}" title="Add to ${sp.name}">${icon('i-plus')}</button>` : ''}
                        </div>
                        <div class="tree-children"${open ? '' : ' hidden'}>${rows}</div>
                    </div>`;
            }).join('');
            const ri = explorerEl.querySelector('.rename-input');
            if (ri) { ri.focus(); ri.select(); }
            renderTabs();
        }

        explorerEl.addEventListener('click', (e) => {
            if (e.target.closest('.rename-input')) return;
            const tw = e.target.closest('[data-twist]');
            if (tw) { const k = tw.dataset.twist; collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k); renderExplorer(); return; }
            const more = e.target.closest('.item-more');
            if (more) {
                const id = more.dataset.more;
                (!itemMenu.hidden && menuItemId === id) ? closeItemMenu(true) : openItemMenu(id, more.getBoundingClientRect(), false);
                return;
            }
            const add = e.target.closest('[data-add]');
            if (add) { (!addMenu.hidden && menuBtn === add) ? closeAddMenu(true) : openAddMenu(add); return; }
            const grp = e.target.closest('.tree-group');
            if (grp) {
                const sid = grp.dataset.space;
                // The UI space can be selected on its own, which previews the whole interface in the viewport.
                const pickingUI = sid === 'ui' && !(selectedSpaceId === 'ui' && !selectedObjectId);
                if (pickingUI) { collapsed.delete(sid); selectedObjectId = null; multiSel.clear(); selectedSpaceId = 'ui'; }
                else {
                    collapsed.has(sid) ? collapsed.delete(sid) : collapsed.add(sid);
                    if (selectedSpaceId) selectedSpaceId = null;
                }
                renderExplorer();
                renderProperties();
                applyModeHint();
                const again = explorerEl.querySelector(`.tree-group[data-space="${sid}"]`);
                if (again) again.focus();
                return;
            }
            const item = e.target.closest('.tree-item');
            if (item) {
                const id = item.dataset.id, now = performance.now();
                const again = lastItemClick.id === id && now - lastItemClick.t < 450;
                lastItemClick = { id, t: now };
                if (again && sceneObjects[id] && sceneObjects[id].type === 'script') { openScriptTab(id); return; }
                if (e.shiftKey) { toggleMulti(id); return; }
                if (e.ctrlKey || e.metaKey) { rangeSelect(id); return; }
                selectItem(id);
            }
        });
        // Shift-click adds or removes one object; Ctrl-click selects everything between the anchor and the clicked row.
        function toggleMulti(id) {
            if (!sceneObjects[id] || sceneObjects[id].readOnly) return;
            if (!multiSel.size && selectedObjectId) multiSel.add(selectedObjectId);
            if (multiSel.has(id)) { multiSel.delete(id); selectedObjectId = selectedObjectId === id ? ([...multiSel].pop() || null) : selectedObjectId; }
            else { multiSel.add(id); selectedObjectId = id; }
            anchorId = id; renderExplorer(); renderProperties();
        }
        function rangeSelect(id) {
            const rows = [...explorerEl.querySelectorAll('.tree-item')].map(r => r.dataset.id);
            const a = rows.indexOf(anchorId || selectedObjectId), b = rows.indexOf(id);
            if (a < 0 || b < 0) { selectItem(id); return; }
            if (!multiSel.size && selectedObjectId) multiSel.add(selectedObjectId);
            for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (!sceneObjects[rows[i]].readOnly) multiSel.add(rows[i]);
            selectedObjectId = id; renderExplorer(); renderProperties();
        }
        // Actions from the item menu apply to the whole selection when the clicked item is part of it.
        function menuTargets(id) { return multiSel.size > 1 && multiSel.has(id) ? [...multiSel].filter(k => sceneObjects[k] && !sceneObjects[k].readOnly) : [id]; }
        function topRoots(ids) { return ids.filter(t => !ids.some(u => u !== t && isInside(t, u))); }
        function makeClip(ids, cut) {
            const one = (id) => ({ data: cloneData(sceneObjects[id]), rootId: id, kids: collectTree(id), cut, pastes: 0 });
            const roots = topRoots(ids); return roots.length === 1 ? one(roots[0]) : { multi: roots.map(one), cut };
        }
        explorerEl.addEventListener('keydown', (e) => {
            if (e.target.closest('.rename-input')) {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(true); }
                else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commitRename(false); }
                return;
            }
            if (e.target.closest('.item-more')) return;
            const item = e.target.closest('.tree-item');
            if (item && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                selectItem(item.dataset.id);
                const again = explorerEl.querySelector(`.tree-item[data-id="${item.dataset.id}"]`);
                if (again) again.focus();
            }
        });

        // ───────── Instance creator menu ─────────
        const addMenu = document.getElementById('add-menu');
        let menuBtn = null;
        function openAddMenu(btn) {
            if (typeof itemMenu !== 'undefined' && !itemMenu.hidden) closeItemMenu(false);
            menuBtn = btn;
            addMenu.dataset.space = btn.dataset.add;
            document.getElementById('add-menu-title').textContent = spaces[btn.dataset.add] ? 'Add to ' + spaces[btn.dataset.add].name : 'Add inside ' + ((sceneObjects[btn.dataset.add] || {}).name || 'object');
            { const tgt = sceneObjects[btn.dataset.add];
              const spaceId = btn.dataset.add;
              const uiTarget = spaceId === 'ui' || isUI(tgt);
              // The Communications space offers connections, and nothing else.
              const commsTarget = spaceId === 'communications' || isConnection(tgt);
              for (const it of addMenu.querySelectorAll('.menu-item')) {
                  const kind = it.dataset.kind;
                  const uiKind = UI_TYPES.includes(kind);
                  // Scripts are the one non-UI instance that may be added inside a UI element.
                  let show;
                  if (commsTarget) show = CONNECTION_TYPES.includes(kind);
                  else if (CONNECTION_TYPES.includes(kind)) show = false;
                  else show = uiTarget ? (uiKind || (kind === 'script' && !!tgt && isUI(tgt))) : !uiKind;
                  if (!uiTarget && !commsTarget && kind === 'texture') show = !!tgt && tgt.type === 'prism6';
                  it.style.display = show ? '' : 'none';
              } }
            addMenu.hidden = false;
            const r = btn.getBoundingClientRect();
            const mw = addMenu.offsetWidth, mh = addMenu.offsetHeight;
            const left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
            let top = r.bottom + 4;
            if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
            addMenu.style.left = left + 'px';
            addMenu.style.top = top + 'px';
            addMenu.querySelector('.menu-item').focus();
        }
        function closeAddMenu(restoreFocus) {
            if (addMenu.hidden) return;
            addMenu.hidden = true;
            if (restoreFocus && menuBtn && document.contains(menuBtn)) menuBtn.focus();
        }
        addMenu.addEventListener('click', (e) => {
            const it = e.target.closest('.menu-item');
            if (!it) return;
            const space = addMenu.dataset.space;
            closeAddMenu(false);
            addInstance(it.dataset.kind, space);
        });
        addMenu.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const items = [...addMenu.querySelectorAll('.menu-item')].filter(el => el.style.display !== 'none');
            const i = items.indexOf(document.activeElement);
            items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        });
        document.addEventListener('mousedown', (e) => {
            if (!addMenu.hidden && !addMenu.contains(e.target) && !e.target.closest('.add-btn')) closeAddMenu(false);
        });

        // ───────── Explorer item context menu ─────────
        const itemMenu = document.getElementById('item-menu');
        let clipboard = null;   // { data, cut, pastes }
        // Copies never keep Spawnpoint: only one block can be the spawnpoint.
        const cloneData = (o) => { const c = JSON.parse(JSON.stringify(o)); if (c.spawnpoint) c.spawnpoint = false; return c; };
        const spawnTaken = (exceptId) => Object.entries(sceneObjects).some(([k, o]) => k !== exceptId && o.type === 'prism6' && o.spawnpoint);

        function placeMenu(menu, rect, alignLeft) {
            const mw = menu.offsetWidth, mh = menu.offsetHeight;
            let left = alignLeft ? rect.left : rect.right - mw;
            left = Math.min(Math.max(8, left), window.innerWidth - mw - 8);
            let top = rect.bottom + 4;
            if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 4);
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        }
        function openItemMenu(id, rect, alignLeft) {
            const o = sceneObjects[id];
            if (!o || o.readOnly) return;
            closeAddMenu(false);
            menuItemId = id;
            itemMenu.dataset.id = id;
            const off = (act, v) => { itemMenu.querySelector(`[data-act="${act}"]`).disabled = v; };
            off('rename', !!o.locked || o.type === 'human');
            off('cut', !!o.locked);
            off('delete', !!o.locked);
            off('paste', !clipboard);
            off('camera', !((isShape(o) || o.type === 'model') && spaceOf(o) === 'world'));
            off('ungroup', o.type !== 'model');
            off('addchild', isConnection(o));
            off('group', !menuTargets(id).length || menuTargets(id).some(k => isUI(sceneObjects[k]) || isConnection(sceneObjects[k])));
            { const shapes = menuTargets(id).filter(k => isShape(sceneObjects[k]) && spaceOf(sceneObjects[k]) === 'world');
              off('union', !shapes.length); off('intersect', shapes.length < 2); }
            itemMenu.hidden = false;
            renderExplorer();
            placeMenu(itemMenu, rect, alignLeft);
            const first = itemMenu.querySelector('.menu-item:not(:disabled)');
            if (first) first.focus();
        }
        function closeItemMenu(restoreFocus) {
            if (itemMenu.hidden) return;
            itemMenu.hidden = true;
            const id = menuItemId;
            menuItemId = null;
            renderExplorer();
            if (restoreFocus) {
                const btn = explorerEl.querySelector(`[data-more="${id}"]`);
                if (btn) btn.focus();
            }
        }
        itemMenu.addEventListener('click', (e) => {
            const it = e.target.closest('.menu-item');
            if (!it || it.disabled) return;
            const id = itemMenu.dataset.id;
            closeItemMenu(false);
            runItemAction(it.dataset.act, id);
        });
        itemMenu.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const items = [...itemMenu.querySelectorAll('.menu-item:not(:disabled)')];
            if (!items.length) return;
            const i = items.indexOf(document.activeElement);
            items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        });
        document.addEventListener('mousedown', (e) => {
            if (!itemMenu.hidden && !itemMenu.contains(e.target) && !e.target.closest('.item-more')) closeItemMenu(false);
        });
        explorerEl.addEventListener('contextmenu', (e) => {
            const item = e.target.closest('.tree-item');
            if (!item || e.target.closest('.rename-input')) return;
            const o = sceneObjects[item.dataset.id];
            if (!o || o.readOnly) return;
            e.preventDefault();
            openItemMenu(item.dataset.id, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY - 4 }, true);
        });
        explorerEl.addEventListener('focusout', (e) => {
            if (e.target.classList && e.target.classList.contains('rename-input')) commitRename(true);
        });

        function commitRename(commit) {
            if (!renamingId) return;
            const id = renamingId;
            renamingId = null;
            const o = sceneObjects[id];
            const inp = explorerEl.querySelector('.rename-input');
            if (o && commit && inp) o.name = inp.value.trim() || dn(o.type);
            renderExplorer();
            if (id === selectedObjectId) renderProperties();
        }
        
        function groupSelected() {
            const targets = (multiSel.size > 0 ? [...multiSel] : (selectedObjectId ? [selectedObjectId] : []))
                .filter(id => sceneObjects[id] && !sceneObjects[id].readOnly);
            if (!targets.length) return;
            if (targets.some(id => isUI(sceneObjects[id]))) { toast('UI instances cannot be grouped into a model.', 'warn'); return; }
            const roots = topRoots(targets);
            if (!roots.length) return;
            const parentSpace = sceneObjects[roots[0]].parent;
            const modelId = newId();
            const n = ++counters.model;
            const name = dn('model') + (n === 1 ? '' : ' ' + n);
            sceneObjects[modelId] = { type: 'model', name, parent: parentSpace };
            for (const id of roots) sceneObjects[id].parent = modelId;
            sceneIndexInvalidate();
            collapsed.delete(parentSpace); collapsed.delete(modelId);
            selectItem(modelId);
            toast('Grouped ' + roots.length + ' item' + (roots.length === 1 ? '' : 's') + ' into ' + name + '.');
        }

        function ungroupSelected() {
            const id = selectedObjectId;
            const o = sceneObjects[id];
            if (!o || o.type !== 'model' || o.readOnly) return;
            const parent = o.parent;
            const kids = sceneChildEntries(id).map(([k]) => k);
            for (const cid of kids) sceneObjects[cid].parent = parent;
            delete sceneObjects[id];
            sceneIndexInvalidate();
            physicsVelocity.delete(id);
            pruneOrphans();
            multiSel.clear(); for (const cid of kids) multiSel.add(cid);
            selectedObjectId = kids[0] || null;
            renderExplorer(); renderProperties();
            toast('Ungrouped ' + o.name + '.');
        }

        function deleteItem(id) {
            stopSound(id);
            delete sceneObjects[id];
            physicsVelocity.delete(id);
            pruneOrphans();
            if (renamingId === id) renamingId = null;
            if (selectedObjectId === id) selectedObjectId = null;
            renderExplorer();
            renderProperties();
        }
        function collectTree(id) { const out = []; (function w(i) { for (const [k, o] of sceneChildEntries(i)) { out.push([k, cloneData(o)]); w(k); } })(id); return out; }
        function reparent(id, target) {
            const o = sceneObjects[id], t = SPACE_KEYS.includes(target) ? true : sceneObjects[target];
            if (!o || !t || o.readOnly || target === 'players' || id === target || isInside(target, id) || (sceneObjects[target] && sceneObjects[target].readOnly) || o.parent === target) return;
            // Connections stay in the Communications space, and nothing else may join them there.
            if (isConnection(o)) { if (target !== 'communications') return; }
            else if (target === 'communications' || isConnection(sceneObjects[target])) return;
            // UI lives in the UI space and inside other UI; the 3D world and the interface never mix.
            if (isUI(o) ? (SPACE_KEYS.includes(target) ? target !== 'ui' : !isUI(sceneObjects[target])) : target === 'ui') return;
            o.parent = target; sceneIndexInvalidate(); collapsed.delete(target); renderExplorer(); renderProperties();
        }
        function pasteInto(space) {
            const c = clipboard;
            if (!c) return;
            if (c.multi) { const list = c.multi, cut = c.cut; for (const sub of list) { clipboard = sub; pasteInto(space); } clipboard = cut ? null : { multi: list, cut: false }; return; }
            if (isConnection(c.data)) {
                if (space !== 'communications') { toast('Connections can only be pasted into Communications.', 'warn'); return; }
            } else if (space === 'communications' || isConnection(sceneObjects[space])) { toast('Only connection instances live in Communications.', 'warn'); return; }
            // Only UI elements sit at the top of the UI space; scripts belong inside one of them.
            if (space === 'ui' && !isUI(c.data)) { toast('Only UI elements can sit at the top of the UI space. Paste inside a UI element.', 'warn'); return; }
            const data = cloneData(c.data);
            data.parent = isUI(data) && (space === 'ui' || isUI(sceneObjects[space])) ? space : (isUI(data) ? 'ui' : space);
            if (isUI(data)) { data.posX = uiClamp((+data.posX || 50) + c.pastes * 4, 0, 100); data.posY = uiClamp((+data.posY || 50) + c.pastes * 4, 0, 100); }
            if (!c.cut) {
                c.pastes++;
                if (isShape(data)) {
                    data.x = Math.round((data.x + c.pastes * (2 * data.width + 0.5)) * 100) / 100;
                } else if (data.type === 'model') {
                    let w = 1.0, minX = Infinity, maxX = -Infinity;
                    for (const [, kd] of (c.kids || [])) {
                        if (isShape(kd)) { minX = Math.min(minX, kd.x - kd.width); maxX = Math.max(maxX, kd.x + kd.width); }
                    }
                    if (minX !== Infinity) w = (maxX - minX) / 2;
                    const shiftX = Math.round(c.pastes * (2 * w + 0.5) * 100) / 100;
                    for (const [, kd] of (c.kids || [])) {
                        if (isShape(kd)) kd.x = Math.round((kd.x + shiftX) * 100) / 100;
                    }
                }
            }
            const id = newId();
            sceneObjects[id] = data;
            const map = { [c.rootId]: id };
            for (const [oldId, kd] of (c.kids || [])) { const nid = newId(); const d = cloneData(kd); d.parent = map[kd.parent] || id; map[oldId] = nid; sceneObjects[nid] = d; }
            sceneIndexInvalidate();
            if (c.cut) clipboard = null;
            collapsed.delete(space);
            selectItem(id);
        }
        function moveCameraTo(id) {
            const o = sceneObjects[id];
            if (!o) return;
            let target = o;
            if (o.type === 'model') {
                const b = getModelBounds(id);
                if (b) target = b; else return;
            }
            updateTrig();
            const d = Math.hypot(target.width, target.height, target.length) * 2.5 + 2;
            camPosX = o.x - fwdX * d;
            camPosY = o.y - fwdY * d;
            camPosZ = o.z - fwdZ * d;
            selectItem(id);
        }
        function runItemAction(act, id) {
            const o = sceneObjects[id];
            if (!o) return;
            if (act === 'rename') { renamingId = id; renderExplorer(); }
            else if (act === 'copy') clipboard = makeClip(menuTargets(id), false);
            else if (act === 'cut') { const t = menuTargets(id).filter(k => !sceneObjects[k].locked); if (t.length) { clipboard = makeClip(t, true); t.forEach(k => sceneObjects[k] && deleteItem(k)); } }
            else if (act === 'paste') pasteInto(o.parent);
            else if (act === 'pastechild') { if (clipboard) pasteInto(id); else toast('Nothing to paste. Copy or cut an object first.', 'warn'); }
            else if (act === 'addchild') { const row = explorerEl.querySelector('[data-id="' + id + '"]'); const fake = { dataset: { add: id }, focus() {}, getBoundingClientRect: () => row.getBoundingClientRect() }; openAddMenu(fake); }
            else if (act === 'delete') menuTargets(id).filter(k => sceneObjects[k] && !sceneObjects[k].locked).forEach(k => sceneObjects[k] && deleteItem(k));
            else if (act === 'group') groupSelected();
            else if (act === 'ungroup') ungroupSelected();
            else if (act === 'union') unionSelected('union', id);
            else if (act === 'intersect') unionSelected('intersect', id);
            else if (act === 'camera') moveCameraTo(id);
        }

        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g' && !isTyping()) {
                e.preventDefault();
                if (e.shiftKey) ungroupSelected(); else groupSelected();
                return;
            }
            if (e.key !== 'Escape') return;
            if (!itemMenu.hidden) { closeItemMenu(true); return; }
            if (!addMenu.hidden) closeAddMenu(true);
            closeModals();
        });

        // Drag rows to reorder them (top or bottom edge of a row) or to make them children (middle of a row).
        let dragIds = [];
        const clearDrop = () => explorerEl.querySelectorAll('.drop-target, .drop-before, .drop-after').forEach(x => x.classList.remove('drop-target', 'drop-before', 'drop-after'));
        function dropInfo(e) {
            const t = e.target.closest('.tree-item, .tree-group'); if (!t || !dragIds.length) return null;
            if (t.classList.contains('tree-group')) {
                const sp = t.dataset.space;
                if (sp === 'engine' || sp === 'players') return null;
                // Connections move within Communications only; nothing else goes in.
                const draggingConnection = dragIds.some(id => isConnection(sceneObjects[id]));
                if (draggingConnection) return sp === 'communications' ? { el: t, where: 'child', target: sp } : null;
                if (sp === 'communications') return null;
                // The interface stays in the UI space; a script enters it through a UI element, never at the top.
                if (dragIds.some(id => isUI(sceneObjects[id])) ? sp !== 'ui' : sp === 'ui') return null;
                return { el: t, where: 'child', target: sp };
            }
            const o = sceneObjects[t.dataset.id]; if (!o || o.readOnly || isConnection(o)) return null;
            if (dragIds.some(id => isConnection(sceneObjects[id]))) return null;
            const r = t.getBoundingClientRect(), f = (e.clientY - r.top) / r.height;
            const where = f < 0.28 ? 'before' : f > 0.72 ? 'after' : 'child';
            const target = where === 'child' ? t.dataset.id : o.parent;
            if (dragIds.some(id => id === t.dataset.id || id === target || isInside(target, id))) return null;
            // UI instances stay in the interface and world objects stay out of it, except that a script may be a
            // child of a UI element (never of the UI space itself).
            const draggingUI = dragIds.some(id => isUI(sceneObjects[id]));
            const targetIsUI = SPACE_KEYS.includes(target) ? target === 'ui' : isUI(sceneObjects[target]);
            const scriptIntoUI = targetIsUI && target !== 'ui' && dragIds.every(id => (sceneObjects[id] || {}).type === 'script');
            if (draggingUI !== targetIsUI && !scriptIntoUI) return null;
            return { el: t, where, target, ref: t.dataset.id };
        }
        function moveInOrder(ids, info) {
            const roots = topRoots(ids).filter(id => sceneObjects[id] && !sceneObjects[id].readOnly);
            if (!roots.length) return;
            const entries = Object.entries(sceneObjects);
            const moved = entries.filter(([k]) => roots.includes(k)), rest = entries.filter(([k]) => !roots.includes(k));
            moved.forEach(([, o]) => { o.parent = info.target; });
            let at = rest.length;
            if (info.where !== 'child') { const i = rest.findIndex(([k]) => k === info.ref); at = info.where === 'before' ? i : i + 1; }
            rest.splice(at, 0, ...moved);
            for (const k of Object.keys(sceneObjects)) delete sceneObjects[k];
            for (const [k, o] of rest) sceneObjects[k] = o;
            sceneIndexInvalidate();
            collapsed.delete(info.target); roots.forEach(k => multiSel.add(k));
            renderExplorer(); renderProperties();
        }
        explorerEl.addEventListener('dragstart', (e) => {
            const it = e.target.closest('.tree-item[draggable]'); if (!it) return;
            dragIds = multiSel.size > 1 && multiSel.has(it.dataset.id) ? [...multiSel] : [it.dataset.id];
            e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragIds.join(','));
        });
        explorerEl.addEventListener('dragover', (e) => {
            clearDrop(); const d = dropInfo(e); if (!d) return;
            e.preventDefault(); d.el.classList.add(d.where === 'child' ? 'drop-target' : 'drop-' + d.where);
        });
        explorerEl.addEventListener('dragleave', (e) => { if (!explorerEl.contains(e.relatedTarget)) clearDrop(); });
        explorerEl.addEventListener('drop', (e) => { const d = dropInfo(e); clearDrop(); if (!d) return; e.preventDefault(); const ids = dragIds; dragIds = []; moveInOrder(ids, d); });
        explorerEl.addEventListener('dragend', () => { dragIds = []; clearDrop(); });
