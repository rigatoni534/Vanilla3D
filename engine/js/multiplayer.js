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
    applying: false, worldIn: null, transfers: 0, remoteSelections: new Map(), chatLines: 0,
    worldTimer: null, worldRetries: 0, allowScripts: false, gate: v3dWorldSendGate(5000)
};
const mpUi = {};

function mpProfile() { return { name: mpState.name, color: mpState.color, version: ENGINE_VERSION }; }
function mpSetStatus(text, kind) {
    if (!mpUi.status) return;
    mpUi.status.textContent = text || '';
    mpUi.status.classList.toggle('bad', kind === 'bad');
    mpUi.status.classList.toggle('good', kind === 'good');
}
function mpClearWorldWait() { v3dRoomClearWorldWait(mpState); }
function mpAskForWorld(delay, quiet) {
    v3dRoomAskForWorld(mpState, {
        delay, quiet,
        send: msg => mpSend(msg),
        setStatus: mpSetStatus,
        retryText: 'Still waiting for the world. Asking the host to send it again…'
    });
}
function mpColorFor(id) {
    const person = mpState.roster.find(p => p.id === id);
    return person ? person.color : v3dNetColor(id);
}
function mpRenderRoster() {
    if (!mpUi.roster) return;
    const people = v3dRoomRosterList(mpState);
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
function mpSend(msg, id) { return v3dRoomSend(mpState, msg, id); }
function mpBroadcastRoster() { v3dRoomBroadcastRoster(mpState); }
function mpHostWorld(guestId) {
    v3dRoomHostWorld(mpState, guestId, {
        send: (msg, id) => mpSend(msg, id),
        setStatus: mpSetStatus,
        sentText: 'Sent the world to a guest.',
        errorPrefix: 'Could not send the world: '
    });
}
function mpPeerJoined(id, profile) {
    if (!id || id === mpState.selfId) return;
    const existing = mpState.peers.get(id);
    if (existing) {
        existing.name = v3dCleanName(profile && profile.name, existing.name);
        if (/^#[0-9a-f]{6}$/i.test(profile && profile.color)) existing.color = profile.color;
        mpRenderRoster();
        return;
    }
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
    mpState.gate.drop(id);
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
    let incoming = ops;
    if (mpState.role === 'host') {
        const filtered = v3dFilterGuestOps(ops, sceneObjects, mpState.allowScripts);
        incoming = filtered.ops;
        if (filtered.blocked) {
            const blockedText = mpState.allowScripts ? 'World Settings are host-only in this room.' : V3D_GUEST_BLOCK_MESSAGE;
            mpSetStatus('Ignored an edit from ' + (mpState.peers.get(from)?.name || 'a guest') + ': ' + blockedText, 'bad');
            mpSend({ type: 'error', code: 'permission', message: blockedText }, from);
        }
        if (!incoming.upsert.length && !incoming.remove.length) return;
    }
    mpState.applying = true;
    try {
        v3dApplyOps(incoming);
        mpState.lastSync = JSON.stringify(sceneObjects);
        if (mpState.role === 'host' && mpState.transport) mpState.transport.broadcast({ type: 'ops', ops: incoming }, from);
        mpSetStatus('Updated by ' + (mpState.peers.get(from)?.name || 'a peer') + '.', 'good');
    } catch (err) {
        mpSetStatus('Could not apply a peer edit: ' + err.message, 'bad');
    } finally {
        mpState.applying = false;
    }
}
function mpWorldFailed(message) {
    mpSetStatus('Could not open the shared world: ' + message, 'bad');
    if (mpState.role === 'guest' && mpState.transport) mpAskForWorld(1800, true);
}
function mpFinishWorldTransfer() {
    const transfer = mpState.worldIn;
    if (!transfer || !transfer.ended || transfer.pending || transfer.finishing) return;
    transfer.finishing = true;
    mpState.worldIn = null;
    if (transfer.failed || transfer.received !== transfer.total) {
        mpWorldFailed(transfer.failed || 'The world transfer was incomplete.');
        return;
    }
    (async () => {
        try {
            const data = await v3dUnpackWorld(transfer.chunks, transfer.encoding, transfer.size);
            if (simulationRunning) setSimulationRunning(false);
            applyWorldFile(data);
            mpState.lastSync = JSON.stringify(sceneObjects);
            mpState.ready = true;
            mpState.connected = true;
            mpClearWorldWait();
            mpSetStatus('World received. You are editing with the host.', 'good');
            mpSend({ type: 'ready' });
            mpBroadcastRoster();
        } catch (err) {
            mpWorldFailed(err.message);
        }
    })();
}
async function mpReceive(id, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') {
        // The host normally learns about a guest from the transport join event. If that event raced the host's
        // handler setup, the guest's hello is the reliable second chance to add the peer and send the world.
        if (mpState.role === 'host' && !mpState.peers.has(id)) mpPeerJoined(id, { name: msg.name, color: msg.color });
        const peer = mpState.peers.get(id);
        if (peer) { peer.name = v3dCleanName(msg.name, peer.name); peer.color = msg.color || peer.color; }
        mpRenderRoster();
        return;
    }
    if (msg.type === 'ready') {
        if (mpState.role === 'host') {
            const who = mpState.peers.get(id)?.name || 'The guest';
            mpSetStatus(who + ' has the world.', 'good');
        }
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
    if (msg.type === 'world-begin') { v3dRoomBeginWorld(mpState, msg, mpSetStatus, 'Receiving the world…'); return; }
    if (msg.type === 'world-chunk') { v3dRoomReceiveChunk(mpState, msg, mpFinishWorldTransfer); return; }
    if (msg.type === 'world-end') { v3dRoomReceiveEnd(mpState, msg, mpFinishWorldTransfer); return; }
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
    mpState.allowScripts = !!(mpUi.allowScripts && mpUi.allowScripts.checked);
    mpSetStatus('Opening a room…');
    await v3dRoomOpenHost(mpState, {
        maxGuests: V3D_EDITOR_GUEST_LIMIT,
        join: (id, profile) => mpPeerJoined(id, profile),
        leave: id => mpPeerLeft(id),
        data: (id, msg) => mpReceive(id, msg),
        error: err => mpSetStatus(v3dNetErrorText(err), 'bad'),
        offline: () => mpSetStatus('Signalling is offline; reconnecting…', 'bad'),
        opened: code => {
            mpState.lastSync = JSON.stringify(sceneObjects);
            mpRenderSession();
            mpSetStatus('Room open. Share the code; guests can edit with you.', 'good');
            mpAppendChat('', 'Room opened. Share the code with up to 4 guests.', true);
        },
        failed: err => mpSetStatus(v3dNetErrorText(err), 'bad')
    });
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
    await v3dRoomOpenGuest(mpState, code, mpProfile(), {
        join: (id, profile) => { if (id !== mpState.selfId) mpPeerJoined(id, profile); },
        leave: id => mpPeerLeft(id),
        data: (id, msg) => mpReceive(id, msg),
        error: err => mpSetStatus(v3dNetErrorText(err), 'bad'),
        offline: () => mpSetStatus('Signalling is offline; reconnecting…', 'bad'),
        host: host => mpPeerJoined(host.id, host),
        opened: normalized => {
            mpState.lastSync = JSON.stringify(sceneObjects);
            mpRenderSession();
            mpState.worldRetries = 0;
            mpSetStatus('Waiting for the host to send the world…');
            mpAppendChat('', 'Joined ' + normalized + '. Waiting for the world…', true);
            // The guest normally receives the world immediately. If that first send is lost, ask for it rather than
            // waiting forever on a blank editor.
            mpAskForWorld(6000, true);
        },
        invalid: () => mpSetStatus('Enter the 5-character room code.', 'bad'),
        failed: err => mpSetStatus(v3dNetErrorText(err), 'bad')
    });
}
function mpEndSession(message, quiet) {
    if (mpState.transport) {
        try { mpState.transport.close(); } catch (e) {}
    }
    mpState.transport = null; mpState.role = null; mpState.room = ''; mpState.hostId = '';
    mpState.peers.clear(); mpState.roster = []; mpState.remoteSelections.clear();
    mpState.gate.clear();
    mpState.allowScripts = false;
    if (mpUi.allowScripts) mpUi.allowScripts.checked = false;
    mpClearWorldWait();
    mpState.ready = false; mpState.worldIn = null; mpState.lastSync = null; mpState.lastPresence = null; mpState.transfers = 0; mpState.worldRetries = 0;
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
    mpUi.allowScripts = document.getElementById('mp-allow-scripts');
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
    if (mpUi.allowScripts) {
        mpUi.allowScripts.checked = false;
        mpUi.allowScripts.addEventListener('change', () => { mpState.allowScripts = mpUi.allowScripts.checked; });
    }
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
