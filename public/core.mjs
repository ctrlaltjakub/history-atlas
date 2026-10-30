export const REGIONS = ['Britain & Ireland', 'Europe', 'Africa', 'Middle East', 'Asia', 'Americas', 'Oceania', 'Across the world'];
export const ERAS = [
  {id:'all',name:'All history',start:-Infinity,end:Infinity},
  {id:'prehistory',name:'Prehistory',start:-Infinity,end:-3000},
  {id:'ancient',name:'Ancient world',start:-3000,end:500},
  {id:'medieval',name:'Middle Ages',start:500,end:1500},
  {id:'early-modern',name:'1500–1800',start:1500,end:1800},
  {id:'nineteenth',name:'1800–1900',start:1800,end:1900},
  {id:'twentieth',name:'1900–2000',start:1900,end:2000},
  {id:'contemporary',name:'2000 onwards',start:2000,end:Infinity},
];
export const CATEGORIES = ['Ideas & everyday life','Myths & mysteries','Conversations & reflections','Podcast extras','New arrivals'];
export function formatYear(year) {
  if (year == null) return 'Across the ages';
  const value = Math.abs(year).toLocaleString('en-GB');
  return year < 0 ? `${value} BCE` : year < 1000 ? `${value} CE` : value.replace(/,/g, '');
}
export function normalise(text) {
  return String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’‘]/g,"'");
}
export function matchesEpisode(e, {q='',region='all',era='all'}={}) {
  if (region !== 'all' && e.region !== region) return false;
  const query = normalise(q).trim();
  if (query && !query.split(/\s+/).every(word => normalise(`${e.number || ''} ${e.title} ${e.description || ''} ${e.region} ${e.series || ''} ${e.category || ''}`).includes(word))) return false;
  if (e.start !== null && era !== 'all') {
    const period = ERAS.find(x=>x.id === era) || ERAS[0];
    if (e.start >= period.end || e.start < period.start) return false;
  }
  return true;
}
export function chronological(a,b) {
  return (a.start ?? Infinity) - (b.start ?? Infinity) || (a.end ?? Infinity) - (b.end ?? Infinity) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.title.localeCompare(b.title);
}
export function makeTimeline(episodes, step=200) {
  const dated=episodes.filter(e=>Number.isFinite(e.start)).sort(chronological);
  const dates = new Map();
  const seriesKey = e => e.series ? `series:${normalise(e.series)}` : `episode:${e.id}`;
  for (const episode of dated) {
    if (!dates.has(episode.start)) dates.set(episode.start,[]);
    dates.get(episode.start).push(episode);
  }
  let width=0;
  const ticks=[],positions=[];
  const groups=new Map();
  for (const [year, entries] of dates) {
    const counts=new Map();
    ticks.push({year,x:width});
    for (const e of entries) {
      const key=seriesKey(e);
      const index=counts.get(key) || 0;
      const position={episode:e,x:width+index*step,key,row:0};
      positions.push(position);
      counts.set(key,index+1);
      if(!groups.has(key))groups.set(key,{key,positions:[],start:position.x,end:position.x+step});
      const group=groups.get(key);
      group.positions.push(position);
      group.end=Math.max(group.end,position.x+step);
    }
    width+=Math.max(...counts.values())*step;
  }
  // A series keeps its row while concurrent series use the next free row.
  // Earlier rows are reused as soon as the previous series ends.
  const rowEnds=[];
  for(const group of [...groups.values()].sort((a,b)=>a.start-b.start||a.end-b.end||a.key.localeCompare(b.key))){
    let row=rowEnds.findIndex(end=>end<=group.start);
    if(row===-1)row=rowEnds.length;
    rowEnds[row]=group.end;
    for(const position of group.positions)position.row=row;
    group.row=row;
  }
  return {ticks,positions,width,step,rowCount:rowEnds.length,groups:[...groups.values()]};
}

export function visibleTimeline(layout,left,viewportWidth) {
  const positions=layout.positions.filter(p=>p.x+layout.step>left && p.x<left+viewportWidth);
  // Do not retain empty rows belonging to series outside the current view.
  const rows=[...new Set(positions.map(p=>p.row))].sort((a,b)=>a-b);
  const rowMap=new Map(rows.map((row,index)=>[row,index]));
  return {positions:positions.map(p=>({...p,displayRow:rowMap.get(p.row)})),rowMap,rowCount:rows.length};
}
export function durationLabel(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Duration unavailable';
  const minutes = Math.round(seconds/60);
  return minutes >= 60 ? `${Math.floor(minutes/60)}h ${minutes%60}m` : `${minutes} min`;
}
