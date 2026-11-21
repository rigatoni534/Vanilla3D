// Vanilla Engine — File > Offline mode.
// The ZIP is assembled in this tab from the editor's own files, so a new chunk is included without changing this file.
// Files are discovered from the page that is fetched now, not from a list committed to the repository.

const OFFLINE_CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
    }
    return table;
})();

function offlineCrc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = OFFLINE_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// A store-only ZIP (method 0). The editor's files are small, and storing them keeps this dependency-free.
function offlineZip(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() >> 1) & 31);
    const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);
    const local = [], central = [];
    let offset = 0;
    for (const file of files) {
        const name = encoder.encode(file.path);
        const crc = offlineCrc32(file.bytes);
        const header = new DataView(new ArrayBuffer(30));
        header.setUint32(0, 0x04034b50, true);
        header.setUint16(4, 20, true);
        header.setUint16(6, 0x0800, true);          // file names are UTF-8
        header.setUint16(8, 0, true);                // store
        header.setUint16(10, dosTime, true);
        header.setUint16(12, dosDate, true);
        header.setUint32(14, crc, true);
        header.setUint32(18, file.bytes.length, true);
        header.setUint32(22, file.bytes.length, true);
        header.setUint16(26, name.length, true);
        header.setUint16(28, 0, true);
        local.push(new Uint8Array(header.buffer), name, file.bytes);

        const directory = new DataView(new ArrayBuffer(46));
        directory.setUint32(0, 0x02014b50, true);
        directory.setUint16(4, 20, true);
        directory.setUint16(6, 20, true);
        directory.setUint16(8, 0x0800, true);
        directory.setUint16(10, 0, true);
        directory.setUint16(12, dosTime, true);
        directory.setUint16(14, dosDate, true);
        directory.setUint32(16, crc, true);
        directory.setUint32(20, file.bytes.length, true);
        directory.setUint32(24, file.bytes.length, true);
        directory.setUint16(28, name.length, true);
        directory.setUint16(30, 0, true);
        directory.setUint16(32, 0, true);
        directory.setUint16(34, 0, true);
        directory.setUint16(36, 0, true);
        directory.setUint32(38, 0, true);
        directory.setUint32(42, offset, true);
        central.push(new Uint8Array(directory.buffer), name);

        offset += 30 + name.length + file.bytes.length;
    }
    const directorySize = central.reduce((total, part) => total + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);
    end.setUint16(20, 0, true);
    return new Blob([...local, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

function offlineReadme(version) {
    return [
        'Vanilla Engine ' + version + ' - offline copy',
        'Saved on ' + new Date().toISOString().slice(0, 10) + ' from ' + location.href.split('#')[0],
        '',
        'Open engine/index.html in a modern browser to run the editor.',
        'The editor runs from these files; the online update check is skipped.',
        '',
        'Saving: this copy stores browser saves under its own address, so saves',
        'from the online editor do not appear here. Use File > Download as .vnw',
        'before going offline, then File > Open .vnw file... in this copy.',
        '',
        'The toolbox and other external links need a connection.'
    ].join('\n');
}

async function buildOfflineCopy() {
    const pageUrl = new URL(location.href.split('#')[0]);
    const pageResponse = await fetch(pageUrl.href, { cache: 'no-store' });
    if (!pageResponse.ok) throw new Error('the editor page returned ' + pageResponse.status + '.');
    const html = await pageResponse.text();
    const version = (html.match(/const ENGINE_VERSION = '([\d.]+)'/) || [])[1] || ENGINE_VERSION;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = new URL('../', pageUrl);
    const rootPath = root.pathname;
    let pagePath = decodeURIComponent(pageUrl.pathname.slice(rootPath.length));
    if (!pagePath || pagePath.endsWith('/')) pagePath += 'index.html';
    const refs = new Map();
    const add = (raw) => {
        if (!raw) return;
        let url;
        try { url = new URL(raw, pageUrl); } catch (e) { return; }
        if (url.origin !== pageUrl.origin || !url.pathname.startsWith(rootPath)) return;
        const path = decodeURIComponent(url.pathname.slice(rootPath.length));
        if (!path || path.endsWith('/') || path === pagePath || refs.has(path)) return;
        refs.set(path, url.href);
    };
    doc.querySelectorAll('script[src]').forEach(el => add(el.getAttribute('src')));
    doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach(el => add(el.getAttribute('href')));
    doc.querySelectorAll('img[src]').forEach(el => add(el.getAttribute('src')));

    // The version query is for cache busting online; a local file does not need it.
    const offlineHtml = html.replace(/(\b(?:src|href)="[^"]*?)\?v=[^"]*"/g, '$1"');
    const encoder = new TextEncoder();
    const files = [{ path: pagePath, bytes: encoder.encode(offlineHtml) }];
    const assets = await Promise.all([...refs].map(async ([path, href]) => {
        const response = await fetch(href, { cache: 'no-store' });
        if (!response.ok) throw new Error(path + ' returned ' + response.status + '.');
        return { path, bytes: new Uint8Array(await response.arrayBuffer()) };
    }));
    files.push(...assets);
    files.push({ path: 'README.txt', bytes: encoder.encode(offlineReadme(version)) });
    return { blob: offlineZip(files), name: 'Vanilla3D-' + version + '-offline.zip', count: files.length };
}

let offlineBuilding = false;
async function downloadOfflineCopy() {
    if (location.protocol === 'file:') { toast('This copy already runs offline.', 'warn'); return; }
    if (offlineBuilding) return;
    offlineBuilding = true;
    toast('Packing the offline editor...');
    try {
        const copy = await buildOfflineCopy();
        const url = URL.createObjectURL(copy.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = copy.name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        toast('Offline copy downloaded (' + copy.count + ' files). Unzip it and open engine/index.html.');
    } catch (err) {
        toast('Could not build the offline copy: ' + err.message, 'bad');
    } finally {
        offlineBuilding = false;
    }
}
