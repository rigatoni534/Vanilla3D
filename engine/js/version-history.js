// Vanilla Engine — release history, What's new, and the version this browser last opened.
// Add an entry here whenever ENGINE_VERSION changes. The About dialog and What's new both warn if the running version is missing.
const VERSION_HISTORY = [
  { version: '4.0.0.0', label: '4.0.0.0 pt 7', date: '2026-11-23', notes: ['Sounds can now use a built-in preset or an uploaded audio asset, with Pitch, 3D sound, Rolloff and a live max distance.', 'Sound playback uses Web Audio: HRTF panning follows the camera, the master volume is per world, and voices are capped so overlapping effects cannot pile up without limit.', 'Added procedural engine audio: footsteps follow the material under the feet, falling bodies get air and landing whooshes, hard impacts differ by material, and the player has a death sound.', 'World Settings has an Audio tab for master volume and for replacing footsteps, impacts or death with a preset or uploaded asset.'] },
  { version: '4.0.0.0', label: '4.0.0.0 pt 6', date: '2026-11-23', notes: ['Added SimpleEffect and AdvancedEffect, sharing one pooled particle engine and camera-facing sprites.', 'SimpleEffect has Smoke, Fire, Steam, Dust, Sparkle / Shine, Explosion, Splash and Embers presets with Rate, Speed, Size and Color.', 'AdvancedEffect adds a world asset or URL sprite, horizontal sprite sheets, alpha or additive blend, burst, lifetime, size, speed, spread, gravity, drag, spin, colour over life, fades, emitter shape and local or world space.', 'Effects can sit in World or inside a shape or model, follow their parent, and be controlled from Vanillalua with Emitting, Play(), Stop(), Emit(count), Rate and the other effect properties.'] },
  { version: '4.0.0.0', label: '4.0.0.0 pt 5', date: '2026-11-23', notes: ['Spot lights can now cast shadows. Turn Cast shadows on or off per spot; the nearest two shadow-casting spots get a perspective shadow map, and shadow quality follows the Shadows setting.', 'Point lights do not cast shadows yet. Classic lighting keeps its flat shading.', 'Added placeable Lights with point and spot modes, Color, Brightness, Range and a Cone angle for spots.', 'The nearest eight enabled lights affect shapes in Enhanced lighting; each light shows a sun marker in the editor and selected lights use the Move and Rotate gizmos.', 'Added materials to every shape: Plastic, Glass, Metal, Grass, Brick, Tile, Carpet, Wood, Concrete and Neon.', 'Materials add surface patterns and their own highlight response. The Color property still tints the result, so a material can be used in many colors.', 'Neon glows when bloom is on, Glass has a bright fresnel edge and Metal is brushed and reflective. Materials are visual only and do not change mass or collision.', 'Turned blocks and unions now collide as oriented surfaces: a tilted block rests and blocks at its real angle instead of as the box around it.', 'A union is tested cell by cell, so a hole cut through it is a hole for falling bodies and the player, and a moving union rests on its real cells.', 'The player collides as a box matching the body width and depth, not a square made from the arm span. Corners and turned walls slide instead of stopping on an invisible square, balls are round for the player, and a tilted top supports the feet at its true height.', 'Balls bounce off the cells of a union rather than its bounding box.', 'Sun rays now belong to the scene: a wall, a union or any other solid hides them instead of being painted over. The glow of the sun is masked by what the camera can actually see.', 'Bloom is calmer. Only light above the threshold glows, the glow screens over the scene instead of being added, and every preset is weaker, so bright surfaces keep their contrast.', 'Union and highlight outlines no longer draw the far side of a cut hole through the union\'s own front surface. A boundary edge is drawn only from the side its face points toward.'] },
  { version: '3.14.0.0', date: '2026-11-22', notes: ['Added graphics presets: Low, Medium, Standard, High, Extra High and Unlimited. A preset sets shadows, texture detail, anti-aliasing, render resolution, bloom and sun rays together.', 'Texture quality now follows the preset. Low and Medium draw a coarser grid at a lower resolution; High and above add 0.125 and 0.0625 Vm grid lines and a fine surface grain.', 'Added bloom and sun rays. Bright surfaces glow and the sun casts soft light shafts across the viewport. Both are off below Standard and can be switched off on their own.', 'With bloom on, the scene is drawn into an antialiased offscreen target before it is composited, so the glow does not cost edge quality. Low and Medium skip the target entirely.', 'Faster frames: the status bar is refreshed once a second instead of every frame, and the sky is only repainted when the camera, time of day or size changes.'] },
  { version: '3.13.0.1', date: '2026-11-22', notes: ['Highlight and union outlines stay continuous on flat faces and all the way around a cut hole, instead of breaking into fragments.', 'A highlight no longer draws the far side of its own shape over the front. It still shows through other objects when Appears over objects is on.', 'The official Vanilla3D mark replaces the placeholder cube in the toolbar and docs, and is used as the themed favicon.'] },
  { version: '3.13.0.0', date: '2026-11-22', notes: ['Worlds now record the version they were created in and the version their content has reached, shown in World Settings > Version.', 'Added world migration: an older world can add newer features such as the Networking script and rebuilt union surfaces without losing existing instances.', 'The Move, Rotate and Scale gizmos are now shaded 3D arrows, rings and handles instead of flat overlays.'] },
  { version: '3.12.0.0', date: '2026-11-22', notes: ['Unions are now one real surface built from their parts, not a pile of hidden blocks: their outline follows the actual creases and cut-out parts stay hollow.', 'Highlights draw only the edges the camera can see, and walls hide the parts of an outline behind them unless Appears over objects is on.', 'Added a Defaults tab to World Settings for the DefaultPlayer Human, so new Humans start with the values you choose.', 'World assets are now files uploaded from your computer and saved inside the .vnw file.', 'PeerConnection Player 1 and Player 2 are Players in Players, like ClientSocket.Player.', 'Added a Networking script that keeps a ServerSocket and a ClientSocket for every player in Communications.'] },
  { version: '3.11.0.0', date: '2026-11-22', notes: ['Added four Communications instances: ClientSocket, ServerSocket, PeerConnection and GroupConnection, each with its own properties in the Properties panel.', 'Added World > Settings, a dialog for the world name, creator, description, max player count, uploaded assets, time of day, gravity and the kill layer.', 'World details save with the world, and a downloaded .vnw file is now named after the world.'] },
  { version: '3.10.3.0', date: '2026-11-21', notes: ['Added the Player Stats HUD to the toolbox: a player name label, Health and Stamina bars, and a Local script that waits for player.ModelAdded.', 'The bars scale to MaxHealth and MaxStamina, and the HUD can be added without replacing the rest of a world.'] },
  { version: '3.10.2.0', date: '2026-11-21', notes: ['Added the player.ModelAdded event, which fires when Players.AssignModelToPlayer gives that player a new model and passes the model.', 'Documented how a Local script can wait for the player Character instead of reading it before the model is assigned.'] },
  { version: '3.10.1.0', date: '2026-11-21', notes: ['Renamed the Player property CurrentModel to Character; Players.LocalPlayer.Character and Players.x.Character return the player\'s current model.', 'New PlayerManagement scripts use player.Character, and the Players property reference documents it.'] },
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
        '<div class="version-head"><span class="version-tag">' + esc(entry.label || entry.version) + '</span>' +
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
    document.getElementById('wn-title').textContent = "What's new in " + (typeof ENGINE_RELEASE === 'string' ? ENGINE_RELEASE : ENGINE_VERSION);
    document.getElementById('wn-lede').textContent = previous
        ? (entries.length === 1 ? 'Updated from version ' + previous + '.' : entries.length + ' releases since version ' + previous + '.')
        : 'This copy is new to you; here is what the latest release changed.';
    document.getElementById('whats-new-list').innerHTML = entries.map(entry => versionEntryHTML(entry, entry.version === ENGINE_VERSION)).join('');
    openModal('modal-whats-new', '[data-close]');
}
