import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REGIONS, CATEGORIES, ERAS, matchesEpisode, makeTimeline, visibleTimeline, chronological, formatYear, makeCollection, filterCollection, SERIES_COLOR, timelinePeriod, centuryForYear, formatCentury, TIMELINE_MAX_ROWS} from '../public/core.mjs';

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
  assert.deepEqual([...new Set(items.filter(x=>x.type==='series').map(x=>x.color))],[SERIES_COLOR],'All series use the shared burgundy accent');
  assert.deepEqual(items.flatMap(x=>x.members.map(e=>e.id)).sort(),episodes.map(e=>e.id).sort());
  assert.ok(items.length<episodes.length/2,'Series substantially reduce the number of tiles');
  for(const group of catalogue.series){
    assert.ok(group.episodeIds.length>=2);
    const item=items.find(x=>x.seriesId===group.id);
    assert.deepEqual(item.members.map(e=>e.id),group.episodeIds,group.title+' keeps release order');
    assert.equal(item.title,group.title);
    assert.equal(new Set(item.members.map(e=>e.seriesId)).size,1);
    assert.equal(item.color,SERIES_COLOR);
  }
  const northern=items.find(x=>x.title==='The Great Northern War');
  assert.equal(northern.members.length,4);
  const found=filterCollection(items,{q:northern.members[2].title});
  assert.equal(found.length,1);assert.equal(found[0].id,northern.id);
  assert.equal(found[0].matches.length,1);assert.equal(found[0].members.length,4);
});

test('century and decade columns stack entries from the top with a fixed compact height', () => {
  const items=filterCollection(makeCollection(episodes),{},'timeline');
  const periods=[...new Set([...items].sort(chronological).map(e=>timelinePeriod(e.start).id))];
  const maximum=Math.min(TIMELINE_MAX_ROWS,Math.max(...periods.map(id=>items.filter(e=>timelinePeriod(e.start).id===id).length)));
  for(const step of [140,176,200]){
    const layout=makeTimeline(items,step);
    assert.equal(layout.positions.length,items.length);
    assert.equal(new Set(layout.positions.map(p=>p.item.id)).size,items.length);
    assert.deepEqual(layout.ticks.map(t=>t.id),periods);
    assert.equal(layout.rowCount,maximum);
    for(const tick of layout.ticks){
      const entries=layout.positions.filter(p=>p.periodId===tick.id);
      assert.ok(entries.every(p=>timelinePeriod(p.item.start).id===tick.id));
      assert.equal(tick.stacks,Math.ceil(entries.length/maximum));
      assert.equal(tick.width,tick.stacks*step);
      for(let stack=0;stack<tick.stacks;stack++){
        const column=entries.filter(p=>p.x===tick.x+stack*step);
        assert.deepEqual(column.map(p=>p.row),Array.from({length:column.length},(_,i)=>i),'No empty rows above a tile');
      }
      assert.deepEqual(entries.map(p=>p.item.id),items.filter(item=>timelinePeriod(item.start).id===tick.id).sort(chronological).map(item=>item.id),'Chronology continues down, then across a period');
    }
    for(let row=0;row<layout.rowCount;row++){
      const cards=layout.positions.filter(p=>p.row===row).sort((a,b)=>a.x-b.x);
      for(let i=1;i<cards.length;i++){assert.ok(cards[i].x-cards[i-1].x>=step);assert.ok(cards[i].item.start>=cards[i-1].item.start);}
    }
    for(let left=0;left<layout.width;left+=137){
      const visible=visibleTimeline(layout,left,350);
      assert.equal(visible.rowCount,maximum,'Height stays fixed when scrolling');
      assert.ok(visible.positions.every(p=>p.displayRow===p.row));
    }
    assert.ok(layout.width<207*step/2,'Century grouping substantially reduces horizontal scrolling');
  }
});

test('century boundaries use BCE and CE correctly with no year or century zero',()=>{
  for(const [year,century] of [[-200,-2],[-101,-2],[-100,-1],[-1,-1],[1,1],[100,1],[101,2],[1900,19],[1901,20],[2000,20],[2001,21]])assert.equal(centuryForYear(year),century);
  assert.equal(centuryForYear(0),null);assert.equal(centuryForYear(null),null);
  assert.equal(formatCentury(-1),'1st century BCE');assert.equal(formatCentury(1),'1st century CE');
  assert.equal(formatCentury(11),'11th century');assert.equal(formatCentury(12),'12th century');assert.equal(formatCentury(13),'13th century');assert.equal(formatCentury(21),'21st century');
  const item=(id,start)=>({id,title:id,start,end:start});
  const crossing=makeTimeline([item('bce',-1),item('ce',1),item('later',301)]);
  assert.deepEqual(crossing.ticks.map(t=>t.gapLabel),[null,null,'2 empty centuries omitted']);
  assert.deepEqual(makeTimeline([]),{ticks:[],positions:[],width:0,step:176,rowCount:0});
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
  const layout=makeTimeline([...dated,{id:'single',title:'Single',start:1900,end:1900},{id:'later',title:'Later',start:1910,end:1910}]);
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


test('the eighteenth century switches to calendar decades from 1700 onward',()=>{
  for(const [year,id,label] of [[1699,'century:17','17th century'],[1700,'decade:1700','1700s'],[1701,'decade:1700','1700s'],[1709,'decade:1700','1700s'],[1710,'decade:1710','1710s'],[1800,'decade:1800','1800s'],[1900,'decade:1900','1900s'],[2000,'decade:2000','2000s'],[2026,'decade:2020','2020s']]){
    const period=timelinePeriod(year);assert.equal(period.id,id);assert.equal(period.label,label);assert.ok(year>=period.start&&year<=period.end);
  }
  assert.equal(timelinePeriod(1699).end,1699);assert.equal(timelinePeriod(0),null);
  const item=(id,start)=>({id,title:id,start,end:start});
  const layout=makeTimeline([item('earlier',1699),item('a',1700),item('b',1709),item('c',1720)]);
  assert.deepEqual(layout.ticks.map(t=>t.label),['17th century','1700s','1720s']);
  assert.deepEqual(layout.ticks.map(t=>t.gapLabel),[null,null,'1 empty decade omitted']);
  const all=makeTimeline(filterCollection(makeCollection(episodes),{},'timeline'));
  assert.ok(all.ticks.some(t=>t.id==='century:16'));assert.ok(all.ticks.some(t=>t.id==='century:17'));
  assert.ok(all.ticks.filter(t=>t.start>=1700).every(t=>t.kind==='decade'&&t.end-t.start===9));
});
