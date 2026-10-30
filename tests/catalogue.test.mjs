import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REGIONS, CATEGORIES, ERAS, matchesEpisode, makeTimeline, visibleTimeline, chronological, formatYear, makeCollection, filterCollection, SERIES_COLOR, timelinePeriod, centuryForYear, formatCentury, hasTimelineDate, placementOrder, timelineDateX} from '../public/core.mjs';

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
      if(e.timelineExcluded)assert.ok(CATEGORIES.includes(e.category));else assert.equal(e.category, null);
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
  const items=makeCollection(episodes,catalogue.timelinePlacements);
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

test('tiles fill equal grid cells in reviewed key-year columns with top-filled fixed rows', () => {
  const items=filterCollection(makeCollection(episodes,catalogue.timelinePlacements),{},'timeline');
  for(const step of [144,176,200]){
    const layout=makeTimeline(items,step);
    assert.equal(layout.positions.length,items.length);
    assert.equal(new Set(layout.positions.map(p=>p.item.id)).size,items.length);
    let edge=0;
    for(const tick of layout.ticks){
      const empty=!layout.positions.some(p=>p.periodId===tick.id);
      assert.equal(tick.empty,empty);
      assert.equal(tick.width,empty?step/3:step,'Only empty columns shrink to one-third width');
      assert.equal(tick.x,edge,'Columns join without gaps');edge+=tick.width;
    }
    assert.equal(layout.width,edge);
    for(const p of layout.positions){
      const start=layout.ticks.find(t=>t.id===timelinePeriod(p.item.start).id);
      const end=layout.ticks.find(t=>t.id===timelinePeriod(p.item.end).id);
      const middle=layout.ticks.find(t=>t.id===timelinePeriod(p.item.keyYear).id);
      assert.ok(Math.abs(p.x+p.width/2-middle.x-middle.width/2)<0.001,p.item.title+' is centred on the grid');
      assert.ok(p.startX>=start.x&&p.startX<start.x+start.width,p.item.title);
      assert.ok(p.endX>end.x&&p.endX<=end.x+end.width+0.001,p.item.title);
      assert.equal(p.x,middle.x+2,'Every tile starts at the same inset within its column');
      assert.equal(p.width,step-4,'Every tile fills exactly one column with equal gutters');
      assert.equal(p.startX,timelineDateX(layout,p.item.start));
      assert.equal(p.endX,timelineDateX(layout,p.item.end,true));
    }
    for(let row=0;row<layout.rowCount;row++){
      const cards=layout.positions.filter(p=>p.row===row).sort((a,b)=>a.x-b.x);
      for(let i=1;i<cards.length;i++)assert.ok(cards[i].x>=cards[i-1].x+cards[i-1].width+4-0.001,'Grid cells never overlap');
    }
    let maximum=0;
    for(const tick of layout.ticks){
      const column=layout.positions.filter(p=>p.periodId===tick.id);
      assert.deepEqual(column.map(p=>p.row),column.map((_,i)=>i),'Each column fills from the top without gaps');
      maximum=Math.max(maximum,column.length);
    }
    assert.equal(layout.rowCount,maximum,'Exactly the rows required by the busiest column');
    for(let left=0;left<layout.width;left+=137){
      const visible=visibleTimeline(layout,left,350);
      assert.equal(visible.rowCount,maximum,'Scrolling never changes the fixed row count');
      assert.ok(visible.positions.every(p=>p.displayRow===p.row));
    }
  }
});

test('long narratives use their reviewed key year and retain precise coverage endpoints',()=>{
  const sample=[{id:'war',title:'Long war',start:1700,end:1721,keyYear:1700},{id:'point',title:'Short event',start:1710,end:1710,keyYear:1710}];
  const layout=makeTimeline(sample,176),war=layout.positions.find(p=>p.item.id==='war');
  assert.deepEqual(layout.ticks.map(t=>t.width),[176,176,176/3],'Empty endpoint columns shrink even when a range crosses them');
  assert.equal(war.startX,0);assert.equal(war.endX,176*2+(176/3)*2/10);
  assert.equal(war.center,88);assert.equal(war.width,172);assert.equal(layout.rowCount,1);
  assert.ok(!visibleTimeline(layout,layout.ticks[1].x,176).positions.some(p=>p.item.id==='war'),'Only the tile footprint controls visibility');
  const longTitle={id:'wide',title:'A title long enough to require more than one whole column in this test',start:1605,end:1605,keyYear:1605};
  const single=makeTimeline([longTitle]),position=single.positions[0];
  assert.equal(position.x,2);assert.equal(position.center,single.step/2);
  assert.equal(position.width,war.width,'Long and short titles occupy the same cell size');
  assert.equal(position.x+position.width,single.width-2);
});

test('key years and hover coordinates cross BCE/CE without a year zero',()=>{
  const layout=makeTimeline([{id:'crossing',title:'Crossing',start:-1,end:1,keyYear:-1}]);
  assert.equal(timelineDateX(layout,-1,true),timelineDateX(layout,1));
  assert.equal(layout.positions[0].keyYear,-1);
  assert.ok(!layout.ticks.some(t=>t.century===0));
  assert.equal(makeTimeline([{id:'unreviewed',start:1700,end:1800}]).positions.length,0,'Never infer a midpoint for an unreviewed item');
});

test('broad collections stay off the timeline without losing their dates, members or map locations',()=>{
  const review=JSON.parse(readFileSync(new URL('../data/timeline-review.json',import.meta.url)));
  const collection=makeCollection(episodes,catalogue.timelinePlacements),dated=filterCollection(collection,{},'timeline'),off=filterCollection(collection,{},'undated');
  for(const id of Object.keys(review.series)){
    const item=collection.find(x=>x.seriesId===id);
    assert.ok(item.members.every(e=>e.timelineExcluded),item.title);
    assert.equal(item.start,null,item.title);
    assert.ok(!dated.some(x=>x.id===item.id));assert.ok(off.some(x=>x.id===item.id));
    assert.equal(off.find(x=>x.id===item.id).members.length,item.members.length);
    assert.ok(item.timelineNote.length>20);
  }
  const countries=collection.find(x=>x.seriesId==='the-world-cup-32-countries');
  assert.equal(countries.members.length,32);
  assert.ok(countries.members.some(e=>e.start===1942&&e.end===1943),'Specific parts retain useful historical dates');
  assert.ok(countries.location.coordinates,'Map availability remains independent');
  assert.ok(!hasTimelineDate(episodes.find(e=>e.title==='China')));
  assert.ok(hasTimelineDate(episodes.find(e=>e.title==='The First Emperor of China')),'A bounded China narrative remains dated');
  const northern=collection.find(x=>x.title==='The Great Northern War');
  const found=filterCollection(collection,{q:northern.members[2].title},'timeline').find(x=>x.id===northern.id);
  assert.equal(found.start,northern.start);assert.equal(found.end,northern.end,'Matching one part never changes a series key year or hover range');
});

test('century boundaries use BCE and CE correctly with no year or century zero',()=>{
  for(const [year,century] of [[-200,-2],[-101,-2],[-100,-1],[-1,-1],[1,1],[100,1],[101,2],[1900,19],[1901,20],[2000,20],[2001,21]])assert.equal(centuryForYear(year),century);
  assert.equal(centuryForYear(0),null);assert.equal(centuryForYear(null),null);
  assert.equal(formatCentury(-1),'1st century BCE');assert.equal(formatCentury(1),'1st century CE');
  assert.equal(formatCentury(11),'11th century');assert.equal(formatCentury(12),'12th century');assert.equal(formatCentury(13),'13th century');assert.equal(formatCentury(21),'21st century');
  const item=(id,start)=>({id,title:id,start,end:start,keyYear:start});
  const crossing=makeTimeline([item('bce',-1),item('ce',1),item('later',301)]);
  assert.deepEqual(crossing.ticks.map(t=>t.gapLabel),[null,null,'2 intermediate centuries compressed']);
  assert.deepEqual(makeTimeline([]),{ticks:[],positions:[],width:0,step:176,rowCount:0});
});

test('a series can be dated, undated and mappable independently without losing its parts', () => {
  const base={seriesId:'mixed',series:'Mixed series',image:'/image.jpg',title:'part',region:'Europe',published:'2026-01-01',description:'',category:null};
  const sample=[{...base,id:'dated',start:1900,end:1901,location:{coordinates:null,label:'Worldwide'},seriesOrder:1},{...base,id:'mapped',start:null,end:null,category:'Ideas & everyday life',location:{coordinates:[10,20],label:'A place'},seriesOrder:2}];
  const collection=makeCollection(sample,{'series:mixed':{year:1900,reason:'The dated part anchors this mixed series.'}}),item=collection[0];
  assert.equal(collection.length,1);assert.equal(item.start,1900);assert.deepEqual(item.location.coordinates,[10,20]);
  const dated=filterCollection(collection,{},'timeline'),undated=filterCollection(collection,{},'undated');
  assert.equal(dated[0].id,undated[0].id);
  assert.deepEqual(dated[0].matches.map(e=>e.id),['dated']);assert.deepEqual(undated[0].matches.map(e=>e.id),['mapped']);
  assert.equal(undated[0].members.length,2);assert.deepEqual(undated[0].location.coordinates,[10,20]);
  const layout=makeTimeline([...dated,{id:'single',title:'Single',start:1900,end:1900,keyYear:1900},{id:'later',title:'Later',start:1910,end:1910,keyYear:1910}]);
  assert.equal(layout.rowCount,2);assert.equal(layout.positions.find(p=>p.item.id==='later').row,0);
});

test('era filters include every overlapping range and leave off-timeline collections available', () => {
  const periods=ERAS.filter(e=>e.id!=='all');
  for(const e of episodes){
    for(const period of periods){
      const expected=!hasTimelineDate(e)||(e.start<period.end&&e.end>=period.start);
      assert.equal(matchesEpisode(e,{era:period.id}),expected,e.title+' / '+period.id);
    }
  }
  const broad={start:1680,end:1800,title:'The Enlightenment',region:'Europe'};
  assert.equal(matchesEpisode(broad,{era:'medieval'}),false);
  assert.equal(matchesEpisode(broad,{era:'early-modern'}),true);
  assert.equal(matchesEpisode(broad,{era:'nineteenth'}),true);
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
  const item=(id,start)=>({id,title:id,start,end:start,keyYear:start});
  const layout=makeTimeline([item('earlier',1699),item('a',1700),item('b',1709),item('c',1720)]);
  assert.deepEqual(layout.ticks.map(t=>t.label),['17th century','1700s','1720s']);
  assert.deepEqual(layout.ticks.map(t=>t.gapLabel),[null,null,'1 intermediate decade compressed']);
  const all=makeTimeline(filterCollection(makeCollection(episodes,catalogue.timelinePlacements),{},'timeline'));
  assert.ok(all.ticks.some(t=>t.id==='century:16'));assert.ok(all.ticks.some(t=>t.id==='century:17'));
  assert.ok(all.ticks.filter(t=>t.start>=1700).every(t=>t.kind==='decade'&&t.end-t.start===9));
});

test('every series and standalone item has an explicit reviewed placement decision',()=>{
  const source=JSON.parse(readFileSync(new URL('../data/timeline-key-years.json',import.meta.url)));
  const items=makeCollection(episodes,catalogue.timelinePlacements);
  assert.equal(items.length,348);
  assert.deepEqual(Object.keys(source.items).sort(),items.map(i=>i.id).sort());
  assert.deepEqual(catalogue.timelinePlacements,source.items);
  for(const item of items){
    const choice=source.items[item.id];
    assert.equal(choice.title,item.title);assert.ok(choice.reason.length>25);
    assert.ok(choice.sources.length&&choice.sources.every(url=>new URL(url).protocol==='https:'));
    assert.equal(item.placementReason,choice.reason);
    if(hasTimelineDate(item)){
      assert.ok(Number.isInteger(item.keyYear)&&item.keyYear!==0,item.title);
      assert.ok(item.keyYear>=item.start&&item.keyYear<=item.end,item.title);
    }else assert.equal(item.keyYear,null,item.title);
  }
});

test('background, biography and aftermath do not displace the central historical subject',()=>{
  const items=makeCollection(episodes,catalogue.timelinePlacements),byId=new Map(items.map(i=>[i.id,i]));
  for(const [id,year] of [['the-american-civil-war',1861],['custer-vs-crazy-horse',1876],['the-falklands-war',1982],['young-churchill',1888],['the-french-revolution-the-storming-of-the-bastille',1789]]){
    const item=byId.get('series:'+id);assert.equal(item.keyYear,year);
    const filtered=filterCollection(items,{q:item.members[0].title},'timeline').find(i=>i.id===item.id);
    assert.equal(filtered.keyYear,year,'Matching one part preserves the reviewed series year');
    assert.equal(makeTimeline([item]).positions[0].periodId,timelinePeriod(year).id);
  }
  assert.equal(items.find(i=>i.title==='Watergate').keyYear,1972);
  assert.equal(byId.get('series:jfk').keyYear,1961);
  assert.equal(items.find(i=>i.title==='The Suez Crisis').keyYear,1956);
  const ordered=[byId.get('series:custer-vs-crazy-horse'),byId.get('series:the-american-civil-war')].sort(placementOrder);
  assert.equal(ordered[0].seriesId,'the-american-civil-war');
  assert.equal(byId.get('series:london').keyYear,null);
  assert.equal(byId.get('series:ireland-from-the-celts-to-the-easter-rising').keyYear,null);
});
