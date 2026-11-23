// Vanilla Engine — pointer input and boot. Loaded in order by index.html; all files share one global scope.
        // ───────── Pointer interaction ─────────
        function canvasPos(e) {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        }
        function pointInPoly(x, y, pts) {
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const a = pts[i], b = pts[j];
                if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
            }
            return inside;
        }
        function pickInstanceAt(x, y) {
            const r = rayDir(x, y), len = Math.hypot(r.x, r.y, r.z) || 1;
            const d = [r.x / len, r.y / len, r.z / len], o = [camPosX, camPosY, camPosZ];
            let best = null, bestT = Infinity;
            for (const [id, p] of Object.entries(sceneObjects)) {
                if (!isShape(p) || spaceOf(p) !== 'world') continue;
                const R = rotMat(p), rx = o[0] - p.x, ry = o[1] - p.y, rz = o[2] - p.z;
                const lo = [R[0] * rx + R[3] * ry + R[6] * rz, R[1] * rx + R[4] * ry + R[7] * rz, R[2] * rx + R[5] * ry + R[8] * rz];
                const ld = [R[0] * d[0] + R[3] * d[1] + R[6] * d[2], R[1] * d[0] + R[4] * d[1] + R[7] * d[2], R[2] * d[0] + R[5] * d[1] + R[8] * d[2]];
                const hx = [p.width, p.height, p.length];
                if (p.type === 'ball') {
                    const ox = lo[0] / hx[0], oy = lo[1] / hx[1], oz = lo[2] / hx[2], qx = ld[0] / hx[0], qy = ld[1] / hx[1], qz = ld[2] / hx[2];
                    const A = qx * qx + qy * qy + qz * qz, B = 2 * (ox * qx + oy * qy + oz * qz), C = ox * ox + oy * oy + oz * oz - 1, disc = B * B - 4 * A * C;
                    if (disc >= 0) { const sq = Math.sqrt(disc), t1 = (-B - sq) / (2 * A), t2 = (-B + sq) / (2 * A); if (t2 > 0) { const t = Math.max(t1, 0); if (t < bestT) { bestT = t; best = id; } } }
                    continue;
                }
                let tmin = -Infinity, tmax = Infinity, ok = true;
                for (let k = 0; k < 3; k++) {
                    if (Math.abs(ld[k]) < 1e-9) { if (lo[k] < -hx[k] || lo[k] > hx[k]) ok = false; }
                    else {
                        let t1 = (-hx[k] - lo[k]) / ld[k], t2 = (hx[k] - lo[k]) / ld[k];
                        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
                        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
                    }
                }
                if (ok && tmax >= tmin && tmax > 0) { const t = Math.max(tmin, 0); if (t < bestT) { bestT = t; best = id; } }
            }
            // Lights have no surface to hit, so they are picked by their marker on screen.
            for (const [id, p] of Object.entries(sceneObjects)) {
                if (p.type !== 'light' || spaceOf(p) !== 'world') continue;
                const s = project(new Vec3(p.x, p.y, p.z));
                if (s.z > 0.1 && Math.hypot(x - s.x, y - s.y) <= 14 && s.z < bestT) { bestT = s.z; best = id; }
            }
            return best ? { id: best, t: bestT } : null;
        }
        function pickInstance(x, y) { const hit = pickInstanceAt(x, y); return hit ? hit.id : null; }

        // Angle of the mouse around a rotate ring, measured in the ring's plane (null when the ring is edge-on)
        function ringAngle(h, m) {
            const dv = rayDir(m.x, m.y), len = Math.hypot(dv.x, dv.y, dv.z) || 1, dir = [dv.x / len, dv.y / len, dv.z / len];
            const dn = h.n[0] * dir[0] + h.n[1] * dir[1] + h.n[2] * dir[2];
            if (Math.abs(dn) < 0.08) return null;
            const cam = [camPosX, camPosY, camPosZ];
            const t = (h.n[0] * (h.center[0] - cam[0]) + h.n[1] * (h.center[1] - cam[1]) + h.n[2] * (h.center[2] - cam[2])) / dn;
            if (t <= 0) return null;
            const p = [cam[0] + dir[0] * t - h.center[0], cam[1] + dir[1] * t - h.center[1], cam[2] + dir[2] * t - h.center[2]];
            return Math.atan2(p[0] * h.v[0] + p[1] * h.v[1] + p[2] * h.v[2], p[0] * h.u[0] + p[1] * h.u[1] + p[2] * h.u[2]);
        }
        function startManip(h, m) {
            const o = sceneObjects[selectedObjectId];
            if (h.type === 'rotate') {
                const a0 = ringAngle(h, m);
                if (a0 === null || !o) return;
                const key = { x: 'rotX', y: 'rotY', z: 'rotZ' }[h.axis];
                manip = { h, o, isModel: false, rotate: true, key, prev: a0, acc: 0, startVal: o[key] || 0 };
                canvas.style.cursor = 'grabbing';
                return;
            }
            const isModel = o && o.type === 'model';
            const t0 = axisParam(h.center, h.d, m.x, m.y);
            if (t0 === null) return;
            if (isModel) {
                const bounds = getModelBounds(selectedObjectId);
                if (!bounds) return;
                const prisms = getModelPrisms(selectedObjectId);
                const startPrisms = {};
                for (const [id, p] of prisms) {
                    startPrisms[id] = { x: p.x, y: p.y, z: p.z, width: p.width, height: p.height, length: p.length };
                }
                manip = { h, o, isModel: true, t0, startBounds: bounds, startPrisms };
            } else {
                manip = { h, o, isModel: false, t0, start: { x: o.x, y: o.y, z: o.z, width: o.width, height: o.height, length: o.length } };
            }
            canvas.style.cursor = 'grabbing';
        }
        function updateManip(m) {
            if (manip.rotate) {
                const a = ringAngle(manip.h, m);
                if (a === null) return;
                let dl = a - manip.prev;
                while (dl > Math.PI) dl -= 2 * Math.PI;
                while (dl < -Math.PI) dl += 2 * Math.PI;
                manip.acc += dl; manip.prev = a;
                let val = manip.startVal + manip.acc * 180 / Math.PI;
                const step = settings.rotOffset;
                if (step > 0) val = Math.round(val / step) * step;
                val = ((val + 180) % 360 + 360) % 360 - 180;
                manip.o[manip.key] = Math.round(val * 1000) / 1000;
                syncPropInputs();
                return;
            }
            const t = axisParam(manip.h.center, manip.h.d, m.x, m.y);
            if (t === null) return;
            let delta = Math.max(-500, Math.min(500, t - manip.t0));
            const step = settings.gizmoOffset;
            if (step > 0) delta = Math.round(delta / step) * step;
            const { o, h, isModel } = manip;
            const r2 = (v) => Math.round(v * 10000) / 10000;

            if (isModel) {
                const { startBounds, startPrisms } = manip;
                const half = HALF_KEY[h.axis];
                if (h.type === 'move') {
                    const moveDelta = h.sign * delta;
                    for (const [id, s] of Object.entries(startPrisms)) {
                        const p = sceneObjects[id]; if (!p) continue;
                        p[h.axis] = r2(s[h.axis] + moveDelta);
                        if (physicsVelocity.has(id)) physicsVelocity.set(id, { x: 0, y: 0, z: 0 });
                    }
                } else {
                    const startTotal = startBounds[half] * 2;
                    const grow = Math.max(delta, -(startTotal - 0.05));
                    const newTotal = startTotal + grow;
                    const scaleFactor = newTotal / startTotal;
                    const fixedEdge = startBounds[h.axis] - h.sign * startBounds[half];

                    for (const [id, s] of Object.entries(startPrisms)) {
                        const p = sceneObjects[id]; if (!p) continue;
                        p[half] = r2(Math.max(0.025, s[half] * scaleFactor));
                        p[h.axis] = r2(fixedEdge + (s[h.axis] - fixedEdge) * scaleFactor);
                        if (physicsVelocity.has(id)) physicsVelocity.set(id, { x: 0, y: 0, z: 0 });
                    }
                }
                return;
            }

            const { start } = manip;
            if (h.type === 'move') {
                o[h.axis] = r2(start[h.axis] + h.sign * delta);
            } else {
                const half = HALF_KEY[h.axis];
                const grow = Math.max(delta, -(2 * start[half] - 0.1));
                o[half] = r2(start[half] + grow / 2);
                o.x = r2(start.x + h.d.x * grow / 2); o.y = r2(start.y + h.d.y * grow / 2); o.z = r2(start.z + h.d.z * grow / 2);
            }
            syncPropInputs();
        }

        // Turn the view in place: left/right = yaw, up/down = pitch (no momentum; free look, horizon always level)
        function look(dx, dy) {
            const k = LOOK_SENS * settings.lookSens;
            angleY += dx * k;
            angleX = clampPitch(angleX - dy * k * (settings.invertY ? -1 : 1));
        }

        canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0 && e.button !== 2) return;
            if (e.button === 2 && !settings.rightClick) return;
            if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            const m = canvasPos(e);
            if (e.button === 0) {
                if (uiMouseDown(m)) return;
                const h = findHandleAt(m.x, m.y);
                if (h) { startManip(h, m); if (manip) return; }
            }
            camDrag = {
                button: e.button, sx: e.clientX, sy: e.clientY, px: e.clientX, py: e.clientY, moved: false,
                rotate: e.button === 2 || settings.leftDrag
            };
        });
        canvas.addEventListener('contextmenu', (e) => { if (settings.rightClick) e.preventDefault(); });
        window.addEventListener('mousemove', (e) => {
            const m = canvasPos(e);
            if (uiDragging) { uiUpdateDrag(m); return; }
            if (manip) { updateManip(m); return; }
            if (camDrag) {
                if (!camDrag.moved && Math.hypot(e.clientX - camDrag.sx, e.clientY - camDrag.sy) > 4) {
                    camDrag.moved = true;
                    camDrag.px = camDrag.sx; camDrag.py = camDrag.sy;
                }
                if (camDrag.moved && camDrag.rotate) {
                    look(e.clientX - camDrag.px, e.clientY - camDrag.py);
                    camDrag.px = e.clientX; camDrag.py = e.clientY;
                }
                return;
            }
            if (e.target === canvas && !simulationRunning) {
                const containers = uiContainers();
                if (containers.length) {
                    const uh = findUIHandleAt(m.x, m.y);
                    const hit = uh ? null : uiPickAt(m.x, m.y, containers);
                    if (uh || hit) {
                        hoverKey = null;
                        canvas.style.cursor = uh ? UI_CURSOR[uh.corner.x + ',' + uh.corner.y] : mode === 'move' ? 'move' : 'pointer';
                        return;
                    }
                }
            }
            const h = e.target === canvas ? findHandleAt(m.x, m.y) : null;
            hoverKey = h ? h.key : null;
            canvas.style.cursor = h ? 'pointer' : '';
        });
        window.addEventListener('mouseup', (e) => {
            if (uiDragging) { uiDragging = null; uiGuides = []; canvas.style.cursor = ''; return; }
            if (manip) { manip = null; canvas.style.cursor = ''; return; }
            if (camDrag && e.button === camDrag.button) {
                if (!camDrag.moved && camDrag.button === 0) {
                    const m = canvasPos(e);
                    const clickedId = pickInstance(m.x, m.y);
                    let toSelect = clickedId;
                    if (clickedId && !e.altKey) {
                        const top = topModelOf(clickedId);
                        if (top && selectedObjectId !== top) toSelect = top;
                    }
                    // Clicking empty space while working on the interface returns to the whole UI preview instead of
                    // hiding it, so the screen does not disappear from under the editor.
                    if (!toSelect && (selectedSpaceId === 'ui' || isUI(sceneObjects[selectedObjectId]))) {
                        selectedObjectId = null; selectedSpaceId = 'ui'; multiSel.clear();
                        renderExplorer(); renderProperties(); applyModeHint();
                    } else if (toSelect !== selectedObjectId) selectItem(toSelect);
                }
                camDrag = null;
            }
        });
        canvas.addEventListener('mouseleave', () => { if (!manip && !uiDragging) { hoverKey = null; canvas.style.cursor = ''; } });

        // ───────── Boot ─────────
        const PLAY_MODE = new URLSearchParams(location.search).get('play') === '1';
        function installPlayMode() {
            document.body.classList.add('play-mode');
            document.title = 'Vanilla Player';
            const raw = localStorage.getItem('vanilla-player-world-v1');
            if (!raw) { toast('No world was imported. Open the Player page and choose a world.', 'bad'); return false; }
            try {
                const data = validateWorldFile(JSON.parse(raw));
                applyWorldFile(data);
            } catch (err) {
                toast('The imported world could not be opened: ' + err.message, 'bad');
                return false;
            }
            closeModals();
            const menu = document.getElementById('play-menu');
            const showMenu = (show) => { menu.hidden = !show; if (show) document.getElementById('play-resume').focus(); };
            document.getElementById('play-resume').addEventListener('click', () => showMenu(false));
            document.getElementById('play-leave').addEventListener('click', () => { location.href = '../player/'; });
            window.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                e.preventDefault(); e.stopImmediatePropagation();
                showMenu(menu.hidden);
            }, true);
            return true;
        }
        initGL();
        applySettings();
        // A new world starts with the DefaultPlayer model in Storage and the PlayerManagement script.
        for (const [id, o] of makePlayerSetup(newId)) sceneObjects[id] = o;
        bootRestore();
        if (PLAY_MODE) installPlayMode();
        // The autosave baseline is the world as it is now, so an untouched world is never written over your save.
        try { autosaveBase = JSON.stringify(buildWorldFile()); } catch (e) { autosaveBase = ''; }
        refreshTheme();
        renderVersionHistory();
        if (!PLAY_MODE) maybeShowWhatsNew();
        renderExplorer();
        renderProperties();
        setMode('select');
        requestAnimationFrame(render);
        if (PLAY_MODE) setSimulationRunning(true);
    // Replace the embedded language-reference section with the canonical shared docs.
  if (window.VanillaluaShared) {
    const article = document.getElementById('docs-article');
    if (article) {
      const firstLanguageHeading = article.querySelector('h3[data-group="Vanillalua language"]');
      if (firstLanguageHeading) {
        let node = firstLanguageHeading;
        while (node) { const next = node.nextSibling; node.remove(); node = next; }
        const shared = document.createElement('div');
        window.VanillaluaShared.renderDocs(shared);
        const sharedArticle = shared.querySelector('.docs-article');
        if (sharedArticle) {
          const intro = sharedArticle.querySelector('p');
          if (intro) intro.remove();
          while (sharedArticle.firstChild) article.appendChild(sharedArticle.firstChild);
        }
      }
    }
  }
