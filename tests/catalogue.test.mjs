import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REGIONS, CATEGORIES, ERAS, matchesEpisode, makeTimeline, chronological, formatYear} from '../public/core.mjs';

const catalogue = JSON.parse(readFileSync(new URL('../public/data/catalogue.json', import.meta.url)));
const base = JSON.parse(readFileSync(new URL('../data/base-episodes.json', import.meta.url)));
const {episodes} = catalogue;

test('the published catalogue contains each public feed episode exactly once', () => {
  assert.equal(new Set(episodes.map(e => e.id)).size, episodes.length);
  assert.deepEqual(episodes.map(e => e.id).sort(), base.map(e => e.id).sort());
  assert.ok(Number.isFinite(Date.parse(catalogue.updatedAt)));
  for (const e of episodes) {
    assert.ok(e.title && e.description && e.image && e.audio, e.title);
    assert.match(e.published, /(?:Z|\+00:00)$/);
    assert.ok(REGIONS.includes(e.region), e.title);
    if (e.start === null) {
      assert.equal(e.end, null);
      assert.ok(CATEGORIES.includes(e.category), e.title);
    } else {
      assert.ok(Number.isInteger(e.start) && Number.isInteger(e.end));
      assert.ok(e.start <= e.end && e.start !== 0 && e.end !== 0, e.title);
      assert.equal(e.category, null);
    }
  }
});

test('listening links distinguish verified episodes from searches', () => {
  for (const e of episodes) {
    if (e.links.pocketCasts) assert.match(e.links.pocketCasts, /^https:\/\/pca\.st\/episode\/[a-f0-9-]+$/);
    assert.ok(['episode','search'].includes(e.links.spotifyKind));
    const spotify = new URL(e.links.spotify);
    assert.equal(spotify.hostname, 'open.spotify.com');
    assert.ok(spotify.pathname.startsWith(e.links.spotifyKind === 'episode' ? '/episode/' : '/search/'));
    assert.ok(['episode','search'].includes(e.links.applePodcastsKind));
    assert.equal(new URL(e.links.applePodcasts).hostname, 'podcasts.apple.com');
    assert.match(e.links.youtube, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
  }
});

test('timeline preserves every dated story without collisions in a region', () => {
  for (const step of [182, 247, 252]) {
    const layout = makeTimeline(episodes, step);
    assert.equal(layout.positions.length, episodes.filter(e => e.start !== null).length);
    assert.equal(new Set(layout.positions.map(p => p.episode.id)).size, layout.positions.length);
    assert.deepEqual(layout.ticks.map(t => t.year), [...new Set(episodes.filter(e => e.start !== null).map(e => e.start))].sort((a,b) => a-b));
    for (const region of REGIONS) {
      const row = layout.positions.filter(p => p.episode.region === region);
      for (let i=1; i<row.length; i++) {
        assert.ok(row[i].x-row[i-1].x >= step, `${region}: overlapping cards`);
        assert.ok(row[i].episode.start >= row[i-1].episode.start);
      }
    }
    for (const tick of layout.ticks) {
      for (const region of layout.regions) {
        const first = layout.positions.find(p => p.episode.start === tick.year && p.episode.region === region);
        if (first) assert.equal(first.x, tick.x, 'Equal dates align across regions');
      }
    }
  }
});

test('era selection partitions dated episodes and keeps undated curiosities available', () => {
  const periods = ERAS.filter(e => e.id !== 'all');
  for (const e of episodes) {
    const found = periods.filter(p => matchesEpisode(e, {era:p.id}));
    assert.equal(found.length, e.start === null ? periods.length : 1, e.title);
  }
  const broad = {start:-63000,end:1770,title:'Australia',region:'Oceania'};
  assert.equal(matchesEpisode(broad, {era:'ancient'}), false);
  assert.equal(matchesEpisode(broad, {era:'prehistory'}), true);
});

test('search is case and accent insensitive, combines words, and respects region', () => {
  const e = {number:42,title:'Hernán Cortés',description:'An empire in Mexico',region:'Americas',start:1519};
  assert.equal(matchesEpisode(e, {q:'CORTES Mexico',region:'Americas'}), true);
  assert.equal(matchesEpisode(e, {q:'42 hernan'}), true);
  assert.equal(matchesEpisode(e, {q:'Cortes',region:'Asia'}), false);
  assert.equal(matchesEpisode(e, {q:'unfindableword'}), false);
});

test('BCE precedes CE and undated episodes follow the timeline', () => {
  const sample = [{title:'C',start:null,end:null},{title:'B',start:1,end:1},{title:'A',start:-1,end:-1}];
  assert.deepEqual(sample.sort(chronological).map(e=>e.title), ['A','B','C']);
  assert.equal(formatYear(-3000), '3,000 BCE');
  assert.equal(formatYear(476), '476 CE');
  assert.equal(formatYear(1956), '1956');
});
