import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/startup.js',import.meta.url),'utf8');
function start(type,hash=''){
  const calls=[],events={};
  const history={scrollRestoration:'auto',replaceState:(_state,_title,url)=>calls.push(['replace',url])};
  const location={pathname:'/',search:'?region=Europe',hash};
  runInNewContext(source,{history,location,performance:{getEntriesByType:()=>[{type}]},window:{scrollTo:options=>calls.push(['scroll',options.top,options.behavior]),addEventListener:(name,listener)=>events[name]=listener}});
  return {history,calls,events};
}

test('refresh overrides browser scroll restoration and clears remembered section anchors',()=>{
  for(const hash of ['', '#episode-map','#collection','#beyond']){
    const {history,calls}=start('reload',hash);
    assert.equal(history.scrollRestoration,'manual');
    assert.deepEqual(calls.at(-1),['scroll',0,'instant']);
    if(hash)assert.deepEqual(calls[0],['replace','/?region=Europe']);
  }
});

test('the page-show event resets offsets restored after early startup',()=>{
  const {calls,events}=start('reload');
  assert.equal(typeof events.pageshow,'function');
  calls.length=0;
  events.pageshow();
  assert.deepEqual(calls,[['scroll',0,'instant']]);
});

test('fresh section links and back/forward retain their navigation targets',()=>{
  for(const type of ['navigate','back_forward']){
    const {history,calls}=start(type,'#episode-map');
    assert.equal(history.scrollRestoration,'auto');
    assert.deepEqual(calls,[]);
  }
});

test('refresh preserves shareable episode and series links while resetting the background position',()=>{
  for(const hash of ['#episode=123','#series=the-great-northern-war']){
    const {calls}=start('reload',hash);
    assert.deepEqual(calls,[['scroll',0,'instant']]);
  }
});
