/* Vanillalua shared interpreter core. Canonical source used by Vanilla3D and the playground. */
(function (global) {
  const shared = {
    docsHTML: "<article class=\"docs-article\" id=\"docs-article\">\n            <p>This reference covers the current Vanillalua syntax and the engine APIs exposed by Vanilla3D. The standalone playground uses the same full Vanillalua interpreter as the editor, with a lightweight in-memory scene adapter; it does not connect to the editor or render objects.</p>\n            <h3>1. A first script</h3>\n            <p>Every Vanillalua script should begin by loading the Scripts space and the Instance module. Add other spaces with <code>call</code> when you need to access them.</p>\n            <pre><code>call Scripts\ncall World\nget Instance\n\nlocal block = Instance.create(\"prism6\", World)\nblock.Position = vanilla3D.Position(0, 10, 0)\nprint(\"Created:\", block)</code></pre>\n            <p><code>call World</code> loads the World space. <code>get Instance</code> loads the instance API, and <code>get Scripting</code> loads scripting utilities for UID lookup and reassignment. Setup lines belong at the top of the script.</p>\n\n            <h3>2. Variables: local and global</h3>\n            <p><code>local name = value</code> creates a variable scoped to the current script block. A variable assigned without <code>local</code> is a <b>global variable</b>: all scripts can read it while the simulation is running.</p>\n            <pre><code>call Scripts\nget Instance\n\nlocal privateCount = 1\nsharedCount = 10\nprint(privateCount)\nprint(sharedCount)</code></pre>\n            <p><b>Global write permissions:</b> the script that first creates a global may update it, and any Server script may update any global. Other Local scripts can read globals but cannot change them. Use a Server script for values that need to be centrally controlled. Global variables are runtime state and are cleared when a new simulation starts or the simulation stops.</p>\n            <p>Use clear, descriptive names for globals to avoid accidentally sharing the same name between scripts. Local variables are best for temporary values and implementation details.</p>\n            <pre><code># Server script\nsharedScore = 0\n\n# Any script can read this:\nprint(sharedScore)\n\n# The script that created sharedScore can update it,\n# and Server scripts can update it too.\nsharedScore = sharedScore + 1</code></pre>\n\n            <h3>3. Values and types</h3>\n            <ul>\n              <li><b>Numbers:</b> <code>12</code>, <code>3.5</code>, <code>0.25</code>. Decimal literals support up to two digits after the decimal point.</li>\n              <li><b>Strings:</b> <code>\"hello\"</code> or <code>'hello'</code>. Use <code>\\n</code> for a newline and <code>\\t</code> for a tab inside a string.</li>\n              <li><b>Booleans:</b> <code>True</code> and <code>False</code>.</li>\n              <li><b>Nil:</b> <code>nil</code> represents no value.</li>\n              <li><b>Instances:</b> references to objects in the scene, such as the result of <code>Instance.create()</code>.</li>\n              <li><b>Vectors:</b> three-number values used for positions and sizes.</li>\n            </ul>\n            <p>Comments start with <code>#</code> and continue to the end of the line.</p>\n\n            <h3>4. Printing output</h3>\n            <p>Use <code>print(...)</code> to send values to the Output panel. You can print strings, numbers, variables, instances, vectors, and multiple values.</p>\n            <pre><code>call World\nget Instance\nlocal score = 125\nlocal block = Instance.create(\"prism6\", World)\nprint(\"Score:\", score)\nprint(\"Block ID:\", block)\nprint(\"Position:\", block.Position)</code></pre>\n            <p>Instances print their unique ID, such as <code>Cobalt092</code>. Multiple arguments are separated in the output. If an instance has been deleted, its printed value is <code>deleted instance</code>.</p>\n\n            <h3>5. Waiting and timed scripts</h3>\n            <p><code>wait(seconds)</code> pauses the current script for the specified number of seconds. The argument must be a non-negative number with up to two decimal places. Waiting yields to other scripts and the simulation; it does not freeze the whole editor.</p>\n            <pre><code>call Scripts\ncall World\nget Instance\n\nlocal block = Instance.create(\"prism6\", World)\nblock.Position = vanilla3D.Position(0, 0, 0)\nfor i in 1, 5 do\n    block.Position.Y = block.Position.Y + 1\n    print(\"Step\", i, \"Y =\", block.Position.Y)\n    wait(0.5)\nend</code></pre>\n            <p>Use <code>wait(0)</code> to yield without an intentional delay. A long-running <code>while</code> loop yields between iterations, so other scripts can continue running.</p>\n\n            <h3>6. Operators</h3>\n            <ul>\n              <li>Math: <code>+</code>, <code>-</code>, <code>*</code>, <code>/</code>, <code>%</code></li>\n              <li>Comparisons: <code>==</code>, <code>~=</code> or <code>!=</code> (not equal), <code>&lt;</code>, <code>&gt;</code>, <code>&lt;=</code>, <code>&gt;=</code></li>\n              <li>Logic: <code>and</code>, <code>or</code>, <code>not</code></li>\n              <li>Grouping: parentheses such as <code>(a + b) * 2</code></li>\n              <li>String joining: use <code>+</code> when at least one operand is a string, e.g. <code>\"Score: \" + score</code>.</li>\n            </ul>\n            <p>Math operators require numbers, except vector addition/subtraction and vector multiplication by a number. In conditions, <code>nil</code> and <code>False</code> are false-like; other values are true-like.</p>\n\n            <h3>7. Conditions</h3>\n            <pre><code>local temperature = 18\nif temperature >= 25 then\n    print(\"Warm\")\nelse\n    print(\"Cool\")\nend</code></pre>\n            <p>Conditions use <code>if</code>, optional <code>else</code>, and <code>end</code>. Comparisons can be combined with <code>and</code>, <code>or</code>, and <code>not</code>. There is no <code>elseif</code>; nest another <code>if</code> inside <code>else</code> instead.</p>\n\n            <h3>8. Loops</h3>\n            <p>A numeric <code>for</code> loop includes both its start and end values:</p>\n            <pre><code>for i in 1, 4 do\n    print(\"Iteration\", i)\nend</code></pre>\n            <p>A <code>while</code> loop repeats while its condition remains true. Make sure something changes the condition so the loop can finish.</p>\n            <pre><code>local count = 0\nwhile count < 3 do\n    count = count + 1\n    print(count)\n    wait(0.25)\nend</code></pre>\n\n            <h3>9. Spaces and instance lookup</h3>\n            <p>Available spaces are <code>World</code>, <code>Storage</code>, <code>Scripts</code>, and <code>Players</code> (read-only). Load each with <code>call</code> before using it. Existing instances must be accessed by their unique ID (UID), not by their display name. Use <code>Instance.GetUID(name)</code> to find an ID by object name.</p>\n            <pre><code>call World\nget Scripting\nget Instance\n\nlocal blockUID = Instance.GetUID(\"Block\")\nlocal block = World.blockUID\nprint(block.Name)</code></pre>\n            <p>When a dot member on a Space matches a local variable, its string value is treated as the UID. Bracket lookup also works: <code>World[blockUID]</code>. You can pass the Space to <code>GetUID</code> when names are duplicated, for example <code>Instance.GetUID(\"Block\", World)</code>.</p>\n\n            <h3>10. The Instance module</h3>\n            <ul>\n              <li><code>Instance.create(type, space)</code> — creates and returns an instance. Supported types include <code>\"prism6\"</code>, <code>\"ball\"</code>, <code>\"model\"</code>, <code>\"script\"</code>, <code>\"worldsettings\"</code>, and <code>\"human\"</code>.</li>\n              <li><code>Instance.duplicate(instance)</code> — duplicates an instance in its current space.</li>\n              <li><code>Instance.duplicate(instance, space)</code> — duplicates it into a chosen loaded space.</li>\n              <li><code>Instance.delete(instance)</code> — deletes the instance. References to it become deleted references.</li>\n              <li><code>Instance.GetUID(name)</code> — returns the unique ID of an existing instance with that display name. Optionally pass a Space as the second argument to disambiguate duplicates.</li>\n              <li><code>Instance.SetUID(oldUID, newUID)</code> — changes an instance's unique ID. The new UID must be unique and contain only letters and numbers, starting with a letter.</li>\n            </ul>\n            <pre><code>call World\nget Instance\n\nlocal original = Instance.create(\"prism6\", World)\noriginal.Position = vanilla3D.Position(0, 3, 0)\nlocal copy = Instance.duplicate(original, World)\ncopy.Position = vanilla3D.Position(2, 3, 0)\nprint(\"Original:\", original)\nprint(\"Copy:\", copy)\nInstance.delete(copy)</code></pre>\n            <h4>Find and change a unique ID</h4>\n            <pre><code>call World\nget Scripting\nget Instance\n\nlocal blockUID = Instance.GetUID(\"Block\")\nlocal block = World.blockUID\n\nInstance.SetUID(blockUID, \"Ashburn534\")\nblockUID = Instance.GetUID(\"Block\")\nblock = World.blockUID\nprint(blockUID)\nprint(block)</code></pre>\n            <p><code>SetUID</code> rekeys the existing instance; it does not rename the visible <code>Name</code> property. Refresh the UID variable after changing it, then retrieve the instance again. If more than one object has the same name, provide its Space to <code>GetUID</code>.</p>\n\n            <h3>11. Properties and vectors</h3>\n            <p>Read or set properties using <code>instance.Property</code>. Properties are validated by the engine, so a property expects the correct kind of value.</p>\n            <table><thead><tr><th>Applies to</th><th>Properties</th></tr></thead><tbody>\n              <tr><td>Every instance</td><td><code>Name</code> (string), <code>Type</code> (read-only), <code>Parent</code> (a Space or an instance)</td></tr>\n              <tr><td>Prism blocks</td><td><code>Position</code>, <code>Size</code> (vectors, each axis at least 0.05 for Size), <code>Locked</code>, <code>Anchored</code>, <code>ReactsToPhysics</code>, <code>Collidable</code>, <code>Wireframe</code>, <code>FaceColoring</code>, <code>ShowLabels</code> (True or False)</td></tr>\n              <tr><td>World Settings</td><td><code>TimeOfDay</code> (0 to 24), <code>Gravity</code> (0 to 1000), <code>KillLayer</code> (number)</td></tr>\n              <tr><td>Humans</td><td><code>Health</code>, <code>MaxHealth</code>, <code>WalkSpeed</code>, <code>RunSpeed</code>, <code>Stamina</code>, <code>MaxStamina</code>, <code>RunStaminaLoss</code>, <code>JumpHeight</code>, <code>JumpStaminaLoss</code>, <code>StaminaGain</code> (numbers, never below 0) and <code>PlayerName</code> (text). Only Health does anything yet: at 0 the player using the model dies.</td></tr>\n              <tr><td>Blocks</td><td><code>Spawnpoint</code> (true or false). Only one block can be the spawnpoint.</td></tr>\n              <tr><td>Scripts</td><td><code>Run</code>, a function: <code>myScript.Run()</code> starts that script</td></tr>\n            </tbody></table>\n            <p><code>vanilla3D.Position(x, y, z)</code> and <code>vanilla3D.Size(x, y, z)</code> create three-component vectors. Vector axes are uppercase <code>X</code>, <code>Y</code>, and <code>Z</code>. For a prism, Position maps to its world coordinates; Size maps to width, height, and length respectively.</p>\n            <pre><code>call World\nget Instance\nlocal block = Instance.create(\"prism6\", World)\nblock.Position = vanilla3D.Position(2, 5, 0)\nblock.Size = vanilla3D.Size(2, 1, 3)\nblock.Anchored = True\nprint(block.Position.X, block.Position.Y, block.Position.Z)</code></pre>\n\n            <h3>11b. Parents and the script variable</h3>\n            <p>Inside every running script, <code>script</code> is a built-in variable that always refers to the script itself. Its <code>Parent</code> is the object the script sits under, or a Space if it is not inside an object.</p>\n            <pre><code>call Scripts\nget Instance\n\nlocal part = script.Parent\npart.Anchored = True\nprint(\"Controlling\", part.Name)\n\n# Reparent: put a new script inside the block\nlocal child = Instance.create(\"script\", World)\nchild.Parent = part</code></pre>\n            <p>Read <code>Parent</code> from any instance. Assign it an instance or a Space to move it. An instance cannot become its own parent or a child of its own descendant. If a script is not inside an object, <code>script.Parent</code> is its Space, such as <code>Scripts</code>.</p>\n\n            <h3>12. Script types and running</h3>\n            <ul>\n              <li><b>Server:</b> trusted script type for shared/global updates. Server scripts can modify any global variable.</li>\n              <li><b>Local:</b> can read global variables and modify only globals it originally created.</li>\n              <li><b>Run When: Simulation:</b> runs when Run starts the simulation.</li>\n              <li><b>Run When: Join:</b> reserved for join-trigger behavior if supported by the current project workflow.</li>\n              <li><b>Run When: Manual:</b> starts only when manually invoked, for example through the script's Run property.</li>\n            </ul>\n            <p>When the simulation starts, Server scripts begin before Local scripts. A <b>JSON</b> script cannot be run. Stopping the simulation stops active script tasks and restores the scene snapshot from before Run. Runtime globals are cleared as part of ending the simulation.</p>\n\n            <h3>12b. Players, events and threads</h3>\n        <p>The <b>Players</b> space lists every player in the game as a read-only Player instance with a <code>Name</code> and a <code>CurrentModel</code>. It is empty while you edit. When you press Run, the editor joins one player, <b>Player1</b>, and when you stop, that player leaves. Scripts cannot create, edit or delete players: <code>Players.AssignModelToPlayer</code> is the only way to change a player's model.</p>\n        <p>Use <code>get Players</code> to load the functions and events, and <code>call Players</code> to load the space.</p>\n        <ul>\n          <li><code>Players.Count</code> — the number of players, as a number.</li>\n          <li><code>Players.Players</code> — a list of the players' names, as strings.</li>\n          <li><code>Players.AddModel(model)</code> — copies a model (an instance or its UID) and everything in it into World, and returns the copy.</li>\n          <li><code>Players.AssignModelToPlayer(model, player)</code> — gives the player that model, which is also called spawning. The player's old model is removed first. The model is renamed to the player's name, moved to the spawn position and held in place. <code>player</code> is a Player instance or a player's name.</li>\n          <li><code>Players.OnPlayerJoin</code>, <code>Players.OnPlayerSpawn</code>, <code>Players.OnPlayerLeave</code> and <code>Players.OnPlayerDeath</code> — events. Each one passes the Player instance.</li>\n        </ul>\n        <p>Listen to an event with <code>:Connect</code> and a function. <code>object:Method(args)</code> is the same call as <code>object.Method(args)</code>. <code>Connect</code> returns a connection, and <code>connection:Disconnect()</code> stops listening. Each time an event fires its function runs as its own task, so it can use <code>wait()</code>. A function can be written without a name right where it is used: <code>function(player) ... end</code>. A script that connects late can read <code>Players.Players</code> to find players who already joined.</p>\n        <p><b>Death.</b> When the Health of a Human inside a player's model reaches 0, the player dies. The model's parts are released so they fall apart, then <code>OnPlayerDeath</code> fires. Giving the player a new model removes the old one.</p>\n        <p><b>Spawn position.</b> A model spawns with its feet at 0, 5, 0. If one block has <b>Spawnpoint</b> turned on, the model spawns on top of that block instead. Only one block can be the spawnpoint. The editor will not let you pick a second one, and setting a second one in a script prints a warning and is skipped. Because there is no walking or rigid-body physics yet, a living model stays where it spawns.</p>\n        <p><b>Threads.</b> <code>Scripting.NewThread(fn, threadId, ...)</code> runs <code>fn</code> in a new thread, and any extra arguments are passed to it. <code>threadId</code> is a number, a string, or <code>auto</code>, which uses the next free number. Reusing an id that is still running prints a warning and makes no new thread. A script can have at most the player count times 3 threads made this way. Server scripts share thread ids with other Server scripts, and Local scripts share theirs with other Local scripts.</p>\n        <p>New worlds start with the <code>DefaultPlayer</code> model in Storage (with a Human inside it) and a <b>PlayerManagement</b> script in Scripts that spawns every player who joins and respawns them after they die:</p>\n        <pre><code># PlayerManagement: gives every player a model when they join, and respawns them after they die.\ncall Scripts\ncall Storage\ncall World\ncall Players\nget Scripting\nget Instance\nget Players\n\nlocal template = Instance.GetUID(\"DefaultPlayer\", Storage)\n\nfunction spawn(player)\n  local model = Players.AddModel(template)\n  Players.AssignModelToPlayer(model, player)\nend\n\nfunction managePlayer(player)\n  spawn(player)\n  print(\"Handled new join by \" .. player.Name)\nend\n\nPlayers.OnPlayerJoin:Connect(function(player)\n  # Every player gets their own thread so they are managed individually.\n  Scripting.NewThread(managePlayer, auto, player)\nend)\n\nPlayers.OnPlayerDeath:Connect(function(player)\n  wait(3) # The ragdoll lies there for a moment.\n  Instance.delete(player.CurrentModel)\n  spawn(player)\nend)</code></pre>\n\n\n            <h3>13. Full example: shared status and moving block</h3>\n            <pre><code># Server script\ncall Scripts\ncall World\nget Instance\n\nmoveStatus = \"Starting\"\nlocal block = Instance.create(\"prism6\", World)\nblock.Position = vanilla3D.Position(0, 1, 0)\nmoveStatus = \"Moving\"\nfor step in 1, 6 do\n    block.Position.Y = block.Position.Y + 1\n    print(moveStatus, \"step\", step, \"position\", block.Position)\n    wait(0.25)\nend\nmoveStatus = \"Finished\"\nprint(moveStatus)</code></pre>\n\n            <h3>14. Current syntax and standalone API support</h3>\n            <p>The playground uses the same parser, analyzer, and evaluator as the current engine, including these statement and expression forms: <code>call</code> and <code>get</code> setup lines, property access, bracket indexing, chained calls, assignments to properties, vector arithmetic, and calls with multiple arguments. It emulates the current instance types: <code>prism6</code>, <code>ball</code>, <code>model</code>, <code>script</code>, <code>worldsettings</code>, and <code>human</code>.</p>\n            <pre><code>call Scripts\ncall World\nget Instance\nget Scripting\n\nlocal ball = Instance.create(\"ball\", World)\nball.Position = vanilla3D.Position(0, 4, 0)\nball.Rotation = vanilla3D.Position(0, 45, 0)\nball.Velocity = vanilla3D.Position(1, 0, 0)\nlocal uid = Instance.GetUID(ball.Name, World)\nprint(World[uid].Position + vanilla3D.Position(0, 1, 0))\nInstance.SetUID(uid, \"MyBall01\")</code></pre>\n            <p><b>Standalone limitations:</b> the interpreter and language rules are shared with Vanilla3D, but this page uses an in-memory adapter. It does not change the live project, render 3D objects, run separate engine scripts, or simulate physics. <code>wait(seconds)</code> yields execution but does not wait in real time in this synchronous tester. Engine-only behavior may be unavailable here.</p>\n          </article>",
    testerNotice: 'Playground limitation: this sandbox uses the full Vanillalua language core, but it does not provide the full Vanilla3D editor, renderer, physics integration, or every engine feature.',
    renderDocs(container) { if (container) container.innerHTML = this.docsHTML; },
    createEditorRuntime(hostContext) {
      const host = hostContext;
      const {sceneObjects, physicsVelocity, physicsVelocityFor, spaceOf, preInc, SPACE_KEYS, isShape, isInside, GRAVITY_MAX, makePrism, makeBall, dn, counters, newId, pruneOrphans } = hostContext;
// A small Lua-like language. Every script starts with `call Scripts` and `get Instance`.
const VL_KEYWORDS = new Set(['call','get','local','while','for','in','do','end','if','then','else','elseif','and','or','not','function','return','break','continue','true','false','nil']);
const VL_SPACES = { World: 'world', Storage: 'storage', Scripts: 'scripts', Players: 'players' };
const VL_MODULES = ['Instance','Scripting','Tweening','Extras','Players'];
const VL_TYPES = ['prism6', 'ball', 'model', 'script', 'worldsettings', 'human'];
const VL_GLOBALS = ['vanilla3D','print','wait','sin','cos','tan','sqrt','abs','floor','ceil','round','min','max','random','atan2','pi','type','tostring','tonumber','table','task','warn','error','deltaTime','length','auto'];
// Runtime globals are shared by all scripts during one simulation.
let vlSharedGlobals = new Map();

class VLParseError extends Error { constructor(msg, line) { super(msg); this.vlLine = line; } }
class VLError extends Error { constructor(msg, line) { super(msg); this.vlLine = line || 0; } }

// ── Lexer ──
function vlLex(src, diags) {
    const toks = [], n = src.length;
    let i = 0, line = 1;
    const numRe = /\d+(?:\.\d+)?/y, idRe = /[A-Za-z_][A-Za-z0-9_]*/y;
    while (i < n) {
        const c = src[i];
        if (c === '\n') { line++; i++; continue; }
        if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
        if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c >= '0' && c <= '9') {
            numRe.lastIndex = i; const m = numRe.exec(src);
            toks.push({ t: 'num', v: parseFloat(m[0]), line }); i += m[0].length; continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            idRe.lastIndex = i; const m = idRe.exec(src);
            toks.push({ t: VL_KEYWORDS.has(m[0]) ? 'kw' : 'name', v: m[0], line }); i += m[0].length; continue;
        }
        if (c === '"' || c === "'") {
            let j = i + 1, out = '', closed = false;
            while (j < n) {
                const d = src[j];
                if (d === '\n') break;
                if (d === '\\' && j + 1 < n) { const e = src[j + 1]; out += e === 'n' ? '\n' : e === 't' ? '\t' : e; j += 2; continue; }
                if (d === c) { closed = true; j++; break; }
                out += d; j++;
            }
            if (!closed) diags.push({ line, sev: 'error', msg: 'This string is never closed. Add a closing ' + c + '.' });
            toks.push({ t: 'str', v: out, line }); i = j; continue;
        }
        const two = src.substr(i, 2);
        if (two === '==' || two === '~=' || two === '!=' || two === '<=' || two === '>=' || two === '..') { toks.push({ t: 'op', v: two === '!=' ? '~=' : two, line }); i += 2; continue; }
        if ('+-*/%<>=(),.[]{}:#'.includes(c)) { toks.push({ t: 'op', v: c, line }); i++; continue; }
        diags.push({ line, sev: 'error', msg: 'Unexpected character "' + c + '".' });
        i++;
    }
    toks.push({ t: 'eof', v: '', line });
    return toks;
}

// ── Parser ──
function vlParse(toks, diags) {
    let p = 0;
    const isOp = (v) => toks[p].t === 'op' && toks[p].v === v;
    const isKw = (v) => toks[p].t === 'kw' && toks[p].v === v;
    const describe = (t) => t.t === 'eof' ? 'the end of the script' : t.t === 'str' ? '"' + t.v + '"' : '"' + t.v + '"';
    const fail = (msg, tok) => { throw new VLParseError(msg, (tok || toks[p]).line); };
    const expectOp = (v, what) => { if (!isOp(v)) fail('Expected "' + v + '"' + (what ? ' ' + what : '') + ' but found ' + describe(toks[p]) + '.'); return toks[p++]; };
    const expectKw = (v, what) => { if (!isKw(v)) fail('Expected "' + v + '"' + (what ? ' ' + what : '') + ' but found ' + describe(toks[p]) + '.'); return toks[p++]; };
    const STMT_START = ['call', 'get', 'local', 'while', 'for', 'if', 'end', 'else'];

    function closeBlock(kind, line) {
        if (isKw('end')) { p++; return; }
        if (toks[p].t === 'eof') fail('Missing "end" to close the "' + kind + '" on line ' + line + '.', { line });
        fail('Expected "end" to close the "' + kind + '" on line ' + line + ' but found ' + describe(toks[p]) + '.');
    }
    function sync(start, errLine) {
        if (p === start) p++;
        while (toks[p].t !== 'eof') {
            const t = toks[p];
            if (t.line > errLine) break;
            if (t.t === 'kw' && STMT_START.includes(t.v)) break;
            p++;
        }
    }
    function parseBlock() {
        const out = [];
        for (;;) {
            const t = toks[p];
            if (t.t === 'eof' || (t.t === 'kw' && (t.v === 'end' || t.v === 'else' || t.v === 'elseif'))) return out;
            const start = p;
            try { out.push(parseStatement()); }
            catch (e) {
                if (!(e instanceof VLParseError)) throw e;
                diags.push({ line: e.vlLine, sev: 'error', msg: e.message });
                sync(start, e.vlLine);
            }
        }
    }
    function parseStatement() {
        const t = toks[p];
        if (t.t === 'kw') {
            if (t.v === 'call' || t.v === 'get') {
                p++;
                const nt = toks[p];
                if (nt.t !== 'name') fail('Expected a name after "' + t.v + '".', t);
                p++;
                return { k: t.v === 'call' ? 'useSpace' : 'useModule', name: nt.v, line: t.line };
            }
            if (t.v === 'local') {
                p++;
                const nt = toks[p];
                if (nt.t !== 'name') fail('Expected a variable name after "local".', t);
                p++;
                expectOp('=', 'after "local ' + nt.v + '"');
                return { k: 'local', name: nt.v, expr: parseExpr(), line: t.line };
            }
            if (t.v === 'function') { p++; const name=toks[p++]; if(!name||name.t!=='name')fail('Expected a function name.',t); expectOp('(','after function name'); const params=[]; if(!isOp(')')){do{const param=toks[p++];if(!param||param.t!=='name')fail('Expected parameter name.',t);params.push(param.v);}while(isOp(',')&&(p++,true));}expectOp(')','after parameters');const body=parseBlock();closeBlock('function',t.line);return {k:'function',name:name.v,params,body,line:t.line}; }
            if (t.v === 'return') { p++; return {k:'return',expr:(isKw('end')||isKw('else')||isKw('elseif')||toks[p].t==='eof'||toks[p].line>t.line)?null:parseExpr(),line:t.line}; }
            if (t.v === 'break' || t.v === 'continue') { p++; return {k:t.v,line:t.line}; }
            if (t.v === 'while') {
                p++;
                const cond = parseExpr();
                expectKw('do', 'after the while condition');
                const body = parseBlock();
                closeBlock('while', t.line);
                return { k: 'while', cond, body, line: t.line };
            }
            if (t.v === 'for') {
                p++;
                const v = toks[p];
                if (v.t !== 'name') fail('Expected a loop variable name after "for".', t);
                p++;
                expectKw('in', 'after the loop variable');
                const from = parseExpr();
                expectOp(',', 'between the start and end numbers');
                const to = parseExpr();
                expectKw('do', 'after the loop range');
                const body = parseBlock();
                closeBlock('for', t.line);
                return { k: 'for', name: v.v, from, to, body, line: t.line };
            }
            if(t.v==='if'){p++;const cond=parseExpr();expectKw('then','after the if condition');const body=parseBlock();let els=null;if(isKw('elseif')){const et=toks[p++],ec=parseExpr();expectKw('then','after the elseif condition');const eb=parseBlock();els=[{k:'if',cond:ec,body:eb,els:null,line:et.line}];let tail=els[0];while(isKw('elseif')){const xt=toks[p++],xc=parseExpr();expectKw('then','after the elseif condition');const xb=parseBlock();tail.els=[{k:'if',cond:xc,body:xb,els:null,line:xt.line}];tail=tail.els[0];}if(isKw('else')){p++;tail.els=parseBlock();}}else if(isKw('else')){p++;els=parseBlock();}closeBlock('if',t.line);return {k:'if',cond,body,els,line:t.line};}
            fail('Unexpected "' + t.v + '".', t);
        }
        const e = parseSuffixed();
        if (isOp('=')) {
            if (e.k !== 'name' && e.k !== 'member' && e.k !== 'index') fail('You can only assign to a variable or a property.', t);
            p++;
            return { k: 'assign', target: e, expr: parseExpr(), line: t.line };
        }
        if (e.k === 'callx') return { k: 'exprstmt', expr: e, line: t.line };
        fail('This is not a statement. Expected an assignment or a function call.', t);
    }
    function parseExpr() { return parseOr(); }
    function parseOr() {
        let l = parseAnd();
        while (isKw('or')) { const t = toks[p++]; l = { k: 'bin', op: 'or', l, r: parseAnd(), line: t.line }; }
        return l;
    }
    function parseAnd() {
        let l = parseCmp();
        while (isKw('and')) { const t = toks[p++]; l = { k: 'bin', op: 'and', l, r: parseCmp(), line: t.line }; }
        return l;
    }
    function parseCmp() {
        let l = parseConcat();
        while (toks[p].t === 'op' && ['==', '~=', '<', '>', '<=', '>='].includes(toks[p].v)) { const t = toks[p++]; l = { k: 'bin', op: t.v, l, r: parseConcat(), line: t.line }; }
        return l;
    }
    function parseConcat() { let l=parseAdd(); if(isOp('..')) { const t=toks[p++]; l={k:'bin',op:'..',l,r:parseConcat(),line:t.line}; } return l; }
    function parseAdd() {
        let l = parseMul();
        while (isOp('+') || isOp('-')) { const t = toks[p++]; l = { k: 'bin', op: t.v, l, r: parseMul(), line: t.line }; }
        return l;
    }
    function parseMul() {
        let l = parseUnary();
        while (isOp('*') || isOp('/') || isOp('%')) { const t = toks[p++]; l = { k: 'bin', op: t.v, l, r: parseUnary(), line: t.line }; }
        return l;
    }
    function parseUnary() {
        if (isKw('not')) { const t = toks[p++]; return { k: 'un', op: 'not', e: parseUnary(), line: t.line }; }
        if (isOp('-')) { const t=toks[p++]; return {k:'un',op:'-',e:parseUnary(),line:t.line}; }
        if (isOp('#')) { const t=toks[p++]; return {k:'un',op:'#',e:parseUnary(),line:t.line}; }
        return parseSuffixed();
    }
    function parseSuffixed() {
        let e = parsePrimary();
        for (;;) {
            if (isOp('.')) {
                p++;
                const nt = toks[p];
                if (nt.t !== 'name') fail('Expected a property name after ".".');
                p++;
                e = { k: 'member', obj: e, name: nt.v, line: nt.line };
            } else if (isOp(':')) {
                p++;
                const nt = toks[p];
                if (!nt || nt.t !== 'name') fail('Expected a method name after ":".');
                p++;
                if (!isOp('(')) fail('A ":" call must be written like object:Method(...). Add "(" after ' + nt.v + '.');
                e = { k: 'member', obj: e, name: nt.v, line: nt.line };
            } else if (isOp('[')) {
                const t = toks[p++];
                const key = parseExpr();
                expectOp(']', 'to close the index');
                e = { k: 'index', obj: e, key, line: t.line };
            } else if (isOp('(')) {
                const t = toks[p++];
                const args = [];
                if (!isOp(')')) { do { args.push(parseExpr()); } while (isOp(',') && (p++, true)); }
                expectOp(')', 'to close the function call');
                e = { k: 'callx', fn: e, args, line: t.line };
            } else break;
        }
        return e;
    }
    function parsePrimary() {
        const t = toks[p];
        if (t.t === 'kw' && t.v === 'function') {
            p++;
            expectOp('(', 'after function');
            const params = [];
            if (!isOp(')')) { do { const param = toks[p++]; if (!param || param.t !== 'name') fail('Expected parameter name.', t); params.push(param.v); } while (isOp(',') && (p++, true)); }
            expectOp(')', 'after parameters');
            const body = parseBlock();
            closeBlock('function', t.line);
            return { k: 'fnexpr', params, body, line: t.line };
        }
        if (t.t === 'num') { p++; return { k: 'num', v: t.v, line: t.line }; }
        if (t.t === 'str') { p++; return { k: 'str', v: t.v, line: t.line }; }
        if (t.t === 'name' || (t.t === 'kw' && ['true','false','nil'].includes(t.v))) {
            p++;
            if (t.v === 'True' || t.v === 'true') return { k: 'bool', v: true, line: t.line };
            if (t.v === 'False' || t.v === 'false') return { k: 'bool', v: false, line: t.line };
            if (t.v === 'nil') return { k: 'nil', line: t.line };
            return { k: 'name', name: t.v, line: t.line };
        }
        if (isOp('{')) { p++; const items=[],fields=[]; while(!isOp('}')&&toks[p].t!=='eof'){if((toks[p].t==='name'||toks[p].t==='str')&&toks[p+1]&&toks[p+1].v==='='){const key=toks[p++];p++;fields.push({key:key.v,value:parseExpr()});}else items.push(parseExpr());if(!isOp(','))break;p++;}expectOp('}','to close the table');return {k:'table',items,fields,line:t.line};}
        if (isOp('(')) { p++; const e = parseExpr(); expectOp(')', 'to close the parentheses'); return e; }
        fail('Expected a value but found ' + describe(t) + '.');
    }

    const prog = [];
    while (toks[p].t !== 'eof') {
        prog.push(...parseBlock());
        if (toks[p].t === 'kw' && (toks[p].v === 'end' || toks[p].v === 'else')) {
            diags.push({ line: toks[p].line, sev: 'error', msg: 'Unexpected "' + toks[p].v + '". There is nothing to close here.' });
            p++;
        }
    }
    return prog;
}

// ── Analyzer (errors and warnings shown in the editor margin) ──
function vlAnalyze(ast, diags) {
    const called = new Set(), got = new Set();
    const scopes = [new Map()];
    let sawCode = false;
    const err = (line, msg) => diags.push({ line, sev: 'error', msg });
    const warn = (line, msg) => diags.push({ line, sev: 'warning', msg });
    const declare = (name, line, warnUnused) => scopes[scopes.length - 1].set(name, { line, used: false, warnUnused });
    const find = (name) => { for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(name)) return scopes[i].get(name); return null; };
    const push = () => scopes.push(new Map());
    const pop = () => {
        for (const [name, v] of scopes.pop()) if (v.warnUnused && !v.used) warn(v.line, '"' + name + '" is declared but never used.');
    };

    function resolveName(name, line) {
        const v = find(name);
        if (v) { v.used = true; return; }
        if (VL_GLOBALS.includes(name)) return;
        if (name === 'Players') { if (!(called.has('Players') || got.has('Players') || preInc('Players') || preInc('GetPlayers'))) err(line, '"Players" is not loaded. Add "get Players" (functions and events) or "call Players" (the space) at the top of the script.'); return; }
        if (VL_SPACES[name]) { if (!(called.has(name) || preInc(name))) err(line, '"' + name + '" is not loaded. Add "call ' + name + '" at the top of the script.'); return; }
        if (VL_MODULES.includes(name)) { if (!(got.has(name) || preInc(name))) err(line, '"' + name + '" is not loaded. Add "get ' + name + '" at the top of the script.'); return; }
        // This may be a global assigned by another script; the runtime checks it exists.
    }
    function expr(e) {
        switch (e.k) {
            case 'name': resolveName(e.name, e.line); break;
            case 'member':
                if (e.obj.k === 'name' && e.obj.name === 'Players' && !find('Players') && ['Count', 'Players', 'AddModel', 'AssignModelToPlayer', 'OnPlayerJoin', 'OnPlayerSpawn', 'OnPlayerLeave', 'OnPlayerDeath'].includes(e.name) && !(got.has('Players') || preInc('GetPlayers')))
                    err(e.line, 'Players.' + e.name + ' needs "get Players" at the top of the script.');
                expr(e.obj); break;
            case 'fnexpr': push(); for (const n of e.params) declare(n, e.line, false); block(e.body); pop(); break;
            case 'index': expr(e.obj); expr(e.key); break;
            case 'un': expr(e.e); break;
            case 'bin': expr(e.l); expr(e.r); break;
            case 'callx': {
                const f = e.fn;
                if (f.k === 'member' && f.obj.k === 'name' && f.obj.name === 'Instance' && !find('Instance')) {
                    const m = f.name, n = e.args.length;
                    if (m === 'create') {
                        if (n !== 2) err(e.line, 'Instance.create needs 2 arguments: (type, space).');
                        if (e.args[0] && e.args[0].k === 'str' && !VL_TYPES.includes(e.args[0].v)) err(e.line, 'Unknown instance type "' + e.args[0].v + '". Use prism6, ball, model, script, worldsettings or human.');
                        if (e.args[1] && (e.args[1].k === 'str' || e.args[1].k === 'num' || e.args[1].k === 'bool')) err(e.line, 'The second argument of Instance.create must be a loaded Space such as World.');
                    } else if (m === 'delete') {
                        if (n !== 1) err(e.line, 'Instance.delete needs 1 argument: (instance).');
                    } else if (m === 'duplicate') {
                        if (n < 1 || n > 2) err(e.line, 'Instance.duplicate needs (instance) or (instance, space).');
                    } else if (m === 'GetUID') {
                        if (n < 1 || n > 2) err(e.line, 'Instance.GetUID needs (name) or (name, space).');
                    } else if (m === 'SetUID') {
                        if (n !== 2) err(e.line, 'Instance.SetUID needs (oldUID, newUID).');
                    } else {
                        err(e.line, 'Instance has no function "' + m + '". Available: create, delete, duplicate, GetUID, SetUID.');
                    }
                }
                expr(f);
                e.args.forEach(expr);
                break;
            }
        }
    }
    function block(stmts, top) {
        for (const s of stmts) {
            if (s.k === 'useSpace') {
                if (!VL_SPACES[s.name]) err(s.line, 'Unknown space "' + s.name + '". You can call: World, Storage, Scripts, Players.');
                else {
                    if (called.has(s.name)) warn(s.line, '"call ' + s.name + '" is already in this script.');
                    called.add(s.name);
                }
                if (sawCode) warn(s.line, 'Put "call" and "get" lines at the top of the script.');
                continue;
            }
            if (s.k === 'useModule') {
                if (!VL_MODULES.includes(s.name)) err(s.line, 'Unknown module "' + s.name + '". You can get: Instance, Scripting, Tweening, Extras, Players.');
                else {
                    if (got.has(s.name)) warn(s.line, '"get ' + s.name + '" is already in this script.');
                    got.add(s.name);
                }
                if (sawCode) warn(s.line, 'Put "call" and "get" lines at the top of the script.');
                continue;
            }
            sawCode = true;
            switch (s.k) {
                case 'local': expr(s.expr); declare(s.name, s.line, true); break;
                case 'function': declare(s.name,s.line,false); push(); s.params.forEach(n=>declare(n,s.line,false)); block(s.body); pop(); break;
                case 'return': if(s.expr)expr(s.expr); break;
                case 'break': case 'continue': break;
                case 'assign': {
                    if (s.target.k === 'name') {
                        if (!find(s.target.name) && !VL_GLOBALS.includes(s.target.name) && !VL_SPACES[s.target.name] && !VL_MODULES.includes(s.target.name)) declare(s.target.name, s.target.line, false);
                    } else expr(s.target);
                    expr(s.expr);
                    break;
                }
                case 'exprstmt': expr(s.expr); break;
                case 'while':
                    expr(s.cond);
                    if (s.cond.k === 'bool' && s.cond.v === false) warn(s.line, 'This loop never runs because its condition is False.');
                    push(); block(s.body); pop();
                    break;
                case 'for':
                    expr(s.from); expr(s.to);
                    if (s.from.k === 'num' && s.to.k === 'num' && s.from.v > s.to.v) warn(s.line, 'This loop never runs because the start is bigger than the end.');
                    push(); declare(s.name, s.line, false); block(s.body); pop();
                    break;
                case 'if':
                    expr(s.cond);
                    push(); block(s.body); pop();
                    if (s.els) { push(); block(s.els); pop(); }
                    break;
            }
        }
    }
    block(ast, true);
    pop();
    if (!(called.has('Scripts') || preInc('Scripts'))) err(1, 'Missing "call Scripts". Every script must start with call Scripts.');
    if (!(got.has('Instance') || preInc('Instance'))) err(1, 'Missing "get Instance". Every script must get Instance.');
}

// ── JSON scripts: syntax check only ──
function jsonDiagnostics(src, diags) {
    if (!src.trim()) return;
    try { JSON.parse(src); }
    catch (e) {
        let line = 1;
        const m = /line (\d+)/.exec(e.message), pm = /position (\d+)/.exec(e.message);
        if (m) line = parseInt(m[1], 10);
        else if (pm) line = src.slice(0, parseInt(pm[1], 10)).split('\n').length;
        diags.push({ line, sev: 'error', msg: 'Invalid JSON: ' + e.message.replace(/^JSON\.parse: /, '') });
    }
}

const SCRIPT_TEMPLATE = 'call Scripts\nget Instance\n\n# Write your Vanillalua here.\n';
// A Human only stores its stats for now. It has no body, does not render and nothing reads these values yet.
const HUMAN_DEFAULTS = { health: 100, maxHealth: 100, walkSpeed: 1.3, runSpeed: 3.5, stamina: 100, maxStamina: 100, runStaminaLoss: 3, jumpHeight: 0.5, jumpStaminaLoss: 20, staminaGain: 6.5 };
function makeHuman(playerName, parent) { return Object.assign({ type: 'human', name: 'Human', parent, playerName }, HUMAN_DEFAULTS); }
function newScriptData(name, parent) {
    return { type: 'script', name, parent, scriptType: 'Server', runWhen: 'simulation', language: 'vanillalua', source: SCRIPT_TEMPLATE };
}
function ensureScript(o) {
    if (o.scriptType !== 'Local' && o.scriptType !== 'Server') o.scriptType = 'Server';
    if (!['simulation', 'join', 'manual'].includes(o.runWhen)) o.runWhen = 'simulation';
    if (o.language !== 'vanillalua' && o.language !== 'json') o.language = 'vanillalua';
    if (typeof o.source !== 'string') o.source = SCRIPT_TEMPLATE;
    return o;
}
function computeDiagnostics(o) {
    const diags = [];
    let ast = null;
    if (o.language === 'json') jsonDiagnostics(o.source, diags);
    else {
        ast = vlParse(vlLex(o.source, diags), diags);
        vlAnalyze(ast, diags);
    }
    diags.sort((a, b) => a.line - b.line);
    return { ast, diags };
}

// ── Runtime values ──
class VLFn { constructor(name, fn) { this.name = name; this.fn = fn; } }
class VLTable { constructor(){this.items=new Map();} get(k){return this.items.get(k);} set(k,v){if(v==null)this.items.delete(k);else this.items.set(k,v);} length(){let n=0;while(this.items.has(n+1))n++;return n;} }
class VLUserFn { constructor(name,params,body,closure){this.name=name;this.params=params;this.body=body;this.closure=closure;} }
class VLControl extends Error { constructor(kind,value){super(kind==='break'?'break used outside a loop.':kind==='continue'?'continue used outside a loop.':'return used outside a function.');this.name='VLControl';this.kind=kind;this.value=value;} }
class VLWait { constructor(seconds) { this.seconds = seconds; } }
class VLModule { constructor(name, members) { this.name = name; this.members = members; } }
class VLSpace { constructor(name, id) { this.name = name; this.id = id; } }
class VLInst { constructor(id) { this.id = id; } }
// Players is both a module (functions and events) and a read-only space (Player instances), so one object serves both.
class VLPlayersObj extends VLModule { constructor() { super('Players', {}); this.id = 'players'; } }
class VLEvent { constructor(name) { this.name = name; this.handlers = []; } }
class VLConnection { constructor(ev, h) { this.ev = ev; this.h = h; } }
const VL_AXES = { X: 0, Y: 1, Z: 2 };
class VLVec {
    constructor(x, y, z, bind) { this.v = [x, y, z]; this.bind = bind || null; }
    target() { const o = sceneObjects[this.bind.id]; if (!o) throw new VLError('This instance was deleted.'); return this.bind.vel ? physicsVelocityFor(this.bind.id) : o; }
    get(i) { if (this.bind) return this.target()[this.bind.keys[i]]; return this.v[i]; }
    set(i, n) { if (this.bind) this.target()[this.bind.keys[i]] = n; else this.v[i] = n; }
}
class VLScope {
    constructor(parent) { this.vars = new Map(); this.parent = parent || null; }
    find(n) { let s = this; while (s) { if (s.vars.has(n)) return s; s = s.parent; } return null; }
}

const vlInstCache = new Map();
const vlSpaces = { world: new VLSpace('World', 'world'), storage: new VLSpace('Storage', 'storage'), scripts: new VLSpace('Scripts', 'scripts'), players: new VLPlayersObj() };
function vlInst(id) { let r = vlInstCache.get(id); if (!r) { r = new VLInst(id); vlInstCache.set(id, r); } return r; }
function vlObj(inst, line) { const o = sceneObjects[inst.id]; if (!o) throw new VLError('This instance was deleted.', line); return o; }

const vlRound = (n) => Math.round(n * 1e6) / 1e6;
function vlTypeName(v) {
    if (v === null || v === undefined) return 'nil';
    if (v instanceof VLVec) return 'vector';
    if (v instanceof VLInst) return 'instance';
    if (v instanceof VLSpace) return 'space';
    if (v instanceof VLFn || v instanceof VLUserFn) return 'function';
    if (v instanceof VLTable) return 'table';
    if (v instanceof VLModule) return 'module';
    if (v instanceof VLEvent) return 'event';
    if (v instanceof VLConnection) return 'connection';
    return typeof v;
}
function vlStr(v) {
    if (v === null || v === undefined) return 'nil';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'number') return String(vlRound(v));
    if (v instanceof VLVec) return '(' + [0, 1, 2].map(i => vlRound(v.get(i))).join(', ') + ')';
    if (v instanceof VLTable) return '{' + [...v.items].map(([k,x])=>(typeof k==='number'?'['+k+']':k)+' = '+vlStr(x)).join(', ') + '}';
    if (v instanceof VLUserFn) return 'function '+v.name+'(...)';
    if (v instanceof VLInst) return sceneObjects[v.id] ? v.id : 'deleted instance';
    if (v instanceof VLSpace || v instanceof VLModule) return v.name;
    if (v instanceof VLFn) return 'function ' + v.name;
    if (v instanceof VLEvent) return 'event ' + v.name;
    if (v instanceof VLConnection) return 'connection';
    return String(v);
}
const vlTruthy = (v) => v !== null && v !== undefined && v !== false;

const VL_PROPS = {
    common: { Name: ['name', 'str'] },
    model: {},
    prism6: {
        Locked: ['locked', 'bool'], Anchored: ['anchored', 'bool'], ReactsToPhysics: ['reactsToPhysics', 'bool'], Collidable: ['collidable', 'bool'],
        Wireframe: ['wireframe', 'bool'], FaceColoring: ['faceColoring', 'bool'], Color: ['color', 'str'], ShowLabels: ['showLabels', 'bool'], Spawnpoint: ['spawnpoint', 'bool']
    },
    ball: {
        Locked: ['locked', 'bool'], Anchored: ['anchored', 'bool'], ReactsToPhysics: ['reactsToPhysics', 'bool'], Collidable: ['collidable', 'bool'],
        Wireframe: ['wireframe', 'bool'], FaceColoring: ['faceColoring', 'bool'], Color: ['color', 'str'], ShowLabels: ['showLabels', 'bool']
    },
    worldsettings: { TimeOfDay: ['timeOfDay', 'num'], Gravity: ['gravity', 'num'], KillLayer: ['killY', 'num'] },
    human: {
        Health: ['health', 'num'], MaxHealth: ['maxHealth', 'num'], WalkSpeed: ['walkSpeed', 'num'], RunSpeed: ['runSpeed', 'num'],
        Stamina: ['stamina', 'num'], MaxStamina: ['maxStamina', 'num'], RunStaminaLoss: ['runStaminaLoss', 'num'],
        JumpHeight: ['jumpHeight', 'num'], JumpStaminaLoss: ['jumpStaminaLoss', 'num'], StaminaGain: ['staminaGain', 'num'], PlayerName: ['playerName', 'str']
    },
    player: {},
    script: {}
};

VL_PROPS.ball = Object.assign({}, VL_PROPS.prism6); delete VL_PROPS.ball.Spawnpoint;
function vlGetProp(inst, name, line) {
    const o = vlObj(inst, line);
    if (name === 'Type') return o.type;
    if (name === 'Parent') return SPACE_KEYS.includes(o.parent) ? vlSpaces[o.parent] : vlInst(o.parent);
    if (isShape(o) && name === 'Velocity') return new VLVec(0, 0, 0, { id: inst.id, keys: ['x', 'y', 'z'], vel: true });
    if (isShape(o) && name === 'Rotation') return new VLVec(0, 0, 0, { id: inst.id, keys: ['rotX', 'rotY', 'rotZ'] });
    if (isShape(o) && name === 'Position') return new VLVec(0, 0, 0, { id: inst.id, keys: ['x', 'y', 'z'] });
    if (isShape(o) && name === 'Size') return new VLVec(0, 0, 0, { id: inst.id, keys: ['width', 'height', 'length'] });
    if (o.type === 'player' && name === 'CurrentModel') return o.currentModel && sceneObjects[o.currentModel] ? vlInst(o.currentModel) : null;
    if (o.type === 'script' && name === 'Run') return new VLFn('Run', (args, ln) => { vlRunScript(inst.id, ln); return null; });
    const def = VL_PROPS.common[name] || (VL_PROPS[o.type] || {})[name];
    if (!def) throw new VLError('"' + name + '" is not a property of ' + o.type + '.', line);
    if (def[0] === 'collidable') return o.collidable !== false;
    return def[1] === 'bool' ? !!o[def[0]] : o[def[0]];
}
function vlSetProp(inst, name, v, line) {
    const o = vlObj(inst, line);
    if (name === 'Type') throw new VLError('Type is read-only.', line);
    if (o.type === 'player') throw new VLError(name === 'CurrentModel' ? 'CurrentModel can only be changed with Players.AssignModelToPlayer.' : 'A Player is read-only.', line);
    if (o.type === 'human' && name === 'Name') throw new VLError('A Human is always named Human. Set PlayerName instead.', line);
    if (name === 'Parent') {
        if (v instanceof VLSpace) o.parent = v.id;
        else if (v instanceof VLInst) { vlObj(v, line); if (v.id === inst.id || isInside(v.id, inst.id)) throw new VLError('An instance cannot be its own parent or a child of its own descendant.', line); o.parent = v.id; }
        else throw new VLError('Parent needs an instance or a Space such as World.', line);
        host.markUIDirty(); return;
    }
    if (isShape(o) && name === 'Velocity') {
        if (!(v instanceof VLVec)) throw new VLError('Velocity needs a vector, for example vanilla3D.Position(0, 5, 0).', line);
        const vel = physicsVelocityFor(inst.id);
        vel.x = v.get(0); vel.y = v.get(1); vel.z = v.get(2);
        return;
    }
    if (isShape(o) && (name === 'Position' || name === 'Size' || name === 'Rotation')) {
        if (!(v instanceof VLVec)) throw new VLError(name + ' needs a vector, for example vanilla3D.' + name + '(0, 1, 0).', line);
        const keys = name === 'Position' ? ['x', 'y', 'z'] : (name === 'Rotation' ? ['rotX', 'rotY', 'rotZ'] : ['width', 'height', 'length']);
        for (let i = 0; i < 3; i++) { const n = v.get(i); o[keys[i]] = name === 'Size' ? Math.max(0.05, n) : n; }
        return;
    }
    const def = VL_PROPS.common[name] || (VL_PROPS[o.type] || {})[name];
    if (!def) throw new VLError('"' + name + '" is not a property of ' + o.type + '.', line);
    const kind = def[1];
    if (kind === 'bool' && typeof v !== 'boolean') throw new VLError(name + ' needs True or False.', line);
    if (kind === 'num' && (typeof v !== 'number' || !Number.isFinite(v))) throw new VLError(name + ' needs a number.', line);
    if (kind === 'str' && typeof v !== 'string') throw new VLError(name + ' needs a string.', line);
    if (name === 'Color') {
        let h = v.trim().replace(/^#/, '');
        if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map(c => c + c).join('');
        if (!/^[0-9a-f]{6}$/i.test(h)) throw new VLError('Color needs a hex string such as "#ff8800".', line);
        v = ('#' + h).toLowerCase();
    }
    if (name === 'TimeOfDay') v = Math.max(0, Math.min(24, v));
    if (name === 'Gravity') v = Math.max(0, Math.min(GRAVITY_MAX, v));
    if (o.type === 'human' && kind === 'num') v = Math.max(0, v);
    if (name === 'Spawnpoint' && v === true && !o.spawnpoint) {
        const other = Object.values(sceneObjects).find(x => x !== o && x.type === 'prism6' && x.spawnpoint);
        if (other) { logOutput('warning', 'Spawnpoint skipped: "' + other.name + '" is already the spawnpoint. Only one is allowed for now.'); return; }
    }
    o[def[0]] = v;
    if (name === 'Anchored' && v) physicsVelocity.set(inst.id, { x: 0, y: 0, z: 0 });
    if (name === 'Name') host.markUIDirty();
}
function vlGetMember(obj, name, line) {
    if(obj instanceof VLTable)return name==='length'?obj.length():obj.get(name);
    if (obj instanceof VLVec) {
        if(name in VL_AXES)return obj.get(VL_AXES[name]);
        if(name==='Magnitude'||name==='magnitude')return Math.hypot(obj.get(0),obj.get(1),obj.get(2));
        if(name==='Unit'||name==='unit'){const m=Math.hypot(obj.get(0),obj.get(1),obj.get(2));return m?new VLVec(obj.get(0)/m,obj.get(1)/m,obj.get(2)/m):new VLVec(0,0,0);}
        if(name==='Dot'||name==='dot')return new VLFn('Vector3.Dot',(a,l)=>{if(!(a[0] instanceof VLVec))throw new VLError('Dot needs a vector.',l);return obj.get(0)*a[0].get(0)+obj.get(1)*a[0].get(1)+obj.get(2)*a[0].get(2);});
        if(name==='Distance'||name==='distance')return new VLFn('Vector3.Distance',(a,l)=>{if(!(a[0] instanceof VLVec))throw new VLError('Distance needs a vector.',l);return Math.hypot(obj.get(0)-a[0].get(0),obj.get(1)-a[0].get(1),obj.get(2)-a[0].get(2));});
    }
    if (obj instanceof VLPlayersObj) return vlPlayersMember(name, line);
    if (obj instanceof VLEvent) {
        if (name === 'Connect') return new VLFn(obj.name + ':Connect', (args, ln, ctx) => {
            if (!(args[0] instanceof VLUserFn)) throw new VLError(obj.name + ':Connect needs a function, for example function(player) ... end.', ln);
            const h = { fn: args[0], ctx };
            obj.handlers.push(h);
            return new VLConnection(obj, h);
        });
        throw new VLError('An event only has Connect.', line);
    }
    if (obj instanceof VLConnection) {
        if (name === 'Disconnect') return new VLFn('Disconnect', () => { const i = obj.ev.handlers.indexOf(obj.h); if (i >= 0) obj.ev.handlers.splice(i, 1); return null; });
        if (name === 'Connected') return obj.ev.handlers.includes(obj.h);
        throw new VLError('A connection only has Disconnect and Connected.', line);
    }
    if (obj instanceof VLInst) return vlGetProp(obj, name, line);
    if (obj instanceof VLSpace) {
        // Spaces are indexed by unique instance ID, never by display name.
        const o = sceneObjects[name];
        if (o && spaceOf(o) === obj.id) return vlInst(name);
        throw new VLError('There is no instance with UID "' + name + '" in ' + obj.name + '. Use Instance.GetUID("Object Name") to look up its UID first.', line);
    }
    if (obj instanceof VLModule) {
        if (!(name in obj.members)) throw new VLError(obj.name + ' has no "' + name + '".', line);
        return obj.members[name];
    }
    throw new VLError('Cannot read "' + name + '" from a ' + vlTypeName(obj) + ' value.', line);
}
function vlSetMember(obj, name, v, line) {
    if(obj instanceof VLTable){obj.set(name,v);return;}
    if (obj instanceof VLVec) {
        if (!(name in VL_AXES)) throw new VLError('A vector only has X, Y and Z.', line);
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new VLError(name + ' needs a number.', line);
        obj.set(VL_AXES[name], v);
        return;
    }
    if (obj instanceof VLInst) { vlSetProp(obj, name, v, line); return; }
    throw new VLError('Cannot set "' + name + '" on a ' + vlTypeName(obj) + ' value.', line);
}

// ── Instance module ──
function vlCreate(type, spaceId) {
    let o;
    if (type === 'prism6') o = makePrism(dn('prism6') + ' ' + (++counters.prism), spaceId, {});
    else if (type === 'ball') o = makeBall(dn('ball') + ' ' + (++counters.ball), spaceId, {});
    else if (type === 'model') { const n = ++counters.model; o = { type: 'model', name: dn('model') + (n === 1 ? '' : ' ' + n), parent: spaceId }; }
    else if (type === 'worldsettings') o = { type: 'worldsettings', name: dn('worldsettings') + ' ' + (++counters.worldsettings), parent: spaceId, timeOfDay: 14, gravity: 9.8, killY: -5000 };
    else if (type === 'human') o = makeHuman(dn('human') + (++counters.human), spaceId);
    else { const n = ++counters.script; o = newScriptData(n === 1 ? dn('script') : dn('script') + ' ' + n, spaceId); }
    const id = newId();
    sceneObjects[id] = o;
    host.markUIDirty();
    return id;
}
function vlDeleteInst(id) {
    delete sceneObjects[id];
    physicsVelocity.delete(id);
    vlInstCache.delete(id);
    pruneOrphans();
    if (host.getSelectedObjectId() === id) host.setSelectedObjectId(null);
    host.markUIDirty();
}
function vlGetUID(args, line) {
    if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string') throw new VLError('Instance.GetUID(name) needs an object name string; optionally pass a Space as the second argument.', line);
    const name = args[0];
    const space = args[1];
    if (space !== undefined && !(space instanceof VLSpace || space instanceof VLPlayersObj)) throw new VLError('The second argument of Instance.GetUID must be a loaded Space.', line);
    const matches = Object.entries(sceneObjects).filter(([id, o]) => o.name === name && (!space || spaceOf(o) === space.id));
    if (!matches.length) throw new VLError('No instance named "' + name + '" was found' + (space ? ' in ' + space.name : '') + '.', line);
    if (matches.length > 1) throw new VLError('More than one instance is named "' + name + '". Pass its Space as the second argument or give the instances different names.', line);
    return matches[0][0];
}
function vlSetUID(args, line) {
    if (args.length !== 2 || typeof args[0] !== 'string' || typeof args[1] !== 'string') throw new VLError('Instance.SetUID(oldUID, newUID) needs two strings.', line);
    const oldId = args[0], newId = args[1];
    if (!sceneObjects[oldId]) throw new VLError('No instance exists with UID "' + oldId + '".', line);
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(newId)) throw new VLError('A UID must start with a letter and contain only letters and numbers, for example "Ashburn534".', line);
    if (sceneObjects[newId] && newId !== oldId) throw new VLError('UID "' + newId + '" is already in use.', line);
    if (newId === oldId) return newId;
    sceneObjects[newId] = sceneObjects[oldId];
    delete sceneObjects[oldId];
    if (physicsVelocity.has(oldId)) { physicsVelocity.set(newId, physicsVelocity.get(oldId)); physicsVelocity.delete(oldId); }
    if (host.getSelectedObjectId() === oldId) host.setSelectedObjectId(newId);
    const cached = vlInstCache.get(oldId);
    if (cached) vlInstCache.delete(oldId);
    vlInstCache.delete(newId);
    host.markUIDirty();
    return newId;
}
const vlGetUIDFn = new VLFn('Instance.GetUID', vlGetUID);
const vlSetUIDFn = new VLFn('Instance.SetUID', vlSetUID);

// ───────── Players, events and threads ─────────
const vlEvents = {};
for (const n of ['OnPlayerJoin', 'OnPlayerSpawn', 'OnPlayerLeave', 'OnPlayerDeath']) vlEvents[n] = new VLEvent(n);
const vlThreadIds = { Server: new Map(), Local: new Map() };
let vlPlayersJoinPending = false, vlPlayerJoinCounter = 0;
const vlPlayerEntries = () => Object.entries(sceneObjects).filter(([, o]) => o.type === 'player').sort((a, b) => a[1].order - b[1].order);
function vlDescendants(rootId) {
    const out = [], stack = [rootId];
    while (stack.length) { const cur = stack.pop(); for (const [id, o] of Object.entries(sceneObjects)) if (o.parent === cur) { out.push(id); stack.push(id); } }
    return out;
}
function vlFindHuman(modelId) { return vlDescendants(modelId).find(id => sceneObjects[id].type === 'human') || null; }
// Runs fn as its own task so it can use wait(). Used for event handlers and threads.
function vlSpawnFn(fn, args, ctx, label, isThread) {
    const local = new VLScope(fn.closure);
    fn.params.forEach((p, i) => local.vars.set(p, args[i] === undefined ? null : args[i]));
    const tctx = Object.assign({}, ctx, { steps: 0 });
    const gen = (function* () {
        try { yield* vlExec(fn.body, local, tctx); }
        catch (e) { if (e instanceof VLControl && e.kind === 'return') return; throw e; }
    })();
    const task = { id: ctx.id, name: ctx.name, gen, ctx: tctx, done: false, nextAt: 0, label, thread: !!isThread };
    scriptTasks.push(task);
    return task;
}
function vlFire(ev, args) { for (const h of ev.handlers.slice()) vlSpawnFn(h.fn, args, h.ctx, ev.name, false); }
function vlResetPlayers() {
    for (const ev of Object.values(vlEvents)) ev.handlers.length = 0;
    vlThreadIds.Server.clear(); vlThreadIds.Local.clear();
    vlPlayersJoinPending = false; vlPlayerJoinCounter = 0;
}
function vlJoinPlayer() {
    const order = ++vlPlayerJoinCounter;
    const id = newId();
    sceneObjects[id] = { type: 'player', name: dn('human') + order, parent: 'players', readOnly: true, currentModel: null, dead: false, order };
    host.markUIDirty();
    vlFire(vlEvents.OnPlayerJoin, [vlInst(id)]);
    return id;
}
function vlSpawnPoint() {
    for (const o of Object.values(sceneObjects)) if (o.type === 'prism6' && o.spawnpoint && spaceOf(o) === 'world') return { x: o.x, y: o.y + o.height, z: o.z };
    return { x: 0, y: 5, z: 0 };
}
function vlModelArg(v, fname, line) {
    const id = v instanceof VLInst ? v.id : (typeof v === 'string' ? v : null);
    const o = id && sceneObjects[id];
    if (!o) throw new VLError(fname + ' needs a model (an instance or its UID).', line);
    if (o.type !== 'model') throw new VLError(fname + ' needs a model, but this is a ' + o.type + '.', line);
    return id;
}
function vlPlayerArg(v, line) {
    let id = null;
    if (v instanceof VLInst) id = v.id;
    else if (typeof v === 'string') { const m = vlPlayerEntries().find(([, p]) => p.name === v); id = m ? m[0] : null; }
    const p = id && sceneObjects[id];
    if (!p || p.type !== 'player') throw new VLError('Players.AssignModelToPlayer needs a player: a Player instance, or the name of a player in the game.', line);
    return id;
}
// Copies a model and everything inside it into a space.
function vlDeepCopy(rootId, parentId) {
    const ids = new Map(), used = new Set();
    const fresh = () => { let id; do { id = newId(); } while (used.has(id)); used.add(id); return id; };
    ids.set(rootId, fresh());
    for (const d of vlDescendants(rootId)) ids.set(d, fresh());
    for (const [oldId, newUid] of ids) {
        const o = JSON.parse(JSON.stringify(sceneObjects[oldId]));
        o.parent = oldId === rootId ? parentId : ids.get(o.parent);
        if (o.spawnpoint) o.spawnpoint = false;
        sceneObjects[newUid] = o;
    }
    host.markUIDirty();
    return ids.get(rootId);
}
function vlAssignModel(modelId, pid, line) {
    const model = sceneObjects[modelId], p = sceneObjects[pid];
    if (spaceOf(model) !== 'world') throw new VLError('The model must be in World. Use Players.AddModel to put a copy of it there first.', line);
    for (const [oid, o] of vlPlayerEntries()) if (oid !== pid && o.currentModel === modelId) throw new VLError('This model already belongs to ' + o.name + '.', line);
    // Despawn the old model before the new one takes over.
    if (p.currentModel && p.currentModel !== modelId && sceneObjects[p.currentModel]) vlDeleteInst(p.currentModel);
    const parts = vlDescendants(modelId).filter(id => isShape(sceneObjects[id]));
    if (parts.length) {
        let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const id of parts) {
            const o = sceneObjects[id];
            minY = Math.min(minY, o.y - o.height); minX = Math.min(minX, o.x - o.width); maxX = Math.max(maxX, o.x + o.width);
            minZ = Math.min(minZ, o.z - o.length); maxZ = Math.max(maxZ, o.z + o.length);
        }
        const sp = vlSpawnPoint();
        const dx = sp.x - (minX + maxX) / 2, dy = sp.y - minY, dz = sp.z - (minZ + maxZ) / 2;
        for (const id of parts) {
            const o = sceneObjects[id];
            o.x += dx; o.y += dy; o.z += dz;
            o.anchored = true; // A living model is held together. It falls apart when the player dies.
            const v = physicsVelocity.get(id); if (v) { v.x = 0; v.y = 0; v.z = 0; }
        }
    }
    model.name = p.name;
    const hid = vlFindHuman(modelId);
    if (hid) sceneObjects[hid].playerName = p.name;
    p.currentModel = modelId; p.dead = false;
    host.markUIDirty();
    vlFire(vlEvents.OnPlayerSpawn, [vlInst(pid)]);
}
function vlKillPlayer(pid) {
    const p = sceneObjects[pid];
    p.dead = true;
    for (const id of vlDescendants(p.currentModel)) {
        const o = sceneObjects[id];
        if (!isShape(o)) continue;
        o.anchored = false; o.reactsToPhysics = true; // ragdoll: the parts drop apart
        const v = physicsVelocityFor(id);
        v.x += (Math.random() - 0.5) * 2; v.y += Math.random() * 1.5; v.z += (Math.random() - 0.5) * 2;
    }
    vlFire(vlEvents.OnPlayerDeath, [vlInst(pid)]);
}
function vlStepPlayers() {
    if (vlPlayersJoinPending) { vlPlayersJoinPending = false; vlJoinPlayer(); }
    for (const [pid, p] of vlPlayerEntries()) {
        if (p.dead || !p.currentModel) continue;
        if (!sceneObjects[p.currentModel]) { p.currentModel = null; continue; }
        const hid = vlFindHuman(p.currentModel);
        if (hid && sceneObjects[hid].health <= 0) vlKillPlayer(pid);
    }
}
const vlPlayersAddModel = new VLFn('Players.AddModel', (args, line) => {
    if (args.length !== 1) throw new VLError('Players.AddModel needs one argument: the player model to copy.', line);
    return vlInst(vlDeepCopy(vlModelArg(args[0], 'Players.AddModel', line), 'world'));
});
const vlPlayersAssign = new VLFn('Players.AssignModelToPlayer', (args, line) => {
    if (args.length !== 2) throw new VLError('Players.AssignModelToPlayer needs two arguments: (model, player).', line);
    vlAssignModel(vlModelArg(args[0], 'Players.AssignModelToPlayer', line), vlPlayerArg(args[1], line), line);
    return null;
});
function vlPlayersMember(name, line) {
    switch (name) {
        case 'Count': return vlPlayerEntries().length;
        case 'Players': { const t = new VLTable(); vlPlayerEntries().forEach(([, p], i) => t.set(i + 1, p.name)); return t; }
        case 'AddModel': return vlPlayersAddModel;
        case 'AssignModelToPlayer': return vlPlayersAssign;
        case 'OnPlayerJoin': case 'OnPlayerSpawn': case 'OnPlayerLeave': case 'OnPlayerDeath': return vlEvents[name];
    }
    const o = sceneObjects[name];
    if (o && spaceOf(o) === 'players') return vlInst(name);
    throw new VLError('Players has no "' + name + '". It has Count, Players, AddModel, AssignModelToPlayer, OnPlayerJoin, OnPlayerSpawn, OnPlayerLeave and OnPlayerDeath.', line);
}
const vlNewThread = new VLFn('Scripting.NewThread', (args, line, ctx) => {
    const fn = args[0], rawId = args[1];
    if (args.length < 2 || !(fn instanceof VLUserFn)) throw new VLError('Scripting.NewThread(function, threadId, ...) needs a function and a thread id: a number, a string, or auto.', line);
    if (!((typeof rawId === 'number' && Number.isFinite(rawId)) || typeof rawId === 'string')) throw new VLError('A thread id must be a number, a string, or auto.', line);
    const so = sceneObjects[ctx.id];
    const ids = vlThreadIds[so && so.scriptType === 'Local' ? 'Local' : 'Server'];
    const live = (tid) => { const t = ids.get(tid); return !!(t && !t.done && sceneObjects[t.id]); };
    let key = rawId;
    if (rawId === 'auto') { key = 1; while (live(key)) key++; }
    if (live(key)) { logOutput('warning', ctx.name + ': thread ' + key + ' is already running, so no new thread was made.'); return null; }
    const cap = vlPlayerEntries().length * 3;
    const mine = scriptTasks.filter(t => t.thread && t.id === ctx.id && !t.done).length;
    if (mine >= cap) { logOutput('warning', ctx.name + ': thread limit reached. A script can have at most the player count times 3 threads (' + cap + ' right now), so no new thread was made.'); return null; }
    ids.set(key, vlSpawnFn(fn, args.slice(2), ctx, 'thread ' + key, true));
    return key;
});

// The default PlayerManagement script and DefaultPlayer model that new worlds start with.
const PLAYER_MANAGEMENT_SOURCE = [
    "# PlayerManagement: gives every player a model when they join, and respawns them after they die.",
    "call Scripts",
    "call Storage",
    "call World",
    "call Players",
    "get Scripting",
    "get Instance",
    "get Players",
    "",
    "local template = Instance.GetUID(\"DefaultPlayer\", Storage)",
    "",
    "function spawn(player)",
    "  local model = Players.AddModel(template)",
    "  Players.AssignModelToPlayer(model, player)",
    "end",
    "",
    "function managePlayer(player)",
    "  spawn(player)",
    "  print(\"Handled new join by \" .. player.Name)",
    "end",
    "",
    "Players.OnPlayerJoin:Connect(function(player)",
    "  # Every player gets their own thread so they are managed individually.",
    "  Scripting.NewThread(managePlayer, auto, player)",
    "end)",
    "",
    "Players.OnPlayerDeath:Connect(function(player)",
    "  wait(3) # The ragdoll lies there for a moment.",
    "  Instance.delete(player.CurrentModel)",
    "  spawn(player)",
    "end)"
].join('\n');

function makePlayerModel(newIdFn) {
    const used = new Set(), out = [];
    const uid = () => { let id; do { id = newIdFn(); } while (used.has(id)); used.add(id); return id; };
    const add = (o) => { const id = uid(); out.push([id, o]); return id; };
    const model = add({ type: 'model', name: 'DefaultPlayer', parent: 'storage' });
    add(makeHuman(dn('human') + 1, model));
    add(makePrism('RightLeg', model, { x: 2.625, y: 0.5, z: 0.875, length: 0.125, width: 0.125, height: 0.5, color: '#000000' }));
    add(makePrism('LeftLeg', model, { x: 3.13, y: 0.5, z: 0.875, length: 0.125, width: 0.125, height: 0.5, color: '#000000' }));
    add(makePrism('Torso', model, { x: 2.88, y: 1.5, z: 0.875, length: 0.125, width: 0.375, height: 0.5, color: '#ff8800' }));
    add(makePrism('LeftArm', model, { x: 3.38, y: 1.5, z: 0.875, length: 0.125, width: 0.125, height: 0.5, color: '#ffcc85' }));
    add(makePrism('RightArm', model, { x: 2.38, y: 1.5, z: 0.875, length: 0.125, width: 0.125, height: 0.5, color: '#ffcc85' }));
    add(makeBall('Head', model, { x: 2.9, y: 2.3, z: 0.9, length: 0.25, width: 0.25, height: 0.25, color: '#ffcc85' }));
    return out;
}
function makePlayerScript(newIdFn) {
    const s = newScriptData('PlayerManagement', 'scripts');
    s.source = PLAYER_MANAGEMENT_SOURCE; s.scriptType = 'Server'; s.runWhen = 'simulation';
    return [newIdFn(), s];
}
function makePlayerSetup(newIdFn) {
    const used = new Set();
    const uid = () => { let id; do { id = newIdFn(); } while (used.has(id)); used.add(id); return id; };
    return makePlayerModel(uid).concat([makePlayerScript(uid)]);
}

const vlScriptingModule = new VLModule('Scripting', { GetUID: vlGetUIDFn, SetUID: vlSetUIDFn, NewThread: vlNewThread });
const vlTweeningModule = new VLModule('Tweening',{linear:new VLFn('Tweening.linear',(a,l)=>{if(a.length!==3||a.some(v=>typeof v!=='number'))throw new VLError('linear(start,target,alpha) needs three numbers.',l);return a[0]+(a[1]-a[0])*Math.max(0,Math.min(1,a[2]));}),easeInOut:new VLFn('Tweening.easeInOut',(a,l)=>{if(a.length!==3||a.some(v=>typeof v!=='number'))throw new VLError('easeInOut(start,target,alpha) needs three numbers.',l);const t=Math.max(0,Math.min(1,a[2])),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;return a[0]+(a[1]-a[0])*e;})});
const vlExtrasModule = new VLModule('Extras',{clamp:new VLFn('Extras.clamp',(a,l)=>{if(a.length!==3||a.some(v=>typeof v!=='number'))throw new VLError('clamp(value,min,max) needs three numbers.',l);return Math.max(a[1],Math.min(a[2],a[0]));}),lerp:new VLFn('Extras.lerp',(a,l)=>{if(a.length!==3||a.some(v=>typeof v!=='number'))throw new VLError('lerp(a,b,alpha) needs three numbers.',l);return a[0]+(a[1]-a[0])*a[2];})});
const vlInstanceModule = new VLModule('Instance', {
    GetUID: vlGetUIDFn,
    SetUID: vlSetUIDFn,
    create: new VLFn('Instance.create', (args, line) => {
        const [type, space] = args;
        if (typeof type !== 'string' || !VL_TYPES.includes(type)) throw new VLError('Unknown instance type "' + vlStr(type) + '". Use prism6, ball, model, script, worldsettings or human.', line);
        if (space instanceof VLPlayersObj) throw new VLError('The Players space is read-only. Players join on their own.', line);
        if (!(space instanceof VLSpace)) throw new VLError('Instance.create needs a loaded Space as its second argument, for example World.', line);
        return vlInst(vlCreate(type, space.id));
    }),
    delete: new VLFn('Instance.delete', (args, line) => {
        if (!(args[0] instanceof VLInst)) throw new VLError('Instance.delete needs an instance.', line);
        const doomed = vlObj(args[0], line);
        if (doomed.type === 'player') throw new VLError('A Player cannot be deleted. Players leave when the simulation stops.', line);
        vlDeleteInst(args[0].id);
        return null;
    }),
    duplicate: new VLFn('Instance.duplicate', (args, line) => {
        if (!(args[0] instanceof VLInst)) throw new VLError('Instance.duplicate needs an instance.', line);
        const o = vlObj(args[0], line);
        if (args[1] !== undefined && !(args[1] instanceof VLSpace)) throw new VLError('The second argument of Instance.duplicate must be a loaded Space.', line);
        if (o.type === 'player') throw new VLError('A Player cannot be duplicated.', line);
        const data = JSON.parse(JSON.stringify(o));
        if (data.spawnpoint) data.spawnpoint = false;
        if (args[1]) data.parent = args[1].id;
        const id = newId();
        sceneObjects[id] = data;
        host.markUIDirty();
        return vlInst(id);
    })
});
const vlVanilla3D = new VLModule('vanilla3D', {
    Position: new VLFn('vanilla3D.Position', (a, line) => vlVecFrom(a, line, 'Position')),
    Size: new VLFn('vanilla3D.Size', (a, line) => vlVecFrom(a, line, 'Size'))
});
function vlVecFrom(a, line, name) {
    if (a.length !== 3 || a.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw new VLError('vanilla3D.' + name + ' needs three numbers: (x, y, z).', line);
    return new VLVec(a[0], a[1], a[2]);
}
function vlRootScope() {
    const s = new VLScope(null); s.vars.set('vanilla3D',vlVanilla3D);s.vars.set('pi',Math.PI);s.vars.set('deltaTime',0);
    const mf={sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,abs:Math.abs,floor:Math.floor,ceil:Math.ceil,round:Math.round,min:Math.min,max:Math.max,atan2:Math.atan2};for(const [n,fn] of Object.entries(mf))s.vars.set(n,new VLFn(n,(a,l)=>{if(!a.length||a.some(v=>typeof v!=='number')||(!['min','max'].includes(n)&&a.length!==(n==='atan2'?2:1)))throw new VLError(n+' received invalid numeric arguments.',l);return fn(...a);}));s.vars.set('random',new VLFn('random',(a,l)=>a.length===0?Math.random():a.length===2?Math.random()*(a[1]-a[0])+a[0]:(()=>{throw new VLError('random() takes zero args or (min,max).',l)})()));s.vars.set('type',new VLFn('type',a=>vlTypeName(a[0])));s.vars.set('tostring',new VLFn('tostring',a=>vlStr(a[0])));s.vars.set('tonumber',new VLFn('tonumber',a=>{const n=Number(a[0]);return Number.isFinite(n)?n:null;}));s.vars.set('warn',new VLFn('warn',a=>{logOutput('warning',a.map(vlStr).join('  '));return null;}));s.vars.set('error',new VLFn('error',(a,l)=>{throw new VLError(a.length?vlStr(a[0]):'Script error.',l);}));
    s.vars.set('length',new VLFn('length',(a,l)=>{if(a.length!==1)throw new VLError('length(value) expects one string or table.',l);if(a[0] instanceof VLTable)return a[0].length();if(typeof a[0]==='string')return a[0].length;throw new VLError('length(value) expects a string or table.',l);}));s.vars.set('table',new VLModule('table',{insert:new VLFn('table.insert',(a,l)=>{if(!(a[0] instanceof VLTable)||a.length<2)throw new VLError('table.insert(table,value) expected.',l);const t=a[0],idx=a.length>2?a[1]:t.length()+1,val=a.length>2?a[2]:a[1];for(let i=t.length()+1;i>idx;i--)t.set(i,t.get(i-1));t.set(idx,val);return null;}),remove:new VLFn('table.remove',(a,l)=>{if(!(a[0] instanceof VLTable))throw new VLError('table.remove(table) expected.',l);const t=a[0],idx=a[1]===undefined?t.length():a[1],v=t.get(idx);for(let i=idx;i<t.length();i++)t.set(i,t.get(i+1));t.set(t.length(),null);return v;})}));s.vars.set('task',new VLModule('task',{wait:new VLFn('task.wait',(a,l)=>{if(a.length!==1||typeof a[0]!=='number'||a[0]<0)throw new VLError('task.wait(seconds) expects a non-negative number.',l);return new VLWait(a[0]);})}));
    s.vars.set('print', new VLFn('print', (args) => { logOutput('print', args.map(vlStr).join('  ')); return null; }));
    s.vars.set('auto', 'auto');
    s.vars.set('wait', new VLFn('wait', (args, line) => {
        if (args.length !== 1 || typeof args[0] !== 'number' || !Number.isFinite(args[0]) || args[0] < 0) throw new VLError('wait(time) needs one non-negative number of seconds.', line);
        if (!/^\d+(?:\.\d{1,2})?$/.test(String(args[0]))) throw new VLError('wait(time) supports up to 2 decimal places.', line);
        return new VLWait(args[0]);
    }));
    return s;
}

// ── Evaluator ──
function vlEq(a, b) {
    if (a instanceof VLVec && b instanceof VLVec) return [0, 1, 2].every(i => a.get(i) === b.get(i));
    return a === b || (a == null && b == null);
}
function vlBinary(op, a, b, line) {
    if(op==='..')return vlStr(a)+vlStr(b);
    if (op === '==') return vlEq(a, b);
    if (op === '~=') return !vlEq(a, b);
    if (op === '+') {
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (a instanceof VLVec && b instanceof VLVec) return new VLVec(a.get(0) + b.get(0), a.get(1) + b.get(1), a.get(2) + b.get(2));
        if (typeof a === 'string' || typeof b === 'string') return vlStr(a) + vlStr(b);
    } else if (op === '-') {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        if (a instanceof VLVec && b instanceof VLVec) return new VLVec(a.get(0) - b.get(0), a.get(1) - b.get(1), a.get(2) - b.get(2));
    } else if (op === '*') {
        if (typeof a === 'number' && typeof b === 'number') return a * b;
        if (a instanceof VLVec && typeof b === 'number') return new VLVec(a.get(0) * b, a.get(1) * b, a.get(2) * b);
    } else if (op === '/' || op === '%') {
        if (typeof a === 'number' && typeof b === 'number') return op === '/' ? a / b : a - Math.floor(a / b) * b;
    } else {
        if ((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string')) {
            return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
        }
    }
    throw new VLError('Cannot use "' + op + '" with ' + vlTypeName(a) + ' and ' + vlTypeName(b) + '.', line);
}
function vlEval(e, env, ctx) {
    switch (e.k) {
        case 'num': case 'str': case 'bool': return e.v;
        case 'nil': return null;
        case 'table': {const t=new VLTable();let n=1;for(const item of e.items)t.set(n++,vlEval(item,env,ctx));for(const field of e.fields)t.set(field.key,vlEval(field.value,env,ctx));return t;}
        case 'fnexpr': return new VLUserFn('anonymous', e.params, e.body, env);
        case 'name': {
            const sc = env.find(e.name);
            if (sc) return sc.vars.get(e.name);
            if (vlSharedGlobals.has(e.name)) return vlSharedGlobals.get(e.name).value;
            throw new VLError('Unknown variable "' + e.name + '". It is neither local nor a shared global.', e.line);
        }
        case 'member': { const obj = vlEval(e.obj, env, ctx); if (obj instanceof VLSpace) { const sc = env.find(e.name); if (sc) { const key = sc.vars.get(e.name); const uid = key instanceof VLInst ? key.id : key; if (typeof uid !== 'string') throw new VLError('A Space member variable must contain an instance or UID string.', e.line); return vlGetMember(obj, uid, e.line); } if (vlSharedGlobals.has(e.name)) { const key = vlSharedGlobals.get(e.name).value; const uid = key instanceof VLInst ? key.id : key; if (typeof uid !== 'string') throw new VLError('A Space member variable must contain an instance or UID string.', e.line); return vlGetMember(obj, uid, e.line); } } return vlGetMember(obj, e.name, e.line); }
        case 'index': {
            const o = vlEval(e.obj, env, ctx), k = vlEval(e.key, env, ctx);
            if(o instanceof VLTable)return o.get(k);if(typeof o==='string'&&typeof k==='number')return o.charAt(k-1);if(typeof k!=='string')throw new VLError('An index must be a string or number.',e.line);return vlGetMember(o,k,e.line);
        }
        case 'callx': {
            const f = vlEval(e.fn, env, ctx);
            const args=e.args.map(a=>vlEval(a,env,ctx));if(f instanceof VLFn)return f.fn(args,e.line,ctx);if(f instanceof VLUserFn){const local=new VLScope(f.closure);f.params.forEach((p,i)=>local.vars.set(p,args[i]));const g=vlExec(f.body,local,ctx);try{while(true){const n=g.next();if(n.done)break;if(n.value&&n.value.wait!==undefined)throw new VLError('wait() in functions is not supported yet.',e.line);}}catch(err){if(err instanceof VLControl&&err.kind==='return')return err.value;throw err;}return null;}throw new VLError('This is not a function.',e.line);
        }
        case 'un': {
            const v = vlEval(e.e, env, ctx);
            if (e.op === 'not') return !vlTruthy(v);
            if(e.op==='#'){if(v instanceof VLTable)return v.length();if(typeof v==='string')return v.length;throw new VLError('Length expects a string or table.',e.line);}if (typeof v !== 'number') throw new VLError('Cannot negate a ' + vlTypeName(v) + ' value.', e.line);
            return -v;
        }
        case 'bin': {
            if (e.op === 'and') { const l = vlEval(e.l, env, ctx); return vlTruthy(l) ? vlEval(e.r, env, ctx) : l; }
            if (e.op === 'or') { const l = vlEval(e.l, env, ctx); return vlTruthy(l) ? l : vlEval(e.r, env, ctx); }
            return vlBinary(e.op, vlEval(e.l, env, ctx), vlEval(e.r, env, ctx), e.line);
        }
    }
    throw new VLError('Cannot evaluate this expression.', e.line);
}
// Statements run as generators so a script can pause between frames.
// A `while` loop waits one frame per iteration, and long scripts yield every few hundred statements.
function* vlExec(stmts, env, ctx) {
    for (const s of stmts) {
        if (++ctx.steps >= 400) { ctx.steps = 0; yield; }
        switch (s.k) {
            case 'useSpace': env.vars.set(s.name, vlSpaces[VL_SPACES[s.name]]); break;
            case 'useModule': env.vars.set(s.name, ({Scripting:vlScriptingModule,Instance:vlInstanceModule,Tweening:vlTweeningModule,Extras:vlExtrasModule,Players:vlSpaces.players})[s.name] || vlInstanceModule); break;
            case 'local': env.vars.set(s.name, vlEval(s.expr, env, ctx)); break;
            case 'function': env.vars.set(s.name,new VLUserFn(s.name,s.params,s.body,env)); break;
            case 'return': throw new VLControl('return',s.expr?vlEval(s.expr,env,ctx):null);
            case 'break': throw new VLControl('break');
            case 'continue': throw new VLControl('continue');
            case 'assign': {
                const v = vlEval(s.expr, env, ctx), t = s.target;
                if (t.k === 'name') {
                    const sc = env.find(t.name);
                    if (sc) {
                        sc.vars.set(t.name, v);
                    } else {
                        const existing = vlSharedGlobals.get(t.name);
                        const scriptObj = sceneObjects[ctx.id];
                        const isServer = !!scriptObj && scriptObj.scriptType === 'Server';
                        if (existing && existing.ownerId !== ctx.id && !isServer) {
                            throw new VLError('Cannot change global "' + t.name + '". Only the script that created it or a Server script can edit it.', t.line);
                        }
                        if (existing) existing.value = v;
                        else vlSharedGlobals.set(t.name, { value: v, ownerId: ctx.id });
                    }
                } else if (t.k === 'member') vlSetMember(vlEval(t.obj, env, ctx), t.name, v, t.line);
                else {
                    const o = vlEval(t.obj, env, ctx), k = vlEval(t.key, env, ctx);
                    if (typeof k !== 'string') throw new VLError('An index must be a string.', t.line);
                    vlSetMember(o, k, v, t.line);
                }
                break;
            }
            case 'exprstmt': { const result = vlEval(s.expr, env, ctx); if (result instanceof VLWait) { yield { wait: result.seconds }; } break; }
            case 'while':
                while(vlTruthy(vlEval(s.cond,env,ctx))){try{yield*vlExec(s.body,new VLScope(env),ctx);}catch(err){if(err instanceof VLControl&&err.kind==='break')break;if(err instanceof VLControl&&err.kind==='continue'){yield;continue;}throw err;}yield;}
                break;
            case 'for': {
                const a = vlEval(s.from, env, ctx), b = vlEval(s.to, env, ctx);
                if (typeof a !== 'number' || typeof b !== 'number') throw new VLError('A for loop needs numbers for its start and end.', s.line);
                for (let i = a; i <= b; i++) {
                    const sc = new VLScope(env);
                    sc.vars.set(s.name, i);
                    try { yield* vlExec(s.body, sc, ctx); }
                    catch (err) {
                        if (err instanceof VLControl && err.kind === 'break') break;
                        if (err instanceof VLControl && err.kind === 'continue') { yield; continue; }
                        throw err;
                    }
                    yield;
                }
                break;
            }
            case 'if':
                if (vlTruthy(vlEval(s.cond, env, ctx))) yield* vlExec(s.body, new VLScope(env), ctx);
                else if (s.els) yield* vlExec(s.els, new VLScope(env), ctx);
                break;
        }
    }
}
function* vlMain(ast, ctx) { yield* vlExec(ast, ctx.root, ctx); }

// ── Script tasks ──
const scriptTasks = [];
const outputLog = [];
let outputDirty = false;
let uiDirty = false;
function logOutput(kind, text) {
    outputLog.push({ kind, text });
    if (outputLog.length > 300) outputLog.shift();
    host.markOutputDirty();
}
function vlStartTask(id) {
    const o = sceneObjects[id];
    if (!o || o.type !== 'script') return false;
    ensureScript(o);
    if (o.language !== 'vanillalua') return false;
    if (scriptTasks.some(t => t.id === id && !t.done)) { logOutput('info', o.name + ' is already running.'); return false; }
    const { ast, diags } = computeDiagnostics(o);
    const errs = diags.filter(d => d.sev === 'error');
    if (errs.length) {
        logOutput('error', o.name + ' did not run. Line ' + errs[0].line + ': ' + errs[0].msg + (errs.length > 1 ? ' (+' + (errs.length - 1) + ' more)' : ''));
        return false;
    }
    const ctx = { id, name: o.name, steps: 0, root: vlRootScope(), lastFrameTime: performance.now() };
    ctx.root.vars.set('script', vlInst(id));
    for (const n of ['Scripts', 'World', 'Storage', 'Players']) if (preInc(n)) ctx.root.vars.set(n, vlSpaces[VL_SPACES[n]]);
    if (preInc('GetPlayers')) ctx.root.vars.set('Players', vlSpaces.players);
    for(const n of ['Instance','Scripting','Tweening','Extras'])if(preInc(n))ctx.root.vars.set(n,({Scripting:vlScriptingModule,Instance:vlInstanceModule,Tweening:vlTweeningModule,Extras:vlExtrasModule})[n]);
    scriptTasks.push({ id, name: o.name, gen: vlMain(ast, ctx), ctx, done: false, nextAt: 0 });
    return true;
}
function vlRunScript(id, line) {
    const o = sceneObjects[id];
    if (!o) throw new VLError('This script was deleted.', line);
    if (o.language === 'json') throw new VLError(o.name + ' is a JSON script. JSON scripts cannot run.', line);
    vlStartTask(id);
}
function startSimulationScripts() {
    vlInstCache.clear();
    vlResetPlayers();
    vlPlayersJoinPending = true; // the editor player joins after the scripts have had a chance to connect their handlers
    let n = 0;
    const startupScripts = Object.entries(sceneObjects)
        .filter(([, o]) => o.type === 'script' && (spaceOf(o) === 'scripts' || spaceOf(o) === 'world'))
        .sort((a, b) => (b[1].scriptType === 'Server' ? 1 : 0) - (a[1].scriptType === 'Server' ? 1 : 0));
    for (const [id, o] of startupScripts) {
        ensureScript(o);
        if (o.runWhen === 'simulation' && o.language === 'vanillalua' && vlStartTask(id)) n++;
    }
    logOutput('info', n ? 'Simulation started. ' + n + ' script' + (n === 1 ? '' : 's') + ' running.' : 'Simulation started. No scripts to run.');
}
function stepScripts() {
    for (let i = 0; i < scriptTasks.length; i++) {
        const t = scriptTasks[i];
        if (t.done) continue;
        if (!sceneObjects[t.id]) { t.done = true; continue; }
        try { if (performance.now() < t.nextAt) continue; const now=performance.now();if(t.ctx){t.ctx.root.vars.set('deltaTime',Math.max(0,(now-t.ctx.lastFrameTime)/1000));t.ctx.lastFrameTime=now;} const step = t.gen.next(); if (step.done) t.done = true; else if (step.value && typeof step.value.wait === 'number') t.nextAt = performance.now() + step.value.wait * 1000; }
        catch (e) {
            t.done = true;
            if (e instanceof VLError) logOutput('error', t.name + (e.vlLine ? ' line ' + e.vlLine : '') + ': ' + e.message);
            else { console.error(e); logOutput('error', t.name + ': internal error. ' + e.message); }
        }
    }
    vlStepPlayers();
    for (let i = scriptTasks.length - 1; i >= 0; i--) if (scriptTasks[i].done) scriptTasks.splice(i, 1);
}
function stopScripts() {
    // Players leave when the simulation stops. Their OnPlayerLeave handlers get one pass to run before everything is torn down.
    try {
        for (const [pid] of vlPlayerEntries()) vlFire(vlEvents.OnPlayerLeave, [vlInst(pid)]);
        for (const t of scriptTasks.slice()) {
            if (t.label !== 'OnPlayerLeave') continue;
            try { for (let n = 0; n < 200; n++) { const r = t.gen.next(); if (r.done || (r.value && r.value.wait !== undefined)) break; } }
            catch (e) { if (e instanceof VLError) logOutput('error', t.name + ': ' + e.message); }
        }
    } catch (e) { /* leaving must never block stopping */ }
    scriptTasks.length = 0;
    for (const [pid] of vlPlayerEntries()) delete sceneObjects[pid];
    vlResetPlayers();
    vlInstCache.clear();
    host.markUIDirty();
}
      const api = {VL_KEYWORDS, VL_SPACES, VL_MODULES, VL_TYPES, VL_GLOBALS, VLParseError, VLError, vlLex, vlParse, vlAnalyze, jsonDiagnostics, SCRIPT_TEMPLATE, newScriptData, makeHuman, HUMAN_DEFAULTS, makePlayerSetup, makePlayerModel, makePlayerScript, PLAYER_MANAGEMENT_SOURCE, ensureScript, computeDiagnostics, VLFn, VLWait, VLModule, VLSpace, VLInst, VLVec, VLScope, vlInstCache, vlSpaces, vlInst, vlObj, vlRound, vlTypeName, vlStr, vlTruthy, VL_PROPS, vlGetProp, vlSetProp, vlGetMember, vlSetMember, vlCreate, vlDeleteInst, vlGetUID, vlSetUID, vlGetUIDFn, vlSetUIDFn, vlScriptingModule, vlInstanceModule, vlVanilla3D, vlVecFrom, vlRootScope, vlEq, vlBinary, vlEval, vlExec, vlMain, scriptTasks, outputLog, logOutput, vlStartTask, vlRunScript, startSimulationScripts, stepScripts, stopScripts};
      Object.defineProperty(api, 'sharedGlobals', { get: () => vlSharedGlobals, set: value => { vlSharedGlobals = value; } });
      return api;
    }
  };
  shared.runPlayground = function (source) {
    const sceneObjects = Object.create(null), physicsVelocity = new Map(), counters = { prism: 0, ball: 0, model: 0, worldsettings: 0, script: 0, human: 0 };
    let idCounter = 0, selectedObjectId = null;
    const SPACE_KEYS = ['world', 'storage', 'scripts'];
    const isShape = o => !!o && (o.type === 'prism6' || o.type === 'ball');
    const spaceOf = o => { let n = 0; while (o && !SPACE_KEYS.includes(o.parent) && n++ < 64) o = sceneObjects[o.parent]; return o ? o.parent : null; };
    const physicsVelocityFor = id => { if (!physicsVelocity.has(id)) physicsVelocity.set(id, { x: 0, y: 0, z: 0 }); return physicsVelocity.get(id); };
    const makeShape = (type, name, parent) => ({ type, name, parent, x: 0, y: 0, z: 0, width: 1, height: 1, length: 1, rotX: 0, rotY: 0, rotZ: 0, anchored: false, reactsToPhysics: true, collidable: true, locked: false, wireframe: false, faceColoring: false, showLabels: true, color: '#ffffff' });
    const host = { sceneObjects, physicsVelocity, physicsVelocityFor, spaceOf, preInc: () => true, SPACE_KEYS, isShape,
      isInside: (child, parent) => { let o = sceneObjects[child], guard = 0; while (o && guard++ < 64) { if (o.parent === parent) return true; o = sceneObjects[o.parent]; } return false; },
      GRAVITY_MAX: 1000, makePrism: (name, parent) => makeShape('prism6', name, parent), makeBall: (name, parent) => makeShape('ball', name, parent),
      dn: type => type === 'human' ? 'Player' : type, counters, newId: () => 'play' + (++idCounter), pruneOrphans: () => {}, getSelectedObjectId: () => selectedObjectId, setSelectedObjectId: v => { selectedObjectId = v; },
      markUIDirty: () => {}, markOutputDirty: () => {} };
    const rt = shared.createEditorRuntime(host);
    rt.outputLog.length = 0; rt.sharedGlobals = new Map();
    const scriptId = 'play_script';
    sceneObjects[scriptId] = { type: 'script', name: 'Playground', parent: 'scripts', scriptType: 'Server', runWhen: 'manual', language: 'vanillalua', source };
    const { ast, diags } = rt.computeDiagnostics({ language: 'vanillalua', source });
    const errors = diags.filter(d => d.sev === 'error');
    if (errors.length) return { output: errors.map(d => `Line ${d.line}: ${d.msg}`).join('\n'), status: 'error', diagnostics: diags };
    const ctx = { id: scriptId, name: 'Playground', steps: 0, root: rt.vlRootScope(), lastFrameTime: performance.now() };
    ctx.root.vars.set('script', rt.vlInst(scriptId));
    for (const n of ['Scripts', 'World', 'Storage']) ctx.root.vars.set(n, rt.vlSpaces[rt.VL_SPACES[n]]);
    for(const n of ['Instance','Scripting','Tweening','Extras'])ctx.root.vars.set(n,({Scripting:rt.vlScriptingModule,Instance:rt.vlInstanceModule,Tweening:rt.vlTweeningModule,Extras:rt.vlExtrasModule})[n]);
    const gen = rt.vlMain(ast, ctx); let guard = 0;
    try { while (true) { if (++guard > 10000) throw new Error('Execution stopped after 10000 steps. Check for an infinite loop.'); const next = gen.next(); if (next.done) break; } }
    catch (e) { const line = e.vlLine ? `Line ${e.vlLine}: ` : ''; rt.logOutput('error', line + e.message); return { output: rt.outputLog.map(x => x.text).join('\n'), status: 'error', diagnostics: diags }; }
    return { output: rt.outputLog.length ? rt.outputLog.map(x => x.text).join('\n') : '(No output)', status: 'success', diagnostics: diags };
  };
  global.VanillaluaShared = Object.assign(global.VanillaluaShared || {}, shared);
})(typeof window !== 'undefined' ? window : globalThis);
