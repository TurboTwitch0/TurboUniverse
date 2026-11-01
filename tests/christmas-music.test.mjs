import test from 'node:test';
import assert from 'node:assert/strict';
import { ChristmasBells, JINGLE_DURATION } from '../src/lib/christmas-music.ts';

test('bells start only on play, preserve paused position, and release audio on stop and disposal', async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const contexts = [];
  const voices = [];
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  class FakeAudioContext {
    currentTime = 0;
    state = 'suspended';
    destination = {};
    constructor() { contexts.push(this); }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createOscillator() {
      const voice = {
        frequency: parameter(), immediateStops: 0,
        connect() {}, disconnect() {},
        start(at) { this.startAt = at; },
        stop(at) { if (at === undefined) this.immediateStops++; },
      };
      voices.push(voice);
      return voice;
    }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: FakeAudioContext } });
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeAudioContext });
  const bells = new ChristmasBells();
  t.after(() => {
    bells.dispose();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
    if (previousContext) Object.defineProperty(globalThis, 'AudioContext', previousContext); else delete globalThis.AudioContext;
  });

  assert.equal(contexts.length, 0, 'constructing the player must not activate audio');
  assert.equal(voices.length, 0);
  assert.equal(bells.position, 0);
  await bells.play(.55);
  assert.equal(contexts.length, 1);
  assert.ok(voices.length > 0, 'play schedules actual oscillator output');
  assert.ok(voices.some(voice => voice.startAt > 0), 'the arrangement includes future notes');
  const context = contexts[0];
  context.currentTime = 3;
  assert.equal(bells.position, 3);
  bells.pause();
  assert.ok(voices.every(voice => voice.immediateStops > 0), 'pause cancels every scheduled voice');
  context.currentTime = 8;
  assert.equal(bells.position, 3, 'elapsed wall time while paused must not advance the song');

  const firstVoiceCount = voices.length;
  await bells.play(.3);
  assert.equal(contexts.length, 1, 'resume reuses the audio context');
  const resumedVoices = voices.slice(firstVoiceCount);
  assert.ok(resumedVoices.length > 0);
  assert.ok(resumedVoices.every(voice => voice.startAt >= context.currentTime), 'resume schedules from the current audio time');
  context.currentTime = 10;
  assert.equal(bells.position, 5, 'resume continues from the saved song position');
  context.currentTime += JINGLE_DURATION;
  assert.equal(bells.position, JINGLE_DURATION, 'the song position stops at its finite duration');
  bells.stop();
  assert.equal(bells.position, 0, 'stop returns the song to its beginning');
  assert.ok(resumedVoices.every(voice => voice.immediateStops > 0), 'stop cancels the remaining voices');
  bells.dispose();
  assert.equal(context.state, 'closed', 'disposal releases the audio context');
});
