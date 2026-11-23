// Vanilla Engine — effect instances and the shared particle simulation.
// SimpleEffect is a tuned preset with a few controls. AdvancedEffect exposes the same engine with its own emitter,
// sprite, lifetime and motion settings. Particles live in pooled typed arrays and are drawn as camera-facing quads by
// gl.js, so a scene full of effects does not create objects or canvases per particle.
const EFFECT_PRESETS = {
    smoke: {
        name: 'Smoke', colorStart: '#8e9299', colorEnd: '#d3d6db', rate: 16, lifetime: 3.2, sizeStart: 0.45, sizeEnd: 1.9,
        speed: 0.8, spread: 28, gravity: 0.35, drag: 1.1, rotation: 40, blend: 'alpha', sprite: 'smoke',
        fadeIn: 0.18, fadeOut: 0.55, note: 'Soft grey puffs that rise and spread.'
    },
    fire: {
        name: 'Fire', colorStart: '#ffb13b', colorEnd: '#ff4b24', rate: 42, lifetime: 0.8, sizeStart: 0.32, sizeEnd: 1.05,
        speed: 1.5, spread: 18, gravity: -1.25, drag: 1.4, rotation: 55, blend: 'additive', sprite: 'soft',
        fadeIn: 0.04, fadeOut: 0.5, note: 'Warm additive flames that flicker upward.'
    },
    steam: {
        name: 'Steam', colorStart: '#e8f1f4', colorEnd: '#b8c8cf', rate: 20, lifetime: 2.2, sizeStart: 0.3, sizeEnd: 1.35,
        speed: 1.1, spread: 22, gravity: -0.45, drag: 1.0, rotation: 30, blend: 'alpha', sprite: 'smoke',
        fadeIn: 0.08, fadeOut: 0.6, note: 'Cool white vapour with a soft fade.'
    },
    dust: {
        name: 'Dust', colorStart: '#b59b77', colorEnd: '#d6c7ae', rate: 14, lifetime: 2.6, sizeStart: 0.35, sizeEnd: 1.15,
        speed: 0.9, spread: 55, gravity: 0.55, drag: 1.6, rotation: 20, blend: 'alpha', sprite: 'smoke',
        fadeIn: 0.12, fadeOut: 0.55, note: 'Dry earth caught in a slow breeze.'
    },
    sparkle: {
        name: 'Sparkle / Shine', colorStart: '#fff5c7', colorEnd: '#ffd23f', rate: 24, lifetime: 1.15, sizeStart: 0.18, sizeEnd: 0.04,
        speed: 1.8, spread: 105, gravity: 0.8, drag: 0.6, rotation: 70, blend: 'additive', sprite: 'spark',
        fadeIn: 0.03, fadeOut: 0.45, note: 'Tiny twinkling highlights that settle and fade.'
    },
    explosion: {
        name: 'Explosion', colorStart: '#fff0a8', colorEnd: '#ff5a1f', rate: 0, burst: 58, lifetime: 1.05, sizeStart: 0.5, sizeEnd: 1.9,
        speed: 5.2, spread: 180, gravity: 0.7, drag: 2.4, rotation: 90, blend: 'additive', sprite: 'soft',
        fadeIn: 0.02, fadeOut: 0.7, note: 'A bright pressure wave with a rain of hot fragments.'
    },
    splash: {
        name: 'Splash', colorStart: '#b8ecff', colorEnd: '#4aa6c8', rate: 0, burst: 38, lifetime: 1.15, sizeStart: 0.22, sizeEnd: 0.09,
        speed: 4.1, spread: 72, gravity: 8.5, drag: 0.12, rotation: 12, blend: 'alpha', sprite: 'soft',
        fadeIn: 0.02, fadeOut: 0.45, note: 'Droplets kick up and fall back under gravity.'
    },
    embers: {
        name: 'Embers', colorStart: '#ffd066', colorEnd: '#ff5a2a', rate: 13, lifetime: 1.9, sizeStart: 0.16, sizeEnd: 0.04,
        speed: 0.85, spread: 30, gravity: -0.95, drag: 0.5, rotation: 65, blend: 'additive', sprite: 'spark',
        fadeIn: 0.04, fadeOut: 0.55, note: 'Slow, glowing motes drifting upward.'
    }
};
const EFFECT_PRESET_ORDER = ['smoke', 'fire', 'steam', 'dust', 'sparkle', 'explosion', 'splash', 'embers'];
const EFFECT_SPRITES = ['soft', 'smoke', 'spark', 'star'];
const EFFECT_SHAPES = ['point', 'box', 'sphere', 'cylinder', 'surface'];
const EFFECT_SPACES = ['world', 'local'];
const EFFECT_BLENDS = ['alpha', 'additive'];
const EFFECT_KEYS = new Set(EFFECT_PRESET_ORDER);
const EFFECT_TYPE_KEYS = ['simpleeffect', 'advancedeffect'];
const isEffect = (o) => !!o && EFFECT_TYPE_KEYS.includes(o.type);
const EFFECT_MAX_SIMPLE = 300;
const EFFECT_MAX_ADVANCED = 600;
const EFFECT_HEX = /^#[0-9a-f]{6}$/i;

function makeSimpleEffect(name, parent, props) {
    return Object.assign({
        type: 'simpleeffect', name, parent, x: 0, y: 1, z: 0,
        preset: 'smoke', rate: 16, speed: 1, size: 1, color: '#8e9299', emitting: true
    }, props);
}
function makeAdvancedEffect(name, parent, props) {
    return Object.assign({
        type: 'advancedeffect', name, parent, x: 0, y: 1, z: 0,
        emitting: true, rate: 20, burst: 0, lifetime: 1.6,
        sizeStart: 0.35, sizeEnd: 0.9, speed: 2, spread: 28, gravity: 0, drag: 0.45, rotation: 30,
        colorStart: '#ffe3ad', colorEnd: '#ff6a1f', fadeIn: 0.06, fadeOut: 0.45,
        blend: 'alpha', sprite: 'soft', image: '', frames: 1, fps: 12,
        shape: 'point', space: 'world', radius: 0.6
    }, props);
}
function effectPreset(e) {
    return EFFECT_PRESETS[e && e.preset] || EFFECT_PRESETS.smoke;
}
function effectConfig(e) {
    if (e.type === 'simpleeffect') {
        const p = effectPreset(e), scale = Number.isFinite(+e.size) && +e.size > 0 ? +e.size : 1;
        return Object.assign({}, p, {
            rate: Number.isFinite(+e.rate) ? Math.max(0, Math.min(300, +e.rate)) : p.rate,
            speed: p.speed * (Number.isFinite(+e.speed) ? Math.max(0, Math.min(4, +e.speed)) : 1),
            sizeStart: p.sizeStart * scale, sizeEnd: p.sizeEnd * scale,
            colorStart: EFFECT_HEX.test(e.color) ? e.color.toLowerCase() : p.colorStart,
            colorEnd: p.colorEnd,
            blend: p.blend, sprite: p.sprite, shape: 'point', radius: 0.1, burst: p.burst || 0
        });
    }
    return {
        name: 'Advanced', note: 'Custom particle settings.',
        colorStart: EFFECT_HEX.test(e.colorStart) ? e.colorStart.toLowerCase() : '#ffe3ad',
        colorEnd: EFFECT_HEX.test(e.colorEnd) ? e.colorEnd.toLowerCase() : '#ff6a1f',
        rate: Number.isFinite(+e.rate) ? Math.max(0, Math.min(300, +e.rate)) : 20,
        burst: Number.isFinite(+e.burst) ? Math.max(0, Math.min(300, Math.round(+e.burst))) : 0,
        lifetime: Number.isFinite(+e.lifetime) ? Math.max(0.05, Math.min(20, +e.lifetime)) : 1.6,
        sizeStart: Number.isFinite(+e.sizeStart) ? Math.max(0.01, Math.min(10, +e.sizeStart)) : 0.35,
        sizeEnd: Number.isFinite(+e.sizeEnd) ? Math.max(0.01, Math.min(10, +e.sizeEnd)) : 0.9,
        speed: Number.isFinite(+e.speed) ? Math.max(0, Math.min(30, +e.speed)) : 2,
        spread: Number.isFinite(+e.spread) ? Math.max(0, Math.min(180, +e.spread)) : 28,
        gravity: Number.isFinite(+e.gravity) ? Math.max(-50, Math.min(50, +e.gravity)) : 0,
        drag: Number.isFinite(+e.drag) ? Math.max(0, Math.min(10, +e.drag)) : 0.45,
        rotation: Number.isFinite(+e.rotation) ? Math.max(0, Math.min(720, +e.rotation)) : 30,
        fadeIn: Number.isFinite(+e.fadeIn) ? Math.max(0, Math.min(1, +e.fadeIn)) : 0.06,
        fadeOut: Number.isFinite(+e.fadeOut) ? Math.max(0, Math.min(1, +e.fadeOut)) : 0.45,
        blend: EFFECT_BLENDS.includes(e.blend) ? e.blend : 'alpha',
        sprite: EFFECT_SPRITES.includes(e.sprite) ? e.sprite : 'soft',
        frames: Number.isFinite(+e.frames) ? Math.max(1, Math.min(64, Math.round(+e.frames))) : 1,
        fps: Number.isFinite(+e.fps) ? Math.max(1, Math.min(60, +e.fps)) : 12,
        shape: EFFECT_SHAPES.includes(e.shape) ? e.shape : 'point',
        space: EFFECT_SPACES.includes(e.space) ? e.space : 'world',
        radius: Number.isFinite(+e.radius) ? Math.max(0.01, Math.min(50, +e.radius)) : 0.6
    };
}
function normalizeEffect(e) {
    if (!isEffect(e)) return e;
    for (const k of ['x', 'y', 'z']) if (!Number.isFinite(+e[k])) e[k] = 0;
    e.emitting = e.emitting !== false;
    if (e.type === 'simpleeffect') {
        if (!EFFECT_KEYS.has(e.preset)) e.preset = 'smoke';
        const p = effectPreset(e);
        if (!EFFECT_HEX.test(e.color)) e.color = p.colorStart;
        e.rate = Number.isFinite(+e.rate) ? Math.max(0, Math.min(300, +e.rate)) : p.rate;
        e.speed = Number.isFinite(+e.speed) ? Math.max(0, Math.min(4, +e.speed)) : 1;
        e.size = Number.isFinite(+e.size) ? Math.max(0.05, Math.min(5, +e.size)) : 1;
        return e;
    }
    const c = effectConfig(e);
    e.rate = c.rate; e.burst = c.burst; e.lifetime = c.lifetime;
    e.sizeStart = c.sizeStart; e.sizeEnd = c.sizeEnd; e.speed = c.speed; e.spread = c.spread;
    e.gravity = c.gravity; e.drag = c.drag; e.rotation = c.rotation;
    e.fadeIn = c.fadeIn; e.fadeOut = c.fadeOut;
    e.colorStart = c.colorStart; e.colorEnd = c.colorEnd;
    if (!EFFECT_BLENDS.includes(e.blend)) e.blend = 'alpha';
    if (!EFFECT_SPRITES.includes(e.sprite)) e.sprite = 'soft';
    if (!EFFECT_SHAPES.includes(e.shape)) e.shape = 'point';
    if (!EFFECT_SPACES.includes(e.space)) e.space = 'world';
    e.frames = c.frames; e.fps = c.fps; e.radius = c.radius;
    if (typeof e.image !== 'string') e.image = '';
    return e;
}
function effectImageURL(e) {
    const raw = typeof e.image === 'string' ? e.image.trim() : '';
    if (!raw) return '';
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    const ws = typeof activeWorldSettings === 'function' ? activeWorldSettings() : null;
    const assets = ws && Array.isArray(ws.assets) ? ws.assets : [];
    const name = raw.replace(/^asset:/i, '');
    const hit = assets.find(a => a && (a.name === name || a.name === raw));
    return hit && typeof hit.url === 'string' ? hit.url : '';
}
function effectTextureKey(e) {
    return effectImageURL(e) || '';
}
function effectSpriteIndex(e) {
    const s = effectConfig(e).sprite;
    return Math.max(0, EFFECT_SPRITES.indexOf(s));
}
function effectState(id) {
    let s = effectStates.get(id);
    if (s) return s;
    const o = sceneObjects[id];
    const max = o && o.type === 'advancedeffect' ? EFFECT_MAX_ADVANCED : EFFECT_MAX_SIMPLE;
    s = {
        max, count: 0, acc: 0, started: false,
        pos: new Float32Array(max * 3), vel: new Float32Array(max * 3),
        age: new Float32Array(max), life: new Float32Array(max),
        size0: new Float32Array(max), size1: new Float32Array(max),
        r0: new Float32Array(max), g0: new Float32Array(max), b0: new Float32Array(max),
        r1: new Float32Array(max), g1: new Float32Array(max), b1: new Float32Array(max),
        fadeIn: new Float32Array(max), fadeOut: new Float32Array(max),
        spin: new Float32Array(max), angle: new Float32Array(max),
        sprite: new Int8Array(max), local: new Uint8Array(max), blend: new Uint8Array(max)
    };
    effectStates.set(id, s);
    return s;
}
const effectStates = new Map();
function clearEffectStates() { effectStates.clear(); }
function effectAnchor(e) {
    const p = sceneObjects[e.parent];
    if (!p) return { x: e.x || 0, y: e.y || 0, z: e.z || 0, m: IDENT3 };
    if (p.type === 'model') {
        const b = typeof getModelBounds === 'function' ? getModelBounds(e.parent) : null;
        if (b) return { x: b.x + (e.x || 0), y: b.y + (e.y || 0), z: b.z + (e.z || 0), m: IDENT3 };
    }
    if (isShape(p)) {
        const m = rotMat(p);
        return {
            x: p.x + m[0] * (e.x || 0) + m[1] * (e.y || 0) + m[2] * (e.z || 0),
            y: p.y + m[3] * (e.x || 0) + m[4] * (e.y || 0) + m[5] * (e.z || 0),
            z: p.z + m[6] * (e.x || 0) + m[7] * (e.y || 0) + m[8] * (e.z || 0),
            m
        };
    }
    return { x: e.x || 0, y: e.y || 0, z: e.z || 0, m: IDENT3 };
}
const EFFECT_COL = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
function effectDirection(cfg) {
    // A cone around +Y, with the requested spread: 0 is straight up, 180 is the whole sphere.
    const cosMax = Math.cos(Math.max(0, Math.min(Math.PI, cfg.spread * Math.PI / 180)));
    const y = 1 - Math.random() * (1 - cosMax);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = Math.random() * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
}
function effectOffset(cfg) {
    const r = cfg.radius * Math.cbrt(Math.random());
    if (cfg.shape === 'point') return [0, 0, 0];
    if (cfg.shape === 'sphere') {
        const d = effectDirection({ spread: 180 });
        return [d[0] * r, d[1] * r, d[2] * r];
    }
    if (cfg.shape === 'cylinder') {
        const a = Math.random() * Math.PI * 2, rr = cfg.radius * Math.sqrt(Math.random());
        return [Math.cos(a) * rr, (Math.random() * 2 - 1) * cfg.radius, Math.sin(a) * rr];
    }
    if (cfg.shape === 'surface') {
        const side = Math.floor(Math.random() * 6), u = (Math.random() * 2 - 1) * cfg.radius;
        const v = (Math.random() * 2 - 1) * cfg.radius;
        if (side === 0) return [cfg.radius, u, v];
        if (side === 1) return [-cfg.radius, u, v];
        if (side === 2) return [u, cfg.radius, v];
        if (side === 3) return [u, -cfg.radius, v];
        if (side === 4) return [u, v, cfg.radius];
        return [u, v, -cfg.radius];
    }
    return [(Math.random() * 2 - 1) * cfg.radius, (Math.random() * 2 - 1) * cfg.radius, (Math.random() * 2 - 1) * cfg.radius];
}
function effectSpawn(id, count) {
    const e = sceneObjects[id];
    if (!isEffect(e) || !(count > 0)) return;
    const st = effectState(id), cfg = effectConfig(e), a = effectAnchor(e);
    const c0 = EFFECT_COL(cfg.colorStart), c1 = EFFECT_COL(cfg.colorEnd), sprite = effectSpriteIndex(e);
    const local = e.type === 'advancedeffect' && e.space === 'local';
    const blend = cfg.blend === 'additive' ? 1 : 0;
    const n = Math.min(Math.floor(count), st.max - st.count);
    for (let k = 0; k < n; k++) {
        const off = effectOffset(cfg), d = effectDirection(cfg), speed = cfg.speed * (0.72 + Math.random() * 0.56);
        const i = st.count++;
        let ox = off[0], oy = off[1], oz = off[2];
        if (!local) {
            const m = a.m;
            st.pos[i * 3] = a.x + m[0] * ox + m[1] * oy + m[2] * oz;
            st.pos[i * 3 + 1] = a.y + m[3] * ox + m[4] * oy + m[5] * oz;
            st.pos[i * 3 + 2] = a.z + m[6] * ox + m[7] * oy + m[8] * oz;
            const dx = m[0] * d[0] + m[1] * d[1] + m[2] * d[2], dy = m[3] * d[0] + m[4] * d[1] + m[5] * d[2], dz = m[6] * d[0] + m[7] * d[1] + m[8] * d[2];
            st.vel[i * 3] = dx * speed; st.vel[i * 3 + 1] = dy * speed; st.vel[i * 3 + 2] = dz * speed;
        } else {
            st.pos[i * 3] = ox; st.pos[i * 3 + 1] = oy; st.pos[i * 3 + 2] = oz;
            st.vel[i * 3] = d[0] * speed; st.vel[i * 3 + 1] = d[1] * speed; st.vel[i * 3 + 2] = d[2] * speed;
        }
        st.age[i] = 0;
        st.life[i] = cfg.lifetime * (0.8 + Math.random() * 0.4);
        const sizeScale = 0.82 + Math.random() * 0.36;
        st.size0[i] = cfg.sizeStart * sizeScale;
        st.size1[i] = cfg.sizeEnd * sizeScale;
        st.r0[i] = c0[0]; st.g0[i] = c0[1]; st.b0[i] = c0[2];
        st.r1[i] = c1[0]; st.g1[i] = c1[1]; st.b1[i] = c1[2];
        st.fadeIn[i] = cfg.fadeIn; st.fadeOut[i] = cfg.fadeOut;
        st.spin[i] = (Math.random() * 2 - 1) * cfg.rotation * Math.PI / 180;
        st.angle[i] = Math.random() * Math.PI * 2;
        st.sprite[i] = sprite;
        st.local[i] = local ? 1 : 0;
        st.blend[i] = blend;
    }
}
function effectPlay(id) {
    const e = sceneObjects[id];
    if (!isEffect(e)) return;
    e.emitting = true;
    const st = effectState(id);
    st.acc = 0; st.started = true;
    // Play starts a burst preset from the beginning, whether it is a SimpleEffect or an AdvancedEffect.
    const burst = effectConfig(e).burst;
    if (burst > 0) effectSpawn(id, burst);
}
function effectStop(id) {
    const e = sceneObjects[id];
    if (isEffect(e)) e.emitting = false;
}
function effectEmit(id, count) {
    if (!sceneObjects[id]) return;
    effectSpawn(id, Math.max(0, Math.min(300, Math.floor(+count || 0))));
}
function effectSwap(st, i, j) {
    if (i === j) return;
    const swap1 = (arr) => { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; };
    for (const arr of [st.age, st.life, st.size0, st.size1, st.r0, st.g0, st.b0, st.r1, st.g1, st.b1, st.fadeIn, st.fadeOut, st.spin, st.angle, st.sprite, st.local, st.blend]) swap1(arr);
    const p = st.pos[i * 3], py = st.pos[i * 3 + 1], pz = st.pos[i * 3 + 2];
    st.pos[i * 3] = st.pos[j * 3]; st.pos[i * 3 + 1] = st.pos[j * 3 + 1]; st.pos[i * 3 + 2] = st.pos[j * 3 + 2];
    st.pos[j * 3] = p; st.pos[j * 3 + 1] = py; st.pos[j * 3 + 2] = pz;
    const vx = st.vel[i * 3], vy = st.vel[i * 3 + 1], vz = st.vel[i * 3 + 2];
    st.vel[i * 3] = st.vel[j * 3]; st.vel[i * 3 + 1] = st.vel[j * 3 + 1]; st.vel[i * 3 + 2] = st.vel[j * 3 + 2];
    st.vel[j * 3] = vx; st.vel[j * 3 + 1] = vy; st.vel[j * 3 + 2] = vz;
}
function updateEffects(dt, effects) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const active = new Set();
    for (const [id, e] of effects) {
        if (!isEffect(e) || spaceOf(e) !== 'world') continue;
        active.add(id);
        const st = effectState(id), cfg = effectConfig(e);
        if (e.emitting) {
            // A burst preset (and an AdvancedEffect with Burst set) fires once when it first starts.
            if (!st.started && cfg.burst > 0) { st.started = true; effectSpawn(id, cfg.burst); }
            st.acc += dt * cfg.rate;
            if (st.acc >= 1) {
                const n = Math.floor(st.acc);
                st.acc -= n;
                effectSpawn(id, n);
            }
        }
        for (let i = st.count - 1; i >= 0; i--) {
            st.age[i] += dt;
            if (st.age[i] >= st.life[i]) { st.count--; effectSwap(st, i, st.count); continue; }
            const drag = Math.max(0, cfg.drag);
            const damp = 1 / (1 + drag * dt);
            st.vel[i * 3] *= damp; st.vel[i * 3 + 1] = st.vel[i * 3 + 1] * damp + cfg.gravity * dt; st.vel[i * 3 + 2] *= damp;
            st.pos[i * 3] += st.vel[i * 3] * dt;
            st.pos[i * 3 + 1] += st.vel[i * 3 + 1] * dt;
            st.pos[i * 3 + 2] += st.vel[i * 3 + 2] * dt;
            st.angle[i] += st.spin[i] * dt;
        }
    }
    for (const id of effectStates.keys()) if (!active.has(id) || !sceneObjects[id]) effectStates.delete(id);
}
function effectRenderItems(effects) {
    const out = [];
    for (const [id, e] of effects) {
        const st = effectStates.get(id);
        if (!st || !st.count || !isEffect(e)) continue;
        out.push({ id, e, st, a: effectAnchor(e) });
    }
    return out;
}
