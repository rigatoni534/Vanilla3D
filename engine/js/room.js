// Vanilla Engine — shared multiplayer room plumbing.
// The editor room and the play-mode room use the same transport, roster, chat envelope, world transfer and
// retry rules. Those live here once; the mode modules below supply their own UI copy and their own messages
// (edit batches and presence for the editor, avatars and snapshots for play).

function v3dRoomSend(state, msg, id) {
    if (!state.transport) return false;
    if (id) return state.transport.send(id, msg);
    if (state.role === 'host') { state.transport.broadcast(msg); return true; }
    return state.transport.send(state.hostId, msg);
}

function v3dRoomRosterList(state) {
    if (state.roster.length) return state.roster;
    return [{ id: state.selfId || 'you', name: state.name, color: state.color || v3dNetColor(state.selfId), role: state.role || 'host' }, ...state.peers.values()];
}

function v3dRoomBroadcastRoster(state) {
    if (state.role !== 'host') return;
    v3dRoomSend(state, { type: 'roster', people: v3dRoomRosterList(state) });
}

function v3dRoomClearWorldWait(state) {
    if (state.worldTimer) { clearTimeout(state.worldTimer); state.worldTimer = null; }
}

// A guest that gets no world asks again with a bounded backoff. The host's own gate answers at most one
// complete transfer per guest in five seconds, so these repeats cannot make the host pack repeatedly.
function v3dRoomAskForWorld(state, options) {
    v3dRoomClearWorldWait(state);
    if (state.role !== 'guest' || state.ready) return;
    state.worldTimer = setTimeout(() => {
        state.worldTimer = null;
        if (!state.transport || state.role !== 'guest' || state.ready) return;
        if (state.worldRetries >= 5) return;
        state.worldRetries++;
        options.send({ type: 'request-world' });
        if (!options.quiet && options.retryText) options.setStatus(options.retryText, 'bad');
        v3dRoomAskForWorld(state, { ...options, delay: 6000, quiet: true });
    }, Math.max(0, options.delay || 0));
}

function v3dRoomHostWorld(state, guestId, options) {
    if (state.role !== 'host' || !guestId) return;
    if (!state.gate.begin(guestId)) return;
    (async () => {
        try {
            state.transfers++;
            const packed = await v3dPackWorld(buildWorldFile(true));
            const transfer = Math.random().toString(36).slice(2);
            options.send({ type: 'world-begin', transfer, encoding: packed.encoding, size: packed.size, rawSize: packed.rawSize, total: packed.chunks.length }, guestId);
            for (let i = 0; i < packed.chunks.length; i++) {
                if (!state.transport) return;
                options.send({ type: 'world-chunk', transfer, index: i, data: packed.chunks[i] }, guestId);
                if (i % 12 === 11) await new Promise(r => setTimeout(r, 0));
            }
            options.send({ type: 'world-end', transfer }, guestId);
            if (options.sentText) options.setStatus(options.sentText, 'good');
        } catch (err) {
            options.setStatus(options.errorPrefix + err.message, 'bad');
            options.send({ type: 'error', code: 'world', message: err.message }, guestId);
        } finally {
            state.gate.end(guestId);
            state.transfers = Math.max(0, state.transfers - 1);
        }
    })();
}

function v3dRoomBeginWorld(state, msg, setStatus, text) {
    if (state.role !== 'guest') return;
    if (!Number.isInteger(msg.total) || msg.total < 1 || msg.total > 2048) return;
    if (!Number.isFinite(msg.size) || msg.size < 0 || msg.size > V3D_NET_MAX_WORLD + 1024) return;
    v3dRoomClearWorldWait(state);
    state.worldIn = {
        transfer: msg.transfer, encoding: msg.encoding === 'gzip' ? 'gzip' : 'raw', size: msg.size, total: msg.total,
        chunks: new Array(msg.total), received: 0, pending: 0, ended: false, finishing: false, failed: ''
    };
    setStatus(text);
}

function v3dRoomReceiveChunk(state, msg, finish) {
    const transfer = state.worldIn;
    if (!transfer || transfer.transfer !== msg.transfer || !Number.isInteger(msg.index) || msg.index < 0 || msg.index >= transfer.chunks.length) return;
    transfer.pending++;
    (async () => {
        let failure = '';
        try {
            const chunk = await v3dChunkBytes(msg.data);
            if (!(chunk instanceof ArrayBuffer) || chunk.byteLength > V3D_NET_CHUNK + 64) failure = 'The world transfer was damaged.';
            else if (!transfer.chunks[msg.index]) { transfer.chunks[msg.index] = chunk; transfer.received++; }
        } catch (err) {
            failure = err.message || 'The world transfer was damaged.';
        } finally {
            if (failure && !transfer.failed) transfer.failed = failure;
            transfer.pending--;
            if (state.worldIn === transfer) finish();
        }
    })();
}

function v3dRoomReceiveEnd(state, msg, finish) {
    if (state.worldIn && state.worldIn.transfer === msg.transfer) {
        state.worldIn.ended = true;
        finish();
    }
}

async function v3dRoomOpenHost(state, options) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        const code = v3dRoomCode();
        const transport = new V3DTransport();
        try {
            await transport.host(code, { maxGuests: options.maxGuests });
            state.transport = transport; state.role = 'host'; state.room = code; state.selfId = transport.peer.id;
            state.ready = true;
            transport.on('join', (id, profile) => options.join(id, profile));
            transport.on('leave', id => options.leave(id));
            transport.on('data', (id, msg) => options.data(id, msg));
            transport.on('error', err => options.error(err));
            if (options.offline) transport.on('offline', () => options.offline());
            if (options.opened) options.opened(code, transport);
            return true;
        } catch (err) {
            lastError = err;
            transport.close();
            if (err && err.type !== 'unavailable-id') break;
        }
    }
    if (options.failed) options.failed(lastError);
    return false;
}

async function v3dRoomOpenGuest(state, code, profile, options) {
    const normalized = v3dNormalizeRoomCode(code);
    if (normalized.length !== V3D_ROOM_CODE_LENGTH) {
        if (options.invalid) options.invalid();
        return false;
    }
    const transport = new V3DTransport();
    try {
        await transport.join(normalized, profile);
        state.transport = transport; state.role = 'guest'; state.room = normalized; state.selfId = transport.peer.id;
        state.ready = false; state.hostId = '';
        const host = transport.peers()[0];
        transport.on('join', (id, peer) => { if (id !== state.selfId) options.join(id, peer); });
        transport.on('leave', id => options.leave(id));
        transport.on('data', (id, msg) => options.data(id, msg));
        transport.on('error', err => options.error(err));
        if (options.offline) transport.on('offline', () => options.offline());
        if (host) {
            state.hostId = host.id;
            if (options.host) options.host(host);
        }
        if (options.opened) options.opened(normalized, transport, host);
        return true;
    } catch (err) {
        transport.close();
        if (options.failed) options.failed(err);
        return false;
    }
}
