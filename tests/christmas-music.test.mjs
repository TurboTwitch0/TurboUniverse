import test from 'node:test';
import assert from 'node:assert/strict';
import { ChristmasBells, JINGLE_DURATION, christmasTrackDuration } from '../src/lib/christmas-music.ts';

function audioFixture(t, deferResume = false, track = 'bells') {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const contexts = [], voices = [], gains = [], resumes = [];
  const parameter = () => ({
    value: 0, targets: [],
    setValueAtTime(value) { this.value = value; },
    exponentialRampToValueAtTime(value) { assert.ok(Number.isFinite(value) && value > 0); },
    setTargetAtTime(value) { this.targets.push(value); },
    cancelScheduledValues() {},
  });
  class FakeAudioContext {
    currentTime = 0;
    state = 'suspended';
    destination = {};
    constructor() { contexts.push(this); }
    createGain() { const gain = { gain: parameter(), connect() {}, disconnect() {} }; gains.push(gain); return gain; }
    createOscillator() {
      const voice = {
        frequency: parameter(),
        connect() {}, disconnect() {},
        start(at) { this.startAt = at; },
        stop(at) { this.stopAt = at; },
      };
      voices.push(voice);
      return voice;
    }
    resume() {
      if (deferResume) return new Promise((resolve, reject) => resumes.push((failed = false) => { if (failed) { reject(new Error('Context closed before resume')); return; } if (this.state !== 'closed') this.state = 'running'; resolve(); }));
      this.state = 'running';
      return Promise.resolve();
    }
    async close() { this.state = 'closed'; }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: FakeAudioContext } });
  const bells = new ChristmasBells(track);
  t.after(() => {
    bells.dispose();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
  });
  return { bells, contexts, voices, gains, resumes };
}

test('bells start only on play, preserve paused position, and release audio on stop and disposal', async t => {
  const { bells, contexts, voices } = audioFixture(t);
  assert.equal(contexts.length, 0, 'constructing the player must not activate audio');
  assert.equal(bells.position, 0);
  await bells.play(.55);
  assert.equal(contexts.length, 1);
  assert.ok(voices.some(voice => voice.startAt > 0), 'the arrangement includes future notes');
  assert.ok(voices.some(voice => voice.frequency.value < 200), 'the bells have lower-register musical accompaniment');
  const context = contexts[0];
  context.currentTime = 3;
  assert.equal(bells.position, 3);
  bells.pause();
  assert.ok(voices.every(voice => voice.stopAt <= 3.03), 'pause cancels every scheduled voice with a short release');
  context.currentTime = 8;
  assert.equal(bells.position, 3, 'elapsed time while paused must not advance the song');

  const firstVoiceCount = voices.length;
  await bells.play(.3);
  assert.equal(contexts.length, 1, 'resume reuses the audio context');
  const resumedVoices = voices.slice(firstVoiceCount);
  assert.ok(resumedVoices.length > 0);
  assert.ok(resumedVoices.every(voice => voice.startAt >= context.currentTime), 'resume schedules from the current audio time');
  context.currentTime = 10;
  assert.equal(bells.position, 5, 'resume continues from the saved song position');
  context.currentTime += JINGLE_DURATION;
  assert.equal(bells.position, JINGLE_DURATION);
  bells.stop();
  assert.equal(bells.position, 0);
  assert.ok(resumedVoices.every(voice => voice.stopAt <= context.currentTime + .03));
  bells.dispose();
  assert.equal(context.state, 'closed', 'disposal releases the audio context');
});

test('scrubbing stays silent until an explicit play and resumes from the requested position', async t => {
  const { bells, contexts, voices } = audioFixture(t);
  bells.seek(8);
  assert.equal(bells.position, 8);
  assert.equal(contexts.length, 0, 'moving the scrubber must not activate audio');
  await bells.play(.4);
  contexts[0].currentTime = 2;
  assert.equal(bells.position, 10);
  bells.seek(15);
  const count = voices.length;
  contexts[0].currentTime = 4;
  assert.equal(bells.position, 15, 'seeking pauses the old schedule');
  assert.equal(voices.length, count);
  await bells.play(.4);
  contexts[0].currentTime = 5;
  assert.equal(bells.position, 16);
  bells.seek(-10);
  assert.equal(bells.position, 0);
  bells.seek(JINGLE_DURATION + 10);
  assert.equal(bells.position, JINGLE_DURATION);
  bells.seek(NaN);
  assert.equal(bells.position, 0);
});

test('stop, seek, and disposal cancel an audio start waiting for browser permission', async t => {
  const { bells, contexts, voices, resumes } = audioFixture(t, true);
  const first = bells.play(.5);
  bells.stop(); resumes.shift()(); await first;
  assert.equal(voices.length, 0, 'a canceled start must never schedule sound');
  const second = bells.play(.5);
  bells.seek(12); resumes.shift()(); await second;
  assert.equal(voices.length, 0);
  assert.equal(bells.position, 12);
  const third = bells.play(.5);
  bells.dispose(); resumes.shift()(true); await third;
  assert.equal(voices.length, 0);
  assert.equal(contexts[0].state, 'closed');
});

test('volume changes are finite, bounded, and safe to mute during playback', async t => {
  const { bells, gains } = audioFixture(t);
  await bells.play(.5);
  for (const value of [2, -.3, NaN, Infinity, 0, .7]) bells.setVolume(value);
  assert.deepEqual(gains[0].gain.targets, [.5, 1, 0, 0, 0, 0, .7]);
});

test('Deck the Halls uses its own melody and seeks to its own end', async t => {
  const { bells, voices } = audioFixture(t, false, 'deck-the-halls');
  const deckDuration = christmasTrackDuration('deck-the-halls');
  assert.ok(deckDuration > JINGLE_DURATION);

  await bells.play(.4);
  assert.ok(Math.abs(voices[0].frequency.value - 587.33) < .1, 'opens with D in its arrangement in F');
  assert.ok(voices.some(voice => voice.startAt > JINGLE_DURATION), 'the arrangement continues after the Jingle Bells limit');

  bells.seek(JINGLE_DURATION + 1);
  assert.equal(bells.position, JINGLE_DURATION + 1);
  bells.seek(deckDuration + 1);
  assert.equal(bells.position, deckDuration);
  await bells.play(.4);
  assert.equal(bells.position, 0, 'playing at the end restarts the tune');
});
