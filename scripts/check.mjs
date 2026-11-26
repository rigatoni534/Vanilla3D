#!/usr/bin/env node
// Vanilla3D repository check — no build step, no dependencies.
//
//   node scripts/check.mjs      (or: ./scripts/check.sh, or: npm run check)
//
// The editor is loaded as one shared global scope from a list of <script> tags, so most ways it can break are visible
// without a browser. This checks, in order:
//
//   1. Every JavaScript file parses, using the same grammar the browser uses.
//   2. Every inline <script> in the site pages parses.
//   3. The editor's scripts compile together in the order engine/index.html loads them, so two files that declare the
//      same top-level const/let/class — which would stop the whole editor from booting — fail here first.
//   4. No top-level function or const is declared by two different engine scripts (the silent version of the same bug).
//   5. Every icon id used in HTML, CSS or JS exists as a <symbol> in assets/icons.svg.
//   6. Every local src/href in the site pages resolves to a real file.
//   7. Every tests/fixtures/*.vnw is a world file the editor's loader would accept.
//
// Exit status is 0 when everything passes and 1 otherwise. It never starts a server and never needs a browser; the
// browser smoke test is tests/smoke.mjs.

import { readFile, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'generated', 'test-results', 'playwright-report']);
const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const failures = [];
const warnings = [];
const fail = (area, message) => failures.push({ area, message });
const warn = (area, message) => warnings.push({ area, message });

async function walk(dir, out = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) await walk(full, out);
        } else out.push(full);
    }
    return out;
}

const files = await walk(ROOT);
const jsFiles = files.filter((file) => file.endsWith('.js') || file.endsWith('.mjs')).sort();
const htmlFiles = files.filter((file) => file.endsWith('.html')).sort();

// ── 1. Every JavaScript file parses ──
// Classic scripts go through vm.Script, which is the same grammar the browser compiles. ES modules (the test and tool
// files) are checked by `node --check`, which parses them as modules without running them.
const run = promisify(execFile);
for (const file of jsFiles) {
    if (file.endsWith('.mjs')) {
        try { await run(process.execPath, ['--check', file]); }
        catch (err) { fail('syntax', rel(file) + ': ' + String(err.stderr || err.message).trim().split('\n').slice(0, 4).join(' ')); }
        continue;
    }
    const code = await readFile(file, 'utf8');
    try { new vm.Script(code, { filename: rel(file) }); }
    catch (err) { fail('syntax', rel(file) + ': ' + err.message); }
}

// ── 2. Inline page scripts parse ──
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
function htmlScripts(html) {
    const out = [];
    for (const match of html.matchAll(SCRIPT_RE)) {
        const attrs = match[1] || '';
        const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
        out.push({ src: src ? src[1] : '', code: match[2] || '' });
    }
    return out;
}
const htmlByFile = new Map();
for (const file of htmlFiles) htmlByFile.set(file, await readFile(file, 'utf8'));
for (const [file, html] of htmlByFile) {
    htmlScripts(html).forEach((script, index) => {
        if (script.src || !script.code.trim()) return;
        try { new vm.Script(script.code, { filename: rel(file) + ' inline script ' + (index + 1) }); }
        catch (err) { fail('syntax', rel(file) + ' inline script ' + (index + 1) + ': ' + err.message); }
    });
}

// ── 3. The editor scripts compile together in load order ──
// This is the check that matters most: a duplicate top-level const between two files is a SyntaxError for the whole
// page, and it is invisible when each file is checked on its own.
const engineParts = [];
const engineHtml = htmlByFile.get(path.join(ROOT, 'engine/index.html'));
if (!engineHtml) {
    fail('load order', 'engine/index.html was not found.');
} else {
    for (const script of htmlScripts(engineHtml)) {
        if (script.src) {
            if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(script.src)) continue;
            const clean = script.src.split('?')[0].split('#')[0];
            // Vendored third-party code (PeerJS) is not part of the engine's shared scope.
            if (clean.endsWith('.min.js')) { warn('load order', 'skipped third-party ' + clean); continue; }
            const file = path.resolve(path.join(ROOT, 'engine'), clean);
            try { engineParts.push({ label: rel(file), code: await readFile(file, 'utf8') }); }
            catch { fail('load order', 'engine/index.html loads a missing file: ' + clean); }
        } else if (script.code.trim()) {
            engineParts.push({ label: 'engine/index.html inline', code: script.code });
        }
    }
    try {
        new vm.Script(engineParts.map((part) => '// ' + part.label + '\n' + part.code).join('\n;\n'), { filename: 'engine/load-order.js' });
    } catch (err) {
        const hint = /already been declared/.test(err.message) ? ' Two scripts declare the same top-level name.' : '';
        fail('load order', 'the editor scripts do not compile together in load order: ' + err.message + hint);
    }
}

// ── 4. No top-level name is declared by two engine scripts ──
// `function` duplicates are legal JavaScript and silently override, which is the hard version of this bug to spot.
// Strings, comments, template literals and regex bodies are blanked first so their contents cannot look like code.
function blankLiterals(source) {
    const chars = source.split('');
    const n = source.length;
    const blank = (from, to) => { for (let k = from; k < to && k < n; k++) if (chars[k] !== '\n') chars[k] = ' '; };
    function skipString(start) {
        const quote = source[start];
        let i = start + 1;
        while (i < n) {
            const c = source[i];
            if (c === '\\') { i += 2; continue; }
            if (quote === '`' && c === '$' && source[i + 1] === '{') { i = skipBrace(i + 2); continue; }
            if (c === quote) return i + 1;
            i++;
        }
        return n;
    }
    let i = 0;
    while (i < n) {
        const c = source[i];
        if (c === '/' && source[i + 1] === '/') {
            let end = source.indexOf('\n', i);
            end = end === -1 ? n : end;
            blank(i, end); i = end; continue;
        }
        if (c === '/' && source[i + 1] === '*') {
            let end = source.indexOf('*/', i + 2);
            end = end === -1 ? n : end + 2;
            blank(i, end); i = end; continue;
        }
        if (c === '\'' || c === '"' || c === '`') { const end = skipString(i); blank(i, end); i = end; continue; }
        i++;
    }
    return chars.join('');
    function skipBrace(start) {
        let i = start, level = 1;
        while (i < n) {
            const c = source[i];
            if (c === '\'' || c === '"' || c === '`') { i = skipString(i); continue; }
            if (c === '{') level++;
            else if (c === '}') { level--; if (!level) return i + 1; }
            i++;
        }
        return n;
    }
}
const DECL_RE = /\b(function|const|let|class)\s+([A-Za-z_$][\w$]*)/y;
function topLevelDecls(source) {
    const text = blankLiterals(source);
    const out = [];
    let depth = 0, paren = 0, bracket = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '{') { depth++; continue; }
        if (c === '}') { depth = Math.max(0, depth - 1); continue; }
        if (c === '(') { paren++; continue; }
        if (c === ')') { paren = Math.max(0, paren - 1); continue; }
        if (c === '[') { bracket++; continue; }
        if (c === ']') { bracket = Math.max(0, bracket - 1); continue; }
        if (depth || paren || bracket) continue;
        if (c !== 'f' && c !== 'c' && c !== 'l') continue;
        if (i && /[\w$.]/.test(text[i - 1])) continue;
        DECL_RE.lastIndex = i;
        const match = DECL_RE.exec(text);
        if (!match) continue;
        out.push([match[1], match[2]]);
        i = DECL_RE.lastIndex - 1;
    }
    return out;
}
{
    const owners = new Map();
    for (const part of engineParts) {
        for (const [kind, name] of topLevelDecls(part.code)) {
            if (!owners.has(name)) owners.set(name, new Map());
            const kinds = owners.get(name);
            if (!kinds.has(kind)) kinds.set(kind, new Set());
            kinds.get(kind).add(part.label);
        }
    }
    for (const [name, kinds] of owners) {
        const places = new Set([...kinds.values()].flatMap((set) => [...set]));
        if (places.size < 2) continue;
        // A name used as both a function and a variable in different files is the interesting case; two functions of
        // the same name are still worth reporting because the later one wins silently.
        fail('globals', name + ' is declared at the top level by ' + [...places].join(' and ') +
            ' (' + [...kinds.keys()].join('/') + '). Rename one of them.');
    }
}

// ── 5. Icon ids resolve against the sprite ──
const symbols = new Set();
try {
    const sprite = await readFile(path.join(ROOT, 'assets/icons.svg'), 'utf8');
    for (const match of sprite.matchAll(/<symbol\b[^>]*\bid=["']([^"']+)["']/g)) symbols.add(match[1]);
} catch { fail('icons', 'assets/icons.svg is missing.'); }
{
    const used = new Map();
    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (ext !== '.html' && ext !== '.js' && ext !== '.css') continue;
        const text = await readFile(file, 'utf8');
        for (const re of [/#(i-[A-Za-z0-9-]+)/g, /['"](i-[A-Za-z0-9-]+)['"]/g]) {
            for (const match of text.matchAll(re)) {
                const id = match[1];
                if (!used.has(id)) used.set(id, new Set());
                used.get(id).add(rel(file));
            }
        }
    }
    for (const [id, places] of used) {
        if (!symbols.has(id)) fail('icons', 'no <symbol id="' + id + '"> in assets/icons.svg, used by ' + [...places].join(', '));
    }
}

// ── 6. Every local link in a page resolves ──
for (const [file, html] of htmlByFile) {
    const dir = path.dirname(file);
    for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
        const raw = match[1].trim();
        if (!raw || raw.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue;
        const clean = raw.split('?')[0].split('#')[0];
        if (!clean) continue;
        try {
            let target = path.resolve(dir, clean);
            if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
            await stat(target);
        } catch { fail('links', rel(file) + ' points at a missing file: ' + raw); }
    }
}

// ── 7. Fixture worlds match what the loader accepts ──
// Mirrors validateWorldFile in engine/js/files.js: format, UIDs, parents, space rules and circular chains.
const FIXTURE_TYPES = new Set([
    'prism6', 'ball', 'wedge', 'cylinder', 'union', 'model', 'worldsettings', 'script', 'texture', 'human', 'sound',
    'highlight', 'light', 'simpleeffect', 'advancedeffect',
    'frame', 'text', 'button', 'image', 'input', 'progressbar',
    'clientsocket', 'serversocket', 'peerconnection', 'groupconnection'
]);
const FIXTURE_SPACES = new Set(['world', 'storage', 'scripts', 'ui', 'communications']);
const FIXTURE_UI_TYPES = new Set(['frame', 'text', 'button', 'image', 'input', 'progressbar']);
const FIXTURE_CONNECTIONS = new Set(['clientsocket', 'serversocket', 'peerconnection', 'groupconnection']);
const fixtureFiles = files.filter((file) => file.endsWith('.vnw')).sort();
for (const file of fixtureFiles) {
    const where = rel(file);
    let data;
    try { data = JSON.parse(await readFile(file, 'utf8')); }
    catch (err) { fail('fixtures', where + ' is not JSON: ' + err.message); continue; }
    if (!data || data.format !== 'VanillaWorld') { fail('fixtures', where + ' is not a VanillaWorld file.'); continue; }
    if (data.formatVersion !== 1) fail('fixtures', where + ' must use formatVersion 1.');
    const objects = data.objects;
    if (!objects || typeof objects !== 'object' || Array.isArray(objects)) { fail('fixtures', where + ' has no objects.'); continue; }
    for (const [uid, obj] of Object.entries(objects)) {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(uid)) fail('fixtures', where + ': UID "' + uid + '" is not letters and numbers.');
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { fail('fixtures', where + ': ' + uid + ' is not an object.'); continue; }
        if (!FIXTURE_TYPES.has(obj.type)) fail('fixtures', where + ': ' + uid + ' has an unsupported type "' + obj.type + '".');
        if (obj.parent === uid) fail('fixtures', where + ': ' + uid + ' is its own parent.');
        else if (!FIXTURE_SPACES.has(obj.parent) && !objects[obj.parent]) fail('fixtures', where + ': ' + uid + ' points at a missing parent "' + obj.parent + '".');
        if (FIXTURE_UI_TYPES.has(obj.type)) {
            const parent = objects[obj.parent];
            if (obj.parent !== 'ui' && !(parent && FIXTURE_UI_TYPES.has(parent.type))) fail('fixtures', where + ': ' + uid + ' must sit in the UI space or inside another UI instance.');
        } else if (obj.parent === 'ui') fail('fixtures', where + ': ' + uid + ' is not a UI instance, so it cannot sit in the UI space.');
        if (FIXTURE_CONNECTIONS.has(obj.type)) { if (obj.parent !== 'communications') fail('fixtures', where + ': ' + uid + ' must sit in Communications.'); }
        else if (obj.parent === 'communications') fail('fixtures', where + ': ' + uid + ' is not a connection, so it cannot sit in Communications.');
        if (obj.type === 'script') {
            if (obj.language !== 'vanillalua' && obj.language !== 'json') fail('fixtures', where + ': ' + uid + ' has an unknown language.');
            if (typeof obj.source !== 'string' || !obj.source.trim()) fail('fixtures', where + ': ' + uid + ' has no source.');
        }
        if (obj.type === 'worldsettings' && (typeof obj.worldName !== 'string' || !obj.worldName.trim())) fail('fixtures', where + ': ' + uid + ' has no worldName.');
    }
    for (const uid of Object.keys(objects)) {
        let node = objects[uid], steps = 0;
        while (node && !FIXTURE_SPACES.has(node.parent)) {
            node = objects[node.parent];
            if (++steps > 128) { fail('fixtures', where + ': ' + uid + ' has a circular parent chain.'); break; }
        }
    }
}

// ── Report ──
const sections = [
    ['syntax', jsFiles.length + ' JavaScript files and every inline page script'],
    ['load order', engineParts.length + ' editor scripts compiled in load order'],
    ['globals', 'no top-level name declared by two editor scripts'],
    ['icons', symbols.size + ' sprite symbols, every reference resolved'],
    ['links', 'every local src/href in ' + htmlFiles.length + ' pages'],
    ['fixtures', fixtureFiles.length + ' .vnw fixtures']
];
console.log('Vanilla3D check');
for (const [area, summary] of sections) {
    const bad = failures.filter((entry) => entry.area === area);
    console.log('  ' + (bad.length ? 'FAIL' : 'ok  ') + '  ' + area + ': ' + summary);
}
for (const entry of warnings) console.log('  note  ' + entry.area + ': ' + entry.message);
if (failures.length) {
    console.log('');
    for (const entry of failures) console.log('  [' + entry.area + '] ' + entry.message);
    console.log('\n' + failures.length + ' problem' + (failures.length === 1 ? '' : 's') + ' found.');
    process.exit(1);
}
console.log('\nAll checks passed.');
