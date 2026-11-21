import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { createVercelApp } from '../api/index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const app = express();
const api = createVercelApp({ blobToken: '', adminKey: '' });
app.use((request, response, next) => request.path.startsWith('/api/') ? api(request, response, next) : next());
app.use(express.static(path.join(root, 'dist')));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
let browser;

function observeMediaSession() {
  window.radioActions = {};
  window.radioPositions = [];
  window.radioContexts = [];
  const NativeAudioContext = window.AudioContext;
  window.AudioContext = class extends NativeAudioContext {
    constructor(...arguments_) {
      super(...arguments_);
      window.radioContexts.push(this);
    }
  };
  const session = navigator.mediaSession;
  if (!session) return;
  const setActionHandler = session.setActionHandler.bind(session);
  session.setActionHandler = (action, handler) => {
    setActionHandler(action, handler);
    window.radioActions[action] = handler;
  };
  const setPositionState = session.setPositionState?.bind(session);
  session.setPositionState = position => {
    setPositionState?.(position);
    window.radioPositions.push(position ?? null);
  };
}

const youtubeFixture = `
window.YT = { Player: class {
  constructor(element, options) {
    this.events = options.events;
    this.iframe = document.createElement('iframe');
    this.iframe.title = 'Official video fixture';
    element.replaceWith(this.iframe);
    window.radioVideo = this;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.throwOnPlay = window.failNextVideoStart === true;
    window.failNextVideoStart = false;
    setTimeout(() => this.events.onReady(), 0);
  }
  playVideo() {
    if (this.throwOnPlay) throw new Error('Video transport unavailable');
    this.playCalls++;
    setTimeout(() => this.events.onStateChange({ data: 1 }), 0);
  }
  pauseVideo() { this.pauseCalls++; setTimeout(() => this.events.onStateChange({ data: 2 }), 0); }
  stopVideo() { this.events.onStateChange({ data: 0 }); }
  destroy() { this.iframe.remove(); }
  setVolume() {}
  mute() {}
  unMute() {}
} };
window.onYouTubeIframeAPIReady?.();
`;

try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(observeMediaSession);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-21T12:00:00Z'));
  let youtubeRequests = 0;
  await page.route('https://www.youtube.com/iframe_api', route => {
    youtubeRequests++;
    return route.fulfill({ contentType: 'text/javascript', body: youtubeFixture });
  });
  await page.goto(`${origin}/#collection`);
  await page.getByRole('button', { name: 'Play Christmas music', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.mediaSession.metadata), null, 'Loading a page never claims a media session');
  assert.equal(await page.evaluate(() => window.radioContexts.length), 0, 'Loading a page never starts audio');
  assert.equal(youtubeRequests, 0, 'YouTube stays unloaded until a video is played');

  const radio = page.getByRole('complementary', { name: 'Christmas music', exact: true });
  const restore = page.getByRole('button', { name: 'Show Christmas radio', exact: true });
  await radio.getByRole('button', { name: 'Play Christmas music', exact: true }).click();
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'playing' && navigator.mediaSession.metadata?.title === 'Jingle Bells');
  await page.evaluate(() => window.radioContexts[0].suspend());
  await radio.getByText('Audio was paused by your device. Press Play to continue.', { exact: true }).waitFor({ state: 'attached' });
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'paused');
  await radio.getByRole('button', { name: 'Play Christmas music', exact: true }).click();
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'playing');
  await page.evaluate(() => window.radioContexts[0].close());
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'paused');
  await page.evaluate(() => window.radioActions.play({ action: 'play' }));
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'playing' && window.radioContexts.length === 2);
  await radio.getByRole('button', { name: 'Hide Christmas radio', exact: true }).click();
  assert.equal(await radio.isVisible(), false);
  await page.evaluate(() => window.radioActions.pause({ action: 'pause' }));
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'paused' && !document.querySelector('.radio-playing-dot'));
  await page.evaluate(() => window.radioActions.seekto({ action: 'seekto', seekTime: 6 }));
  await page.waitForFunction(() => Math.abs(window.radioPositions.at(-1)?.position - 6) < .1);
  await page.evaluate(() => window.radioActions.play({ action: 'play' }));
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'playing');
  await page.evaluate(() => window.radioActions.seekforward({ action: 'seekforward', seekOffset: 5 }));
  await page.waitForFunction(() => window.radioPositions.at(-1)?.position >= 11 && navigator.mediaSession.playbackState === 'playing');
  await page.evaluate(() => window.radioActions.stop({ action: 'stop' }));
  await page.waitForFunction(() => navigator.mediaSession.metadata === null && navigator.mediaSession.playbackState === 'none');
  assert.equal(await page.evaluate(() => Object.values(window.radioActions).every(handler => handler === null)), true, 'Stop releases action handlers');

  await restore.click();
  const picker = page.getByLabel('Pick your holiday track', { exact: true });
  await picker.selectOption('deck-the-halls');
  await radio.getByRole('button', { name: 'Play Christmas music', exact: true }).click();
  await page.waitForFunction(() => navigator.mediaSession.metadata?.title === 'Deck the Halls' && navigator.mediaSession.playbackState === 'playing');
  assert.ok(await page.evaluate(() => window.radioPositions.at(-1).duration > 32));
  await radio.getByRole('button', { name: 'Hide Christmas radio', exact: true }).click();
  await page.getByRole('button', { name: 'View TurboHome', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.evaluate(() => window.radioActions.pause({ action: 'pause' }));
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'paused');
  assert.equal(await page.getByRole('dialog').isVisible(), true, 'Device pause also works while a project dialog is open');
  await page.keyboard.press('Escape');
  await restore.click();
  await picker.selectOption('E8gmARGvPlI');
  await page.waitForFunction(() => navigator.mediaSession.metadata === null);
  assert.equal(youtubeRequests, 0);
  await page.evaluate(() => { window.failNextVideoStart = true; });
  await radio.getByRole('button', { name: 'Play Christmas music', exact: true }).click();
  await radio.getByText('The video could not start. Try Play again or open the official video.', { exact: true }).waitFor();
  await radio.getByRole('button', { name: 'Play Christmas music', exact: true }).click();
  await radio.getByRole('button', { name: 'Pause Christmas music', exact: true }).waitFor();
  assert.equal(youtubeRequests, 1);
  await radio.getByRole('button', { name: 'Minimize Christmas radio', exact: true }).click();
  const iframe = await radio.locator('iframe').boundingBox();
  assert.ok(iframe.width >= 200 && iframe.height >= 200, 'A playing minimized video remains visible');
  await radio.getByRole('button', { name: 'Hide Christmas radio', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.radio-playing-dot'));
  assert.ok(await page.evaluate(() => window.radioVideo.pauseCalls > 0));
  await restore.click();
  await page.evaluate(() => { window.radioVideo.throwOnPlay = true; });
  await radio.getByRole('button', { name: 'Play Christmas music', exact: true }).click();
  await radio.getByText('The video could not start. Try Play again or open the official video.', { exact: true }).waitFor();
  await radio.getByRole('button', { name: 'Play Christmas music', exact: true }).click();
  await radio.getByRole('button', { name: 'Pause Christmas music', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();

  const unsupported = await browser.newContext({ serviceWorkers: 'block' });
  await unsupported.addInitScript(() => Object.defineProperty(navigator, 'mediaSession', { value: undefined }));
  const fallback = await unsupported.newPage();
  await fallback.clock.setFixedTime(new Date('2026-11-21T12:00:00Z'));
  await fallback.goto(origin);
  await fallback.getByRole('button', { name: 'Play Christmas music', exact: true }).click();
  await fallback.getByRole('button', { name: 'Pause Christmas music', exact: true }).waitFor();
  await unsupported.close();
  console.log('Christmas radio passed native Media Session registration, device interruptions/recovery, hidden play/pause/stop/seeking, track metadata, modal playback, video isolation/retry, and unsupported-browser fallback.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
