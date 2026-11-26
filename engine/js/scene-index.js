// Vanilla Engine — scene structure index. Loaded after scene.js and before the systems that walk children.
// A scene can hold thousands of objects; rebuilding this index once per render or edit avoids re-scanning every
// object for every row, UI node or child lookup. The index is rebuilt lazily and invalidated whenever structure
// changes, so callers always see the current parent/child tree.
let sceneIndexData = null;

function sceneIndexBuild() {
    const children = new Map();
    const all = [];
    const parents = new Map();
    const objectIds = new WeakMap();
    const objectSpace = new WeakMap();
    for (const [id, o] of Object.entries(sceneObjects)) {
        if (!o || typeof o !== 'object') continue;
        all.push([id, o]);
        parents.set(id, o.parent);
        objectIds.set(o, id);
        if (!children.has(o.parent)) children.set(o.parent, []);
        children.get(o.parent).push([id, o]);
    }
    // Resolve each object's owning space once. Parents can be nested deeply, so memoise every step of a chain
    // instead of walking the same ancestor for every child.
    const spaceById = new Map();
    const resolveSpace = (id) => {
        if (spaceById.has(id)) return spaceById.get(id);
        const chain = [];
        let o = sceneObjects[id], result = null, steps = 0;
        while (o && steps++ < 64) {
            if (SPACE_KEYS.includes(o.parent)) { result = o.parent; break; }
            const parentId = o.parent;
            if (!parentId || !sceneObjects[parentId] || parentId === id || chain.includes(parentId)) break;
            chain.push(parentId);
            o = sceneObjects[parentId];
        }
        spaceById.set(id, result);
        for (const ancestor of chain) if (!spaceById.has(ancestor)) spaceById.set(ancestor, result);
        return result;
    };
    for (const [id, o] of all) {
        const space = resolveSpace(id);
        if (space) objectSpace.set(o, space);
    }
    sceneIndexData = { children, all, parents, objectIds, objectSpace, spaceById };
    return sceneIndexData;
}

function sceneIndexEnsure() {
    // Structural edits invalidate the index where they happen. Do not count the scene here: this function is called
    // once per explorer row, so an O(n) check would turn the index back into quadratic work.
    return sceneIndexData || sceneIndexBuild();
}

function sceneIndexInvalidate() {
    sceneIndexData = null;
}

function sceneChildEntries(id) {
    const index = sceneIndexEnsure();
    return index.children.get(id) || [];
}

function sceneSpaceOf(o) {
    if (!o) return null;
    const index = sceneIndexEnsure();
    const id = index.objectIds.get(o);
    // A weak map entry only proves the object was indexed; check its live parent too, so a reparented object
    // cannot report its old space from a stale cache.
    if (id !== undefined && sceneObjects[id] === o && index.parents.get(id) === o.parent) {
        return index.spaceById.get(id) || null;
    }
    const fresh = sceneIndexBuild();
    const freshId = fresh.objectIds.get(o);
    return freshId !== undefined ? (fresh.spaceById.get(freshId) || null) : null;
}

// Keep the engine's existing contract: an object whose parent is a space reports that space; an object in the
// engine space, or one with a missing parent, reports null.
function scenePruneOrphans() {
    const index = sceneIndexBuild();
    const keep = new Set(['engine', ...SPACE_KEYS]);
    const stack = [...keep];
    while (stack.length) {
        const id = stack.pop();
        for (const [childId] of index.children.get(id) || []) {
            if (keep.has(childId)) continue;
            keep.add(childId);
            stack.push(childId);
        }
    }
    let changed = false;
    for (const id of Object.keys(sceneObjects)) {
        if (keep.has(id)) continue;
        delete sceneObjects[id];
        physicsVelocity.delete(id);
        vlInstCache.delete(id);
        if (selectedObjectId === id) selectedObjectId = null;
        changed = true;
    }
    if (changed) sceneIndexInvalidate();
    return changed;
}

// A single counter lets the render loop skip rebuilding the UI DOM when nothing that affects it has changed.
let uiSceneRevision = 0;
function markUISceneChanged() {
    uiSceneRevision++;
}

// Property panels, the viewport and script calls are the editor's mutation surfaces; mark the UI dirty from each
// one without threading a flag through every individual field.
if (typeof document !== 'undefined') {
    for (const eventName of ['input', 'change']) {
        document.addEventListener(eventName, (event) => {
            const target = event.target;
            if (target && typeof target.closest === 'function' && target.closest('#properties-content')) markUISceneChanged();
        }, true);
    }
}
