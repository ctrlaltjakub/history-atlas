import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {makeCollection,filterCollection} from '../public/core.mjs';
import {clusterPoints,groupZoom} from '../public/map-core.mjs';

const catalogue=JSON.parse(readFileSync(new URL('../public/data/catalogue.json',import.meta.url)));
const reviewed=Object.assign({},...['a','b','c'].map(part=>JSON.parse(readFileSync(new URL('../data/map-locations-'+part+'.json',import.meta.url)))));
const {episodes}=catalogue;
const libraries={};
for(const file of ['d3.v7.9.0.min.js','topojson-client.v3.1.0.min.js'])runInNewContext(readFileSync(new URL('../public/vendor/'+file,import.meta.url),'utf8'),libraries);

test('every public episode has a reviewed map location or an explicit worldwide group',()=>{
  assert.deepEqual(Object.keys(reviewed).sort(),episodes.map(e=>e.id).sort());
  for(const episode of episodes){
    const location=episode.location;
    assert.deepEqual(location,reviewed[episode.id],episode.title);
    assert.ok(location.label&&location.note,episode.title);
    if(location.coordinates===null){
      assert.equal(location.label,'Worldwide');
    } else {
      const [lon,lat]=location.coordinates;
      assert.equal(location.coordinates.length,2);
      assert.ok(Number.isFinite(lon)&&Math.abs(lon)<=180,episode.title);
      assert.ok(Number.isFinite(lat)&&Math.abs(lat)<=90,episode.title);
    }
  }
});

test('Equal Earth renders the bundled world and every mapped episode at phone and desktop sizes',()=>{
  const topology=JSON.parse(readFileSync(new URL('../public/data/world-countries.json',import.meta.url)));
  const land=libraries.topojson.feature(topology,topology.objects.land);
  for(const width of [296,366,1200]){
    const projection=libraries.d3.geoEqualEarth().fitExtent([[18,20],[width-18,300]],{type:'Sphere'});
    const path=libraries.d3.geoPath(projection)(land);
    assert.ok(path.length>1000&&!/NaN|Infinity/.test(path));
    const points=episodes.filter(e=>e.location.coordinates).map(e=>{
      const [x,y]=projection(e.location.coordinates);
      assert.ok(Number.isFinite(x)&&Number.isFinite(y));
      return {id:e.id,x,y,episode:e};
    });
    let lastCount=0;
    for(const scale of [1,2,4,8,16,32,64,128,256]){
      const clusters=clusterPoints(points,scale);
      assert.deepEqual(clusters.flatMap(c=>c.items.map(p=>p.id)).sort(),points.map(p=>p.id).sort(),'No episode disappears or appears twice');
      assert.ok(clusters.length>=lastCount,'Zooming in separates groups');
      lastCount=clusters.length;
      for(const cluster of clusters){
        assert.ok(Number.isFinite(cluster.x)&&Number.isFinite(cluster.y));
        const target=groupZoom(cluster,width,320,scale);
        assert.ok(target.scale<=256&&target.scale>=scale);
      }
    }
  }
});

test('zoom separates nearby sites while coincident episodes remain available as one selectable list',()=>{
  const points=[{id:'a',x:10,y:10},{id:'b',x:10,y:10},{id:'c',x:20,y:10}];
  assert.equal(clusterPoints(points,1).length,1);
  const zoomed=clusterPoints(points,8);
  assert.equal(zoomed.length,2);
  const shared=zoomed.find(c=>c.items.length===2);
  assert.deepEqual(shared.items.map(p=>p.id),['a','b']);
  assert.equal(groupZoom(shared,390,320,8).coincident,true);
  assert.equal(groupZoom(shared,390,320,8).canSeparate,false);
  assert.equal(groupZoom(shared,390,320,256).scale,256);
});

test('clustering is deterministic regardless of catalogue order and does not depend on panning',()=>{
  const points=[{id:'a',x:10,y:10},{id:'b',x:16,y:10},{id:'c',x:200,y:80}];
  assert.deepEqual(clusterPoints(points,3),clusterPoints([...points].reverse(),3));
  assert.equal(clusterPoints([],3).length,0);
});


test('series-first map entries preserve all episodes and group by map availability independently of dates',()=>{
  const items=filterCollection(makeCollection(episodes));
  const mapped=items.filter(item=>item.location.coordinates),worldwide=items.filter(item=>!item.location.coordinates);
  assert.equal(mapped.length+worldwide.length,items.length);
  assert.deepEqual([...mapped,...worldwide].flatMap(item=>item.members.map(e=>e.id)).sort(),episodes.map(e=>e.id).sort());
  for(const item of mapped){
    const first=item.members.find(e=>e.location.coordinates);
    assert.deepEqual(item.location.coordinates,first.location.coordinates);
  }
  const arthur=items.find(item=>item.seriesId==='king-arthur');
  assert.equal(arthur.start,null);assert.ok(arthur.location.coordinates);
  const worldCup=items.find(item=>item.seriesId==='the-world-cup');
  assert.ok(worldCup.start!==null);assert.equal(worldCup.location.coordinates,null);
});
