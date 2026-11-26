// Vanilla Engine — multiplayer wire formats shared by the editor and the Player.
// Everything here is deliberately boring JSON and ArrayBuffers so the transport can be replaced later without
// changing what a world, an edit operation or a chat message means.
const V3D_NET_VERSION = 2;
const V3D_NET_MAX_WORLD = 32 * 1024 * 1024;     // uncompressed JSON bytes
const V3D_NET_CHUNK = 48 * 1024;                // bytes per world transfer message
const V3D_NET_MAX_MESSAGE = 512 * 1024;         // bytes per non-world message
const V3D_ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const V3D_ROOM_CODE_LENGTH = 5;
const V3D_ROOM_PREFIX = 'vanilla3d-4-';
const V3D_EDITOR_GUEST_LIMIT = 4;
const V3D_PLAY_GUEST_LIMIT = 8;
const V3D_HOST_ONLY_TYPES = new Set(['script', 'worldsettings']);
const V3D_GUEST_BLOCK_MESSAGE = 'Scripts and World Settings are host-only in this room.';

// One complete-world transfer per guest at a time, with a cooldown after it starts. A guest that asks repeatedly
// cannot make the host pack and compress the world over and over.
function v3dWorldSendGate(cooldownMs) {
    const sends = new Map();
    return {
        begin(id) {
            if (!id) return false;
            const now = Date.now(), entry = sends.get(id);
            if (entry && (entry.active || now - entry.at < cooldownMs)) return false;
            sends.set(id, { at: now, active: true });
            return true;
        },
        end(id) { const entry = sends.get(id); if (entry) entry.active = false; },
        drop(id) { sends.delete(id); },
        clear() { sends.clear(); }
    };
}

function v3dRoomCode() {
    let code = '';
    const bytes = new Uint32Array(V3D_ROOM_CODE_LENGTH);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 0xffffffff);
    for (let i = 0; i < V3D_ROOM_CODE_LENGTH; i++) code += V3D_ROOM_ALPHABET[bytes[i] % V3D_ROOM_ALPHABET.length];
    return code;
}
function v3dNormalizeRoomCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, V3D_ROOM_CODE_LENGTH);
}
function v3dRoomPeerId(code) {
    return (V3D_ROOM_PREFIX + v3dNormalizeRoomCode(code).toLowerCase()).slice(0, 63);
}
function v3dPeerId() {
    return 'v3d-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function v3dNetColor(seed) {
    const palette = ['#f2b134', '#5ab0f5', '#e978d2', '#5bd6a2', '#ff8b6b', '#b6a6ff', '#72d8e8', '#d4d46a'];
    let n = 0;
    for (const c of String(seed)) n = (n * 31 + c.charCodeAt(0)) >>> 0;
    return palette[n % palette.length];
}
function v3dCleanName(value, fallback) {
    const s = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
    return s || fallback || 'Player';
}
function v3dCleanChat(value) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}
function v3dMessageBytes(msg) {
    try {
        if (msg && msg.data instanceof ArrayBuffer) return msg.data.byteLength + 80;
        if (msg && ArrayBuffer.isView(msg.data)) return msg.data.byteLength + 80;
        return JSON.stringify(msg).length;
    } catch (e) { return V3D_NET_MAX_MESSAGE + 1; }
}
function v3dNetworkOptions() {
    const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    // Optional TURN is a deployment setting, not a key: window.VANILLA_TURN can hold STUN/TURN descriptors.
    if (Array.isArray(window.VANILLA_TURN)) for (const server of window.VANILLA_TURN) if (server && server.urls) iceServers.push(server);
    return { debug: 1, config: { iceServers } };
}
function v3dNetErrorText(err) {
    if (!err) return 'The connection failed.';
    if (err.type === 'unavailable-id') return 'That room code is already in use. Try again.';
    if (err.type === 'peer-unavailable') return 'No room with that code is online. Check the code, or ask the host to keep the tab open.';
    if (err.type === 'network') return 'The signalling server could not be reached. Check the internet connection.';
    if (err.type === 'server-error') return 'The signalling server had an error. Try again in a moment.';
    if (err.type === 'webrtc') return 'The browsers could not establish a direct connection. A TURN relay may be required on this network.';
    return err.message || err.type || 'The connection failed.';
}

// ── World transfer ──
async function v3dGzip(bytes) {
    if (typeof CompressionStream !== 'function') return { bytes, encoding: 'raw' };
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), encoding: 'gzip' };
}
async function v3dGunzip(bytes, encoding) {
    if (encoding !== 'gzip') return bytes;
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot decompress the world transfer.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function v3dPackWorld(world) {
    const json = JSON.stringify(world);
    const raw = new TextEncoder().encode(json);
    if (raw.byteLength > V3D_NET_MAX_WORLD) throw new Error('That world is larger than the 32 MB multiplayer limit.');
    const packed = await v3dGzip(raw);
    const chunks = [];
    for (let offset = 0; offset < packed.bytes.byteLength; offset += V3D_NET_CHUNK) {
        chunks.push(packed.bytes.slice(offset, Math.min(packed.bytes.byteLength, offset + V3D_NET_CHUNK)).buffer);
    }
    return { chunks, encoding: packed.encoding, rawSize: raw.byteLength, size: packed.bytes.byteLength };
}
// PeerJS can hand a binary chunk back as an ArrayBuffer, a typed-array view or a Blob depending on the browser
// and serialization path. Normalize all three before assembling the world; dropping a view or racing a Blob read
// leaves the guest with an incomplete world even though every message arrived.
async function v3dChunkBytes(data) {
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    if (data && typeof data.arrayBuffer === 'function') {
        try { return await data.arrayBuffer(); } catch (e) { return null; }
    }
    return null;
}
async function v3dUnpackWorld(chunks, encoding, expectedSize) {
    let total = 0;
    for (const chunk of chunks) {
        if (!(chunk instanceof ArrayBuffer)) throw new Error('The world transfer was damaged.');
        total += chunk.byteLength;
    }
    if (total > V3D_NET_MAX_WORLD || total > (expectedSize || V3D_NET_MAX_WORLD) + 1024) throw new Error('The world transfer was too large.');
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { joined.set(new Uint8Array(chunk), offset); offset += chunk.byteLength; }
    const raw = await v3dGunzip(joined, encoding);
    if (raw.byteLength > V3D_NET_MAX_WORLD) throw new Error('The world is larger than the 32 MB multiplayer limit.');
    let data;
    try { data = JSON.parse(new TextDecoder().decode(raw)); }
    catch (e) { throw new Error('The world transfer was not valid JSON.'); }
    return validateWorldFile(data);
}

// ── Object diffs ──
// A single object is capped so one malformed edit cannot consume the whole connection. The caller falls back to a
// complete world transfer when an edit batch is larger than this.
const V3D_NET_MAX_OBJECT = 256 * 1024;
// Assets travel only with a complete world transfer. Every edit stream carries the object without its assets, so a
// World Settings change fits the per-object cap no matter how large the world's images or sounds are.
function v3dWireObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const copy = JSON.parse(JSON.stringify(obj));
    if (copy.type === 'worldsettings') delete copy.assets;
    return copy;
}
function v3dValidNetObject(id, obj) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(String(id))) return false;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (obj.readOnly || obj.parent === 'engine' || obj.parent === 'players') return false;
    const allowed = new Set(SAVED_TYPES.map(([t]) => t));
    if (!allowed.has(obj.type)) return false;
    let bytes = 0;
    try { bytes = JSON.stringify(v3dWireObject(obj)).length; } catch (e) { return false; }
    return bytes <= V3D_NET_MAX_OBJECT;
}
function v3dDiffObjects(previous, current) {
    const upsert = [], remove = [];
    for (const [id, obj] of Object.entries(current)) {
        if (!v3dValidNetObject(id, obj)) continue;
        const after = v3dWireObject(obj), before = previous[id];
        if (!before || JSON.stringify(v3dWireObject(before)) !== JSON.stringify(after)) upsert.push([id, after]);
    }
    for (const id of Object.keys(previous)) if (!current[id] && v3dValidNetObject(id, previous[id])) remove.push(id);
    return { upsert, remove };
}
function v3dValidOps(ops, current) {
    if (!ops || typeof ops !== 'object') return false;
    if (!Array.isArray(ops.upsert) || !Array.isArray(ops.remove)) return false;
    if (ops.upsert.length > 500 || ops.remove.length > 500) return false;
    const names = new Set(current ? Object.values(current).map(o => o && o.name) : []);
    const ids = new Set(current ? Object.keys(current) : []);
    for (const pair of ops.upsert) {
        if (!Array.isArray(pair) || pair.length !== 2 || !v3dValidNetObject(pair[0], pair[1])) return false;
        ids.add(pair[0]);
        if (pair[1].name) names.add(pair[1].name);
    }
    const roots = new Set(['world', 'storage', 'scripts', 'ui', 'communications']);
    if (current) {
        const parentOf = new Map();
        for (const [id, obj] of Object.entries(current)) if (obj && typeof obj === 'object') parentOf.set(id, obj.parent);
        for (const pair of ops.upsert) parentOf.set(pair[0], pair[1].parent);
        const removed = new Set(ops.remove);
        for (const pair of ops.upsert) {
            const id = pair[0], obj = pair[1];
            if (!obj.parent || obj.parent === id || obj.parent === obj.name) return false;
            // Model children normally point at their model's UID, while some UI and older worlds use its display
            // name. Accept both, but never a parent that is neither in this world nor in the same batch.
            if (!roots.has(obj.parent) && !names.has(obj.parent) && !ids.has(obj.parent)) return false;
            // Walk the parent chain through the current world and this batch. A cycle or a chain that runs through
            // an object this batch deletes would leave an orphan (or a loop) after the edit is applied.
            let cursor = obj.parent, steps = 0;
            const seen = new Set([id]);
            while (cursor && !roots.has(cursor)) {
                if (seen.has(cursor) || ++steps > 64) return false;
                seen.add(cursor);
                if (removed.has(cursor)) return false;
                if (!parentOf.has(cursor)) break;   // a display-name parent, used by some older worlds
                cursor = parentOf.get(cursor);
            }
        }
    }
    for (const id of ops.remove) if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(String(id))) return false;
    return true;
}
// Guests may edit the world and its UI, but scripts and World Settings stay with the host unless the room allows
// scripts. Removing a container that holds one of those objects is blocked too, so it cannot be deleted indirectly.
function v3dFilterGuestOps(ops, current, allowScripts) {
    const hostOnly = (obj) => !!obj && (obj.type === 'worldsettings' || (obj.type === 'script' && !allowScripts));
    const merged = new Map(current ? Object.entries(current) : []);
    for (const pair of ops.upsert) merged.set(pair[0], pair[1]);
    const children = new Map();
    for (const [id, obj] of merged) {
        if (!obj || typeof obj.parent !== 'string') continue;
        if (!children.has(obj.parent)) children.set(obj.parent, []);
        children.get(obj.parent).push(id);
    }
    const blocked = new Set();
    const hasHostOnlyBelow = (root) => {
        const stack = [root], seen = new Set();
        while (stack.length) {
            const id = stack.pop();
            if (seen.has(id)) continue;
            seen.add(id);
            if (hostOnly(merged.get(id))) return true;
            for (const child of children.get(id) || []) stack.push(child);
        }
        return false;
    };
    for (const pair of ops.upsert) if (hostOnly(pair[1])) blocked.add(pair[0]);
    for (const id of ops.remove) if (hasHostOnlyBelow(id)) blocked.add(id);
    return {
        ops: { upsert: ops.upsert.filter(pair => !blocked.has(pair[0])), remove: ops.remove.filter(id => !blocked.has(id)) },
        blocked: blocked.size
    };
}
function v3dApplyOps(ops) {
    if (!v3dValidOps(ops, sceneObjects)) throw new Error('That edit message was not valid.');
    let changed = 0;
    for (const id of ops.remove) {
        if (sceneObjects[id] && !sceneObjects[id].readOnly) { delete sceneObjects[id]; physicsVelocity.delete(id); changed++; }
    }
    for (const [id, obj] of ops.upsert) {
        if (obj.readOnly || obj.parent === 'engine') continue;
        const next = v3dWireObject(obj);
        // Assets are not part of an edit. Keep the receiver's copies when a settings update arrives without them.
        if (next.type === 'worldsettings' && sceneObjects[id] && Array.isArray(sceneObjects[id].assets)) next.assets = sceneObjects[id].assets;
        sceneObjects[id] = next;
        changed++;
    }
    if (typeof recountTypes === 'function') recountTypes();
    if (typeof vlInstCache !== 'undefined' && vlInstCache.clear) vlInstCache.clear();
    if (typeof renderExplorer === 'function') renderExplorer();
    if (typeof renderProperties === 'function') renderProperties();
    return changed;
}
