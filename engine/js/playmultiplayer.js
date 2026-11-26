// Vanilla Engine — the play-mode room.
// The host runs the simulation and streams object changes to guests. A guest receives the host's world, then follows
// the live snapshot stream in a read-only view; the editor's own multiplayer file handles co-editing separately.
const playNet = {
    transport: null, role: null, room: '', name: 'Player', selfId: '', hostId: '',
    peers: new Map(), roster: [], ready: false, worldIn: null, transfers: 0, lastSnapshot: null, lastWorld: 0, closed: false,
    avatars: new Map(), inputs: new Map(), followModel: '', lastFollow: 0, keys: {},
    worldTimer: null, worldRetries: 0
};
const playUi = {};

function playUiInit() {
    playUi.panel = document.getElementById('play-net');
    playUi.role = document.getElementById('pn-role');
    playUi.code = document.getElementById('pn-code');
    playUi.status = document.getElementById('pn-status');
    playUi.roster = document.getElementById('pn-roster');
    playUi.chat = document.getElementById('pn-chat');
    playUi.chatInput = document.getElementById('pn-chat-input');
    playUi.copy = document.getElementById('pn-copy');
    playUi.leave = document.getElementById('pn-leave');
    if (!playUi.panel) return;
    playUi.copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(playNet.room); playSetStatus('Room code copied.'); }
        catch (e) { playSetStatus('Select the code and copy it manually.'); }
    });
    playUi.leave.addEventListener('click', () => { playLeave(); });
    playUi.chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); playSendChat(); } });
    window.addEventListener('keydown', e => {
        if (playNet.role !== 'guest' || playNet.closed) return;
        const tag = String(e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        playNet.keys[e.key.toLowerCase()] = true;
        if (e.key === ' ') e.preventDefault();
    });
    window.addEventListener('keyup', e => { playNet.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { playNet.keys = {}; });
}
function playSetStatus(text) { if (playUi.status) playUi.status.textContent = text || ''; }
function playClearWorldWait() {
    if (playNet.worldTimer) { clearTimeout(playNet.worldTimer); playNet.worldTimer = null; }
}
function playAskForWorld(delay, quiet) {
    playClearWorldWait();
    if (playNet.role !== 'guest' || playNet.ready) return;
    playNet.worldTimer = setTimeout(() => {
        playNet.worldTimer = null;
        if (!playNet.transport || playNet.role !== 'guest' || playNet.ready) return;
        if (playNet.worldRetries >= 5) return;
        playNet.worldRetries++;
        playSend({ type: 'request-world' });
        if (!quiet) playSetStatus('Still waiting for the host world. Asking again…');
        playAskForWorld(6000, true);
    }, Math.max(0, delay));
}
function playRosterSelf() { return { id: playNet.selfId, name: playNet.name, color: v3dNetColor(playNet.selfId), role: playNet.role || 'guest' }; }
function playRosterList() { return playNet.roster.length ? playNet.roster : [playRosterSelf(), ...playNet.peers.values()]; }
function playRenderRoster() {
    if (!playUi.roster) return;
    playUi.roster.innerHTML = '';
    for (const person of playRosterList()) {
        const row = document.createElement('span'); row.className = 'pn-person';
        const dot = document.createElement('i'); dot.style.background = person.color || v3dNetColor(person.id);
        const name = document.createElement('span'); name.textContent = (person.name || 'Player') + (person.id === playNet.selfId ? ' (you)' : '') + (person.role === 'host' ? ' · host' : '');
        row.append(dot, name); playUi.roster.appendChild(row);
    }
}
function playShow(role, room) {
    if (!playUi.panel) return;
    playUi.panel.hidden = false;
    playUi.role.textContent = role === 'host' ? 'Hosting' : 'Watching';
    playUi.code.textContent = room || '-----';
    playRenderRoster();
}
function playAppendChat(from, text, system) {
    if (!playUi.chat) return;
    const line = document.createElement('div');
    if (system) { line.className = 'sys'; line.textContent = text; }
    else {
        const who = document.createElement('span'); who.className = 'who'; who.textContent = from + ': ';
        line.append(who, document.createTextNode(text));
    }
    playUi.chat.appendChild(line);
    playUi.chat.scrollTop = playUi.chat.scrollHeight;
    while (playUi.chat.children.length > 120) playUi.chat.firstChild.remove();
}
function playSend(msg, id) {
    if (!playNet.transport) return false;
    if (id) return playNet.transport.send(id, msg);
    if (playNet.role === 'host') { playNet.transport.broadcast(msg); return true; }
    return playNet.transport.send(playNet.hostId, msg);
}
function playBroadcastRoster() {
    if (playNet.role !== 'host') return;
    playSend({ type: 'roster', people: playRosterList() });
}
function playSendChat() {
    if (!playNet.transport || !playUi.chatInput) return;
    const text = v3dCleanChat(playUi.chatInput.value);
    if (!text) return;
    playUi.chatInput.value = '';
    playAppendChat(playNet.name, text, false);
    playSend({ type: 'chat', text });
}
function playLeave() {
    playNet.closed = true;
    playClearWorldWait();
    if (playNet.transport) { try { playNet.transport.close(); } catch (e) {} }
    playNet.transport = null;
    if (playUi.panel) playUi.panel.hidden = true;
    if (typeof location !== 'undefined') location.href = '../player/';
}
function playPeerJoined(id, profile) {
    if (!id || id === playNet.selfId) return;
    const existing = playNet.peers.get(id);
    if (existing) {
        existing.name = v3dCleanName(profile && profile.name, existing.name);
        if (/^#[0-9a-f]{6}$/i.test(profile && profile.color)) existing.color = profile.color;
        playRenderRoster();
        return;
    }
    playNet.peers.set(id, { id, name: v3dCleanName(profile && profile.name, 'Guest'), color: /^#[0-9a-f]{6}$/i.test(profile && profile.color) ? profile.color : v3dNetColor(id), role: 'guest' });
    if (playNet.role === 'guest') playNet.hostId = id;
    playNet.roster = [playRosterSelf(), ...playNet.peers.values()];
    playRenderRoster();
    playAppendChat('', (profile && profile.name ? profile.name : 'A guest') + ' joined.', true);
    if (playNet.role === 'host') {
        playSend({ type: 'hello', name: playNet.name, color: v3dNetColor(playNet.selfId) }, id);
        playSend({ type: 'roster', people: playNet.roster }, id);
        playCreateAvatar(id, playNet.peers.get(id)?.name || 'Guest');
        playHostWorld(id);
        playBroadcastRoster();
    } else {
        playSend({ type: 'hello', name: playNet.name, color: v3dNetColor(playNet.selfId) }, id);
    }
}
function playPeerLeft(id) {
    const gone = playNet.peers.get(id);
    playNet.peers.delete(id);
    playNet.inputs.delete(id);
    if (playNet.role === 'host') playRemoveAvatar(id);
    playNet.roster = [playRosterSelf(), ...playNet.peers.values()];
    playRenderRoster();
    if (gone) playAppendChat('', gone.name + ' left.', true);
    if (playNet.role === 'host') playBroadcastRoster();
    else if (id === playNet.hostId) playSetStatus('The host closed the room. Leave when ready.');
}
// ── Remote avatars ──
// Guests do not run their own simulation. The host owns a small, anchored avatar for each guest and moves it from
// the guest's input; the guest follows that model through the same snapshot stream as the rest of the world.
function playAvatarName(id) {
    return 'Guest_' + String(id).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) + '_' + Math.random().toString(36).slice(2, 5);
}
function playCreateAvatar(id, name, target) {
    if (playNet.role !== 'host' || playNet.avatars.has(id)) return null;
    const setup = makePlayerSetup(newId);
    const modelPair = setup.find(([, o]) => o.type === 'model');
    if (!modelPair) return null;
    const modelName = playAvatarName(id);
    const base = pc.modelId && pc.pos ? { x: pc.pos.x, y: pc.pos.y, z: pc.pos.z } : { x: 0, y: 2, z: 0 };
    const count = playNet.avatars.size;
    const pos = { x: base.x + 2 + count * 2, y: base.y, z: base.z + 1 };
    const partIds = [];
    const parts = [];
    let modelId = '';
    for (const [oldId, raw] of setup) {
        if (raw.type === 'script') continue;
        const o = JSON.parse(JSON.stringify(raw));
        const nid = newId();
        if (oldId === modelPair[0]) {
            modelId = nid;
            o.name = modelName; o.parent = 'world'; o.x = pos.x; o.y = pos.y; o.z = pos.z;
        } else {
            // Children must point at the model's UID, not its display name. The world save and the snapshot diff
            // both follow parent UIDs, so a name here would send the model without its Human and body parts.
            o.parent = modelId;
            if (o.type === 'human') { o.playerName = v3dCleanName(name, 'Guest'); o.health = Math.max(1, o.maxHealth || 100); }
            if (isShape(o)) { o.anchored = true; o.collidable = false; o.reactsToPhysics = false; }
            parts.push({ id: nid, dx: o.x || 0, dy: o.y || 0, dz: o.z || 0, rotY: +o.rotY || 0 });
            partIds.push(nid);
        }
        sceneObjects[nid] = o;
    }
    const avatar = { id, name: v3dCleanName(name, 'Guest'), model: modelId, modelName, parts, partIds, pos, theta: 0, vy: 0, onGround: false, dirty: true };
    playNet.avatars.set(id, avatar);
    playPlaceAvatar(avatar);
    if (typeof recountTypes === 'function') recountTypes();
    if (typeof renderExplorer === 'function') renderExplorer();
    playSend({ type: 'play-avatar', model: modelId }, target || id);
    return avatar;
}
function playPlaceAvatar(avatar) {
    for (const p of avatar.parts) {
        const o = sceneObjects[p.id]; if (!o) continue;
        const c = Math.cos(avatar.theta), s = Math.sin(avatar.theta);
        o.x = avatar.pos.x + p.dx * c - p.dz * s;
        o.z = avatar.pos.z + p.dx * s + p.dz * c;
        o.y = avatar.pos.y + p.dy;
        o.rotY = p.rotY - avatar.theta * 180 / Math.PI;
    }
    const model = sceneObjects[avatar.model];
    if (model) { model.x = avatar.pos.x; model.y = avatar.pos.y; model.z = avatar.pos.z; }
}
function playRemoveAvatar(id) {
    const avatar = playNet.avatars.get(id);
    if (!avatar) return;
    playNet.avatars.delete(id);
    const model = sceneObjects[avatar.model];
    if (model) delete sceneObjects[avatar.model];
    for (const p of avatar.parts) delete sceneObjects[p.id];
    for (const [oid, o] of Object.entries(sceneObjects)) if (o && (o.parent === avatar.model || o.parent === avatar.modelName)) delete sceneObjects[oid];
    if (typeof recountTypes === 'function') recountTypes();
}
function playStepAvatars() {
    if (playNet.role !== 'host' || !simulationRunning) return;
    const dt = 0.05;
    for (const avatar of playNet.avatars.values()) {
        const inp = playNet.inputs.get(avatar.id) || {};
        const f = Math.max(-1, Math.min(1, Number(inp.f) || 0)), r = Math.max(-1, Math.min(1, Number(inp.r) || 0));
        let mx = Math.sin(Number(inp.yaw) || 0) * f + Math.cos(Number(inp.yaw) || 0) * r;
        let mz = -Math.cos(Number(inp.yaw) || 0) * f + Math.sin(Number(inp.yaw) || 0) * r;
        const len = Math.hypot(mx, mz);
        if (len > 0) { mx /= len; mz /= len; } else { mx = 0; mz = 0; }
        if (len > 0) {
            const want = Math.atan2(mx, -mz);
            avatar.theta += Math.atan2(Math.sin(want - avatar.theta), Math.cos(want - avatar.theta)) * (1 - Math.exp(-14 * dt));
        }
        const g = currentGravity();
        const hw = 0.5, hd = 0.35, hh = 1.8;
        const ex = Math.abs(Math.cos(avatar.theta)) * hw + Math.abs(Math.sin(avatar.theta)) * hd;
        const ez = Math.abs(Math.sin(avatar.theta)) * hw + Math.abs(Math.cos(avatar.theta)) * hd;
        const b = { minX: avatar.pos.x - ex, maxX: avatar.pos.x + ex, minY: avatar.pos.y, maxY: avatar.pos.y + hh, minZ: avatar.pos.z - ez, maxZ: avatar.pos.z + ez };
        const cols = playerColliders(new Set(avatar.partIds));
        const speed = inp.sprint ? 6 : 3.5;
        if (inp.jump && avatar.onGround && g < 0) { avatar.vy = Math.sqrt(2 * -g * 1.5); avatar.onGround = false; }
        avatar.vy += g * dt;
        avatar.vy /= 1 + 0.00016 * Math.abs(avatar.vy) * dt;
        const old = { theta: pc.theta, hw: pc.hw, hd: pc.hd };
        pc.theta = avatar.theta; pc.hw = hw; pc.hd = hd;
        try {
            pcMoveAxis(b, cols, 0, mx * speed * dt);
            pcMoveAxis(b, cols, 2, mz * speed * dt);
            if (avatar.onGround) {
                const up = pcSupport(b, cols, b.minY + PC_EPS, b.minY + PC_STEP);
                if (up > -Infinity) { b.maxY += up - b.minY; b.minY = up; }
            }
            const hit = pcMoveVertical(b, cols, avatar.vy * dt);
            avatar.onGround = hit === 1;
            if (hit) avatar.vy = 0;
        } finally { pc.theta = old.theta; pc.hw = old.hw; pc.hd = old.hd; }
        avatar.pos = { x: (b.minX + b.maxX) / 2, y: b.minY, z: (b.minZ + b.maxZ) / 2 };
        avatar.dirty = true;
        playPlaceAvatar(avatar);
    }
}
function playFollowAvatar() {
    if (playNet.role !== 'guest' || !playNet.followModel) return;
    const model = sceneObjects[playNet.followModel];
    if (!model) return;
    const now = Date.now();
    if (now - playNet.lastFollow < 180) return;
    playNet.lastFollow = now;
    let cx = model.x || 0, cy = (model.y || 0) + 1, cz = model.z || 0, d = 7;
    if (typeof getModelBounds === 'function') {
        const b = getModelBounds(playNet.followModel);
        if (b) { cx = (b.minX + b.maxX) / 2; cy = (b.minY + b.maxY) / 2; cz = (b.minZ + b.maxZ) / 2; d = Math.max(5, Math.max(b.width, b.height, b.length) * 2.3); }
    }
    camPosX = cx - fwdX * d; camPosY = cy - fwdY * d + 0.4; camPosZ = cz - fwdZ * d;
}
function playInputTick() {
    if (playNet.role !== 'guest' || !playNet.transport || !playNet.ready) return;
    const keys = playNet.keys || {};
    const f = (keyState['w'] ? 1 : 0) - (keyState['s'] ? 1 : 0);
    const r = (keyState['d'] ? 1 : 0) - (keyState['a'] ? 1 : 0);
    playSend({ type: 'play-input', f, r, jump: !!keys[' '], sprint: !!keys['shift'], yaw: angleY });
}
async function playHostWorld(guestId) {
    playNet.transfers++;
    try {
        const packed = await v3dPackWorld(buildWorldFile(true));
        const transfer = Math.random().toString(36).slice(2);
        playSend({ type: 'world-begin', transfer, encoding: packed.encoding, size: packed.size, rawSize: packed.rawSize, total: packed.chunks.length }, guestId);
        for (let i = 0; i < packed.chunks.length; i++) {
            playSend({ type: 'world-chunk', transfer, index: i, data: packed.chunks[i] }, guestId);
            if (i % 12 === 11) await new Promise(r => setTimeout(r, 0));
        }
        playSend({ type: 'world-end', transfer }, guestId);
        playNet.lastWorld = Date.now();
    } catch (err) { playSetStatus('Could not send the world: ' + err.message); }
    finally { playNet.transfers = Math.max(0, playNet.transfers - 1); }
}
function playWorldFailed(message) {
    playSetStatus('Could not open the host world: ' + message);
    if (playNet.role === 'guest' && playNet.transport) playAskForWorld(1800, true);
}
function playFindGuestModel(name) {
    // The host names its avatar model randomly, so find the Human whose PlayerName is us instead of matching the
    // model name. Only fall back to any world model if that avatar is not in the file.
    const who = v3dCleanName(name, 'Guest');
    const human = Object.values(sceneObjects).find(o => o && o.type === 'human' && o.parent && o.parent !== 'world' && o.playerName === who);
    const direct = human && sceneObjects[human.parent] && sceneObjects[human.parent].type === 'model' ? [human.parent, sceneObjects[human.parent]] : null;
    const model = direct
        || human && Object.entries(sceneObjects).find(([, o]) => o && o.type === 'model' && o.name === human.parent)
        || Object.entries(sceneObjects).find(([, o]) => o && o.type === 'model' && o.parent === 'world' && o.name === who)
        || Object.entries(sceneObjects).find(([, o]) => o && o.type === 'model' && o.parent === 'world');
    return model ? model[0] : '';
}
function playFinishWorldTransfer() {
    const transfer = playNet.worldIn;
    if (!transfer || !transfer.ended || transfer.pending || transfer.finishing) return;
    transfer.finishing = true;
    playNet.worldIn = null;
    if (transfer.failed || transfer.received !== transfer.total) {
        playWorldFailed(transfer.failed || 'The world transfer was incomplete.');
        return;
    }
    (async () => {
        try {
            const data = await v3dUnpackWorld(transfer.chunks, transfer.encoding, transfer.size);
            applyWorldFile(data);
            playNet.ready = true;
            playClearWorldWait();
            // The host sends the avatar id before the world. If that message was missed, use a world model so the
            // guest still gets a player and a camera instead of standing at the empty origin.
            if (!(playNet.followModel && sceneObjects[playNet.followModel])) playNet.followModel = playFindGuestModel(playNet.name);
            if (playNet.followModel) playFollowAvatar();
            playSetStatus('World received. Following the host.');
            playSend({ type: 'ready' });
            playSetTimeoutCamera();
            playNet.cameraSet = false;
        } catch (err) { playWorldFailed(err.message); }
    })();
}
function playReceiveWorldEnd() {
    const transfer = playNet.worldIn;
    if (!transfer) return;
    transfer.ended = true;
    playFinishWorldTransfer();
}
function playSetTimeoutCamera() {
    setTimeout(() => {
        const model = Object.entries(sceneObjects).find(([, o]) => o && o.type === 'model' && o.parent === 'world');
        if (model && typeof moveCameraTo === 'function') { moveCameraTo(model[0]); playNet.cameraSet = true; }
    }, 400);
}
async function playReceive(id, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (playNet.role === 'guest' && playNet.hostId && id !== playNet.hostId) return;
    if (msg.type === 'hello') {
        if (playNet.role === 'host' && !playNet.peers.has(id)) playPeerJoined(id, { name: msg.name, color: msg.color });
        const peer = playNet.peers.get(id);
        if (peer) { peer.name = v3dCleanName(msg.name, peer.name); peer.color = msg.color || peer.color; }
        playRenderRoster(); return;
    }
    if (msg.type === 'ready') {
        if (playNet.role === 'host') {
            const who = playNet.peers.get(id)?.name || 'The guest';
            playSetStatus(who + ' has the world.');
            // A snapshot may have gone out while this guest was still unpacking the world and was ignored. Start
            // the diff again so the next tick sends the current scene instead of leaving the guest on initial data.
            playNet.lastSnapshot = '';
        }
        return;
    }
    if (msg.type === 'roster' && Array.isArray(msg.people)) {
        playNet.roster = msg.people.filter(p => p && typeof p.id === 'string').slice(0, 12).map(p => ({
            id: p.id, name: v3dCleanName(p.name, 'Player'), color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : v3dNetColor(p.id), role: p.role === 'host' ? 'host' : 'guest'
        }));
        playRenderRoster(); return;
    }
    if (msg.type === 'play-avatar') {
        if (playNet.role === 'guest' && typeof msg.model === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(msg.model)) {
            playNet.followModel = msg.model;
            playFollowAvatar();
        }
        return;
    }
    if (msg.type === 'play-input') {
        if (playNet.role === 'host' && playNet.avatars.has(id)) {
            playNet.inputs.set(id, { f: Math.max(-1, Math.min(1, Number(msg.f) || 0)), r: Math.max(-1, Math.min(1, Number(msg.r) || 0)), jump: !!msg.jump, sprint: !!msg.sprint, yaw: Number.isFinite(Number(msg.yaw)) ? Number(msg.yaw) : 0 });
        }
        return;
    }
    if (msg.type === 'play-ops') {
        if (playNet.role !== 'guest' || !playNet.ready) return;
        try {
            v3dApplyOps(msg.ops);
            if (!playNet.followModel) {
                const model = Object.entries(sceneObjects).find(([, o]) => o && o.type === 'model' && o.parent === 'world');
                if (model) playNet.followModel = model[0];
            }
            playFollowAvatar();
        } catch (e) { playSetStatus('A world update could not be applied.'); }
        return;
    }
    if (msg.type === 'chat') {
        const text = v3dCleanChat(msg.text);
        if (!text) return;
        const from = playNet.peers.get(id)?.name || (playNet.roster.find(p => p.id === id)?.name) || 'Peer';
        playAppendChat(from, text, false);
        if (playNet.role === 'host' && playNet.transport) playNet.transport.broadcast({ type: 'chat', text }, id);
        return;
    }
    if (msg.type === 'world-begin') {
        if (playNet.role !== 'guest' || !Number.isInteger(msg.total) || msg.total < 1 || msg.total > 2048) return;
        if (!Number.isFinite(msg.size) || msg.size < 0 || msg.size > V3D_NET_MAX_WORLD + 1024) return;
        playClearWorldWait();
        playNet.worldIn = { transfer: msg.transfer, encoding: msg.encoding === 'gzip' ? 'gzip' : 'raw', size: msg.size, total: msg.total, chunks: new Array(msg.total), received: 0, pending: 0, ended: false, finishing: false, failed: '' };
        playSetStatus('Receiving the host world…'); return;
    }
    if (msg.type === 'world-chunk') {
        const t = playNet.worldIn;
        if (!t || t.transfer !== msg.transfer || !Number.isInteger(msg.index) || msg.index < 0 || msg.index >= t.chunks.length) return;
        t.pending++;
        (async () => {
            let failure = '';
            try {
                const chunk = await v3dChunkBytes(msg.data);
                if (!(chunk instanceof ArrayBuffer) || chunk.byteLength > V3D_NET_CHUNK + 64) failure = 'The world transfer was damaged.';
                else if (!t.chunks[msg.index]) { t.chunks[msg.index] = chunk; t.received++; }
            } catch (err) { failure = err.message || 'The world transfer was damaged.'; }
            finally {
                if (failure && !t.failed) t.failed = failure;
                t.pending--;
                if (playNet.worldIn === t) playFinishWorldTransfer();
            }
        })();
        return;
    }
    if (msg.type === 'world-end') {
        if (playNet.worldIn && playNet.worldIn.transfer === msg.transfer) playReceiveWorldEnd();
        return;
    }
    if (msg.type === 'request-world') { if (playNet.role === 'host') playHostWorld(id); }
}
async function playStartHost(name) {
    playNet.name = v3dCleanName(name, 'Host');
    playShow('host', '-----');
    playSetStatus('Opening a room…');
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        const t = new V3DTransport();
        try {
            const code = v3dRoomCode();
            await t.host(code, { maxGuests: V3D_PLAY_GUEST_LIMIT });
            playNet.transport = t; playNet.role = 'host'; playNet.room = code; playNet.selfId = t.peer.id;
            playNet.ready = true; playNet.lastSnapshot = JSON.stringify(sceneObjects);
            t.on('join', (id, profile) => playPeerJoined(id, profile));
            t.on('leave', id => playPeerLeft(id));
            t.on('data', (id, msg) => playReceive(id, msg));
            t.on('error', err => playSetStatus(v3dNetErrorText(err)));
            playShow('host', code);
            playSetStatus('Room open. Guests join with ' + code + '.');
            playAppendChat('', 'Room opened. Guests join with ' + code + '.', true);
            return code;
        } catch (err) { lastError = err; t.close(); if (err && err.type !== 'unavailable-id') break; }
    }
    playSetStatus(v3dNetErrorText(lastError));
    return '';
}
async function playStartGuest(room, name) {
    playNet.name = v3dCleanName(name, 'Guest');
    const code = v3dNormalizeRoomCode(room);
    playShow('guest', code || '-----');
    if (code.length !== V3D_ROOM_CODE_LENGTH) { playSetStatus('That room code is not valid.'); return false; }
    playSetStatus('Joining ' + code + '…');
    const t = new V3DTransport();
    try {
        await t.join(code, { name: playNet.name, color: v3dNetColor(playNet.name) });
        playNet.transport = t; playNet.role = 'guest'; playNet.room = code; playNet.selfId = t.peer.id;
        playNet.ready = false;
        const host = t.peers()[0];
        if (host) { playNet.hostId = host.id; playPeerJoined(host.id, host); }
        t.on('join', (id, profile) => { if (id !== playNet.selfId) playPeerJoined(id, profile); });
        t.on('leave', id => playPeerLeft(id));
        t.on('data', (id, msg) => playReceive(id, msg));
        t.on('error', err => playSetStatus(v3dNetErrorText(err)));
        playShow('guest', code);
        playNet.worldRetries = 0;
        playSetStatus('Waiting for the host world…');
        playAppendChat('', 'Waiting for the host world…', true);
        playAskForWorld(6000, true);
        return true;
    } catch (err) { t.close(); playSetStatus(v3dNetErrorText(err)); return false; }
}
function playSnapshotTick() {
    if (playNet.role !== 'host' || !playNet.transport || !simulationRunning || !playNet.ready || playNet.transfers > 0) return;
    const current = JSON.stringify(sceneObjects);
    if (!playNet.lastSnapshot) { playNet.lastSnapshot = current; return; }
    if (current === playNet.lastSnapshot) return;
    let previous;
    try { previous = JSON.parse(playNet.lastSnapshot); } catch (e) { playNet.lastSnapshot = current; return; }
    const ops = v3dDiffObjects(previous, sceneObjects);
    playNet.lastSnapshot = current;
    if (!ops.upsert.length && !ops.remove.length) return;
    if (JSON.stringify(ops).length > 350000) {
        for (const id of playNet.transport.connections.keys()) playHostWorld(id);
        return;
    }
    playSend({ type: 'play-ops', ops });
}
playUiInit();
setInterval(playSnapshotTick, 100);
setInterval(playStepAvatars, 50);
setInterval(playInputTick, 90);
