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
export function makeTimeline(episodes, step=252) {
  const dated=episodes.filter(e=>Number.isFinite(e.start)).sort(chronological);
  const groups = new Map();
  for (const episode of dated) {
    if (!groups.has(episode.start)) groups.set(episode.start,[]);
    groups.get(episode.start).push(episode);
  }
  let width=0;
  const ticks=[],positions=[];
  for (const [year, entries] of groups) {
    const counts={};
    ticks.push({year,x:width});
    for (const e of entries) {
      const index=counts[e.region] || 0;
      positions.push({episode:e,x:width+index*step});
      counts[e.region]=index+1;
    }
    width+=Math.max(...Object.values(counts))*step;
  }
  return {ticks,positions,width,regions:REGIONS.filter(region=>dated.some(e=>e.region===region))};
}
export function durationLabel(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Duration unavailable';
  const minutes = Math.round(seconds/60);
  return minutes >= 60 ? `${Math.floor(minutes/60)}h ${minutes%60}m` : `${minutes} min`;
}
