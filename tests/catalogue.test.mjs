import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REGIONS, CATEGORIES, ERAS, matchesEpisode, makeTimeline, visibleTimeline, chronological, formatYear, makeCollection, filterCollection, seriesColor} from '../public/core.mjs';

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

test('released series group every member once and leave true singles alone', () => {
  const items=makeCollection(episodes);
  assert.equal(items.filter(x=>x.type==='series').length,catalogue.series.length);
  assert.equal(new Set(items.filter(x=>x.type==='series').map(x=>x.color)).size,catalogue.series.length,'Each series has a distinct stable colour');
  assert.deepEqual(items.flatMap(x=>x.members.map(e=>e.id)).sort(),episodes.map(e=>e.id).sort());
  assert.ok(items.length<episodes.length/2,'Series substantially reduce the number of tiles');
  for(const group of catalogue.series){
    assert.ok(group.episodeIds.length>=2);
    const item=items.find(x=>x.seriesId===group.id);
    assert.deepEqual(item.members.map(e=>e.id),group.episodeIds,group.title+' keeps release order');
    assert.equal(item.title,group.title);
    assert.equal(new Set(item.members.map(e=>e.seriesId)).size,1);
    assert.equal(item.color,seriesColor(item.id));
  }
  const northern=items.find(x=>x.title==='The Great Northern War');
  assert.equal(northern.members.length,4);
  const found=filterCollection(items,{q:northern.members[2].title});
  assert.equal(found.length,1);assert.equal(found[0].id,northern.id);
  assert.equal(found[0].matches.length,1);assert.equal(found[0].members.length,4);
});

test('timeline uses the minimum rows, stacks every date from the top, and preserves chronology', () => {
  const items=filterCollection(makeCollection(episodes),{},'timeline');
  const dates=[...new Set(items.map(e=>e.start))].sort((a,b)=>a-b);
  const maximum=Math.max(...dates.map(year=>items.filter(e=>e.start===year).length));
  for(const step of [140,176,200]){
    const layout=makeTimeline(items,step);
    assert.equal(layout.positions.length,items.length);
    assert.equal(new Set(layout.positions.map(p=>p.item.id)).size,items.length);
    assert.deepEqual(layout.ticks.map(t=>t.year),dates);
    assert.equal(layout.rowCount,maximum,'No rows reserved for gaps between series parts');
    for(const tick of layout.ticks){
      const column=layout.positions.filter(p=>p.item.start===tick.year);
      assert.deepEqual(column.map(p=>p.row),Array.from({length:column.length},(_,i)=>i),'No empty rows above a tile');
      assert.ok(column.every(p=>p.x===tick.x));
    }
    for(let row=0;row<layout.rowCount;row++){
      const cards=layout.positions.filter(p=>p.row===row).sort((a,b)=>a.x-b.x);
      for(let i=1;i<cards.length;i++){assert.ok(cards[i].x-cards[i-1].x>=step);assert.ok(cards[i].item.start>=cards[i-1].item.start);}
    }
    for(let left=0;left<layout.width;left+=137){
      const visible=visibleTimeline(layout,left,350);
      assert.equal(visible.rowCount,maximum,'Height is fixed at the busiest column');
      assert.ok(visible.positions.every(p=>p.displayRow===p.row));
    }
  }
});

test('a series can be dated, undated and mappable independently without losing its parts', () => {
  const base={seriesId:'mixed',series:'Mixed series',image:'/image.jpg',title:'part',region:'Europe',published:'2026-01-01',description:'',category:null};
  const sample=[{...base,id:'dated',start:1900,end:1901,location:{coordinates:null,label:'Worldwide'},seriesOrder:1},{...base,id:'mapped',start:null,end:null,category:'Ideas & everyday life',location:{coordinates:[10,20],label:'A place'},seriesOrder:2}];
  const collection=makeCollection(sample),item=collection[0];
  assert.equal(collection.length,1);assert.equal(item.start,1900);assert.deepEqual(item.location.coordinates,[10,20]);
  const dated=filterCollection(collection,{},'timeline'),undated=filterCollection(collection,{},'undated');
  assert.equal(dated[0].id,undated[0].id);
  assert.deepEqual(dated[0].matches.map(e=>e.id),['dated']);assert.deepEqual(undated[0].matches.map(e=>e.id),['mapped']);
  assert.equal(undated[0].members.length,2);assert.deepEqual(undated[0].location.coordinates,[10,20]);
  const layout=makeTimeline([...dated,{id:'single',title:'Single',start:1900,end:1900},{id:'later',title:'Later',start:1902,end:1902}]);
  assert.equal(layout.rowCount,2);assert.equal(layout.positions.find(p=>p.item.id==='later').row,0);
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
