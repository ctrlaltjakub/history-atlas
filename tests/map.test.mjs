import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {makeCollection,filterCollection} from '../public/core.mjs';
import {clusterPoints,groupZoom,mapLayerTransform,placeCityLabels} from '../public/map-core.mjs';

const catalogue=JSON.parse(readFileSync(new URL('../public/data/catalogue.json',import.meta.url)));
const reviewed=Object.assign({},...['a','b','c'].map(part=>JSON.parse(readFileSync(new URL('../data/map-locations-'+part+'.json',import.meta.url)))));
const {episodes}=catalogue;
const libraries={};
for(const file of ['d3.v7.9.0.min.js','topojson-client.v3.1.0.min.js'])runInNewContext(readFileSync(new URL('../public/vendor/'+file,import.meta.url),'utf8'),libraries);

test('every public episode keeps its reviewed map location or an explicit worldwide group',()=>{
  const ids=new Set(episodes.map(e=>e.id));
  assert.ok(Object.keys(reviewed).every(id=>ids.has(id)),'All reviewed episodes remain in the catalogue');
  for(const episode of episodes){
    const location=episode.location;
    if(reviewed[episode.id])assert.deepEqual(location,reviewed[episode.id],episode.title);
    else assert.deepEqual(location,{coordinates:null,label:'Worldwide',note:'New in the public feed. Map placement has not yet been reviewed.'},episode.title);
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
  const items=filterCollection(makeCollection(episodes,catalogue.timelinePlacements));
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

test('cached geography remains aligned during pan and zoom and refreshes before its margin runs out',()=>{
  const previous={k:4,x:-200,y:70},margin=300;
  for(const scale of [.85,1,1.25]){
    const current={k:previous.k*scale,x:previous.x*scale+35,y:previous.y*scale-20};
    const camera=mapLayerTransform(current,previous,margin);
    assert.equal(camera.refresh,false);
    for(const [x,y] of [[0,0],[200,100],[-30,70]]){
      const cached=[x*previous.k+previous.x+margin,y*previous.k+previous.y+margin];
      assert.ok(Math.abs(-margin+camera.x+camera.scale*cached[0]-(x*current.k+current.x))<.001);
      assert.ok(Math.abs(-margin+camera.y+camera.scale*cached[1]-(y*current.k+current.y))<.001);
    }
  }
  assert.equal(mapLayerTransform(previous,null,margin).refresh,true);
  assert.equal(mapLayerTransform(previous,previous,margin,true).refresh,true);
  assert.equal(mapLayerTransform({...previous,x:previous.x+200},previous,margin).refresh,true);
  assert.equal(mapLayerTransform({...previous,k:8},previous,margin).refresh,true);
});

test('city labels use a small bundled dataset and stay bounded, visible and separate from markers',()=>{
  const raw=readFileSync(new URL('../public/data/map-cities.json',import.meta.url));
  const cities=JSON.parse(raw);
  assert.ok(raw.length<30000);assert.ok(cities.length>200&&cities.length<300);
  assert.equal(new Set(cities.map(c=>c.id)).size,cities.length);
  assert.ok(cities.some(c=>c.name==='London')&&cities.some(c=>c.name==='Tokyo'));
  for(const city of cities){
    assert.ok(city.coordinates.every(Number.isFinite));
    assert.ok(Math.abs(city.coordinates[0])<=180&&Math.abs(city.coordinates[1])<=90);
  }
  for(const width of [366,1200]){
    const projection=libraries.d3.geoEqualEarth().fitExtent([[18,20],[width-18,300]],{type:'Sphere'});
    const points=cities.map(c=>{const [x,y]=projection(c.coordinates);return {...c,x,y};});
    const [cx,cy]=projection([10,45]);
    const obstacle=[width/2-25,135,width/2+25,185];
    for(const k of [1,4,8,16]){
      const transform={k,x:width/2-cx*k,y:160-cy*k};
      const labels=placeCityLabels(points,transform,width,320,[obstacle]);
      assert.ok(labels.length<=(width<600?12:24));
      if(k<4)assert.equal(labels.length,0);else assert.ok(labels.length>0);
      const boxes=[obstacle];
      for(const label of labels){
        const left=label.x+label.labelX,top=label.y+label.labelY-10;
        const box=[left-2,top-2,left+label.name.length*5.5+6,top+14];
        assert.ok(box[0]>=4&&box[2]<=width-4&&box[1]>=4&&box[3]<=316);
        assert.ok(!boxes.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]));
        boxes.push(box);
      }
    }
  }
});
