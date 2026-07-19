// Synthesized sound: effects, ocean ambience, and an adaptive sea shanty.
// Pure WebAudio, zero audio files.

// original 32-step melody in A minor pentatonic (0 = rest)
const MELODY = [
  57, 60, 62, 64, 67, 64, 62, 60,
  62, 64, 67, 69, 67, 64, 62, 64,
  60, 62, 64, 62, 60, 57, 55, 57,
  60, 0, 57, 0, 55, 0, 52, 0,
];
const BASS = [45, 41, 43, 45]; // A2 F2 G2 A2, one per 8 steps
const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlay: Record<string, number> = {};

  // music state
  private musicStarted = false;
  private musicGain: GainNode | null = null;
  private step = 0;
  private nextNoteAt = 0;
  private mood = { level: 1, notoriety: 0 };

  // Browsers require a user gesture before audio can start.
  init(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.startAmbienceAndMusic();
  }

  setMood(level: number, notoriety: number): void {
    this.mood = { level, notoriety };
  }

  private throttle(name: string, minGapMs: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlay[name] ?? 0) < minGapMs) return false;
    this.lastPlay[name] = now;
    return true;
  }

  private getNoiseBuffer(): AudioBuffer {
    if (!this.noiseBuf) {
      const len = this.ctx!.sampleRate;
      this.noiseBuf = this.ctx!.createBuffer(1, len, this.ctx!.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  private noise(dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass', q = 1): void {
    if (!this.ctx || !this.master) return;
    this.noiseAt(this.ctx.currentTime, dur, freq, vol, type, q, this.master);
  }

  private noiseAt(
    t: number, dur: number, freq: number, vol: number,
    type: BiquadFilterType, q: number, dest: GainNode
  ): void {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + dur);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    this.toneAt(freq, this.ctx.currentTime + delay, dur, type, vol, this.master, slideTo);
  }

  private toneAt(
    freq: number, t: number, dur: number, type: OscillatorType, vol: number,
    dest: GainNode, slideTo?: number
  ): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ---------- ambience + music ----------

  private startAmbienceAndMusic(): void {
    if (!this.ctx || !this.master || this.musicStarted) return;
    this.musicStarted = true;
    const ctx = this.ctx;

    // music bus, kept under the effects
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.3;
    this.musicGain.connect(this.master);

    // the sea herself: looped noise through a slow-breathing lowpass
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start();
    lfo.start();

    // gulls and timbers, forever
    const gullLoop = (): void => {
      window.setTimeout(() => {
        const n = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
          this.tone(1150 - i * 90, 0.16, 'sine', 0.04, 900 - i * 70, i * 0.22);
        }
        gullLoop();
      }, 9000 + Math.random() * 16000);
    };
    const creakLoop = (): void => {
      window.setTimeout(() => {
        this.noise(0.35, 140, 0.05, 'lowpass', 4);
        creakLoop();
      }, 14000 + Math.random() * 24000);
    };
    gullLoop();
    creakLoop();

    // the shanty scheduler — looks ahead and books notes on the audio clock
    this.nextNoteAt = ctx.currentTime + 0.6;
    window.setInterval(() => this.scheduleMusic(), 180);
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.musicGain) return;
    const STEP = 0.21; // ~140bpm eighth notes
    while (this.nextNoteAt < this.ctx.currentTime + 0.6) {
      const t = this.nextNoteAt;
      const idx = this.step % 32;
      const bar = Math.floor(this.step / 8) % 4;

      // bass drone — always with you
      if (this.step % 8 === 0) {
        this.toneAt(midiToFreq(BASS[bar]), t, STEP * 8, 'triangle', 0.13, this.musicGain);
      }
      // the melody joins once you've made a name for yourself (level 2)
      if (this.mood.level >= 2) {
        const m = MELODY[idx];
        if (m > 0) this.toneAt(midiToFreq(m), t, STEP * 1.7, 'sawtooth', 0.06, this.musicGain);
      }
      // and the rhythm section signs on when you're wanted (notoriety 3)
      if (this.mood.notoriety >= 3 && this.step % 2 === 1) {
        this.noiseAt(t, 0.05, 3200, 0.025, 'highpass', 1, this.musicGain);
      }

      this.step++;
      this.nextNoteAt += STEP;
    }
  }

  // ---------- effects ----------

  cannon(): void {
    if (!this.throttle('cannon', 90)) return;
    this.noise(0.22, 300, 0.8);
    this.tone(65, 0.22, 'sine', 0.7, 38);
  }

  hit(): void {
    if (!this.throttle('hit', 60)) return;
    this.noise(0.12, 1500, 0.32, 'bandpass', 2);
  }

  coin(): void {
    this.tone(950, 0.07, 'square', 0.16);
    this.tone(1420, 0.1, 'square', 0.13, undefined, 0.06);
  }

  sink(): void {
    this.tone(140, 0.8, 'sawtooth', 0.32, 35);
    this.noise(0.7, 180, 0.28);
  }

  hurt(): void {
    if (!this.throttle('hurt', 150)) return;
    this.noise(0.2, 500, 0.36);
    this.tone(160, 0.25, 'sawtooth', 0.26, 90);
  }

  levelup(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.13, 'triangle', 0.22, undefined, i * 0.09));
  }

  buy(): void {
    this.tone(700, 0.08, 'square', 0.18);
    this.tone(1050, 0.1, 'square', 0.14, undefined, 0.05);
  }

  dig(): void {
    this.noise(0.15, 250, 0.45);
    this.tone(1200, 0.2, 'triangle', 0.18, undefined, 0.1);
  }

  rum(): void {
    this.tone(280, 0.12, 'sine', 0.22, 180);
    this.tone(200, 0.12, 'sine', 0.18, 140, 0.1);
  }

  buff(): void {
    this.tone(500, 0.16, 'triangle', 0.22, 900);
  }

  splashSmall(): void {
    if (!this.throttle('splash', 120)) return;
    this.noise(0.25, 700, 0.14, 'bandpass', 1.5);
  }

  harpoon(): void {
    if (!this.throttle('harpoon', 120)) return;
    this.noise(0.12, 2200, 0.16, 'bandpass', 3);
    this.tone(90, 0.1, 'sine', 0.26, 60, 0.08);
  }

  bossHorn(): void {
    this.tone(82, 1.1, 'sawtooth', 0.38, 48);
    this.tone(55, 1.3, 'sine', 0.38, 40, 0.15);
    this.noise(0.8, 150, 0.24);
  }

  explosion(): void {
    if (!this.throttle('explosion', 100)) return;
    this.noise(0.4, 220, 0.65);
    this.tone(55, 0.35, 'sine', 0.55, 30);
  }
}

export const sfx = new Sfx();
