import test from 'node:test';
import assert from 'node:assert/strict';
import { AMBIENT_TRACKS, parseCustomMusicUrl } from './ambientMusicEngine.ts';
import {
  normalizeLegacyGoalText,
  sanitizeCustomMusicTracks,
} from './firestoreSanitizers.ts';

test('AMBIENT_TRACKS have distinct synthesis profiles and no legacy title', () => {
  assert.equal(AMBIENT_TRACKS.length, 4);
  for (const track of AMBIENT_TRACKS) {
    assert.ok(!/respiro del mattino/i.test(track.title));
  }
  const modes = new Set(AMBIENT_TRACKS.map((t) => `${t.waveform}:${t.arpeggioMode}:${t.padCutoffHz}`));
  assert.equal(modes.size, 4);
});

test('parseCustomMusicUrl parses standard YouTube, youtu.be, shorts, and playlists', () => {
  const watch = parseCustomMusicUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(watch.type, 'youtube');
  assert.equal(watch.youtubeId, 'dQw4w9WgXcQ');
  assert.match(watch.embedUrl || '', /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);

  const shortUrl = parseCustomMusicUrl('https://youtu.be/abc123XYZ_0?t=12');
  assert.equal(shortUrl.type, 'youtube');
  assert.equal(shortUrl.youtubeId, 'abc123XYZ_0');

  const shorts = parseCustomMusicUrl('https://youtube.com/shorts/shortId1234');
  assert.equal(shorts.type, 'youtube');
  assert.equal(shorts.youtubeId, 'shortId1234');

  const playlist = parseCustomMusicUrl('https://www.youtube.com/playlist?list=PL1234567890abcdef');
  assert.equal(playlist.type, 'youtube');
  assert.match(playlist.embedUrl || '', /videoseries\?list=PL1234567890abcdef/);
});

test('parseCustomMusicUrl handles direct audio URLs and rejects invalid or unsafe URLs', () => {
  const mp3 = parseCustomMusicUrl('https://cdn.example.org/audio/relax-piano.mp3');
  assert.equal(mp3.type, 'audio');
  assert.equal(mp3.audioUrl, 'https://cdn.example.org/audio/relax-piano.mp3');

  assert.equal(parseCustomMusicUrl('').type, 'invalid');
  assert.equal(parseCustomMusicUrl('not a url').type, 'invalid');
  assert.equal(parseCustomMusicUrl('javascript:alert(1)').type, 'invalid');
  assert.equal(parseCustomMusicUrl('https://www.youtube.com/watch').type, 'invalid');
});

test('normalizeLegacyGoalText replaces legacy phrase with persona magra', () => {
  const updated = normalizeLegacyGoalText(
    'Voglio vivere come una persona Magra Naturalmente in progress ogni giorno.'
  );
  assert.equal(updated, 'Voglio vivere come una persona magra ogni giorno.');
});

test('sanitizeCustomMusicTracks filters invalid URLs, clamps length, and caps at 12', () => {
  const input = [
    { id: 't1', title: 'Pioggia YouTube', url: 'https://youtu.be/abc123XYZ_0' },
    { id: 't2', title: 'Bad JS', url: 'javascript:alert(1)' },
    { id: 't3', title: '', url: 'https://example.com/calm.mp3' },
  ];
  const sanitized = sanitizeCustomMusicTracks(input);
  assert.equal(sanitized.length, 2);
  assert.equal(sanitized[0].title, 'Pioggia YouTube');
  assert.equal(sanitized[1].title, 'Brano personale 3');
});
