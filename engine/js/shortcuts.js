// Vanilla Engine — one keyboard dispatcher for editor commands.
// Shortcuts are captured before the viewport and explorer handlers, and edit commands are refused while typing, while a
// modal or menu is open, and while the simulation owns the keyboard. Space still jumps in Run because the edit path is off.
const shortcutHistory = { undo: [], redo: [] };
const SHORTCUT_BYTE_LIMIT = 32 * 1024 * 1024;   // history is capped by the memory it holds, not by an entry count
const SHORTCUT_ASSET_PREFIX = '\u0000asset:';
const SHORTCUT_ASSET_MIN = 512;

function shortcutSelection() {
    const ids = multiSel.size ? [...multiSel] : (selectedObjectId ? [selectedObjectId] : []);
    return ids.filter(id => sceneObjects[id] && !sceneObjects[id].readOnly);
}
function shortcutEditableSelection() {
    return shortcutSelection().filter(id => !sceneObjects[id].locked);
}
function shortcutIsAssetPayload(value) {
    return typeof value === 'string' && value.length >= SHORTCUT_ASSET_MIN && value.startsWith('data:');
}
// Snapshots do not duplicate asset payloads: a data: string is stored once in the snapshot's shared asset list and a
// token takes its place in the copied objects. Restoring puts the original string back. The snapshot's cost is its
// tokenised JSON, so the history cap measures the memory actually added, not the size of the world's assets.
function shortcutSnapshot() {
    const assets = [], seen = new Map();
    const text = JSON.stringify(sceneObjects, (key, value) => {
        if (!shortcutIsAssetPayload(value)) return value;
        let token = seen.get(value);
        if (!token) { token = SHORTCUT_ASSET_PREFIX + assets.length; seen.set(value, token); assets.push(value); }
        return token;
    });
    return {
        objects: JSON.parse(text),
        assets,
        selected: selectedObjectId,
        multi: [...multiSel],
        counters: JSON.parse(JSON.stringify(counters)),
        bytes: text.length
    };
}
function shortcutRestore(snapshot) {
    if (!snapshot) return;
    const revive = (value) => {
        if (typeof value === 'string' && value.startsWith(SHORTCUT_ASSET_PREFIX)) {
            const index = Number(value.slice(SHORTCUT_ASSET_PREFIX.length));
            const asset = snapshot.assets && snapshot.assets[index];
            return typeof asset === 'string' ? asset : value;
        }
        if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = revive(value[i]); }
        else if (value && typeof value === 'object') { for (const key of Object.keys(value)) value[key] = revive(value[key]); }
        return value;
    };
    const objects = revive(snapshot.objects);
    for (const id of Object.keys(sceneObjects)) delete sceneObjects[id];
    Object.assign(sceneObjects, objects);
    if (typeof sceneIndexInvalidate === 'function') sceneIndexInvalidate();
    for (const key of Object.keys(counters)) counters[key] = snapshot.counters[key] || 0;
    physicsVelocity.clear();
    selectedObjectId = snapshot.selected && sceneObjects[snapshot.selected] ? snapshot.selected : null;
    multiSel.clear();
    for (const id of snapshot.multi) if (sceneObjects[id]) multiSel.add(id);
    renderExplorer(); renderProperties();
    if (typeof host !== 'undefined' && host.markUIDirty) host.markUIDirty();
}
function shortcutHistoryBytes() {
    let total = 0;
    for (const snapshot of shortcutHistory.undo) total += snapshot.bytes || 0;
    for (const snapshot of shortcutHistory.redo) total += snapshot.bytes || 0;
    return total;
}
// Drop the oldest steps first when the history is over its budget. The newest step is always kept.
function shortcutTrimHistory() {
    let total = shortcutHistoryBytes();
    while (total > SHORTCUT_BYTE_LIMIT && shortcutHistory.undo.length + shortcutHistory.redo.length > 1) {
        const dropped = shortcutHistory.undo.length ? shortcutHistory.undo.shift() : shortcutHistory.redo.shift();
        total -= dropped.bytes || 0;
    }
}
function shortcutResetHistory() {
    shortcutHistory.undo.length = 0;
    shortcutHistory.redo.length = 0;
}
function shortcutPushHistory() {
    shortcutHistory.undo.push(shortcutSnapshot());
    shortcutHistory.redo.length = 0;
    shortcutTrimHistory();
}
function shortcutUndo() {
    if (!shortcutHistory.undo.length) return false;
    const current = shortcutSnapshot();
    const previous = shortcutHistory.undo.pop();
    shortcutRestore(previous);
    shortcutHistory.redo.push(current);
    shortcutTrimHistory();
    return true;
}
function shortcutRedo() {
    if (!shortcutHistory.redo.length) return false;
    const current = shortcutSnapshot();
    const next = shortcutHistory.redo.pop();
    shortcutRestore(next);
    shortcutHistory.undo.push(current);
    shortcutTrimHistory();
    return true;
}
function shortcutRename() {
    const id = selectedObjectId;
    if (!id || sceneObjects[id].readOnly || sceneObjects[id].locked) return false;
    renamingId = id;
    renderExplorer();
    requestAnimationFrame(() => {
        const input = explorerEl.querySelector('.rename-input');
        if (input) { input.focus(); input.select(); }
    });
    return true;
}
function shortcutCopy(cut) {
    const ids = cut ? shortcutEditableSelection() : shortcutSelection();
    if (!ids.length) return false;
    clipboard = makeClip(ids, !!cut);
    if (cut) for (const id of ids) if (sceneObjects[id]) deleteItem(id);
    toast(cut ? 'Cut ' + ids.length + ' item' + (ids.length === 1 ? '' : 's') + '.' : 'Copied ' + ids.length + ' item' + (ids.length === 1 ? '' : 's') + '.');
    return true;
}
function shortcutPaste(asChild) {
    if (!clipboard) return false;
    const target = asChild ? selectedObjectId : (selectedObjectId && sceneObjects[selectedObjectId] ? sceneObjects[selectedObjectId].parent : 'world');
    if (asChild && !target) { toast('Select a parent first, or use Ctrl+V to paste beside the selection.', 'warn'); return false; }
    pasteInto(target || 'world');
    return true;
}
function shortcutDuplicate() {
    const ids = shortcutSelection();
    if (!ids.length) return false;
    const saved = clipboard;
    clipboard = makeClip(ids, false);
    const parent = sceneObjects[ids[0]] ? sceneObjects[ids[0]].parent : 'world';
    pasteInto(parent);
    if (saved) clipboard = saved;
    return true;
}
function shortcutSelectAll() {
    const ids = Object.entries(sceneObjects).filter(([, o]) => !o.readOnly).map(([id]) => id);
    const roots = topRoots(ids);
    multiSel.clear();
    for (const id of roots) multiSel.add(id);
    selectedObjectId = roots[0] || null;
    renderExplorer(); renderProperties();
    return roots.length > 0;
}
function shortcutDelete() {
    const ids = shortcutEditableSelection();
    if (!ids.length) return false;
    for (const id of ids) if (sceneObjects[id]) deleteItem(id);
    multiSel.clear();
    return true;
}
function shortcutEscape() {
    if (multiSel.size) { multiSel.clear(); renderExplorer(); renderProperties(); return true; }
    if (selectedObjectId) { selectedObjectId = null; renderExplorer(); renderProperties(); return true; }
    return false;
}
function shortcutIsTyping() {
    const el = document.activeElement;
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if (el.tagName === 'INPUT') {
        const type = (el.type || 'text').toLowerCase();
        return !['checkbox', 'radio', 'button', 'range', 'color'].includes(type);
    }
    return !!el.isContentEditable;
}
function shortcutModalOpen() {
    return [...document.querySelectorAll('.modal-overlay, .confirm-overlay')].some(el => el.classList.contains('active'))
        || (typeof itemMenu !== 'undefined' && !itemMenu.hidden)
        || (typeof addMenu !== 'undefined' && !addMenu.hidden);
}
function shortcutBlocked() {
    return shortcutIsTyping() || shortcutModalOpen();
}
function shortcutKey(e) {
    if (shortcutBlocked()) return;
    const key = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (simulationRunning) {
        // Simulation owns Space, Shift, arrows and movement. Never run an editor edit command over it.
        return;
    }
    if (mod) {
        let handled = true;
        if (key === 'c') shortcutCopy(false);
        else if (key === 'x') shortcutCopy(true);
        else if (key === 'v') shortcutPaste(!!e.shiftKey);
        else if (key === 'd') shortcutDuplicate();
        else if (key === 'a') shortcutSelectAll();
        else if (key === 'm') groupSelected();
        else if (key === 'u') unionSelected(e.shiftKey ? 'intersect' : 'union', selectedObjectId || [...multiSel][0]);
        else if (key === 'g' && !e.shiftKey) groupSelected();
        else if (key === 'z') handled = e.shiftKey ? shortcutRedo() : shortcutUndo();
        else if (key === 'y') handled = shortcutRedo();
        else handled = false;
        if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
        return;
    }
    if (key === 'delete' || key === 'backspace') {
        if (shortcutDelete()) { e.preventDefault(); e.stopImmediatePropagation(); }
    } else if (key === 'escape') {
        if (shortcutEscape()) { e.preventDefault(); e.stopImmediatePropagation(); }
    } else if (key === 'f') {
        if (selectedObjectId) { moveCameraTo(selectedObjectId); e.preventDefault(); e.stopImmediatePropagation(); }
    } else if (key === ' ') {
        if (shortcutRename()) { e.preventDefault(); e.stopImmediatePropagation(); }
    }
}
// Existing menus and drag/drop call the same editor functions as the shortcuts. Wrap the mutating entry points so an
// undo entry exists no matter where the change came from. Calls made by another wrapped operation are suppressed so a
// union or a group records one snapshot, not one per child.
let shortcutHistoryBusy = 0;
function shortcutWrapHistory(fn) {
    return function (...args) {
        if (shortcutHistoryBusy) return fn.apply(this, args);
        shortcutPushHistory();
        shortcutHistoryBusy++;
        try { return fn.apply(this, args); }
        finally { shortcutHistoryBusy--; }
    };
}
for (const [name, fn] of Object.entries({ addInstance, reparent, deleteItem, pasteInto, groupSelected, ungroupSelected, unionSelected })) {
    if (typeof fn !== 'function') continue;
    const wrapped = shortcutWrapHistory(fn);
    if (name === 'addInstance') addInstance = wrapped;
    else if (name === 'reparent') reparent = wrapped;
    else if (name === 'deleteItem') deleteItem = wrapped;
    else if (name === 'pasteInto') pasteInto = wrapped;
    else if (name === 'groupSelected') groupSelected = wrapped;
    else if (name === 'ungroupSelected') ungroupSelected = wrapped;
    else if (name === 'unionSelected') unionSelected = wrapped;
}
window.addEventListener('keydown', shortcutKey, true);
