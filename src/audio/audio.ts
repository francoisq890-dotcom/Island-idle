/**
 * Procedural audio: every sound effect and the ambient music are synthesized
 * with the Web Audio API (no audio files, no licensing issues).
 */

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private combo = 0;
  private comboTimer = 0;
  private lastArrive = 0;
  private musicStarted = false;
  private sfxVol = 0.8;
  private musicVol = 0.5;
  private muted = false;

  get ready(): boolean {
    return !!this.ctx;
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(this.master);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(comp);
    this.music.connect(comp);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(comp);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startMusic();
  }

  setVolumes(sfx: number, music: number, muted: boolean): void {
    this.sfxVol = sfx;
    this.musicVol = music;
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.sfxVol, t, 0.05);
    this.music.gain.setTargetAtTime(this.musicVol * 0.55, t, 0.3);
  }

  private makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  private tone(freq: number, opts: { type?: OscillatorType; attack?: number; decay?: number; gain?: number; when?: number; glide?: number; reverb?: number; dest?: AudioNode; detune?: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.when ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.detune) osc.detune.value = opts.detune;
    if (opts.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.glide), t + (opts.decay ?? 0.3));
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.attack ?? 0.005) + (opts.decay ?? 0.3));
    osc.connect(g);
    g.connect(opts.dest ?? this.sfx);
    if (opts.reverb) {
      const r = ctx.createGain();
      r.gain.value = opts.reverb;
      g.connect(r);
      r.connect(this.reverbSend);
    }
    osc.start(t);
    osc.stop(t + (opts.attack ?? 0.005) + (opts.decay ?? 0.3) + 0.05);
  }

  private noise(opts: { freq: number; q?: number; decay: number; gain: number; when?: number; type?: BiquadFilterType; sweep?: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.when ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.freq * opts.sweep, t + opts.decay);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.decay);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + opts.decay + 0.05);
  }

  private midi(n: number): number {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  update(dt: number): void {
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
  }

  // --- Sound effects ------------------------------------------------------------

  /** Crystalline strike — pitch climbs with rapid combos. */
  harvest(): void {
    this.combo = Math.min(this.combo + 1, PENTA.length - 1);
    this.comboTimer = 0.7;
    const base = 72 + PENTA[this.combo];
    const f = this.midi(base);
    this.tone(f, { type: 'sine', decay: 0.55, gain: 0.16, reverb: 0.6 });
    this.tone(f * 2.76, { type: 'sine', decay: 0.25, gain: 0.05, reverb: 0.4 });
    this.tone(f * 5.4, { type: 'sine', decay: 0.08, gain: 0.03 });
    this.noise({ freq: 5000, q: 2, decay: 0.05, gain: 0.08 });
    this.tone(110, { type: 'triangle', decay: 0.08, gain: 0.07, glide: 0.5 });
  }

  buy(): void {
    [0, 4, 7].forEach((n, i) => this.tone(this.midi(76 + n), { type: 'triangle', decay: 0.25, gain: 0.08, when: i * 0.055, reverb: 0.4 }));
  }

  build(): void {
    this.tone(90, { type: 'sine', decay: 0.4, gain: 0.35, glide: 0.4 });
    this.noise({ freq: 400, q: 0.7, decay: 0.35, gain: 0.25, type: 'lowpass', sweep: 0.3 });
    [0, 7, 12, 16].forEach((n, i) => this.tone(this.midi(79 + n), { type: 'sine', decay: 0.4, gain: 0.06, when: 0.08 + i * 0.06, reverb: 0.8 }));
  }

  upgrade(): void {
    [0, 4, 7, 12].forEach((n, i) => this.tone(this.midi(72 + n), { type: 'triangle', decay: 0.35, gain: 0.08, when: i * 0.07, reverb: 0.6 }));
    this.tone(this.midi(96), { type: 'sine', decay: 0.8, gain: 0.04, when: 0.28, reverb: 1 });
  }

  plank(): void {
    this.tone(160 + Math.random() * 60, { type: 'triangle', decay: 0.12, gain: 0.12, glide: 0.6 });
    this.noise({ freq: 900, q: 1.5, decay: 0.08, gain: 0.08 });
  }

  bridgeDone(): void {
    [0, 4, 7, 11, 14].forEach((n, i) => this.tone(this.midi(67 + n), { type: 'sine', decay: 0.9, gain: 0.07, when: i * 0.09, reverb: 1 }));
  }

  error(): void {
    this.tone(180, { type: 'square', decay: 0.12, gain: 0.04, glide: 0.8 });
    this.tone(140, { type: 'square', decay: 0.14, gain: 0.04, when: 0.08, glide: 0.8 });
  }

  click(): void {
    this.tone(1400, { type: 'sine', decay: 0.04, gain: 0.04 });
  }

  hover(): void {
    this.tone(2200, { type: 'sine', decay: 0.02, gain: 0.015 });
  }

  step(): void {
    this.noise({ freq: 700 + Math.random() * 300, q: 0.8, decay: 0.07, gain: 0.035, type: 'lowpass' });
  }

  jump(): void {
    this.tone(300, { type: 'sine', decay: 0.15, gain: 0.05, glide: 1.8 });
  }

  /** Soft blip when a cube reaches the Nexus (rate-limited). */
  arrive(kind: 'shards' | 'lumen'): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastArrive < 0.18) return;
    this.lastArrive = now;
    const n = kind === 'lumen' ? 84 + PENTA[Math.floor(Math.random() * 4)] : 79 + PENTA[Math.floor(Math.random() * 5)];
    this.tone(this.midi(n), { type: 'sine', decay: 0.18, gain: 0.018, reverb: 0.5 });
  }

  objective(): void {
    [0, 7, 12, 16, 19].forEach((n, i) => this.tone(this.midi(72 + n), { type: 'triangle', decay: 0.6, gain: 0.07, when: i * 0.08, reverb: 0.9 }));
  }

  milestone(): void {
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(this.midi(72 + n), { type: 'sine', decay: 0.7, gain: 0.07, when: i * 0.05, reverb: 1 }));
  }

  prestige(): void {
    this.noise({ freq: 200, q: 0.5, decay: 3.5, gain: 0.25, type: 'lowpass', sweep: 8 });
    [0, 7, 12, 16, 19, 24, 28, 31].forEach((n, i) => this.tone(this.midi(55 + n), { type: 'sine', attack: 0.3, decay: 3, gain: 0.06, when: 1.8 + i * 0.12, reverb: 1 }));
    this.tone(55, { type: 'sine', attack: 0.5, decay: 3.5, gain: 0.25, glide: 0.5 });
  }

  welcome(): void {
    [0, 4, 7, 12].forEach((n, i) => this.tone(this.midi(67 + n), { type: 'sine', attack: 0.02, decay: 1.2, gain: 0.07, when: i * 0.12, reverb: 1 }));
  }

  // --- Ambient music ------------------------------------------------------------

  /** Slow generative pad + wind, never repeating exactly. */
  private startMusic(): void {
    if (this.musicStarted || !this.ctx) return;
    this.musicStarted = true;
    const ctx = this.ctx;
    // Wind: filtered noise with slow LFO on the cutoff.
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 500;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 260;
    lfo.connect(lfoG);
    lfoG.connect(wf.frequency);
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.music);
    wind.start();
    lfo.start();

    // Chord progression (Imaj7 – vi7 – IVmaj7 – V6/9) in D major, pentatonic melody.
    const chords = [
      [50, 57, 61, 64, 66],
      [47, 54, 57, 62, 66],
      [43, 50, 54, 57, 62],
      [45, 52, 57, 59, 64],
    ];
    const melodyScale = [62, 64, 66, 69, 71, 74, 76, 78, 81];
    let bar = 0;
    const barLen = 6.4;
    const playBar = () => {
      if (!this.ctx) return;
      const ch = chords[bar % chords.length];
      for (const n of ch) {
        this.tone(this.midi(n), { type: 'sine', attack: 1.6, decay: barLen + 1.5, gain: 0.03, dest: this.music, reverb: 0.4, detune: (Math.random() - 0.5) * 8 });
        this.tone(this.midi(n + 12), { type: 'triangle', attack: 2.2, decay: barLen, gain: 0.006, dest: this.music, detune: 6 });
      }
      // Sparse melody, like wind chimes.
      const notes = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < notes; i++) {
        const m = melodyScale[Math.floor(Math.random() * melodyScale.length)];
        this.tone(this.midi(m), { type: 'sine', attack: 0.01, decay: 2.2, gain: 0.018, when: 0.6 + Math.random() * (barLen - 1.5), dest: this.music, reverb: 1.2 });
      }
      bar++;
    };
    playBar();
    window.setInterval(playBar, barLen * 1000);
  }
}
