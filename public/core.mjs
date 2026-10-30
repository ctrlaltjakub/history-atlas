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
export function releaseOrder(a,b) {
  return (a.seriesOrder ?? Infinity)-(b.seriesOrder ?? Infinity) || Date.parse(a.published)-Date.parse(b.published) || (a.number ?? Infinity)-(b.number ?? Infinity);
}
export function seriesColor(key) {
  const hash=[...key].reduce((value,char)=>(Math.imul(value,31)+char.charCodeAt(0))>>>0,0);
  return `hsl(${(hash%360000)/1000} 30% 38%)`;
}
export function summariseItem(item,matches=item.members) {
  const dated=matches.filter(e=>Number.isFinite(e.start)).sort(chronological);
  const start=dated[0]?.start ?? null;
  const end=dated.length?Math.max(...dated.map(e=>e.end)):null;
  const placed=[...matches].sort(releaseOrder).find(e=>e.location?.coordinates);
  const regions=[...new Set(matches.map(e=>e.region))];
  const categories=[...new Set(matches.map(e=>e.category))];
  return {...item,matches,start,end,
    dateLabel:start===null?'No single historical period':start===end?formatYear(start):`${formatYear(start)} – ${formatYear(end)}`,
    region:regions.length===1?regions[0]:'Across the world',
    category:categories.length===1?categories[0]:null,
    location:placed?.location || {coordinates:null,label:'Worldwide',note:'No single geographic setting.'},
    image:item.members[0].image,
    published:item.members.at(-1).published,
    color:item.type==='series'?seriesColor(item.id):'#a99b84'
  };
}
export function makeCollection(episodes) {
  const groups=new Map();
  for(const episode of episodes) {
    const id=episode.seriesId?`series:${episode.seriesId}`:episode.id;
    if(!groups.has(id))groups.set(id,{id,type:episode.seriesId?'series':'episode',seriesId:episode.seriesId||null,title:episode.seriesId?episode.series:episode.title,members:[]});
    groups.get(id).members.push(episode);
  }
  return [...groups.values()].map(item=>{item.members.sort(releaseOrder);return summariseItem(item);});
}
export function filterCollection(items,filters={},placement='all') {
  return items.flatMap(item=>{
    const matches=item.members.filter(e=>matchesEpisode(e,filters) && (placement==='timeline'?Number.isFinite(e.start):placement==='undated'?e.start===null:true));
    return matches.length?[summariseItem(item,matches)]:[];
  });
}
export function makeTimeline(items,step=200) {
  const dated=items.filter(e=>Number.isFinite(e.start)).sort(chronological);
  const dates=new Map();
  for(const item of dated) {
    if(!dates.has(item.start))dates.set(item.start,[]);
    dates.get(item.start).push(item);
  }
  const ticks=[],positions=[];
  let column=0,rowCount=0;
  for(const [year,entries] of dates) {
    const x=column++*step;
    ticks.push({year,x});
    entries.forEach((item,row)=>positions.push({item,episode:item,key:item.id,x,row}));
    rowCount=Math.max(rowCount,entries.length);
  }
  // Each tile occupies one date column. Stack from row zero at every date;
  // only the busiest column determines the fixed height of the whole table.
  return {ticks,positions,width:column*step,step,rowCount};
}
export function visibleTimeline(layout,left,viewportWidth) {
  const positions=layout.positions.filter(p=>p.x+layout.step>left && p.x<left+viewportWidth);
  return {positions:positions.map(p=>({...p,displayRow:p.row})),rowCount:layout.rowCount};
}
export function durationLabel(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Duration unavailable';
  const minutes = Math.round(seconds/60);
  return minutes >= 60 ? `${Math.floor(minutes/60)}h ${minutes%60}m` : `${minutes} min`;
}
