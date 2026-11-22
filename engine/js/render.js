// Vanilla Engine — 3D math, scene rendering, WebGL and lighting. Loaded in order by index.html; all files share one global scope.
        // ───────── 3D math ─────────
        class Vec3 {
            constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
            dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
            normalize() { const len = Math.hypot(this.x, this.y, this.z) || 1; return new Vec3(this.x / len, this.y / len, this.z / len); }
        }

        function getVerts(o) {
            const l = o.length, w = o.width, h = o.height, ox = o.x || 0, oy = o.y || 0, oz = o.z || 0;
            const R = rotMat(o), at = (sx, sy, sz) => { const a = sx * w, b = sy * h, c = sz * l; return new Vec3(ox + R[0] * a + R[1] * b + R[2] * c, oy + R[3] * a + R[4] * b + R[5] * c, oz + R[6] * a + R[7] * b + R[8] * c); };
            return [at(-1, -1, -1), at(1, -1, -1), at(1, 1, -1), at(-1, 1, -1), at(-1, -1, 1), at(1, -1, 1), at(1, 1, 1), at(-1, 1, 1)];
        }

        const vfVertices = [
            new Vec3(-0.5, -0.5, -0.5), new Vec3(0.5, -0.5, -0.5), new Vec3(0.5, 0.5, -0.5), new Vec3(-0.5, 0.5, -0.5),
            new Vec3(-0.5, -0.5, 0.5), new Vec3(0.5, -0.5, 0.5), new Vec3(0.5, 0.5, 0.5), new Vec3(-0.5, 0.5, 0.5)
        ];

        const faces = [
            { indices: [4, 5, 6, 7], label: 'Front',  color: '#ef4444', normal: new Vec3( 0,  0,  1), up: new Vec3( 0,  1,  0), right: new Vec3( 1,  0,  0) },
            { indices: [1, 0, 3, 2], label: 'Back',   color: '#22c55e', normal: new Vec3( 0,  0, -1), up: new Vec3( 0,  1,  0), right: new Vec3(-1,  0,  0) },
            { indices: [5, 1, 2, 6], label: 'Right',  color: '#3b82f6', normal: new Vec3( 1,  0,  0), up: new Vec3( 0,  1,  0), right: new Vec3( 0,  0, -1) },
            { indices: [0, 4, 7, 3], label: 'Left',   color: '#eab308', normal: new Vec3(-1,  0,  0), up: new Vec3( 0,  1,  0), right: new Vec3( 0,  0,  1) },
            { indices: [3, 2, 6, 7], label: 'Top',    color: '#a855f7', normal: new Vec3( 0,  1,  0), up: new Vec3( 0,  0, -1), right: new Vec3( 1,  0,  0) },
            { indices: [0, 1, 5, 4], label: 'Bottom', color: '#f97316', normal: new Vec3( 0, -1,  0), up: new Vec3( 0,  0,  1), right: new Vec3( 1,  0,  0) }
        ];

        let angleX = -0.3, angleY = -0.6;
        let camPosX = -8 * Math.cos(angleX) * Math.sin(angleY), camPosY = -8 * Math.sin(angleX), camPosZ = 8 * Math.cos(angleX) * Math.cos(angleY);
        const keyState = {};
        const lightDir = new Vec3(-0.5, -0.8, -1.0).normalize();

        // Camera basis for a level, y-up world: angleY = yaw (turn), angleX = pitch (positive looks up)
        let sinX = 0, cosX = 1, sinY = 0, cosY = 1;
        let fwdX = 0, fwdY = 0, fwdZ = -1, rgtX = 1, rgtZ = 0, upX = 0, upY = 1, upZ = 0;
        function updateTrig() {
            sinX = Math.sin(angleX); cosX = Math.cos(angleX); sinY = Math.sin(angleY); cosY = Math.cos(angleY);
            fwdX = cosX * sinY; fwdY = sinX; fwdZ = -cosX * cosY;
            rgtX = cosY; rgtZ = sinY;
            upX = -sinY * sinX; upY = cosX; upZ = cosY * sinX;
        }

        // World (x right, y UP, z toward viewer) -> camera space; y is returned as "down" for the screen
        function transformPoint(p) {
            const rx = p.x - camPosX, ry = p.y - camPosY, rz = p.z - camPosZ;
            return new Vec3(rx * rgtX + rz * rgtZ, -(rx * upX + ry * upY + rz * upZ), rx * fwdX + ry * fwdY + rz * fwdZ);
        }
        function rotateVector(v) {
            return new Vec3(v.x * rgtX + v.z * rgtZ, -(v.x * upX + v.y * upY + v.z * upZ), v.x * fwdX + v.y * fwdY + v.z * fwdZ);
        }
        function project(p) {
            const t = transformPoint(p), s = FOV / t.z;
            return { x: t.x * s + cx, y: t.y * s + cy, z: t.z };
        }
        // World-space direction of the camera ray through screen point (sx, sy)
        function rayDir(sx, sy) {
            updateTrig();
            const a = sx - cx, b = -(sy - cy);
            return new Vec3(a * rgtX + b * upX + FOV * fwdX, b * upY + FOV * fwdY, a * rgtZ + b * upZ + FOV * fwdZ);
        }
        // Where along the line (A + t·d) the mouse ray comes closest; null when the line points straight at the camera
        function axisParam(A, d, sx, sy) {
            const r = rayDir(sx, sy);
            const w0 = new Vec3(A.x - camPosX, A.y - camPosY, A.z - camPosZ);
            const b = d.dot(r), c = r.dot(r), dd = d.dot(w0), e = r.dot(w0);
            const den = c - b * b;
            if (den < 1e-3 * c) return null;
            return (b * e - c * dd) / den;
        }

        function isTyping() {
            const el = document.activeElement;
            return !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'checkbox'));
        }

        window.addEventListener('keydown', (e) => {
            if (isTyping()) return;
            const k = e.key.toLowerCase();
            if (['w', 'a', 's', 'd'].includes(k)) keyState[k] = true;
            if (simulationRunning && (k === ' ' || k === 'shift' || k === 'arrowup' || k === 'arrowdown')) { keyState[k] = true; if (k !== 'shift') e.preventDefault(); }
            if (!manip && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (k === '1') setMode('select');
                else if (k === '2') setMode('move');
                else if (k === '3') setMode('scale');
                else if (k === '4') setMode('rotate');
            }
        });
        window.addEventListener('keyup', (e) => { keyState[e.key.toLowerCase()] = false; if (simulationRunning && e.key === ' ' && !isTyping()) e.preventDefault(); });
        window.addEventListener('blur', () => { for (const k in keyState) keyState[k] = false; });

        function shadeRGB(hex, b) {
            const k = 0.2 + b * 0.8;
            return [1, 3, 5].map(i => Math.min(1, parseInt(hex.slice(i, i + 2), 16) / 255 * k));
        }
        function applyLighting(hexColor, brightness) {
            return `rgb(${shadeRGB(hexColor, brightness).map(v => Math.round(v * 255)).join(', ')})`;
        }
        // Fog: the haze thickens with distance, and a render distance fades a shape into the sky completely by its
        // edge, so the distance it stops being drawn at is never visible as a hard line.
        function fogAmount(dist) {
            const far = settings.renderDistance > 0 ? settings.renderDistance : 0;
            let f = settings.haze !== false && settings.lighting !== 'classic'
                ? Math.min(0.9, 1 - Math.exp(-Math.pow(dist * 0.0035, 2))) : 0;
            if (far > 0) f = Math.max(f, smooth(far * 0.5, far, dist));
            return f;
        }
        const shadedCss = (hex, brightness, fog = 0) => fog > 0.002
            ? rgbStr(mixRGB(shadeRGB(hex, brightness).map(v => v * 255), sky.hor, fog))
            : applyLighting(hex, brightness);

        // ───────── Viewfinder ─────────
        function renderViewfinder() {
            vfCtx.clearRect(0, 0, 90, 90);
            const vfCx = 45, vfCy = 45, vfZoom = 32;
            function vfTransform(p) {
                const x2 = p.x * rgtX + p.z * rgtZ, y2 = -(p.x * upX + p.y * upY + p.z * upZ), z2 = p.x * fwdX + p.y * fwdY + p.z * fwdZ;
                return { x: (x2 * vfZoom) + vfCx, y: (y2 * vfZoom) + vfCy, z: z2 };
            }
            const vfTransformed = vfVertices.map(v => vfTransform(v));
            const vfVisibleFaces = [];
            for (let face of faces) {
                const normTransformed = rotateVector(face.normal);
                let cz = 0;
                for (let idx of face.indices) { cz += vfTransformed[idx].z; }
                cz /= face.indices.length;
                if (normTransformed.z < 0) vfVisibleFaces.push({ ...face, depth: cz });
            }
            vfVisibleFaces.sort((a, b) => b.depth - a.depth);
            for (let face of vfVisibleFaces) {
                const pts = face.indices.map(idx => vfTransformed[idx]);
                vfCtx.beginPath();
                vfCtx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) vfCtx.lineTo(pts[i].x, pts[i].y);
                vfCtx.closePath();
                vfCtx.fillStyle = face.color;
                vfCtx.fill();
                vfCtx.lineWidth = 1.5;
                vfCtx.strokeStyle = '#ffffff';
                vfCtx.stroke();
                let avgX = 0, avgY = 0;
                for (let p of pts) { avgX += p.x; avgY += p.y; }
                avgX /= pts.length; avgY /= pts.length;
                vfCtx.fillStyle = '#ffffff';
                vfCtx.font = 'bold 9px -apple-system, sans-serif';
                vfCtx.textAlign = 'center';
                vfCtx.textBaseline = 'middle';
                vfCtx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                vfCtx.shadowBlur = 3;
                vfCtx.fillText(face.label, avgX, avgY);
                vfCtx.shadowBlur = 0;
            }
        }

        // ───────── Sky & time of day ─────────
        const SKY_KEYS = [
            [0,    [5, 8, 22],     [14, 20, 48]],
            [5,    [14, 20, 52],   [40, 40, 90]],
            [6,    [52, 74, 140],  [244, 160, 96]],
            [7.5,  [74, 138, 214], [190, 222, 245]],
            [12,   [47, 128, 216], [176, 218, 248]],
            [16.5, [64, 140, 218], [196, 224, 244]],
            [18,   [60, 90, 170],  [248, 170, 100]],
            [19,   [30, 38, 95],   [200, 96, 80]],
            [20.5, [10, 14, 40],   [38, 32, 78]],
            [24,   [5, 8, 22],     [14, 20, 48]]
        ];
        const lerp = (a, b, t) => a + (b - a) * t;
        const mixRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
        const rgbStr = (c, a = 1) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;
        const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        function skyAt(t) {
            t = ((t % 24) + 24) % 24;
            for (let i = 0; i < SKY_KEYS.length - 1; i++) {
                const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
                if (t <= b[0]) { const u = (t - a[0]) / (b[0] - a[0]); return { top: mixRGB(a[1], b[1], u), hor: mixRGB(a[2], b[2], u) }; }
            }
            return { top: SKY_KEYS[0][1], hor: SKY_KEYS[0][2] };
        }
        function fmtTime(h) {
            let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
            if (mm === 60) { hh++; mm = 0; }
            return String(hh % 24).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
        }
        function parseTime(str) {
            const m = /^(\d{1,2}):(\d{2})/.exec(str || '');
            return m ? Math.min(23, +m[1]) + Math.min(59, +m[2]) / 60 : null;
        }
        function getTimeOfDay() {
            for (const o of Object.values(sceneObjects)) if (o.type === 'worldsettings' && spaceOf(o) === 'world') return o.timeOfDay;
            return 14;
        }

        const stars = (() => {
            let seed = 1337;
            const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
            const out = [];
            for (let i = 0; i < 150; i++) {
                const th = rnd() * Math.PI * 2, y = 0.05 + rnd() * 0.95, rr = Math.sqrt(1 - y * y);
                out.push({ v: new Vec3(rr * Math.cos(th), y, rr * Math.sin(th)), size: 0.6 + rnd() * 1.1, a: 0.35 + rnd() * 0.65 });
            }
            return out;
        })();

        let skyBright = true;
        const sky = { top: [0, 0, 0], hor: [0, 0, 0], sunDir: new Vec3(0, 1, 0), moonDir: new Vec3(0, -1, 0), sunElev: 1, nightAmt: 0, lightWorld: new Vec3(0, 1, 0), lightStrength: 1, ambient: 0.5 };

        function updateSky() {
            const t = getTimeOfDay();
            const c = skyAt(t);
            sky.top = c.top; sky.hor = c.hor;
            const a = (t - 6) / 24 * Math.PI * 2;
            sky.sunDir = new Vec3(Math.cos(a), Math.sin(a), 0.35).normalize();
            sky.moonDir = new Vec3(-sky.sunDir.x, -sky.sunDir.y, -sky.sunDir.z);
            sky.sunElev = sky.sunDir.y;
            const day = smooth(-0.08, 0.3, sky.sunElev);
            sky.nightAmt = 1 - smooth(-0.2, 0.05, sky.sunElev);
            if (sky.sunElev > 0) { sky.lightWorld = sky.sunDir; sky.lightStrength = 0.1 + 0.9 * smooth(0, 0.25, sky.sunElev); }
            else { sky.lightWorld = sky.moonDir; sky.lightStrength = 0.35 * smooth(0, 0.25, -sky.sunElev); }
            sky.ambient = 0.2 + 0.3 * day;
            const mid = mixRGB(c.top, c.hor, 0.5);
            skyBright = (0.2126 * mid[0] + 0.7152 * mid[1] + 0.0722 * mid[2]) / 255 > 0.42;
        }

        function skyPoint(dir) {
            const c = rotateVector(dir);
            if (c.z < 0.05) return null;
            return { x: cx + c.x / c.z * FOV, y: cy + c.y / c.z * FOV };
        }

        // The sky is two full-screen gradients plus stars and the sun or moon. Redrawing it every frame is wasted work
        // while the camera and time of day have not moved, so it is repainted only when something in it changes.
        let lastSkyKey = '';
        function drawSky() {
            // The horizon sits where level ground would meet the sky, so it follows the camera tilt
            let horizonY = cy + FOV * Math.tan(angleX);
            if (!Number.isFinite(horizonY)) horizonY = cy;
            const sunP = sky.sunElev > -0.15 ? skyPoint(sky.sunDir) : null;
            const moonP = sky.sunElev < 0.1 ? skyPoint(sky.moonDir) : null;
            const skyKey = [width, height, horizonY.toFixed(1), sky.top.join(','), sky.hor.join(','), sky.nightAmt.toFixed(2),
                sunP ? Math.round(sunP.x) + ':' + Math.round(sunP.y) : '-',
                moonP ? Math.round(moonP.x) + ':' + Math.round(moonP.y) : '-'].join('|');
            if (skyKey === lastSkyKey) return;
            lastSkyKey = skyKey;
            const below = skyCtx.createLinearGradient(0, horizonY, 0, horizonY + height * 0.8);
            below.addColorStop(0, rgbStr(sky.hor));
            below.addColorStop(1, rgbStr(mixRGB(sky.hor, sky.top, 0.35).map(v => v * 0.8)));
            skyCtx.fillStyle = below;
            skyCtx.fillRect(0, 0, width, height);
            if (horizonY > 0) {
                const up = skyCtx.createLinearGradient(0, horizonY - height * 0.95, 0, horizonY);
                up.addColorStop(0, rgbStr(sky.top));
                up.addColorStop(1, rgbStr(sky.hor));
                skyCtx.fillStyle = up;
                skyCtx.fillRect(0, 0, width, Math.min(height, horizonY));
            }

            if (sky.nightAmt > 0.02) {
                skyCtx.fillStyle = '#ffffff';
                for (const st of stars) {
                    const p = skyPoint(st.v);
                    if (!p || p.x < -2 || p.x > width + 2 || p.y < -2 || p.y > height + 2) continue;
                    skyCtx.globalAlpha = st.a * sky.nightAmt;
                    skyCtx.beginPath(); skyCtx.arc(p.x, p.y, st.size, 0, Math.PI * 2); skyCtx.fill();
                }
                skyCtx.globalAlpha = 1;
            }

            if (sky.sunElev > -0.15) {
                const p = sunP;
                if (p) {
                    const warm = 1 - smooth(0, 0.4, sky.sunElev);
                    const col = mixRGB([255, 244, 210], [255, 140, 60], warm);
                    const fade = smooth(-0.15, 0.0, sky.sunElev);
                    skyCtx.save();
                    skyCtx.globalAlpha = fade;
                    const glow = skyCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 220);
                    glow.addColorStop(0, rgbStr(col, 0.55)); glow.addColorStop(0.15, rgbStr(col, 0.22)); glow.addColorStop(1, rgbStr(col, 0));
                    skyCtx.fillStyle = glow; skyCtx.fillRect(p.x - 220, p.y - 220, 440, 440);
                    skyCtx.beginPath(); skyCtx.arc(p.x, p.y, 24, 0, Math.PI * 2);
                    skyCtx.fillStyle = rgbStr(mixRGB(col, [255, 255, 255], 0.55)); skyCtx.fill();
                    skyCtx.restore();
                }
            }
            if (sky.sunElev < 0.1) {
                const p = moonP;
                if (p) {
                    skyCtx.save();
                    skyCtx.globalAlpha = smooth(-0.1, 0.15, -sky.sunElev);
                    const glow = skyCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 110);
                    glow.addColorStop(0, 'rgba(200, 215, 255, 0.35)'); glow.addColorStop(1, 'rgba(200, 215, 255, 0)');
                    skyCtx.fillStyle = glow; skyCtx.fillRect(p.x - 110, p.y - 110, 220, 220);
                    skyCtx.beginPath(); skyCtx.arc(p.x, p.y, 17, 0, Math.PI * 2);
                    skyCtx.fillStyle = '#e8eefc'; skyCtx.fill();
                    skyCtx.restore();
                }
            }
        }

        // ───────── Move / Scale handles ─────────
        const AXIS_COLOR = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' };
        const HALF_KEY = { x: 'width', y: 'height', z: 'length' };
        let lastHandles = [];
        let lastFaces = [];
        let hoverKey = null;
        let manip = null;      // active handle drag; while set the camera is locked
        let camDrag = null;
        const LOOK_SENS = 0.008, PITCH_LIMIT = 1.5;
        const clampPitch = (a) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, a));

        function canEditHandles() {
            const o = sceneObjects[selectedObjectId];
            if (mode === 'select' || !o || spaceOf(o) !== 'world') return false;
            if (mode === 'rotate') return isShape(o) && !o.locked;
            if (isShape(o)) return !o.locked;
            if (o.type === 'model') return getModelPrisms(selectedObjectId).length > 0;
            return false;
        }

        // A handle on the far side of the object is hidden by the depth buffer, so it must not catch clicks there.
        // Test a point at the tip of each handle against the same ray picker that selects instances.
        function handleHidden(h) {
            const p = h.type === 'rotate'
                ? (h.worldPts && h.worldPts[Math.floor(h.worldPts.length / 2)])
                : h.worldB;
            if (!p) return false;
            const s = project(new Vec3(p[0], p[1], p[2]));
            if (s.z < 0.1) return true;
            const hit = pickInstanceAt(s.x, s.y);
            if (!hit) return false;
            const dist = Math.hypot(p[0] - camPosX, p[1] - camPosY, p[2] - camPosZ);
            return hit.t < dist - 0.06;
        }
        function markHiddenHandles(out) {
            if (GL) for (const h of out) h.hidden = handleHidden(h);
            return out;
        }
        function buildHandles(o) {
            if (mode === 'rotate') return markHiddenHandles(buildRotateHandles(o));
            const out = [];
            const R = rotMat(o), ex = shapeHalfExt(o), half = [o.width, o.height, o.length];
            // Handle size is a share of the shape's average full size, never smaller than ~34px on screen
            const base = ((ex[0] + ex[1] + ex[2]) * 2 / 3) / 2.5;
            ['x', 'y', 'z'].forEach((axis, ai) => {
                for (const sign of [1, -1]) {
                    const e = [axis === 'x' ? sign : 0, axis === 'y' ? sign : 0, axis === 'z' ? sign : 0];
                    // Move arrows follow the world axes; Scale spheres follow the shape's own (tilted) axes
                    const d = mode === 'scale' ? new Vec3(R[ai] * sign, R[3 + ai] * sign, R[6 + ai] * sign) : new Vec3(e[0], e[1], e[2]);
                    const center = mode === 'scale'
                        ? new Vec3(o.x + d.x * half[ai], o.y + d.y * half[ai], o.z + d.z * half[ai])
                        : new Vec3(o.x + e[0] * ex[0], o.y + e[1] * ex[1], o.z + e[2] * ex[2]);
                    const pc = project(center);
                    if (pc.z < 0.3) continue;
                    const sw = Math.max(base, 34 * pc.z / FOV);
                    const g = sw * 0.1;
                    let a, b, r = 0, wa, wb;
                    if (mode === 'move') {
                        wa = new Vec3(center.x + d.x * g, center.y + d.y * g, center.z + d.z * g);
                        wb = new Vec3(center.x + d.x * (g + sw), center.y + d.y * (g + sw), center.z + d.z * (g + sw));
                        a = project(wa); b = project(wb);
                    } else {
                        a = pc; wa = center;
                        const k = g + sw * 0.65;
                        wb = new Vec3(center.x + d.x * k, center.y + d.y * k, center.z + d.z * k);
                        b = project(wb);
                        r = Math.max(7, sw * 0.2 * FOV / b.z);
                    }
                    if (a.z < 0.1 || b.z < 0.1) continue;
                    out.push({
                        key: axis + sign, type: mode, axis, sign, d, center, a, b, r, z: pc.z, color: AXIS_COLOR[axis],
                        worldA: [wa.x, wa.y, wa.z], worldB: [wb.x, wb.y, wb.z],
                        bodyR: Math.max(0.008, sw * 0.018), tipR: Math.max(0.03, sw * 0.2),
                        headR: Math.max(0.035, sw * 0.095), headLen: Math.max(0.06, sw * 0.3)
                    });
                }
            });
            return markHiddenHandles(out);
        }

        // Rotate gizmo: one double-headed curved arrow per axis. The rings follow the same order the angles are applied in
        // (turn about world Y, tilt about the turned X, roll about the shape's own Z), so each arrow edits exactly its own number.
        function buildRotateHandles(o) {
            const R = rotMat(o), ry = (o.rotY || 0) * Math.PI / 180;
            const normals = { x: [Math.cos(ry), 0, -Math.sin(ry)], y: [0, 1, 0], z: [R[2], R[5], R[8]] };
            const ex = shapeHalfExt(o), pc0 = project(new Vec3(o.x, o.y, o.z));
            if (pc0.z < 0.3) return [];
            const rr = Math.max(Math.max(ex[0], ex[1], ex[2]) * 1.2, 46 * pc0.z / FOV);
            const cam = [camPosX, camPosY, camPosZ], c = [o.x, o.y, o.z], out = [];
            for (const axis of ['x', 'y', 'z']) {
                const n = normals[axis];
                const ref = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
                let u = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
                const ul = Math.hypot(u[0], u[1], u[2]) || 1; u = [u[0] / ul, u[1] / ul, u[2] / ul];
                const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
                const cd = [cam[0] - c[0], cam[1] - c[1], cam[2] - c[2]];
                const phi = Math.atan2(cd[0] * v[0] + cd[1] * v[1] + cd[2] * v[2], cd[0] * u[0] + cd[1] * u[1] + cd[2] * u[2]);
                const pts = [], worldPts = []; let ok = true;
                const N = 22, span = 0.66;
                for (let i = 0; i <= N; i++) {
                    const ang = phi + (i / N * 2 - 1) * span, cs = Math.cos(ang), sn = Math.sin(ang);
                    const w = new Vec3(c[0] + rr * (cs * u[0] + sn * v[0]), c[1] + rr * (cs * u[1] + sn * v[1]), c[2] + rr * (cs * u[2] + sn * v[2]));
                    const p = project(w);
                    if (p.z < 0.1) { ok = false; break; }
                    pts.push(p); worldPts.push([w.x, w.y, w.z]);
                }
                if (!ok) continue;
                out.push({
                    key: 'rot-' + axis, type: 'rotate', axis, n, u, v, center: c, pts, worldPts, z: pc0.z, color: AXIS_COLOR[axis],
                    bodyR: Math.max(0.01, rr * 0.028), headR: Math.max(0.025, rr * 0.075), headLen: Math.max(0.05, rr * 0.16)
                });
            }
            return out;
        }

        function distSeg(px, py, a, b) {
            const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
            let t = len2 ? ((px - a.x) * vx + (py - a.y) * vy) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t));
        }

        function findHandleAt(x, y) {
            let best = null;
            for (const h of lastHandles) {
                if (h.hidden) continue;
                let hit;
                if (h.type === 'rotate') { hit = false; for (let i = 0; i + 1 < h.pts.length && !hit; i++) hit = distSeg(x, y, h.pts[i], h.pts[i + 1]) <= 9; }
                else hit = h.type === 'move'
                    ? distSeg(x, y, h.a, h.b) <= 10
                    : (Math.hypot(x - h.b.x, y - h.b.y) <= h.r + 5 || distSeg(x, y, h.a, h.b) <= 5);
                if (hit && (!best || h.z < best.z)) best = h;
            }
            return best;
        }

        // ───────── User interface preview and editing ─────────
        // The UI is HTML laid over the viewport, so text stays crisp and an Input really takes typed text. In the
        // editor the layer ignores the mouse and the canvas hit test below drives selecting, moving and scaling;
        // while the simulation runs, buttons and inputs take their own clicks.
        const uiLayerEl = document.getElementById('ui-layer');
        // The snap grid follows Settings > Interface, and is read whenever a drag happens so a change applies at once.
        function uiGrid() { const v = Number(settings && settings.uiGrid); return [0.5, 1, 2, 5].includes(v) ? v : 1; }
        const UI_MIN_SIZE = 1;             // smallest size a UI element can be dragged to, in percent
        const uiNodes = new Map();         // instance id -> { el, type, label, field, kids }
        const uiCornerList = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];
        let lastUIHandles = [];
        let uiDragging = null;
        let uiGuides = [];
        let uiChrome = null;

        const uiRGBA = (hex, t) => {
            const h = HEX6.test(hex || '') ? hex : '#000000';
            return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${Math.round((1 - uiClamp(t, 0, 1)) * 1000) / 1000})`;
        };
        // Background blur is the backdrop filter behind an element, shared by frames and progress bars.
        function uiSetBackdrop(st, n) {
            const blur = uiClamp(n, 0, 20);
            if (blur > 0) {
                const css = 'blur(' + blur + 'px)';
                st.setProperty('backdrop-filter', css);
                st.setProperty('-webkit-backdrop-filter', css);
            } else {
                st.removeProperty('backdrop-filter');
                st.removeProperty('-webkit-backdrop-filter');
            }
        }
        function uiParentBox(o) {
            const p = sceneObjects[o.parent];
            return isUI(p) ? uiLayout(p) : { x: 0, y: 0, w: width, h: height };
        }
        // Where an element sits on screen, in canvas pixels. A Frame passes its own box down, so a child's percentages
        // are of the Frame, which is what makes a bar inside a frame work.
        function uiLayout(o) {
            const box = uiParentBox(o);
            const w = box.w * uiClamp(o.sizeX, UI_MIN_SIZE, 100) / 100, h = box.h * uiClamp(o.sizeY, UI_MIN_SIZE, 100) / 100;
            const cx = box.x + box.w * uiClamp(o.posX, 0, 100) / 100, cy = box.y + box.h * uiClamp(o.posY, 0, 100) / 100;
            return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy };
        }
        // Which Player's UI, or the UI space, the viewport is showing. The player's copy while the simulation runs;
        // otherwise only while a UI instance or the UI space itself is selected.
        function uiContainers() {
            if (simulationRunning) {
                return Object.entries(sceneObjects).filter(([, o]) => o.type === 'player')
                    .sort((a, b) => (a[1].order || 0) - (b[1].order || 0)).map(([id]) => id);
            }
            if (selectedSpaceId === 'ui') return ['ui'];
            const o = sceneObjects[selectedObjectId];
            if (!isUI(o)) {
                // A script that is a child of a UI element previews the same interface as the element.
                let id = o && o.parent, n = 0;
                while (id && sceneObjects[id] && !isUI(sceneObjects[id]) && n++ < 64) id = sceneObjects[id].parent;
                if (!id || !isUI(sceneObjects[id])) return [];
                const c = uiContainerOf(id);
                return c && (c === 'ui' || sceneObjects[c]) ? [c] : [];
            }
            const c = uiContainerOf(selectedObjectId);
            return c && (c === 'ui' || sceneObjects[c]) ? [c] : [];
        }
        // When Settings > Interface keeps the interface visible, the viewport draws the UI space even while a world
        // object is selected. Selection and hit testing still use uiContainers(), so world editing is untouched.
        function uiRenderContainers() {
            if (!simulationRunning && settings.alwaysShowUI) return ['ui'];
            return uiContainers();
        }
        function uiHidden(o) {
            let p = o, n = 0;
            while (isUI(p) && n++ < 64) { if (p.visible === false) return true; p = sceneObjects[p.parent]; }
            return false;
        }
        // The top-most element under a point. Later objects draw over earlier ones, so the last match wins.
        function uiPickAt(x, y, containers) {
            let hit = null;
            for (const [id, o] of Object.entries(sceneObjects)) {
                if (!isUI(o) || !containers.includes(uiContainerOf(id)) || uiHidden(o)) continue;
                const r = uiLayout(o);
                if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) hit = id;
            }
            return hit;
        }
        function findUIHandleAt(x, y) {
            for (const h of lastUIHandles) if (Math.hypot(x - h.px, y - h.py) <= 10) return h;
            return null;
        }

        function uiBuildNode(id, o) {
            const el = document.createElement('div');
            el.className = 'vui vui-' + o.type;
            const node = { el, type: o.type, kids: el, label: null, field: null };
            if (o.type === 'text' || o.type === 'button' || o.type === 'image') {
                const label = document.createElement('span');
                label.className = 'vui-label';
                el.appendChild(label);
                node.label = label;
            }
            if (o.type === 'button') {
                el.addEventListener('click', (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    if (simulationRunning) vlRuntime.fireUIEvent(id, 'Clicked', []);
                });
            }
            if (o.type === 'progressbar') {
                const track = document.createElement('div');
                track.className = 'vui-progress-track';
                const fill = document.createElement('div');
                fill.className = 'vui-progress-fill';
                const content = document.createElement('div');
                content.className = 'vui-progress-content';
                track.appendChild(fill);
                el.append(track, content);
                node.track = track;
                node.fill = fill;
                node.kids = content;
            }
            if (o.type === 'input') {
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.className = 'vui-field';
                inp.addEventListener('input', () => { const cur = sceneObjects[id]; if (cur) cur.text = inp.value; });
                inp.addEventListener('keydown', (ev) => {
                    if (ev.key !== 'Enter') return;
                    ev.stopPropagation();
                    const cur = sceneObjects[id];
                    if (cur) cur.text = inp.value;
                    if (simulationRunning) vlRuntime.fireUIEvent(id, 'Submitted', [inp.value]);
                });
                el.appendChild(inp);
                node.field = inp;
            }
            return node;
        }
        function uiApplyStyle(node, o, z) {
            const st = node.el.style, pct = (v) => uiClamp(v, 0, 100).toFixed(3) + '%';
            st.left = pct(o.posX); st.top = pct(o.posY);
            st.width = pct(o.sizeX); st.height = pct(o.sizeY);
            st.zIndex = String(z);
            st.display = o.visible === false ? 'none' : 'flex';
            st.backgroundColor = uiRGBA(o.color, o.transparency);
            if (node.type === 'progressbar') {
                const shape = o.shape === 'Circular' ? 'Circular' : 'Straight';
                const length = uiClamp(o.length, 0, 100);
                const track = node.track, fill = node.fill;
                // The track holds the background and fill so a Circular bar can mask its ring without clipping child UI.
                st.backgroundColor = 'transparent';
                st.overflow = 'visible';
                track.style.backgroundColor = uiRGBA(o.color, o.transparency);
                uiSetBackdrop(track.style, o.backgroundBlur);
                track.style.borderRadius = shape === 'Circular' ? '50%' : '0';
                track.classList.toggle('vui-progress-circular', shape === 'Circular');
                track.classList.toggle('vui-progress-straight', shape !== 'Circular');
                node.el.classList.toggle('vui-progress-circular', shape === 'Circular');
                node.el.classList.toggle('vui-progress-straight', shape !== 'Circular');
                const fillBlur = uiClamp(o.fillBlur, 0, 20);
                fill.style.filter = fillBlur > 0 ? 'blur(' + fillBlur + 'px)' : 'none';
                if (shape === 'Circular') {
                    fill.style.left = '0'; fill.style.top = '0'; fill.style.width = '100%'; fill.style.height = '100%';
                    fill.style.borderRadius = '50%';
                    fill.style.background = 'conic-gradient(from -90deg, ' + uiRGBA(o.fillColor, o.fillTransparency) + ' 0 ' + length + '%, rgba(0,0,0,0) ' + length + '% 100%)';
                } else {
                    fill.style.left = '0'; fill.style.top = '0'; fill.style.width = length + '%'; fill.style.height = '100%';
                    fill.style.borderRadius = '0';
                    fill.style.background = uiRGBA(o.fillColor, o.fillTransparency);
                }
            } else if (node.type === 'frame') {
                const bw = uiClamp(o.borderWidth, 0, 20);
                const bgBlur = uiClamp(o.backgroundBlur, 0, 20);
                const strokeBlur = uiClamp(o.borderBlur, 0, 20);
                const softStroke = bw > 0 && strokeBlur > 0;
                uiSetBackdrop(st, bgBlur);
                st.boxShadow = bw > 0 && !softStroke ? 'inset 0 0 0 ' + bw + 'px ' + uiRGBA(o.borderColor, 0) : 'none';
                st.overflow = o.clipChildren ? 'hidden' : 'visible';
                node.el.classList.toggle('vui-soft-stroke', softStroke);
                if (softStroke) {
                    st.setProperty('--vui-stroke-width', bw + 'px');
                    st.setProperty('--vui-stroke-color', uiRGBA(o.borderColor, 0));
                    st.setProperty('--vui-stroke-blur', strokeBlur + 'px');
                }
            } else if (node.type === 'text') {
                node.label.textContent = String(o.text == null ? '' : o.text);
                st.color = HEX6.test(o.textColor) ? o.textColor : '#ffffff';
                st.fontSize = uiClamp(o.textSize, 4, 200) + 'px';
                st.fontWeight = o.bold ? '700' : '400';
                st.justifyContent = o.align === 'Left' ? 'flex-start' : o.align === 'Right' ? 'flex-end' : 'center';
            } else if (node.type === 'button') {
                node.label.textContent = String(o.text == null ? '' : o.text);
                st.color = HEX6.test(o.textColor) ? o.textColor : '#ffffff';
                st.fontSize = uiClamp(o.textSize, 4, 200) + 'px';
                st.fontWeight = o.bold ? '700' : '400';
                st.justifyContent = o.align === 'Left' ? 'flex-start' : o.align === 'Right' ? 'flex-end' : 'center';
            } else if (node.type === 'image') {
                const src = typeof o.image === 'string' ? o.image.trim() : '';
                st.backgroundImage = src ? `url("${src.replace(/"/g, '%22')}")` : 'none';
                st.opacity = String(1 - uiClamp(o.transparency, 0, 1));
                node.label.textContent = src ? '' : 'Image';
            } else if (node.type === 'input') {
                const inp = node.field;
                if (document.activeElement !== inp && inp.value !== (o.text || '')) inp.value = o.text || '';
                inp.placeholder = o.placeholder || '';
                inp.style.color = HEX6.test(o.textColor) ? o.textColor : '#ffffff';
                inp.style.fontSize = uiClamp(o.textSize, 4, 200) + 'px';
                inp.style.textAlign = o.align === 'Right' ? 'right' : o.align === 'Center' ? 'center' : 'left';
            }
        }
        function uiSyncLayer() {
            if (!uiLayerEl) return;
            const containers = uiRenderContainers();
            uiLayerEl.classList.toggle('live', simulationRunning && containers.length > 0);
            const wanted = new Set();
            let z = 0;
            const place = (id, parentEl, o) => {
                wanted.add(id);
                let node = uiNodes.get(id);
                if (!node || node.type !== o.type) { if (node) node.el.remove(); node = uiBuildNode(id, o); uiNodes.set(id, node); }
                if (node.el.parentElement !== parentEl) parentEl.appendChild(node.el);
                uiApplyStyle(node, o, ++z);
                for (const [kidId, kid] of Object.entries(sceneObjects)) if (kid.parent === id && isUI(kid) && kid.visible !== false) place(kidId, node.kids, kid);
            };
            for (const [id, o] of Object.entries(sceneObjects)) if (isUI(o) && containers.includes(o.parent) && o.visible !== false) place(id, uiLayerEl, o);
            for (const [id, node] of [...uiNodes]) if (!wanted.has(id)) { node.el.remove(); uiNodes.delete(id); }
            uiSyncChrome(containers);
        }
        // Selection box, corner handles and the snapping lines are HTML too, so they always sit above the elements.
        function uiChromeReady() {
            if (uiChrome || !uiLayerEl) return uiChrome;
            const box = document.createElement('div'); box.className = 'vui-select';
            const handles = uiCornerList.map(() => { const h = document.createElement('div'); h.className = 'vui-handle'; return h; });
            const guides = [0, 1, 2, 3].map(() => { const g = document.createElement('div'); g.className = 'vui-guide'; return g; });
            uiLayerEl.append(...guides, box, ...handles);
            uiChrome = { box, handles, guides };
            return uiChrome;
        }
        function uiSyncChrome(containers) {
            const c = uiChromeReady();
            if (!c) return;
            const o = sceneObjects[selectedObjectId];
            lastUIHandles = [];
            const show = !simulationRunning && isUI(o) && containers.includes(uiContainerOf(selectedObjectId));
            c.box.style.display = show ? 'block' : 'none';
            c.handles.forEach(h => { h.style.display = 'none'; });
            if (show) {
                const r = uiLayout(o);
                Object.assign(c.box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
                if (mode === 'scale') {
                    uiCornerList.forEach((corner, i) => {
                        const px = r.cx + corner.x * r.w / 2, py = r.cy + corner.y * r.h / 2;
                        Object.assign(c.handles[i].style, { display: 'block', left: px + 'px', top: py + 'px' });
                        lastUIHandles.push({ corner, px, py });
                    });
                }
            }
            // Grid lines are shown only for the edges a drag is snapping to.
            c.guides.forEach((g, i) => {
                const line = uiGuides[i];
                if (!line || simulationRunning) { g.style.display = 'none'; return; }
                g.style.display = 'block';
                g.dataset.axis = line.axis;
                g.style.left = line.axis === 'x' ? line.px + 'px' : '0';
                g.style.top = line.axis === 'y' ? line.px + 'px' : '0';
            });
        }

        // Where dragging a corner puts an element: the opposite corner stays put, and a mostly diagonal drag scales both
        // axes evenly while a mostly horizontal or vertical one changes only that axis.
        function uiScaleResult(d, m) {
            const box = d.box, c = d.corner, s = d.start;
            const cx0 = box.w * s.posX / 100, cy0 = box.h * s.posY / 100;
            const hw0 = box.w * s.sizeX / 200, hh0 = box.h * s.sizeY / 200;
            const fx = cx0 - c.x * hw0, fy = cy0 - c.y * hh0;
            const mx = m.x - box.x, my = m.y - box.y;
            // How far the corner has moved on screen decides uniform against one-axis scaling, so the feel does not
            // depend on the shape of the element's parent.
            const rx = Math.abs(mx - (cx0 + c.x * hw0)), ry = Math.abs(my - (cy0 + c.y * hh0));
            const grid = uiGrid();
            let sizeX = Math.round(uiClamp(Math.abs(mx - fx) / Math.max(1, box.w) * 100, UI_MIN_SIZE, 100) / grid) * grid;
            let sizeY = Math.round(uiClamp(Math.abs(my - fy) / Math.max(1, box.h) * 100, UI_MIN_SIZE, 100) / grid) * grid;
            if (!(rx > 2 * ry || ry > 2 * rx)) {
                const grow = Math.max(sizeX / s.sizeX, sizeY / s.sizeY);
                sizeX = uiClamp(Math.round(s.sizeX * grow / grid) * grid, UI_MIN_SIZE, 100);
                sizeY = uiClamp(Math.round(s.sizeY * grow / grid) * grid, UI_MIN_SIZE, 100);
            } else if (rx > ry) sizeY = s.sizeY;
            else sizeX = s.sizeX;
            const nw = box.w * sizeX / 100, nh = box.h * sizeY / 100;
            return {
                posX: uiClamp((fx + c.x * nw / 2) / Math.max(1, box.w) * 100, 0, 100),
                posY: uiClamp((fy + c.y * nh / 2) / Math.max(1, box.h) * 100, 0, 100),
                sizeX, sizeY,
                guides: [{ axis: 'x', px: box.x + fx }, { axis: 'x', px: box.x + fx + c.x * nw },
                         { axis: 'y', px: box.y + fy }, { axis: 'y', px: box.y + fy + c.y * nh }]
            };
        }
        function uiStartMove(o, m) {
            uiDragging = { kind: 'move', o, sx: m.x, sy: m.y, box: uiParentBox(o), start: { posX: o.posX, posY: o.posY } };
            uiGuides = [];
            canvas.style.cursor = 'grabbing';
        }
        function uiStartScale(o, corner, m) {
            uiDragging = { kind: 'scale', o, corner, sx: m.x, sy: m.y, box: uiParentBox(o), start: { posX: o.posX, posY: o.posY, sizeX: o.sizeX, sizeY: o.sizeY } };
            uiGuides = [];
            canvas.style.cursor = 'grabbing';
        }
        function uiUpdateDrag(m) {
            const d = uiDragging;
            if (!d || !d.o || d.o !== sceneObjects[selectedObjectId]) return;
            const o = d.o, box = d.box;
            if (d.kind === 'move') {
                const grid = uiGrid();
                const snap = (v) => Math.round(v / grid) * grid;
                o.posX = uiClamp(snap(d.start.posX + (m.x - d.sx) / Math.max(1, box.w) * 100), 0, 100);
                o.posY = uiClamp(snap(d.start.posY + (m.y - d.sy) / Math.max(1, box.h) * 100), 0, 100);
                uiGuides = [{ axis: 'x', px: box.x + box.w * o.posX / 100 }, { axis: 'y', px: box.y + box.h * o.posY / 100 }];
            } else {
                const r = uiScaleResult(d, m);
                o.posX = r.posX; o.posY = r.posY; o.sizeX = r.sizeX; o.sizeY = r.sizeY;
                uiGuides = r.guides;
            }
            syncUIPropInputs();
        }
        function uiMouseDown(m) {
            if (simulationRunning) return false;   // in the simulation the UI takes its own clicks
            const containers = uiContainers();
            if (!containers.length) return false;
            if (mode === 'scale') {
                const h = findUIHandleAt(m.x, m.y);
                const sel = sceneObjects[selectedObjectId];
                if (h && isUI(sel)) { uiStartScale(sel, h.corner, m); return true; }
            }
            const hit = uiPickAt(m.x, m.y, containers);
            if (!hit) return false;
            if (hit !== selectedObjectId) selectItem(hit);
            if (mode === 'move') { uiStartMove(sceneObjects[hit], m); return true; }
            return mode === 'select' || mode === 'scale';
        }
        const UI_CURSOR = { '-1,-1': 'nwse-resize', '1,-1': 'nesw-resize', '1,1': 'nwse-resize', '-1,1': 'nesw-resize' };

        function drawHandle(h) {
            const active = manip && manip.h.key === h.key;
            const hot = active || hoverKey === h.key;
            ctx.save();
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            if (hot) { ctx.shadowColor = h.color; ctx.shadowBlur = 14; }
            if (h.type === 'rotate') {
                const P = h.pts, last = P.length - 1;
                const path = () => { ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i <= last; i++) ctx.lineTo(P[i].x, P[i].y); };
                const head = (tip, from) => {
                    const dx = tip.x - from.x, dy = tip.y - from.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, hl = 15, hw = 7;
                    ctx.beginPath(); ctx.moveTo(tip.x + ux * 4, tip.y + uy * 4);
                    ctx.lineTo(tip.x - ux * hl - uy * hw, tip.y - uy * hl + ux * hw); ctx.lineTo(tip.x - ux * hl + uy * hw, tip.y - uy * hl - ux * hw); ctx.closePath();
                };
                path(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = hot ? 8 : 7; ctx.stroke();
                head(P[last], P[last - 2]); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
                head(P[0], P[2]); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.stroke();
                path(); ctx.strokeStyle = h.color; ctx.lineWidth = hot ? 5 : 4; ctx.stroke();
                head(P[last], P[last - 2]); ctx.fillStyle = hot ? '#ffffff' : h.color; ctx.fill();
                head(P[0], P[2]); ctx.fill();
                ctx.restore();
                return;
            }
            const dx = h.b.x - h.a.x, dy = h.b.y - h.a.y, len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len;

            if (h.type === 'move') {
                const hl = Math.min(len * 0.5, Math.max(10, len * 0.36));
                const sx = h.b.x - ux * hl * 0.8, sy = h.b.y - uy * hl * 0.8;
                const hw = hl * 0.42;
                const tri = () => {
                    ctx.beginPath();
                    ctx.moveTo(h.b.x, h.b.y);
                    ctx.lineTo(h.b.x - ux * hl - uy * hw, h.b.y - uy * hl + ux * hw);
                    ctx.lineTo(h.b.x - ux * hl + uy * hw, h.b.y - uy * hl - ux * hw);
                    ctx.closePath();
                };
                ctx.beginPath(); ctx.moveTo(h.a.x, h.a.y); ctx.lineTo(sx, sy);
                ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = hot ? 7 : 6; ctx.stroke();
                tri(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(h.a.x, h.a.y); ctx.lineTo(sx, sy);
                ctx.strokeStyle = h.color; ctx.lineWidth = hot ? 4.5 : 3.5; ctx.stroke();
                tri(); ctx.fillStyle = hot ? '#ffffff' : h.color; ctx.fill();
                if (hot) { ctx.lineWidth = 2; ctx.strokeStyle = h.color; ctx.stroke(); }
            } else {
                ctx.beginPath(); ctx.moveTo(h.a.x, h.a.y); ctx.lineTo(h.b.x, h.b.y);
                ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 5; ctx.stroke();
                ctx.strokeStyle = h.color; ctx.lineWidth = 2.5; ctx.stroke();
                const grad = ctx.createRadialGradient(h.b.x - h.r * 0.35, h.b.y - h.r * 0.35, h.r * 0.1, h.b.x, h.b.y, h.r);
                grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, h.color); grad.addColorStop(1, h.color);
                ctx.beginPath(); ctx.arc(h.b.x, h.b.y, h.r * (hot ? 1.15 : 1), 0, Math.PI * 2);
                ctx.fillStyle = grad; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = hot ? '#ffffff' : 'rgba(0,0,0,0.55)'; ctx.stroke();
            }
            ctx.restore();
        }

        // ───────── Draw order ─────────
        // Prisms are axis-aligned boxes. If two boxes are separated by a plane, the one on the camera's side of that
        // plane can never be hidden by the other, so it is drawn later. Whole prisms are ordered, never single faces.
        function boxInFront(a, b) {
            const cam = [camPosX, camPosY, camPosZ];
            for (let k = 0; k < 3; k++) {
                if (a.max[k] <= b.min[k]) return cam[k] < (a.max[k] + b.min[k]) / 2 ? 1 : -1;   // 1: a drawn after b
                if (b.max[k] <= a.min[k]) return cam[k] < (b.max[k] + a.min[k]) / 2 ? -1 : 1;
            }
            return 0;   // overlapping volumes: no plane separates them
        }
        function orderPrisms(entries) {
            const cam = [camPosX, camPosY, camPosZ];
            const boxes = entries.map(([id, o]) => {
                const e = shapeHalfExt(o), min = [o.x - e[0], o.y - e[1], o.z - e[2]], max = [o.x + e[0], o.y + e[1], o.z + e[2]];
                const dist = Math.hypot(o.x - cam[0], o.y - cam[1], o.z - cam[2]);
                return { entry: [id, o], min, max, dist };
            });
            const n = boxes.length, after = boxes.map(() => []), waiting = new Array(n).fill(0);
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
                let r = boxInFront(boxes[i], boxes[j]);
                if (r === 0) r = boxes[i].dist > boxes[j].dist ? -1 : 1;   // overlapping: fall back to distance
                if (r < 0) { after[i].push(j); waiting[j]++; } else { after[j].push(i); waiting[i]++; }
            }
            const done = new Array(n).fill(false), out = [];
            for (let c = 0; c < n; c++) {
                let pick = -1;
                for (let i = 0; i < n; i++) if (!done[i] && waiting[i] === 0 && (pick < 0 || boxes[i].dist > boxes[pick].dist)) pick = i;
                if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || boxes[i].dist > boxes[pick].dist)) pick = i;   // cycle: farthest first
                done[pick] = true; out.push(boxes[pick].entry);
                for (const j of after[pick]) waiting[j]--;
            }
            return out;
        }

        // ───────── Render loop ─────────
        let frameCount = 0, lastFpsTime = performance.now(), currentFps = 60;

        function draw3DLine(p1, p2, color, lineWidth = 1) {
            const t1 = transformPoint(p1), t2 = transformPoint(p2);
            if (t1.z < 0.1 || t2.z < 0.1) return;
            const s1 = FOV / t1.z, s2 = FOV / t2.z;
            ctx.beginPath();
            ctx.moveTo((t1.x * s1) + cx, (t1.y * s1) + cy);
            ctx.lineTo((t2.x * s2) + cx, (t2.y * s2) + cy);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
