// Vanilla Engine — synthesised sounds. Loaded in order by index.html; all files share one global scope.
        // ───────── Sounds ─────────
        // Built-in sounds are synthesised, so a world needs no audio files; a Sound can also play an uploaded asset.
        // A sound plays once, or repeats while Looped.
        const SOUND_PRESETS = {
            beep:  { name: 'Beep',  seconds: 0.2, gap: 1.0 },
            chime: { name: 'Chime', seconds: 1.3, gap: 2.0 },
            click: { name: 'Click', seconds: 0.1, gap: 0.6 },
            thud:  { name: 'Thud',  seconds: 0.45, gap: 1.4 },
            siren: { name: 'Siren', seconds: 1.0, gap: 1.0 }
        };
        const AUDIO_MAX_VOICES = 24;
        let audioCtxRef = null, audioMaster = null, audioComp = null;
        const activeSounds = new Map();          // sound id -> { gain, panner, timer, sourceNode, ... }
        const audioBuffers = new Map();          // asset URL -> { status, buffer }
        const audioNoiseCache = new Map();
        const audioVoices = [];                  // one-shot event voices, for the concurrency cap
        const audioImpactCooldown = new Map();
        let audioWind = null;
        const audioPlayerTrack = { x: 0, y: 0, z: 0, step: 0, vy: 0, ground: false, dead: false, moving: false };
        function audioContext() {
            if (!audioCtxRef) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                try { audioCtxRef = new AC(); } catch (err) { return null; }
            }
            if (!audioMaster) {
                try {
                    audioMaster = audioCtxRef.createGain();
                    audioComp = audioCtxRef.createDynamicsCompressor();
                    audioComp.threshold.value = -18; audioComp.knee.value = 20; audioComp.ratio.value = 4; audioComp.attack.value = 0.003; audioComp.release.value = 0.2;
                    audioMaster.gain.value = audioMasterVolume();
                    audioMaster.connect(audioComp); audioComp.connect(audioCtxRef.destination);
                } catch (err) { audioMaster = null; }
            }
            if (audioCtxRef.state === 'suspended') audioCtxRef.resume();
            return audioCtxRef;
        }
        function audioMasterVolume() {
            const ws = typeof activeWorldSettings === 'function' ? activeWorldSettings() : null;
            const a = ws && ws.audio && typeof ws.audio === 'object' ? ws.audio : null;
            return Math.max(0, Math.min(1, a && Number.isFinite(+a.master) ? +a.master : 0.8));
        }
        function audioUpdateMaster() { if (audioMaster) audioMaster.gain.value = audioMasterVolume(); }
        function audioUpdateListener() {
            if (!audioCtxRef) return;
            const l = audioCtxRef.listener;
            const fx = typeof fwdX === 'number' ? fwdX : 0, fy = typeof fwdY === 'number' ? fwdY : 0, fz = typeof fwdZ === 'number' ? fwdZ : -1;
            const ux = typeof upX === 'number' ? upX : 0, uy = typeof upY === 'number' ? upY : 1, uz = typeof upZ === 'number' ? upZ : 0;
            if (l.positionX) {
                l.positionX.value = camPosX; l.positionY.value = camPosY; l.positionZ.value = camPosZ;
                l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
                l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
            } else {
                try { l.setPosition(camPosX, camPosY, camPosZ); l.setOrientation(fx, fy, fz, ux, uy, uz); } catch (err) {}
            }
        }
        // One shot of a preset, scheduled at time t on the given destination.
        function soundVoice(preset, ac, out, t, pitch = 1) {
            const rate = Number.isFinite(+pitch) ? Math.max(0.25, Math.min(4, +pitch)) : 1;
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
            if (preset === 'chime') { osc('sine', 880 * rate, 880 * rate, 0.45, 0.005, 1.2); osc('sine', 1320 * rate, 1320 * rate, 0.2, 0.005, 0.7); }
            else if (preset === 'click') osc('triangle', 1500 * rate, 600 * rate, 0.4, 0.001, 0.08);
            else if (preset === 'thud') osc('sine', 150 * rate, 45 * rate, 0.9, 0.002, 0.4);
            else if (preset === 'siren') { osc('sawtooth', 480 * rate, 900 * rate, 0.22, 0.05, 0.95); osc('sawtooth', 960 * rate, 480 * rate, 0.1, 0.05, 0.95); }
            else osc('square', 720 * rate, 720 * rate, 0.5, 0.005, 0.18);
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
            if (!anchor || maxD <= 0 || h.spatial === false || h.rolloff <= 0) return vol;
            const d = Math.hypot(camPosX - anchor.x, camPosY - anchor.y, camPosZ - anchor.z);
            return vol * Math.max(0, Math.min(1, 1 - d / maxD));
        }
        // A Sound remembers its source as preset:<id> or asset:<world asset name>, so changing the preset list later
        // can never silently change an uploaded sound. Old worlds only have preset, which is upgraded in place.
        function normalizeSound(h) {
            if (!h || h.type !== 'sound') return h;
            if (!SOUND_PRESETS[h.preset]) h.preset = 'beep';
            let source = typeof h.source === 'string' ? h.source.trim() : '';
            if (!/^(preset|asset):/i.test(source)) {
                source = SOUND_PRESETS[source] ? 'preset:' + source : (h.preset ? 'preset:' + h.preset : 'preset:beep');
            }
            const preset = source.replace(/^preset:/i, '');
            if (/^preset:/i.test(source) && SOUND_PRESETS[preset]) { h.preset = preset; h.source = 'preset:' + preset; }
            else if (/^asset:/i.test(source)) h.source = source;
            else { h.preset = 'beep'; h.source = 'preset:beep'; }
            h.playing = !!h.playing;
            h.looped = !!h.looped;
            h.volume = Math.max(0, Math.min(1, Number.isFinite(+h.volume) ? +h.volume : 0.6));
            h.pitch = Math.max(0.25, Math.min(4, Number.isFinite(+h.pitch) ? +h.pitch : 1));
            h.spatial = h.spatial !== false;
            h.rolloff = Math.max(0, Math.min(4, Number.isFinite(+h.rolloff) ? +h.rolloff : 1));
            h.maxDistance = Math.max(0, Math.min(10000, Number.isFinite(+h.maxDistance) ? +h.maxDistance : 20));
            return h;
        }
        function soundSourceOf(h) { normalizeSound(h); return h && h.source ? h.source : 'preset:beep'; }
        function audioAssetFor(source) {
            const raw = String(source || '').replace(/^asset:/i, '').trim();
            if (!raw) return null;
            const ws = typeof activeWorldSettings === 'function' ? activeWorldSettings() : null;
            const assets = ws && Array.isArray(ws.assets) ? ws.assets : [];
            const hit = /^\d+$/.test(raw) ? assets[+raw] : assets.find(a => a && a.name === raw);
            return hit && hit.url ? hit : null;
        }
        function soundSourceLabel(source) {
            const raw = String(source || '');
            if (/^preset:/i.test(raw)) { const p = SOUND_PRESETS[raw.replace(/^preset:/i, '')]; return p ? p.name : 'Beep'; }
            if (/^asset:/i.test(raw)) { const a = audioAssetFor(raw); return a ? a.name : raw.replace(/^asset:/i, ''); }
            return raw || 'Beep';
        }
        function soundSourceOptions(selected) {
            const out = Object.keys(SOUND_PRESETS).map(k => ({ value: 'preset:' + k, label: SOUND_PRESETS[k].name }));
            const ws = typeof activeWorldSettings === 'function' ? activeWorldSettings() : null;
            for (const a of (ws && Array.isArray(ws.assets) ? ws.assets : [])) {
                if (!a || !a.name || !a.url) continue;
                const audio = /^audio\//i.test(a.type || '') || /^data:audio\//i.test(a.url || '');
                if (audio) out.push({ value: 'asset:' + a.name, label: 'Asset · ' + a.name });
            }
            if (selected && !out.some(o => o.value === selected)) out.push({ value: selected, label: 'Missing · ' + soundSourceLabel(selected) });
            return out;
        }
        function audioSetPanner(panner, x, y, z) {
            if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; }
            else try { panner.setPosition(x, y, z); } catch (err) {}
        }
        function audioPannerFor(h, ac) {
            if (h.spatial === false) return null;
            const anchor = soundAnchor(h);
            if (!anchor) return null;
            const p = ac.createPanner();
            p.panningModel = 'HRTF';
            p.distanceModel = 'inverse';
            p.refDistance = 1;
            p.rolloffFactor = h.rolloff;
            p.maxDistance = Math.max(1, h.maxDistance || 10000);
            audioSetPanner(p, anchor.x, anchor.y, anchor.z);
            return p;
        }
        function audioSourceBuffer(url) {
            const ac = audioContext();
            if (!ac || !url) return Promise.resolve(null);
            let item = audioBuffers.get(url);
            if (item) {
                if (item.status === 'ready') return Promise.resolve(item.buffer);
                if (item.status === 'failed') return Promise.resolve(null);
                return item.promise;
            }
            item = { status: 'loading', buffer: null, promise: null };
            audioBuffers.set(url, item);
            item.promise = fetch(url).then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.arrayBuffer();
            }).then(buf => new Promise((resolve, reject) => ac.decodeAudioData(buf, resolve, reject)))
                .then(buffer => { item.status = 'ready'; item.buffer = buffer; return buffer; })
                .catch(() => { item.status = 'failed'; return null; });
            return item.promise;
        }
        // A long uploaded loop is crossfaded rather than relying on the buffer's seam: a second source starts just
        // before the first ends, and the two gains swap over a short overlap. Short buffers fall back to the native
        // loop, and stopSound tears down every source and timer together.
        function audioStartAssetLoop(ac, buffer, dest, entry, pitch) {
            const rate = Math.max(0.25, Math.min(4, pitch || 1));
            const duration = buffer.duration / rate;
            if (!(duration > 0.08)) {
                const src = ac.createBufferSource();
                src.buffer = buffer; src.playbackRate.value = rate; src.loop = true;
                src.connect(dest); entry.sourceNode = src; src.start();
                return;
            }
            const fade = Math.min(0.28, Math.max(0.02, duration * 0.18));
            const interval = Math.max(0.05, duration - fade);
            const sources = [];
            const spawn = (first) => {
                if (entry.dead || activeSounds.get(entry.id) !== entry) return;
                const now = ac.currentTime + 0.005;
                const src = ac.createBufferSource();
                src.buffer = buffer; src.playbackRate.value = rate;
                const g = ac.createGain();
                g.gain.setValueAtTime(first ? 1 : 0, now);
                if (!first) g.gain.linearRampToValueAtTime(1, now + fade);
                src.connect(g); g.connect(dest);
                src.start(now);
                sources.push({ src, g });
                if (!first) {
                    for (const old of sources.slice(0, -1)) {
                        try {
                            old.g.gain.cancelScheduledValues(now);
                            old.g.gain.setValueAtTime(old.g.gain.value, now);
                            old.g.gain.linearRampToValueAtTime(0.0001, now + fade);
                        } catch (err) {}
                    }
                    setTimeout(() => {
                        for (const old of sources.splice(0, Math.max(0, sources.length - 1))) {
                            try { old.src.stop(); old.g.disconnect(); } catch (err) {}
                        }
                    }, fade * 1000 + 60);
                }
            };
            spawn(true);
            entry.assetSources = sources;
            entry.loopTimer = setInterval(() => spawn(false), interval * 1000);
        }
        function stopSound(id) {
            const a = activeSounds.get(id);
            if (!a) return;
            activeSounds.delete(id);
            a.dead = true;
            if (a.timer) clearTimeout(a.timer);
            if (a.loopTimer) clearInterval(a.loopTimer);
            if (a.assetSources) for (const old of a.assetSources) { try { old.src.stop(); old.g.disconnect(); } catch (err) {} }
            try { if (a.sourceNode && a.sourceNode.stop) a.sourceNode.stop(); } catch (err) {}
            try {
                const now = a.ac ? a.ac.currentTime : 0;
                if (a.gain) { a.gain.gain.cancelScheduledValues(now); a.gain.gain.setTargetAtTime(0.0001, now, 0.035); }
            } catch (err) {}
            setTimeout(() => { try { a.gain && a.gain.disconnect(); a.panner && a.panner.disconnect(); } catch (err) {} }, 120);
        }
        function finishSound(id, entry, h) {
            if (activeSounds.get(id) !== entry) return;
            h.playing = false;
            stopSound(id);
            const cb = document.getElementById('prop-sound-playing');
            if (cb && selectedObjectId === id) cb.checked = false;
        }
        function startSound(id) {
            const h = sceneObjects[id];
            stopSound(id);
            if (!h || h.type !== 'sound') return;
            normalizeSound(h);
            const ac = audioContext();
            if (!ac) return;
            const dest = audioMaster || ac.destination;
            const gain = ac.createGain();
            gain.gain.value = 0.0001;
            const panner = audioPannerFor(h, ac);
            if (panner) { gain.connect(panner); panner.connect(dest); } else gain.connect(dest);
            const entry = { id, ac, gain, panner, timer: 0, loopTimer: 0, assetSources: null, sourceNode: null, dead: false };
            activeSounds.set(id, entry);
            try { gain.gain.setTargetAtTime(soundTargetGain(h), ac.currentTime, 0.025); } catch (err) { gain.gain.value = soundTargetGain(h); }
            const source = soundSourceOf(h);
            if (/^preset:/i.test(source)) {
                const preset = source.replace(/^preset:/i, '');
                const fire = () => {
                    if (activeSounds.get(id) !== entry || entry.dead) return;
                    soundVoice(preset, ac, gain, ac.currentTime + 0.01, h.pitch);
                    const p = SOUND_PRESETS[preset] || SOUND_PRESETS.beep;
                    if (h.looped) entry.timer = setTimeout(fire, Math.max(0.15, p.gap) * 1000);
                    else entry.timer = setTimeout(() => finishSound(id, entry, h), p.seconds * 1000 + 40);
                };
                fire();
                return;
            }
            const asset = audioAssetFor(source);
            if (!asset) { finishSound(id, entry, h); return; }
            audioSourceBuffer(asset.url).then(buffer => {
                if (!buffer || activeSounds.get(id) !== entry || entry.dead) { finishSound(id, entry, h); return; }
                if (h.looped) { audioStartAssetLoop(ac, buffer, gain, entry, h.pitch); return; }
                const src = ac.createBufferSource();
                src.buffer = buffer;
                src.playbackRate.value = h.pitch;
                src.connect(gain);
                entry.sourceNode = src;
                src.onended = () => finishSound(id, entry, h);
                src.start();
            });
        }
        // Listener and live distances follow the camera, so moving the view or a parent object changes the sound.
        function updateSounds() {
            audioUpdateListener();
            audioUpdateMaster();
            for (const [id, a] of activeSounds) {
                const h = sceneObjects[id];
                if (!h || h.type !== 'sound' || !h.playing) { stopSound(id); continue; }
                if (a.panner) {
                    const anchor = soundAnchor(h);
                    if (anchor) audioSetPanner(a.panner, anchor.x, anchor.y, anchor.z);
                }
                if (a.gain) a.gain.gain.value = soundTargetGain(h);
            }
        }

        // ───────── Engine event audio ─────────
        // Footsteps, impacts, air and death are procedural by default, so a world needs no files. A custom preset or
        // uploaded asset can replace any of them in World Settings → Audio. Event sources are panned in 3D.
        const AUDIO_STEP_PROFILES = {
            grass:   { type: 'noise', filter: 'bandpass', freq: 900,  q: 0.8, gain: 0.16, dur: 0.11, tone: 0 },
            carpet:  { type: 'noise', filter: 'lowpass',  freq: 520,  q: 0.5, gain: 0.14, dur: 0.09, tone: 0 },
            wood:    { type: 'noise', filter: 'bandpass', freq: 620,  q: 1.0, gain: 0.17, dur: 0.10, tone: 170 },
            brick:   { type: 'noise', filter: 'bandpass', freq: 1000, q: 0.9, gain: 0.15, dur: 0.09, tone: 0 },
            concrete:{ type: 'noise', filter: 'lowpass',  freq: 780,  q: 0.7, gain: 0.17, dur: 0.10, tone: 0 },
            tile:    { type: 'noise', filter: 'highpass', freq: 1400, q: 0.7, gain: 0.15, dur: 0.08, tone: 0 },
            metal:   { type: 'noise', filter: 'bandpass', freq: 1800, q: 1.4, gain: 0.14, dur: 0.12, tone: 420 },
            glass:   { type: 'noise', filter: 'highpass', freq: 2300, q: 1.2, gain: 0.13, dur: 0.08, tone: 780 },
            neon:    { type: 'noise', filter: 'bandpass', freq: 1300, q: 1.1, gain: 0.13, dur: 0.08, tone: 540 },
            plastic: { type: 'noise', filter: 'bandpass', freq: 820,  q: 0.8, gain: 0.15, dur: 0.10, tone: 0 }
        };
        function audioNoiseBuffer(ac, seconds = 0.5) {
            const key = Math.round(seconds * 100) + ':' + ac.sampleRate;
            let b = audioNoiseCache.get(key);
            if (b) return b;
            const n = Math.max(1, Math.floor(ac.sampleRate * seconds));
            b = ac.createBuffer(1, n, ac.sampleRate);
            const data = b.getChannelData(0);
            for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
            audioNoiseCache.set(key, b);
            return b;
        }
        function audioEventOutput(x, y, z) {
            const ac = audioContext();
            if (!ac || !audioMaster) return null;
            const gain = ac.createGain();
            const panner = ac.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 1;
            panner.rolloffFactor = 1;
            panner.maxDistance = 80;
            audioSetPanner(panner, Number.isFinite(x) ? x : camPosX, Number.isFinite(y) ? y : camPosY, Number.isFinite(z) ? z : camPosZ);
            gain.connect(panner); panner.connect(audioMaster);
            return { ac, gain, panner };
        }
        function audioTrackVoice(output, duration) {
            const voice = { dead: false };
            voice.stop = () => {
                if (voice.dead) return;
                voice.dead = true;
                try { if (output && output.gain) output.gain.gain.setTargetAtTime(0.0001, output.ac.currentTime, 0.02); } catch (err) {}
                setTimeout(() => { try { output && output.gain && output.gain.disconnect(); output && output.panner && output.panner.disconnect(); } catch (err) {} }, 80);
            };
            audioVoices.push(voice);
            if (audioVoices.length > AUDIO_MAX_VOICES) {
                const oldest = audioVoices.find(v => !v.dead && v !== voice);
                if (oldest) oldest.stop();
            }
            setTimeout(() => { voice.dead = true; const i = audioVoices.indexOf(voice); if (i >= 0) audioVoices.splice(i, 1); }, Math.max(80, duration * 1000 + 120));
            return voice;
        }
        function audioNoiseBurst(ac, out, profile, volume, pitch) {
            const src = ac.createBufferSource();
            src.buffer = audioNoiseBuffer(ac, 0.7);
            src.playbackRate.value = Math.max(0.3, Math.min(3, pitch || 1));
            const filter = ac.createBiquadFilter();
            filter.type = profile.filter;
            filter.frequency.value = profile.freq * Math.max(0.5, Math.min(2, pitch || 1));
            filter.Q.value = profile.q;
            const env = ac.createGain();
            const now = ac.currentTime + 0.01, peak = Math.max(0.0002, volume * profile.gain);
            env.gain.setValueAtTime(0.0001, now);
            env.gain.linearRampToValueAtTime(peak, now + 0.008);
            env.gain.exponentialRampToValueAtTime(0.0001, now + profile.dur);
            src.connect(filter); filter.connect(env); env.connect(out);
            src.start(now); src.stop(now + profile.dur + 0.04);
            if (profile.tone > 0) {
                const osc = ac.createOscillator(); osc.type = 'sine';
                osc.frequency.setValueAtTime(profile.tone * pitch, now);
                osc.frequency.exponentialRampToValueAtTime(Math.max(30, profile.tone * 0.4 * pitch), now + profile.dur * 1.4);
                const tg = ac.createGain(); tg.gain.setValueAtTime(0.0001, now); tg.gain.linearRampToValueAtTime(peak * 0.75, now + 0.006); tg.gain.exponentialRampToValueAtTime(0.0001, now + profile.dur * 1.5);
                osc.connect(tg); tg.connect(out); osc.start(now); osc.stop(now + profile.dur * 1.6);
            }
        }
        function audioPlayEventSource(source, x, y, z, volume = 1, pitch = 1) {
            if (!source || source === 'none') return;
            const output = audioEventOutput(x, y, z);
            if (!output) return;
            if (/^preset:/i.test(source)) {
                const preset = source.replace(/^preset:/i, '');
                const p = SOUND_PRESETS[preset] || SOUND_PRESETS.beep;
                soundVoice(preset, output.ac, output.gain, output.ac.currentTime + 0.01, pitch);
                audioTrackVoice(output, p.seconds);
                return;
            }
            const asset = audioAssetFor(source);
            if (!asset) { try { output.gain.disconnect(); output.panner.disconnect(); } catch (err) {} return; }
            audioSourceBuffer(asset.url).then(buffer => {
                if (!buffer) { try { output.gain.disconnect(); output.panner.disconnect(); } catch (err) {} return; }
                const src = output.ac.createBufferSource();
                src.buffer = buffer; src.playbackRate.value = pitch; src.connect(output.gain);
                audioTrackVoice(output, Math.min(20, buffer.duration / Math.max(0.25, pitch)));
                src.start();
            });
        }
        function audioFootstep(material, volume, pitch) {
            const ws = activeWorldSettings(), source = ws && ws.audio ? ws.audio.footsteps : 'procedural';
            if (source === 'none') return;
            if (source !== 'procedural') { audioPlayEventSource(source, pc.pos.x, pc.pos.y + 0.1, pc.pos.z, volume, pitch); return; }
            const ac = audioContext(); if (!ac || !audioMaster) return;
            const profile = AUDIO_STEP_PROFILES[material] || AUDIO_STEP_PROFILES.plastic;
            const output = audioEventOutput(pc.pos.x, pc.pos.y + 0.05, pc.pos.z);
            if (!output) return;
            audioNoiseBurst(output.ac, output.gain, profile, volume, pitch * (0.9 + Math.random() * 0.2));
            audioTrackVoice(output, profile.dur * 1.6);
        }
        function audioImpact(speed, idA, idB, a, b) {
            if (!simulationRunning || !(speed > 2.2)) return;
            const ws = activeWorldSettings(), source = ws && ws.audio ? ws.audio.impacts : 'procedural';
            if (source === 'none') return;
            const now = performance.now(), key = idA < idB ? idA + '|' + idB : idB + '|' + idA;
            if (now - (audioImpactCooldown.get(key) || 0) < 110) return;
            audioImpactCooldown.set(key, now);
            if (audioImpactCooldown.size > 128) for (const [k, t] of audioImpactCooldown) if (now - t > 2000) audioImpactCooldown.delete(k);
            const x = ((a.x || 0) + (b.x || 0)) / 2, y = ((a.y || 0) + (b.y || 0)) / 2, z = ((a.z || 0) + (b.z || 0)) / 2;
            const volume = Math.max(0.08, Math.min(0.9, (speed - 1.5) / 14));
            if (source !== 'procedural') { audioPlayEventSource(source, x, y, z, volume, 1); return; }
            const ac = audioContext(); if (!ac || !audioMaster) return;
            const output = audioEventOutput(x, y, z); if (!output) return;
            const ma = typeof materialKey === 'function' ? materialKey(a) : 'plastic';
            const mb = typeof materialKey === 'function' ? materialKey(b) : 'plastic';
            const hard = ['metal', 'glass', 'tile'].includes(ma) || ['metal', 'glass', 'tile'].includes(mb);
            const soft = ['carpet', 'grass'].includes(ma) && ['carpet', 'grass'].includes(mb);
            const profile = hard
                ? { type: 'noise', filter: 'bandpass', freq: 1700, q: 1.2, gain: 0.42, dur: 0.18, tone: 320 }
                : soft
                    ? { type: 'noise', filter: 'lowpass', freq: 420, q: 0.4, gain: 0.3, dur: 0.12, tone: 80 }
                    : { type: 'noise', filter: 'lowpass', freq: 760, q: 0.7, gain: 0.38, dur: 0.16, tone: 120 };
            audioNoiseBurst(output.ac, output.gain, profile, volume, 0.85 + Math.random() * 0.25);
            audioTrackVoice(output, profile.dur * 1.8);
        }
        function audioPlayerDeath() {
            if (!simulationRunning || audioPlayerTrack.dead) return;
            audioPlayerTrack.dead = true;   // the death event and the player step can both notice it; play it once
            const ws = activeWorldSettings(), source = ws && ws.audio ? ws.audio.death : 'procedural';
            if (source === 'none') return;
            const x = pc.pos.x, y = pc.pos.y + 1.2, z = pc.pos.z;
            if (source !== 'procedural') { audioPlayEventSource(source, x, y, z, 0.9, 1); return; }
            const ac = audioContext(); if (!ac || !audioMaster) return;
            const output = audioEventOutput(x, y, z); if (!output) return;
            const now = ac.currentTime + 0.01;
            const osc = ac.createOscillator(); osc.type = 'sine';
            osc.frequency.setValueAtTime(180, now); osc.frequency.exponentialRampToValueAtTime(38, now + 0.7);
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.55, now + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
            osc.connect(g); g.connect(output.gain); osc.start(now); osc.stop(now + 0.85);
            audioNoiseBurst(output.ac, output.gain, { type: 'noise', filter: 'lowpass', freq: 300, q: 0.6, gain: 0.45, dur: 0.35, tone: 0 }, 0.7, 0.7);
            audioTrackVoice(output, 0.9);
        }
        function audioStopWind() {
            if (!audioWind) return;
            const w = audioWind; audioWind = null;
            try { w.gain.gain.setTargetAtTime(0.0001, w.ac.currentTime, 0.05); } catch (err) {}
            setTimeout(() => { try { w.source.stop(); w.source.disconnect(); w.gain.disconnect(); w.filter.disconnect(); } catch (err) {} }, 180);
        }
        function audioSetWind(level) {
            if (!(level > 0) && !audioWind) return;   // silence while standing does not create an AudioContext
            const ac = audioContext(); if (!ac || !audioMaster) return;
            const target = Math.max(0, Math.min(0.75, level)) * 0.22;
            if (target <= 0.002) { if (audioWind) audioWind.gain.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08); return; }
            if (!audioWind) {
                const source = ac.createBufferSource(); source.buffer = audioNoiseBuffer(ac, 2); source.loop = true;
                const filter = ac.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 500; filter.Q.value = 0.5;
                const gain = ac.createGain(); gain.gain.value = 0.0001;
                source.connect(filter); filter.connect(gain); gain.connect(audioMaster); source.start();
                audioWind = { ac, source, filter, gain };
            }
            audioWind.gain.gain.setTargetAtTime(target, ac.currentTime, 0.12);
            audioWind.filter.frequency.setTargetAtTime(380 + target * 900, ac.currentTime, 0.15);
        }
        function audioResetPlayerAudio() {
            audioStopWind();
            audioImpactCooldown.clear();
            Object.assign(audioPlayerTrack, { x: 0, y: 0, z: 0, step: 0, vy: 0, ground: false, dead: false, moving: false });
        }
        // Called by the player controller after its movement step. Steps are tied to distance/ground, not to a timer
        // that keeps ticking in the air, and the surface comes from the material of the block under the feet.
        function audioPlayerStep(dt) {
            if (!simulationRunning) { audioResetPlayerAudio(); return; }
            const m = typeof controlledModel === 'function' ? controlledModel() : null;
            if (!m) { audioSetWind(0); return; }
            if (!m.dead) audioPlayerTrack.dead = false;
            if (m.dead && !audioPlayerTrack.dead) audioPlayerDeath();
            if (m.dead) { audioSetWind(0); return; }
            if (!(dt > 0)) return;
            const dx = pc.pos.x - audioPlayerTrack.x, dz = pc.pos.z - audioPlayerTrack.z;
            const moving = Math.hypot(dx, dz) > 0.002;
            if (moving && pc.onGround) {
                audioPlayerTrack.step -= dt;
                if (audioPlayerTrack.step <= 0) {
                    const vol = (pc.sprinting ? 0.85 : 0.55) * Math.max(0.3, Math.min(1, pc.gait + 0.25));
                    audioFootstep(pc.surfaceMaterial || 'plastic', vol, (pc.sprinting ? 1.1 : 0.95) * (0.92 + Math.random() * 0.16));
                    audioPlayerTrack.step = pc.sprinting ? 0.27 : 0.42;
                }
            } else audioPlayerTrack.step = 0;
            if (!pc.onGround) audioSetWind(Math.max(0, -pc.vy) > 3 ? Math.min(1, (-pc.vy - 3) / 28) : 0);
            else audioSetWind(0);
            if (!audioPlayerTrack.ground && pc.onGround && audioPlayerTrack.vy < -3) {
                audioImpact(-audioPlayerTrack.vy, 'player', 'ground', { x: pc.pos.x, y: pc.pos.y, z: pc.pos.z, material: pc.surfaceMaterial || 'plastic' }, { x: pc.pos.x, y: pc.pos.y, z: pc.pos.z, material: pc.surfaceMaterial || 'plastic' });
            }
            audioPlayerTrack.x = pc.pos.x; audioPlayerTrack.y = pc.pos.y; audioPlayerTrack.z = pc.pos.z;
            audioPlayerTrack.vy = pc.vy; audioPlayerTrack.ground = pc.onGround; audioPlayerTrack.moving = moving;
        }

        function takeSnapshot() {
            simSnapshot = { objects: JSON.parse(JSON.stringify(sceneObjects)), counters: Object.assign({}, counters) };
        }
        function restoreSnapshot() {
            if (!simSnapshot) return;
            for (const k of Object.keys(sceneObjects)) delete sceneObjects[k];
            Object.assign(sceneObjects, JSON.parse(JSON.stringify(simSnapshot.objects)));
            Object.assign(counters, simSnapshot.counters);
            if (typeof sceneIndexInvalidate === 'function') sceneIndexInvalidate();
            simSnapshot = null;
            if (typeof clearEffectStates === 'function') clearEffectStates();
            physicsVelocity.clear(); ballRot.clear(); ballSpin.clear(); ballContacts.clear();
            if (typeof resetTouches === 'function') resetTouches();
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
            if (typeof resetTouches === 'function') resetTouches();
            if (running) {
                takeSnapshot();
                outputLog.length = 0;
                vlRuntime.sharedGlobals = new Map();
                simulationRunning = true;
                // Run was clicked, so this is the gesture that unlocks Web Audio; waiting for the first footstep
                // several seconds later can leave the context suspended.
                if (typeof audioContext === 'function') audioContext();
                // Keep the driven player's parts out of the physics from the very first step, so they never shove what
                // the player is standing on before the controller takes them over.
                const driven = controlledModel();
                playerPartIds = driven && !driven.dead ? new Set(driven.parts) : null;
                startSimulationScripts();
                audioResetPlayerAudio();
                for (const [id, o] of Object.entries(sceneObjects)) if (o.type === 'sound' && o.playing) startSound(id);
            } else {
                simulationRunning = false;
                playerPartIds = null;
                audioResetPlayerAudio();
                for (const id of [...activeSounds.keys()]) stopSound(id);
                stopScripts();
                vlRuntime.sharedGlobals = new Map();
                restoreSnapshot();
            }
            markUISceneChanged();
            sceneIndexInvalidate();
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
            if (moved) { uiDirty = true; sceneIndexInvalidate(); markUISceneChanged(); }
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
                if (name === 'Playing') { if (h.playing) startSound(id); else stopSound(id); return; }
                if (name !== 'Looped' && name !== 'Preset' && name !== 'Source' && name !== 'Pitch' && name !== 'Spatial' && name !== 'Rolloff') return;   // volume and distance update live
                if (h.playing) startSound(id);
            },
            soundPlay: (id) => { const h = sceneObjects[id]; if (h && h.type === 'sound') { h.playing = true; startSound(id); } },
            soundStop: (id) => { const h = sceneObjects[id]; if (h && h.type === 'sound') { h.playing = false; stopSound(id); } },
            getSelectedObjectId: () => selectedObjectId, setSelectedObjectId: value => { selectedObjectId = value; },
            markUIDirty: () => { uiDirty = true; if (typeof sceneIndexInvalidate === 'function') sceneIndexInvalidate(); if (typeof markUISceneChanged === 'function') markUISceneChanged(); },
            markOutputDirty: () => { outputDirty = true; }
        });
        const { VL_KEYWORDS, VL_SPACES, VL_MODULES, VL_TYPES, VL_GLOBALS, VLParseError, VLError, vlLex, vlParse, vlAnalyze, jsonDiagnostics, SCRIPT_TEMPLATE, newScriptData, makeHuman, HUMAN_DEFAULTS, makePlayerSetup, makePlayerScript, PLAYER_MANAGEMENT_SOURCE, NETWORKING_SOURCE, makeNetworkingScript, ensureScript, computeDiagnostics, VLFn, VLWait, VLModule, VLSpace, VLInst, VLVec, VLScope, vlInstCache, vlSpaces, vlInst, vlObj, vlRound, vlTypeName, vlStr, vlTruthy, VL_PROPS, vlGetProp, vlSetProp, vlGetMember, vlSetMember, vlCreate, vlDeleteInst, vlGetUID, vlSetUID, vlGetUIDFn, vlSetUIDFn, vlScriptingModule, vlInstanceModule, vlVanilla3D, vlVecFrom, vlRootScope, vlEq, vlBinary, vlEval, vlExec, vlMain, scriptTasks, outputLog, logOutput, vlStartTask, vlRunScript, startSimulationScripts, stepScripts, stopScripts } = vlRuntime;
        function upgradeLegacyPlayerManagement(objects) {
            let changed = false;
            for (const o of Object.values(objects || {})) {
                if (!o || o.type !== 'script' || o.name !== 'PlayerManagement' || typeof o.source !== 'string') continue;
                // Match only the old default, not a script someone has rewritten. It used NewThread and never handled
                // players who were already in the game, which is why Player1 could have no model in a new room.
                if (o.source.includes('Scripting.NewThread(managePlayer, auto, player)') &&
                    o.source.includes('Players.OnPlayerJoin:Connect') &&
                    o.source.includes('Players.OnPlayerDeath:Connect') &&
                    !o.source.includes('Players.OnPlayerLeave')) {
                    o.source = PLAYER_MANAGEMENT_SOURCE;
                    changed = true;
                }
            }
            return changed;
        }
