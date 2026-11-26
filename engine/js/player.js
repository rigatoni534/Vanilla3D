// Vanilla Engine — player control and the model body. Loaded in order by index.html; all files share one global scope.
        // ───────── Player control ─────────
        // While the simulation runs, the player the editor joined as (the lowest-numbered Player) is driven with WASD, Space and Shift.
        // A model is a set of parts, so the whole model moves as one box that is stopped by every collidable block.
        const pc = { modelId: null, vy: 0, onGround: false, last: 0, zoom: 6, theta: 0, exhausted: false, hideId: null, hideIds: null, headId: null, parts: [], pos: { x: 0, y: 0, z: 0 }, hr: 0.5, hw: 0.5, hd: 0.5, hh: 2, phase: 0, gait: 0, sprinting: false, surfaceMaterial: 'plastic', anim: null, pose: null };
        const PLAYER_ZOOM_MAX = 20, PLAYER_ZOOM_SPEED = 8, FIRST_PERSON_ZOOM = 1.2, PLAYER_TURN_RATE = 14;
        const STAMINA_PENALTY_GAIN = 4;   // per second, while exhausted
        // A person is about 80 kg and falls feet first at roughly 55 Vm/s in Earth air.
        const PLAYER_MASS = 80, PLAYER_CD = 1, PLAYER_AREA = 0.4;
        function controlledModel() {
            let best = null;
            for (const o of Object.values(sceneObjects)) if (o.type === 'player' && (!best || o.order < best.order)) best = o;
            if (!best || !best.currentModel || !sceneObjects[best.currentModel]) return null;
            const ids = [], stack = [best.currentModel];
            while (stack.length) { const cur = stack.pop(); for (const [id] of sceneChildEntries(cur)) { ids.push(id); stack.push(id); } }
            const parts = ids.filter(id => isShape(sceneObjects[id]));
            if (!parts.length) return null;
            const humanId = ids.find(id => sceneObjects[id].type === 'human') || null;
            return { modelId: best.currentModel, parts, humanId, human: humanId ? sceneObjects[humanId] : null, dead: !!best.dead };
        }
        function partsBox(parts) {
            const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
            for (const id of parts) {
                const o = sceneObjects[id], e = shapeHalfExt(o);
                b.minX = Math.min(b.minX, o.x - e[0]); b.maxX = Math.max(b.maxX, o.x + e[0]);
                b.minY = Math.min(b.minY, o.y - e[1]); b.maxY = Math.max(b.maxY, o.y + e[1]);
                b.minZ = Math.min(b.minZ, o.z - e[2]); b.maxZ = Math.max(b.maxZ, o.z + e[2]);
            }
            return b;
        }
        const PC_EPS = 1e-4;
        const PC_STEP = 0.6;    // the highest ledge or slope the player walks up without jumping
        // What the player is stopped by and can stand on. A box is square, a cylinder is round and a wedge is a slope, so
        // walking up a ramp works and the air around a round top is not solid.
        function playerColliders(own) {
            const cols = [];
            for (const [id, o] of physicsBodyList()) {
                if (own.has(id) || o.collidable === false) continue;
                if (o.type === 'union') {      // a union blocks with its cells, so a hole cut through it is a hole
                    const cells = Array.isArray(o.cells) ? o.cells : [];
                    if (cells.length) {
                        const m = rotMat(o);
                        for (const c of cells) {
                            const p = unionCellWorld(o, c);
                            cols.push({ id, k: 0, x: p.x, z: p.z, w: p.width, l: p.length, y0: p.y - p.height, y1: p.y + p.height, mat: materialKey(o),
                                obb: { x: p.x, y: p.y, z: p.z, hx: p.width, hy: p.height, hz: p.length, m } });
                        }
                    } else {
                        const e = shapeHalfExt(o), obb = obbFromShape(o);
                        cols.push({ id, k: 0, x: o.x, z: o.z, w: e[0], l: e[2], y0: o.y - e[1], y1: o.y + e[1], mat: materialKey(o), obb });
                    }
                    continue;
                }
                const turned = !!rotInfo(o);
                if (!turned && o.type === 'cylinder') { cols.push({ id, k: 1, x: o.x, z: o.z, w: o.width, l: o.length, y0: o.y - o.height, y1: o.y + o.height, mat: materialKey(o) }); continue; }
                if (!turned && o.type === 'ball') { cols.push({ id, k: 3, x: o.x, z: o.z, w: o.width, l: o.length, y: o.y, h: o.height, y0: o.y - o.height, y1: o.y + o.height, mat: materialKey(o) }); continue; }
                if (!turned && o.type === 'wedge') { cols.push({ id, k: 2, x: o.x, z: o.z, w: o.width, l: o.length, ym: o.y, h: o.height, y0: o.y - o.height, y1: o.y + o.height, mat: materialKey(o) }); continue; }
                const e = shapeHalfExt(o), obb = obbFromShape(o);     // a turned shape keeps its real angle
                cols.push({ id, k: 0, x: o.x, z: o.z, w: e[0], l: e[2], y0: o.y - e[1], y1: o.y + e[1], mat: materialKey(o), obb });
            }
            return cols;
        }
        // The surface height of one collider at a point, or -Infinity where it is not under that point.
        function colTopAt(c, px, pz) {
            const dx = px - c.x, dz = pz - c.z;
            if (c.k === 1) { const rx = dx / (c.w || 1), rz = dz / (c.l || 1); return rx * rx + rz * rz <= 1 ? c.y1 : -Infinity; }
            if (c.k === 2) { if (Math.abs(dx) > c.w || Math.abs(dz) > c.l) return -Infinity; return c.ym + (c.l ? c.h * dz / c.l : 0); }
            if (c.k === 3) { const rx = dx / (c.w || 1), rz = dz / (c.l || 1), q = rx * rx + rz * rz; return q <= 1 ? c.y + c.h * Math.sqrt(1 - q) : -Infinity; }
            // A box, a union cell and a turned shape all read their real top surface, so a tilted box supports the
            // player at the height it actually is instead of at the top of the axis-aligned box around it.
            if (c.obb) return obbTopAt(c.obb, px, pz);
            return Math.abs(dx) <= c.w && Math.abs(dz) <= c.l ? c.y1 : -Infinity;
        }
        // The highest part of a collider under the player's box. A slope is read under its middle, so a ramp is climbed
        // at walking pace instead of being jumped up to its top corner. A round top is flat, so it is one height.
        function colTopUnder(c, b) {
            if (c.k === 2) return colTopAt(c, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
            if (c.k === 1) return pcOverFoot(b, c) ? c.y1 : -Infinity;
            const mx = (b.minX + b.maxX) / 2, mz = (b.minZ + b.maxZ) / 2;
            return Math.max(colTopAt(c, b.minX, b.minZ), colTopAt(c, b.maxX, b.minZ), colTopAt(c, b.minX, b.maxZ), colTopAt(c, b.maxX, b.maxZ), colTopAt(c, mx, mz));
        }
        // Whether the player's square stands over a collider. A cylinder is round, so the corners of its box are empty
        // air: the nearest point of the player's square to the column's axis is what has to be over the disc.
        const pcOverFoot = (b, c) => {
            if (c.k === 1 || c.k === 3) {
                const nx = Math.max(b.minX, Math.min(b.maxX, c.x)), nz = Math.max(b.minZ, Math.min(b.maxZ, c.z));
                const dx = (nx - c.x) / (c.w || 1), dz = (nz - c.z) / (c.l || 1);
                return dx * dx + dz * dz <= 1;
            }
            return b.maxX > c.x - c.w + PC_EPS && b.minX < c.x + c.w - PC_EPS && b.maxZ > c.z - c.l + PC_EPS && b.minZ < c.z + c.l - PC_EPS;
        };
        // The highest surface the player could stand on with its feet between two heights.
        function pcSupport(b, cols, lo, hi) {
            let best = -Infinity;
            for (const c of cols) {
                if (c.y1 < lo || c.y0 > hi || !pcOverFoot(b, c)) continue;
                const t = colTopUnder(c, b);
                if (t >= lo && t <= hi && t > best) best = t;
            }
            return best;
        }
        // A driven player is not in the rigid-body list, so its contacts are recorded here. The model and its Human
        // inherit these pairs through the same touch registry the physics bodies use.
        function pcRecordTouches(modelId, b, cols) {
            if (typeof recordTouch !== 'function') return;
            for (const c of cols) {
                if (!c.id) continue;
                if (!pcOverFoot(b, c) || c.y0 > b.maxY || c.y1 < b.minY - 0.05) continue;
                recordTouch(modelId, c.id, 0);
            }
        }
        // Move the box along x or z (0 or 2) and stop it at anything too tall to step onto. Returns true when blocked.
        // The surface immediately under the feet supplies the footstep material. A union reports its own material,
        // and a turned block reports the same surface the physics actually supports the player on.
        function pcSurfaceMaterial(b, cols) {
            let best = -Infinity, mat = 'plastic';
            for (const c of cols) {
                if (!pcOverFoot(b, c)) continue;
                const t = colTopUnder(c, b);
                if (t > best && t >= b.minY - 0.18 && t <= b.minY + 0.18) { best = t; mat = c.mat || 'plastic'; }
            }
            return mat;
        }
        function pcMoveAxis(b, cols, axis, d) {
            if (d === 0) return false;
            const lo = axis === 0 ? 'minX' : 'minZ', hi = axis === 0 ? 'maxX' : 'maxZ';
            const size = b[hi] - b[lo];
            // A fast step must not jump over a thin wall before the capsule can feel it. Moving in small slices also
            // keeps a push out of one corner from putting the capsule through the next one.
            const slices = Math.max(1, Math.ceil(Math.abs(d) / 0.08)), inc = d / slices;
            let hit = false;
            for (let s = 0; s < slices; s++) {
                const wasLo = b[lo];
                b[lo] += inc; b[hi] += inc;
                const height = b.maxY - b.minY;
                for (const c of cols) {
                    if (c.y0 >= b.maxY - PC_EPS) continue;                      // above the player's head
                    if (c.k === 3) {
                        if (b.minY >= c.y1 - PC_EPS) continue;                  // standing above it
                        // The ball is an ellipsoid, not the square around it. Use the widest slice of it that the
                        // player's body actually overlaps, then push along the ellipse surface.
                        const sy = Math.max(b.minY, Math.min(b.maxY, c.y));
                        const vy = (sy - c.y) / (c.h || 1), scale = Math.sqrt(Math.max(0, 1 - vy * vy));
                        if (scale < 1e-3) continue;
                        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
                        const disc = columnAgainstFoot({ x: c.x, z: c.z, width: c.w * scale, length: c.l * scale }, { x: cx, z: cz }, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2);
                        if (!disc) continue;
                        b.minX += disc.nx * (disc.pen + PC_EPS); b.maxX += disc.nx * (disc.pen + PC_EPS);
                        b.minZ += disc.nz * (disc.pen + PC_EPS); b.maxZ += disc.nz * (disc.pen + PC_EPS);
                        hit = true;
                        continue;
                    }
                    if (c.k === 0 && c.obb) {
                        if (b.minY >= c.y1 - PC_EPS) continue;                  // standing above it
                        if (c.y1 <= b.minY + PC_STEP + PC_EPS) continue;        // low enough to step onto
                        // The player is a vertical box matching the body, not a capsule as wide as the arms. Push it out
                        // along the true side normal, so a rotated wall or corner stops the body where it looks.
                        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
                        const cy = (b.minY + b.maxY) / 2, ct = Math.cos(pc.theta), sn = Math.sin(pc.theta);
                        const pm = new Float32Array([ct, 0, sn, 0, 1, 0, -sn, 0, ct]);
                        const body = { x: cx, y: cy, z: cz, hx: pc.hw, hy: height / 2, hz: pc.hd, m: pm };
                        const contact = obbManifold(body, c.obb);
                        if (!contact || Math.abs(contact.n[1]) >= 0.72) continue;    // a floor or ceiling is vertical work
                        const nl = Math.hypot(contact.n[0], contact.n[2]);
                        if (nl < 1e-4) continue;
                        const push = contact.depth + PC_EPS;
                        b.minX += contact.n[0] / nl * push; b.maxX += contact.n[0] / nl * push;
                        b.minZ += contact.n[2] / nl * push; b.maxZ += contact.n[2] / nl * push;
                        hit = true;
                        continue;
                    }
                    if (!pcOverFoot(b, c)) continue;
                    if (colTopUnder(c, b) <= b.minY + PC_STEP + PC_EPS) continue;    // low enough to walk up
                    hit = true;
                    if (c.k === 0) {                                             // fallback for a collider without an OBB
                        const face = axis === 0 ? c.x + (inc > 0 ? -c.w : c.w) : c.z + (inc > 0 ? -c.l : c.l);
                        const over = inc > 0 ? b[hi] - face : face - b[lo];
                        const sgn = inc > 0 ? -1 : 1;
                        b[lo] += sgn * over; b[hi] += sgn * over;
                    } else { b[lo] = wasLo; b[hi] = wasLo + size; }              // round or sloped: keep the last good spot
                }
            }
            return hit;
        }
        // Move the box up or down and land on the highest surface it crosses. 1 = landed, 2 = hit a ceiling, 0 = free.
        function pcMoveVertical(b, cols, d) {
            if (d === 0) return 0;
            const height = b.maxY - b.minY, feetWas = b.minY, headWas = b.maxY;
            b.minY += d; b.maxY += d;
            if (d < 0) {
                const t = pcSupport(b, cols, b.minY - PC_EPS, feetWas + PC_EPS);
                if (t === -Infinity) return 0;
                b.minY = t; b.maxY = t + height;
                return 1;
            }
            let ceil = Infinity;
            for (const c of cols) {
                if (!pcOverFoot(b, c) || c.y0 < headWas - PC_EPS || c.y0 > b.maxY + PC_EPS) continue;
                if (c.y0 < ceil) ceil = c.y0;
            }
            if (ceil === Infinity) return 0;
            b.maxY = ceil; b.minY = ceil - height;
            return 2;
        }
        // Limbs are the parts called Arm or Leg, with or without a Left or Right in front. An arm swings opposite its own leg.
        function limbPose(name) {
            const m = /^(left|right)?\s*(arm|leg)$/i.exec(String(name).trim());
            if (!m) return null;
            const side = /^left$/i.test(m[1] || '') ? -1 : 1, arm = /arm/i.test(m[2]);
            return { walk: (arm ? -24 : 30) * side, air: arm ? -45 : 18 * side, role: arm ? 'arm' : 'leg', side };
        }
        function partRole(name) {
            const n = String(name).trim().toLowerCase();
            if (n === 'head') return 'head';
            if (n === 'torso' || n === 'body' || n === 'root') return 'torso';
            const limb = limbPose(n);
            return limb ? limb.role : 'other';
        }
        // Remember the model as it was spawned. Turning it later is done from these offsets, so nothing drifts.
        function setupPlayerBody(m) {
            pc.anim = new PlayerAnimator();
            pc.hideIds = new Set();
            pc.pose = pc.anim.pose;
            const b = partsBox(m.parts);
            pc.pos = { x: (b.minX + b.maxX) / 2, y: b.minY, z: (b.minZ + b.maxZ) / 2 };
            // Keep the body's own width and depth; a square made from the arm span leaves a large empty strip in
            // front of and behind the player that a ball or wall would collide with first.
            pc.hw = Math.max(0.05, (b.maxX - b.minX) / 2);
            pc.hd = Math.max(0.05, (b.maxZ - b.minZ) / 2);
            pc.hr = Math.max(pc.hw, pc.hd);
            pc.hh = b.maxY - b.minY;
            pc.parts = m.parts.map(id => {
                const o = sceneObjects[id], pose = limbPose(o.name);
                return { id, dx: o.x - pc.pos.x, dy: o.y - pc.pos.y, dz: o.z - pc.pos.z, rotY: +o.rotY || 0, h: o.height, swing: pose ? pose.walk : 0, air: pose ? pose.air : 0, angle: 0, role: partRole(o.name), side: pose ? pose.side : 1 };
            });
            let head = null;
            for (const id of m.parts) if (/^head$/i.test(sceneObjects[id].name)) head = id;
            if (!head) for (const id of m.parts) if (!head || sceneObjects[id].y > sceneObjects[head].y) head = id;
            pc.headId = head; pc.theta = 0; pc.vy = 0; pc.onGround = false; pc.exhausted = false; pc.phase = 0; pc.gait = 0;
        }
        // Positions every part from the player's position and facing, and swings the limbs. Facing 0 looks along -Z, like the camera does.
        function placePlayerParts(dt) {
            const c = Math.cos(pc.theta), s = Math.sin(pc.theta);
            const pose = pc.pose || (pc.anim && pc.anim.pose) || { stride: 0, breath: 0, lean: 0, headPitch: 0, squash: 0, airArm: 0, airLeg: 0, state: 'Idle' };
            const stride = pose.stride || 0;
            for (const p of pc.parts) {
                const o = sceneObjects[p.id];
                if (!o) continue;
                // A limb turns about its shoulder or hip, so it pivots around its top rather than its middle. Arms receive
                // the procedural idle breath and the opposite-side swing; the torso and head follow the lean and look.
                const airborne = !pc.onGround;
                const air = p.role === 'arm' ? pose.airArm : pose.airLeg;
                const want = p.swing ? (airborne ? p.air + air : stride * p.swing) : 0;
                p.angle = dt > 0 ? p.angle + (want - p.angle) * (1 - Math.exp(-18 * dt)) : want;
                const a = p.angle * Math.PI / 180, lift = p.h * (1 - Math.cos(a)), dz = p.dz - p.h * Math.sin(a);
                const lean = p.role === 'torso' ? pose.lean * 180 / Math.PI : 0;
                const look = p.role === 'head' ? pose.headPitch * 180 / Math.PI : 0;
                const breath = p.role === 'arm' ? pose.breath * 1.2 : p.role === 'torso' ? pose.breath * 0.4 : 0;
                const squash = (p.role === 'head' || p.role === 'torso' || p.role === 'arm') ? pose.squash * 0.12 : 0;
                o.x = pc.pos.x + p.dx * c - dz * s;
                o.z = pc.pos.z + p.dx * s + dz * c;
                o.y = pc.pos.y + p.dy + lift - squash + breath * 0.02;
                o.rotX = p.angle + lean + look;
                o.rotY = p.rotY - pc.theta * 180 / Math.PI;
                const v = physicsVelocity.get(p.id); if (v) { v.x = 0; v.y = 0; v.z = 0; }
            }
        }
        // Moves the controlled player, then puts the camera on its head. Returns true when the camera is being driven.
        function stepPlayerControl(dt) {
            const m = controlledModel();
            if (!m) { pc.modelId = null; pc.hideId = null; playerPartIds = null; return false; }
            if (pc.modelId !== m.modelId) { pc.modelId = m.modelId; setupPlayerBody(m); angleX = -0.25; }
            // A dead player lets go of the model, so its parts fall apart again; otherwise the parts on the ground are
            // exactly the ones being driven. The set is rebuilt whenever the parts change, so a reused model never
            // leaves stale ids behind.
            if (m.dead) playerPartIds = null;
            else if (!playerPartIds || playerPartIds.size !== m.parts.length || m.parts.some(id => !playerPartIds.has(id))) playerPartIds = new Set(m.parts);
            if (!m.dead && dt > 0) {
                const startX = pc.pos.x, startZ = pc.pos.z, wasGround = pc.onGround;
                const hv = m.human || {};
                const num = (v, d) => Number.isFinite(v) ? v : d;
                const walk = num(hv.walkSpeed, 3.5), run = num(hv.runSpeed, 6), jumpH = num(hv.jumpHeight, 1.5);
                const maxSt = num(hv.maxStamina, 100), runLoss = num(hv.runStaminaLoss, 3), jumpLoss = num(hv.jumpStaminaLoss, 20), gain = num(hv.staminaGain, 6.5);
                let st = Math.min(maxSt, num(hv.stamina, maxSt));
                const g = currentGravity(), rho = airDensityFor(g);
                // The model turns to face its movement, so its world-axis footprint is the box around the turned body,
                // not a square made from the arm span. This keeps the empty strip in front of a turned player small.
                const cAbs = Math.abs(Math.cos(pc.theta)), sAbs = Math.abs(Math.sin(pc.theta));
                const ex = cAbs * pc.hw + sAbs * pc.hd, ez = sAbs * pc.hw + cAbs * pc.hd;
                const b = { minX: pc.pos.x - ex, maxX: pc.pos.x + ex, minY: pc.pos.y, maxY: pc.pos.y + pc.hh, minZ: pc.pos.z - ez, maxZ: pc.pos.z + ez };
                const cols = playerColliders(new Set(m.parts));
                // Walking is relative to where the camera looks.
                const f = (keyState['w'] ? 1 : 0) - (keyState['s'] ? 1 : 0), r = (keyState['d'] ? 1 : 0) - (keyState['a'] ? 1 : 0);
                let mx = Math.sin(angleY) * f + rgtX * r, mz = -Math.cos(angleY) * f + rgtZ * r;
                const len = Math.hypot(mx, mz);
                if (len > 0) { mx /= len; mz /= len; } else { mx = 0; mz = 0; }
                // The model swings round to face the way it is going.
                let turnDelta = 0;
                if (len > 0) {
                    const d = Math.atan2(Math.sin(Math.atan2(mx, -mz) - pc.theta), Math.cos(Math.atan2(mx, -mz) - pc.theta));
                    turnDelta = d;
                    pc.theta += d * (1 - Math.exp(-PLAYER_TURN_RATE * dt));
                }
                // Sprinting needs stamina and costs RunStaminaLoss every second.
                const sprinting = len > 0 && keyState['shift'] && !pc.exhausted && st > 0;
                pc.sprinting = sprinting;
                const speed = sprinting ? run : walk;
                if (sprinting) st -= runLoss * dt;
                let jumped = false;
                // Small steps, like the physics: a fast fall must not skip through a thin block.
                const steps = Math.max(1, Math.ceil(dt / PHYSICS_MAX_STEP)), hs = dt / steps;
                const kDrag = rho * PLAYER_CD * PLAYER_AREA / (2 * PLAYER_MASS);
                for (let s = 0; s < steps; s++) {
                    if (keyState[' '] && pc.onGround && g < 0 && !pc.exhausted && st > 0) {
                        pc.vy = Math.sqrt(2 * -g * Math.max(0, jumpH)); pc.onGround = false; jumped = true;
                        st = Math.max(0, st - jumpLoss);
                    }
                    pc.vy += g * hs;
                    pc.vy /= 1 + kDrag * Math.abs(pc.vy) * hs;   // air drag: falling speeds up, then levels off at terminal velocity
                    pcMoveAxis(b, cols, 0, mx * speed * hs);
                    pcMoveAxis(b, cols, 2, mz * speed * hs);
                    // A low ledge or a ramp lifts the feet instead of stopping the player at a wall.
                    if (pc.onGround) {
                        const up = pcSupport(b, cols, b.minY + PC_EPS, b.minY + PC_STEP);
                        if (up > -Infinity) { b.maxY += up - b.minY; b.minY = up; }
                    }
                    const hit = pcMoveVertical(b, cols, pc.vy * hs);
                    pc.onGround = hit === 1;
                    if (pc.onGround) pc.surfaceMaterial = pcSurfaceMaterial(b, cols);
                    if (hit) pc.vy = 0;
                }
                pc.pos = { x: (b.minX + b.maxX) / 2, y: b.minY, z: (b.minZ + b.maxZ) / 2 };
                pcRecordTouches(m.modelId, b, cols);
                // Distance, not time, drives the stride: a player stopped by a wall stops stepping, and a player on ice
                // or a slope still moves its feet only as far as the body actually travels.
                const moved = Math.hypot(pc.pos.x - startX, pc.pos.z - startZ);
                if (pc.anim) pc.pose = pc.anim.step(dt, {
                    moving: len > 0, sprinting, onGround: pc.onGround, vy: pc.vy, dead: false,
                    distance: moved, landed: !wasGround && pc.onGround, look: angleX, turn: turnDelta
                });
                // Stamina comes back while standing on something and not sprinting. Once emptied it comes back slower, until it is full.
                if (!sprinting && pc.onGround && !jumped) st += (pc.exhausted ? Math.min(STAMINA_PENALTY_GAIN, gain) : gain) * dt;
                if (st <= 0) { st = 0; pc.exhausted = true; }
                st = Math.min(maxSt, st);
                if (pc.exhausted && st >= maxSt) pc.exhausted = false;
                if (m.human) {
                    m.human.stamina = st;
                    if (selectedObjectId === m.humanId) { const el = document.getElementById('prop-h-stamina'); if (el && document.activeElement !== el) el.value = Math.round(st * 100) / 100; }
                }
                // The animation controller supplies the stride phase, air pose, lean, look and landing squash.
                placePlayerParts(dt);
                // Falling past the kill layer kills the player, like it deletes anything else.
                if (pc.pos.y < currentKillY() && m.human) m.human.health = 0;
            }
            // Up and Down zoom. All the way in is first person, and then the head is hidden.
            if (dt > 0) {
                if (keyState['arrowup']) pc.zoom -= PLAYER_ZOOM_SPEED * dt;
                if (keyState['arrowdown']) pc.zoom += PLAYER_ZOOM_SPEED * dt;
                pc.zoom = Math.max(0, Math.min(PLAYER_ZOOM_MAX, pc.zoom));
            }
            const head = sceneObjects[pc.headId];
            if (!head) { pc.hideId = null; if (pc.hideIds) pc.hideIds.clear(); return false; }
            const firstPerson = pc.zoom < FIRST_PERSON_ZOOM;
            pc.hideId = firstPerson ? pc.headId : null;
            if (pc.hideIds) {
                pc.hideIds.clear();
                // In first person the near arms would sit across the camera, so hide them with the head. The rest of the
                // model still renders when the camera is close enough to see it from outside.
                if (firstPerson) for (const p of pc.parts) if (p.role === 'arm') pc.hideIds.add(p.id);
            }
            const bob = firstPerson && pc.pose ? Math.abs(pc.pose.stride) * 0.045 + pc.pose.breath * 0.008 : 0;
            camPosX = head.x - fwdX * pc.zoom; camPosY = head.y - fwdY * pc.zoom + bob; camPosZ = head.z - fwdZ * pc.zoom;
            if (typeof audioPlayerStep === 'function') audioPlayerStep(dt);
            return true;
        }
