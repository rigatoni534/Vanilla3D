// Vanilla Engine — WebGL renderer, lighting, shadows and generated meshes. Loaded in order by index.html.
        // ───────── WebGL renderer ─────────
        // Prisms are drawn with a hardware depth buffer, so overlapping and intersecting boxes look like real solids.
        // (If WebGL 2 is unavailable the old 2D painter's-algorithm renderer is used instead.)
        let GL = null;
        let glDrawCalls = 0;   // WebGL draw calls in the current frame, for the status bar
        const NEAR = 0.1, FAR = 2000;
        const GLSL_HEAD = `#version 300 es
precision highp float;
uniform vec3 uCam, uR, uU, uF;
uniform vec2 uView;
uniform float uFov;
vec4 project(vec3 p) {
    vec3 rel = p - uCam;
    float z = dot(rel, uF);
    return vec4(dot(rel, uR) * 2.0 * uFov / uView.x, dot(rel, uU) * 2.0 * uFov / uView.y,
                ${((FAR + NEAR) / (FAR - NEAR)).toFixed(6)} * z - ${(2 * FAR * NEAR / (FAR - NEAR)).toFixed(6)}, z);
}
`;
        const PRISM_VS = `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
layout(location = 3) in float aFace;
uniform vec3 uCenter, uHalf;
uniform mat3 uRot;
out vec2 vUV;
out vec3 vW;
flat out vec3 vN;
flat out float vFace;
void main() {
    vec3 w = uCenter + uRot * (aPos * uHalf);
    vec3 n = uRot * aNormal;
    vUV = aUV; vFace = aFace; vW = w; vN = n;
    if (dot(n, w - uCam) >= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // back face
    gl_Position = project(w);
}`;
        const PRISM_FS = `
in vec2 vUV;
in vec3 vW;
flat in vec3 vN;
flat in float vFace;
uniform mat3 uRot;
uniform vec3 uColors[6];          // classic shaded colors (also used by wireframes)
uniform vec3 uAlbedo[6];          // unlit surface colors for enhanced lighting
uniform int uFaceTex[6];
uniform vec3 uEdgeColor;
uniform float uEdgeAlpha, uEdgeW;
uniform int uWire;
uniform int uMode;                // 0 classic, 1 enhanced
uniform vec3 uSunDir, uSunCol, uSkyCol, uGndCol, uHazeCol;
uniform float uHaze, uFogFar, uShStr, uSpec;
uniform int uShadowOn;
uniform highp sampler2DShadow uSh0;
uniform highp sampler2DShadow uSh1;
uniform mat4 uLVP0, uLVP1;
uniform vec4 uShInfo;             // texel size and depth range of both cascades
uniform vec2 uShSize;
out vec4 o;
const vec3 FN[6] = vec3[6](vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0), vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0));
const vec2 PD[12] = vec2[12](vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621), vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893), vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSRGB(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
// Grid texture: lines at every 0.25, 0.5 and 1 Vm, locked to world coordinates.
// Each axis fades on its own, so lines that run away from you stay visible far into the distance. When cells get
// denser than pixels they settle to their average shade instead of vanishing, and wider markings (every 4, 16
// and 64 Vm) appear as the finer ones shrink, so the grid never disappears.
float gridDens(vec2 p, float s) { vec2 d = fwidth(p / s); return max(d.x, d.y); }
float gridLvl(vec2 p, float s, float lw) {
    vec2 q = p / s;
    vec2 d = max(fwidth(q), vec2(1e-6));
    vec2 a = abs(fract(q - 0.5) - 0.5) / d;
    vec2 l = 1.0 - smoothstep(vec2(lw * 0.5 - 0.5), vec2(lw * 0.5 + 0.5), a);
    vec2 mean = min(vec2(0.3), lw * d);
    vec2 c = mix(l, mean, smoothstep(vec2(0.35), vec2(0.9), d));
    return 1.0 - (1.0 - c.x) * (1.0 - c.y);
}
vec3 gridTex(vec3 base, vec3 w, int face) {
    vec2 p = face < 2 ? vec2(dot(w, uRot[0]), dot(w, uRot[1])) : (face < 4 ? vec2(dot(w, uRot[2]), dot(w, uRot[1])) : vec2(dot(w, uRot[0]), dot(w, uRot[2])));
    float a = max(max(gridLvl(p, 0.25, 1.0) * 0.16, gridLvl(p, 0.5, 1.2) * 0.26), gridLvl(p, 1.0, 1.7) * 0.42);
    a = max(a, gridLvl(p, 4.0, 2.0) * 0.5 * smoothstep(0.06, 0.25, gridDens(p, 1.0)));
    a = max(a, gridLvl(p, 16.0, 2.4) * 0.55 * smoothstep(0.06, 0.25, gridDens(p, 4.0)));
    a = max(a, gridLvl(p, 64.0, 2.8) * 0.6 * smoothstep(0.06, 0.25, gridDens(p, 16.0)));
    vec3 lc = dot(base, vec3(0.299, 0.587, 0.114)) > 0.3 ? vec3(0.0) : vec3(1.0);
    return mix(base, lc, a);
}
// Soft shadows: rotated 12-tap filtering on a hardware-compared depth map. w is how much this cascade covers the pixel.
float cascadeShadow(highp sampler2DShadow sm, mat4 vp, vec3 wp, vec3 N, float texel, float far, float size, float ang, out float w) {
    vec4 lp = vp * vec4(wp + N * texel * 2.0, 1.0);
    vec3 q = lp.xyz * 0.5 + 0.5;
    vec2 e = min(q.xy, 1.0 - q.xy);
    w = (q.z > 0.0 && q.z < 1.0) ? smoothstep(0.0, 0.12, min(e.x, e.y)) : 0.0;
    if (w <= 0.0) return 1.0;
    float bias = texel * 1.5 / far;
    float c = cos(ang), s = sin(ang);
    mat2 rm = mat2(c, s, -s, c);
    float rad = 2.2 / size;
    float sum = 0.0;
    for (int i = 0; i < 12; i++) sum += texture(sm, vec3(q.xy + rm * PD[i] * rad, q.z - bias));
    return sum / 12.0;
}
float sunShadow(vec3 wp, vec3 N) {
    float ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float w0, w1 = 0.0, s1 = 1.0;
    float s0 = cascadeShadow(uSh0, uLVP0, wp, N, uShInfo.x, uShInfo.y, uShSize.x, ang, w0);
    if (w0 < 1.0) s1 = cascadeShadow(uSh1, uLVP1, wp, N, uShInfo.z, uShInfo.w, uShSize.y, ang, w1);
    return mix(mix(1.0, s1, w1), s0, w0);
}
// Distance fade: the haze thickens with distance, and a render distance fades a shape into the sky completely by its
// edge, so the distance it stops being drawn at is never visible as a hard line.
float viewFog(vec3 wp) {
    float d = length(uCam - wp);
    float f = uHaze > 0.0 ? min(0.9, 1.0 - exp(-pow(d * uHaze, 2.0))) : 0.0;
    return uFogFar > 0.0 ? max(f, smoothstep(uFogFar * 0.5, uFogFar, d)) : f;
}
void main() {
    vec2 d = (1.0 - abs(vUV)) / max(fwidth(vUV), vec2(1e-6));
    float line = 1.0 - smoothstep(uEdgeW - 0.75, uEdgeW + 0.75, min(d.x, d.y));
    int fi = int(vFace + 0.5);
    vec3 base = uColors[fi];
    if (uWire != 0) {
        if (line < 0.02) discard;
        vec3 c = mix(uWire == 2 ? base : uEdgeColor, uHazeCol, viewFog(vW));
        o = vec4(c * line, line);
        return;
    }
    vec3 lit;
    if (uMode == 0) {
        if (uFaceTex[fi] == 1) base = gridTex(base, vW, fi);
        lit = base;
    } else {
        vec3 alb = uAlbedo[fi];
        if (uFaceTex[fi] == 1) alb = gridTex(alb, vW, fi);
        alb = toLin(alb);
        vec3 N = normalize(vN);
        vec3 V = normalize(uCam - vW);
        float ndl = dot(N, uSunDir);
        float sh = 1.0;
        if (uShadowOn != 0 && ndl > 0.0) sh = mix(1.0, sunShadow(vW, N), uShStr);
        float diff = max(ndl, 0.0) * sh;
        vec3 col = alb * (mix(uGndCol, uSkyCol, N.y * 0.5 + 0.5) + uSunCol * diff);
        vec3 H = normalize(uSunDir + V);
        col += uSunCol * pow(max(dot(N, H), 0.0), 64.0) * step(0.0, ndl) * sh * uSpec;
        col += uSkyCol * pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.1;
        lit = toSRGB(col);
    }
    lit = mix(lit, uHazeCol, viewFog(vW));
    o = vec4(mix(lit, uEdgeColor, line * uEdgeAlpha), 1.0);
}`;
        const BALL_VS = `
layout(location = 0) in vec3 aPos;
uniform vec3 uCenter, uHalf;
uniform mat3 uRot, uPatT;
out vec3 vW;
out vec3 vLoc;
out vec3 vN;
void main() {
    vec3 w = uCenter + uRot * (aPos * uHalf);
    vW = w; vLoc = uPatT * aPos; vN = normalize(uRot * (aPos / uHalf));
    gl_Position = project(w);
}`;
        // The ball shares the prism's lighting code, so sun, sky, haze and shadows match.
        const FS_LIGHT_UNIFORMS = PRISM_FS.slice(PRISM_FS.indexOf('uniform int uMode;'), PRISM_FS.indexOf('out vec4 o;'));
        const FS_LIGHT_FUNCS = PRISM_FS.slice(PRISM_FS.indexOf('const vec2 PD[12]'), PRISM_FS.indexOf('// Grid texture')) + PRISM_FS.slice(PRISM_FS.indexOf('// Soft shadows'), PRISM_FS.indexOf('void main()'));
        const BALL_FS = `
in vec3 vW;
in vec3 vLoc;
in vec3 vN;
uniform vec3 uBase;
uniform vec3 uFaceCols[6];
uniform int uFaceCol, uWire;
uniform vec3 uEdgeColor;
uniform float uSel;
uniform vec2 uClassic;
${FS_LIGHT_UNIFORMS}
out vec4 o;
${FS_LIGHT_FUNCS}
int domFace(vec3 p) {
    vec3 a = abs(p);
    if (a.z >= a.x && a.z >= a.y) return p.z >= 0.0 ? 0 : 1;
    if (a.x >= a.y) return p.x >= 0.0 ? 2 : 3;
    return p.y >= 0.0 ? 4 : 5;
}
void main() {
    vec3 N = normalize(vN), L = normalize(vLoc), V = normalize(uCam - vW);
    int fi = domFace(L);
    if (uWire != 0) { o = vec4(mix(uWire == 2 ? uFaceCols[fi] : uEdgeColor, uHazeCol, viewFog(vW)), 1.0); return; }
    vec3 alb = uBase;
    if (uFaceCol != 0) alb = uFaceCols[fi];
    vec3 lit;
    float ndl = dot(N, uSunDir);
    if (uMode == 0) {
        float b = uClassic.x + (1.0 - uClassic.x) * max(ndl, 0.0) * uClassic.y;
        lit = alb * (0.2 + 0.8 * b);
    } else {
        float sh = 1.0;
        if (uShadowOn != 0 && ndl > 0.0) sh = mix(1.0, sunShadow(vW, N), uShStr);
        vec3 col = toLin(alb) * (mix(uGndCol, uSkyCol, N.y * 0.5 + 0.5) + uSunCol * max(ndl, 0.0) * sh);
        vec3 H = normalize(uSunDir + V);
        col += uSunCol * pow(max(dot(N, H), 0.0), 72.0) * step(0.0, ndl) * sh * uSpec * 1.6;
        col += uSkyCol * pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.1;
        lit = toSRGB(col);
    }
    lit = mix(lit, uHazeCol, viewFog(vW));
    float rim = 1.0 - max(dot(N, V), 0.0);
    lit = mix(lit, uEdgeColor, uSel * smoothstep(0.8, 0.94, rim));
    o = vec4(lit, 1.0);
}`;
        // Wedges and cylinders reuse the prism's lighting, edges and shadows, but read their own triangles instead of a box.
        const MESH_VS = `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
layout(location = 3) in float aFace;
uniform vec3 uCenter, uHalf;
uniform mat3 uRot;
out vec2 vUV;
out vec3 vW;
flat out vec3 vN;
flat out float vFace;
void main() {
    vec3 w = uCenter + uRot * (aPos * uHalf);
    vec3 n = uRot * normalize(aNormal / max(uHalf, vec3(1e-4)));   // Size scales the shape, so the normal undoes it
    vUV = aUV; vFace = aFace; vW = w; vN = n;
    if (dot(n, w - uCam) >= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // back face
    gl_Position = project(w);
}`;
        const SHADOW_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform vec3 uCenter, uHalf;
uniform mat3 uRot;
uniform mat4 uLVP;
void main() { gl_Position = uLVP * vec4(uCenter + uRot * (aPos * uHalf), 1.0); }`;
        const SHADOW_FS = `#version 300 es
precision highp float;
void main() {}`;
        const AXIS_VS = `
layout(location = 0) in vec3 aP0;
layout(location = 1) in vec3 aP1;
layout(location = 2) in vec2 aSE;
layout(location = 3) in vec4 aCol;
layout(location = 4) in float aW;
out vec4 vCol;
void main() {
    vec4 c0 = project(aP0), c1 = project(aP1);
    vec2 s0 = c0.xy / c0.w * uView * 0.5, s1 = c1.xy / c1.w * uView * 0.5;
    vec2 dir = s1 - s0;
    dir = length(dir) > 1e-4 ? normalize(dir) : vec2(1.0, 0.0);
    vec4 c = aSE.y > 0.5 ? c1 : c0;
    c.xy += (vec2(-dir.y, dir.x) * aSE.x * aW / (uView * 0.5)) * c.w;
    gl_Position = c;
    vCol = aCol;
}`;
        const AXIS_FS = `
in vec4 vCol;
out vec4 o;
void main() { o = vec4(vCol.rgb * vCol.a, vCol.a); }`;
        const LABEL_VS = `
layout(location = 0) in vec2 aQ;
uniform vec3 uLC, uLR, uLU;
uniform vec2 uCell;
out vec2 vT;
void main() {
    gl_Position = project(uLC + uLR * aQ.x + uLU * aQ.y);
    vT = vec2(aQ.x * 0.5 + 0.5, mix(uCell.y, uCell.x, aQ.y * 0.5 + 0.5));
}`;
        const LABEL_FS = `
in vec2 vT;
uniform sampler2D uTex;
out vec4 o;
void main() { o = texture(uTex, vT); }`;

        function glProgram(gl, vs, fs, names, raw) {
            const mk = (type, src) => {
                const sh = gl.createShader(type);
                gl.shaderSource(sh, src); gl.compileShader(sh);
                if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
                return sh;
            };
            const prog = gl.createProgram();
            gl.attachShader(prog, mk(gl.VERTEX_SHADER, raw ? vs : GLSL_HEAD + vs));
            gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, raw ? fs : GLSL_HEAD + fs));
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
            const u = {};
            for (const n of ['uCam', 'uR', 'uU', 'uF', 'uView', 'uFov'].concat(names)) u[n] = gl.getUniformLocation(prog, n);
            return { prog, u };
        }

        function makeLabelAtlas(color, shadow) {
            const c = document.createElement('canvas');
            c.width = 256; c.height = 96 * faces.length;
            const g = c.getContext('2d');
            g.font = 'bold 45px -apple-system, "Segoe UI", Roboto, sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillStyle = color;
            if (shadow) { g.shadowColor = 'rgba(0, 0, 0, 0.55)'; g.shadowBlur = 6; }
            faces.forEach((f, i) => g.fillText(f.label, 128, 96 * i + 48));
            return c;
        }

        // ───────── Lighting and shadows ─────────
        const SHADOW_SIZES = { off: 0, low: 1024, medium: 2048, high: 4096 };
        function makeShadowMap(gl, size) {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
            gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
            const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return { tex, fbo, size, ok };
        }
        function ensureShadowMaps(gl, size) {
            if (GL.shadowFailed) return null;
            if (GL.sm && GL.sm.size === size) return GL.sm;
            if (GL.sm) for (const c of [GL.sm.c0, GL.sm.c1]) { gl.deleteTexture(c.tex); gl.deleteFramebuffer(c.fbo); }
            const c0 = makeShadowMap(gl, size), c1 = makeShadowMap(gl, Math.max(512, size >> 1));
            if (!c0.ok || !c1.ok) { GL.shadowFailed = true; GL.sm = null; return null; }
            GL.sm = { size, c0, c1 };
            return GL.sm;
        }
        const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const vNorm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
        // Two orthographic shadow windows from the sun: a tight one around where you are looking and a wide one behind it.
        function renderShadows(gl, prisms, sm, balls, meshes, unions) {
            const L = [sky.lightWorld.x, sky.lightWorld.y, sky.lightWorld.z];
            const f = [-L[0], -L[1], -L[2]];
            const r = vNorm(vCross(f, Math.abs(L[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0])), u = vCross(r, f);
            const cam = [camPosX, camPosY, camPosZ], fw = [fwdX, fwdY, fwdZ];
            let hit = Infinity, minY = Infinity, maxY = -Infinity;
            const casters = [], ballCasters = [], meshCasters = [];
            for (const [, o] of prisms.concat(balls, meshes || [], unions || [])) {
                const ex = shapeHalfExt(o);
                minY = Math.min(minY, o.y - ex[1]); maxY = Math.max(maxY, o.y + ex[1]);
                if (o.wireframe) continue;
                if (o.type === 'union') {
                    // A union casts the shadow of its cells, so a shape cut out of it lets light through.
                    for (const c of o.cells || []) {
                        const p = unionCellWorld(o, c);
                        casters.push({ x: p.x, y: p.y, z: p.z, width: c.width, height: c.height, length: c.length, rotX: o.rotX, rotY: o.rotY, rotZ: o.rotZ });
                        minY = Math.min(minY, p.y - c.height); maxY = Math.max(maxY, p.y + c.height);
                    }
                } else if (o.type === 'ball') ballCasters.push(o);
                else if (o.type === 'wedge' || o.type === 'cylinder') meshCasters.push(o);
                else casters.push(o);
                let t0 = 0, t1 = Infinity;
                const c = [o.x, o.y, o.z], h = ex;
                for (let i = 0; i < 3 && t0 <= t1; i++) {
                    if (Math.abs(fw[i]) < 1e-9) { if (cam[i] < c[i] - h[i] || cam[i] > c[i] + h[i]) t1 = -1; continue; }
                    let ta = (c[i] - h[i] - cam[i]) / fw[i], tb = (c[i] + h[i] - cam[i]) / fw[i];
                    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
                    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
                }
                if (t0 <= t1 && t1 >= 0 && t0 < hit) hit = t0;
            }
            if (!casters.length && !ballCasters.length) return null;
            const hs = Math.min(4000, Math.max(20, (maxY - minY) / 2 + 10));
            const S = GL.shadow, P = GL.prism;
            gl.useProgram(S.prog); gl.bindVertexArray(P.vao);
            gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
            gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2.0, 4.0);
            const out = { vp: [], info: [], sizes: [] };
            [[24, sm.c0], [110, sm.c1]].forEach(([R, map]) => {
                const t = Math.min(isFinite(hit) ? hit : R * 0.6, R * 1.2);
                let c = [cam[0] + fw[0] * t, cam[1] + fw[1] * t, cam[2] + fw[2] * t];
                const extent = R * 1.3 + hs, far = extent * 2, texel = 2 * R / map.size;
                const cx = vDot(r, c), cy = vDot(u, c), sx = Math.floor(cx / texel) * texel, sy = Math.floor(cy / texel) * texel;
                c = [c[0] + r[0] * (sx - cx) + u[0] * (sy - cy), c[1] + r[1] * (sx - cx) + u[1] * (sy - cy), c[2] + r[2] * (sx - cx) + u[2] * (sy - cy)];
                const eye = [c[0] - f[0] * extent, c[1] - f[1] * extent, c[2] - f[2] * extent];
                const rows = [
                    [r[0] / R, r[1] / R, r[2] / R, -vDot(r, eye) / R],
                    [u[0] / R, u[1] / R, u[2] / R, -vDot(u, eye) / R],
                    [2 * f[0] / far, 2 * f[1] / far, 2 * f[2] / far, -2 * vDot(f, eye) / far - 1],
                    [0, 0, 0, 1]
                ];
                const m = new Float32Array(16);
                for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) m[col * 4 + row] = rows[row][col];
                gl.bindFramebuffer(gl.FRAMEBUFFER, map.fbo);
                gl.viewport(0, 0, map.size, map.size);
                gl.clear(gl.DEPTH_BUFFER_BIT);
                gl.uniformMatrix4fv(S.u.uLVP, false, m);
                gl.bindVertexArray(P.vao);
                for (const o of casters) {
                    const rad = Math.hypot(o.width, o.height, o.length);
                    const px = o.x - c[0], py = o.y - c[1], pz = o.z - c[2];
                    if (Math.abs(r[0] * px + r[1] * py + r[2] * pz) - rad > R * 1.42 || Math.abs(u[0] * px + u[1] * py + u[2] * pz) - rad > R * 1.42) continue;
                    gl.uniform3f(S.u.uCenter, o.x, o.y, o.z);
                    gl.uniform3f(S.u.uHalf, o.width, o.height, o.length);
                    gl.uniformMatrix3fv(S.u.uRot, false, rotGL(o));
                    gl.drawArrays(gl.TRIANGLES, 0, 36);
                }
                gl.bindVertexArray(GL.sphere.vaoTri);
                for (const o of ballCasters) {
                    const rad = Math.max(o.width, o.height, o.length);
                    const px = o.x - c[0], py = o.y - c[1], pz = o.z - c[2];
                    if (Math.abs(r[0] * px + r[1] * py + r[2] * pz) - rad > R * 1.42 || Math.abs(u[0] * px + u[1] * py + u[2] * pz) - rad > R * 1.42) continue;
                    gl.uniform3f(S.u.uCenter, o.x, o.y, o.z);
                    gl.uniform3f(S.u.uHalf, o.width, o.height, o.length);
                    gl.uniformMatrix3fv(S.u.uRot, false, rotGL(o));
                    gl.drawElements(gl.TRIANGLES, GL.sphere.nTri, gl.UNSIGNED_SHORT, 0);
                }
                if (meshCasters.length) {
                    for (const o of meshCasters) {
                        const rad = Math.hypot(o.width, o.height, o.length);
                        const px = o.x - c[0], py = o.y - c[1], pz = o.z - c[2];
                        if (Math.abs(r[0] * px + r[1] * py + r[2] * pz) - rad > R * 1.42 || Math.abs(u[0] * px + u[1] * py + u[2] * pz) - rad > R * 1.42) continue;
                        const mesh = o.type === 'wedge' ? GL.mesh.wedge : GL.mesh.cylinder;
                        gl.bindVertexArray(mesh.vao);
                        gl.uniform3f(S.u.uCenter, o.x, o.y, o.z);
                        gl.uniform3f(S.u.uHalf, o.width, o.height, o.length);
                        gl.uniformMatrix3fv(S.u.uRot, false, rotGL(o));
                        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
                    }
                }
                out.vp.push(m); out.info.push(texel, far); out.sizes.push(map.size);
            });
            gl.disable(gl.POLYGON_OFFSET_FILL);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return out;
        }
        // Colors and strengths for the enhanced lighting, in linear light
        function lightingColors() {
            const lin = (c) => c.map(v => Math.pow(Math.max(0, v / 255), 2.2));
            const day = smooth(-0.08, 0.3, sky.sunElev);
            let sun;
            if (sky.sunElev > 0) {
                const warm = 1 - smooth(0.0, 0.45, sky.sunElev);
                sun = mixRGB([1.0, 0.97, 0.9], [1.0, 0.52, 0.24], warm).map(v => v * 1.7 * sky.lightStrength);
            } else sun = [0.55, 0.68, 1.0].map(v => v * 1.5 * sky.lightStrength);
            const top = lin(sky.top), hor = lin(sky.hor);
            const mid = mixRGB(top, hor, 0.5), lum = 0.2126 * mid[0] + 0.7152 * mid[1] + 0.0722 * mid[2];
            const floor = [0.03, 0.04, 0.08];
            const skyAmb = mixRGB([lum, lum, lum], mid, 0.5).map((v, i) => Math.max(v * 0.5, floor[i]));
            const hl = 0.2126 * hor[0] + 0.7152 * hor[1] + 0.0722 * hor[2];
            const gnd = [hl * 0.34, hl * 0.3, hl * 0.24].map((v, i) => Math.max(v, floor[i] * 0.7));
            return { sun, sky: skyAmb, gnd, haze: hor, spec: 0.18 * day + 0.05 };
        }

        // Uniforms shared by the prism and mesh programs, which use the same fragment shader.
        const SHAPE_UNIFORMS = ['uCenter', 'uHalf', 'uRot', 'uColors', 'uAlbedo', 'uFaceTex', 'uEdgeColor', 'uEdgeAlpha', 'uEdgeW', 'uWire', 'uMode', 'uSunDir', 'uSunCol', 'uSkyCol', 'uGndCol', 'uHazeCol', 'uHaze', 'uFogFar', 'uShStr', 'uSpec', 'uShadowOn', 'uSh0', 'uSh1', 'uLVP0', 'uLVP1', 'uShInfo', 'uShSize'];

        // ── Meshes for the shapes a box cannot describe ──
        // Vertices are position (3), normal (3), edge UV (2) and face index (1) in the same -1..1 space as a box, so Size
        // scales them and the prism shader lights, textures and outlines them exactly like a block.
        const meshFaceIndex = (n) => {
            const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
            if (ay >= ax && ay >= az) return n[1] >= 0 ? 4 : 5;
            if (ax >= az) return n[0] >= 0 ? 2 : 3;
            return n[2] >= 0 ? 0 : 1;
        };
        function meshBuilder() {
            const v = [];
            const put = (p, n, uv) => v.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], meshFaceIndex(n));
            const tri = (a, b, c, n, uv) => { put(a, n, uv[0]); put(b, n, uv[1]); put(c, n, uv[2]); };
            const quad = (a, b, c, d, n) => { tri(a, b, c, n, [[-1, -1], [1, -1], [1, 1]]); tri(a, c, d, n, [[-1, -1], [1, 1], [-1, 1]]); };
            // A quad with no edge UVs: its surface is part of a round side, so it must not get an outline of its own.
            const quadFlat = (a, b, c, d, n) => { tri(a, b, c, n, [[0, 0], [0, 0], [0, 0]]); tri(a, c, d, n, [[0, 0], [0, 0], [0, 0]]); };
            return { v, tri, quad, quadFlat };
        }
        // A wedge is the box with its top-front half cut away: the slope is the plane y = z.
        function wedgeMesh() {
            const m = meshBuilder(), S = Math.SQRT1_2;
            m.quad([-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [0, -1, 0]);            // floor
            m.quad([-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]);                  // back wall
            m.quad([-1, -1, -1], [1, -1, -1], [1, 1, 1], [-1, 1, 1], [0, S, -S]);               // slope
            m.tri([-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 0, 0], [[-1, -1], [1, -1], [-1, 1]]);
            m.tri([1, -1, -1], [1, 1, 1], [1, -1, 1], [1, 0, 0], [[-1, -1], [-1, 1], [1, -1]]);
            return m.v;
        }
        // A cylinder stands on its end: a round column around Y with flat caps.
        function cylinderMesh(segments) {
            const m = meshBuilder(), n = segments || 24, TAU = Math.PI * 2;
            for (let i = 0; i < n; i++) {
                const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2;
                const x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
                m.quadFlat([x0, -1, z0], [x0, 1, z0], [x1, 1, z1], [x1, -1, z1], [Math.cos(am), 0, Math.sin(am)]);
            }
            // Caps: a fan from the centre (uv 0) to the rim (uv 1), so each end gets one clean circular outline.
            for (const y of [1, -1]) {
                const nrm = [0, y, 0];
                for (let i = 0; i < n; i++) {
                    const a0 = i / n * TAU, a1 = (i + 1) / n * TAU;
                    const p0 = [Math.cos(a0), y, Math.sin(a0)], p1 = [Math.cos(a1), y, Math.sin(a1)];
                    const qa = y > 0 ? p1 : p0, qb = y > 0 ? p0 : p1;   // each cap faces outwards
                    m.tri([0, y, 0], qa, qb, nrm, [[0, 0], [1, 1], [1, 1]]);
                }
            }
            return m.v;
        }

        function initGL() {
            try {
                const gl = glCanvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
                if (!gl) return;
                // Count draw calls without changing what the renderer does.
                const drawArrays = gl.drawArrays.bind(gl), drawElements = gl.drawElements.bind(gl);
                gl.drawArrays = (...args) => { glDrawCalls++; return drawArrays(...args); };
                gl.drawElements = (...args) => { glDrawCalls++; return drawElements(...args); };
                const prism = glProgram(gl, PRISM_VS, PRISM_FS, SHAPE_UNIFORMS);
                const shadow = glProgram(gl, SHADOW_VS, SHADOW_FS, ['uCenter', 'uHalf', 'uRot', 'uLVP'], true);
                const mesh = glProgram(gl, MESH_VS, PRISM_FS, SHAPE_UNIFORMS);   // returns { prog, u }, so cells below hang off it
                const meshVao = (data) => {
                    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
                    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
                    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
                    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
                    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 24);
                    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32);
                    gl.bindVertexArray(null);
                    return { vao, count: data.length / 9 };
                };
                mesh.wedge = meshVao(wedgeMesh());
                mesh.cylinder = meshVao(cylinderMesh(48));
                const ballP = glProgram(gl, BALL_VS, BALL_FS, ['uCenter', 'uHalf', 'uRot', 'uPatT', 'uBase', 'uFaceCols', 'uFaceCol', 'uWire', 'uEdgeColor', 'uSel', 'uClassic', 'uMode', 'uSunDir', 'uSunCol', 'uSkyCol', 'uGndCol', 'uHazeCol', 'uHaze', 'uFogFar', 'uShStr', 'uSpec', 'uShadowOn', 'uSh0', 'uSh1', 'uLVP0', 'uLVP1', 'uShInfo', 'uShSize']);
                // unit sphere (32 x 20), shared by every ball: one triangle list and one wireframe list
                const SEG = 32, RING = 20, sv = [], tri = [], lin = [];
                for (let i = 0; i <= RING; i++) for (let j = 0; j <= SEG; j++) {
                    const ph = i * Math.PI / RING, th = j * 2 * Math.PI / SEG;
                    sv.push(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
                }
                for (let i = 0; i < RING; i++) for (let j = 0; j < SEG; j++) {
                    const a0 = i * (SEG + 1) + j, b0 = a0 + SEG + 1;
                    tri.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
                }
                for (let i = 4; i < RING; i += 4) for (let j = 0; j < SEG; j++) { const a0 = i * (SEG + 1) + j; lin.push(a0, a0 + 1); }
                for (let j = 0; j < SEG; j += 4) for (let i = 0; i < RING; i++) { const a0 = i * (SEG + 1) + j; lin.push(a0, a0 + SEG + 1); }
                const sphereBuf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sv), gl.STATIC_DRAW);
                const mkSphereVao = (indices) => {
                    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
                    gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
                    gl.bindVertexArray(null);
                    return vao;
                };
                const sphere = { vaoTri: mkSphereVao(tri), nTri: tri.length, vaoLine: mkSphereVao(lin), nLine: lin.length };
                const axis = glProgram(gl, AXIS_VS, AXIS_FS, []);
                const label = glProgram(gl, LABEL_VS, LABEL_FS, ['uLC', 'uLR', 'uLU', 'uCell', 'uTex']);

                // unit cube, 6 faces x 2 triangles: position, normal, face-uv, face index
                const unit = getVerts({ x: 0, y: 0, z: 0, length: 1, width: 1, height: 1 });
                const uvs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
                const data = [];
                faces.forEach((f, fi) => {
                    for (const t of [0, 1, 2, 0, 2, 3]) {
                        const v = unit[f.indices[t]];
                        data.push(v.x, v.y, v.z, f.normal.x, f.normal.y, f.normal.z, uvs[t][0], uvs[t][1], fi);
                    }
                });
                prism.vao = gl.createVertexArray(); gl.bindVertexArray(prism.vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
                [[0, 3, 0], [1, 3, 3], [2, 2, 6], [3, 1, 8]].forEach(([loc, size, off]) => {
                    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, off * 4);
                });

                axis.vao = gl.createVertexArray(); gl.bindVertexArray(axis.vao);
                axis.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, axis.buf);
                [[0, 3, 0], [1, 3, 3], [2, 2, 6], [3, 4, 8], [4, 1, 12]].forEach(([loc, size, off]) => {
                    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 52, off * 4);
                });

                label.vao = gl.createVertexArray(); gl.bindVertexArray(label.vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
                gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
                gl.bindVertexArray(null);

                const tex = [makeLabelAtlas('#ffffff', true), makeLabelAtlas('#0f172a', false)].map(c => {
                    const t = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, t);
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
                    gl.generateMipmap(gl.TEXTURE_2D);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    return t;
                });
                GL = { gl, prism, axis, label, tex, shadow, ball: ballP, sphere, mesh, sm: null, dummy: makeShadowMap(gl, 1) };
                resize();
            } catch (err) {
                console.warn('WebGL 2 unavailable, using the 2D renderer instead:', err);
                GL = null;
            }
        }

        const FACE_COLS_F32 = new Float32Array([].concat(...faces.map(f => [1, 3, 5].map(i => parseInt(f.color.slice(i, i + 2), 16) / 255))));
        // Per-face colors and outline settings, shared by prisms, wedges, cylinders and union cells.
        // Per-face colors only change when a shape's color, its rotation or the light changes, so they are cached and a
        // big build costs uniforms and draw calls per frame instead of color maths and two typed arrays per shape.
        const shadeCache = new Map();
        function shapeLook(id, o) {
            const col = prismColor(o), face = !!o.faceColoring;
            const rx = o.rotX || 0, ry = o.rotY || 0, rz = o.rotZ || 0;
            const lx = sky.lightWorld.x, ly = sky.lightWorld.y, lz = sky.lightWorld.z;
            const amb = sky.ambient, str = sky.lightStrength;
            const hit = shadeCache.get(id);
            if (hit && hit.col === col && hit.face === face && hit.rx === rx && hit.ry === ry && hit.rz === rz &&
                hit.lx === lx && hit.ly === ly && hit.lz === lz && hit.amb === amb && hit.str === str) return hit;
            const colors = new Float32Array(18), albedo = new Float32Array(18), Ro = rotMat(o);
            for (let fi = 0; fi < 6; fi++) {
                const f = faces[fi], n = f.normal;
                const nx = Ro[0] * n.x + Ro[1] * n.y + Ro[2] * n.z, ny = Ro[3] * n.x + Ro[4] * n.y + Ro[5] * n.z, nz = Ro[6] * n.x + Ro[7] * n.y + Ro[8] * n.z;
                const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
                const c = face ? f.color : col;
                const rgb = shadeRGB(c, amb + (1 - amb) * diffuse * str);
                colors[fi * 3] = rgb[0]; colors[fi * 3 + 1] = rgb[1]; colors[fi * 3 + 2] = rgb[2];
                albedo[fi * 3] = parseInt(c.slice(1, 3), 16) / 255; albedo[fi * 3 + 1] = parseInt(c.slice(3, 5), 16) / 255; albedo[fi * 3 + 2] = parseInt(c.slice(5, 7), 16) / 255;
            }
            const entry = { col, face, rx, ry, rz, lx, ly, lz, amb, str, colors, albedo };
            shadeCache.set(id, entry);
            // Deleted shapes leave their buffers behind, so drop those once the cache has grown past the scene.
            if (shadeCache.size > 2048) for (const k of shadeCache.keys()) if (!sceneObjects[k]) shadeCache.delete(k);
            return entry;
        }
        function applyShapeLook(P, id, o, faceTex, noTex) {
            const gl = GL.gl, look = shapeLook(id, o);
            gl.uniform3fv(P.u.uColors, look.colors); gl.uniform3fv(P.u.uAlbedo, look.albedo);
            gl.uniform1iv(P.u.uFaceTex, faceTex.get(id) || noTex);
            const sel = id === selectedObjectId || (selectedObjectId && isInside(id, selectedObjectId));
            let wire = 0, edge = [0, 0, 0], edgeA = o.outline === false ? 0 : 0.5, w = 0.9;
            if (sel) { edge = accentRGB; edgeA = 1; w = 1.9; wire = o.wireframe ? 1 : 0; }
            else if (o.wireframe) { wire = o.faceColoring ? 2 : 1; edge = skyBright ? [0.059, 0.09, 0.165] : [0.22, 0.74, 0.97]; w = 1.0; }
            gl.uniform1i(P.u.uWire, wire);
            gl.uniform3f(P.u.uEdgeColor, edge[0], edge[1], edge[2]);
            gl.uniform1f(P.u.uEdgeAlpha, edgeA);
            gl.uniform1f(P.u.uEdgeW, w);
        }
        function drawGL(prisms, balls, meshes, unions, highlights) {
            const { gl, prism: P, axis: A, label: L, tex } = GL;
            const cam = [camPosX, camPosY, camPosZ];
            const setCam = (p) => {
                gl.uniform3f(p.u.uCam, cam[0], cam[1], cam[2]);
                gl.uniform3f(p.u.uR, rgtX, 0, rgtZ);
                gl.uniform3f(p.u.uU, upX, upY, upZ);
                gl.uniform3f(p.u.uF, fwdX, fwdY, fwdZ);
                gl.uniform2f(p.u.uView, width, height);
                gl.uniform1f(p.u.uFov, FOV);
            };
            // Shapes outside the view are skipped before any uniform work, so a dense build only costs what is on
            // screen. It is a bounding-sphere test against the four side planes of the view, so nothing visible is
            // dropped; the shadow pass still gets the full lists, because off-screen shapes cast shadows into view.
            const tanX = width / (2 * FOV), tanY = height / (2 * FOV);
            const fogFar = settings.renderDistance > 0 ? settings.renderDistance : 0;
            const onScreen = (o) => {
                const dx = o.x - cam[0], dy = o.y - cam[1], dz = o.z - cam[2];
                const d = dx * fwdX + dy * fwdY + dz * fwdZ;
                const r = Math.sqrt(o.width * o.width + o.height * o.height + o.length * o.length);
                if (d < -r) return false;
                // Past the render distance the fog has already turned it into sky, so the draw can be skipped.
                if (fogFar > 0 && Math.sqrt(dx * dx + dy * dy + dz * dz) - r > fogFar) return false;
                const span = d + r;
                if (span <= 0) return false;
                if (Math.abs(dx * rgtX + dz * rgtZ) > tanX * span + r) return false;
                if (Math.abs(dx * upX + dy * upY + dz * upZ) > tanY * span + r) return false;
                return true;
            };
            const enhanced = settings.lighting !== 'classic';
            const shSize = enhanced ? (SHADOW_SIZES[settings.shadows] || 0) : 0;
            const Ldir = sky.lightWorld, shStr = smooth(0.02, 0.16, Ldir.y);
            let shadowSet = null;
            if (shSize > 0 && shStr > 0.01) { const sm = ensureShadowMaps(gl, shSize); if (sm) shadowSet = renderShadows(gl, prisms, sm, balls, meshes, unions); }
            gl.viewport(0, 0, glCanvas.width, glCanvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
            gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            // 1. prisms
            gl.useProgram(P.prog); setCam(P); gl.bindVertexArray(P.vao);
            const lt = lightingColors();
            const setLight = (P) => {
                gl.uniform1i(P.u.uMode, enhanced ? 1 : 0);
                gl.uniform3f(P.u.uSunDir, Ldir.x, Ldir.y, Ldir.z);
                gl.uniform3fv(P.u.uSunCol, lt.sun); gl.uniform3fv(P.u.uSkyCol, lt.sky); gl.uniform3fv(P.u.uGndCol, lt.gnd); gl.uniform3fv(P.u.uHazeCol, lt.haze);
                gl.uniform1f(P.u.uHaze, enhanced && settings.haze !== false ? 0.0035 : 0);
                gl.uniform1f(P.u.uFogFar, fogFar);
                gl.uniform1f(P.u.uSpec, lt.spec); gl.uniform1f(P.u.uShStr, shStr);
                gl.uniform1i(P.u.uShadowOn, shadowSet ? 1 : 0);
                const sm = shadowSet && GL.sm;
                gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, sm ? sm.c0.tex : GL.dummy.tex);
                gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, sm ? sm.c1.tex : GL.dummy.tex);
                gl.activeTexture(gl.TEXTURE0);
                gl.uniform1i(P.u.uSh0, 4); gl.uniform1i(P.u.uSh1, 5);
                if (shadowSet) {
                    gl.uniformMatrix4fv(P.u.uLVP0, false, shadowSet.vp[0]); gl.uniformMatrix4fv(P.u.uLVP1, false, shadowSet.vp[1]);
                    gl.uniform4f(P.u.uShInfo, shadowSet.info[0], shadowSet.info[1], shadowSet.info[2], shadowSet.info[3]);
                    gl.uniform2f(P.u.uShSize, shadowSet.sizes[0], shadowSet.sizes[1]);
                }
            };
            setLight(P);
            gl.enable(gl.POLYGON_OFFSET_FILL);
            const wireRGB = skyBright ? [0.059, 0.09, 0.165] : [0.22, 0.74, 0.97];
            let visible = 0;
            const faceTex = new Map();
            for (const t of Object.values(sceneObjects)) {
                if (t.type !== 'texture' || !TEXTURES[t.texture] || !Array.isArray(t.faces)) continue;
                const arr = faceTex.get(t.parent) || new Int32Array(6);
                for (const f of t.faces) if (f >= 0 && f < 6) arr[f] = TEXTURES[t.texture].id;
                faceTex.set(t.parent, arr);
            }
            const noTex = new Int32Array(6);
            const selObj = selectedObjectId && sceneObjects[selectedObjectId];
            const texParent = selObj && selObj.type === 'texture' ? selObj.parent : null;
            prisms.forEach(([id, o], i) => {
                if (!onScreen(o)) return;
                gl.polygonOffset(0, -(i + 1));   // later prisms win exact depth ties, so touching faces never flicker
                gl.uniform3f(P.u.uCenter, o.x, o.y, o.z);
                gl.uniform3f(P.u.uHalf, o.width, o.height, o.length);
                gl.uniformMatrix3fv(P.u.uRot, false, rotGL(o));
                const look = shapeLook(id, o);
                // The face counter only feeds the status bar, so it is skipped entirely when that bar is hidden.
                if (settings.showStatus !== false) {
                    const Ro = rotMat(o);
                    for (let fi = 0; fi < 6; fi++) {
                        const n = faces[fi].normal;
                        const nx = Ro[0] * n.x + Ro[1] * n.y + Ro[2] * n.z, ny = Ro[3] * n.x + Ro[4] * n.y + Ro[5] * n.z, nz = Ro[6] * n.x + Ro[7] * n.y + Ro[8] * n.z;
                        const lx = n.x * o.width, ly = n.y * o.height, lz = n.z * o.length;
                        const cxw = o.x + Ro[0] * lx + Ro[1] * ly + Ro[2] * lz, cyw = o.y + Ro[3] * lx + Ro[4] * ly + Ro[5] * lz, czw = o.z + Ro[6] * lx + Ro[7] * ly + Ro[8] * lz;
                        if (nx * (cam[0] - cxw) + ny * (cam[1] - cyw) + nz * (cam[2] - czw) > 0) visible++;
                    }
                }
                gl.uniform3fv(P.u.uColors, look.colors); gl.uniform3fv(P.u.uAlbedo, look.albedo);
                gl.uniform1iv(P.u.uFaceTex, faceTex.get(id) || noTex);
                const sel = id === selectedObjectId || id === texParent || (selectedObjectId && isInside(id, selectedObjectId));
                let wire = 0, edge = [0, 0, 0], edgeA = o.outline === false ? 0 : 0.5, w = 0.9;
                if (sel) { edge = accentRGB; edgeA = 1; w = 1.9; wire = o.wireframe ? 1 : 0; }
                else if (o.wireframe) { wire = o.faceColoring ? 2 : 1; edge = wireRGB; w = 1.0; }
                gl.uniform1i(P.u.uWire, wire);
                gl.uniform3f(P.u.uEdgeColor, edge[0], edge[1], edge[2]);
                gl.uniform1f(P.u.uEdgeAlpha, edgeA);
                gl.uniform1f(P.u.uEdgeW, w);
                gl.drawArrays(gl.TRIANGLES, 0, 36);
            });
            gl.disable(gl.POLYGON_OFFSET_FILL);

            // 1a. wedges and cylinders: their own triangles, lit by the same shader as the blocks
            if (meshes.length) {
                const M = GL.mesh;
                gl.useProgram(M.prog); setCam(M); setLight(M);
                gl.enable(gl.POLYGON_OFFSET_FILL);
                meshes.forEach(([id, o], i) => {
                    if (!onScreen(o)) return;
                    gl.polygonOffset(0, -(i + 1));
                    applyShapeLook(M, id, o, faceTex, noTex);
                    gl.uniform3f(M.u.uCenter, o.x, o.y, o.z);
                    gl.uniform3f(M.u.uHalf, o.width, o.height, o.length);
                    gl.uniformMatrix3fv(M.u.uRot, false, rotGL(o));
                    const mesh = o.type === 'wedge' ? M.wedge : M.cylinder;
                    gl.bindVertexArray(mesh.vao);
                    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
                });
                gl.disable(gl.POLYGON_OFFSET_FILL);
            }

            // 1c. unions: each cell is a block, so they draw through the prism program
            if (unions.length) {
                gl.useProgram(P.prog); setCam(P); setLight(P); gl.bindVertexArray(P.vao);
                gl.enable(gl.POLYGON_OFFSET_FILL);
                let cellN = 0;
                for (const [id, u] of unions) {
                    if (!onScreen(u)) continue;
                    applyShapeLook(P, id, u, faceTex, noTex);
                    gl.uniformMatrix3fv(P.u.uRot, false, rotGL(u));
                    for (const c of u.cells) {
                        const p = unionCellWorld(u, c);
                        gl.polygonOffset(0, -(++cellN));
                        gl.uniform3f(P.u.uCenter, p.x, p.y, p.z);
                        gl.uniform3f(P.u.uHalf, c.width, c.height, c.length);
                        gl.drawArrays(gl.TRIANGLES, 0, 36);
                    }
                }
                gl.disable(gl.POLYGON_OFFSET_FILL);
            }

            // 1b. balls
            if (balls.length) {
                const B = GL.ball, SP = GL.sphere;
                gl.useProgram(B.prog); setCam(B); setLight(B);
                gl.uniform3fv(B.u.uFaceCols, FACE_COLS_F32);
                gl.uniform2f(B.u.uClassic, sky.ambient, sky.lightStrength);
                gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
                for (const [id, o] of balls) {
                    if (!onScreen(o)) continue;
                    const sel = id === selectedObjectId || (selectedObjectId && isInside(id, selectedObjectId));
                    const col = prismColor(o);
                    gl.uniform3f(B.u.uCenter, o.x, o.y, o.z);
                    gl.uniform3f(B.u.uHalf, o.width, o.height, o.length);
                    const Ru = rotMat(o), Rp = mat3mul(ballRotFor(id), Ru);
                    gl.uniformMatrix3fv(B.u.uRot, false, rotGL(o));
                    gl.uniformMatrix3fv(B.u.uPatT, false, mat3T(mat3mul(mat3T(Rp), Ru)));
                    gl.uniform3f(B.u.uBase, parseInt(col.slice(1, 3), 16) / 255, parseInt(col.slice(3, 5), 16) / 255, parseInt(col.slice(5, 7), 16) / 255);
                    gl.uniform1i(B.u.uFaceCol, o.faceColoring ? 1 : 0);
                    gl.uniform1f(B.u.uSel, sel ? 1 : 0);
                    const ec = sel ? accentRGB : wireRGB;
                    gl.uniform3f(B.u.uEdgeColor, ec[0], ec[1], ec[2]);
                    if (o.wireframe) {
                        gl.uniform1i(B.u.uWire, o.faceColoring && !sel ? 2 : 1);
                        gl.bindVertexArray(SP.vaoLine); gl.drawElements(gl.LINES, SP.nLine, gl.UNSIGNED_SHORT, 0);
                    } else {
                        gl.uniform1i(B.u.uWire, 0);
                        gl.bindVertexArray(SP.vaoTri); gl.drawElements(gl.TRIANGLES, SP.nTri, gl.UNSIGNED_SHORT, 0);
                    }
                }
                gl.disable(gl.CULL_FACE);
            }

            // 1d. highlights: the edges of the parts under each Highlight, optionally drawn over everything
            if (highlights.length) {
                gl.depthMask(false);
                for (const [, h] of highlights) {
                    const targets = highlightTargets(h);
                    if (!targets.length) continue;
                    const hc = prismColor(h);
                    const hr = parseInt(hc.slice(1, 3), 16) / 255, hg = parseInt(hc.slice(3, 5), 16) / 255, hb = parseInt(hc.slice(5, 7), 16) / 255;
                    if (h.overObjects) gl.disable(gl.DEPTH_TEST);
                    const boxes = targets.filter(([, o]) => o.type !== 'wedge' && o.type !== 'cylinder');
                    const meshy = targets.filter(([, o]) => o.type === 'wedge' || o.type === 'cylinder');
                    if (boxes.length) {
                        gl.useProgram(P.prog); setCam(P); gl.bindVertexArray(P.vao);
                        gl.uniform1i(P.u.uWire, 1); gl.uniform1f(P.u.uEdgeAlpha, 1); gl.uniform1f(P.u.uEdgeW, 2.6);
                        gl.uniform3f(P.u.uEdgeColor, hr, hg, hb);
                        for (const [, o] of boxes) {
                            gl.uniformMatrix3fv(P.u.uRot, false, rotGL(o));
                            if (o.type === 'union') {
                                for (const c of o.cells) {
                                    const p = unionCellWorld(o, c);
                                    gl.uniform3f(P.u.uCenter, p.x, p.y, p.z);
                                    gl.uniform3f(P.u.uHalf, c.width, c.height, c.length);
                                    gl.drawArrays(gl.TRIANGLES, 0, 36);
                                }
                            } else {
                                gl.uniform3f(P.u.uCenter, o.x, o.y, o.z);
                                gl.uniform3f(P.u.uHalf, o.width, o.height, o.length);
                                gl.drawArrays(gl.TRIANGLES, 0, 36);
                            }
                        }
                    }
                    if (meshy.length) {
                        const M = GL.mesh;
                        gl.useProgram(M.prog); setCam(M);
                        gl.uniform1i(M.u.uWire, 1); gl.uniform1f(M.u.uEdgeAlpha, 1); gl.uniform1f(M.u.uEdgeW, 2.6);
                        gl.uniform3f(M.u.uEdgeColor, hr, hg, hb);
                        for (const [, o] of meshy) {
                            gl.uniform3f(M.u.uCenter, o.x, o.y, o.z);
                            gl.uniform3f(M.u.uHalf, o.width, o.height, o.length);
                            gl.uniformMatrix3fv(M.u.uRot, false, rotGL(o));
                            const mesh = o.type === 'wedge' ? M.wedge : M.cylinder;
                            gl.bindVertexArray(mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
                        }
                    }
                    if (h.overObjects) gl.enable(gl.DEPTH_TEST);
                }
                gl.depthMask(true);
            }
            gl.depthMask(false);

            // 2. axes (depth-tested, so prisms hide them correctly)
            const verts = [];
            const near = 0.15;
            const zOf = (p) => (p[0] - cam[0]) * fwdX + (p[1] - cam[1]) * fwdY + (p[2] - cam[2]) * fwdZ;
            const mixP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
            const addSeg = (p0, p1, rgb, alpha, halfW) => {
                let a = p0, b = p1;
                const za = zOf(a), zb = zOf(b);
                if (za < near && zb < near) return;
                if (za < near) a = mixP(a, b, (near - za) / (zb - za));
                else if (zb < near) b = mixP(b, a, (near - zb) / (za - zb));
                for (const [side, end] of [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]])
                    verts.push(a[0], a[1], a[2], b[0], b[1], b[2], side, end, rgb[0], rgb[1], rgb[2], alpha, halfW);
            };
            const AX = [[0.937, 0.267, 0.267], [0.133, 0.773, 0.369], [0.231, 0.51, 0.965]];
            const { lim, step: axStep, n: axN, tk } = axisGeom();
            const mainA = skyBright ? 0.7 : 0.4, tickA = skyBright ? 0.6 : 0.3;
            addSeg([-lim, 0, 0], [lim, 0, 0], AX[0], mainA, 1);
            addSeg([0, -lim, 0], [0, lim, 0], AX[1], mainA, 1);
            addSeg([0, 0, -lim], [0, 0, lim], AX[2], mainA, 1);
            for (let k = -axN; k <= axN; k++) {
                if (k === 0) continue;
                const i = k * axStep;
                addSeg([i, -tk, 0], [i, tk, 0], AX[0], tickA, 0.75);
                addSeg([-tk, i, 0], [tk, i, 0], AX[1], tickA, 0.75);
                addSeg([0, -tk, i], [0, tk, i], AX[2], tickA, 0.75);
            }
            if (settings.showAxes === false) verts.length = 0;
            gl.useProgram(A.prog); setCam(A); gl.bindVertexArray(A.vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, A.buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
            gl.drawArrays(gl.TRIANGLES, 0, verts.length / 13);

            // 3. face labels (also depth-tested, so a label hidden behind another prism stays hidden)
            if (prisms.some(([, o]) => o.showLabels) || balls.some(([, o]) => o.showLabels)) {
                gl.useProgram(L.prog); setCam(L); gl.bindVertexArray(L.vao);
                gl.activeTexture(gl.TEXTURE0); gl.uniform1i(L.u.uTex, 0);
                for (const [, o] of prisms) {
                    if (!o.showLabels || !onScreen(o)) continue;
                    const minDim = Math.min(o.length, o.width, o.height) * 2;
                    // A label that would come out a couple of pixels wide cannot be read, so it is not drawn at all.
                    const dc = (o.x - cam[0]) * fwdX + (o.y - cam[1]) * fwdY + (o.z - cam[2]) * fwdZ;
                    if (minDim * 0.5333 * FOV / Math.max(dc, 0.5) < 2.5) continue;
                    gl.bindTexture(gl.TEXTURE_2D, tex[skyBright && o.wireframe ? 1 : 0]);
                    const Ro = rotMat(o);
                    for (let fi = 0; fi < 6; fi++) {
                        const f = faces[fi], n = f.normal, rt = f.right, upv = f.up;
                        const nx = Ro[0] * n.x + Ro[1] * n.y + Ro[2] * n.z, ny = Ro[3] * n.x + Ro[4] * n.y + Ro[5] * n.z, nz = Ro[6] * n.x + Ro[7] * n.y + Ro[8] * n.z;
                        const px = n.x * o.width, py = n.y * o.height, pz = n.z * o.length;
                        const cx0 = o.x + Ro[0] * px + Ro[1] * py + Ro[2] * pz, cy0 = o.y + Ro[3] * px + Ro[4] * py + Ro[5] * pz, cz0 = o.z + Ro[6] * px + Ro[7] * py + Ro[8] * pz;
                        if (nx * (cam[0] - cx0) + ny * (cam[1] - cy0) + nz * (cam[2] - cz0) <= 0) continue;
                        const z = (cx0 - cam[0]) * fwdX + (cy0 - cam[1]) * fwdY + (cz0 - cam[2]) * fwdZ;
                        if (z < 0.3) continue;
                        const hh = Math.min(96 * z / FOV, minDim * 0.5333) / 2, hw = hh * 256 / 96, lift = 0.002 * z + 0.001;
                        gl.uniform3f(L.u.uLC, cx0 + nx * lift, cy0 + ny * lift, cz0 + nz * lift);
                        gl.uniform3f(L.u.uLR, (Ro[0] * rt.x + Ro[1] * rt.y + Ro[2] * rt.z) * hw, (Ro[3] * rt.x + Ro[4] * rt.y + Ro[5] * rt.z) * hw, (Ro[6] * rt.x + Ro[7] * rt.y + Ro[8] * rt.z) * hw);
                        gl.uniform3f(L.u.uLU, (Ro[0] * upv.x + Ro[1] * upv.y + Ro[2] * upv.z) * hh, (Ro[3] * upv.x + Ro[4] * upv.y + Ro[5] * upv.z) * hh, (Ro[6] * upv.x + Ro[7] * upv.y + Ro[8] * upv.z) * hh);
                        gl.uniform2f(L.u.uCell, fi / faces.length, (fi + 1) / faces.length);
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    }
                }
            }
            // ball labels sit at the six poles of the ball and turn with it
            if (balls.some(([, o]) => o.showLabels)) {
                gl.useProgram(L.prog); setCam(L); gl.bindVertexArray(L.vao);
                gl.activeTexture(gl.TEXTURE0); gl.uniform1i(L.u.uTex, 0);
                for (const [id, o] of balls) {
                    if (!o.showLabels || !onScreen(o)) continue;
                    gl.bindTexture(gl.TEXTURE_2D, tex[skyBright && o.wireframe ? 1 : 0]);
                    const Ru = rotMat(o), R = mat3mul(ballRotFor(id), Ru), rd = [o.width, o.height, o.length], minR = Math.min(...rd);
                    const rot = (v) => [R[0] * v.x + R[1] * v.y + R[2] * v.z, R[3] * v.x + R[4] * v.y + R[5] * v.z, R[6] * v.x + R[7] * v.y + R[8] * v.z];
                    faces.forEach((f, fi) => {
                        const d = rot(f.normal), ld = [Ru[0] * d[0] + Ru[3] * d[1] + Ru[6] * d[2], Ru[1] * d[0] + Ru[4] * d[1] + Ru[7] * d[2], Ru[2] * d[0] + Ru[5] * d[1] + Ru[8] * d[2]];
                        const t = 1 / Math.hypot(ld[0] / rd[0], ld[1] / rd[1], ld[2] / rd[2]);
                        const c = [o.x + d[0] * t, o.y + d[1] * t, o.z + d[2] * t];
                        const nl0 = [ld[0] / rd[0], ld[1] / rd[1], ld[2] / rd[2]], nlen = Math.hypot(nl0[0], nl0[1], nl0[2]);
                        const nw = [Ru[0] * nl0[0] + Ru[1] * nl0[1] + Ru[2] * nl0[2], Ru[3] * nl0[0] + Ru[4] * nl0[1] + Ru[5] * nl0[2], Ru[6] * nl0[0] + Ru[7] * nl0[1] + Ru[8] * nl0[2]];
                        const nrm = [nw[0] / nlen, nw[1] / nlen, nw[2] / nlen];
                        if (nrm[0] * (cam[0] - c[0]) + nrm[1] * (cam[1] - c[1]) + nrm[2] * (cam[2] - c[2]) <= 0.15 * Math.hypot(cam[0] - c[0], cam[1] - c[1], cam[2] - c[2])) return;
                        const z = zOf(c);
                        if (z < 0.3) return;
                        const hh = Math.min(96 * z / FOV, minR * 0.75) / 2, hw = hh * 256 / 96, lift = 0.002 * z + 0.001;
                        const rr = rot(f.right), uu = rot(f.up);
                        gl.uniform3f(L.u.uLC, c[0] + nrm[0] * lift, c[1] + nrm[1] * lift, c[2] + nrm[2] * lift);
                        gl.uniform3f(L.u.uLR, rr[0] * hw, rr[1] * hw, rr[2] * hw);
                        gl.uniform3f(L.u.uLU, uu[0] * hh, uu[1] * hh, uu[2] * hh);
                        gl.uniform2f(L.u.uCell, fi / faces.length, (fi + 1) / faces.length);
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    });
                }
            }
            gl.depthMask(true);
            gl.bindVertexArray(null);
            return visible;
        }

        function drawFallback(prisms, balls) {
            // Axes
            if (settings.showAxes !== false) {
            const { lim: axisLimit, step: axStepF, n: axNF, tk: tickSize } = axisGeom();
            draw3DLine(new Vec3(-axisLimit, 0, 0), new Vec3(axisLimit, 0, 0), skyBright ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.4)', 2);
            draw3DLine(new Vec3(0, -axisLimit, 0), new Vec3(0, axisLimit, 0), skyBright ? 'rgba(34, 197, 94, 0.7)' : 'rgba(34, 197, 94, 0.4)', 2);
            draw3DLine(new Vec3(0, 0, -axisLimit), new Vec3(0, 0, axisLimit), skyBright ? 'rgba(59, 130, 246, 0.7)' : 'rgba(59, 130, 246, 0.4)', 2);
            for (let k = -axNF; k <= axNF; k++) {
                if (k === 0) continue;
                const i = k * axStepF;
                draw3DLine(new Vec3(i, -tickSize, 0), new Vec3(i, tickSize, 0), skyBright ? 'rgba(239, 68, 68, 0.6)' : 'rgba(239, 68, 68, 0.3)', 1.5);
                draw3DLine(new Vec3(-tickSize, i, 0), new Vec3(tickSize, i, 0), skyBright ? 'rgba(34, 197, 94, 0.6)' : 'rgba(34, 197, 94, 0.3)', 1.5);
                draw3DLine(new Vec3(0, -tickSize, i), new Vec3(0, tickSize, i), skyBright ? 'rgba(59, 130, 246, 0.6)' : 'rgba(59, 130, 246, 0.3)', 1.5);
            }
            }

            // Gather visible faces from every prism in the World
            const visibleFaces = [];
            for (const [id, obj] of orderPrisms(prisms)) {
                const tv = getVerts(obj).map(v => {
                    const rot = transformPoint(v), scale = FOV / rot.z;
                    return { x3d: rot.x, y3d: rot.y, z3d: rot.z, x2d: rot.x * scale + cx, y2d: rot.y * scale + cy };
                });
                for (const face of faces) {
                    if (face.indices.some(i => tv[i].z3d < 0.1)) continue;
                    const Rf = rotMat(obj), n = rotateVector(new Vec3(Rf[0] * face.normal.x + Rf[1] * face.normal.y + Rf[2] * face.normal.z, Rf[3] * face.normal.x + Rf[4] * face.normal.y + Rf[5] * face.normal.z, Rf[6] * face.normal.x + Rf[7] * face.normal.y + Rf[8] * face.normal.z));
                    let cx3 = 0, cy3 = 0, cz3 = 0;
                    for (const idx of face.indices) { cx3 += tv[idx].x3d; cy3 += tv[idx].y3d; cz3 += tv[idx].z3d; }
                    cx3 /= 4; cy3 /= 4; cz3 /= 4;
                    if (n.dot(new Vec3(cx3, cy3, cz3)) >= 0) continue;

                    // sunlight / moonlight comes from the sky, so faces light up depending on the time of day
                    const diffuse = Math.max(0, (Rf[0] * face.normal.x + Rf[1] * face.normal.y + Rf[2] * face.normal.z) * sky.lightWorld.x + (Rf[3] * face.normal.x + Rf[4] * face.normal.y + Rf[5] * face.normal.z) * sky.lightWorld.y + (Rf[6] * face.normal.x + Rf[7] * face.normal.y + Rf[8] * face.normal.z) * sky.lightWorld.z);
                    const intensity = sky.ambient + (1 - sky.ambient) * diffuse * sky.lightStrength;
                    const fog = fogAmount(Math.hypot(cx3, cy3, cz3));
                    if (fog > 0.995) continue;   // past the render distance: nothing of this face is left to see
                    const shaded = shadedCss(obj.faceColoring ? face.color : prismColor(obj), intensity, fog);
                    const rightT = rotateVector(face.right), upT = rotateVector(face.up);
                    const scaleC = FOV / cz3;
                    const cx2d = cx3 * scaleC + cx, cy2d = cy3 * scaleC + cy;
                    const rx2d = (cx3 + rightT.x) * (FOV / (cz3 + rightT.z)) + cx, ry2d = (cy3 + rightT.y) * (FOV / (cz3 + rightT.z)) + cy;
                    const dx2d = (cx3 - upT.x) * (FOV / (cz3 - upT.z)) + cx, dy2d = (cy3 - upT.y) * (FOV / (cz3 - upT.z)) + cy;
                    visibleFaces.push({
                        id, obj, label: face.label, color: shaded, depth: cz3,
                        pts: face.indices.map(i => ({ x: tv[i].x2d, y: tv[i].y2d })),
                        t: { cx2d, cy2d, vxX: rx2d - cx2d, vxY: ry2d - cy2d, vyX: dx2d - cx2d, vyY: dy2d - cy2d, scaleC }
                    });
                }
            }
            lastFaces = visibleFaces;   // already in draw order: far prisms first

            for (const face of visibleFaces) {
                const obj = face.obj, sel = face.id === selectedObjectId || (selectedObjectId && isInside(face.id, selectedObjectId));
                ctx.beginPath(); ctx.moveTo(face.pts[0].x, face.pts[0].y);
                for (let j = 1; j < face.pts.length; j++) ctx.lineTo(face.pts[j].x, face.pts[j].y);
                ctx.closePath();
                ctx.lineJoin = 'round';

                if (obj.wireframe) {
                    ctx.lineWidth = sel ? 3 : (skyBright ? 2 : 1.5);
                    ctx.strokeStyle = sel ? accentCol : (obj.faceColoring ? face.color : (skyBright ? '#0f172a' : '#38bdf8'));
                    ctx.stroke();
                } else {
                    ctx.fillStyle = face.color; ctx.fill();
                    ctx.lineWidth = sel ? 3.5 : 1.5;
                    ctx.strokeStyle = sel ? accentCol : 'rgba(0, 0, 0, 0.5)';
                    ctx.stroke();
                }

                if (obj.showLabels) {
                    const t = face.t;
                    ctx.save();
                    ctx.transform(t.vxX, t.vxY, t.vyX, t.vyY, t.cx2d, t.cy2d);
                    let constantScale = 1.0 / t.scaleC;
                    const minDim = Math.min(obj.length, obj.width, obj.height) * 2;
                    const maxAllowedScale = (minDim * 0.25) / 45.0;
                    if (constantScale > maxAllowedScale) constantScale = maxAllowedScale;
                    ctx.scale(constantScale, constantScale);
                    ctx.fillStyle = skyBright && obj.wireframe ? '#0f172a' : '#ffffff';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.font = 'bold 45px -apple-system, sans-serif';
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; ctx.shadowBlur = 5;
                    ctx.fillText(face.label, 0, 0);
                    ctx.restore();
                }
            }

            // balls: shaded circles, farthest first (this simple renderer has no depth buffer)
            const bl = balls.map(([id, o]) => ({ id, o, p: transformPoint(new Vec3(o.x, o.y, o.z)), fog: fogAmount(Math.hypot(o.x - camPosX, o.y - camPosY, o.z - camPosZ)) })).filter(b => b.p.z > 0.1 && b.fog < 0.995).sort((a, b) => b.p.z - a.p.z);
            for (const { id, o, p, fog } of bl) {
                const sc = FOV / p.z, r = Math.max(1, ballRadius(o) * sc), x = p.x * sc + cx, y = p.y * sc + cy;
                const lit = sky.ambient + (1 - sky.ambient) * 0.6 * sky.lightStrength, col = o.faceColoring ? '#a855f7' : prismColor(o);
                const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
                g.addColorStop(0, shadedCss(col, Math.min(1, lit + 0.4), fog)); g.addColorStop(1, shadedCss(col, lit * 0.35, fog));
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = g; ctx.fill();
                ctx.lineWidth = id === selectedObjectId ? 3 : 1; ctx.strokeStyle = id === selectedObjectId ? accentCol : 'rgba(0, 0, 0, 0.4)'; ctx.stroke();
            }

            return visibleFaces.length + bl.length;
        }
        let uiDirty = false;
        let outputDirty = false;
        function render() {
            if (!width || !height || !Number.isFinite(cx + cy)) { requestAnimationFrame(render); return; }
            const frameStart = performance.now();
            if (simulationRunning) {
                if (!physicsLastTime) physicsLastTime = frameStart;
                let remaining = Math.min(0.05, Math.max(0, (frameStart - physicsLastTime) / 1000));
                physicsLastTime = frameStart;
                stepScripts();
                takeUIForPlayers();
                while (remaining > 0) {
                    const step = Math.min(PHYSICS_MAX_STEP, remaining);
                    physicsStep(step);
                    remaining -= step;
                }
                syncPropInputs();
                syncUIPropInputs();
            }
            if (uiDirty) {
                uiDirty = false;
                const missing = selectedObjectId && !sceneObjects[selectedObjectId];
                if (missing) selectedObjectId = null;
                renderExplorer();
                if (missing || (selectedObjectId && sceneObjects[selectedObjectId] && sceneObjects[selectedObjectId].type === 'player')) renderProperties();
            }
            if (outputDirty) { outputDirty = false; renderOutput(); }

            updateTrig();

            // WASD camera movement (locked while dragging a handle)
            const moveSpeed = settings.camSpeed > 0 ? settings.camSpeed : 0.1;
            let playerCam = false;
            if (simulationRunning) {
                const nowT = performance.now();
                playerCam = stepPlayerControl(pc.last ? Math.min(0.05, (nowT - pc.last) / 1000) : 0);
                pc.last = nowT;
            }
            if (!playerCam && !manip && !isTyping()) {
                const forwardX = fwdX, forwardY = fwdY, forwardZ = fwdZ;
                const rightX = rgtX, rightY = 0, rightZ = rgtZ;
                if (keyState['w']) { camPosX += forwardX * moveSpeed; camPosY += forwardY * moveSpeed; camPosZ += forwardZ * moveSpeed; }
                if (keyState['s']) { camPosX -= forwardX * moveSpeed; camPosY -= forwardY * moveSpeed; camPosZ -= forwardZ * moveSpeed; }
                if (keyState['a']) { camPosX -= rightX * moveSpeed; camPosY -= rightY * moveSpeed; camPosZ -= rightZ * moveSpeed; }
                if (keyState['d']) { camPosX += rightX * moveSpeed; camPosY += rightY * moveSpeed; camPosZ += rightZ * moveSpeed; }
            }

            updateSounds();
            updateSky();
            drawSky();
            renderViewfinder();

            ctx.clearRect(0, 0, width, height);
            // One pass builds every draw list, so each object's parent chain is walked once per frame instead of five
            // times and five intermediate arrays are not produced.
            const prisms = [], balls = [], meshes = [], unions = [], highlights = [];
            for (const [id, o] of Object.entries(sceneObjects)) {
                if (o.type === 'highlight') { highlights.push([id, o]); continue; }
                if (id === pc.hideId || spaceOf(o) !== 'world') continue;
                if (o.type === 'prism6') prisms.push([id, o]);
                else if (o.type === 'ball') balls.push([id, o]);
                else if (o.type === 'wedge' || o.type === 'cylinder') meshes.push([id, o]);
                else if (o.type === 'union') unions.push([id, o]);
            }
            // Without WebGL 2 the flat renderer draws wedges, cylinders and unions as their boxes.
            glDrawCalls = 0;
            const visibleCount = GL ? drawGL(prisms, balls, meshes, unions, highlights) : drawFallback(prisms.concat(meshes, unions), balls);

            // Handles are drawn last so they sit above every shape (only the UI is above them)
            // Model bounding box in 3D
            if (selectedObjectId && sceneObjects[selectedObjectId] && sceneObjects[selectedObjectId].type === 'model') {
                const b = getModelBounds(selectedObjectId);
                if (b) {
                    const verts = getVerts(b);
                    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
                    ctx.save();
                    ctx.lineWidth = 1.5; ctx.strokeStyle = accentCol; ctx.setLineDash([4, 4]);
                    for (const [i1, i2] of edges) {
                        const p1 = project(verts[i1]), p2 = project(verts[i2]);
                        if (p1.z < 0.1 || p2.z < 0.1) continue;
                        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                    }
                    ctx.restore();
                }
            }

            const handleTarget = (selectedObjectId && sceneObjects[selectedObjectId] && sceneObjects[selectedObjectId].type === 'model')
                ? getModelBounds(selectedObjectId)
                : (selectedObjectId ? sceneObjects[selectedObjectId] : null);
            lastHandles = canEditHandles() && handleTarget ? buildHandles(handleTarget) : [];
            if (hoverKey && !lastHandles.some(h => h.key === hoverKey)) hoverKey = null;
            const ordered = lastHandles.slice().sort((a, b) => b.z - a.z);
            ordered.sort((a, b) => (a.key === hoverKey) - (b.key === hoverKey));
            for (const h of ordered) drawHandle(h);

            uiSyncLayer();

            const frameEnd = performance.now();
            frameCount++;
            if (frameEnd - lastFpsTime >= 1000) { currentFps = frameCount; frameCount = 0; lastFpsTime = frameEnd; }
            statFps.textContent = currentFps;
            statFps.dataset.state = currentFps >= 55 ? 'good' : currentFps >= 30 ? 'warn' : 'bad';
            statCpu.textContent = (frameEnd - frameStart).toFixed(2) + " ms";
            if (window.performance && performance.memory) {
                statMem.textContent = (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + " MB";
                statMem.title = 'JavaScript heap in use (performance.memory, Chromium).';
            } else {
                statMem.textContent = "N/A";
                statMem.title = /Firefox/i.test(navigator.userAgent || '')
                    ? 'Firefox does not expose page memory to websites. Open about:memory or the Memory tool in Firefox Developer Tools.'
                    : 'This browser does not expose page memory to websites.';
            }
            const objectCount = Object.values(sceneObjects).filter(o => o && o.type !== 'viewfinder').length;
            const uiCount = Object.values(sceneObjects).filter(o => isUI(o)).length;
            const scriptTotal = Object.values(sceneObjects).filter(o => o && o.type === 'script').length;
            const scriptActive = (typeof scriptTasks !== 'undefined' && Array.isArray(scriptTasks)) ? scriptTasks.length : 0;
            statObjects.textContent = String(objectCount);
            statUI.textContent = String(uiCount);
            statScripts.textContent = scriptActive + ' / ' + scriptTotal;
            statScripts.title = 'Running script instances / script instances in the project';
            statDraws.textContent = GL ? String(glDrawCalls) : 'N/A';
            statSim.textContent = simulationRunning ? 'Live' : 'Edit';
            statSim.dataset.state = simulationRunning ? 'good' : '';
            statVerts.textContent = prisms.length * 8;
            statFaces.textContent = `${visibleCount} / ${prisms.length * 6}`;

            requestAnimationFrame(render);
        }
