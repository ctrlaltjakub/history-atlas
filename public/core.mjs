import {TITLE_ADVANCES} from './title-metrics.mjs';
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
export const CATEGORIES = ['Countries & places','Cross-era collections','Ideas & everyday life','Myths & mysteries','Conversations & reflections','Podcast extras','New arrivals'];
export const hasTimelineDate = episode => Number.isFinite(episode.start) && !episode.timelineExcluded;
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
  if (hasTimelineDate(e) && era !== 'all') {
    const period = ERAS.find(x=>x.id === era) || ERAS[0];
    if (e.start >= period.end || (e.end ?? e.start) < period.start) return false;
  }
  return true;
}
export function chronological(a,b) {
  return (a.start ?? Infinity) - (b.start ?? Infinity) || (a.end ?? Infinity) - (b.end ?? Infinity) || (a.number ?? Infinity) - (b.number ?? Infinity) || a.title.localeCompare(b.title);
}
export function releaseOrder(a,b) {
  return (a.seriesOrder ?? Infinity)-(b.seriesOrder ?? Infinity) || Date.parse(a.published)-Date.parse(b.published) || (a.number ?? Infinity)-(b.number ?? Infinity);
}
export const SERIES_COLOR='#6b2636';
export function summariseItem(item,matches=item.members,placement='all') {
  // Filtering finds matching parts, but a series always keeps its complete range.
  const dated=placement==='undated'?[]:item.members.filter(hasTimelineDate).sort(chronological);
  const start=dated[0]?.start ?? null;
  const end=dated.length?Math.max(...dated.map(e=>e.end)):null;
  const placed=[...matches].sort(releaseOrder).find(e=>e.location?.coordinates);
  const regions=[...new Set(matches.map(e=>e.region))];
  const categories=[...new Set(matches.map(e=>e.category))];
  return {...item,matches,start,end,timelineNote:item.members.find(e=>e.timelineNote)?.timelineNote || '',
    dateLabel:start===null?'No single historical period':start===end?formatYear(start):`${formatYear(start)} – ${formatYear(end)}`,
    region:regions.length===1?regions[0]:'Across the world',
    category:categories.length===1?categories[0]:null,
    location:placed?.location || {coordinates:null,label:'Worldwide',note:'No single geographic setting.'},
    image:item.members[0].image,
    published:item.members.at(-1).published,
    color:item.type==='series'?SERIES_COLOR:'#a99b84'
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
    const matches=item.members.filter(e=>matchesEpisode(e,filters) && (placement==='timeline'?hasTimelineDate(e):placement==='undated'?!hasTimelineDate(e):true));
    return matches.length?[summariseItem(item,matches,placement)]:[];
  });
}
export const TIMELINE_COLUMN_WIDTH=176;
export const TIMELINE_MOBILE_COLUMN_WIDTH=144;
export function centuryForYear(year) {
  return Number.isFinite(year)&&year!==0?Math.sign(year)*Math.ceil(Math.abs(year)/100):null;
}
export function formatCentury(century) {
  if(century==null)return 'Outside the timeline';
  const number=Math.abs(century),lastTwo=number%100;
  const suffix=lastTwo>=11&&lastTwo<=13?'th':({1:'st',2:'nd',3:'rd'}[number%10]||'th');
  return `${number.toLocaleString('en-GB')}${suffix} century${century<0?' BCE':century<=10?' CE':''}`;
}
export function timelinePeriod(year) {
  const century=centuryForYear(year);
  if(century===null)return null;
  if(year>=1700){
    const start=Math.floor(year/10)*10;
    return {id:`decade:${start}`,kind:'decade',start,end:start+9,label:`${start}s`};
  }
  return {id:`century:${century}`,kind:'century',century,
    start:century>0?(century-1)*100+1:century*100,
    end:century>0?Math.min(century*100,1699):(century+1)*100-1,
    label:formatCentury(century)};
}
function periodGapLabel(previous,current) {
  if(!previous||current.start===(previous.end===-1?1:previous.end+1))return null;
  if(previous.kind!==current.kind)return 'Intermediate periods compressed';
  const count=current.kind==='decade'?(current.start-previous.start)/10-1:
    current.century-previous.century-1-(previous.century<0&&current.century>0?1:0);
  const unit=current.kind==='decade'?'decade':'century';
  return `${count.toLocaleString('en-GB')} intermediate ${count===1?unit:unit==='century'?'centuries':'decades'} compressed`;
}
// A compact two-line title, with room for the part count and a few pixels of padding.
export function timelineLabelWidth(item) {
  const measure=text=>[...text].reduce((n,c)=>n+(TITLE_ADVANCES[c] ?? 7),0);
  const words=item.title.split(/\s+/);
  let titleWidth=measure(item.title);
  for(let i=1;i<words.length;i++)titleWidth=Math.min(titleWidth,Math.max(measure(words.slice(0,i).join(' ')),measure(words.slice(i).join(' '))));
  return Math.max(84,Math.min(260,Math.ceil(titleWidth+(item.type==='series'?40:14))));
}
const ordinalYear=year=>year>0?year-1:year;
export function makeTimeline(items,step=TIMELINE_COLUMN_WIDTH) {
  const dated=items.filter(hasTimelineDate).sort(chronological);
  const periods=new Map();
  for(const item of dated) {
    for(const year of [item.start,item.end ?? item.start]) {
      const period=timelinePeriod(year);periods.set(period.id,period);
    }
  }
  const ticks=[],positions=[];
  let previous=null;
  for(const period of [...periods.values()].sort((a,b)=>a.start-b.start)) {
    ticks.push({...period,x:ticks.length*step,width:step,gapLabel:periodGapLabel(previous,period)});previous=period;
  }
  const byPeriod=new Map(ticks.map(t=>[t.id,t]));
  const dateX=(year,end=false)=>{
    const t=byPeriod.get(timelinePeriod(year).id);
    return t.x+(ordinalYear(year)-ordinalYear(t.start)+(end?1:0))/(ordinalYear(t.end)-ordinalYear(t.start)+1)*t.width;
  };
  const rowEnds=[];
  let width=ticks.length*step;
  for(const item of dated) {
    const x=dateX(item.start),endX=dateX(item.end ?? item.start,true),rangeWidth=endX-x;
    const labelWidth=timelineLabelWidth(item),cardWidth=Math.max(rangeWidth,labelWidth);
    let row=rowEnds.findIndex(end=>end+6<=x);
    if(row<0)row=rowEnds.length;
    rowEnds[row]=x+cardWidth;
    const first=timelinePeriod(item.start),last=timelinePeriod(item.end ?? item.start);
    positions.push({item,key:item.id,periodId:first.id,periodLabel:first.id===last.id?first.label:`${first.label} – ${last.label}`,x,endX,width:cardWidth,rangeWidth,labelWidth,row});
    width=Math.max(width,x+cardWidth+4);
  }
  return {ticks,positions,width,step,rowCount:rowEnds.length};
}
export function visibleTimeline(layout,left,viewportWidth) {
  const positions=layout.positions.filter(p=>p.x+p.width>left && p.x<left+viewportWidth);
  return {positions:positions.map(p=>({...p,displayRow:p.row})),rowCount:layout.rowCount};
}
export function durationLabel(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Duration unavailable';
  const minutes = Math.round(seconds/60);
  return minutes >= 60 ? `${Math.floor(minutes/60)}h ${minutes%60}m` : `${minutes} min`;
}
