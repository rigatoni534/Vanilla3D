#!/usr/bin/env node
// Vanilla3D headless smoke test.
//
//   npm install                        (once; installs Playwright)
//   npx playwright install chromium     (once; downloads the browser)
//   npm run test:smoke
//
// It serves this folder on 127.0.0.1 with a small built-in static server (no network access, no build step) and walks
// the two things a user does first:
//
//   Editor  open → add a block → Run → Stop (the world is restored) → open a .vnw file → run a scripted world and
//           read its output.
//   Player  open a .vnw file → the trust gate → Play becomes available.
//
// Every step asserts against engine state (sceneObjects) or visible text, and any uncaught page error fails the run.

import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'tests/fixtures');
const fixture = (name) => path.join(FIXTURES, name);

const MIME = new Map(Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.vnw': 'application/json; charset=utf-8',
    '.vanilla': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.md': 'text/markdown; charset=utf-8'
}));

function startServer() {
    const server = http.createServer(async (request, response) => {
        try {
            const url = new URL(request.url, 'http://127.0.0.1');
            let pathname = decodeURIComponent(url.pathname);
            if (pathname.endsWith('/')) pathname += 'index.html';
            const file = path.resolve(ROOT, '.' + pathname);
            if (file !== ROOT && !file.startsWith(ROOT + path.sep)) throw new Error('outside the repository');
            const body = await readFile(file);
            response.writeHead(200, {
                'content-type': MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
                'cache-control': 'no-store'
            });
            response.end(body);
        } catch {
            response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            response.end('not found');
        }
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve({ server, base: 'http://127.0.0.1:' + server.address().port }));
    });
}

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch {
    console.error('Playwright is not installed. Run:\n  npm install\n  npx playwright install chromium');
    process.exit(1);
}

// The file's own objects: everything the fixture puts directly in the World space. The loader also builds the default
// player (in the Players space) for a world that has none, which is why this is narrower than the whole scene.
const WORLD_CHILDREN = `Object.values(sceneObjects).filter((o) => o && o.parent === 'world' && !o.readOnly).length`;

// Engine state helper: engine-owned instances (the Viewfinder) are not part of a world file.
const SCENE_COUNT = `(() => {
    if (typeof sceneObjects !== 'object' || !sceneObjects) return document.querySelectorAll('#explorer-content .tree-item').length;
    return Object.entries(sceneObjects).filter(([, o]) => o && o.parent !== 'engine' && !o.readOnly).length;
})()`;

// Opening a world over the one that is already loaded asks for confirmation (#cf-ok).
async function openWorldFile(name) {
    await page.setInputFiles('#vnw-file-input', fixture(name));
    const confirm = page.locator('#cf-ok');
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
}

async function waitForEditorBoot() {
    await page.waitForFunction(() => {
        const loader = document.getElementById('boot-loader');
        return loader && loader.hidden === true;
    }, null, { timeout: 30000 });
}

const results = [];
async function step(name, fn) {
    const started = Date.now();
    try {
        await fn();
        results.push({ name, ok: true, ms: Date.now() - started });
        console.log('  ok    ' + name + ' (' + (Date.now() - started) + ' ms)');
    } catch (error) {
        results.push({ name, ok: false, ms: Date.now() - started, error });
        console.log('  FAIL  ' + name + ' (' + (Date.now() - started) + ' ms)');
        throw error;
    }
}

const { server, base } = await startServer();
console.log('Vanilla3D smoke test on ' + base);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const pageErrors = [];
const consoleErrors = [];
const nativeDialogs = [];
// A beforeunload prompt pauses a navigation until it is answered; accept it so the test can keep walking.
page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.type()); await dialog.accept(); });
page.on('pageerror', (error) => pageErrors.push(error));
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

let stage = 'start';
try {
    // ── Editor ──
    await step('editor boots and hands focus to the viewport', async () => {
        stage = 'boot';
        await page.goto(base + '/engine/index.html', { waitUntil: 'load' });
        await page.waitForFunction(() => {
            const loader = document.getElementById('boot-loader');
            return loader && loader.hidden === true;
        }, null, { timeout: 30000 });
        assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'screen');
        // A first visit opens the release notes shortly after the loader; wait for that window, then dismiss them.
        await page.waitForTimeout(500);
        if (await page.isVisible('#release-popup')) {
            await page.click('#release-popup .release-close');
            await page.waitForSelector('#release-popup', { state: 'hidden' });
        }
        assert.ok(await page.locator('#explorer-content .tree-group').count() > 0, 'the explorer should list the spaces');
        assert.ok(await page.evaluate(SCENE_COUNT) > 0, 'the default world should have instances');
    });

    let worldCount = 0;
    await step('adding a block adds exactly one instance', async () => {
        stage = 'add';
        worldCount = await page.evaluate(SCENE_COUNT);
        await page.click('#explorer-content [data-add="world"]');
        await page.click('#add-menu [data-kind="prism6"]');
        // The menu closes and selection moves to the new block; assert on state rather than on the 1 Hz status bar.
        await page.waitForFunction((expected) => {
            const objects = typeof sceneObjects === 'object' && sceneObjects ? sceneObjects : null;
            const count = objects
                ? Object.entries(objects).filter(([, o]) => o && o.parent !== 'engine' && !o.readOnly).length
                : document.querySelectorAll('#explorer-content .tree-item').length;
            return count === expected;
        }, worldCount + 1);
        assert.equal(await page.evaluate(SCENE_COUNT), worldCount + 1);
    });

    await step('Run starts the simulation and Stop restores the world', async () => {
        stage = 'run';
        const before = await page.evaluate(SCENE_COUNT);
        await page.click('#run-btn');
        await page.waitForSelector('#canvas-container.simulating');
        assert.equal(await page.getAttribute('#run-btn', 'aria-pressed'), 'true');
        await page.waitForTimeout(800);                       // let scripts and physics tick
        await page.click('#run-btn');
        await page.waitForFunction(() => !document.getElementById('canvas-container').classList.contains('simulating'));
        assert.equal(await page.getAttribute('#run-btn', 'aria-pressed'), 'false');
        assert.equal(await page.evaluate(SCENE_COUNT), before, 'Stop should restore the pre-run world');
    });

    await step('opening a .vnw replaces the world with the file', async () => {
        stage = 'open-world';
        await openWorldFile('three-objects.vnw');
        await page.waitForFunction(() => [...document.querySelectorAll('#explorer-content .tree-name')]
            .some((element) => element.textContent.includes('Fixture Ball')));
        assert.equal(await page.evaluate(WORLD_CHILDREN), 5, 'the file has a settings object, a plate and three shapes');
        for (const name of ['Fixture Block', 'Fixture Ball', 'Fixture Ramp']) {
            assert.ok(await page.locator('#explorer-content .tree-name', { hasText: name }).count() > 0, name + ' should be in the explorer');
        }
    });

    await step('opening a world clears undo and redo from the previous world', async () => {
        stage = 'history-reset';
        const report = await page.evaluate(() => ({
            undo: shortcutHistory.undo.length,
            redo: shortcutHistory.redo.length,
            reverted: shortcutUndo()
        }));
        assert.equal(report.undo, 0, 'loading a world must not leave an undo step behind');
        assert.equal(report.redo, 0);
        assert.equal(report.reverted, false);
        assert.equal(await page.evaluate(WORLD_CHILDREN), 5, 'undo must not change the world that was just opened');
    });

    await step('a scripted world reports no problems, runs and prints', async () => {
        stage = 'script';
        await openWorldFile('scripted.vnw');
        await page.waitForSelector('#explorer-content .tree-item[data-id="FixtureScript1"]');
        await page.dblclick('#explorer-content .tree-item[data-id="FixtureScript1"] .tree-name');
        await page.waitForSelector('#script-editor:not([hidden])');
        assert.match((await page.textContent('#se-lang')).trim(), /vanillalua/i);
        const counts = await page.textContent('#se-counts');
        assert.ok(!/error/i.test(counts), 'the fixture script should analyze clean, got: ' + counts);
        await page.click('#run-btn');
        await page.waitForSelector('#canvas-container.simulating');
        await page.waitForFunction(() => (document.getElementById('se-out-list')?.textContent || '').includes('fixture script running'),
            null, { timeout: 8000 });
        await page.click('#run-btn');
        await page.waitForFunction(() => !document.getElementById('canvas-container').classList.contains('simulating'));
    });

    await step('loading another world closes script tabs and clears history', async () => {
        stage = 'tabs-reset';
        await page.evaluate(() => {
            const script = Object.keys(sceneObjects).find((id) => sceneObjects[id].type === 'script');
            sceneObjects[script].name = 'Changed Before Load';
            shortcutPushHistory();
        });
        await openWorldFile('three-objects.vnw');
        const report = await page.evaluate(() => ({
            tabs: openTabs.slice(),
            active: activeTab,
            undo: shortcutHistory.undo.length,
            editorHidden: document.getElementById('script-editor').hidden,
            tabNames: [...document.querySelectorAll('#tabbar .tab-name')].map((el) => el.textContent)
        }));
        assert.deepEqual(report.tabs, ['world'], 'the removed script must not stay open');
        assert.equal(report.active, 'world');
        assert.equal(report.undo, 0);
        assert.equal(report.editorHidden, true);
        assert.deepEqual(report.tabNames, ['World']);
    });

    await step('undo snapshots share asset payloads and stay under the byte budget', async () => {
        stage = 'undo-assets';
        const report = await page.evaluate(() => {
            const settingsId = Object.keys(sceneObjects).find((id) => sceneObjects[id].type === 'worldsettings');
            const payload = 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024);
            sceneObjects[settingsId].assets = [{ name: 'large.png', type: 'image/png', size: payload.length, url: payload }];
            shortcutResetHistory();
            for (let i = 0; i < 60; i++) {
                sceneObjects[settingsId].timeOfDay = i % 24;
                shortcutPushHistory();
            }
            const snapshots = shortcutHistory.undo;
            const cost = snapshots.reduce((total, snapshot) => total + snapshot.bytes, 0);
            const visible = JSON.stringify(snapshots.map((snapshot) => snapshot.objects)).length;
            const kept = snapshots.length;
            shortcutUndo();
            const restored = sceneObjects[settingsId].assets[0].url === payload;
            shortcutResetHistory();
            return { kept, cost, visible, restored };
        });
        assert.equal(report.kept, 60, 'a 3 MB asset must not push 60 edits out of the history');
        assert.ok(report.visible < 1024 * 1024, 'snapshots still hold raw asset data: ' + report.visible + ' bytes');
        assert.ok(report.cost < 32 * 1024 * 1024, 'history should stay under the byte cap: ' + report.cost);
        assert.equal(report.restored, true, 'undo must put the asset back');
    });

    await step('browser saves use IndexedDB and migrate legacy slots', async () => {
        stage = 'indexeddb';
        const saved = await page.evaluate(async () => {
            const ok = await saveToSlot('slot1', true);
            const restored = await readSlot('slot1');
            const legacy = localStorage.getItem('vanilla-engine-slot-1-v1');
            localStorage.setItem('vanilla-engine-slot-2-v1', JSON.stringify(buildWorldFile()));
            return { ok, restored: !!restored, legacy, count: restored ? Object.keys(restored.objects).length : 0 };
        });
        assert.equal(saved.ok, true);
        assert.equal(saved.restored, true);
        assert.ok(saved.count > 0);
        assert.equal(saved.legacy, null, 'an IndexedDB save must not also live in localStorage');
        const slotLabel = await page.evaluate(async () => {
            await refreshFileStatus();
            return document.querySelector('[data-slot="slot1"]').textContent;
        });
        assert.match(slotLabel, /\d+(\.\d+)? (KB|MB)/, 'the File menu should show the save size, got: ' + slotLabel);
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('boot-loader').hidden === true, null, { timeout: 30000 });
        const migrated = await page.evaluate(async () => ({
            slot1: !!(await readSlot('slot1')),
            slot2: !!(await readSlot('slot2')),
            legacy2: localStorage.getItem('vanilla-engine-slot-2-v1')
        }));
        assert.equal(migrated.slot1, true, 'the IndexedDB save should survive a reload');
        assert.equal(migrated.slot2, true, 'the old localStorage slot should be migrated');
        assert.equal(migrated.legacy2, null, 'the migrated key should be removed');
    });

    await step('a failed autosave warns once and keeps a status chip', async () => {
        stage = 'autosave-failure';
        const report = await page.evaluate(async () => {
            const realWrite = writeSlot;
            writeSlot = async () => false;
            autosaveBase = '';
            const first = await autosaveNow();
            const chip = document.getElementById('autosave-warning');
            const chipVisible = !!chip && !chip.hidden;
            const warnings = [...document.querySelectorAll('#toast-host .toast')].filter((el) => /Autosave failed/.test(el.textContent)).length;
            const second = await autosaveNow();
            const warningsAfterSecond = [...document.querySelectorAll('#toast-host .toast')].filter((el) => /Autosave failed/.test(el.textContent)).length;
            writeSlot = realWrite;
            autosaveBase = '';
            const recovered = await autosaveNow();
            return { first, second, recovered, chipVisible, warnings, warningsAfterSecond, chipAfterRecovery: !chip.hidden };
        });
        assert.equal(report.first, false);
        assert.equal(report.second, false);
        assert.equal(report.chipVisible, true, 'the failing autosave should show its status chip');
        assert.equal(report.warnings, 1, 'the warning appears once per failure, not on every tick');
        assert.equal(report.warningsAfterSecond, 1);
        assert.equal(report.recovered, true, 'autosave should recover when writing works again');
        assert.equal(report.chipAfterRecovery, false, 'the chip should clear after a successful autosave');
    });

    await step('a tab close writes the world synchronously and the next open restores it', async () => {
        stage = 'close-save';
        const saved = await page.evaluate(() => {
            const id = newId();
            sceneObjects[id] = makePrism('Close Test', 'world', { x: 8, y: 3, z: 0, length: 1, width: 1, height: 1, anchored: true });
            recountTypes(); renderExplorer();
            const ok = autosaveSync();
            const raw = localStorage.getItem('vanilla-engine-slot-autosave-v1') || '';
            return { ok, hasTest: raw.includes('Close Test'), bytes: raw.length };
        });
        assert.equal(saved.ok, true, 'the synchronous tab-close save should report a write');
        assert.equal(saved.hasTest, true, 'the complete world must be in localStorage before the page can close');
        // A change made after that save makes a close ask first, and the prompt is preceded by the save.
        await page.evaluate(() => {
            const id = newId();
            sceneObjects[id] = makePrism('Exit Test', 'world', { x: -8, y: 3, z: 0, length: 1, width: 1, height: 1, anchored: true });
            recountTypes(); renderExplorer();
        });
        const prompt = await page.evaluate(() => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            return { prevented: event.defaultPrevented, saved: (localStorage.getItem('vanilla-engine-slot-autosave-v1') || '').includes('Exit Test') };
        });
        assert.equal(prompt.prevented, true, 'a close with unsaved changes must ask for confirmation');
        assert.equal(prompt.saved, true, 'the exit save must finish before the confirmation is shown');
        // A change made after the prompt is carried out by the real pagehide handler.
        await page.evaluate(() => {
            const id = newId();
            sceneObjects[id] = makePrism('Pagehide Test', 'world', { x: 0, y: 3, z: 8, length: 1, width: 1, height: 1, anchored: true });
            recountTypes(); renderExplorer();
        });
        await page.goto(base + '/player/index.html', { waitUntil: 'load' });
        await page.goto(base + '/engine/index.html', { waitUntil: 'load' });
        await waitForEditorBoot();
        const restored = await page.evaluate(() => Object.values(sceneObjects)
            .filter((o) => o.name === 'Close Test' || o.name === 'Exit Test' || o.name === 'Pagehide Test')
            .map((o) => o.name).sort());
        assert.deepEqual(restored, ['Close Test', 'Exit Test', 'Pagehide Test'], 'the closed tab world should reopen from its exit save');
        const unloadDialogs = nativeDialogs.filter((type) => type === 'beforeunload').length;
        assert.ok(unloadDialogs > 0, 'a real close with unsaved changes should show the browser confirmation');
        assert.equal(nativeDialogs.length, unloadDialogs, 'only the close confirmation should appear: ' + nativeDialogs.join(', '));
    });

    await step('closing during Run saves the world Run started from', async () => {
        stage = 'close-run';
        const startY = await page.evaluate(() => {
            const id = newId();
            sceneObjects[id] = makePrism('Fall Test', 'world', { x: 0, y: 24, z: 0, length: 2, width: 2, height: 2, anchored: false });
            recountTypes(); renderExplorer();
            return sceneObjects[id].y;
        });
        await page.click('#run-btn');
        await page.waitForSelector('#canvas-container.simulating');
        await page.waitForTimeout(900);
        const droppedY = await page.evaluate(() => {
            const o = Object.values(sceneObjects).find((item) => item.name === 'Fall Test');
            return o ? o.y : null;
        });
        assert.ok(droppedY !== null && droppedY < startY - 0.01, 'the test block should have moved during Run, got y=' + droppedY);
        await page.goto(base + '/player/index.html', { waitUntil: 'load' });
        await page.goto(base + '/engine/index.html', { waitUntil: 'load' });
        await waitForEditorBoot();
        const restoredY = await page.evaluate(() => {
            const o = Object.values(sceneObjects).find((item) => item.name === 'Fall Test');
            return o ? o.y : null;
        });
        assert.ok(restoredY !== null && Math.abs(restoredY - startY) < 0.001,
            'the saved world should be the pre-Run snapshot, got y=' + restoredY);
    });

    await step('a newer tab-close copy replaces an older IndexedDB save', async () => {
        stage = 'close-migrate';
        await page.evaluate(async () => {
            const current = JSON.stringify(buildWorldFile());
            const older = JSON.parse(current);
            for (const [id, o] of Object.entries(older.objects)) if (o.name === 'Fall Test') delete older.objects[id];
            older.savedAt = '2000-01-01T00:00:00.000Z';
            await writeSlot('autosave', JSON.stringify(older));
            localStorage.setItem('vanilla-engine-slot-autosave-v1', current);
        });
        await page.reload({ waitUntil: 'load' });
        await waitForEditorBoot();
        const report = await page.evaluate(() => ({
            hasFall: Object.values(sceneObjects).some((o) => o.name === 'Fall Test'),
            local: localStorage.getItem('vanilla-engine-slot-autosave-v1')
        }));
        assert.equal(report.hasFall, true, 'the newer tab-close copy must win over the older IndexedDB save');
        assert.equal(report.local, null, 'the migrated tab-close copy should be removed from localStorage');
    });

    await step('multiplayer rejects parent cycles and keeps assets out of edit batches', async () => {
        stage = 'multiplayer-protocol';
        const report = await page.evaluate(() => {
            const shape = (name, parent) => ({ type: 'prism6', name, parent, x: 0, y: 0, z: 0, length: 1, width: 1, height: 1 });
            const current = { A: shape('A', 'world'), B: shape('B', 'A') };
            const cycle = v3dValidOps({ upsert: [['A', shape('A', 'B')], ['B', shape('B', 'A')]], remove: [] }, current);
            const unknownRoot = v3dValidOps({ upsert: [['C', shape('C', 'missing')]], remove: [] }, current);
            const normal = v3dValidOps({ upsert: [['C', shape('C', 'B')]], remove: [] }, current);
            const selfParent = v3dValidOps({ upsert: [['C', shape('C', 'C')]], remove: [] }, current);

            // Keep this on a temporary settings object: mutating the real one would reorder its saved JSON.
            const big = 'data:image/png;base64,' + 'A'.repeat(300 * 1024);
            const bigAssets = [{ name: 'big.png', type: 'image/png', size: big.length, url: big }];
            const wsId = 'TestWorldSettings';
            sceneObjects[wsId] = { type: 'worldsettings', name: 'Test Settings', parent: 'world', gravity: 9.8, assets: bigAssets };
            const previous = { [wsId]: JSON.parse(JSON.stringify(sceneObjects[wsId])) };
            const next = JSON.parse(JSON.stringify(previous));
            next[wsId].gravity = 1.23;
            const ops = v3dDiffObjects(previous, next);
            const wsOp = ops.upsert.find(([id]) => id === wsId);
            const opBytes = wsOp ? JSON.stringify(wsOp[1]).length : -1;
            const opsValid = v3dValidOps(ops, sceneObjects);
            v3dApplyOps({ upsert: [[wsId, wsOp[1]]], remove: [] });
            const applied = sceneObjects[wsId].gravity === 1.23 && sceneObjects[wsId].assets === bigAssets;

            const guestScript = { type: 'script', name: 'Guest Script', parent: 'scripts', source: 'print(1)', language: 'lua', enabled: true };
            const filtered = v3dFilterGuestOps({ upsert: [['GuestScript', guestScript], ['GuestShape', shape('GuestShape', 'world')]], remove: [] }, sceneObjects, false);
            const wsFiltered = v3dFilterGuestOps({ upsert: [[wsId, JSON.parse(JSON.stringify(sceneObjects[wsId]))]], remove: [] }, sceneObjects, true);
            delete sceneObjects[wsId];

            const gate = v3dWorldSendGate(5000);
            const first = gate.begin('guest');
            const during = gate.begin('guest');
            gate.end('guest');
            const cooling = gate.begin('guest');
            const other = gate.begin('other');
            gate.clear();
            const afterClear = gate.begin('guest');
            return {
                cycle, unknownRoot, normal, selfParent, wsOp: !!wsOp, opBytes, opsValid, applied,
                filteredBlocked: filtered.blocked, filteredUpserts: filtered.ops.upsert.length,
                wsFilteredBlocked: wsFiltered.blocked, netVersion: V3D_NET_VERSION,
                first, during, cooling, other, afterClear
            };
        });
        assert.equal(report.cycle, false, 'a parent cycle must be rejected');
        assert.equal(report.unknownRoot, false, 'an unknown parent must be rejected');
        assert.equal(report.normal, true, 'ordinary nesting must stay valid');
        assert.equal(report.selfParent, false);
        assert.equal(report.wsOp, true, 'a World Settings change must produce an edit');
        assert.ok(report.opBytes < 256 * 1024, 'assets must not count against the World Settings edit: ' + report.opBytes + ' bytes');
        assert.equal(report.opsValid, true);
        assert.equal(report.applied, true, 'applying a settings edit must keep the receiver\'s assets');
        assert.equal(report.filteredBlocked, 1, 'a guest script edit must be blocked with scripts off');
        assert.equal(report.filteredUpserts, 1, 'the guest\'s ordinary shape edit must still go through');
        assert.equal(report.wsFilteredBlocked, 1, 'World Settings must stay host-only even when scripts are allowed');
        assert.equal(report.netVersion, 2, 'the changed permission and validation rules need wire version 2');
        assert.deepEqual([report.first, report.during, report.cooling, report.other, report.afterClear], [true, false, false, true, true]);
    });

    await step('multiplayer defaults to no guest script editing', async () => {
        stage = 'multiplayer-ui';
        await page.click('#mp-btn');
        await page.waitForSelector('#mp-modal.active');
        assert.equal(await page.isVisible('#mp-allow-scripts'), true, 'the host should see the guest-script toggle');
        assert.equal(await page.isChecked('#mp-allow-scripts'), false, 'guests must not edit scripts by default');
        assert.match((await page.textContent('#mp-modal .mp-note')).trim(), /World Settings stay host-only/);
        await page.click('#mp-close');
        await page.waitForFunction(() => !document.getElementById('mp-modal').classList.contains('active'));
    });

    await step('play mode neither restores nor writes the editor autosave', async () => {
        stage = 'play-autosave';
        const before = await page.evaluate(async () => {
            localStorage.setItem('vanilla-player-world-v1', JSON.stringify(buildWorldFile()));
            return await readSlotText('autosave');
        });
        await page.goto(base + '/engine/index.html?play=1', { waitUntil: 'load' });
        await page.waitForFunction(() => document.body.classList.contains('play-mode'));
        const after = await page.evaluate(async () => ({
            suppressed: autosaveSuppressed,
            autosave: await readSlotText('autosave'),
            written: await autosaveNow()
        }));
        assert.equal(after.suppressed, true, 'play mode must suppress Autosave');
        assert.equal(after.written, false, 'play mode must never write the Autosave slot');
        assert.equal(after.autosave, before, 'the editor autosave must be byte-identical after a play session');
    });

    // ── Player ──
    await step('the Player loads a world and gates Play behind trust', async () => {
        stage = 'player';
        await page.goto(base + '/player/index.html', { waitUntil: 'load' });
        await page.setInputFiles('#world-file', fixture('three-objects.vnw'));
        await page.waitForSelector('#world-info.show');
        assert.equal((await page.textContent('#world-name')).trim(), 'Three Objects');
        assert.equal(await page.isDisabled('#play'), true, 'Play should be disabled until the world is trusted');
        await page.check('#trust');
        assert.equal(await page.isDisabled('#play'), false, 'Play should unlock once the world is trusted');
    });

    await step('no uncaught page errors', async () => {
        stage = 'errors';
        assert.deepEqual(pageErrors.map((error) => error.message), []);
    });
} catch (error) {
    console.error('\nFailed during "' + stage + '": ' + (error && error.stack ? error.stack : error));
    try {
        await mkdir(path.join(ROOT, 'test-results'), { recursive: true });
        await page.screenshot({ path: path.join(ROOT, 'test-results', 'failure.png'), fullPage: true });
        console.error('Screenshot: test-results/failure.png');
    } catch { /* a screenshot is only a convenience */ }
    await browser.close().catch(() => {});
    server.close();
    process.exit(1);
}

await browser.close();
server.close();

const failed = results.filter((result) => !result.ok).length;
console.log('\n' + (failed ? failed + ' step(s) failed' : 'All ' + results.length + ' steps passed') +
    ' in ' + results.reduce((total, result) => total + result.ms, 0) + ' ms.');
if (consoleErrors.length) {
    console.log('\nConsole errors seen (not fatal on their own):');
    for (const line of consoleErrors.slice(0, 10)) console.log('  ' + line);
}
process.exit(failed ? 1 : 0);
