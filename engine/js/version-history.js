// Vanilla Engine — release history, What's new, and the version this browser last opened.
// Add an entry here whenever ENGINE_VERSION changes. The About dialog and What's new both warn if the running version is missing.
const VERSION_HISTORY = [
  {
    version: '4.2.0.0',
    label: '4.2.0.0',
    date: '2026-11-26',
    notes: [
      'Added the checks that keep this page loading: scripts/check.sh parses every script, compiles the editor scripts together in load order, catches a top-level name that two files both declare, and verifies every icon id and local asset link. The browser smoke test in tests/smoke.mjs opens the editor, adds a block, runs and stops the simulation, opens a .vnw, reads a script\'s output and loads a world in the Player.',
      'This release has no engine, world format or networking change. Worlds and saves from 4.1.0.0 open exactly as before.'
    ]
  },
  {
    version: '4.1.0.0',
    label: '4.1.0.0',
    date: '2026-11-26',
    notes: [
      'Rebuilt the editor boot screen around three centred pieces: Loading Editor.. at the top, the animated Golden 4.1 graphic in the middle, and the current script with its progress at the bottom. The full asset list, tips and intro buttons are gone.',
      'The splash still follows real script loads and waits for the editor to be ready, then wipes into the toolbar and workspace. The release popup and What\'s New remain behind it; reduced motion and play mode still take the fast path.'
    ]
  },
  {
    version: '4.0.0.0',
    label: '4.0.0.0 Golden',
    date: '2026-11-26',
    notes: [
      'Rebuilt the whole site on one design system: shared tokens, a real type scale and one motion family across the landing, Language, Toolbox, Player and the editor. The landing page now has real feature sections, the Toolbox adds category filters, search and previews, the Player lobby animates between states, and the Language docs gain a searchable sticky table of contents. Every icon now lives in one 24px sprite at assets/icons.svg, the external landing stylesheet is gone, and a one-time Golden release popup greets every visitor.',
      'A staged Golden boot screen appears before the editor, follows the JavaScript assets as they settle and wipes into a staggered editor reveal. The one-time Golden release popup waits for it, so the two overlays never collide.',
      'Added a full prefers-reduced-motion path, panel containment and transform-only animations, so the editor stays smooth on low-end machines. Added engine guide sections for Materials, Lights, Effects, Audio and Shortcuts, and grew the Toolbox catalogue to six items with real .vanilla downloads.',
      'Added editor multiplayer rooms over PeerJS: host or join with a 5-character code, receive the world on join, then exchange validated, rate-limited edit batches with up to four guests. Rooms include a roster, chat and coloured selection presence, with the host relaying guest edits. The Player lobby gains Host Lobby and Join Lobby; the host runs the simulation and streams live object changes, and each guest controls a host-owned avatar while the room stays open.',
      'The Player page can now open a .vnw world from a file, a drag-and-drop, the last played world or an https URL, then show its name, creator, instance count and script count. A downloaded world must be explicitly trusted before it runs, is stored locally, then opened in play mode. Play mode uses the same engine and world loader with the editor chrome removed: the simulation starts fullscreen, Escape opens Pause, Resume returns to the game and Leave game goes back to the Player page.',
      '4.0 world migration registers the newer instance types, rebuilds default-name counters, adds Plastic only where a material is missing and adds player colour defaults, while leaving existing instances and scripts untouched. Added the Sand, Rubber, Ice, Fabric and Marble materials, with their own shader patterns and highlight responses. Instance.create now accepts the union type, and its accepted-type message is generated from the live type list.',
      'Scripts can read IsTouching, Touching and TouchingAll on shapes, unions, models and Humans, and connect Touched and TouchEnded with the other instance and impact speed. Velocity now works on models and Humans. Added Material to shape scripting properties, Player SkinColor, ShirtColor and PantsColor, and the Chat module with Send, System, MessageAdded, SetEnabled and SetStyle.',
      'Undo now records changes made from the Explorer menus and drag-and-drop as well as from shortcuts, so Delete, Paste, Group, Ungroup, Union, Intersection and Add all restore with Ctrl+Z. One editor operation records one undo step, and Undo and Redo keep up to 100 snapshots with selection, counters and physics velocity. Added one shortcut dispatcher for Copy, Cut, Paste, Paste as child, Duplicate, Select all, Delete, Rename, Focus camera, Group, Union, Intersection, Undo, Redo and Escape; shortcuts are ignored while typing, while a menu or modal is open and while the simulation is running, Space still jumps in Run and Backspace never navigates back.',
      'Player animation now has a procedural state controller: Idle, Walk, Run, Jump, Fall, Land and Dead, with a short crossfade between states. The stride follows distance travelled rather than elapsed time, so feet stay planted when a player is blocked or moves slowly; walk and run blend by speed. The rig adds idle breathing, arm counter-swing, torso lean into movement and turns, head look with the camera and a landing squash, and any R6-style model with Head, Torso and Left/Right Arm and Leg parts uses it automatically.',
      'Outlines now come from welded surface adjacency: shared vertices are welded, T-junctions are split and coplanar seams are ignored. Model parts merge into one silhouette before outlining, so internal part seams no longer show, and the result is cached until a part moves or changes size. Outline depth bias scales with distance, distant selection and union lines stop flickering, and boundary edges are drawn only from the side their face points toward.',
      'Added placeable Lights with point and spot modes, Color, Brightness, Range and a Cone angle for spots. The nearest eight enabled lights affect shapes in Enhanced lighting, each light shows a sun marker and selected lights use the Move and Rotate gizmos. The nearest two shadow-casting lights get a map: spots use one perspective cone map, and points use six cube-map faces that store distance from the light, so the shadow wraps all the way around and meets without seams. The Shadows setting controls resolution, and Classic lighting keeps its flat shading.',
      'Added materials to every shape: Plastic, Glass, Metal, Grass, Brick, Tile, Carpet, Wood, Concrete and Neon. Materials add surface patterns and their own highlight response; Neon glows with bloom, Glass has a bright fresnel edge and Metal is brushed and reflective. The Color property still tints the result, and materials do not change mass or collision. Turned blocks and unions now collide as oriented surfaces, unions are tested cell by cell, and the player collides as a box matching body width and depth, so corners and turned walls slide, balls are round and tilted tops support the feet at their true height. Balls bounce off union cells rather than its bounding box.',
      'Added SimpleEffect and AdvancedEffect, sharing one pooled particle engine and camera-facing sprites. SimpleEffect has Smoke, Fire, Steam, Dust, Sparkle / Shine, Explosion, Splash and Embers presets; AdvancedEffect adds world assets or URLs, sprite sheets, alpha or additive blend, burst, lifetime, size, speed, spread, gravity, drag, spin, colour over life, fades, emitter shape and local or world space. Effects can sit in World or inside a shape or model, follow a parent and be controlled from Vanillalua with Emitting, Play(), Stop(), Emit(count), Rate and the other effect properties.',
      'Sounds can use a built-in preset or an uploaded audio asset, with Pitch, 3D sound, Rolloff and a live max distance. Web Audio HRTF panning follows the camera, master volume is per world, and voices are capped so overlapping effects cannot pile up. Procedural engine audio adds footsteps that follow the material under the feet, air and landing whooshes for falling bodies, impacts that differ by material and a player death sound; World Settings has an Audio tab for master volume and for replacing footsteps, impacts or death.',
      'Sun rays now belong to the scene: a wall, a union or any other solid hides them instead of being painted over, and the sun glow is masked by what the camera can actually see. Bloom is calmer: only light above the threshold glows, the glow screens over the scene instead of being added, and every preset is weaker so bright surfaces keep their contrast.'
    ]
  },
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
    // Do not open a modal while the boot splash is still covering the editor.
    if (window.VanillaLoader && window.VanillaLoader.active) {
        window.addEventListener('vanilla-loader-done', maybeShowWhatsNew, { once: true });
        return;
    }
    // The 4.0 launch popup already covers this release. Mark it seen and do not stack the old list behind it.
    if (window.VanillaRelease && window.VanillaRelease.pending) {
        try { localStorage.setItem(LAST_SEEN_VERSION_KEY, ENGINE_VERSION); } catch (e) {}
        return;
    }
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
