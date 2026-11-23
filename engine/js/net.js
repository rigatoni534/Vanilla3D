// Vanilla Engine — PeerJS transport for rooms.
// This file knows how to open a room, accept guests, send JSON or ArrayBuffers and enforce the connection limits. It
// deliberately knows nothing about worlds, editing or gameplay; protocol.js defines those messages.
class V3DTransport {
    constructor() {
        this.peer = null;
        this.role = null;
        this.room = '';
        this.connections = new Map();       // peer id -> { conn, profile, lastSeen }
        this.maxGuests = V3D_EDITOR_GUEST_LIMIT;
        this.handlers = new Map();
        this.heartbeat = null;
        this.pendingData = [];
        this.closed = false;
    }
    on(event, fn) {
        if (!this.handlers.has(event)) this.handlers.set(event, []);
        this.handlers.get(event).push(fn);
        if (event === 'data' && this.pendingData && this.pendingData.length) {
            const queued = this.pendingData;
            this.pendingData = [];
            for (const args of queued) this.emit('data', ...args);
        }
        return this;
    }
    emit(event, ...args) {
        for (const fn of this.handlers.get(event) || []) {
            try { fn(...args); } catch (e) { console.warn('Multiplayer handler ' + event + ' failed:', e); }
        }
    }
    async _openPeer(id) {
        if (typeof Peer === 'undefined') throw new Error('PeerJS did not load. Multiplayer needs a network connection.');
        const peer = id ? new Peer(id, v3dNetworkOptions()) : new Peer(v3dNetworkOptions());
        this.peer = peer;
        peer.on('error', (err) => {
            if (!this.opened) this.emit('open-error', err);
            else this.emit('error', err);
        });
        peer.on('disconnected', () => {
            if (this.closed) return;
            this.emit('offline');
            try { peer.reconnect(); } catch (e) {}
        });
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('The room took too long to open. Check the internet connection.')), 15000);
            peer.once('open', () => { clearTimeout(timeout); this.opened = true; resolve(); });
            peer.once('error', (err) => { clearTimeout(timeout); reject(err); });
        });
        peer.on('connection', (conn) => this._accept(conn));
        this.heartbeat = setInterval(() => this._ping(), 5000);
        return peer;
    }
    async host(code, options) {
        this.role = 'host';
        this.maxGuests = Math.max(1, Math.min(V3D_PLAY_GUEST_LIMIT, options && options.maxGuests || V3D_EDITOR_GUEST_LIMIT));
        this.room = v3dNormalizeRoomCode(code);
        await this._openPeer(v3dRoomPeerId(this.room));
        return this.room;
    }
    async join(code, profile) {
        this.role = 'guest';
        this.room = v3dNormalizeRoomCode(code);
        await this._openPeer(null);
        if (!this.room) throw new Error('Enter the 5-character room code.');
        const conn = this.peer.connect(v3dRoomPeerId(this.room), { reliable: true, metadata: profile || {} });
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(v3dNetErrorText({ type: 'peer-unavailable' }))), 15000);
            conn.once('open', () => { clearTimeout(timeout); resolve(); });
            conn.once('error', (err) => { clearTimeout(timeout); reject(err); });
            this.peer.once('error', (err) => { clearTimeout(timeout); reject(err); });
        });
        this._attach(conn, true, profile);
        return this.room;
    }
    _accept(conn) {
        if (!this.peer || this.role !== 'host') { conn.close(); return; }
        if (this.connections.size >= this.maxGuests) {
            try { conn.close(); } catch (e) {}
            this.emit('rejected', conn);
            return;
        }
        this._attach(conn, false, conn.metadata || {});
    }
    _attach(conn, outgoing, profile) {
        const id = conn.peer;
        if (this.connections.has(id) && this.connections.get(id).conn !== conn) {
            try { this.connections.get(id).conn.close(); } catch (e) {}
        }
        const entry = { conn, profile: Object.assign({ name: 'Player', color: v3dNetColor(id) }, profile || {}), lastSeen: Date.now() };
        this.connections.set(id, entry);
        const ready = () => {
            if (this.closed) return;
            this.emit('join', id, entry.profile, outgoing);
        };
        if (conn.open) ready();
        else conn.once('open', ready);
        conn.on('data', (data) => this._receive(id, data));
        conn.on('close', () => { this.connections.delete(id); this.emit('leave', id); });
        conn.on('error', (err) => this.emit('connection-error', id, err));
        conn.on('iceStateChanged', (state) => { if (state === 'failed') this.emit('connection-error', id, { type: 'webrtc', message: 'Connection failed.' }); });
    }
    _receive(id, data) {
        const entry = this.connections.get(id);
        if (!entry || !data || typeof data !== 'object') return;
        const now = Date.now();
        entry.lastSeen = now;
        // Rate limit each peer. World chunks are allowed at the same message rate as controls, but a peer cannot flood
        // the editor with thousands of events a second.
        entry.window = entry.window && now - entry.window.start < 1000 ? entry.window : { start: now, count: 0 };
        entry.window.count++;
        if (entry.window.count > 240) return;
        if (v3dMessageBytes(data) > V3D_NET_MAX_MESSAGE + V3D_NET_CHUNK) return;
        if (data.type === 'ping') { this.send(id, { type: 'pong', t: data.t }); return; }
        if (data.type === 'pong') return;
        if (!data.v || data.v !== V3D_NET_VERSION) {
            this.send(id, { type: 'error', v: V3D_NET_VERSION, code: 'version', message: 'This peer is running a different Vanilla3D network version.' });
            return;
        }
        // A joining guest attaches its data handler just after the connection opens. Hold early messages until then
        // instead of dropping a hello or the first world chunk on the floor.
        if (!(this.handlers.get('data') || []).length) {
            this.pendingData.push([id, data, entry.profile]);
            if (this.pendingData.length > 1024) this.pendingData.shift();
            return;
        }
        this.emit('data', id, data, entry.profile);
    }
    _ping() {
        const now = Date.now();
        for (const [id, entry] of this.connections) {
            if (now - entry.lastSeen > 20000) {
                try { entry.conn.close(); } catch (e) {}
                this.connections.delete(id);
                this.emit('leave', id);
                continue;
            }
            this.send(id, { type: 'ping', v: V3D_NET_VERSION, t: now });
        }
    }
    send(id, msg) {
        const entry = this.connections.get(id);
        if (!entry || !entry.conn || !entry.conn.open) return false;
        if (!msg || typeof msg !== 'object') return false;
        if (!msg.v) msg.v = V3D_NET_VERSION;
        try { entry.conn.send(msg); return true; }
        catch (e) { this.emit('error', e); return false; }
    }
    broadcast(msg, exceptId) {
        for (const id of this.connections.keys()) if (id !== exceptId) this.send(id, msg);
    }
    peers() { return [...this.connections.entries()].map(([id, entry]) => ({ id, ...entry.profile })); }
    close() {
        this.closed = true;
        if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
        for (const entry of this.connections.values()) { try { entry.conn.close(); } catch (e) {} }
        this.connections.clear();
        this.pendingData = [];
        if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
        this.peer = null;
        this.role = null;
        this.room = '';
        this.opened = false;
    }
}
