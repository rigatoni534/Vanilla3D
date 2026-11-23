// Vanilla Engine — one keyboard dispatcher for editor commands.
// Shortcuts are captured before the viewport and explorer handlers, and edit commands are refused while typing, while a
// modal or menu is open, and while the simulation owns the keyboard. Space still jumps in Run because the edit path is off.
const shortcutHistory = { undo: [], redo: [] };
const SHORTCUT_LIMIT = 100;

function shortcutSelection() {
    const ids = multiSel.size ? [...multiSel] : (selectedObjectId ? [selectedObjectId] : []);
    return ids.filter(id => sceneObjects[id] && !sceneObjects[id].readOnly);
}
function shortcutEditableSelection() {
    return shortcutSelection().filter(id => !sceneObjects[id].locked);
}
function shortcutSnapshot() {
    return {
        objects: JSON.parse(JSON.stringify(sceneObjects)),
        selected: selectedObjectId,
        multi: [...multiSel],
        counters: JSON.parse(JSON.stringify(counters))
    };
}
function shortcutRestore(snapshot) {
    if (!snapshot) return;
    for (const id of Object.keys(sceneObjects)) delete sceneObjects[id];
    Object.assign(sceneObjects, snapshot.objects);
    for (const key of Object.keys(counters)) counters[key] = snapshot.counters[key] || 0;
    physicsVelocity.clear();
    selectedObjectId = snapshot.selected && sceneObjects[snapshot.selected] ? snapshot.selected : null;
    multiSel.clear();
    for (const id of snapshot.multi) if (sceneObjects[id]) multiSel.add(id);
    renderExplorer(); renderProperties();
    if (typeof host !== 'undefined' && host.markUIDirty) host.markUIDirty();
}
function shortcutPushHistory() {
    shortcutHistory.undo.push(shortcutSnapshot());
    if (shortcutHistory.undo.length > SHORTCUT_LIMIT) shortcutHistory.undo.shift();
    shortcutHistory.redo.length = 0;
}
function shortcutUndo() {
    if (!shortcutHistory.undo.length) return false;
    const current = shortcutSnapshot();
    shortcutRestore(shortcutHistory.undo.pop());
    shortcutHistory.redo.push(current);
    return true;
}
function shortcutRedo() {
    if (!shortcutHistory.redo.length) return false;
    const current = shortcutSnapshot();
    shortcutRestore(shortcutHistory.redo.pop());
    shortcutHistory.undo.push(current);
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
