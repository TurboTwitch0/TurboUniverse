/** An original bell performance of J. Pierpont's historic Jingle Bells melody. */
const frequencies: Record<string, number> = { C: 523.25, D: 587.33, E: 659.25, F: 698.46, G: 783.99 };
const chorus: [string, number][] = [
  ['E', 1], ['E', 1], ['E', 2], ['E', 1], ['E', 1], ['E', 2],
  ['E', 1], ['G', 1], ['C', 1.5], ['D', .5], ['E', 4],
  ['F', 1], ['F', 1], ['F', 1.5], ['F', .5], ['F', 1], ['E', 1], ['E', 1], ['E', .5], ['E', .5],
  ['E', 1], ['D', 1], ['D', 1], ['E', 1], ['D', 2], ['G', 2],
  ['E', 1], ['E', 1], ['E', 2], ['E', 1], ['E', 1], ['E', 2],
  ['E', 1], ['G', 1], ['C', 1.5], ['D', .5], ['E', 4],
  ['F', 1], ['F', 1], ['F', 1.5], ['F', .5], ['F', 1], ['E', 1], ['E', 1], ['E', .5], ['E', .5],
  ['G', 1], ['G', 1], ['F', 1], ['D', 1], ['C', 4],
];
const beat = 60 / 132;
export const JINGLE_DURATION = chorus.reduce((sum, [, duration]) => sum + duration * beat, 0) + 1;
const harmony = {
  C: [130.81, 164.81, 196],
  F: [174.61, 220, 261.63],
  G: [196, 246.94, 293.66],
};
const bars: (keyof typeof harmony)[] = ['C', 'C', 'C', 'C', 'F', 'C', 'G', 'G', 'C', 'C', 'C', 'C', 'F', 'C', 'G', 'C'];

export class ChristmasBells {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private voices = new Map<OscillatorNode, GainNode>();
  private startedAt = 0;
  private offset = 0;
  private active = false;
  private request = 0;

  get position() { return Math.max(0, Math.min(JINGLE_DURATION, this.offset + (this.active && this.context ? this.context.currentTime - this.startedAt : 0))); }

  async play(volume: number) {
    this.pause();
    const request = ++this.request;
    if (!this.context) {
      if (!window.AudioContext) throw new Error('Bell playback is not supported in this browser. Try one of the official videos.');
      this.context = new window.AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
    }
    const context = this.context;
    try { await context.resume(); }
    catch (error) { if (request !== this.request || this.context !== context) return; throw error; }
    if (request !== this.request || this.context !== context) return;
    if (context.state !== 'running') throw new Error('Sound could not start. Select Play again to enable audio.');
    if (this.offset >= JINGLE_DURATION - .1) this.offset = 0;
    this.setVolume(volume);
    this.startedAt = context.currentTime;
    this.active = true;
    let time = 0;
    for (const [note, beats] of chorus) {
      const ring = Math.min(.72 + beats * .2, 1.5);
      // A strong soft fundamental and quiet, near-harmonic overtones avoid a sharp metallic beep.
      for (const [ratio, level] of [[1, .112], [2.01, .018], [4.02, .004]]) {
        this.note(frequencies[note] * ratio, time, ring, level, .012);
      }
      time += beats * beat;
    }
    // Quiet lower-register chords and alternating bass give the melody a warm music-box backing.
    for (const [index, chord] of bars.entries()) {
      const start = index * 4 * beat;
      for (const frequency of harmony[chord]) this.note(frequency, start, 3.6 * beat, .011, .06);
      this.note(harmony[chord][0] / 2, start, 1.3 * beat, .024, .018);
      this.note(harmony[chord][2] / 2, start + 2 * beat, 1.1 * beat, .018, .018);
    }
  }

  private note(frequency: number, at: number, length: number, level: number, attack: number) {
    const context = this.context!;
    const elapsed = Math.max(0, this.offset - at);
    const remaining = length - elapsed;
    if (remaining <= .01) return;
    const starts = context.currentTime + Math.max(0, at - this.offset);
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const peak = Math.max(.00011, level * Math.exp(-6 * elapsed / length));
    envelope.gain.setValueAtTime(.0001, starts);
    envelope.gain.exponentialRampToValueAtTime(peak, starts + Math.min(attack, remaining / 3));
    envelope.gain.exponentialRampToValueAtTime(.0001, starts + remaining);
    oscillator.connect(envelope);
    envelope.connect(this.gain!);
    oscillator.start(starts);
    oscillator.stop(starts + remaining + .025);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.voices.delete(oscillator); };
    this.voices.set(oscillator, envelope);
  }

  setVolume(volume: number) {
    if (!this.gain || !this.context) return;
    const target = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setTargetAtTime(target, this.context.currentTime, .025);
  }
  pause() {
    this.request++;
    this.offset = this.position;
    this.active = false;
    const now = this.context?.currentTime ?? 0;
    for (const [voice, envelope] of this.voices) {
      try {
        envelope.gain.cancelScheduledValues(now);
        envelope.gain.setTargetAtTime(.0001, now, .006);
        voice.stop(now + .025);
      } catch { /* Already finished. */ }
    }
    this.voices.clear();
  }
  /** Scrubbing pauses sound; callers may explicitly play again to continue from this position. */
  seek(seconds: number) { this.pause(); this.offset = Number.isFinite(seconds) ? Math.max(0, Math.min(JINGLE_DURATION, seconds)) : 0; }
  stop() { this.pause(); this.offset = 0; }
  dispose() {
    this.stop();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => { /* Already released. */ });
    this.context = null; this.gain = null;
  }
}
