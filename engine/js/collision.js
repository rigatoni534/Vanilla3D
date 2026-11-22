// Vanilla Engine — oriented collision geometry. Loaded before scene.js; all files share one global scope.
//
// A collider is { x, y, z, hx, hy, hz, m }: its centre, its half sizes, and a row-major local->world matrix.
// The same functions serve rigid bodies and the player controller, so a rotated block is solid at its real angle
// everywhere instead of being treated as the axis-aligned box around it.
const COLLISION_IDENT = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

function obbFromShape(o) {
    const info = rotInfo(o);
    return { x: o.x, y: o.y, z: o.z, hx: o.width, hy: o.height, hz: o.length, m: info ? info.m : COLLISION_IDENT, o };
}
// The three world-space axes of an OBB. rotMat stores a row-major local->world matrix, so the images of the local
// axes are its columns.
function obbAxes(m) {
    return [
        [m[0], m[3], m[6]],
        [m[1], m[4], m[7]],
        [m[2], m[5], m[8]]
    ];
}
function obbRadiusOn(axis, axes, h) {
    return Math.abs(axis[0] * axes[0][0] + axis[1] * axes[0][1] + axis[2] * axes[0][2]) * h[0] +
           Math.abs(axis[0] * axes[1][0] + axis[1] * axes[1][1] + axis[2] * axes[1][2]) * h[1] +
           Math.abs(axis[0] * axes[2][0] + axis[1] * axes[2][1] + axis[2] * axes[2][2]) * h[2];
}
// Separating-axis test. Returns the shallowest axis that still separates nothing, with the normal pointing from B
// toward A, or null when the boxes are apart. Face axes are preferred slightly over edge axes, which keeps a box
// resting on another from picking a diagonal contact and creeping.
function obbManifold(A, B) {
    const aa = obbAxes(A.m), ba = obbAxes(B.m);
    const ah = [A.hx, A.hy, A.hz], bh = [B.hx, B.hy, B.hz];
    const dx = A.x - B.x, dy = A.y - B.y, dz = A.z - B.z;
    let best = Infinity, bestDepth = 0, nx = 0, ny = 0, nz = 0;
    const test = (x, y, z, edge) => {
        const len = Math.hypot(x, y, z);
        if (len < 1e-7) return true;
        x /= len; y /= len; z /= len;
        const ra = obbRadiusOn([x, y, z], aa, ah);
        const rb = obbRadiusOn([x, y, z], ba, bh);
        const dist = Math.abs(x * dx + y * dy + z * dz);
        const overlap = ra + rb - dist;
        if (overlap <= 1e-7) return false;
        const score = edge ? overlap * 1.1 : overlap;
        if (score < best) { best = score; bestDepth = overlap; nx = x; ny = y; nz = z; }
        return true;
    };
    for (const axis of aa) if (!test(axis[0], axis[1], axis[2], false)) return null;
    for (const axis of ba) if (!test(axis[0], axis[1], axis[2], false)) return null;
    for (const a of aa) for (const b of ba) {
        const x = a[1] * b[2] - a[2] * b[1];
        const y = a[2] * b[0] - a[0] * b[2];
        const z = a[0] * b[1] - a[1] * b[0];
        if (!test(x, y, z, true)) return null;
    }
    if (!isFinite(best)) return null;
    if (nx * dx + ny * dy + nz * dz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return { n: [nx, ny, nz], depth: bestDepth };
}
// The pieces a body collides with. A union is a compound of its saved collision cells, so a hole through it is a hole
// for physics too and a moving union rests on the cells that actually exist.
function shapeColliderParts(o) {
    if (o.type === 'union' && Array.isArray(o.cells) && o.cells.length) {
        const m = rotMat(o);
        return o.cells.map(c => {
            const p = unionCellWorld(o, c);
            return { x: p.x, y: p.y, z: p.z, hx: p.width, hy: p.height, hz: p.length, m };
        });
    }
    return [obbFromShape(o)];
}
// Closest point on an OBB to a world point, in the box's own space. Used by the capsule test.
function obbClosestLocal(px, py, pz, obb) {
    const m = obb.m;
    const dx = px - obb.x, dy = py - obb.y, dz = pz - obb.z;
    const lx = m[0] * dx + m[3] * dy + m[6] * dz;
    const ly = m[1] * dx + m[4] * dy + m[7] * dz;
    const lz = m[2] * dx + m[5] * dy + m[8] * dz;
    const qx = Math.max(-obb.hx, Math.min(obb.hx, lx));
    const qy = Math.max(-obb.hy, Math.min(obb.hy, ly));
    const qz = Math.max(-obb.hz, Math.min(obb.hz, lz));
    return { lx, ly, lz, qx, qy, qz, dx: lx - qx, dy: ly - qy, dz: lz - qz, m };
}
// A ball against an OBB. Returns the normal from the box toward the ball and the overlap depth.
function ballOBB(px, py, pz, r, obb) {
    const p = obbClosestLocal(px, py, pz, obb);
    const dist = Math.hypot(p.dx, p.dy, p.dz);
    let nlx, nly, nlz, pen;
    if (dist > 1e-6) {
        nlx = p.dx / dist; nly = p.dy / dist; nlz = p.dz / dist; pen = r - dist;
    } else {
        const px1 = obb.hx - Math.abs(p.lx), py1 = obb.hy - Math.abs(p.ly), pz1 = obb.hz - Math.abs(p.lz);
        if (py1 <= px1 && py1 <= pz1) { nlx = 0; nly = p.ly >= 0 ? 1 : -1; nlz = 0; pen = py1 + r; }
        else if (px1 <= pz1) { nlx = p.lx >= 0 ? 1 : -1; nly = 0; nlz = 0; pen = px1 + r; }
        else { nlx = 0; nly = 0; nlz = p.lz >= 0 ? 1 : -1; pen = pz1 + r; }
    }
    if (pen <= 0) return null;
    const m = obb.m;
    return { pen, n: [m[0] * nlx + m[1] * nly + m[2] * nlz, m[3] * nlx + m[4] * nly + m[5] * nlz, m[6] * nlx + m[7] * nly + m[8] * nlz] };
}
// The deepest contact between a vertical capsule and an OBB. feet is the bottom of the capsule, radius the distance
// from its axis to its surface, height the whole capsule. The capsule is sampled along its axis (seven stations), so
// its rounded ends touch a floor, a wall or a step at the true place rather than at a square footprint.
function capsuleOBB(px, feet, pz, radius, height, obb) {
    const lo = feet + radius, hi = feet + height - radius;
    const span = Math.max(0, hi - lo);
    let best = null;
    for (let i = 0; i < 7; i++) {
        const y = lo + span * i / 6;
        const p = obbClosestLocal(px, y, pz, obb);
        let dist = Math.hypot(p.dx, p.dy, p.dz);
        let nlx, nly, nlz, pen;
        if (dist > 1e-6) {
            nlx = p.dx / dist; nly = p.dy / dist; nlz = p.dz / dist;
            pen = radius - dist;
        } else {
            // The axis point is inside the box: leave through the nearest face.
            const px1 = obb.hx - Math.abs(p.lx), py1 = obb.hy - Math.abs(p.ly), pz1 = obb.hz - Math.abs(p.lz);
            if (py1 <= px1 && py1 <= pz1) { nlx = 0; nly = p.ly >= 0 ? 1 : -1; nlz = 0; pen = py1 + radius; }
            else if (px1 <= pz1) { nlx = p.lx >= 0 ? 1 : -1; nly = 0; nlz = 0; pen = px1 + radius; }
            else { nlx = 0; nly = 0; nlz = p.lz >= 0 ? 1 : -1; pen = pz1 + radius; }
        }
        if (pen <= 0) continue;
        const m = obb.m;
        const n = [
            m[0] * nlx + m[1] * nly + m[2] * nlz,
            m[3] * nlx + m[4] * nly + m[5] * nlz,
            m[6] * nlx + m[7] * nly + m[8] * nlz
        ];
        if (!best || pen > best.depth) best = { n, depth: pen, y };
    }
    return best;
}
// The top of an OBB under a world x/z: the highest place a vertical line meets one of its six faces. A box turned on
// its side is supported by the face that is now on top, not only by its original +Y face. Returns -Infinity when the
// line misses the box.
function obbTopAt(obb, px, pz) {
    const m = obb.m;
    const dx = px - obb.x, dz = pz - obb.z;
    const h = [obb.hx, obb.hy, obb.hz];
    // local = R^T * (p - centre), so every local coordinate is a linear function of world y.
    const l0 = [m[0] * dx + m[6] * dz, m[1] * dx + m[7] * dz, m[2] * dx + m[8] * dz];
    const slope = [m[3], m[4], m[5]];
    let top = -Infinity;
    for (let axis = 0; axis < 3; axis++) {
        const k = slope[axis];
        if (Math.abs(k) < 1e-8) continue;        // that face is vertical, so the line cannot cross it once
        for (const bound of [-h[axis], h[axis]]) {
            const dy = (bound - l0[axis]) / k;
            let inside = true;
            for (let other = 0; other < 3; other++) {
                if (other === axis) continue;
                const l = l0[other] + slope[other] * dy;
                if (Math.abs(l) > h[other] + 1e-6) { inside = false; break; }
            }
            if (!inside) continue;
            const y = obb.y + dy;
            if (y > top) top = y;
        }
    }
    return top;
}
