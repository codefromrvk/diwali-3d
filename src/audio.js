// Every sound is synthesised live: a tanpura drone, temple bells, a bansuri
// phrase in Raag Bhoopali, and the full arsenal of crackers.
const SA = 293.66; // D4
const RATIO = { S: 1, R: 9 / 8, G: 5 / 4, P: 3 / 2, D: 5 / 3 };
const note = (n, oct = 0) => SA * RATIO[n] * Math.pow(2, oct);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.loops = new Map();
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.6, 2.6);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.45;
    this.reverb.connect(this.wet).connect(this.master);
    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    this.bus.connect(this.reverb);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // a crackly, spitting buffer for sparklers
    this.sizzleBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const s = this.sizzleBuf.getChannelData(0);
    let env = 0;
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.0016) env = 0.6 + Math.random() * 0.8;
      env *= 0.9965;
      s[i] = (Math.random() * 2 - 1) * (0.12 + env);
    }
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, ctx.currentTime, 0.8);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  impulse(sec, decay) {
    const ctx = this.ctx, n = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.2);
  }

  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur);
    return s;
  }

  // ---------- ambience ----------
  startAmbience() {
    if (!this.ctx || this.ambience) return;
    this.ambience = true;
    const ctx = this.ctx;
    // river: slow brown-ish noise
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master);
    src.start(); lfo.start();

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.gain.setTargetAtTime(0.8, ctx.currentTime, 4);
    this.droneGain.connect(this.bus);
    const cycle = [note('P', -2), note('S', -1), note('S', -1), note('S', -2)];
    let k = 0, next = ctx.currentTime + 0.5;
    const tick = () => {
      while (next < ctx.currentTime + 0.3) {
        this.pluck(cycle[k % 4], next);
        next += k % 4 === 3 ? 1.6 : 0.95;
        k++;
      }
    };
    this.droneTimer = setInterval(tick, 100);
  }

  pluck(f, t) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = o2.type = 'sawtooth';
    o1.frequency.value = f; o2.frequency.value = f * 1.004;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(f * 14, t);
    lp.frequency.exponentialRampToValueAtTime(f * 2.5, t + 2.4);
    const g = ctx.createGain();
    this.env(g, t, 0.01, 0.09, 4.2);
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(this.droneGain);
    o1.start(t); o2.start(t); o1.stop(t + 4.5); o2.stop(t + 4.5);
  }

  // ---------- melodic ----------
  bell(f = 523, vol = 0.22, t = this.now) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    [[0.5, 0.5, 5], [1, 1, 4], [1.19, 0.4, 2.5], [1.56, 0.35, 2], [2.0, 0.3, 1.8], [2.74, 0.22, 1.2], [3.76, 0.12, 0.9], [5.4, 0.08, 0.6]].forEach(([r, a, dec]) => {
      const o = ctx.createOscillator(); o.frequency.value = f * r;
      const g = ctx.createGain();
      this.env(g, t, 0.003, vol * a, dec);
      o.connect(g).connect(this.bus);
      o.start(t); o.stop(t + dec + 0.1);
    });
  }

  ping(f, vol = 0.05, t = this.now) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const [r, a, dec] of [[1, 1, 1.6], [2.76, 0.3, 0.5], [5.4, 0.12, 0.25]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
      const g = ctx.createGain(); this.env(g, t, 0.004, vol * a, dec);
      o.connect(g).connect(this.bus); o.start(t); o.stop(t + dec + 0.05);
    }
  }

  pentatonicPing(i, vol) {
    const scale = ['S', 'R', 'G', 'P', 'D'];
    const n = scale[i % 5];
    this.ping(note(n, 1 + Math.floor(i / 5) % 2), vol);
  }

  /** Bansuri phrase: [[swar, octave, beats], ...] */
  flute(phrase, { bpm = 70, t = this.now + 0.05, vol = 0.07 } = {}) {
    if (!this.ctx) return 0;
    const ctx = this.ctx, beat = 60 / bpm;
    let at = t;
    for (const [n, oct, beats] of phrase) {
      const dur = beats * beat;
      if (n !== '-') {
        const f = note(n, oct);
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
        const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
        const vg = ctx.createGain(); vg.gain.setValueAtTime(0, at); vg.gain.linearRampToValueAtTime(f * 0.012, at + dur);
        vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
        // meend: glide into the note
        o.frequency.setValueAtTime(f * 0.97, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.09);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol, at + 0.08);
        g.gain.setValueAtTime(vol * 0.9, at + dur * 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.25);
        const o2g = ctx.createGain(); o2g.gain.value = 0.18;
        o.connect(lp); o2.connect(o2g).connect(lp); lp.connect(g).connect(this.bus);
        const br = this.noiseSrc(at, dur + 0.3);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3;
        const bg = ctx.createGain(); this.env(bg, at, 0.05, vol * 0.25, dur);
        br.connect(bp).connect(bg).connect(this.bus);
        [o, o2, vib].forEach((x) => { x.start(at); x.stop(at + dur + 0.3); });
      }
      at += dur;
    }
    return at - t;
  }

  // ---------- story cues ----------
  ignite() {
    if (!this.ctx) return;
    const t = this.now;
    const s = this.noiseSrc(t, 0.6);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
    const g = this.ctx.createGain(); this.env(g, t, 0.02, 0.25, 0.5);
    s.connect(bp).connect(g).connect(this.bus);
    this.bell(note('S', 0), 0.2, t + 0.05);
  }

  /** Rising shimmer while the viewer holds to light the first diya. */
  charge(on) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.chargeNode) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = note('S', 0);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = note('P', 0);
      const g = ctx.createGain(); g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 1.4);
      o.frequency.exponentialRampToValueAtTime(note('S', 1), ctx.currentTime + 1.6);
      o2.frequency.exponentialRampToValueAtTime(note('P', 1), ctx.currentTime + 1.6);
      o.connect(g); o2.connect(g); g.connect(this.bus);
      o.start(); o2.start();
      this.chargeNode = { o, o2, g };
    } else if (!on && this.chargeNode) {
      const { o, o2, g } = this.chargeNode;
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
      o.stop(ctx.currentTime + 0.5); o2.stop(ctx.currentTime + 0.5);
      this.chargeNode = null;
    }
  }

  whoosh(vol = 0.12) {
    if (!this.ctx) return;
    const t = this.now;
    const s = this.noiseSrc(t, 1.6);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(200, t); bp.frequency.exponentialRampToValueAtTime(1400, t + 0.7); bp.frequency.exponentialRampToValueAtTime(300, t + 1.5);
    const g = this.ctx.createGain(); this.env(g, t, 0.5, vol, 1.0);
    s.connect(bp).connect(g).connect(this.bus);
  }

  // ---------- crackers ----------
  launch(dur = 1.4, vol = 0.07) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(700 + Math.random() * 300, t);
    o.frequency.exponentialRampToValueAtTime(2400 + Math.random() * 800, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + dur);
    const s = this.noiseSrc(t, dur);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const sg = ctx.createGain(); this.env(sg, t, 0.05, vol, dur);
    s.connect(hp).connect(sg).connect(this.bus);
  }

  boom(size = 1, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now + delay;
    const s = this.noiseSrc(t, 2.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900 * size, t); lp.frequency.exponentialRampToValueAtTime(90, t + 1.2);
    const g = ctx.createGain(); this.env(g, t, 0.004, 0.42 * Math.min(size, 1.4), 1.6 * size);
    s.connect(lp).connect(g).connect(this.bus);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.8);
    const og = ctx.createGain(); this.env(og, t, 0.004, 0.32 * Math.min(size, 1.3), 0.9 * size);
    o.connect(og).connect(this.bus); o.start(t); o.stop(t + 1.5 * size);
  }

  crackle(dur = 1.2, n = 40, delay = 0, vol = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (let i = 0; i < n; i++) {
      const t = this.now + delay + Math.random() * dur;
      const s = this.noiseSrc(t, 0.03);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500 + Math.random() * 3000;
      const g = ctx.createGain(); this.env(g, t, 0.001, vol * (0.3 + Math.random()), 0.025);
      s.connect(hp).connect(g).connect(this.bus);
    }
  }

  /** Continuous loops: 'sizzle' (sparkler), 'roar' (anar), 'whirr' (chakri). */
  loop(name, on, vol = 0.15) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const cur = this.loops.get(name);
    if (on && !cur) {
      const s = ctx.createBufferSource();
      s.buffer = name === 'sizzle' ? this.sizzleBuf : this.noise;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      if (name === 'sizzle') { f.type = 'highpass'; f.frequency.value = 2200; }
      else if (name === 'roar') { f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.5; }
      else { f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 2; }
      const g = ctx.createGain(); g.gain.value = 0.0001;
      g.gain.setTargetAtTime(vol, ctx.currentTime, 0.08);
      s.connect(f).connect(g).connect(this.bus);
      s.start();
      let lfo = null;
      if (name === 'whirr') {
        lfo = ctx.createOscillator(); lfo.frequency.value = 14;
        const lg = ctx.createGain(); lg.gain.value = 900;
        lfo.connect(lg).connect(f.frequency); lfo.start();
      }
      this.loops.set(name, { s, g, lfo, count: 1 });
    } else if (on && cur) {
      cur.count++;
    } else if (!on && cur) {
      cur.count--;
      if (cur.count > 0) return;
      cur.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
      cur.s.stop(ctx.currentTime + 0.8);
      cur.lfo?.stop(ctx.currentTime + 0.8);
      this.loops.delete(name);
    }
  }

  fuse(dur) {
    if (!this.ctx) return;
    const t = this.now;
    const s = this.ctx.createBufferSource(); s.buffer = this.sizzleBuf; s.loop = true;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.1, t); g.gain.setValueAtTime(0.1, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(hp).connect(g).connect(this.bus); s.start(t); s.stop(t + dur);
  }
}

export const audio = new AudioEngine();

export const PHRASES = {
  dawn: [['G', 0, 1.5], ['R', 0, 0.5], ['S', 0, 1], ['D', -1, 1], ['S', 0, 2], ['-', 0, 0.5], ['R', 0, 0.5], ['G', 0, 1], ['P', 0, 1], ['G', 0, 2.5]],
  spread: [['P', 0, 0.5], ['D', 0, 0.5], ['S', 1, 1.5], ['D', 0, 0.5], ['P', 0, 1], ['G', 0, 0.5], ['P', 0, 0.5], ['D', 0, 1], ['P', 0, 0.5], ['G', 0, 0.5], ['R', 0, 1], ['S', 0, 2.5]],
  rangoli: [['S', 0, 0.5], ['R', 0, 0.5], ['G', 0, 0.5], ['P', 0, 0.5], ['D', 0, 1], ['P', 0, 0.5], ['G', 0, 0.5], ['R', 0, 1], ['G', 0, 2]],
  wish: [['G', 0, 1], ['P', 0, 1], ['D', 0, 1.5], ['S', 1, 0.5], ['D', 0, 1], ['P', 0, 2], ['-', 0, 0.5], ['G', 0, 0.5], ['R', 0, 0.5], ['S', 0, 2.5]],
  finale: [['S', 1, 1], ['D', 0, 0.5], ['P', 0, 0.5], ['G', 0, 1], ['P', 0, 0.5], ['D', 0, 0.5], ['S', 1, 1.5], ['R', 1, 0.5], ['G', 1, 1], ['R', 1, 0.5], ['S', 1, 0.5], ['D', 0, 1], ['S', 1, 3]],
};
