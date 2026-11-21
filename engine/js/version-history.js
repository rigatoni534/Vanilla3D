// Vanilla Engine — release history, What's new, and the version this browser last opened.
// Add an entry here whenever ENGINE_VERSION changes. The About dialog and What's new both warn if the running version is missing.
const VERSION_HISTORY = [
  { version: '3.10.0.0', date: '2026-11-21', notes: ['Added the ProgressBar UI instance with Straight and Circular modes, fill color, transparency, blur and length.', 'Added Always show UI, a UI snap grid and gizmo step settings.', 'Added Objects, UI, Scripts, Draws and Mode stats to the status bar, with a clear Firefox memory explanation.'] },
  { version: '3.9.0.0', date: '2026-11-21', notes: ['Added background and border blur to Frames, in Properties and as BackgroundBlur and BorderBlur.', 'Added Players.LocalPlayer for Local scripts after call Players.'] },
  { version: '3.8.0.0', date: '2026-11-21', notes: ['Added What\'s new after an update: the editor shows the releases you missed, once per version.', 'Added File > Offline mode: it builds and downloads a ZIP of the editor in the tab.', 'The offline copy skips the online update check.'] },
  { version: '3.7.0.0', date: '2026-11-21', notes: ['Added this version history to the About dialog.'] },
  { version: '3.6.0.0', date: '2026-11-21', notes: ['Split the editor into eleven JavaScript files under engine/js for easier editing.'] },
  { version: '3.5.3.0', date: '2026-11-21', notes: ['Added WaitForChild(name, timeout) to wait for a child to appear.'] },
  { version: '3.5.2.0', date: '2026-11-21', notes: ['Dot lookup now reaches children by name.', 'Humans gained HealthChanged and StaminaChanged events.'] },
  { version: '3.5.1.0', date: '2026-11-21', notes: ['Scripts can now live inside UI elements and start as Local.', 'Added the reserved Communications space.'] },
  { version: '3.5.0.1', date: '2026-11-21', notes: ['Fixed the UI overlay after cached styles and live edits.'] },
  { version: '3.5.0.0', date: '2026-11-21', notes: ['Added the UI space with Frame, Text, Button, Image and Input, with preview, move and scale.', 'The interface moves into the Player on spawn and supports scripts.'] },
  { version: '3.4.2.1', date: '2026-11-20', notes: ['Cylinder contacts no longer push along a world axis.'] },
  { version: '3.4.2.0', date: '2026-11-20', notes: ['Cylinder and wedge contacts follow the real surfaces.'] },
  { version: '3.4.1.0', date: '2026-11-18', notes: ['Fixed player, cylinder and wedge collisions.'] },
  { version: '3.4.0.0', date: '2026-11-18', notes: ['Moved the site into page folders and added a toolbox with .vanilla imports.'] },
  { version: '3.3.0.0', date: '2026-11-18', notes: ['Version numbering now covers everything since 3.0.0.0.'] },
  { version: '3.1.0.0', date: '2026-11-18', notes: ['Added save slots, autosave on close and an update check.'] }
];

const LAST_SEEN_VERSION_KEY = 'vanilla-engine-last-seen-version';

function versionEntryHTML(entry, current) {
    return '<article class="version-entry' + (current ? ' current' : '') + '">' +
        '<div class="version-head"><span class="version-tag">' + esc(entry.version) + '</span>' +
        '<span class="version-date">' + esc(entry.date) + '</span>' +
        (current ? '<span class="version-current">current</span>' : '') + '</div>' +
        '<ul class="version-notes">' + entry.notes.map(note => '<li>' + esc(note) + '</li>').join('') + '</ul>' +
        '</article>';
}

function renderVersionHistory() {
    const box = document.getElementById('version-history');
    if (!box) return;
    box.innerHTML = VERSION_HISTORY.map(entry => versionEntryHTML(entry, entry.version === ENGINE_VERSION)).join('');
    if (!VERSION_HISTORY.some(entry => entry.version === ENGINE_VERSION)) {
        box.insertAdjacentHTML('afterbegin', '<p class="version-missing">Version ' + esc(ENGINE_VERSION) + ' has no history entry yet. Add one in engine/js/version-history.js.</p>');
        console.warn('Version ' + ENGINE_VERSION + ' is missing from VERSION_HISTORY. Add it in engine/js/version-history.js.');
    }
}

// True when this browser has used the editor before but has no version recorded yet (the first release with this feature).
function editorHasHistory() {
    try {
        return !!(localStorage.getItem('vanilla-editor-settings') ||
            localStorage.getItem('vanilla-engine-slot-autosave-v1') ||
            localStorage.getItem('vanilla-engine-world-save-v1'));
    } catch (e) { return false; }
}

// Shows the releases added since the last visit. A first visit only records the version; returning users get the
// current notes once even though no earlier version was stored.
function maybeShowWhatsNew() {
    let previous = '';
    try { previous = localStorage.getItem(LAST_SEEN_VERSION_KEY) || ''; } catch (e) {}
    if (!previous) {
        try { localStorage.setItem(LAST_SEEN_VERSION_KEY, ENGINE_VERSION); } catch (e) {}
        if (!editorHasHistory()) return;
        const current = VERSION_HISTORY.filter(entry => entry.version === ENGINE_VERSION);
        if (current.length) showWhatsNew(current, '');
        return;
    }
    if (versionCompare(ENGINE_VERSION, previous) <= 0) return;   // same version, or a cached older copy
    const entries = VERSION_HISTORY.filter(entry => versionCompare(entry.version, previous) > 0 && versionCompare(entry.version, ENGINE_VERSION) <= 0);
    try { localStorage.setItem(LAST_SEEN_VERSION_KEY, ENGINE_VERSION); } catch (e) {}
    showWhatsNew(entries, previous);
}

function showWhatsNew(entries, previous) {
    if (!entries.length) return;
    document.getElementById('wn-title').textContent = "What's new in " + ENGINE_VERSION;
    document.getElementById('wn-lede').textContent = previous
        ? (entries.length === 1 ? 'Updated from version ' + previous + '.' : entries.length + ' releases since version ' + previous + '.')
        : 'This copy is new to you; here is what the latest release changed.';
    document.getElementById('whats-new-list').innerHTML = entries.map(entry => versionEntryHTML(entry, entry.version === ENGINE_VERSION)).join('');
    openModal('modal-whats-new', '[data-close]');
}
