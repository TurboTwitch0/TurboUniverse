/** Original bell arrangements of historic melodies. */
const frequencies = { B4: 493.88, C: 523.25, D: 587.33, E: 659.25, F: 698.46, G: 783.99, A: 880, B: 987.77, C6: 1046.5, D6: 1174.66 };
type Melody = readonly (readonly [keyof typeof frequencies, number])[];

// J. Pierpont's Jingle Bells chorus.
const jingleBells: Melody = [
  ['E', 1], ['E', 1], ['E', 2], ['E', 1], ['E', 1], ['E', 2],
  ['E', 1], ['G', 1], ['C', 1.5], ['D', .5], ['E', 4],
  ['F', 1], ['F', 1], ['F', 1.5], ['F', .5], ['F', 1], ['E', 1], ['E', 1], ['E', .5], ['E', .5],
  ['E', 1], ['D', 1], ['D', 1], ['E', 1], ['D', 2], ['G', 2],
  ['E', 1], ['E', 1], ['E', 2], ['E', 1], ['E', 1], ['E', 2],
  ['E', 1], ['G', 1], ['C', 1.5], ['D', .5], ['E', 4],
  ['F', 1], ['F', 1], ['F', 1.5], ['F', .5], ['F', 1], ['E', 1], ['E', 1], ['E', .5], ['E', .5],
  ['G', 1], ['G', 1], ['F', 1], ['D', 1], ['C', 4],
];

// Deck the Halls uses the traditional Welsh tune Nos Galan.
const deckOpening: Melody = [['G', 1.5], ['F', .5], ['E', 1], ['D', 1], ['C', 1], ['D', 1], ['E', 1], ['C', 1]];
const deckRefrain: Melody = [['D', .5], ['E', .5], ['F', .5], ['D', .5], ['E', 1], ['D', 1], ['C', 1], ['B4', 1], ['C', 2]];
const deckTheHalls: Melody = [
  ...deckOpening, ...deckRefrain, ...deckOpening, ...deckRefrain,
  ['D', 1.5], ['E', .5], ['F', 1], ['D', 1], ['E', 1.5], ['F', .5], ['G', 1], ['D', 1],
  ['E', .5], ['F', .5], ['G', .5], ['A', .5], ['B', 1], ['C6', 1], ['D6', 1], ['B', 1], ['C6', 2],
  ...deckOpening,
  ['A', .5], ['A', .5], ['A', .5], ['A', .5], ['G', 1], ['F', 1], ['E', 1], ['D', 1], ['C', 2],
];

const harmony = {
  C: [130.81, 164.81, 196],
  F: [174.61, 220, 261.63],
  G: [196, 246.94, 293.66],
  Am: [110, 130.81, 164.81],
};

export type LocalChristmasTrack = 'bells' | 'deck-the-halls';
type Arrangement = { melody: Melody; beat: number; transpose: number; bars: readonly (keyof typeof harmony)[] };
const arrangements: Record<LocalChristmasTrack, Arrangement> = {
  bells: {
    melody: jingleBells, beat: 60 / 132, transpose: 1,
    bars: ['C', 'C', 'C', 'C', 'F', 'C', 'G', 'G', 'C', 'C', 'C', 'C', 'F', 'C', 'G', 'C'],
  },
  'deck-the-halls': {
    melody: deckTheHalls, beat: 60 / 116, transpose: 2 ** (-5 / 12),
    bars: ['C', 'C', 'G', 'C', 'C', 'C', 'G', 'C', 'G', 'C', 'G', 'C', 'C', 'C', 'Am', 'C'],
  },
};

export function christmasTrackDuration(track: LocalChristmasTrack) {
  const { melody, beat } = arrangements[track];
  return melody.reduce((sum, [, beats]) => sum + beats, 0) * beat + 1;
}
export const JINGLE_DURATION = christmasTrackDuration('bells');

export class ChristmasBells {
  private readonly arrangement: Arrangement;
  private readonly duration: number;
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private voices = new Map<OscillatorNode, GainNode>();
  private startedAt = 0;
  private offset = 0;
  private active = false;
  private request = 0;

  constructor(track: LocalChristmasTrack = 'bells') {
    this.arrangement = arrangements[track];
    this.duration = christmasTrackDuration(track);
  }

  get position() { return Math.max(0, Math.min(this.duration, this.offset + (this.active && this.context ? this.context.currentTime - this.startedAt : 0))); }
  get interrupted() { return this.active && this.context !== null && this.context.state !== 'running'; }

  async play(volume: number) {
    this.pause();
    const request = ++this.request;
    if (!this.context || this.context.state === 'closed') {
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
    if (this.offset >= this.duration - .1) this.offset = 0;
    this.setVolume(volume);
    this.startedAt = context.currentTime;
    this.active = true;
    let time = 0;
    const { melody, beat, transpose, bars } = this.arrangement;
    for (const [note, beats] of melody) {
      const ring = Math.min(.72 + beats * .2, 1.5);
      // A strong soft fundamental and quiet, near-harmonic overtones avoid a sharp metallic beep.
      for (const [ratio, level] of [[1, .112], [2.01, .018], [4.02, .004]]) {
        this.note(frequencies[note] * transpose * ratio, time, ring, level, .012);
      }
      time += beats * beat;
    }
    // Quiet lower-register chords and alternating bass give the melody a warm music-box backing.
    for (const [index, chord] of bars.entries()) {
      const start = index * 4 * beat;
      const [root, third, fifth] = harmony[chord].map(frequency => frequency * transpose);
      for (const frequency of [root, third, fifth]) this.note(frequency, start, 3.6 * beat, .011, .06);
      this.note(root / 2, start, 1.3 * beat, .024, .018);
      this.note(fifth / 2, start + 2 * beat, 1.1 * beat, .018, .018);
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
  seek(seconds: number) { this.pause(); this.offset = Number.isFinite(seconds) ? Math.max(0, Math.min(this.duration, seconds)) : 0; }
  stop() { this.pause(); this.offset = 0; }
  dispose() {
    this.stop();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => { /* Already released. */ });
    this.context = null; this.gain = null;
  }
}
