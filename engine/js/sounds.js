// Vanilla Engine — synthesised sounds. Loaded in order by index.html; all files share one global scope.
        // ───────── Sounds ─────────
        // Every sound is synthesised, so a world needs no audio files. A sound plays once, or repeats while Looped.
        const SOUND_PRESETS = {
            beep:  { name: 'Beep',  seconds: 0.2, gap: 1.0 },
            chime: { name: 'Chime', seconds: 1.3, gap: 2.0 },
            click: { name: 'Click', seconds: 0.1, gap: 0.6 },
            thud:  { name: 'Thud',  seconds: 0.45, gap: 1.4 },
            siren: { name: 'Siren', seconds: 1.0, gap: 1.0 }
        };
        let audioCtxRef = null;
        const activeSounds = new Map();          // sound id -> { gain, timer }
        function audioContext() {
            if (!audioCtxRef) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                try { audioCtxRef = new AC(); } catch (err) { return null; }
            }
            if (audioCtxRef.state === 'suspended') audioCtxRef.resume();
            return audioCtxRef;
        }
        // One shot of a preset, scheduled at time t on the given destination.
        function soundVoice(preset, ac, out, t) {
            const env = (peak, attack, decay) => {
                const g = ac.createGain();
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(peak, t + attack);
                g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
                g.connect(out);
                return g;
            };
            const osc = (type, from, to, peak, attack, decay) => {
                const o = ac.createOscillator();
                o.type = type;
                o.frequency.setValueAtTime(from, t);
                if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + attack + decay);
                o.connect(env(peak, attack, decay));
                o.start(t); o.stop(t + attack + decay + 0.05);
            };
            if (preset === 'chime') { osc('sine', 880, 880, 0.45, 0.005, 1.2); osc('sine', 1320, 1320, 0.2, 0.005, 0.7); }
            else if (preset === 'click') osc('triangle', 1500, 600, 0.4, 0.001, 0.08);
            else if (preset === 'thud') osc('sine', 150, 45, 0.9, 0.002, 0.4);
            else if (preset === 'siren') { osc('sawtooth', 480, 900, 0.22, 0.05, 0.95); osc('sawtooth', 960, 480, 0.1, 0.05, 0.95); }
            else osc('square', 720, 720, 0.5, 0.005, 0.18);
        }
        // Where a sound is heard from: its parent object, when it is inside one.
        function soundAnchor(h) {
            let o = sceneObjects[h.parent];
            let n = 0;
            while (o && !SPACE_KEYS.includes(o.parent) && !isShape(o) && o.type !== 'model' && n++ < 64) o = sceneObjects[o.parent];
            if (!o) return null;
            if (isShape(o)) return o;
            if (o.type === 'model') { const b = getModelBounds(h.parent); return b ? { x: b.x, y: b.y, z: b.z } : null; }
            return null;
        }
        function soundTargetGain(h) {
            const vol = Math.max(0, Math.min(1, Number.isFinite(h.volume) ? h.volume : 0.6));
            const anchor = soundAnchor(h), maxD = Number.isFinite(h.maxDistance) ? h.maxDistance : 0;
            if (!anchor || maxD <= 0) return vol;
            const d = Math.hypot(camPosX - anchor.x, camPosY - anchor.y, camPosZ - anchor.z);
            return vol * Math.max(0, Math.min(1, 1 - d / maxD));
        }
        function stopSound(id) {
            const a = activeSounds.get(id);
            if (!a) return;
            activeSounds.delete(id);
            if (a.timer) clearTimeout(a.timer);
            try { a.gain.disconnect(); } catch (err) {}
        }
        function startSound(id) {
            const h = sceneObjects[id];
            stopSound(id);
            if (!h || h.type !== 'sound') return;
            const ac = audioContext();
            if (!ac) return;
            const preset = SOUND_PRESETS[h.preset] ? h.preset : 'beep';
            const gain = ac.createGain();
            gain.gain.value = soundTargetGain(h);
            gain.connect(ac.destination);
            const entry = { gain, timer: 0 };
            activeSounds.set(id, entry);
            const fire = () => {
                const now = audioContext();
                if (!now || activeSounds.get(id) !== entry) return;
                soundVoice(preset, now, gain, now.currentTime + 0.01);
                const p = SOUND_PRESETS[preset];
                if (h.looped) entry.timer = setTimeout(fire, Math.max(0.15, p.gap) * 1000);
                else entry.timer = setTimeout(() => {
                    if (activeSounds.get(id) !== entry) return;
                    h.playing = false; stopSound(id);
                    const cb = document.getElementById('prop-sound-playing');
                    if (cb && selectedObjectId === id) cb.checked = false;
                }, p.seconds * 1000);
            };
            fire();
        }
        // Distance fades live as the camera moves, so Max distance works while the sound is playing.
        function updateSounds() {
            for (const [id, a] of activeSounds) {
                const h = sceneObjects[id];
                if (!h || h.type !== 'sound' || !h.playing) { stopSound(id); continue; }
                a.gain.gain.value = soundTargetGain(h);
            }
        }

        function takeSnapshot() {
            simSnapshot = { objects: JSON.parse(JSON.stringify(sceneObjects)), counters: Object.assign({}, counters) };
        }
        function restoreSnapshot() {
            if (!simSnapshot) return;
            for (const k of Object.keys(sceneObjects)) delete sceneObjects[k];
            Object.assign(sceneObjects, JSON.parse(JSON.stringify(simSnapshot.objects)));
            Object.assign(counters, simSnapshot.counters);
            simSnapshot = null;
            if (typeof clearEffectStates === 'function') clearEffectStates();
            physicsVelocity.clear(); ballRot.clear(); ballSpin.clear(); ballContacts.clear();
            manip = null;
            if (selectedObjectId && !sceneObjects[selectedObjectId]) selectedObjectId = null;
            renderExplorer();
            renderProperties();
        }

        function setSimulationRunning(running) {
            if (running === simulationRunning) return;
            // A focused UI input belongs to the run that is ending (or starting), so it never keeps the keyboard.
            if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#ui-layer')) document.activeElement.blur();
            physicsLastTime = 0;
            if (typeof clearEffectStates === 'function') clearEffectStates();
            physicsVelocity.clear(); ballRot.clear(); ballSpin.clear(); ballContacts.clear();
            if (running) {
                takeSnapshot();
                outputLog.length = 0;
                vlRuntime.sharedGlobals = new Map();
                simulationRunning = true;
                // Keep the driven player's parts out of the physics from the very first step, so they never shove what
                // the player is standing on before the controller takes them over.
                const driven = controlledModel();
                playerPartIds = driven && !driven.dead ? new Set(driven.parts) : null;
                startSimulationScripts();
                for (const [id, o] of Object.entries(sceneObjects)) if (o.type === 'sound' && o.playing) startSound(id);
            } else {
                simulationRunning = false;
                playerPartIds = null;
                for (const id of [...activeSounds.keys()]) stopSound(id);
                stopScripts();
                vlRuntime.sharedGlobals = new Map();
                restoreSnapshot();
            }
            updateEditorState();
            renderOutput();
            const btn = document.getElementById('run-btn');
            btn.innerHTML = running
                ? `<span aria-hidden="true" style="font-size:14px;line-height:1">■</span><span class="label">Stop</span>`
                : `${icon('i-play')}<span class="label">Run</span>`;
            btn.title = running ? 'Stop and restore the world to how it was before Run.' : 'Run the simulation.';
            btn.setAttribute('aria-pressed', String(running));
            document.getElementById('canvas-container').classList.toggle('simulating', running);
            document.getElementById('hint-play').hidden = !running;
            if (running && document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); // Space must not press the Stop button
            if (!running) { pc.last = 0; pc.modelId = null; pc.vy = 0; pc.hideId = null; }
        }
        document.getElementById('run-btn').addEventListener('click', () => setSimulationRunning(!simulationRunning));

        // The interface is authored on the server side, in the UI space. When a player joins, that player takes it:
        // the elements move inside the Player in Players (keeping their UIDs, so script references keep working) and
        // are drawn for them. This keeps running every frame, so anything added to the UI space during a run (by the
        // editor or by a script) reaches the player too. Stop restores the snapshot, which puts it all back in UI.
        function takeUIForPlayers() {
            const players = Object.entries(sceneObjects).filter(([, o]) => o.type === 'player')
                .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
            if (!players.length) return;
            const pid = players[0][0];
            let moved = false;
            for (const o of Object.values(sceneObjects)) if (isUI(o) && o.parent === 'ui') { o.parent = pid; moved = true; }
            if (moved) uiDirty = true;
        }

        // Vanillalua is loaded from the shared external interpreter.
        const vlRuntime = VanillaluaShared.createEditorRuntime({
            sceneObjects, physicsVelocity, physicsVelocityFor, spaceOf, preInc, SPACE_KEYS, isShape, isInside,
            GRAVITY_MAX, makePrism, makeBall, makeWedge, makeCylinder, makeSound, makeHighlight, makeLight, makeSimpleEffect, makeAdvancedEffect,
            effectPlay, effectStop, effectEmit, makeUI: (type, spaceId) => makeUI(type, newUIName(type), spaceId),
            makeConnection, CONNECTION_TYPES, makeWorldSettings, defaultHumanStats, dn, counters, newId, pruneOrphans,
            soundChanged: (id, name) => {
                const h = sceneObjects[id];
                if (!h) { stopSound(id); return; }
                if (name !== 'Playing' && name !== 'Looped' && name !== 'Preset') return;   // volume and distance update live
                if (h.playing) startSound(id); else stopSound(id);
            },
            getSelectedObjectId: () => selectedObjectId, setSelectedObjectId: value => { selectedObjectId = value; },
            markUIDirty: () => { uiDirty = true; }, markOutputDirty: () => { outputDirty = true; }
        });
        const { VL_KEYWORDS, VL_SPACES, VL_MODULES, VL_TYPES, VL_GLOBALS, VLParseError, VLError, vlLex, vlParse, vlAnalyze, jsonDiagnostics, SCRIPT_TEMPLATE, newScriptData, makeHuman, HUMAN_DEFAULTS, makePlayerSetup, makePlayerScript, NETWORKING_SOURCE, makeNetworkingScript, ensureScript, computeDiagnostics, VLFn, VLWait, VLModule, VLSpace, VLInst, VLVec, VLScope, vlInstCache, vlSpaces, vlInst, vlObj, vlRound, vlTypeName, vlStr, vlTruthy, VL_PROPS, vlGetProp, vlSetProp, vlGetMember, vlSetMember, vlCreate, vlDeleteInst, vlGetUID, vlSetUID, vlGetUIDFn, vlSetUIDFn, vlScriptingModule, vlInstanceModule, vlVanilla3D, vlVecFrom, vlRootScope, vlEq, vlBinary, vlEval, vlExec, vlMain, scriptTasks, outputLog, logOutput, vlStartTask, vlRunScript, startSimulationScripts, stepScripts, stopScripts } = vlRuntime;
