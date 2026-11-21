// Vanilla Engine — release history, newest first.
// Add an entry here whenever ENGINE_VERSION changes. The About dialog warns if the running version is missing.
const VERSION_HISTORY = [
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

function renderVersionHistory() {
    const box = document.getElementById('version-history');
    if (!box) return;
    box.innerHTML = VERSION_HISTORY.map(entry => {
        const current = entry.version === ENGINE_VERSION;
        return '<article class="version-entry' + (current ? ' current' : '') + '">' +
            '<div class="version-head"><span class="version-tag">' + esc(entry.version) + '</span>' +
            '<span class="version-date">' + esc(entry.date) + '</span>' +
            (current ? '<span class="version-current">current</span>' : '') + '</div>' +
            '<ul class="version-notes">' + entry.notes.map(note => '<li>' + esc(note) + '</li>').join('') + '</ul>' +
            '</article>';
    }).join('');
    if (!VERSION_HISTORY.some(entry => entry.version === ENGINE_VERSION)) {
        box.insertAdjacentHTML('afterbegin', '<p class="version-missing">Version ' + esc(ENGINE_VERSION) + ' has no history entry yet. Add one in engine/js/version-history.js.</p>');
        console.warn('Version ' + ENGINE_VERSION + ' is missing from VERSION_HISTORY. Add it in engine/js/version-history.js.');
    }
}
