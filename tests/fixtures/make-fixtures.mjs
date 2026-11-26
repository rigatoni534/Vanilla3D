#!/usr/bin/env node
// Generates the large-asset fixture the memory and transfer checks need, and leaves it out of git.
//
//   npm run fixtures        (or: node tests/fixtures/make-fixtures.mjs)
//
// The small fixtures next to this file are hand-written and reviewed. This one is generated because it is ~3 MB of
// base64: committing it would bloat every clone for no review value. It is a valid world with one real PNG asset, so
// it exercises the paths a world with an uploaded image takes (autosave quota, the 256 KB per-object network cap,
// undo memory). tests/fixtures/generated/ is gitignored.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'generated');
const OUT_FILE = path.join(OUT_DIR, 'large-asset.vnw');

// A deterministic PRNG keeps the fixture byte-identical between runs, so a size or hash change is meaningful.
let seed = 0x5eed1234;
const randomByte = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed >>> 24;
};

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
    }
    return table;
})();
function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// A real, valid PNG: no filter bytes, random pixels, so it barely compresses and the encoded file is close to its
// raw size. 1024x512 truecolour is about 1.5 MB.
function makePng(width, height) {
    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        const row = y * (stride + 1);
        raw[row] = 0;
        for (let x = 0; x < stride; x++) raw[row + 1 + x] = randomByte();
    }
    const chunk = (type, data) => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length, 0);
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(body), 0);
        return Buffer.concat([length, body, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;      // bit depth
    header[9] = 2;      // colour type: truecolour
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

const png = makePng(1024, 512);
const url = 'data:image/png;base64,' + png.toString('base64');
const world = {
    format: 'VanillaWorld',
    formatVersion: 1,
    engineVersion: '4.2.0.0',
    currentVersion: '4.2.0.0',
    createdVersion: '4.2.0.0',
    savedAt: '2026-11-26T00:00:00.000Z',
    spaces: ['world', 'storage', 'scripts', 'ui', 'communications'],
    objects: {
        WorldSettings1: {
            type: 'worldsettings', name: 'Settings', parent: 'world',
            timeOfDay: 14, gravity: 9.8, killY: -5000,
            worldName: 'Large Asset Fixture', creator: 'Vanilla3D fixtures',
            description: 'One plate and one 1.5 MB image asset.',
            maxPlayers: 8,
            assets: [{ name: 'noise.png', type: 'image/png', size: png.length, url }],
            audio: { master: 0.8, footsteps: 'procedural', impacts: 'procedural', death: 'procedural' },
            createdVersion: '4.2.0.0', currentVersion: '4.2.0.0',
            defaults: {
                player: {
                    health: 100, maxHealth: 100, walkSpeed: 3.5, runSpeed: 6, stamina: 100, maxStamina: 100,
                    runStaminaLoss: 3, jumpHeight: 1.5, jumpStaminaLoss: 20, staminaGain: 6.5
                }
            }
        },
        Plate1: {
            type: 'prism6', name: 'Plate', parent: 'world',
            x: 0, y: -1, z: 0, length: 24, width: 24, height: 1, rotX: 0, rotY: 0, rotZ: 0,
            color: '#9a9a94', material: 'concrete',
            faceColoring: false, showLabels: false, wireframe: false, locked: false,
            reactsToPhysics: false, collidable: true, anchored: true
        }
    }
};

await mkdir(OUT_DIR, { recursive: true });
const json = JSON.stringify(world, null, 2);
await writeFile(OUT_FILE, json, 'utf8');
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
console.log('wrote ' + path.relative(process.cwd(), OUT_FILE) + ' (' + mb(Buffer.byteLength(json)) + ', image ' + mb(png.length) + ')');
