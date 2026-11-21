import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const modulePath=fileURLToPath(new URL('../scripts/weekly-review-gate.py',import.meta.url));
function gate(at,marker={},app=true,state={}){
  const source=`import importlib.util,json,sys\nfrom datetime import datetime\ns=importlib.util.spec_from_file_location('gate',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nx=json.loads(sys.argv[2]);now=datetime.fromisoformat(x['at'])\nprint(json.dumps(dict(week=m.review_week(now),decision=m.decision(now,x['marker'],x['app'],x['state']))))`;
  const r=spawnSync('python3',['-c',source,modulePath,JSON.stringify({at,marker,app,state})],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
}

test('weekly review is due on Saturday and catches up on Sunday or later',()=>{
  const marker={lastReviewedWeek:'2026-11-21'};
  assert.deepEqual(gate('2026-11-28T10:00:00+01:00',marker),{week:'2026-11-28',decision:'due'});
  assert.equal(gate('2026-11-29T18:00:00+01:00',marker).decision,'due');
  assert.equal(gate('2026-12-01T10:00:00+01:00',marker).decision,'due');
  assert.equal(gate('2026-11-27T23:59:00+01:00',marker).decision,'already-reviewed');
});

test('a completed review skips all further agent runs in its week',()=>{
  const marker={lastReviewedWeek:'2026-11-28'};
  assert.equal(gate('2026-11-29T18:00:00+01:00',marker).decision,'already-reviewed');
  assert.equal(gate('2026-12-04T18:00:00+01:00',marker).decision,'already-reviewed');
  assert.equal(gate('2026-12-05T10:00:00+01:00',marker).decision,'due');
});

test('a closed desktop app prevents an overdue review from starting',()=>{
  assert.equal(gate('2026-11-29T10:00:00+01:00',{},false).decision,'waiting-for-app');
});

test('failed or interrupted attempts back off, then retry even if they wrote an unpublished marker',()=>{
  const state={weekStarting:'2026-11-28',attemptStartedAt:'2026-11-28T10:00:00+01:00',success:false};
  const marker={lastReviewedWeek:'2026-11-28'};
  assert.equal(gate('2026-11-28T11:00:00+01:00',marker,true,state).decision,'retry-backoff');
  assert.equal(gate('2026-11-28T17:00:00+01:00',marker,true,state).decision,'due');
  assert.equal(gate('2026-11-28T17:00:00+01:00',marker,true,{...state,success:true}).decision,'already-reviewed');
});

test('the weekly boundary uses the local Saturday, including summer time',()=>{
  assert.equal(gate('2026-11-27T23:30:00+00:00').week,'2026-11-28');
  assert.equal(gate('2027-07-02T22:30:00+00:00').week,'2027-07-03');
});
