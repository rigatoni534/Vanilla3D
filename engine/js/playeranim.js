// Vanilla Engine — procedural animation for R6-style player models.
// The controller has no clips: it blends poses from named joints and the distance travelled, so feet stay planted
// instead of sliding on a timer. player.js owns the body and calls step() once per rendered frame.
const PLAYER_ANIM_FADE = 0.16;       // seconds to crossfade between states
const PLAYER_ANIM_STATES = ['Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Land', 'Dead'];

class PlayerAnimator {
    constructor() {
        this.time = 0;
        this.state = 'Idle';
        this.previous = 'Idle';
        this.fade = 1;
        this.phase = 0;
        this.gait = 0;
        this.land = 0;
        this.turn = 0;
        this.pose = this.makePose();
    }
    reset() {
        this.time = 0; this.state = 'Idle'; this.previous = 'Idle'; this.fade = 1;
        this.phase = 0; this.gait = 0; this.land = 0; this.turn = 0;
        this.pose = this.makePose();
    }
    makePose() {
        return {
            state: this.state, previous: this.previous, fade: this.fade, phase: this.phase, gait: this.gait,
            stride: 0, breath: 0, lean: 0, headPitch: 0, squash: 0, airArm: 0, airLeg: 0
        };
    }
    setState(next) {
        if (next === this.state) return;
        this.previous = this.state;
        this.state = next;
        this.fade = 0;
    }
    step(dt, info) {
        dt = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
        if (!(dt > 0)) return this.pose;
        this.time += dt;
        const dead = !!info.dead, onGround = !!info.onGround, sprinting = !!info.sprinting;
        const moving = !!info.moving;
        let next = 'Idle';
        if (dead) next = 'Dead';
        else if (!onGround) next = info.vy > 0.25 ? 'Jump' : 'Fall';
        else if (info.landed) next = 'Land';
        else if (moving) next = sprinting ? 'Run' : 'Walk';
        this.setState(next);
        this.fade = Math.min(1, this.fade + dt / PLAYER_ANIM_FADE);

        // Feet are driven by world distance, not elapsed time. A pushed or blocked player consequently stops stepping.
        const distance = Math.max(0, Number.isFinite(info.distance) ? info.distance : 0);
        if (onGround && !dead) this.phase += distance * (sprinting ? 3.9 : 3.35);
        const targetGait = onGround && !dead ? (moving ? (sprinting ? 1 : 0.65) : 0) : 0;
        this.gait += (targetGait - this.gait) * (1 - Math.exp(-12 * dt));
        if (!onGround) this.gait += (0.35 - this.gait) * (1 - Math.exp(-8 * dt));
        if (info.landed) this.land = 1;
        this.land = Math.max(0, this.land - dt * 4.2);
        const look = Number.isFinite(info.look) ? info.look : 0;
        const turn = Number.isFinite(info.turn) ? info.turn : 0;
        this.turn += (turn - this.turn) * (1 - Math.exp(-10 * dt));

        const stride = Math.sin(this.phase) * this.gait;
        const airArm = next === 'Jump' ? -38 : next === 'Fall' ? -66 : 0;
        const airLeg = next === 'Jump' ? 20 : next === 'Fall' ? 8 : 0;
        const breath = this.state === 'Idle' ? Math.sin(this.time * 2.15) : Math.sin(this.time * 2.15) * 0.18;
        const lean = Math.max(-0.18, Math.min(0.18, this.turn * 0.6)) + (moving ? (sprinting ? 0.045 : 0.025) : 0);
        const squash = this.land > 0 ? Math.sin(this.land * Math.PI) * 0.22 : 0;
        this.pose = {
            state: this.state, previous: this.previous, fade: this.fade, phase: this.phase, gait: this.gait,
            stride, breath, lean, headPitch: Math.max(-0.45, Math.min(0.45, -look * 0.55)), squash, airArm, airLeg
        };
        return this.pose;
    }
}
