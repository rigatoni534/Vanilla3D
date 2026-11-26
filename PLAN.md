## Context confirmed while planning

- The repo is a **static, no-build browser app**: 24 scripts in one global scope, loaded in order from [engine/index.html:1286](engine/index.html#L1286), plus `vanillalua.js` shared by the editor and the playground. No `package.json`, no tests, no lint.
- `render()` in [gl.js](engine/js/gl.js) runs `stepScripts()`, physics substeps, `stepPlayerControl(dt)` and **`uiSyncLayer()` every frame** — the per-frame O(n²) UI walk is confirmed, not just suspected.
- A Sites project **Vanilla3D** already exists (preview `vanilla3d-5z5sd3-preview`, production `vanilla3d-5z5sd3`), **both unpublished and never deployed**. Nothing in this plan depends on hosting; Phase 7 covers it if you want it.
- All files pass `node --check` today, so syntax is a safe baseline but there is no behavioural safety net.

---

# The plan

Seven phases. Each step is independently shippable, has an explicit acceptance check, and avoids mixing a refactor with a behaviour change.

## Phase 0 — Safety net (do first, ~half day)

Nothing else should land without this, because there is no test suite and the shared global scope makes every edit a potential boot failure.

| Step | Work | Files | Done when |
|---|---|---|---|
| 0.1 | `scripts/check.sh`: `node --check` every JS file, flag duplicate top-level declarations across the engine scripts, verify every `assets/icons.svg#id` reference resolves | new `scripts/` | Runs clean on `main`; a deliberately unused icon id makes it fail |
| 0.2 | Playwright smoke test (headless, no server): boot editor → `#boot-loader` hidden → canvas focused → add a block → Run → Stop → object count back to baseline | `tests/smoke.mjs` | Passes locally; runs in ~10 s |
| 0.3 | Fixture worlds committed for tests: empty plate, 3-object scene, 3 MB world with one embedded asset, one world with a script | `tests/fixtures/*.vnw` | Fixtures load in the editor and in the Player |

## Phase 1 — Stop data loss (smallest, highest value)

**1.1 Guest play must not touch Autosave** — `main.js` `installPlayMode` + `bootRestore`, `shell.js` `saveOnExit`/`autosaveNow`.
Add a `suppressAutosave` flag set for any `PLAY_MODE`; skip `bootRestore()` in play mode entirely (also removes the "your own world flashes before the host's" problem).
*Accept:* host an empty world → join as guest in a second browser → Leave → reopen the editor: Autosave is byte-identical.

**1.2 Clear undo/redo on world load** — `files.js` `applyWorldFile` (~[files.js:196](engine/js/files.js#L196)), `shortcuts.js` history, `scripting.js` `openTabs`/`activeTab`.
Add `shortcutResetHistory()` and call it (plus reset tabs) from `applyWorldFile`.
*Accept:* edit → File ▸ Open fixture → Ctrl+Z leaves the opened world unchanged.

**1.3 Make autosave failures visible** — `shell.js` `autosaveNow`, `files.js` `writeSlot`, status bar.
`writeSlot` already returns `false`; surface a one-time warning toast naming the cause (quota), a persistent "Autosave failing" status chip, and slot sizes in the File menu.
*Accept:* fill localStorage, edit, wait for autosave: warning appears once, world stays editable.

**1.4 Bound undo memory** — `shortcuts.js` `shortcutSnapshot`.
Deep-copying `sceneObjects` means every asset data URL is duplicated up to 100×. Keep asset payloads out of the snapshot (store by name/reference; assets are edited in one dialog) and cap history by estimated bytes (~32 MB) instead of entry count.
*Accept:* world with a 3 MB image, 60 edits: heap stays flat, undo still restores geometry and material.

**1.5 Browser saves move to IndexedDB** — `files.js` `readSlot`/`writeSlot`/`slotTime`/`bootRestore`, File menu.
Async wrappers with a localStorage fallback, one-time migration of the three existing slots, and a size readout.
*Accept:* save a world with assets, reload the tab, world returns; the old `...-slot-1-v1` keys are migrated and removed.
*Risk:* `readSlot` is used in several synchronous spots (`refreshFileStatus`); convert callers to await — the largest change in this phase.

## Phase 2 — Multiplayer correctness and abuse resistance

**2.1 Throttle `request-world`** — `multiplayer.js` `mpHostWorld`, `playmultiplayer.js` `playHostWorld`.
Per-peer cooldown (≥5 s) and one in-flight transfer per guest; ignore requests for a peer already receiving.
*Accept:* a scripted guest sending 100 requests triggers exactly one pack+gzip (log-counted), host CPU flat.

**2.2 Guest permission model** — `protocol.js` `v3dValidOps`/`v3dValidNetObject`, `multiplayer.js` `mpApplyIncomingOps`.
Allowlist guest-writable types; `script` and `worldsettings` become host-only, with a room toggle "Guests may edit scripts" (default off) and a visible notice in the Multiplayer dialog.
*Accept:* guest cannot create or modify a script or World Settings; host sees an ignored-edit status line; shapes still sync.

**2.3 Replicate World Settings without assets** — `files.js` `buildWorldFile`, `protocol.js`.
Move asset payloads to a separate transfer-only field so `worldsettings` fits under the 256 KB per-object cap; send assets only with the full world.
*Accept:* host changes gravity/time of day → guest updates within 250 ms; adding an asset doesn't break the ops stream.

**2.4 Validate parent chains** — `protocol.js` `v3dValidOps`.
Walk the parent chain for each upsert; reject cycles and unknown roots.
*Accept:* a crafted `ops` batch with `A.parent=B, B.parent=A` is rejected; normal model nesting still applies.

**2.5 Bump the wire version** — `protocol.js` `V3D_NET_VERSION` (1 → 2) after 2.2–2.4.
Old and new peers already refuse cleanly with a version error; this makes that the intended path.
*Accept:* an editor on `main` and one on the branch refuse to co-edit with a clear message.

**2.6 Shared room plumbing — scoped, full merge descoped** — keep `multiplayer.js` and `playmultiplayer.js` as the two mode surfaces, with their shared transport, roster, chat envelope, world transfer, chunk assembly and retry rules in `room.js`.
The full one-file `mode: 'edit' | 'play'` rewrite and the ~400-line reduction are **descoped**. The two UIs and their message handling are different enough that folding them together would add branching without removing the tested mode-specific code; the shared plumbing is the maintainable boundary.
*Accept:* both the co-edit and guest-follow flows behave as before, and the shared transfer/retry path exists once. A full module merge is not planned.

## Phase 3 — Performance foundations (unlocks big worlds)

**3.1 Parent/child index** — new `scene-index.js`, consumed by `explorer.js` `rowHtml`/`renderExplorer`, `render.js` `uiSyncLayer`/`uiPickAt`, `vanillalua.js` `vlChildNamed`/`vlDescendants`, `scene.js` `pruneOrphans`/`spaceOf`.
One `Map<parentId, childId[]>` rebuilt on structural mutation (add/delete/reparent/load), with a `spaceOfCache`.
*Accept:* 1,500-object world: `renderExplorer` < 16 ms (instrumented), idle frame time down ≥30%, no behaviour change.

**3.2 Stop re-walking the UI every frame** — `gl.js` `render()`, `render.js` `uiSyncLayer`.
Run it only when UI objects, selection, mode or simulation state changed (a `uiSceneRev` counter covers script-driven UI changes).
*Accept:* idle editor CPU (`stat-cpu`) drops noticeably; scripted UI updates still appear the same frame.

**3.3 Revision-based sync diffs** — `multiplayer.js` `mpSyncNow`, `playmultiplayer.js` `playSnapshotTick`.
Bump a per-object `rev` on mutation; send only changed ids; keep whole-scene JSON as a fallback when the revision index is stale. Pause both ticks while `document.hidden`.
*Accept:* 500-object world hosting: snapshot tick CPU < 2 ms; a moving avatar still replicates.

**3.4 (Optional, larger) culling and draw budget** — `gl.js` `drawGL`.
Distance + frustum culling per draw list, and a ring buffer of GPU buffers instead of re-uploading every mesh.
*Accept:* render distance 250 m on the 1,500-object fixture holds 60 fps at Standard.

## Phase 4 — Editor UX fixes

**4.1 Multi-selection properties** — `properties.js` `renderProperties`.
When `multiSel.size > 1`, show shared editable fields (position, size, material, colour); one undo snapshot per applied change. Add Align/Distribute next to Group/Union in the item menu.
*Accept:* select 3 blocks → set Material once → all three change; one Ctrl+Z reverts.

**4.2 Player page creator** — `player/index.html` `summarize`.
Read `creator` from the World Settings object, not the top-level file.
*Accept:* export a world with a creator → Player shows "by …".

**4.3 Pointer/touch input** — `main.js` canvas handlers.
`pointerdown/move/up` with `setPointerCapture`, two-finger orbit + pinch zoom, larger hit radii on coarse pointers, and `touch-action: none` on the canvas.
*Accept:* on a tablet or DevTools touch emulation: orbit, select, move gizmo and UI drag all work; mouse unchanged.

**4.4 Explorer search/filter** — `explorer.js` `renderExplorer`, `engine/index.html` pane header.
Filter by name/type/UID, keep parents visible, highlight matches.
*Accept:* typing "light" narrows the tree; clearing restores state.

## Phase 5 — Play-mode feel

**5.1 Avatars use the world's default player** — `playmultiplayer.js` `playCreateAvatar`/`playStepAvatars`, `scene.js` `DEFAULT_PLAYER_STATS`.
Read walk/run/jump/height from the DefaultPlayer Human; replace `dt = 0.05` with a bounded accumulator driven by real time.
*Accept:* raise DefaultPlayer walk speed in World Settings → guest avatars move faster; frame drops don't slow avatars.

**5.2 Guest camera** — `playmultiplayer.js` `playFollowAvatar`/`playSetTimeoutCamera`.
Interpolate position and yaw between snapshots, add a simple occlusion pull-in, and remove the unconditional 400 ms jump to "first world model" (gate on `!playNet.followModel`; `cameraSet` is currently dead state).
*Accept:* guest orbiting their avatar shows no per-tick judder; a late world transfer still leaves a usable camera.

**5.3 Play-mode session guard** — `sounds.js` `setSimulationRunning`, `main.js` play menu.
Stop already restores the pre-run snapshot; in play mode either hide Stop or confirm "This ends the session and restores the world".
*Accept:* solo player pressing Esc → Stop is warned, not silently reset.

## Phase 6 — Features, as separable slices

| Slice | Feature | Where | Notes |
|---|---|---|---|
| 6A | **Asset manager** (IndexedDB store, hash dedupe, thumbnails, image downscale) | new `assets-store.js`, `shell.js` world-settings dialog, `render.js` image UI | Enables 6B/6D and fixes Phase 1.4/1.5 properly |
| 6B | **Prefab library from Storage** — insert a saved model + scripts as one unit | `explorer.js`, `files.js` | Storage already saves and travels; mainly UI + clone-by-reference |
| 6C | **Scripting depth** — `wait()` in functions, `task.spawn`/`task.delay`, `pairs`, `string.*`, richer `math.*`, call-stack error traces | `vanillalua.js` (`VLUserFn` branch, `vlRootScope`) | `wait()` in functions is explicitly refused today; the generator design already supports the fix |
| 6D | **Script task panel + per-task stop** | `scripting.js`, output pane | `scriptTasks` already tracks id/name/gen |
| 6E | **Spawn points (multiple) + tags/layers + collision groups** | `scene.js` property tables, `player.js` spawn pick, `collision.js` | `Spawnpoint` currently allows exactly one prism |
| 6F | **Player world library + mobile controls** | `player/index.html`, `playmultiplayer.js` input | Replaces the single `vanilla-player-world-v1` slot; on-screen stick for guests |
| 6G | **Room quality of life** — passwords, TURN settings UI, host-loss message | `net.js`, `multiplayer.js` | `window.VANILLA_TURN` is already read but undocumented |
| 6H | **Service worker** for real offline play | new `sw.js` | Today "offline" is a ZIP download |
| 6I | **Server-authoritative rooms (spike, optional)** | new Worker + `protocol.js` transport swap | Only if PeerJS host-authority proves insufficient; see Phase 7 |

## Phase 7 — Hosting (optional, separate decision)

The app is 100% static and already Workers-compatible (plain HTML/JS/CSS, no Node). If you want a hosted URL:

1. Build mode: manifest + `sites_deploy` to **preview only**; verify routes, content types, console errors on the preview origin.
2. Production stays unpublished until you explicitly ask; publishing uses a publication slot.
3. Only if we add accounts/a world gallery: R2 for `.vnw` uploads + D1 for metadata + `@freebuff/auth` to gate uploads. Local play and PeerJS rooms keep working with no account, and `protocol.js` was written so the transport can be replaced without changing message meanings — that's the seam a Durable-Objects room (6I) would use.
4. Realtime via the platform's room binding would replace PeerJS signalling for hosted rooms; it does not need to replace direct play.

---

## Order, risk and size

| Phase | Value | Risk | Size |
|---|---|---|---|
| 0 Safety net | Enables everything | Low | S |
| 1 Data loss | Critical | Low–Medium (1.5 is the big one) | M |
| 2 Multiplayer | High | Medium (wire version bump) | M–L |
| 3 Performance | High for large worlds | Medium (touches hot paths) | L |
| 4 Editor UX | User-visible | Low | M |
| 5 Play feel | User-visible | Low | S–M |
| 6 Features | Roadmap | Per slice | L total |
| 7 Hosting | Optional | Low (preview only) | S |

**Cross-cutting rules**

- Save format stays at `formatVersion: 1`; every new field must pass `validateWorldFile` for old files (defaults in `applyWorldFile`).
- Any network message shape change bumps `V3D_NET_VERSION`.
- One undo snapshot per user action; new mutations go through the existing `shortcutWrapHistory` wrappers.
- No new dependencies: everything here is doable in plain JS (IndexedDB, Pointer Events, service worker). The only acquisition is Playwright for tests, as a dev-only dependency.

**Verification per phase:** Phase 0's script + smoke test on every step; Phase 1/2/5 also need a two-browser manual pass (host + guest) and a quota-exhausted pass; Phase 3 needs a measured before/after on the 1,500-object fixture (`stat-cpu`, `renderExplorer` timing); Phase 4 needs one tablet/touch pass. I'd record the numbers in the PR description rather than claim a speedup without them.

**Suggested first slice:** Phase 0 + 1.1–1.4 in one branch. It's small, removes the two ways you can lose work, and gives us a test harness for everything after.

---

I haven't changed anything — this turn is read-only. **Switch to Build mode** and tell me which slice to start with (I'd suggest `0 + 1.1–1.4`), and I'll implement it with the checks above. If you'd rather start at the visible end, Phase 4.1 (multi-select properties) and 4.2 (Player creator) are independent, quick wins.