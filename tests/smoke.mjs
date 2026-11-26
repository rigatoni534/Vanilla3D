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
        // A first visit opens the release notes over the editor; dismiss them the way a reader would.
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
