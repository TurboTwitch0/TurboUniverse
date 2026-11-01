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

export class ChristmasBells {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private voices: OscillatorNode[] = [];
  private startedAt = 0;
  private offset = 0;
  private active = false;

  get position() { return Math.min(JINGLE_DURATION, this.offset + (this.active && this.context ? this.context.currentTime - this.startedAt : 0)); }

  async play(volume: number) {
    if (!this.context) {
      if (!window.AudioContext) throw new Error('Bell playback is not supported in this browser. Try one of the official videos.');
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
    }
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Sound could not start. Select Play again to enable audio.');
    this.pause();
    if (this.offset >= JINGLE_DURATION - .1) this.offset = 0;
    this.setVolume(volume);
    const context = this.context;
    this.startedAt = context.currentTime;
    this.active = true;
    let time = 0;
    for (const [note, beats] of chorus) {
      const length = beats * beat;
      const end = time + Math.min(length * .88, .9);
      if (end > this.offset) {
        const delay = Math.max(0, time - this.offset);
        const remaining = Math.max(.05, end - Math.max(time, this.offset));
        for (const [ratio, level] of [[1, .16], [2.76, .025]]) {
          const oscillator = context.createOscillator();
          const envelope = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequencies[note] * ratio;
          envelope.gain.setValueAtTime(.0001, context.currentTime + delay);
          envelope.gain.exponentialRampToValueAtTime(level, context.currentTime + delay + .008);
          envelope.gain.exponentialRampToValueAtTime(.0001, context.currentTime + delay + remaining);
          oscillator.connect(envelope);
          envelope.connect(this.gain!);
          oscillator.start(context.currentTime + delay);
          oscillator.stop(context.currentTime + delay + remaining + .03);
          oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
          this.voices.push(oscillator);
        }
      }
      time += length;
    }
  }

  setVolume(volume: number) { if (this.gain && this.context) this.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.context.currentTime, .025); }
  pause() {
    this.offset = this.position;
    this.active = false;
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already finished. */ } }
    this.voices = [];
  }
  stop() { this.pause(); this.offset = 0; }
  dispose() { this.stop(); void this.context?.close(); this.context = null; this.gain = null; }
}
