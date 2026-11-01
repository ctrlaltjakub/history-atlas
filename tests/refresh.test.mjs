import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {makeCollection,filterCollection} from '../public/core.mjs';

test('refreshing a feed adds an unreviewed episode and advances the catalogue date without inventing placements or links',()=>{
  const root=new URL('../',import.meta.url);
  const stage=mkdtempSync(join(tmpdir(),'history-atlas-refresh-'));
  try{
    for(const folder of ['data','scripts','public'])cpSync(new URL(folder,root),join(stage,folder),{recursive:true});
    const read=name=>JSON.parse(readFileSync(join(stage,name),'utf8'));
    const original=read('public/data/catalogue.json');
    const source=read('data/catalogue-source.json');
    source.fetchedAt='2026-11-01T12:34:56+00:00';
    writeFileSync(join(stage,'data/catalogue-source.json'),JSON.stringify(source));
    const feed=readFileSync(join(stage,'data/feed.xml'),'utf8');
    const id='history-atlas-test-new-arrival';
    const item=`<item><title>A newly released history episode</title><guid>${id}</guid><pubDate>Sun, 01 Nov 2026 10:00:00 GMT</pubDate><description>A new public episode with an editorial placement still to review.</description><enclosure url="https://example.com/new-episode.mp3" type="audio/mpeg" length="1234"/></item>`;
    assert.ok(feed.includes('</channel>'));
    writeFileSync(join(stage,'data/feed.xml'),feed.replace('</channel>',item+'</channel>'));
    for(const args of [['scripts/refresh-feed.py','--from-file'],['scripts/links-build.py'],['scripts/build-catalogue.py']]){
      const result=spawnSync('python3',args,{cwd:stage,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr||result.stdout||String(result.error));
    }
    const catalogue=read('public/data/catalogue.json');
    assert.equal(catalogue.episodes.length,original.episodes.length+1);
    assert.equal(catalogue.updatedAt,source.fetchedAt);
    const episode=catalogue.episodes.find(e=>e.id===id);
    assert.ok(episode);
    assert.equal(episode.category,'New arrivals');
    assert.equal(episode.start,null);assert.equal(episode.end,null);
    assert.equal(episode.location.coordinates,null);
    assert.equal(episode.location.label,'Worldwide');
    assert.equal(episode.links.pocketCasts,null);
    assert.equal(episode.links.spotifyKind,'search');
    assert.equal(episode.links.applePodcastsKind,'search');
    assert.equal(catalogue.timelinePlacements[id].year,null);
    const collection=makeCollection(catalogue.episodes,catalogue.timelinePlacements);
    assert.ok(filterCollection(collection,{q:episode.title},'undated').some(e=>e.id===id));
    assert.ok(!filterCollection(collection,{},'timeline').some(e=>e.id===id));
    for(const [key,choice] of Object.entries(original.timelinePlacements))assert.deepEqual(catalogue.timelinePlacements[key],choice,key);
    for(const previous of original.episodes){
      const current=catalogue.episodes.find(e=>e.id===previous.id);
      for(const field of ['start','end','seriesId','seriesOrder','timelineExcluded','location'])assert.deepEqual(current[field],previous[field],previous.title+' / '+field);
    }
  }finally{
    rmSync(stage,{recursive:true,force:true});
  }
});
