import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REGIONS, CATEGORIES, ERAS, matchesEpisode, makeTimeline, visibleTimeline, chronological, formatYear} from '../public/core.mjs';

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

test('timeline preserves chronology and separates concurrent series without card collisions', () => {
  for (const step of [140, 176, 200]) {
    const layout = makeTimeline(episodes, step);
    assert.equal(layout.positions.length, episodes.filter(e => e.start !== null).length);
    assert.equal(new Set(layout.positions.map(p => p.episode.id)).size, layout.positions.length);
    assert.deepEqual(layout.ticks.map(t => t.year), [...new Set(episodes.filter(e => e.start !== null).map(e => e.start))].sort((a,b) => a-b));
    for (let row=0; row<layout.rowCount; row++) {
      const cards = layout.positions.filter(p => p.row === row).sort((a,b)=>a.x-b.x);
      for (let i=1; i<cards.length; i++) {
        assert.ok(cards[i].x-cards[i-1].x >= step, `Row ${row}: overlapping cards`);
        assert.ok(cards[i].episode.start >= cards[i-1].episode.start);
      }
    }
    for (const group of layout.groups) {
      assert.equal(new Set(group.positions.map(p=>p.row)).size, 1, 'A series stays in one row');
      const earlier=layout.groups.filter(g=>g.row<group.row);
      for (let row=0;row<group.row;row++) {
        assert.ok(earlier.some(g=>g.row===row&&g.start<=group.start&&g.end>group.start), 'Use the first available row');
      }
    }
    for (const tick of layout.ticks) {
      const starts = layout.positions.filter(p => p.episode.start === tick.year);
      for(const key of new Set(starts.map(p=>p.key))) {
        assert.equal(starts.find(p=>p.key===key).x, tick.x, 'Parallel series start at the same date');
      }
    }
  }
});

test('horizontal scrolling preserves every row and the maximum table height', () => {
  const layout=makeTimeline(episodes,176);
  for(let left=0;left<layout.width;left+=137) {
    const view=visibleTimeline(layout,left,350);
    assert.equal(view.rowCount,layout.rowCount,'The number of rows never changes with scroll position');
    assert.ok(view.positions.every(p=>p.displayRow===p.row),'Episodes keep their original rows');
    const expected=layout.positions.filter(p=>p.x+layout.step>left&&p.x<left+350);
    assert.deepEqual(view.positions.map(p=>p.episode.id),expected.map(p=>p.episode.id));
  }
  assert.equal(visibleTimeline(layout,0,350).rowCount,layout.rowCount,'The earliest dates reserve the full table height');
});

test('parallel series keep separate rows and later episodes reuse the top row', () => {
  const item=(id,start,series='',region='Europe')=>({id,title:id,start,end:start,series,region});
  const layout=makeTimeline([
    item('a1',1900,'A'),item('b1',1900,'B','Asia'),
    item('a2',1901,'A'),item('b2',1902,'B','Africa'),item('c',1903)
  ],176);
  const lookup=Object.fromEntries(layout.positions.map(p=>[p.episode.id,p]));
  assert.equal(lookup.a1.row,lookup.a2.row);
  assert.equal(lookup.b1.row,lookup.b2.row);
  assert.notEqual(lookup.a1.row,lookup.b1.row);
  assert.equal(lookup.c.row,0);
  const later=visibleTimeline(layout,lookup.b2.x,176);
  assert.equal(later.positions[0].displayRow,lookup.b2.row,'A remaining series keeps its row when earlier episodes move off screen');
  const changedRegions=makeTimeline(layout.positions.map(p=>({...p.episode,region:'Oceania'})),176);
  assert.deepEqual(changedRegions.positions.map(p=>[p.episode.id,p.x,p.row]),layout.positions.map(p=>[p.episode.id,p.x,p.row]));
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
