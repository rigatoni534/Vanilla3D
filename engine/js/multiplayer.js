// Vanilla Engine — editor multiplayer.
// The host owns the room. Guests receive a complete world on join, then everyone exchanges object-level edit batches;
// the host validates each batch and relays it. The same transport is used by play mode, but this file only enables the
// editor surface, so a live simulation cannot accidentally overwrite a guest's document.
const MP_NAME_KEY = 'vanilla-mp-name';
const MP_SYNC_MS = 250;
const MP_MAX_BATCH = 350000;          // fall back to a complete world above this many bytes of edits
const mpState = {
    transport: null, role: null, room: '', name: '', color: '', selfId: '', hostId: '',
    peers: new Map(), roster: [], connected: false, ready: false, lastSync: null, lastPresence: null,
    applying: false, worldIn: null, transfers: 0, remoteSelections: new Map(), chatLines: 0
};
const mpUi = {};

function mpProfile() { return { name: mpState.name, color: mpState.color, version: ENGINE_VERSION }; }
function mpSetStatus(text, kind) {
    if (!mpUi.status) return;
    mpUi.status.textContent = text || '';
    mpUi.status.classList.toggle('bad', kind === 'bad');
    mpUi.status.classList.toggle('good', kind === 'good');
}
function mpColorFor(id) {
    const person = mpState.roster.find(p => p.id === id);
    return person ? person.color : v3dNetColor(id);
}
function mpRosterForDisplay() {
    if (mpState.roster.length) return mpState.roster;
    return [{ id: mpState.selfId || 'you', name: mpState.name, color: mpState.color, role: mpState.role || 'host' }, ...mpState.peers.values()];
}
function mpRenderRoster() {
    if (!mpUi.roster) return;
    const people = mpRosterForDisplay();
    mpUi.roster.innerHTML = '';
    for (const person of people) {
        const row = document.createElement('div'); row.className = 'mp-person';
        const dot = document.createElement('i'); dot.style.background = person.color || v3dNetColor(person.id);
        const name = document.createElement('span');
        name.textContent = (person.name || 'Player') + (person.id === mpState.selfId ? ' (you)' : '') + (person.role === 'host' ? ' · host' : '');
        row.appendChild(dot); row.appendChild(name); mpUi.roster.appendChild(row);
    }
    mpPaintPresence();
}
function mpRenderSession() {
    if (!mpUi.session) return;
    const active = !!mpState.transport;
    mpUi.session.classList.toggle('mp-hidden', !active);
    mpUi.dot.hidden = !active;
    if (active) {
        mpUi.room.textContent = mpState.room;
        mpUi.host.disabled = true; mpUi.join.disabled = true;
        mpUi.status.classList.remove('bad');
    } else {
        mpUi.host.disabled = false; mpUi.join.disabled = false;
    }
    mpRenderRoster();
}
function mpAppendChat(from, text, system) {
    if (!mpUi.chat) return;
    const line = document.createElement('div');
    if (system) { line.className = 'sys'; line.textContent = text; }
    else {
        const who = document.createElement('span'); who.className = 'who'; who.textContent = from + ': ';
        line.appendChild(who); line.appendChild(document.createTextNode(text));
    }
    mpUi.chat.appendChild(line);
    mpUi.chat.scrollTop = mpUi.chat.scrollHeight;
    while (mpUi.chat.children.length > 200) mpUi.chat.firstChild.remove();
}
function mpSend(msg, id) {
    if (!mpState.transport) return false;
    if (id) return mpState.transport.send(id, msg);
    if (mpState.role === 'host') { mpState.transport.broadcast(msg); return true; }
    return mpState.transport.send(mpState.hostId, msg);
}
function mpBroadcastRoster() {
    if (mpState.role !== 'host') return;
    mpSend({ type: 'roster', people: mpRosterForDisplay() });
}
function mpHostWorld(guestId) {
    if (mpState.role !== 'host') return;
    (async () => {
        try {
            mpState.transfers++;
            const packed = await v3dPackWorld(buildWorldFile());
            const transfer = Math.random().toString(36).slice(2);
            mpSend({ type: 'world-begin', transfer, encoding: packed.encoding, size: packed.size, rawSize: packed.rawSize, total: packed.chunks.length }, guestId);
            for (let i = 0; i < packed.chunks.length; i++) {
                if (!mpState.transport) return;
                mpSend({ type: 'world-chunk', transfer, index: i, data: packed.chunks[i] }, guestId);
                if (i % 12 === 11) await new Promise(r => setTimeout(r, 0));
            }
            mpSend({ type: 'world-end', transfer }, guestId);
            mpSetStatus('Sent the world to a guest.', 'good');
        } catch (err) {
            mpSetStatus('Could not send the world: ' + err.message, 'bad');
            mpSend({ type: 'error', code: 'world', message: err.message }, guestId);
        } finally {
            mpState.transfers = Math.max(0, mpState.transfers - 1);
        }
    })();
}
function mpPeerJoined(id, profile) {
    if (!id || id === mpState.selfId) return;
    const person = { id, name: v3dCleanName(profile && profile.name, 'Guest'), color: /^#[0-9a-f]{6}$/i.test(profile && profile.color) ? profile.color : v3dNetColor(id), role: 'guest' };
    mpState.peers.set(id, person);
    if (mpState.role === 'guest') mpState.hostId = id;
    mpState.roster = [mpRosterSelf(), ...mpState.peers.values()];
    mpAppendChat('', person.name + ' joined.', true);
    mpRenderRoster();
    if (mpState.role === 'host') {
        mpSend({ type: 'hello', name: mpState.name, color: mpState.color }, id);
        mpSend({ type: 'roster', people: mpState.roster }, id);
        mpHostWorld(id);
        mpBroadcastRoster();
    } else {
        mpSend({ type: 'hello', name: mpState.name, color: mpState.color }, id);
    }
}
function mpRosterSelf() { return { id: mpState.selfId, name: mpState.name, color: mpState.color, role: mpState.role || 'host' }; }
function mpPeerLeft(id) {
    const gone = mpState.peers.get(id);
    mpState.peers.delete(id);
    mpState.remoteSelections.delete(id);
    mpState.roster = [mpRosterSelf(), ...mpState.peers.values()];
    if (gone) mpAppendChat('', gone.name + ' left.', true);
    mpPaintPresence();
    mpRenderRoster();
    if (mpState.role === 'host') mpBroadcastRoster();
    else if (id === mpState.hostId) mpEndSession('The host closed the room.');
}
function mpApplyIncomingOps(ops, from) {
    if (!v3dValidOps(ops, sceneObjects)) { mpSetStatus('Ignored an invalid edit batch from another peer.', 'bad'); return; }
    mpState.applying = true;
    try {
        v3dApplyOps(ops);
        mpState.lastSync = JSON.stringify(sceneObjects);
        if (mpState.role === 'host' && mpState.transport) mpState.transport.broadcast({ type: 'ops', ops }, from);
        mpSetStatus('Updated by ' + (mpState.peers.get(from)?.name || 'a peer') + '.', 'good');
    } catch (err) {
        mpSetStatus('Could not apply a peer edit: ' + err.message, 'bad');
    } finally {
        mpState.applying = false;
    }
}
async function mpReceiveWorldEnd() {
    const transfer = mpState.worldIn;
    if (!transfer) return;
    mpState.worldIn = null;
    try {
        if (transfer.chunks.filter(Boolean).length !== transfer.total) throw new Error('The world transfer was incomplete.');
        const data = await v3dUnpackWorld(transfer.chunks, transfer.encoding, transfer.size);
        if (simulationRunning) setSimulationRunning(false);
        applyWorldFile(data);
        mpState.lastSync = JSON.stringify(sceneObjects);
        mpState.ready = true;
        mpState.connected = true;
        mpSetStatus('World received. You are editing with the host.', 'good');
        mpSend({ type: 'ready' });
        mpBroadcastRoster();
    } catch (err) {
        mpSetStatus('Could not open the shared world: ' + err.message, 'bad');
    }
}
async function mpReceive(id, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') {
        const peer = mpState.peers.get(id);
        if (peer) { peer.name = v3dCleanName(msg.name, peer.name); peer.color = msg.color || peer.color; }
        mpRenderRoster();
        return;
    }
    if (msg.type === 'roster' && Array.isArray(msg.people)) {
        mpState.roster = msg.people.filter(p => p && typeof p.id === 'string').slice(0, 12).map(p => ({
            id: p.id, name: v3dCleanName(p.name, 'Player'), color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : v3dNetColor(p.id), role: p.role === 'host' ? 'host' : 'guest'
        }));
        mpRenderRoster();
        return;
    }
    if (msg.type === 'ops') { mpApplyIncomingOps(msg.ops, id); return; }
    if (msg.type === 'presence') {
        if (typeof msg.selected === 'string' && msg.selected) mpState.remoteSelections.set(id, msg.selected);
        else mpState.remoteSelections.delete(id);
        if (mpState.role === 'host' && mpState.transport) mpState.transport.broadcast(msg, id);
        mpPaintPresence();
        return;
    }
    if (msg.type === 'chat') {
        const text = v3dCleanChat(msg.text);
        if (!text) return;
        const from = mpState.peers.get(id)?.name || (mpState.roster.find(p => p.id === id)?.name) || 'Peer';
        mpAppendChat(from, text, false);
        if (mpState.role === 'host' && mpState.transport) mpState.transport.broadcast({ type: 'chat', text }, id);
        return;
    }
    if (msg.type === 'world-begin') {
        if (mpState.role !== 'guest') return;
        if (!Number.isInteger(msg.total) || msg.total < 1 || msg.total > 2048) return;
        if (!Number.isFinite(msg.size) || msg.size < 0 || msg.size > V3D_NET_MAX_WORLD + 1024) return;
        mpState.worldIn = { transfer: msg.transfer, encoding: msg.encoding === 'gzip' ? 'gzip' : 'raw', size: msg.size, total: msg.total, chunks: new Array(msg.total) };
        mpSetStatus('Receiving the world…');
        return;
    }
    if (msg.type === 'world-chunk') {
        const t = mpState.worldIn;
        if (!t || t.transfer !== msg.transfer || !Number.isInteger(msg.index) || msg.index < 0 || msg.index >= t.chunks.length) return;
        let chunk = msg.data;
        if (chunk && typeof chunk.arrayBuffer === 'function') chunk = await chunk.arrayBuffer();
        if (!(chunk instanceof ArrayBuffer) || chunk.byteLength > V3D_NET_CHUNK + 64) return;
        t.chunks[msg.index] = chunk;
        return;
    }
    if (msg.type === 'world-end') {
        if (mpState.worldIn && mpState.worldIn.transfer === msg.transfer) await mpReceiveWorldEnd();
        return;
    }
    if (msg.type === 'request-world') {
        if (mpState.role === 'host') mpHostWorld(id);
        return;
    }
    if (msg.type === 'error') {
        mpSetStatus(v3dCleanChat(msg.message) || 'The other peer reported a network error.', 'bad');
    }
}
function mpSyncNow() {
    if (!mpState.transport || mpState.applying || !mpState.ready || mpState.transfers > 0) return;
    if (simulationRunning) return;
    if (!mpState.lastSync) { mpState.lastSync = JSON.stringify(sceneObjects); return; }
    const current = JSON.stringify(sceneObjects);
    if (current === mpState.lastSync) return;
    let previous;
    try { previous = JSON.parse(mpState.lastSync); } catch (e) { mpState.lastSync = current; return; }
    const ops = v3dDiffObjects(previous, sceneObjects);
    mpState.lastSync = current;
    if (!ops.upsert.length && !ops.remove.length) return;
    if (JSON.stringify(ops).length > MP_MAX_BATCH) {
        if (mpState.role === 'host') for (const id of mpState.transport.connections.keys()) mpHostWorld(id);
        else mpSend({ type: 'request-world' });
        return;
    }
    mpSend({ type: 'ops', ops });
}
function mpSyncPresence() {
    if (!mpState.transport || !mpState.ready) return;
    const selected = selectedObjectId || '';
    if (selected === mpState.lastPresence) return;
    mpState.lastPresence = selected;
    mpSend({ type: 'presence', selected });
}
function mpPaintPresence() {
    if (typeof document === 'undefined') return;
    for (const row of document.querySelectorAll('#explorer-content .tree-item')) row.style.removeProperty('box-shadow');
    for (const [id, selected] of mpState.remoteSelections) {
        if (!selected) continue;
        const row = document.querySelector('#explorer-content .tree-item[data-id="' + CSS.escape(selected) + '"]');
        if (row) {
            row.style.boxShadow = 'inset 3px 0 0 ' + mpColorFor(id);
            row.title = (row.title ? row.title + ' · ' : '') + 'Selected by ' + (mpState.peers.get(id)?.name || 'a guest');
        }
    }
}
async function mpStartHost() {
    if (mpState.transport) return;
    if (simulationRunning) { mpSetStatus('Stop the simulation before hosting an editing room.', 'bad'); return; }
    mpState.name = v3dCleanName(mpUi.name.value, 'Host');
    mpUi.name.value = mpState.name;
    try { localStorage.setItem(MP_NAME_KEY, mpState.name); } catch (e) {}
    mpState.color = v3dNetColor(mpState.name + ':' + Date.now());
    mpSetStatus('Opening a room…');
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        const code = v3dRoomCode();
        const t = new V3DTransport();
        try {
            await t.host(code, { maxGuests: V3D_EDITOR_GUEST_LIMIT });
            mpState.transport = t; mpState.role = 'host'; mpState.room = code; mpState.selfId = t.peer.id;
            mpState.ready = true; mpState.lastSync = JSON.stringify(sceneObjects);
            t.on('join', (id, profile) => mpPeerJoined(id, profile));
            t.on('leave', id => mpPeerLeft(id));
            t.on('data', (id, msg) => mpReceive(id, msg));
            t.on('error', err => mpSetStatus(v3dNetErrorText(err), 'bad'));
            t.on('offline', () => mpSetStatus('Signalling is offline; reconnecting…', 'bad'));
            mpRenderSession();
            mpSetStatus('Room open. Share the code; guests can edit with you.', 'good');
            mpAppendChat('', 'Room opened. Share the code with up to 4 guests.', true);
            return;
        } catch (err) {
            lastError = err;
            t.close();
            if (err && err.type !== 'unavailable-id') break;
        }
    }
    mpSetStatus(v3dNetErrorText(lastError), 'bad');
}
async function mpJoinRoom() {
    if (mpState.transport) return;
    mpState.name = v3dCleanName(mpUi.name.value, 'Guest');
    mpUi.name.value = mpState.name;
    try { localStorage.setItem(MP_NAME_KEY, mpState.name); } catch (e) {}
    mpState.color = v3dNetColor(mpState.name + ':' + Date.now());
    const code = v3dNormalizeRoomCode(mpUi.code.value);
    if (code.length !== V3D_ROOM_CODE_LENGTH) { mpSetStatus('Enter the 5-character room code.', 'bad'); return; }
    mpSetStatus('Joining ' + code + '…');
    const t = new V3DTransport();
    try {
        await t.join(code, mpProfile());
        mpState.transport = t; mpState.role = 'guest'; mpState.room = code; mpState.selfId = t.peer.id;
        mpState.ready = false; mpState.lastSync = JSON.stringify(sceneObjects);
        const host = t.peers()[0];
        if (host) { mpState.hostId = host.id; mpPeerJoined(host.id, host); }
        t.on('join', (id, profile) => { if (id !== mpState.selfId) mpPeerJoined(id, profile); });
        t.on('leave', id => mpPeerLeft(id));
        t.on('data', (id, msg) => mpReceive(id, msg));
        t.on('error', err => mpSetStatus(v3dNetErrorText(err), 'bad'));
        t.on('offline', () => mpSetStatus('Signalling is offline; reconnecting…', 'bad'));
        mpRenderSession();
        mpSetStatus('Waiting for the host to send the world…');
        mpAppendChat('', 'Joined ' + code + '. Waiting for the world…', true);
    } catch (err) {
        t.close();
        mpSetStatus(v3dNetErrorText(err), 'bad');
    }
}
function mpEndSession(message, quiet) {
    if (mpState.transport) {
        try { mpState.transport.close(); } catch (e) {}
    }
    mpState.transport = null; mpState.role = null; mpState.room = ''; mpState.hostId = '';
    mpState.peers.clear(); mpState.roster = []; mpState.remoteSelections.clear();
    mpState.ready = false; mpState.worldIn = null; mpState.lastSync = null; mpState.lastPresence = null; mpState.transfers = 0;
    mpState.connected = false;
    if (mpUi.session) mpUi.session.classList.add('mp-hidden');
    if (mpUi.dot) mpUi.dot.hidden = true;
    if (mpUi.host) mpUi.host.disabled = false;
    if (mpUi.join) mpUi.join.disabled = false;
    mpPaintPresence();
    if (message) mpSetStatus(message, quiet ? '' : 'bad');
    mpRenderRoster();
}
function mpSendChat() {
    if (!mpState.transport || !mpUi.chatInput) return;
    const text = v3dCleanChat(mpUi.chatInput.value);
    if (!text) return;
    mpUi.chatInput.value = '';
    mpAppendChat(mpState.name, text, false);
    mpSend({ type: 'chat', text });
}
function mpInit() {
    mpUi.modal = document.getElementById('mp-modal');
    mpUi.btn = document.getElementById('mp-btn');
    mpUi.close = document.getElementById('mp-close');
    mpUi.name = document.getElementById('mp-name');
    mpUi.code = document.getElementById('mp-code');
    mpUi.host = document.getElementById('mp-host');
    mpUi.join = document.getElementById('mp-join');
    mpUi.status = document.getElementById('mp-status');
    mpUi.session = document.getElementById('mp-session');
    mpUi.room = document.getElementById('mp-room-code');
    mpUi.copy = document.getElementById('mp-copy');
    mpUi.leave = document.getElementById('mp-leave');
    mpUi.roster = document.getElementById('mp-roster');
    mpUi.chat = document.getElementById('mp-chat');
    mpUi.chatInput = document.getElementById('mp-chat-input');
    mpUi.dot = document.getElementById('mp-dot');
    if (!mpUi.modal || !mpUi.btn) return;
    try { mpUi.name.value = localStorage.getItem(MP_NAME_KEY) || 'Player'; } catch (e) { mpUi.name.value = 'Player'; }
    mpState.name = mpUi.name.value;
    mpState.color = v3dNetColor(mpState.name);
    mpUi.btn.addEventListener('click', () => { mpUi.modal.classList.add('active'); mpRenderSession(); setTimeout(() => mpUi.name.focus(), 50); });
    mpUi.close.addEventListener('click', () => mpUi.modal.classList.remove('active'));
    mpUi.modal.addEventListener('mousedown', e => { if (e.target === mpUi.modal) mpUi.modal.classList.remove('active'); });
    mpUi.host.addEventListener('click', mpStartHost);
    mpUi.join.addEventListener('click', mpJoinRoom);
    mpUi.code.addEventListener('input', () => { mpUi.code.value = v3dNormalizeRoomCode(mpUi.code.value); });
    mpUi.code.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mpJoinRoom(); } });
    mpUi.leave.addEventListener('click', () => mpEndSession('Left the room.', true));
    mpUi.copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(mpState.room); mpSetStatus('Room code copied.', 'good'); }
        catch (e) { mpSetStatus('Select the code and copy it manually.', 'bad'); }
    });
    mpUi.chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mpSendChat(); } });
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape' && mpUi.modal.classList.contains('active')) { e.preventDefault(); mpUi.modal.classList.remove('active'); }
    }, true);
    mpUi.name.addEventListener('change', () => {
        mpState.name = v3dCleanName(mpUi.name.value, 'Player'); mpUi.name.value = mpState.name;
        mpState.color = v3dNetColor(mpState.name);
        try { localStorage.setItem(MP_NAME_KEY, mpState.name); } catch (e) {}
        if (mpState.transport) { mpSend({ type: 'hello', name: mpState.name, color: mpState.color }); mpBroadcastRoster(); }
    });
    setInterval(() => { if (mpState.transport) { mpSyncNow(); mpSyncPresence(); } }, MP_SYNC_MS);
    new MutationObserver(mpPaintPresence).observe(document.getElementById('explorer-content'), { childList: true, subtree: true });
    window.addEventListener('beforeunload', () => { if (mpState.transport) mpState.transport.close(); });
    mpRenderSession();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mpInit);
else mpInit();
