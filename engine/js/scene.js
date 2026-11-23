// Vanilla Engine — scene data, UI instances, unions and shape makers. Loaded in order by index.html; all files share one global scope.
        const icon = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

        // ───────── Scene data ─────────
        const spaces = {
            world:   { name: 'World',   icon: 'i-world',  addable: true },
            storage: { name: 'Storage', icon: 'i-folder', addable: true },
            scripts: { name: 'Scripts', icon: 'i-script', addable: true },
            ui:      { name: 'UI',      icon: 'i-ui-frame', addable: true },
            communications: { name: 'Communications', icon: 'i-comms', addable: true },
            players: { name: 'Players', icon: 'i-players', addable: false },
            engine:  { name: 'Engine',  icon: 'i-engine', addable: false }
        };
        // ── Childing: an instance's parent is a space id or another instance's UID ──
        const SPACE_KEYS = ['world', 'storage', 'scripts', 'ui', 'communications', 'players'];
        function spaceOf(o) { let n = 0; while (o && !SPACE_KEYS.includes(o.parent) && n++ < 64) o = sceneObjects[o.parent]; return o ? o.parent : null; }
        function isInside(id, ancestorId) { let o = sceneObjects[id], n = 0; while (o && n++ < 64) { if (o.parent === ancestorId) return true; o = sceneObjects[o.parent]; } return false; }
        function pruneOrphans() {
            let changed = true;
            while (changed) { changed = false; for (const [id, o] of Object.entries(sceneObjects)) if (o.parent !== 'engine' && !SPACE_KEYS.includes(o.parent) && !sceneObjects[o.parent]) { delete sceneObjects[id]; physicsVelocity.delete(id); vlInstCache.delete(id); if (selectedObjectId === id) selectedObjectId = null; changed = true; } }
        }
        function dn(type) { const d = (typeof settings !== 'undefined' && settings.defaultNames && settings.defaultNames[type]); return d || ({ prism6: 'Block', model: 'Model', script: 'Script', worldsettings: 'Settings', texture: 'Texture', ball: 'Ball', human: 'Player', wedge: 'Wedge', cylinder: 'Cylinder', sound: 'Sound', highlight: 'Highlight', light: 'Light', simpleeffect: 'SimpleEffect', advancedeffect: 'AdvancedEffect', union: 'Union', frame: 'Frame', text: 'Text', button: 'Button', image: 'Image', input: 'Input', progressbar: 'ProgressBar', clientsocket: 'ClientSocket', serversocket: 'ServerSocket', peerconnection: 'PeerConnection', groupconnection: 'GroupConnection' })[type] || 'Instance'; }
        function preInc(n) { return typeof settings !== 'undefined' && !!(settings.preinclude && settings.preinclude[n]); }
        // Textures: a child of a prism6 that paints chosen faces. Faces use the engine's face order.
        const FACE_LABELS = ['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'];
        const FACE_PICK_ORDER = [4, 5, 0, 1, 3, 2];
        const TEXTURES = { grid: { id: 1, name: 'Grid (0.25, 0.5 and 1 Vm)', note: 'Squares with fine lines every 0.25 Vm, medium lines every 0.5 Vm and bold lines every 1 Vm. Wider lines every 4, 16 and 64 Vm appear in the distance. The grid is locked to the world, so neighboring prisms line up.' } };
        function makeTexture(name, parent, faces, texture) { return { type: 'texture', name, parent, faces: (faces || [4]).slice(), texture: texture || 'grid' }; }
        const HEX6 = /^#[0-9a-f]{6}$/i;
        const prismColor = (o) => HEX6.test(o.color) ? o.color : '#888888';
        // A material is a surface, not a different shape. The shader uses the pattern and the Color property tints it,
        // so a brick wall can still be blue and a grass floor still has the color you chose.
        const MATERIALS = {
            plastic:  { name: 'Plastic',  tint: '#c9cfd9', pattern: 0, spec: 1.0, note: 'Smooth moulded surface. Color sets the plastic.' },
            glass:    { name: 'Glass',    tint: '#9fd9ea', pattern: 1, spec: 2.6, note: 'Cool, glossy surface with a bright fresnel edge.' },
            metal:    { name: 'Metal',    tint: '#b6c0cc', pattern: 2, spec: 2.8, note: 'Brushed metal with a sharp, strong reflection.' },
            grass:    { name: 'Grass',    tint: '#4f8f3a', pattern: 3, spec: 0.25, note: 'Mottled green blades with a matte finish.' },
            brick:    { name: 'Brick',    tint: '#9e4a3a', pattern: 4, spec: 0.35, note: 'Staggered brick courses with pale mortar lines.' },
            tile:     { name: 'Tile',     tint: '#ddd6c8', pattern: 5, spec: 0.8, note: 'Square tiles with grout lines and a light sheen.' },
            carpet:   { name: 'Carpet',   tint: '#6b5a50', pattern: 6, spec: 0.15, note: 'Fine woven fibers with a soft, matte finish.' },
            wood:     { name: 'Wood',     tint: '#8a5a33', pattern: 7, spec: 0.45, note: 'Warm planks with grain and growth rings.' },
            concrete: { name: 'Concrete', tint: '#9a9a94', pattern: 8, spec: 0.3, note: 'Poured stone with a fine, uneven grain.' },
            neon:     { name: 'Neon',     tint: '#38e6ff', pattern: 9, spec: 0.5, note: 'Bright self-lit color. Glows when bloom is on.' }
        };
        const MATERIAL_ORDER = ['plastic', 'glass', 'metal', 'grass', 'brick', 'tile', 'carpet', 'wood', 'concrete', 'neon'];
        const MATERIAL_KEYS = new Set(MATERIAL_ORDER);
        const materialKey = (o) => o && MATERIAL_KEYS.has(o.material) ? o.material : 'plastic';
        const materialDef = (o) => MATERIALS[materialKey(o)];
        const materialId = (o) => MATERIAL_ORDER.indexOf(materialKey(o));
        // A ball is an ellipsoid with the same properties as a prism. Its Size is the radius on each axis.
        function makeBall(name, parent, dims) {
            return Object.assign(makePrism(name, parent, {}), { type: 'ball', length: 0.5, width: 0.5, height: 0.5 }, dims);
        }
        // A wedge is a triangular prism: a ramp whose high side is the back (+Z) and whose slope runs down to the front.
        function makeWedge(name, parent, dims) {
            return Object.assign(makePrism(name, parent, {}), { type: 'wedge' }, dims);
        }
        // A cylinder stands on its end: a round column along Y. Turn it with Rotation to lay it down.
        function makeCylinder(name, parent, dims) {
            return Object.assign(makePrism(name, parent, {}), { type: 'cylinder' }, dims);
        }
        // A union is one solid surface built from its parts. Its cells are only a simple collision proxy, kept in the
        // shape's own space; the mesh is what is drawn.
        function makeUnion(name, parent, dims) {
            return Object.assign(makePrism(name, parent, {}), { type: 'union', cells: [], cellBase: null, mesh: [] }, dims);
        }
        function makeSound(name, parent) {
            return { type: 'sound', name, parent, preset: 'beep', playing: false, looped: false, volume: 0.6, maxDistance: 20 };
        }
        function makeHighlight(name, parent) {
            return { type: 'highlight', name, parent, color: '#ffd23f', overObjects: true };
        }
        // A Light is a point or spot light in the world. It is not a shape: it has no size or collision, only a
        // position, a colour and a reach. Spot lights use the same rotation order as every other instance.
        const LIGHT_TYPES = ['point', 'spot'];
        function makeLight(name, parent, props) {
            return Object.assign({
                type: 'light', name, parent, x: 0, y: 3, z: 0,
                color: '#ffe3ad', brightness: 1.5, range: 14, lightType: 'point', angle: 45,
                enabled: true, castShadows: true, rotX: 90, rotY: 0, rotZ: 0
            }, props);
        }
        const isLight = (o) => !!o && o.type === 'light';
        // ───────── World versions and migrations ─────────
        // A world remembers the version it was created in and the version its content has been migrated to. The
        // engine version it is opened or saved with is kept only as the file's last-writer version, so an old world
        // cannot silently look migrated just because it was saved by a newer editor.
        let loadedWorldMeta = { currentVersion: '', createdVersion: '', engineVersion: '' };
        const WORLD_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/;
        function normalizeWorldVersion(v) {
            const m = WORLD_VERSION_RE.exec(String(v == null ? '' : v).trim());
            return m ? `${+m[1]}.${+m[2]}.${+m[3]}.${m[4] ? +m[4] : 0}` : '';
        }
        function currentEngineVersion() {
            return typeof ENGINE_VERSION === 'string' ? normalizeWorldVersion(ENGINE_VERSION) || ENGINE_VERSION : '0.0.0.0';
        }
        function worldVersionCompare(a, b) {
            const A = (normalizeWorldVersion(a) || '0.0.0.0').split('.').map(Number);
            const B = (normalizeWorldVersion(b) || '0.0.0.0').split('.').map(Number);
            for (let i = 0; i < Math.max(A.length, B.length); i++) {
                const d = (A[i] || 0) - (B[i] || 0);
                if (d) return d > 0 ? 1 : -1;
            }
            return 0;
        }
        function worldVersionLabel(v) { return normalizeWorldVersion(v) || 'Unknown'; }
        // Each entry upgrades a world one content version. Add a new entry here when a release adds something that
        // existing worlds should gain; migrations never remove an instance or overwrite a script that already exists.
        const WORLD_MIGRATIONS = [
            {
                version: '3.13.0.0',
                title: 'Player sockets and rebuilt union surfaces',
                notes: [
                    'Adds the Networking script, and PlayerManagement when a DefaultPlayer model exists without it.',
                    'Rebuilds old unions from their collision cells into real surfaces.',
                    'Fills in player defaults and uploaded-asset details where an older file lacks them.'
                ],
                apply(ws) {
                    const changes = [];
                    const scripts = Object.values(sceneObjects).filter(o => o && o.type === 'script');
                    const hasScript = (name) => scripts.some(o => o.name === name);
                    const hasPlayerSetup = Object.values(sceneObjects).some(o => o && o.type === 'model' && o.name === 'DefaultPlayer' && spaceOf(o) === 'storage') || hasScript('PlayerManagement');
                    if (hasPlayerSetup) {
                        if (!hasScript('PlayerManagement')) {
                            if (typeof makePlayerScript !== 'function') throw new Error('PlayerManagement script is unavailable');
                            const [id, s] = makePlayerScript(newId);
                            sceneObjects[id] = s; changes.push('PlayerManagement script');
                        }
                        if (!hasScript('Networking')) {
                            if (typeof makeNetworkingScript !== 'function') throw new Error('Networking script is unavailable');
                            const [id, s] = makeNetworkingScript(newId);
                            sceneObjects[id] = s; changes.push('Networking script');
                        }
                    }
                    let unions = 0;
                    for (const o of Object.values(sceneObjects)) if (o && o.type === 'union') { ensureUnionMesh(o); unions++; }
                    if (unions) changes.push(unions + ' union surface' + (unions === 1 ? '' : 's'));
                    if (!ws.defaults || !ws.defaults.player) {
                        applyDefaultPlayerStats(ws); changes.push('player defaults');
                    }
                    return changes;
                }
            }
        ];
        function pendingWorldMigrations(ws) {
            const current = normalizeWorldVersion(ws && ws.currentVersion) || '0.0.0.0';
            const latest = currentEngineVersion();
            return WORLD_MIGRATIONS.filter(m => worldVersionCompare(m.version, current) > 0 && worldVersionCompare(m.version, latest) <= 0);
        }
        function applyWorldMigrations(ws) {
            if (!ws) return [];
            const changes = [];
            for (const m of pendingWorldMigrations(ws)) {
                // Only claim the version once its migration finished; a failure leaves the world at the prior version
                // so the Migrate action stays available.
                try { const done = m.apply(ws); ws.currentVersion = m.version; if (Array.isArray(done)) changes.push(...done); }
                catch (err) { console.warn('World migration ' + m.version + ' failed:', err); break; }
            }
            normalizeWorldSettings(ws);
            applyDefaultPlayerStats(ws);
            if (typeof recountTypes === 'function') recountTypes();
            return changes;
        }
        // The stats a DefaultPlayer Human starts with, also shown in World Settings > Defaults.
        const DEFAULT_PLAYER_STATS = Object.freeze({
            health: 100, maxHealth: 100, walkSpeed: 3.5, runSpeed: 6, stamina: 100, maxStamina: 100,
            runStaminaLoss: 3, jumpHeight: 1.5, jumpStaminaLoss: 20, staminaGain: 6.5
        });
        function makeWorldSettings(name, parent, props) {
            return Object.assign({
                type: 'worldsettings', name, parent, timeOfDay: 14, gravity: 9.8, killY: -5000,
                worldName: 'My World', creator: '', description: '', maxPlayers: DEFAULT_MAX_PLAYERS, assets: [],
                createdVersion: currentEngineVersion(), currentVersion: currentEngineVersion(),
                defaults: { player: Object.assign({}, DEFAULT_PLAYER_STATS) }
            }, props);
        }
        function normalizeHumanStats(src) {
            const out = {};
            for (const [key, fallback] of Object.entries(DEFAULT_PLAYER_STATS)) {
                const n = Number(src && src[key]);
                out[key] = Number.isFinite(n) && n >= 0 ? n : fallback;
            }
            return out;
        }
        // The defaults a new Human and the DefaultPlayer template get. They live on the World Settings instance, so the
        // whole setup travels with the world.
        function defaultHumanStats() {
            const ws = activeWorldSettings();
            return normalizeHumanStats(ws && ws.defaults && ws.defaults.player);
        }
        function applyDefaultPlayerStats(ws) {
            if (!ws) return;
            const modelId = Object.keys(sceneObjects).find(id => {
                const o = sceneObjects[id];
                return o && o.type === 'model' && o.name === 'DefaultPlayer' && spaceOf(o) === 'storage';
            });
            const template = modelId ? Object.values(sceneObjects).find(o => o.type === 'human' && o.parent === modelId) : null;
            ws.defaults = ws.defaults && typeof ws.defaults === 'object' ? ws.defaults : {};
            // A world from before this setting has no defaults: its DefaultPlayer Human is the old default, so start
            // from that instead of resetting the character to the engine values.
            if (!ws.defaults.player || typeof ws.defaults.player !== 'object') ws.defaults.player = normalizeHumanStats(template);
            const stats = normalizeHumanStats(ws.defaults.player);
            ws.defaults.player = Object.assign({}, stats);
            if (!modelId) return;
            for (const o of Object.values(sceneObjects)) if (o.type === 'human' && o.parent === modelId) Object.assign(o, stats);
        }
        const isShape = (o) => !!o && (o.type === 'prism6' || o.type === 'ball' || o.type === 'wedge' || o.type === 'cylinder' || o.type === 'union');

        // ───────── Communications ─────────
        // Connections describe how a server and its clients talk. They are data only for now: the editor can create
        // and configure them, but no message is sent or received yet.
        const CONNECTION_TYPES = ['clientsocket', 'serversocket', 'peerconnection', 'groupconnection'];
        const isConnection = (o) => !!o && CONNECTION_TYPES.includes(o.type);
        const DEFAULT_MAX_PLAYERS = 8;
        const CONNECTION_BANDWIDTH_MAX = 1000000;   // kbps; a ClientSocket at 0 is Uncapped
        function makeClientSocket(name, parent, props) {
            return Object.assign({ type: 'clientsocket', name, parent, active: true, client: '', player: '', bandwidth: 0 }, props);
        }
        function makeServerSocket(name, parent, props) {
            return Object.assign({ type: 'serversocket', name, parent, active: true, bandwidth: 4096, maxClients: worldMaxPlayers() }, props);
        }
        function makePeerConnection(name, parent, props) {
            return Object.assign({ type: 'peerconnection', name, parent, active: true, password: '', client1: '', client2: '', player1: '', player2: '' }, props);
        }
        function makeGroupConnection(name, parent, props) {
            return Object.assign({ type: 'groupconnection', name, parent, active: true, password: '', clients: [] }, props);
        }
        // Connections live in the Communications space, so the default name counts them like any other instance type.
        function makeConnection(type, parent) {
            const n = ++counters[type];
            const name = dn(type) + (n === 1 ? '' : ' ' + n);
            const space = parent || 'communications';
            if (type === 'serversocket') return makeServerSocket(name, space);
            if (type === 'peerconnection') return makePeerConnection(name, space);
            if (type === 'groupconnection') return makeGroupConnection(name, space);
            return makeClientSocket(name, space);
        }
        // The world's own details, kept on the World Settings instance so they save and load with the world.
        function normalizeWorldSettings(o) {
            if (typeof o.worldName !== 'string' || !o.worldName.trim()) o.worldName = 'My World';
            if (typeof o.creator !== 'string') o.creator = '';
            if (typeof o.description !== 'string') o.description = '';
            o.maxPlayers = Math.max(1, Math.min(100, Math.round(Number.isFinite(+o.maxPlayers) ? +o.maxPlayers : DEFAULT_MAX_PLAYERS)));
            // Uploaded assets are files from the picker, kept as data URLs inside the world file. Older worlds may
            // still list an ordinary URL, which is kept as it is.
            o.assets = Array.isArray(o.assets)
                ? o.assets.filter(a => a && typeof a === 'object' && typeof a.url === 'string' && a.url).slice(0, 100).map(a => ({
                    name: typeof a.name === 'string' ? a.name.slice(0, 120) : '',
                    url: a.url,
                    type: typeof a.type === 'string' ? a.type.slice(0, 100) : '',
                    size: Number.isFinite(+a.size) && +a.size > 0 ? Math.round(+a.size) : 0
                }))
                : [];
            // A world knows when it was created and which content version it has reached. Files from before this
            // setting use their last engineVersion, so an old world starts out correctly marked as needing migration.
            const meta = loadedWorldMeta || {};
            const importedCurrent = normalizeWorldVersion(meta.currentVersion) || normalizeWorldVersion(meta.engineVersion);
            o.currentVersion = normalizeWorldVersion(o.currentVersion) || importedCurrent || '';
            o.createdVersion = normalizeWorldVersion(o.createdVersion) || normalizeWorldVersion(meta.createdVersion) || importedCurrent || o.currentVersion || '';
            o.defaults = o.defaults && typeof o.defaults === 'object' ? o.defaults : {};
            // Left unset when the file predates this setting; applyDefaultPlayerStats then copies the DefaultPlayer
            // Human's own values into it, so an old world keeps its character.
            if (o.defaults.player && typeof o.defaults.player === 'object') o.defaults.player = normalizeHumanStats(o.defaults.player);
            else o.defaults.player = null;
            return o;
        }
        function normalizeConnection(o) {
            const str = (v) => typeof v === 'string' ? v : '';
            o.active = o.active !== false;
            if (o.type === 'clientsocket') {
                o.client = str(o.client); o.player = str(o.player);
                o.bandwidth = Math.max(0, Math.min(CONNECTION_BANDWIDTH_MAX, Math.round(Number.isFinite(+o.bandwidth) ? +o.bandwidth : 0)));
            } else if (o.type === 'serversocket') {
                o.bandwidth = Math.max(1, Math.min(CONNECTION_BANDWIDTH_MAX, Math.round(Number.isFinite(+o.bandwidth) ? +o.bandwidth : 4096)));
                o.maxClients = Math.max(1, Math.min(100, Math.round(Number.isFinite(+o.maxClients) ? +o.maxClients : DEFAULT_MAX_PLAYERS)));
            } else if (o.type === 'peerconnection') {
                for (const k of ['password', 'client1', 'client2', 'player1', 'player2']) o[k] = str(o[k]);
            } else if (o.type === 'groupconnection') {
                o.password = str(o.password);
                o.clients = Array.isArray(o.clients)
                    ? o.clients.filter(c => c && typeof c === 'object').slice(0, 64).map(c => ({ ip: str(c.ip), player: str(c.player) }))
                    : [];
            }
            return o;
        }

        // ───────── User interfaces ─────────
        // A UI instance is laid out in percentages of what it sits in: the UI space is the whole screen, and a Frame
        // inside it is that Frame's box. Position is the centre of the element, so 50, 50 is the middle of its parent,
        // and Size is the part of the parent it covers. None of this is in the 3D world.
        const UI_TYPES = ['frame', 'text', 'button', 'image', 'input', 'progressbar'];
        const UI_ALIGNS = ['Left', 'Center', 'Right'];
        const isUI = (o) => !!o && UI_TYPES.includes(o.type);
        const uiClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : lo));
        function uiBase(name, parent, props) {
            return Object.assign({ name, parent, posX: 50, posY: 50, sizeX: 30, sizeY: 10, visible: true, color: '#1c2230', transparency: 0 }, props);
        }
        // A frame groups other elements, or fills up as a progress bar.
        function makeFrame(name, parent, props) {
            return Object.assign(uiBase(name, parent), { type: 'frame', sizeX: 40, sizeY: 20, color: '#1c2230', transparency: 0.35, borderWidth: 0, borderColor: '#000000', backgroundBlur: 0, borderBlur: 0, clipChildren: false }, props);
        }
        function makeText(name, parent, props) {
            return Object.assign(uiBase(name, parent), { type: 'text', sizeX: 30, sizeY: 6, transparency: 1, text: 'Text', textColor: '#ffffff', textSize: 18, bold: false, align: 'Center' }, props);
        }
        function makeButton(name, parent, props) {
            return Object.assign(uiBase(name, parent), { type: 'button', sizeX: 24, sizeY: 8, color: '#f2b134', transparency: 0, text: 'Button', textColor: '#14181f', textSize: 18, bold: true, align: 'Center' }, props);
        }
        function makeImage(name, parent, props) {
            return Object.assign(uiBase(name, parent), { type: 'image', sizeX: 30, sizeY: 20, transparency: 0, image: '' }, props);
        }
        function makeInput(name, parent, props) {
            return Object.assign(uiBase(name, parent), { type: 'input', sizeX: 30, sizeY: 7, color: '#12161f', transparency: 0, text: '', placeholder: 'Type here', textColor: '#ffffff', textSize: 16, align: 'Left' }, props);
        }
        function makeProgressBar(name, parent, props) {
            return Object.assign(uiBase(name, parent), {
                type: 'progressbar', sizeX: 30, sizeY: 4, color: '#1c2230', transparency: 0.35, backgroundBlur: 0,
                shape: 'Straight', length: 50, fillColor: '#f2b134', fillTransparency: 0, fillBlur: 0
            }, props);
        }
        function makeUI(type, name, parent) {
            if (type === 'frame') return makeFrame(name, parent);
            if (type === 'text') return makeText(name, parent);
            if (type === 'button') return makeButton(name, parent);
            if (type === 'image') return makeImage(name, parent);
            if (type === 'progressbar') return makeProgressBar(name, parent);
            return makeInput(name, parent);
        }
        // Frame, Frame 2, Frame 3, ...
        function newUIName(type) { const n = ++counters[type]; return dn(type) + (n === 1 ? '' : ' ' + n); }
        // The top-most UI instance above this one. Its parent is either the UI space or a Player.
        function uiTopOf(id) {
            let cur = id, n = 0;
            while (cur && n++ < 64) { const p = sceneObjects[cur] && sceneObjects[cur].parent; if (!isUI(sceneObjects[p])) return cur; cur = p; }
            return id;
        }
        const uiContainerOf = (id) => { const top = uiTopOf(id); return top && sceneObjects[top] ? sceneObjects[top].parent : null; };
        // Rotation: degrees about X, Y and Z, applied as R = Ry * Rx * Rz (turn, then tilt, then roll). Matrices are 3x3 row-major.
        const ROT_IDENT = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        const rotCache = new WeakMap();
        function mat3mul(a, b) {
            const r = new Float32Array(9);
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
            return r;
        }
        const mat3T = (a) => new Float32Array([a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]);
        function rotInfo(o) {
            const rx = +o.rotX || 0, ry = +o.rotY || 0, rz = +o.rotZ || 0;
            if (!rx && !ry && !rz) return null;
            const key = rx + ',' + ry + ',' + rz, c = rotCache.get(o);
            if (c && c.key === key) return c;
            const d = Math.PI / 180, ca = Math.cos(rx * d), sa = Math.sin(rx * d), cb = Math.cos(ry * d), sb = Math.sin(ry * d), cg = Math.cos(rz * d), sg = Math.sin(rz * d);
            const m = mat3mul(mat3mul(new Float32Array([cb, 0, sb, 0, 1, 0, -sb, 0, cb]), new Float32Array([1, 0, 0, 0, ca, -sa, 0, sa, ca])), new Float32Array([cg, -sg, 0, sg, cg, 0, 0, 0, 1]));
            const info = { key, m, t: mat3T(m) };
            rotCache.set(o, info);
            return info;
        }
        const rotMat = (o) => { const i = rotInfo(o); return i ? i.m : ROT_IDENT; };      // local -> world
        const rotGL = (o) => { const i = rotInfo(o); return i ? i.t : ROT_IDENT; };       // same matrix, column-major for WebGL
        // Half sizes of the world-aligned box around a shape (physics, bounds and draw order use this)
        function shapeHalfExt(o) {
            const i = rotInfo(o);
            if (!i) return [o.width, o.height, o.length];
            const m = i.m, w = o.width, h = o.height, l = o.length;
            if (o.type === 'ball') return [Math.hypot(m[0] * w, m[1] * h, m[2] * l), Math.hypot(m[3] * w, m[4] * h, m[5] * l), Math.hypot(m[6] * w, m[7] * h, m[8] * l)];
            return [Math.abs(m[0]) * w + Math.abs(m[1]) * h + Math.abs(m[2]) * l, Math.abs(m[3]) * w + Math.abs(m[4]) * h + Math.abs(m[5]) * l, Math.abs(m[6]) * w + Math.abs(m[7]) * h + Math.abs(m[8]) * l];
        }
        function makePrism(name, parent, dims) {
            return Object.assign({
                type: 'prism6', name, parent,
                x: 0, y: 0, z: 0, length: 0.5, width: 1, height: 0.5, rotX: 0, rotY: 0, rotZ: 0,
                color: '#888888', material: 'plastic', faceColoring: false, showLabels: false, wireframe: false, locked: false, reactsToPhysics: true, collidable: true, anchored: false
            }, dims);
        }
        // Every instance has a type (its label, e.g. "prism6", shared by all of that kind)
        // and a unique id (Word + 3 digits, e.g. "Cobalt092") the engine uses to tell instances apart.
        const ID_WORDS = ['Cobalt', 'Amber', 'Falcon', 'Ember', 'Quartz', 'Willow', 'Zephyr', 'Onyx', 'Meadow', 'Raven', 'Indigo', 'Saffron',
            'Juniper', 'Cinder', 'Marble', 'Tundra', 'Lotus', 'Harbor', 'Velvet', 'Granite', 'Coral', 'Sparrow', 'Maple', 'Topaz', 'Aurora',
            'Basalt', 'Cedar', 'Dune', 'Fjord', 'Glacier', 'Horizon', 'Ivory', 'Lagoon', 'Mistral', 'Nimbus', 'Orchid', 'Pebble', 'Quill', 'Rowan', 'Summit'];
        function newId() {
            let id;
            do { id = ID_WORDS[Math.floor(Math.random() * ID_WORDS.length)] + String(Math.floor(Math.random() * 1000)).padStart(3, '0'); }
            while (sceneObjects[id]);
            return id;
        }
        
        // A union stores its cells around its own centre, in its own axes, so turning the union turns all of them. The
        // cells are measured against the size the union was built at, so scaling the union scales its collision too.
        function unionCellWorld(u, c) {
            const R = rotMat(u);
            const base = Array.isArray(u.cellBase) && u.cellBase.length === 3 && u.cellBase.every(v => Number.isFinite(v) && v > 0)
                ? u.cellBase : [u.width || 1, u.height || 1, u.length || 1];
            const sx = base[0] ? (u.width || base[0]) / base[0] : 1;
            const sy = base[1] ? (u.height || base[1]) / base[1] : 1;
            const sz = base[2] ? (u.length || base[2]) / base[2] : 1;
            const cx = c.x * sx, cy = c.y * sy, cz = c.z * sz;
            return {
                x: u.x + R[0] * cx + R[1] * cy + R[2] * cz,
                y: u.y + R[3] * cx + R[4] * cy + R[5] * cz,
                z: u.z + R[6] * cx + R[7] * cy + R[8] * cz,
                width: c.width * sx, height: c.height * sy, length: c.length * sz
            };
        }
        // What a Highlight outlines: its parent object and every shape under it.
        function highlightTargets(h) {
            const parent = sceneObjects[h.parent];
            if (!parent) return [];
            const out = [];
            if (isShape(parent) && spaceOf(parent) === 'world') out.push([h.parent, parent]);
            for (const [id, o] of Object.entries(sceneObjects)) if (isShape(o) && spaceOf(o) === 'world' && isInside(id, h.parent)) out.push([id, o]);
            return out;
        }

        // ───────── Unions ─────────
        // A union turns a set of shapes into one solid: the union of the normal parts, minus the negated parts, or for
        // Intersect only the space every part shares. It stores the real surface in `mesh` and a simple grid of boxes in
        // `cells` only for collision, so the drawn shape and its outline follow the actual cut surfaces.
        const shapeIsAxisBox = (o) => o.type === 'prism6' || o.type === 'union';
        function shapeContains(o, px, py, pz) {
            const R = rotMat(o), dx = px - o.x, dy = py - o.y, dz = pz - o.z;
            const x = R[0] * dx + R[3] * dy + R[6] * dz, y = R[1] * dx + R[4] * dy + R[7] * dz, z = R[2] * dx + R[5] * dy + R[8] * dz;
            if (o.type === 'wedge') return Math.abs(x) <= o.width && Math.abs(z) <= o.length && y >= -o.height && y <= o.height * (z / (o.length || 1));
            if (o.type === 'cylinder') { const rx = x / (o.width || 1), rz = z / (o.length || 1); return rx * rx + rz * rz <= 1 && Math.abs(y) <= o.height; }
            if (o.type === 'ball') { const rx = x / (o.width || 1), ry = y / (o.height || 1), rz = z / (o.length || 1); return rx * rx + ry * ry + rz * rz <= 1; }
            if (o.type === 'union') {
                // The saved cells are in the union's base size; undo a resize before testing them.
                const base = Array.isArray(o.cellBase) && o.cellBase.length === 3 && o.cellBase.every(v => Number.isFinite(v) && v > 0)
                    ? o.cellBase : [o.width || 1, o.height || 1, o.length || 1];
                const sx = base[0] ? (o.width || base[0]) / base[0] : 1;
                const sy = base[1] ? (o.height || base[1]) / base[1] : 1;
                const sz = base[2] ? (o.length || base[2]) / base[2] : 1;
                return (o.cells || []).some(c => Math.abs(x / sx - c.x) <= c.width && Math.abs(y / sy - c.y) <= c.height && Math.abs(z / sz - c.z) <= c.length);
            }
            return Math.abs(x) <= o.width && Math.abs(y) <= o.height && Math.abs(z) <= o.length;
        }
        // parts: [{ shape, op: 'add' | 'subtract' | 'intersect' }]. Returns merged boxes in world space.
        function unionSolid(parts, mode) {
            const spans = { x: [], y: [], z: [] };
            const add = (axis, v) => { const a = spans[axis]; if (!a.some(t => Math.abs(t - v) < 1e-6)) a.push(v); };
            const SLICES = 16;
            for (const { shape } of parts) {
                const lo = [shape.x - shape.width, shape.y - shape.height, shape.z - shape.length];
                const hi = [shape.x + shape.width, shape.y + shape.height, shape.z + shape.length];
                ['x', 'y', 'z'].forEach((axis, i) => {
                    add(axis, lo[i]); add(axis, hi[i]);
                    if (!shapeIsAxisBox(shape)) for (let s = 1; s < SLICES; s++) add(axis, lo[i] + (hi[i] - lo[i]) * s / SLICES);
                });
            }
            const xs = spans.x.sort((a, b) => a - b), ys = spans.y.sort((a, b) => a - b), zs = spans.z.sort((a, b) => a - b);
            const nx = xs.length - 1, ny = ys.length - 1, nz = zs.length - 1;
            if (nx < 1 || ny < 1 || nz < 1) return { cells: [] };
            const at = (i, j, k) => (k * ny + j) * nx + i;
            const inside = new Uint8Array(nx * ny * nz);
            for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
                const px = (xs[i] + xs[i + 1]) / 2, py = (ys[j] + ys[j + 1]) / 2, pz = (zs[k] + zs[k + 1]) / 2;
                let added = false, cut = false, sharedAll = true, sharedAny = false;
                for (const { shape, op } of parts) {
                    const hit = shapeContains(shape, px, py, pz);
                    if (op === 'intersect') { sharedAny = true; if (!hit) sharedAll = false; }
                    else if (op === 'subtract') { if (hit) cut = true; }
                    else if (hit) added = true;
                }
                inside[at(i, j, k)] = (mode === 'intersect' ? sharedAny && sharedAll : added && !cut && sharedAll) ? 1 : 0;
            }
            // Merge neighbouring cells into the largest boxes possible, so uniting plain blocks gives plain blocks.
            const used = new Uint8Array(inside.length), cells = [];
            for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
                if (!inside[at(i, j, k)] || used[at(i, j, k)]) continue;
                let i2 = i;
                while (i2 + 1 < nx && inside[at(i2 + 1, j, k)] && !used[at(i2 + 1, j, k)]) i2++;
                let j2 = j;
                growJ: while (j2 + 1 < ny) { for (let ii = i; ii <= i2; ii++) if (!inside[at(ii, j2 + 1, k)] || used[at(ii, j2 + 1, k)]) break growJ; j2++; }
                let k2 = k;
                growK: while (k2 + 1 < nz) { for (let jj = j; jj <= j2; jj++) for (let ii = i; ii <= i2; ii++) if (!inside[at(ii, jj, k2 + 1)] || used[at(ii, jj, k2 + 1)]) break growK; k2++; }
                for (let kk = k; kk <= k2; kk++) for (let jj = j; jj <= j2; jj++) for (let ii = i; ii <= i2; ii++) used[at(ii, jj, kk)] = 1;
                cells.push({ x0: xs[i], x1: xs[i2 + 1], y0: ys[j], y1: ys[j2 + 1], z0: zs[k], z1: zs[k2 + 1] });
            }
            return { cells };
        }
        const r3 = (v) => Math.round(v * 1000) / 1000;
        // Builds one union out of the selected parts and replaces them with it.
        function unionSelected(mode, clickId) {
            const all = menuTargets(clickId).filter(k => sceneObjects[k] && isShape(sceneObjects[k]) && spaceOf(sceneObjects[k]) === 'world' && !sceneObjects[k].locked);
            const need = mode === 'intersect' ? 2 : 1;
            if (all.length < need) { toast(mode === 'intersect' ? 'Select at least two parts in World to intersect them.' : 'Select one or more parts in World to union them.', 'warn'); return; }
            const parts = all.map(k => ({ shape: sceneObjects[k], op: mode === 'intersect' ? 'intersect' : (sceneObjects[k].negated ? 'subtract' : 'add') }));
            if (mode !== 'intersect' && !parts.some(p => p.op === 'add')) { toast('Every selected part is negated, so there would be nothing left. Un-negate one part first.', 'warn'); return; }
            // The drawn solid is a real surface built from the parts. The cells are only a simple collision proxy: no
            // outline or shading ever comes from them.
            const solid = csgBuildUnion(parts, mode);
            if (!solid) { toast(mode === 'intersect' ? 'Those parts do not overlap, so there is nothing to keep.' : 'The result is empty, so nothing was created.', 'warn'); return; }
            const { cells } = unionSolid(parts, mode);
            const cx = solid.center[0], cy = solid.center[1], cz = solid.center[2];
            const halfX = Math.max(0.05, solid.half[0]), halfY = Math.max(0.05, solid.half[1]), halfZ = Math.max(0.05, solid.half[2]);
            const first = parts.find(p => p.op === 'add') || parts[0];
            const parent = SPACE_KEYS.includes(first.shape.parent) ? 'world' : first.shape.parent;
            const uid = newId();
            const n = ++counters.union;
            const u = makeUnion(dn('union') + (n === 1 ? '' : ' ' + n), parent, {
                x: r3(cx), y: r3(cy), z: r3(cz),
                width: r3(halfX), height: r3(halfY), length: r3(halfZ),
                color: prismColor(first.shape), material: materialKey(first.shape), anchored: parts.every(p => !!p.shape.anchored),
                collidable: parts.some(p => p.shape.collidable !== false),
                cellBase: [r3(halfX), r3(halfY), r3(halfZ)],
                mesh: solid.mesh,
                cells: cells.map(c => ({
                    x: r3((c.x0 + c.x1) / 2 - cx), y: r3((c.y0 + c.y1) / 2 - cy), z: r3((c.z0 + c.z1) / 2 - cz),
                    width: r3((c.x1 - c.x0) / 2), height: r3((c.y1 - c.y0) / 2), length: r3((c.z1 - c.z0) / 2)
                }))
            });
            sceneObjects[uid] = u;
            all.forEach(k => deleteItem(k));
            selectItem(uid);
            toast((mode === 'intersect' ? 'Intersected ' : 'United ') + all.length + ' parts into ' + u.name + '.');
        }

        function getModelPrisms(modelId) {
            const list = [];
            function scan(id) {
                for (const [k, o] of Object.entries(sceneObjects)) {
                    if (o.parent === id) {
                        if (isShape(o) && spaceOf(o) === 'world') list.push([k, o]);
                        scan(k);
                    }
                }
            }
            scan(modelId);
            return list;
        }

        function getModelBounds(modelId) {
            const prisms = getModelPrisms(modelId);
            if (!prisms.length) return null;
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            let minZ = Infinity, maxZ = -Infinity;
            for (const [, p] of prisms) {
                const e = shapeHalfExt(p);
                minX = Math.min(minX, p.x - e[0]);
                maxX = Math.max(maxX, p.x + e[0]);
                minY = Math.min(minY, p.y - e[1]);
                maxY = Math.max(maxY, p.y + e[1]);
                minZ = Math.min(minZ, p.z - e[2]);
                maxZ = Math.max(maxZ, p.z + e[2]);
            }
            return {
                x: (minX + maxX) / 2,
                y: (minY + maxY) / 2,
                z: (minZ + maxZ) / 2,
                width: Math.max(0.05, (maxX - minX) / 2),
                height: Math.max(0.05, (maxY - minY) / 2),
                length: Math.max(0.05, (maxZ - minZ) / 2),
                minX, maxX, minY, maxY, minZ, maxZ
            };
        }

        function topModelOf(id) {
            let cur = sceneObjects[id];
            let top = null, n = 0;
            while (cur && !SPACE_KEYS.includes(cur.parent) && n++ < 64) {
                if (sceneObjects[cur.parent] && sceneObjects[cur.parent].type === 'model') {
                    top = cur.parent;
                }
                cur = sceneObjects[cur.parent];
            }
            return top;
        }

        const esc = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const sceneObjects = {
            'Cobalt092': makePrism('Plate', 'world', { x: 0, y: -1, z: 0, length: 100, width: 100, height: 1, anchored: true }),
            'Onyx004': { type: 'viewfinder', name: 'Viewfinder', parent: 'engine', readOnly: true }
        };
        sceneObjects['Linen551'] = makeTexture('Texture', 'Cobalt092', [4], 'grid');
        sceneObjects['Amber417'] = makeWorldSettings('Settings', 'world');
        const counters = { prism: 1, model: 0, script: 0, worldsettings: 1, texture: 1, ball: 0, human: 0, wedge: 0, cylinder: 0, union: 0, sound: 0, highlight: 0, light: 0, simpleeffect: 0, advancedeffect: 0, frame: 0, text: 0, button: 0, image: 0, input: 0, progressbar: 0, clientsocket: 0, serversocket: 0, peerconnection: 0, groupconnection: 0 };
        const typeIcon = { prism6: 'i-cube', model: 'i-model', script: 'i-script', viewfinder: 'i-lock', worldsettings: 'i-sun', texture: 'i-grid', ball: 'i-ball', human: 'i-human', player: 'i-human', wedge: 'i-wedge', cylinder: 'i-cylinder', union: 'i-union', sound: 'i-sound', highlight: 'i-highlight', light: 'i-sun', simpleeffect: 'i-highlight', advancedeffect: 'i-highlight', frame: 'i-ui-frame', text: 'i-ui-text', button: 'i-ui-button', image: 'i-ui-image', input: 'i-ui-input', progressbar: 'i-ui-progress', clientsocket: 'i-client-socket', serversocket: 'i-server-socket', peerconnection: 'i-peer', groupconnection: 'i-group' };

        let isLightMode = false;
        let accentCol = '#f2b134';
        let selectedObjectId = null;
        let selectedSpaceId = null;
        let mode = 'select';

        // Rigid-body simulation for World prisms.
        // Run works like Roblox Studio: the world is snapshotted, everything runs live, and Stop restores the snapshot.
        let simulationRunning = false;
        let simSnapshot = null;
        let physicsLastTime = 0;
        const physicsVelocity = new Map();
        // Ball spin and orientation exist only while the simulation runs (3x3 row-major rotation, spin in rad/s)
        const ballRot = new Map(), ballSpin = new Map(), ballContacts = new Map();
        const IDENT3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        const ballRotFor = (id) => ballRot.get(id) || IDENT3;
        const ballRadius = (o) => (o.width + o.height + o.length) / 3;
        function spinFor(id) { if (!ballSpin.has(id)) ballSpin.set(id, { x: 0, y: 0, z: 0 }); return ballSpin.get(id); }
        function rotateBall(id, w, h) {
            const m = Math.hypot(w.x, w.y, w.z), ang = m * h;
            if (ang < 1e-7) return;
            const ax = w.x / m, ay = w.y / m, az = w.z / m, c = Math.cos(ang), sn = Math.sin(ang), t = 1 - c;
            const K = [t * ax * ax + c, t * ax * ay - sn * az, t * ax * az + sn * ay, t * ax * ay + sn * az, t * ay * ay + c, t * ay * az - sn * ax, t * ax * az - sn * ay, t * ay * az + sn * ax, t * az * az + c];
            const R = ballRotFor(id), N = new Float32Array(9);
            for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) N[r * 3 + q] = K[r * 3] * R[q] + K[r * 3 + 1] * R[3 + q] + K[r * 3 + 2] * R[6 + q];
            // keep the rows perpendicular and unit length so tiny errors never build up
            const nrm = (i) => { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; };
            nrm(0);
            let d = N[0] * N[3] + N[1] * N[4] + N[2] * N[5]; N[3] -= d * N[0]; N[4] -= d * N[1]; N[5] -= d * N[2]; nrm(3);
            N[6] = N[1] * N[5] - N[2] * N[4]; N[7] = N[2] * N[3] - N[0] * N[5]; N[8] = N[0] * N[4] - N[1] * N[3];
            ballRot.set(id, N);
        }
        const PHYSICS_MAX_STEP = 1 / 120;
        const DEFAULT_GRAVITY = 9.8;          // meters per second squared (Earth)
        const GRAVITY_MAX = 1000;
        const GRAVITY_PRESETS = [['Earth', 9.8], ['Moon', 1.62], ['Space', 0], ['Jupiter', 24.8]];
        const DEFAULT_KILL_Y = -5000;
        // Real-world constants. Everything in the world is the same material, so a body's mass follows from its volume.
        const MATERIAL_DENSITY = 1000;   // kg per cubic Vm
        const AIR_DENSITY = 1.2;         // kg per cubic Vm of Earth air
        const SURFACE_FRICTION = 0.5;    // Coulomb friction between two touching surfaces
        const BOX_RESTITUTION = 0.2, BALL_RESTITUTION = 0.35, BOUNCE_MIN_SPEED = 1.5;
        // Strong gravity holds a thick atmosphere. The Moon and Space have none, so nothing slows a fall there.
        function airDensityFor(g) { return AIR_DENSITY * Math.max(0, Math.min(2.5, (Math.abs(g) - 2) / 7.8)); }
        function bodyMass(o) {
            let vol;
            if (o.type === 'ball') vol = (4 / 3) * Math.PI * Math.pow(ballRadius(o), 3);
            else if (o.type === 'cylinder') vol = Math.PI * (o.width || 0) * (o.length || 0) * 2 * o.height;   // a round column, not the square around it
            else if (o.type === 'wedge') vol = 4 * o.width * o.height * o.length;                              // half a box
            else vol = 8 * o.width * o.height * o.length;
            return Math.max(1e-3, vol * MATERIAL_DENSITY);
        }
        // Air drag: F = 1/2 rho Cd A v^2. A body speeds up until drag matches its weight, which is its terminal velocity.
        function applyDrag(o, v, h, rho) {
            if (rho <= 0) return;
            const sp = Math.hypot(v.x, v.y, v.z);
            if (sp < 1e-6) return;
            let area, cd;
            if (o.type === 'ball') { const r = ballRadius(o); area = Math.PI * r * r; cd = 0.47; }
            else { area = 4 * (Math.abs(v.x) * o.height * o.length + Math.abs(v.y) * o.width * o.length + Math.abs(v.z) * o.width * o.height) / sp; cd = 1.05; }
            const f = 1 / (1 + rho * cd * area / (2 * bodyMass(o)) * sp * h);
            v.x *= f; v.y *= f; v.z *= f;
        }
        // Equal and opposite impulse along the contact normal n (pointing from b to a), weighted by mass, with bounce and Coulomb friction.
        function applyContactImpulse(av, bv, n, invA, invB, restitution, friction) {
            const invSum = invA + invB;
            if (invSum <= 0) return;
            let rx = av.x - bv.x, ry = av.y - bv.y, rz = av.z - bv.z;
            const rel = rx * n[0] + ry * n[1] + rz * n[2];
            if (rel >= 0) return;
            const e = -rel > BOUNCE_MIN_SPEED ? restitution : 0;
            const j = -(1 + e) * rel / invSum;
            av.x += n[0] * j * invA; av.y += n[1] * j * invA; av.z += n[2] * j * invA;
            bv.x -= n[0] * j * invB; bv.y -= n[1] * j * invB; bv.z -= n[2] * j * invB;
            if (!friction) return;
            rx = av.x - bv.x; ry = av.y - bv.y; rz = av.z - bv.z;
            const rn = rx * n[0] + ry * n[1] + rz * n[2];
            const tx = rx - n[0] * rn, ty = ry - n[1] * rn, tz = rz - n[2] * rn, tl = Math.hypot(tx, ty, tz);
            if (tl < 1e-6) return;
            const k = Math.min(tl / invSum, SURFACE_FRICTION * j) / tl;
            av.x -= tx * k * invA; av.y -= ty * k * invA; av.z -= tz * k * invA;
            bv.x += tx * k * invB; bv.y += ty * k * invB; bv.z += tz * k * invB;
        }

        // Simulation properties live on the World Settings instance.
        function activeWorldSettings() {
            for (const o of Object.values(sceneObjects)) if (o.type === 'worldsettings' && spaceOf(o) === 'world') return o;
            return null;
        }
        function currentGravity() {
            const ws = activeWorldSettings();
            return -(ws && Number.isFinite(ws.gravity) ? ws.gravity : DEFAULT_GRAVITY);
        }
        function worldMaxPlayers() {
            const ws = activeWorldSettings();
            const n = ws && Number.isFinite(+ws.maxPlayers) ? Math.round(+ws.maxPlayers) : DEFAULT_MAX_PLAYERS;
            return Math.max(1, Math.min(100, n));
        }
        function currentKillY() {
            const ws = activeWorldSettings();
            return ws && Number.isFinite(ws.killY) ? ws.killY : DEFAULT_KILL_Y;
        }

        // The parts of the player you are driving are placed by the player controller every frame, so they are kept out
        // of the physics: otherwise they shove whatever the player is standing on out from under them.
        let playerPartIds = null;
        function physicsBodyList() {
            const skip = playerPartIds;
            return Object.entries(sceneObjects)
                .filter(([id, o]) => isShape(o) && spaceOf(o) === 'world' && !(skip && skip.has(id)));
        }

        function physicsVelocityFor(id) {
            if (!physicsVelocity.has(id)) physicsVelocity.set(id, { x: 0, y: 0, z: 0 });
            return physicsVelocity.get(id);
        }

        // A body moves under physics only when it reacts to physics and is not anchored.
        const isMovable = (o) => o.reactsToPhysics && !o.anchored;

        // The top of a shape at a point under it: the slope of a wedge, the round top of a cylinder, else the box top.
        // -Infinity means there is nothing there, such as the corner of the square around a round column.
        function shapeTopUnder(o, px, pz) {
            const e = shapeHalfExt(o);
            if (rotInfo(o)) return o.y + e[1];                       // a turned shape is solid as the box around it
            if (o.type === 'cylinder') { const dx = (px - o.x) / (o.width || 1), dz = (pz - o.z) / (o.length || 1); return dx * dx + dz * dz <= 1 ? o.y + o.height : -Infinity; }
            if (o.type === 'wedge') { if (Math.abs(px - o.x) > o.width || Math.abs(pz - o.z) > o.length) return -Infinity; return o.y + (o.length ? o.height * (pz - o.z) / o.length : 0); }
            return o.y + e[1];
        }

        // The overlap between an untilted round column and another body's footprint. The column is an ellipse of radii
        // (width, length), so this measures to the real surface instead of the square around it: the empty corners of
        // that square are not solid, and a body is pushed along the round normal rather than along a world axis, so it
        // slides around the column instead of stopping square on it the way a rectangle would.
        // Returns null when the two footprints are apart, else the normal (from the column toward the other body) and
        // the depth, both in world space.
        function columnAgainstFoot(cyl, other, ex, ez) {
            const w = cyl.width || 1, l = cyl.length || 1;
            const ox = (other.x - cyl.x) / w, oz = (other.z - cyl.z) / l;      // its centre, in the column's own scale
            const ax = ex / w, az = ez / l;
            // The nearest point of its footprint to the column's axis. A box and a wedge are square, so this is their
            // own corner or face; a body whose axis falls inside them leaves by the nearer face.
            const qx = Math.max(ox - ax, Math.min(ox + ax, 0)), qz = Math.max(oz - az, Math.min(oz + az, 0));
            const d = Math.hypot(qx, qz);
            if (d >= 1) return null;
            let nx, nz, pen;
            if (d > 1e-6) { nx = qx / d; nz = qz / d; pen = 1 - d; }           // the column's surface out to that point
            else {
                const px = ax - Math.abs(ox), pz = az - Math.abs(oz);
                if (px <= pz) { nx = ox >= 0 ? 1 : -1; nz = 0; pen = px + 1; }
                else { nx = 0; nz = oz >= 0 ? 1 : -1; pen = pz + 1; }
            }
            // Back to world: an ellipse's normal is its gradient, and its depth stretches the same way.
            const gx = nx / w, gz = nz / l, gl = Math.hypot(gx, gz) || 1;
            return { nx: gx / gl, nz: gz / gl, pen: pen / gl };
        }
        // A wedge is solid only below its slope, so anything clearing the slope has empty air under it there and must
        // not be pushed sideways by it.
        function clearsSlope(o, other, otherEy) {
            if (rotInfo(o) || o.type !== 'wedge') return false;
            const top = shapeTopUnder(o, other.x, other.z);
            return top !== -Infinity && other.y - otherEy > top + 1e-4;
        }

        // The contact between a ball and a box. Worked in the box's own axes, so a tilted box is solid at its true angle.
        // Returns null when they are apart, else the normal (world space, pointing from the box to the ball) and depth.
        function ballAgainstBox(ball, box, r) {
            const R = rotMat(box), ax = ball.x - box.x, ay = ball.y - box.y, az = ball.z - box.z;
            const lx = R[0] * ax + R[3] * ay + R[6] * az, ly = R[1] * ax + R[4] * ay + R[7] * az, lz = R[2] * ax + R[5] * ay + R[8] * az;
            const qx = Math.max(-box.width, Math.min(box.width, lx)), qy = Math.max(-box.height, Math.min(box.height, ly)), qz = Math.max(-box.length, Math.min(box.length, lz));
            const dx = lx - qx, dy = ly - qy, dz = lz - qz, dist = Math.hypot(dx, dy, dz);
            if (dist >= r) return null;
            let nl, pen;
            if (dist > 1e-6) { nl = [dx / dist, dy / dist, dz / dist]; pen = r - dist; }
            else {
                // the center is inside the box: leave through the nearest face
                const px = box.width - Math.abs(lx), py = box.height - Math.abs(ly), pz = box.length - Math.abs(lz);
                if (py <= px && py <= pz) { nl = [0, ly >= 0 ? 1 : -1, 0]; pen = py + r; }
                else if (px <= pz) { nl = [lx >= 0 ? 1 : -1, 0, 0]; pen = px + r; }
                else { nl = [0, 0, lz >= 0 ? 1 : -1]; pen = pz + r; }
            }
            return { pen, n: [R[0] * nl[0] + R[1] * nl[1] + R[2] * nl[2], R[3] * nl[0] + R[4] * nl[1] + R[5] * nl[2], R[6] * nl[0] + R[7] * nl[1] + R[8] * nl[2]] };
        }
        // The contact between a ball and an untilted cylinder (round side, flat ends) or wedge (a slope you can roll
        // up). Returns null when they are apart, else the normal from the shape to the ball and the depth.
        function ballAgainstShape(ball, shape, r) {
            let qx, qy, qz;
            if (shape.type === 'cylinder') {
                const hx = ball.x - shape.x, hz = ball.z - shape.z, rx = shape.width || 1, rz = shape.length || 1;
                const el = Math.hypot(hx / rx, hz / rz), k = el > 1 ? 1 / el : 1;   // clamp onto the round side
                qx = shape.x + hx * k; qz = shape.z + hz * k;
                qy = Math.max(shape.y - shape.height, Math.min(shape.y + shape.height, ball.y));
            } else {
                const k = shape.length ? shape.height / shape.length : 0;
                qx = Math.max(shape.x - shape.width, Math.min(shape.x + shape.width, ball.x));
                // nearest point on the slope line y = shape.y + k * (z - shape.z), then on its two ends
                let t = ((ball.z - shape.z) + k * (ball.y - shape.y)) / (1 + k * k);
                t = Math.max(-shape.length, Math.min(shape.length, t));
                qz = shape.z + t;
                qy = shape.y + k * t;
            }
            const dx = ball.x - qx, dy = ball.y - qy, dz = ball.z - qz, dist = Math.hypot(dx, dy, dz);
            if (dist >= r) return null;
            if (dist > 1e-6) return { pen: r - dist, n: [dx / dist, dy / dist, dz / dist] };
            return { pen: r, n: [0, 1, 0] };   // dead centre: push it out of the top
        }

        // Ball against a prism or another ball. n points from B toward A. Balls bounce a little and pick up spin when they roll.
        function resolveBallPair(idA, a, idB, b) {
            const aMoves = isMovable(a), bMoves = isMovable(b);
            let n, pen;
            if (a.type === 'ball' && b.type === 'ball') {
                const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z, dist = Math.hypot(dx, dy, dz), rs = ballRadius(a) + ballRadius(b);
                if (dist >= rs) return;
                n = dist > 1e-6 ? [dx / dist, dy / dist, dz / dist] : [0, 1, 0];
                pen = rs - dist;
            } else {
                const ball = a.type === 'ball' ? a : b, box = ball === a ? b : a, r = ballRadius(ball);
                // A cylinder is round and a wedge is sloped, so measure to the real surface instead of the box around it.
                // A union is measured against its cells, so a ball can fall through a hole cut in it.
                let hit = null;
                if (box.type === 'union' && Array.isArray(box.cells) && box.cells.length) {
                    for (const piece of shapeColliderParts(box)) {
                        const h = ballOBB(ball.x, ball.y, ball.z, r, piece);
                        if (h && (!hit || h.pen > hit.pen)) hit = h;
                    }
                } else if (!rotInfo(box) && (box.type === 'cylinder' || box.type === 'wedge')) {
                    hit = ballAgainstShape(ball, box, r);
                } else {
                    hit = ballAgainstBox(ball, box, r);
                }
                if (!hit) return;
                n = ball === a ? hit.n : [-hit.n[0], -hit.n[1], -hit.n[2]];
                pen = hit.pen;
            }
            const invA = aMoves ? 1 / bodyMass(a) : 0, invB = bMoves ? 1 / bodyMass(b) : 0;
            const shareA = invA / (invA + invB), shareB = invB / (invA + invB);   // the lighter body gives way more
            a.x += n[0] * pen * shareA; a.y += n[1] * pen * shareA; a.z += n[2] * pen * shareA;
            b.x -= n[0] * pen * shareB; b.y -= n[1] * pen * shareB; b.z -= n[2] * pen * shareB;
            const av = physicsVelocityFor(idA), bv = physicsVelocityFor(idB);
            applyContactImpulse(av, bv, n, invA, invB, BALL_RESTITUTION, false);
            if (a.type === 'ball' && aMoves) ballContacts.set(idA, { nx: n[0], ny: n[1], nz: n[2], ovx: bv.x, ovy: bv.y, ovz: bv.z });
            if (b.type === 'ball' && bMoves) ballContacts.set(idB, { nx: -n[0], ny: -n[1], nz: -n[2], ovx: av.x, ovy: av.y, ovz: av.z });
        }

        // A pair that involves a turned shape, or a union (a compound of cells), is solved against the real oriented
        // surfaces. A union moves as one body, but it is tested cell by cell, so a hole cut through it is not solid.
        function resolveOBBPair(idA, a, idB, b, aMoves, bMoves) {
            const piecesA = shapeColliderParts(a), piecesB = shapeColliderParts(b);
            let best = null;
            for (const A of piecesA) for (const B of piecesB) {
                const hit = obbManifold(A, B);
                if (hit && (!best || hit.depth > best.depth)) best = hit;
            }
            if (!best) return;
            const n = best.n, pen = best.depth;
            const invA = aMoves ? 1 / bodyMass(a) : 0, invB = bMoves ? 1 / bodyMass(b) : 0;
            const shareA = invA / (invA + invB), shareB = invB / (invA + invB);
            a.x += n[0] * pen * shareA; a.y += n[1] * pen * shareA; a.z += n[2] * pen * shareA;
            b.x -= n[0] * pen * shareB; b.y -= n[1] * pen * shareB; b.z -= n[2] * pen * shareB;
            applyContactImpulse(physicsVelocityFor(idA), physicsVelocityFor(idB), n, invA, invB, BOX_RESTITUTION, true);
        }

        // Bodies resting on bodies: a stack settles from the bottom up so it never jitters.
        const supportContacts = new Map();
        function settleSupports() {
            if (!supportContacts.size) return;
            const pairs = [...supportContacts.values()].sort((p, q) => sceneObjects[p[1]].y - sceneObjects[q[1]].y);
            for (const [u, l, top] of pairs) {
                const U = sceneObjects[u], L = sceneObjects[l];
                if (!U || !L || !isMovable(U)) continue;
                const uv = physicsVelocityFor(u), floor = isMovable(L) ? physicsVelocityFor(l).y : 0;
                if (uv.y < floor) uv.y = floor;
                // Rest exactly on the surface it landed on. Without this a body keeps the depth it sank by in the step
                // that resolved it, which is a fraction of a millimeter and moves with the frame time: that reads as a
                // constant slight Y shift. A body on its way up, such as after a bounce, is left alone.
                if (top !== -Infinity && uv.y <= 0) U.y = top + shapeHalfExt(U)[1];
            }
            supportContacts.clear();
        }
        // Lists and extents for the collision pass, kept between steps so a step allocates nothing.
        const colIds = [], colObjs = [], colMovers = [];
        let colExt = { x: new Float64Array(0), y: new Float64Array(0), z: new Float64Array(0) };
        let colFlags = new Uint8Array(0);
        function resolvePhysicsCollisions(bodies) {
            // Every collidable shape blocks movers. There is no ground plane: things fall until they land on something.
            colIds.length = 0; colObjs.length = 0;
            let movableCount = 0;
            for (const [id, o] of bodies) {
                if (o.collidable === false) continue;
                colIds.push(id); colObjs.push(o);
                if (isMovable(o)) movableCount++;
            }
            // A fully anchored build can never collide with itself, so it costs nothing per step.
            if (!movableCount) return;
            const n = colObjs.length;
            if (colExt.x.length < n) {
                const cap = Math.max(64, n * 2);
                colExt = { x: new Float64Array(cap), y: new Float64Array(cap), z: new Float64Array(cap) };
            }
            const EX = colExt.x, EY = colExt.y, EZ = colExt.z;
            for (let i = 0; i < n; i++) {   // half extents are the same for every pair a body is in, so measure once
                const e = shapeHalfExt(colObjs[i]);
                EX[i] = e[0]; EY[i] = e[1]; EZ[i] = e[2];
            }

            // Two fixed bodies can never do anything, so a fixed body only visits its pairs with movers. Pairs are
            // still visited in the same order as an all-pairs sweep, so results are unchanged - only the wasted
            // visits are gone. With nothing movable this pass does no work at all.
            if (colFlags.length < n) colFlags = new Uint8Array(Math.max(64, n * 2));
            const movable = colFlags, movers = colMovers;
            movers.length = 0;
            for (let i = 0; i < n; i++) {
                movable[i] = 0;
                if (isMovable(colObjs[i])) { movable[i] = 1; movers.push(i); }
            }
            const solve = (i, j) => {
                    const a = colObjs[i], b = colObjs[j], idA = colIds[i], idB = colIds[j];
                    const aMoves = movable[i] === 1, bMoves = movable[j] === 1;
                    if (!aMoves && !bMoves) return;
                    if (a.type === 'ball' || b.type === 'ball') { resolveBallPair(idA, a, idB, b); return; }
                    // Turned shapes and unions use oriented surfaces. Plain, upright boxes keep the cheaper axis-aligned
                    // path, which is exact for them and settles stacks more quietly.
                    if (rotInfo(a) || rotInfo(b) ||
                        (a.type === 'union' && Array.isArray(a.cells) && a.cells.length) ||
                        (b.type === 'union' && Array.isArray(b.cells) && b.cells.length)) {
                        resolveOBBPair(idA, a, idB, b, aMoves, bMoves);
                        return;
                    }

                    // Overlap is measured against the real surface of each shape, so the corners of the square around a
                    // round column and the air above a wedge's slope are not solid. Turned shapes and unions were sent
                    // to the oriented path above, so this path only sees upright boxes, columns and slopes.
                    const dy = (EY[i] + EY[j]) - Math.abs(a.y - b.y);
                    if (dy <= 0) return;
                    const roundA = !rotInfo(a) && a.type === 'cylinder', roundB = !rotInfo(b) && b.type === 'cylinder';
                    let disc = null, dx = 0, dz = 0, depth;
                    if (roundA || roundB) {
                        disc = roundA ? columnAgainstFoot(a, b, EX[j], EZ[j]) : columnAgainstFoot(b, a, EX[i], EZ[i]);
                        if (!disc) return;
                        depth = disc.pen;
                    } else {
                        dx = (EX[i] + EX[j]) - Math.abs(a.x - b.x);
                        if (dx <= 0) return;
                        dz = (EZ[i] + EZ[j]) - Math.abs(a.z - b.z);
                        if (dz <= 0) return;
                        depth = Math.min(dx, dz);
                    }
                    if (clearsSlope(a, b, EY[j]) || clearsSlope(b, a, EY[i])) return;

                    const av = physicsVelocityFor(idA);
                    const bv = physicsVelocityFor(idB);
                    const invA = aMoves ? 1 / bodyMass(a) : 0, invB = bMoves ? 1 / bodyMass(b) : 0;
                    const shareA = invA / (invA + invB), shareB = invB / (invA + invB);   // the lighter body gives way more
                    // The higher body is the one resting on the other. How deep it sits is measured against the surface
                    // of the shape below, so a wedge holds it along its slope and a cylinder only on its round top.
                    const upper = (a.y - EY[i]) > (b.y - EY[j]) ? a : b, lower = upper === a ? b : a;
                    const surface = shapeTopUnder(lower, upper.x, upper.z);
                    const penY = surface === -Infinity ? -1 : surface + (upper === a ? EY[i] : EY[j]) - upper.y;
                    // On a round top, but still above it: there is nothing to push. Without this a body dropped squarely
                    // onto a column is shoved off to the side by the first step that overlaps the square around it.
                    if (lower.type === 'cylinder' && surface !== -Infinity && penY <= 0) return;
                    let n;
                    if (penY > 0 && penY <= depth + 1e-6) {
                        a.y += (a === upper ? 1 : -1) * penY * shareA;
                        b.y += (b === upper ? 1 : -1) * penY * shareB;
                        n = [0, a === upper ? 1 : -1, 0];
                    } else if (disc) {
                        // Push along the column's round surface, which is slanted whenever the other body is off to a
                        // side, so the two slide apart around the circle instead of along a world axis.
                        const nx = roundA ? -disc.nx : disc.nx, nz = roundA ? -disc.nz : disc.nz;   // from b to a
                        a.x += nx * disc.pen * shareA; a.z += nz * disc.pen * shareA;
                        b.x -= nx * disc.pen * shareB; b.z -= nz * disc.pen * shareB;
                        n = [nx, 0, nz];
                    } else if (dx <= dz) {
                        const signX = a.x < b.x ? -1 : 1;
                        a.x += signX * dx * shareA;
                        b.x -= signX * dx * shareB;
                        n = [signX, 0, 0];
                    } else {
                        const signZ = a.z < b.z ? -1 : 1;
                        a.z += signZ * dz * shareA;
                        b.z -= signZ * dz * shareB;
                        n = [0, 0, signZ];
                    }
                    applyContactImpulse(av, bv, n, invA, invB, BOX_RESTITUTION, true);
                    if (n[1] !== 0) {
                        // Read the resting height again: the shape below may have given way a little in this pass.
                        const rest = shapeTopUnder(lower, upper.x, upper.z);
                        supportContacts.set(upper === a ? idA + '|' + idB : idB + '|' + idA,
                            upper === a ? [idA, idB, rest] : [idB, idA, rest]);
                    }
            };
            for (let i = 0; i < n; i++) {
                if (movable[i]) {
                    for (let j = i + 1; j < n; j++) solve(i, j);
                } else {
                    // Fixed body: the first mover after it, found by binary search, then the rest of the mover list.
                    let lo = 0, hi = movers.length;
                    while (lo < hi) { const mid = (lo + hi) >> 1; if (movers[mid] <= i) lo = mid + 1; else hi = mid; }
                    for (let k = lo; k < movers.length; k++) solve(i, movers[k]);
                }
            }
        }

        function physicsStep(dt) {
            if (!simulationRunning) return;
            const g = currentGravity(), killY = currentKillY(), rho = airDensityFor(g);
            const bodies = physicsBodyList();

            // Long falls get fast, so split the step to keep a body from skipping through thin objects.
            let maxSpeed = 0;
            for (const [id, o] of bodies) {
                if (!isMovable(o)) continue;
                const v = physicsVelocityFor(id);
                maxSpeed = Math.max(maxSpeed, Math.abs(v.x), Math.abs(v.y) + Math.abs(g) * dt, Math.abs(v.z));
            }
            const subSteps = Math.max(1, Math.min(64, Math.ceil(maxSpeed * dt / 0.1)));
            const h = dt / subSteps;
            for (let s = 0; s < subSteps; s++) {
                for (const [id, o] of bodies) {
                    if (!isMovable(o)) continue;
                    const v = physicsVelocityFor(id);
                    v.y += g * h;
                    applyDrag(o, v, h, rho);
                    o.x += v.x * h;
                    o.y += v.y * h;
                    o.z += v.z * h;
                }
                // A few passes help stacked boxes settle without obvious overlap.
                for (let pass = 0; pass < 3; pass++) resolvePhysicsCollisions(bodies);
                settleSupports();
                // Rolling: a touching ball spins so its surface does not slip, and rolling slowly loses speed
                for (const [id, c] of ballContacts) {
                    const o = sceneObjects[id];
                    if (!o || !isMovable(o)) continue;
                    const v = physicsVelocityFor(id), r = ballRadius(o);
                    const rx = v.x - c.ovx, ry = v.y - c.ovy, rz = v.z - c.ovz, dn = rx * c.nx + ry * c.ny + rz * c.nz;
                    const tx = rx - c.nx * dn, ty = ry - c.ny * dn, tz = rz - c.nz * dn;
                    const tw = [(c.ny * tz - c.nz * ty) / r, (c.nz * tx - c.nx * tz) / r, (c.nx * ty - c.ny * tx) / r];
                    const w = spinFor(id), wn = w.x * c.nx + w.y * c.ny + w.z * c.nz, k = Math.min(1, 25 * h), keep = Math.max(0, 1 - 2 * h);
                    const px = w.x - c.nx * wn, py = w.y - c.ny * wn, pz = w.z - c.nz * wn;
                    w.x = c.nx * wn * keep + px + (tw[0] - px) * k; w.y = c.ny * wn * keep + py + (tw[1] - py) * k; w.z = c.nz * wn * keep + pz + (tw[2] - pz) * k;
                    const f = Math.min(1, 0.35 * h);
                    v.x -= tx * f; v.y -= ty * f; v.z -= tz * f;
                }
                ballContacts.clear();
                for (const [id, o] of bodies) if (o.type === 'ball' && isMovable(o) && ballSpin.has(id)) rotateBall(id, ballSpin.get(id), h);
            }

            // Kill layer: anything that falls below it is deleted from the world.
            let removed = false;
            for (const [id, o] of bodies) {
                if (isMovable(o) && o.y < killY) {
                    delete sceneObjects[id];
                    physicsVelocity.delete(id); ballRot.delete(id); ballSpin.delete(id);
                    if (selectedObjectId === id) selectedObjectId = null;
                    removed = true;
                }
            }
            if (removed) { pruneOrphans(); renderExplorer(); renderProperties(); }
        }
