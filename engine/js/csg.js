// Vanilla Engine — constructive solid geometry for unions, and the edges used by outlines and highlights.
// A union is one real solid: its parts are combined into a closed surface, which is what gets drawn, picked and
// outlined. Nothing is made of hidden boxes.
//
// Polygons are plain arrays of points with a plane {n, w}, and the boolean operations work on a BSP tree the same way
// a modeler does: split along each plane, keep the parts that are inside or outside. Trimmed polygons stay convex, so
// a triangle fan draws them correctly.
const CSG_EPS = 1e-5;
// An edge is an outline edge when the two faces meeting there bend by more than this. Rounded surfaces stay smooth.
const CSG_CREASE_COS = 0.9;

// ───────── Polygons and planes ─────────
function csgPlaneOf(points) {
    const a = points[0];
    for (let i = 1; i + 1 < points.length; i++) {
        const b = points[i], c = points[i + 1];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-9) return { n: [nx / len, ny / len, nz / len], w: (nx * a[0] + ny * a[1] + nz * a[2]) / len };
    }
    return null;
}
function csgCleanPoints(points) {
    const out = [];
    for (const p of points) {
        if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) continue;
        const last = out[out.length - 1];
        if (last && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < 1e-7) continue;
        out.push([p[0], p[1], p[2]]);
    }
    while (out.length > 1) {
        const a = out[0], b = out[out.length - 1];
        if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-7) break;
        out.pop();
    }
    return out.length >= 3 ? out : null;
}
function csgPolygon(points) {
    const v = csgCleanPoints(points);
    if (!v) return null;
    const plane = csgPlaneOf(v);
    return plane ? { v, plane } : null;
}
function csgReversePolygon(poly) {
    poly.v.reverse();
    const n = poly.plane.n;
    poly.plane = { n: [-n[0], -n[1], -n[2]], w: -poly.plane.w };
}
// Reverses the points so the polygon faces the way the outward reference does.
function csgOrient(poly, outward) {
    if (!outward) return poly;
    const n = poly.plane.n;
    if (n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0) csgReversePolygon(poly);
    return poly;
}

// Splits one polygon by a plane into the four lists. Coplanar polygons go by which way they face.
const CSG_COPLANAR = 0, CSG_FRONT = 1, CSG_BACK = 2, CSG_SPANNING = 3;
function csgSplitPolygon(plane, poly, coFront, coBack, front, back) {
    let polyType = CSG_COPLANAR;
    const types = new Array(poly.v.length);
    for (let i = 0; i < poly.v.length; i++) {
        const p = poly.v[i];
        const t = plane.n[0] * p[0] + plane.n[1] * p[1] + plane.n[2] * p[2] - plane.w;
        const type = t < -CSG_EPS ? CSG_BACK : (t > CSG_EPS ? CSG_FRONT : CSG_COPLANAR);
        polyType |= type;
        types[i] = type;
    }
    if (polyType === CSG_COPLANAR) {
        (plane.n[0] * poly.plane.n[0] + plane.n[1] * poly.plane.n[1] + plane.n[2] * poly.plane.n[2] > 0 ? coFront : coBack).push(poly);
    } else if (polyType === CSG_FRONT) {
        front.push(poly);
    } else if (polyType === CSG_BACK) {
        back.push(poly);
    } else {
        const f = [], b = [];
        for (let i = 0; i < poly.v.length; i++) {
            const j = (i + 1) % poly.v.length, ti = types[i], tj = types[j];
            const vi = poly.v[i], vj = poly.v[j];
            if (ti !== CSG_BACK) f.push(vi);
            if (ti !== CSG_FRONT) b.push(vi);
            if ((ti | tj) === CSG_SPANNING) {
                const dx = vj[0] - vi[0], dy = vj[1] - vi[1], dz = vj[2] - vi[2];
                const denom = plane.n[0] * dx + plane.n[1] * dy + plane.n[2] * dz;
                const t = denom ? (plane.w - (plane.n[0] * vi[0] + plane.n[1] * vi[1] + plane.n[2] * vi[2])) / denom : 0;
                const cut = [vi[0] + dx * t, vi[1] + dy * t, vi[2] + dz * t];
                f.push(cut); b.push(cut);
            }
        }
        const fp = csgCleanPoints(f), bp = csgCleanPoints(b);
        if (fp) front.push({ v: fp, plane: poly.plane });
        if (bp) back.push({ v: bp, plane: poly.plane });
    }
}

// ───────── BSP tree and boolean operations ─────────
class CSGNode {
    constructor(polygons) {
        this.plane = null;
        this.polygons = [];
        this.front = null;
        this.back = null;
        if (polygons && polygons.length) this.build(polygons);
    }
    invert() {
        for (const p of this.polygons) csgReversePolygon(p);
        if (this.plane) {
            const n = this.plane.n;
            this.plane = { n: [-n[0], -n[1], -n[2]], w: -this.plane.w };
        }
        const f = this.front;
        this.front = this.back; this.back = f;
        if (this.front) this.front.invert();
        if (this.back) this.back.invert();
    }
    clipPolygons(polygons) {
        if (!this.plane) return polygons.slice();
        let front = [], back = [];
        for (const poly of polygons) csgSplitPolygon(this.plane, poly, front, back, front, back);
        if (this.front) front = this.front.clipPolygons(front);
        back = this.back ? this.back.clipPolygons(back) : [];
        return front.concat(back);
    }
    clipTo(bsp) {
        this.polygons = bsp.clipPolygons(this.polygons);
        if (this.front) this.front.clipTo(bsp);
        if (this.back) this.back.clipTo(bsp);
    }
    allPolygons() {
        let out = this.polygons.slice();
        if (this.front) out = out.concat(this.front.allPolygons());
        if (this.back) out = out.concat(this.back.allPolygons());
        return out;
    }
    build(polygons) {
        if (!polygons.length) return;
        if (!this.plane) this.plane = polygons[0].plane;
        const front = [], back = [];
        for (const poly of polygons) csgSplitPolygon(this.plane, poly, this.polygons, this.polygons, front, back);
        if (front.length) {
            if (!this.front) this.front = new CSGNode();
            this.front.build(front);
        }
        if (back.length) {
            if (!this.back) this.back = new CSGNode();
            this.back.build(back);
        }
    }
}
function csgUnionSolid(a, b) {
    a.clipTo(b);
    b.clipTo(a);
    b.invert(); b.clipTo(a); b.invert();
    a.build(b.allPolygons());
    return a;
}
function csgSubtractSolid(a, b) {
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert(); b.clipTo(a); b.invert();
    a.build(b.allPolygons());
    a.invert();
    return a;
}
function csgIntersectSolid(a, b) {
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.allPolygons());
    a.invert();
    return a;
}

// ───────── Shape surfaces ─────────
// Points are built in each shape's own -1..1 space, then scaled and turned into the world. Defining them in the small
// space keeps the face normals exact, and it is the same space the renderer uses for every shape.
function csgShapePoint(o, p) {
    const R = rotMat(o);
    const x = p[0] * o.width, y = p[1] * o.height, z = p[2] * o.length;
    return [o.x + R[0] * x + R[1] * y + R[2] * z,
            o.y + R[3] * x + R[4] * y + R[5] * z,
            o.z + R[6] * x + R[7] * y + R[8] * z];
}
function csgShapeNormal(o, n) {
    const R = rotMat(o);
    let x = n[0] / Math.max(1e-4, o.width), y = n[1] / Math.max(1e-4, o.height), z = n[2] / Math.max(1e-4, o.length);
    const len = Math.hypot(x, y, z) || 1;
    x /= len; y /= len; z /= len;
    return [R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z, R[6] * x + R[7] * y + R[8] * z];
}
function csgShapePoly(o, localPoints, outward) {
    const poly = csgPolygon(localPoints);
    if (!poly) return null;
    csgOrient(poly, outward);
    return csgPolygon(poly.v.map(p => csgShapePoint(o, p)));
}
const CSG_BOX_FACES = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }
];
function csgBoxPolys(o) {
    const out = [];
    for (const f of CSG_BOX_FACES) {
        const n = f.n, u = f.u, v = f.v;
        const points = [
            [n[0] - u[0] - v[0], n[1] - u[1] - v[1], n[2] - u[2] - v[2]],
            [n[0] + u[0] - v[0], n[1] + u[1] - v[1], n[2] + u[2] - v[2]],
            [n[0] + u[0] + v[0], n[1] + u[1] + v[1], n[2] + u[2] + v[2]],
            [n[0] - u[0] + v[0], n[1] - u[1] + v[1], n[2] - u[2] + v[2]]
        ];
        const poly = csgShapePoly(o, points, n);
        if (poly) out.push(poly);
    }
    return out;
}
function csgWedgePolys(o) {
    const faces = [
        { p: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], n: [0, -1, 0] },
        { p: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], n: [0, 0, 1] },
        { p: [[-1, -1, -1], [1, -1, -1], [1, 1, 1], [-1, 1, 1]], n: [0, 1, -1] },
        { p: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1]], n: [-1, 0, 0] },
        { p: [[1, -1, -1], [1, 1, 1], [1, -1, 1]], n: [1, 0, 0] }
    ];
    const out = [];
    for (const f of faces) {
        const poly = csgShapePoly(o, f.p, f.n);
        if (poly) out.push(poly);
    }
    return out;
}
const CSG_CYLINDER_SEGMENTS = 24;
function csgCylinderPolys(o) {
    const n = CSG_CYLINDER_SEGMENTS, TAU = Math.PI * 2, out = [];
    for (let i = 0; i < n; i++) {
        const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2;
        const x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
        const poly = csgShapePoly(o, [[x0, -1, z0], [x0, 1, z0], [x1, 1, z1], [x1, -1, z1]], [Math.cos(am), 0, Math.sin(am)]);
        if (poly) out.push(poly);
    }
    for (const y of [1, -1]) {
        const ring = [];
        for (let i = 0; i < n; i++) { const a = i / n * TAU; ring.push([Math.cos(a), y, Math.sin(a)]); }
        const poly = csgShapePoly(o, ring, [0, y, 0]);
        if (poly) out.push(poly);
    }
    return out;
}
const CSG_BALL_SEGMENTS = 24, CSG_BALL_RINGS = 12;
function csgBallPolys(o) {
    const SEG = CSG_BALL_SEGMENTS, RING = CSG_BALL_RINGS, TAU = Math.PI * 2, out = [];
    const at = (i, j) => {
        const phi = i * Math.PI / RING, theta = j * TAU / SEG;
        return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
    };
    const put = (points) => {
        let ax = 0, ay = 0, az = 0;
        for (const p of points) { ax += p[0]; ay += p[1]; az += p[2]; }
        const len = Math.hypot(ax, ay, az) || 1;
        const poly = csgShapePoly(o, points, [ax / len, ay / len, az / len]);
        if (poly) out.push(poly);
    };
    for (let j = 0; j < SEG; j++) put([[0, 1, 0], at(1, j), at(1, j + 1)]);          // top cap
    for (let i = 1; i < RING - 1; i++) for (let j = 0; j < SEG; j++) {
        put([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
    }
    for (let j = 0; j < SEG; j++) put([[0, -1, 0], at(RING - 1, j + 1), at(RING - 1, j)]);   // bottom cap
    return out;
}
// A union already carries its surface, normalised into its own -1..1 space.
function csgUnionPolys(u) {
    if (!Array.isArray(u.mesh) || !u.mesh.length) ensureUnionMesh(u);
    const out = [];
    for (const poly of u.mesh || []) {
        if (!Array.isArray(poly) || poly.length < 9 || poly.length % 3) continue;
        const points = [];
        for (let i = 0; i < poly.length; i += 3) points.push(csgShapePoint(u, [poly[i], poly[i + 1], poly[i + 2]]));
        const p = csgPolygon(points);
        if (p) out.push(p);
    }
    return out;
}
function csgShapePolys(o) {
    if (!o) return [];
    if (o.type === 'prism6') return csgBoxPolys(o);
    if (o.type === 'wedge') return csgWedgePolys(o);
    if (o.type === 'cylinder') return csgCylinderPolys(o);
    if (o.type === 'ball') return csgBallPolys(o);
    if (o.type === 'union') return csgUnionPolys(o);
    return [];
}

// ───────── Building a union ─────────
const csgRound = (v) => Math.round(v * 10000) / 10000;
// parts: [{ shape, op: 'add' | 'subtract' | 'intersect' }]. Returns the solid's centre, half size, polygons and the
// packed surface, or null when the result is empty.
function csgBuildUnion(parts, mode) {
    let result = null;
    const nodes = [];
    for (const part of parts) {
        const polys = csgShapePolys(part.shape);
        if (!polys.length) continue;
        nodes.push({ node: new CSGNode(polys), op: part.op });
    }
    if (!nodes.length) return null;
    if (mode === 'intersect') {
        result = nodes[0].node;
        for (let i = 1; i < nodes.length; i++) result = csgIntersectSolid(result, nodes[i].node);
    } else {
        // Add every solid first, then cut, so a negated part cuts the whole union no matter the selection order.
        for (const { node, op } of nodes) if (op === 'add') result = result ? csgUnionSolid(result, node) : node;
        for (const { node, op } of nodes) if (op === 'subtract' && result) result = csgSubtractSolid(result, node);
    }
    if (!result) return null;
    const polygons = result.allPolygons().filter(p => p && p.v.length >= 3 && p.plane.n.every(Number.isFinite));
    if (!polygons.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const poly of polygons) for (const p of poly.v) {
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
    }
    const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const half = [Math.max(0.05, (maxX - minX) / 2), Math.max(0.05, (maxY - minY) / 2), Math.max(0.05, (maxZ - minZ) / 2)];
    const mesh = polygons.map(poly => {
        const flat = [];
        for (const p of poly.v) {
            flat.push(csgRound((p[0] - center[0]) / half[0]), csgRound((p[1] - center[1]) / half[1]), csgRound((p[2] - center[2]) / half[2]));
        }
        return flat;
    });
    return { center, half, mesh, polygons };
}
// Older unions stored only the boxes that survived the operation. Their surface is rebuilt from those boxes, once.
function csgBoxForCell(c, rot) {
    return {
        type: 'prism6', x: c.x, y: c.y, z: c.z, width: c.width, height: c.height, length: c.length,
        rotX: rot ? rot[0] : 0, rotY: rot ? rot[1] : 0, rotZ: rot ? rot[2] : 0, color: '#888888'
    };
}
function ensureUnionMesh(u) {
    const valid = Array.isArray(u.mesh) && u.mesh.length && u.mesh.every(p => Array.isArray(p) && p.length >= 9 && p.length % 3 === 0 && p.every(Number.isFinite));
    if (valid) return u.mesh;
    const half = [Math.max(0.05, +u.width || 0.05), Math.max(0.05, +u.height || 0.05), Math.max(0.05, +u.length || 0.05)];
    let polys = [], fromCells = false;
    const cells = Array.isArray(u.cells) ? u.cells.filter(c => c && ['x', 'y', 'z', 'width', 'height', 'length'].every(k => Number.isFinite(c[k]) && (k === 'x' || k === 'y' || k === 'z' || c[k] > 0))) : [];
    if (cells.length) {
        let node = null;
        for (const c of cells) {
            const box = csgBoxPolys(csgBoxForCell(c));
            if (!box.length) continue;
            const part = new CSGNode(box);
            node = node ? csgUnionSolid(node, part) : part;
        }
        polys = node ? node.allPolygons() : [];
        fromCells = polys.length > 0;
    }
    if (!polys.length) {
        const box = csgBoxPolys({ type: 'prism6', x: 0, y: 0, z: 0, width: 1, height: 1, length: 1, rotX: 0, rotY: 0, rotZ: 0 });
        polys = box;
    }
    // Cell-built polygons are in the union's local size; the stored mesh is normalised to -1..1 like every other
    // shape surface. The fallback box is already normalised.
    u.mesh = polys.map(poly => {
        const flat = [];
        for (const p of poly.v) flat.push(
            csgRound(fromCells ? p[0] / half[0] : p[0]),
            csgRound(fromCells ? p[1] / half[1] : p[1]),
            csgRound(fromCells ? p[2] / half[2] : p[2]));
        return flat;
    });
    if (!Array.isArray(u.cellBase) || u.cellBase.length !== 3 || !u.cellBase.every(v => Number.isFinite(v) && v > 0)) u.cellBase = half.slice();
    return u.mesh;
}

// ───────── Surface triangles, edges and shading ─────────
function csgMeshTriangles(polys) {
    const tris = [];
    for (const poly of polys) {
        const n = poly.plane.n, verts = poly.v;
        for (let i = 1; i + 1 < verts.length; i++) {
            const a = verts[0], b = verts[i], c = verts[i + 1];
            const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
            const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
            if (area < 1e-10) continue;
            tris.push({ a, b, c, n });
        }
    }
    return tris;
}
// Every polygon edge, with the normals of the faces that meet there.
function csgEdgeData(polys) {
    const map = new Map();
    const keyOf = (p) => csgRound(p[0]).toFixed(4) + ',' + csgRound(p[1]).toFixed(4) + ',' + csgRound(p[2]).toFixed(4);
    for (const poly of polys) {
        if (!poly || !poly.plane) continue;
        const v = poly.v, n = poly.plane.n;
        for (let i = 0; i < v.length; i++) {
            const a = v[i], b = v[(i + 1) % v.length];
            if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-7) continue;
            const ka = keyOf(a), kb = keyOf(b);
            const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
            let e = map.get(key);
            if (!e) {
                e = { a: ka < kb ? a : b, b: ka < kb ? b : a, normals: [] };
                map.set(key, e);
            }
            if (!e.normals.some(m => m[0] * n[0] + m[1] * n[1] + m[2] * n[2] > 0.9999)) e.normals.push(n);
        }
    }
    const all = [...map.values()], creases = [];
    for (const e of all) {
        // A closed surface has two faces on every edge. An edge with only one is a T-junction: a long edge on one side
        // that was split into several on the other. Those are flat seams, not outlines, so they are left out.
        if (e.normals.length < 2) continue;
        let sharp = false;
        for (let i = 0; i < e.normals.length && !sharp; i++) for (let j = i + 1; j < e.normals.length; j++) {
            const a = e.normals[i], b = e.normals[j];
            if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] < CSG_CREASE_COS) { sharp = true; break; }
        }
        if (sharp) creases.push(e);
    }
    return { all, creases };
}
const unionSurfaceCache = new WeakMap();
function unionMeshData(u) {
    if (!Array.isArray(u.mesh) || !u.mesh.length) ensureUnionMesh(u);
    const cached = unionSurfaceCache.get(u);
    if (cached && cached.meshRef === u.mesh) return cached;
    const polys = [];
    for (const flat of u.mesh || []) {
        if (!Array.isArray(flat) || flat.length < 9 || flat.length % 3) continue;
        const points = [];
        for (let i = 0; i < flat.length; i += 3) points.push([flat[i], flat[i + 1], flat[i + 2]]);
        const p = csgPolygon(points);
        if (p) polys.push(p);
    }
    const data = {
        meshRef: u.mesh,
        polys,
        tris: csgMeshTriangles(polys),
        edges: { all: [], creases: [] }
    };
    data.edges = csgEdgeData(polys);
    unionSurfaceCache.set(u, data);
    return data;
}
// The face index the shader uses for colours and textures, from the direction a triangle faces.
function csgFaceIndex(n) {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    if (ay >= ax && ay >= az) return n[1] >= 0 ? 4 : 5;
    if (ax >= az) return n[0] >= 0 ? 2 : 3;
    return n[2] >= 0 ? 0 : 1;
}
// Interleaved position, normal, edge UV and face for the prism shader. The union draws no shader edges, so the UVs
// are zero; its outline is drawn as lines along the real creases instead of along every triangle.
function unionVertexData(u) {
    const data = unionMeshData(u);
    if (!data.tris.length) return null;
    const out = new Float32Array(data.tris.length * 27);
    let i = 0;
    for (const tri of data.tris) {
        const n = tri.n, face = csgFaceIndex(n);
        for (const p of [tri.a, tri.b, tri.c]) {
            out[i++] = p[0]; out[i++] = p[1]; out[i++] = p[2];
            out[i++] = n[0]; out[i++] = n[1]; out[i++] = n[2];
            out[i++] = 0; out[i++] = 0;
            out[i++] = face;
        }
    }
    return out;
}

// ───────── Outline edges ─────────
// The edges of the shape in its own -1..1 space. They never change, so each shape type is worked out once.
const localOutlineCache = new Map();
function localOutline(type) {
    if (localOutlineCache.has(type)) return localOutlineCache.get(type);
    const unit = { type, x: 0, y: 0, z: 0, width: 1, height: 1, length: 1, rotX: 0, rotY: 0, rotZ: 0 };
    const data = csgEdgeData(csgShapePolys(unit));
    localOutlineCache.set(type, data);
    return data;
}
// A ball has no creases, so its outline is the horizon: the ring where the surface turns away from the camera.
function ballOutlineEdges(o) {
    const R = rotMat(o), cam = [camPosX, camPosY, camPosZ];
    let dx = cam[0] - o.x, dy = cam[1] - o.y, dz = cam[2] - o.z;
    const view = [R[0] * dx + R[3] * dy + R[6] * dz, R[1] * dx + R[4] * dy + R[7] * dz, R[2] * dx + R[5] * dy + R[8] * dz];
    let vl = Math.hypot(view[0], view[1], view[2]);
    if (vl < 1e-6) { view[0] = 0; view[1] = 0; view[2] = 1; vl = 1; }
    const d = [view[0] / vl, view[1] / vl, view[2] / vl];
    const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = d[1] * up[2] - d[2] * up[1], uy = d[2] * up[0] - d[0] * up[2], uz = d[0] * up[1] - d[1] * up[0];
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = d[1] * uz - d[2] * uy, vy = d[2] * ux - d[0] * uz, vz = d[0] * uy - d[1] * ux;
    const pt = (t) => {
        const p = [ux * Math.cos(t) + vx * Math.sin(t), uy * Math.cos(t) + vy * Math.sin(t), uz * Math.cos(t) + vz * Math.sin(t)];
        const nx = p[0] / Math.max(1e-4, o.width), ny = p[1] / Math.max(1e-4, o.height), nz = p[2] / Math.max(1e-4, o.length);
        const nl = Math.hypot(nx, ny, nz) || 1;
        return {
            a: csgShapePoint(o, p),
            n: [R[0] * nx / nl + R[1] * ny / nl + R[2] * nz / nl, R[3] * nx / nl + R[4] * ny / nl + R[5] * nz / nl, R[6] * nx / nl + R[7] * ny / nl + R[8] * nz / nl]
        };
    };
    const out = [], N = 72;
    let prev = pt(0);
    for (let i = 1; i <= N; i++) {
        const cur = pt(i / N * Math.PI * 2);
        out.push({ a: prev.a, b: cur.a, normals: [prev.n] });
        prev = cur;
    }
    return out;
}
// The outline of one shape in world space, with the face normals needed to hide the edges on its far side.
function shapeOutlineEdges(o) {
    if (!o) return [];
    if (o.type === 'ball') return ballOutlineEdges(o);
    if (o.type === 'union') {
        const data = unionMeshData(o), out = [];
        for (const e of data.edges.creases) {
            out.push({
                a: csgShapePoint(o, e.a), b: csgShapePoint(o, e.b),
                normals: e.normals.map(n => csgShapeNormal(o, n))
            });
        }
        return out;
    }
    const data = localOutline(o.type), out = [];
    for (const e of data.creases) {
        out.push({
            a: csgShapePoint(o, e.a), b: csgShapePoint(o, e.b),
            normals: e.normals.map(n => csgShapeNormal(o, n))
        });
    }
    return out;
}
// Only the edges the camera could see with nothing in the way: an edge with a face turned toward the camera is visible,
// while one on the far side of the shape is not.
function visibleOutlineEdges(o) {
    const cam = [camPosX, camPosY, camPosZ], out = [];
    for (const e of shapeOutlineEdges(o)) {
        const mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2, mz = (e.a[2] + e.b[2]) / 2;
        const front = e.normals.some(n => n[0] * (mx - cam[0]) + n[1] * (my - cam[1]) + n[2] * (mz - cam[2]) < 1e-4);
        if (front) out.push(e);
    }
    return out;
}
// The edges of everything under one Highlight, in world space.
function highlightOutlineEdges(h) {
    const out = [];
    for (const [, o] of highlightTargets(h)) out.push(...visibleOutlineEdges(o));
    return out;
}
