import {REGIONS,ERAS,CATEGORIES,makeCollection,filterCollection,makeTimeline,visibleTimeline,chronological,durationLabel,formatYear,hasTimelineDate,TIMELINE_COLUMN_WIDTH,TIMELINE_MOBILE_COLUMN_WIDTH} from './core.mjs';
import {EpisodeMap} from './map.js';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search);
const state={q:params.get('q')||'',region:REGIONS.includes(params.get('region'))?params.get('region'):'all',era:ERAS.some(e=>e.id===params.get('era'))?params.get('era'):'all',view:params.get('view')==='index'?'index':'timeline',category:'all',indexLimit:24,beyondLimit:8};
let episodes=[],items=[],catalogue=null,byId=new Map(),itemsById=new Map(),itemByEpisode=new Map(),timeline=null,currentEpisode=null,currentSeries=null,lastFocus=null,toastTimer,renderTimer,timelineKey='',timelineCards=[],timelineTicks=[],episodeMap,hoveredTimelineItem=null,focusedTimelineItem=null;
const motion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
function thumb(url,width=180){try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return '/images/show.jpg';if(u.hostname.endsWith('imgix.net')){u.search='';u.searchParams.set('w',width);u.searchParams.set('h',width);u.searchParams.set('fit','crop');u.searchParams.set('auto','format,compress');}return u.href;}catch{return '/images/show.jpg';}}
function date(value){return value?new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'Release date unavailable';}
function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
function updateUrl(){const p=new URLSearchParams();for(const key of ['q','region','era'])if(state[key]&&state[key]!=='all')p.set(key,state[key]);if(state.view==='index')p.set('view','index');history.replaceState(null,'',`${location.pathname}${p.size?'?'+p:''}${location.hash}`);}
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement&&!event.target.src.endsWith('/images/show.jpg'))event.target.src='/images/show.jpg';},true);
function countLabel(collection){const series=collection.filter(x=>x.type==='series').length,singles=collection.length-series;return [series?`${series} series`:'',singles?`${singles} single${singles===1?'':'s'}`:''].filter(Boolean).join(' · ')||'0 results';}
function itemTarget(item){return item.type==='series'?`data-series="${esc(item.seriesId)}"`:`data-episode="${item.members[0].id}"`;}
function itemSummary(item){return item.type==='series'?`${item.members.length} episodes${item.matches.length<item.members.length?` · ${item.matches.length} matching`:''}`:`EP. ${item.members[0].number||'BONUS'}`;}
function renderControls(){
  $('#era-tabs').innerHTML=ERAS.map(e=>`<button type="button" data-era="${e.id}" class="${state.era===e.id?'active':''}" aria-pressed="${state.era===e.id}">${e.name}</button>`).join('');
  for(const [id,view] of [['timeline-view','timeline'],['list-view','index']]){$('#'+id).classList.toggle('active',state.view===view);$('#'+id).setAttribute('aria-pressed',state.view===view);}
  $('#timeline-section').hidden=state.view!=='timeline';$('#index-section').hidden=state.view!=='index';$('#timeline-tip').hidden=state.view!=='timeline';
  $('#reset-filters').hidden=!(state.q||state.region!=='all'||state.era!=='all');
}
function empty(message,detail){return `<div class="empty-state grid-empty"><h3>${esc(message)}</h3><p>${esc(detail)}</p><button class="text-link" data-clear>Clear filters ↗</button></div>`;}
function timelineRowHeight(){return parseFloat(getComputedStyle($('#timeline-canvas')).getPropertyValue('--timeline-row-height'));}
function renderTimeline(filtered){
  const viewport=$('#timeline-scroll');
  const step=innerWidth<=760?TIMELINE_MOBILE_COLUMN_WIDTH:TIMELINE_COLUMN_WIDTH;
  const key=filtered.map(e=>e.id+':'+e.start+':'+e.end).join(',')+'|'+step;
  if(key===timelineKey)return;
  const opening=!timelineKey&&!state.q&&state.region==='all'&&state.era==='all';
  const previousPeriod=timeline?.ticks.findLast(t=>t.x<=viewport.scrollLeft)?.id;
  const sameItems=key.split('|')[0]===timelineKey.split('|')[0];timelineKey=key;
  timeline=makeTimeline(filtered,step);hoveredTimelineItem=null;focusedTimelineItem=null;
  viewport.style.setProperty('--timeline-visible-rows',timeline.rowCount||10);
  const canvas=$('#timeline-canvas');canvas.style.setProperty('--step',`${step}px`);timelineCards=[];timelineTicks=[];
  $('.timeline-footnote').hidden=!timeline.positions.length;
  if(!timeline.positions.length){canvas.style.width='100%';canvas.innerHTML=empty('No dated results match these filters.','Try another era, region or search. Broad collections and episodes without dates appear below.');$('#time-position').disabled=true;$('#first-year').textContent='';$('#last-year').textContent='';updateScroll();return;}
  $('#time-position').disabled=false;canvas.style.width=`${Math.max(timeline.width,viewport.clientWidth)}px`;
  const axis=`<div class="timeline-axis"><div class="range-guide" id="range-guide" hidden></div><span class="axis-current" id="visible-year" hidden></span>${timeline.ticks.map(t=>`<span class="axis-tick ${t.empty?'is-empty':''}" style="left:${t.x}px;width:${t.width}px" title="${esc(t.label)}${t.empty?' · No tiles; one-third width':''}">${t.gapLabel?`<span class="period-gap" role="img" aria-label="${esc(t.gapLabel)}" title="${esc(t.gapLabel)}">⋯</span>`:''}<span class="axis-label">${t.empty?t.label.replace(' century',' c.'):t.label}</span></span>`).join('')}</div>`;
  const cards=timeline.positions.map(({item,x,width})=>`<button class="story-card ${item.type==='series'?'is-series':''}" ${itemTarget(item)} data-item-id="${esc(item.id)}" style="left:${x}px;width:${width}px;--series-color:${item.color}" aria-label="Open ${esc(item.title)}${item.type==='series'?`, series of ${item.members.length} episodes`:''}, approximately ${esc(item.dateLabel)}"><span class="story-text"><span class="story-title">${esc(item.title)}</span>${item.type==='series'?`<span class="story-count">${item.members.length} ↗</span>`:''}</span></button>`).join('');
  canvas.innerHTML=axis+`<div class="timeline-board" style="height:${timeline.rowCount*timelineRowHeight()}px">${timeline.ticks.map(t=>`<span aria-hidden="true" class="timeline-gridline" style="left:${t.x}px"></span>`).join('')}${cards}</div>`;
  timelineCards=[...canvas.querySelectorAll('.story-card')];timelineTicks=[...canvas.querySelectorAll('.axis-tick')];
  $('#first-year').textContent=timeline.ticks[0].label;$('#last-year').textContent=timeline.ticks.at(-1).label;
  $('#row-count-note').textContent=`${timeline.rowCount} fixed ${timeline.rowCount===1?'row':'rows'}`;
  const openingCentury=opening?timeline.ticks.find(t=>t.id==='century:16'):null;
  const openingLeft=openingCentury?.x||0;
  const left=sameItems?timeline.ticks.find(t=>t.id===previousPeriod)?.x||0:Math.max(0,openingLeft);
  viewport.scrollTo({left,top:0,behavior:'instant'});updateScroll();
}
function updateVisibleRows(){
  if(!timeline?.positions.length||state.view!=='timeline')return;
  const viewport=$('#timeline-scroll'),visible=visibleTimeline(timeline,viewport.scrollLeft,viewport.clientWidth),active=new Map(visible.positions.map(p=>[p.item.id,p]));
  const rowHeight=timelineRowHeight();
  for(const card of timelineCards){const position=active.get(card.dataset.itemId);card.hidden=!position;if(position)card.style.top=`${position.row*rowHeight+1}px`;}
  $('.timeline-board').style.height=`${timeline.rowCount*rowHeight}px`;
}
function updateScroll(){
  const el=$('#timeline-scroll'),max=el.scrollWidth-el.clientWidth;
  $('#time-position').value=max>0?Math.round(el.scrollLeft/max*1000):0;$('#earlier').disabled=el.scrollLeft<2;$('#later').disabled=max<2||el.scrollLeft>=max-2;
  if(timeline?.ticks.length){const tick=timeline.ticks.findLast(t=>t.x<=el.scrollLeft)||timeline.ticks[0];$('#time-position').setAttribute('aria-valuetext',`Approximately ${tick.label}`);const current=$('#visible-year');if(current){current.textContent=tick.label;current.hidden=tick.x>=el.scrollLeft-4||tick.x+tick.width-el.scrollLeft<tick.width/2;const edge=el.scrollLeft+(current.hidden?0:current.offsetWidth+6);timelineTicks.forEach((label,index)=>label.style.visibility=timeline.ticks[index].x<edge-1?'hidden':'');}}
  updateVisibleRows();updateRangeGuide();
}
function updateRangeGuide(){
  const guide=$('#range-guide');if(!guide)return;
  const supported=matchMedia('(min-width:761px) and (hover:hover) and (pointer:fine)').matches;
  guide.hidden=!supported;if(!supported)return;
  const viewport=$('#timeline-scroll'),left=viewport.scrollLeft+10,right=viewport.scrollLeft+viewport.clientWidth-10;
  const position=timeline.positions.find(p=>p.item.id===(hoveredTimelineItem||focusedTimelineItem));
  for(const card of timelineCards)card.classList.toggle('is-range-active',card.dataset.itemId===position?.item.id);
  if(!position){guide.removeAttribute('role');guide.removeAttribute('aria-label');guide.innerHTML=`<span class="range-hint" style="left:${left}px">Hover or focus a tile to mark its historical range</span>`;return;}
  const clamp=x=>Math.max(left,Math.min(right,x)),from=clamp(position.startX),to=clamp(position.endX);
  const before=position.startX<left,after=position.endX>right,start=formatYear(position.item.start),end=formatYear(position.item.end);
  guide.setAttribute('role','img');guide.setAttribute('aria-label',`Approximate historical coverage: ${position.item.dateLabel}`);
  let labels;
  if(start===end||to-from<200){
    const label=`${before?'← ':''}${start}${start===end?'':` – ${end}`}${after?' →':''}`,half=label.length*3.5+8;
    const center=Math.max(left+half,Math.min(right-half,(from+to)/2));
    labels=`<span class="range-dates range-combined" style="left:${center}px">${esc(label)}</span>`;
  }else labels=`<span class="range-dates range-start" style="left:${from}px">${before?'← ':''}${esc(start)}</span><span class="range-dates range-end" style="left:${to}px">${esc(end)}${after?' →':''}</span>`;
  guide.innerHTML=`<span class="range-caption" style="left:${left}px;max-width:${right-left}px">Approximate coverage · ${esc(position.item.title)}</span><span class="range-line ${before?'continues-before':''} ${after?'continues-after':''}" style="left:${from}px;width:${Math.max(1,to-from)}px"></span>${labels}`;
}
function libraryCard(item){return `<button class="library-card ${item.type==='series'?'is-series':''}" ${itemTarget(item)} style="--series-color:${item.color}" aria-label="Open ${esc(item.title)}${item.type==='series'?`, ${item.members.length} episodes`:''}"><div class="library-card-art"><img src="${esc(thumb(item.image,420))}" alt="" loading="lazy" decoding="async" width="350" height="350">${item.type==='series'?`<span class="series-badge">${item.members.length} EPISODES</span>`:''}</div><div class="library-card-body"><span class="card-eyebrow">${esc(item.category||item.region)}</span><h3>${esc(item.title)}</h3><div class="card-bottom"><span>${esc(item.start===null?itemSummary(item):item.dateLabel)}</span><span class="card-arrow" aria-hidden="true">↗</span></div></div></button>`;}
function render(){
  if(!catalogue)return;renderControls();
  const filtered=filterCollection(items,state),dated=filterCollection(items,state,'timeline'),undated=filterCollection(items,state,'undated');
  episodeMap?.setEpisodes(filtered);
  $('#results-count').textContent=state.view==='timeline'?`${countLabel(dated)} on the timeline`:countLabel(filtered)+' in the index';
  if(state.view==='timeline')renderTimeline(dated);else{const sorted=[...filtered].sort(chronological);$('#index-grid').innerHTML=sorted.length?sorted.slice(0,state.indexLimit).map(libraryCard).join(''):empty('No results found.','Try a different name, place or episode number.');$('#index-more').hidden=sorted.length<=state.indexLimit;}
  const categories=['all',...CATEGORIES.filter(c=>episodes.some(e=>e.category===c))];
  $('#category-tabs').innerHTML=categories.map(c=>{const count=c==='all'?undated.length:undated.filter(item=>item.matches.some(e=>e.category===c)).length;return `<button data-category="${esc(c)}" class="${state.category===c?'active':''}" aria-pressed="${state.category===c}">${c==='all'?'All topics':esc(c)}<span>${count}</span></button>`;}).join('');
  const beyond=undated.filter(item=>state.category==='all'||item.matches.some(e=>e.category===state.category)).sort((a,b)=>Date.parse(b.published)-Date.parse(a.published));
  $('#beyond-grid').innerHTML=beyond.length?beyond.slice(0,state.beyondLimit).map(libraryCard).join(''):empty('No results in this category.','Try another category or clear your search.');$('#beyond-more').hidden=beyond.length<=state.beyondLimit;updateUrl();
}
function setFilter(key,value){state[key]=value;state.indexLimit=24;state.beyondLimit=8;render();}
function resetFilterState(){Object.assign(state,{q:'',region:'all',era:'all',category:'all',indexLimit:24,beyondLimit:8});$('#search').value='';$('#region').value='all';}
function clearFilters(){resetFilterState();render();}
function link(url,label,hint,symbol,extra=''){if(!url||!/^https?:\/\//.test(url))return '';return `<a class="listen-link ${extra}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}, ${esc(hint)} (opens in a new tab)"><span class="service-icon" aria-hidden="true">${symbol}</span><span><span class="service-name">${label}</span><span class="service-hint">${hint}</span></span><span class="service-arrow" aria-hidden="true">↗</span></a>`;}
function locationButtons(e){return `<div class="location-actions">${hasTimelineDate(e)?`<button data-locate-timeline="${e.id}">Show on the timeline →</button>`:''}${e.location?.coordinates?`<button data-locate-map="${e.id}">Show on the map ↗</button>`:''}</div>`;}
function beginDetail(){const dialog=$('#episode-dialog');if(!dialog.open)lastFocus=document.activeElement;dialog.querySelector('audio')?.pause();return dialog;}
function finishDetail(dialog,hash){if(!dialog.open)dialog.showModal();dialog.scrollTop=0;const heading=$('#episode-title');heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});document.body.classList.add('modal-open');if(hash)history.pushState(null,'',`${location.pathname}${location.search}${hash}`);}
function showSeries(id,{hash=true}={}){
  const item=itemsById.get('series:'+id);if(!item)return;const dialog=beginDetail();currentEpisode=null;currentSeries=id;
  const dated=item.members.filter(hasTimelineDate),mapped=item.members.filter(e=>e.location?.coordinates);
  $('#episode-content').innerHTML=`<article class="series-detail" style="--series-color:${item.color}"><div class="series-hero"><img src="${esc(thumb(item.image,300))}" width="112" height="112" alt=""><div><p class="eyebrow">EPISODE SERIES · ${item.members.length} EPISODES</p><h2 id="episode-title">${esc(item.title)}</h2><p class="series-range">${esc(item.dateLabel)} · ${esc(item.region)}</p></div></div>${item.timelineNote?`<p class="series-timeline-note">${esc(item.timelineNote)}</p>`:''}<p class="series-intro">Episodes in release order. Choose a part for its description and listening links.</p><div class="series-placement">${dated.length?`<button data-locate-timeline="${dated[0].id}">Show series on the timeline →</button>`:''}${mapped.length?`<button data-locate-map="${mapped[0].id}">Show series on the map ↗</button>`:''}</div><div class="series-parts">${item.members.map((e,index)=>`<button class="series-part" data-episode="${e.id}"><span class="part-number">${String(index+1).padStart(2,'0')}</span><img src="${esc(thumb(e.image,100))}" alt="" width="44" height="44" loading="lazy"><span class="part-text"><strong>${esc(e.title)}</strong><span>${esc(e.dateLabel)} · ${durationLabel(e.duration)}</span><span class="part-availability">${hasTimelineDate(e)?'Timeline':e.timelineExcluded?'Off timeline':'No timeline date'} · ${e.location?.coordinates?esc(e.location.label):'Worldwide'}</span></span><span class="part-arrow" aria-hidden="true">↗</span></button>`).join('')}</div><div class="detail-actions"><button id="copy-episode">Copy series link</button></div></article>`;
  finishDetail(dialog,hash?`#series=${id}`:null);
}
function showEpisode(id,{hash=true}={}){
  const e=byId.get(id);if(!e){notify('That episode is not in this catalogue snapshot.');return;}
  const dialog=beginDetail();currentEpisode=id;currentSeries=null;const item=itemByEpisode.get(id),related=item?.type==='series'?item.members:[];
  $('#episode-content').innerHTML=`<article class="episode-detail"><aside class="episode-aside"><img class="episode-cover" src="${esc(thumb(e.image,600))}" width="300" height="300" alt="Artwork for ${esc(e.title)}"><p class="detail-number">${e.number?'EPISODE '+e.number:'FROM THE PUBLIC FEED'}</p><p class="historical-period">${esc(e.dateLabel)}</p><p class="detail-region">${esc(e.region)}</p><p class="placement-note">${esc(e.note)}</p>${e.timelineNote?`<p class="placement-note timeline-exclusion"><strong>Not on the timeline.</strong> ${esc(e.timelineNote)}</p>`:''}${e.location?`<p class="location-note"><span>MAP LOCATION</span><strong>${esc(e.location.label)}</strong>${esc(e.location.note)}</p>`:''}${locationButtons(e)}</aside><div class="episode-body">${related.length?`<button class="series-back" data-series="${esc(item.seriesId)}">← ${esc(item.title)} · ${related.length} episodes</button>`:'<p class="eyebrow">THE REST IS HISTORY</p>'}<h2 id="episode-title">${esc(e.title)}</h2><div class="detail-meta"><span>${durationLabel(e.duration)}</span><span>Released ${date(e.published)}</span></div><div class="episode-description">${(e.description||'Open this episode in your podcast app for more information.').split(/\n\s*\n/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('')}</div><h3 class="listen-heading">LISTEN TO THIS EPISODE</h3><div class="listen-grid">${link(e.links.pocketCasts,'Pocket Casts','Play this episode','◔','pocket')}${link(e.links.spotify,'Spotify',e.links.spotifyKind==='episode'?'Play this episode':'Find episode · search','≋')}${link(e.links.applePodcasts,'Apple Podcasts',e.links.applePodcastsKind==='episode'?'Play this episode':'Find episode · search','◉')}${link(e.links.youtube,'YouTube','Find episode · search','▷')}</div><div class="audio-container"><p class="audio-label">OR LISTEN HERE · ORIGINAL PUBLIC AUDIO</p><audio controls preload="none" src="${esc(e.audio)}" aria-label="Play ${esc(e.title)}"></audio></div><div class="detail-actions"><button id="copy-episode">Copy episode link</button>${e.officialUrl?`<a href="${esc(e.officialUrl)}" target="_blank" rel="noopener noreferrer">Official archive ↗</a>`:''}<a href="https://therestishistory.com/club" target="_blank" rel="noopener noreferrer">The History Club ↗</a><a href="https://feeds.megaphone.fm/GLT4787413333" target="_blank" rel="noopener noreferrer">RSS feed ↗</a></div>${related.length?`<section class="related-episodes"><h3>In this series</h3>${related.map(x=>`<button class="related-episode ${x.id===e.id?'active':''}" data-episode="${x.id}" ${x.id===e.id?'aria-current="true"':''}><span>${esc(x.title)}</span><span>${x.id===e.id?'Here':'↗'}</span></button>`).join('')}</section>`:''}</div></article>`;
  finishDetail(dialog,hash?`#episode=${e.id}`:null);
}
function closeEpisode(){const dialog=$('#episode-dialog');dialog.querySelector('audio')?.pause();dialog.close();currentEpisode=null;currentSeries=null;document.body.classList.remove('modal-open');if(/^#(?:episode|series)=/.test(location.hash))history.replaceState(null,'',`${location.pathname}${location.search}`);if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});}
function showItem(id){const item=itemsById.get(id);if(item?.type==='series')showSeries(item.seriesId);else if(item)showEpisode(item.members[0].id);}
function locateTimeline(id){
  const e=byId.get(id);if(!e||!hasTimelineDate(e))return;closeEpisode();resetFilterState();state.view='timeline';render();
  const item=itemByEpisode.get(id),position=timeline.positions.find(p=>p.item.id===item.id);if(!position)return;
  const viewport=$('#timeline-scroll');viewport.scrollLeft=Math.max(0,position.x-(viewport.clientWidth-Math.min(position.width,viewport.clientWidth))/2);viewport.scrollTop=Math.max(0,position.row*timelineRowHeight()-(viewport.clientHeight-timelineRowHeight())/2);updateScroll();
  const card=timelineCards.find(c=>c.dataset.itemId===item.id);card?.classList.add('locate-highlight');card?.focus({preventScroll:true});setTimeout(()=>card?.classList.remove('locate-highlight'),4000);
  $('#timeline-shell').scrollIntoView({behavior:motion(),block:'center'});notify(item.type==='series'?`Located in ${item.title}. Open the series to choose this episode.`:'Episode located on the timeline.');
}
function locateMap(id){const e=byId.get(id);if(!e?.location?.coordinates)return;closeEpisode();resetFilterState();render();episodeMap.focusEpisode(e);$('#episode-map').scrollIntoView({behavior:motion(),block:'start'});history.replaceState(null,'',`${location.pathname}${location.search}#episode-map`);}
function openAbout(){lastFocus=document.activeElement;$('#about-dialog').showModal();document.body.classList.add('modal-open');}
function closeAbout(){$('#about-dialog').close();document.body.classList.remove('modal-open');if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});}
function readHash(){if(!catalogue)return;let match=location.hash.match(/^#episode=([a-zA-Z0-9-]+)$/);if(match){showEpisode(match[1],{hash:false});return;}match=location.hash.match(/^#series=([a-zA-Z0-9-]+)$/);if(match){showSeries(match[1],{hash:false});return;}if($('#episode-dialog').open)closeEpisode();}
async function load(){
  $('#load-error').hidden=true;
  try{
    const response=await fetch('/data/catalogue.json');if(!response.ok)throw new Error(`Catalogue HTTP ${response.status}`);const data=await response.json();if(!Array.isArray(data.episodes)||!data.episodes.length)throw new Error('Catalogue is empty');
    catalogue=data;episodes=data.episodes;byId=new Map(episodes.map(e=>[e.id,e]));items=makeCollection(episodes);itemsById=new Map(items.map(item=>[item.id,item]));itemByEpisode=new Map(items.flatMap(item=>item.members.map(e=>[e.id,item])));
    $('#total-count').textContent=episodes.length.toLocaleString('en-GB');$('#updated-at').textContent=$('#catalogue-date').textContent=`Catalogue updated ${date(data.updatedAt)}`;
    $('#about-coverage').textContent=`This snapshot contains all ${episodes.length} episodes available in the public RSS feed on ${date(data.updatedAt)}, grouped into ${countLabel(items)}. Club-only episodes absent from the public feed are not included. This is a dated catalogue, refreshed deliberately, rather than a live feed. Episode artwork, descriptions and audio come from the publisher.`;
    episodeMap ||= new EpisodeMap({onItem:showItem,onEpisode:showEpisode,thumb});render();readHash();
  }catch(error){console.error('Catalogue could not be loaded:',error);$('#load-error').hidden=false;$('#timeline-section').hidden=true;$('#results-count').textContent='Catalogue unavailable';}
}
$('#region').innerHTML+=REGIONS.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('');$('#region').value=state.region;$('#search').value=state.q;
$('#search').addEventListener('input',e=>{clearTimeout(renderTimer);renderTimer=setTimeout(()=>setFilter('q',e.target.value),160);});$('#region').addEventListener('change',e=>setFilter('region',e.target.value));
$('#timeline-view').addEventListener('click',()=>setFilter('view','timeline'));$('#list-view').addEventListener('click',()=>setFilter('view','index'));$('#reset-filters').addEventListener('click',clearFilters);$('#retry').addEventListener('click',load);
$('#index-more').addEventListener('click',()=>{state.indexLimit+=24;render();});$('#beyond-more').addEventListener('click',()=>{state.beyondLimit+=12;render();});
for(const [id,direction] of [['earlier',-1],['later',1]])$('#'+id).addEventListener('click',()=>$('#timeline-scroll').scrollBy({left:direction*Math.max(timeline?.step||176,$('#timeline-scroll').clientWidth-(timeline?.step||176)),behavior:motion()}));
$('#time-position').addEventListener('input',e=>{const el=$('#timeline-scroll');el.scrollLeft=(el.scrollWidth-el.clientWidth)*Number(e.target.value)/1000;});
$('#timeline-scroll').addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const card=event.target.closest('.story-card');if(card){hoveredTimelineItem=card.dataset.itemId;updateRangeGuide();}});
$('#timeline-scroll').addEventListener('pointerout',event=>{const card=event.target.closest('.story-card');if(card&&!card.contains(event.relatedTarget)){hoveredTimelineItem=null;updateRangeGuide();}});
$('#timeline-scroll').addEventListener('focusin',event=>{const card=event.target.closest('.story-card');if(card){hoveredTimelineItem=null;focusedTimelineItem=card.dataset.itemId;updateRangeGuide();}});
$('#timeline-scroll').addEventListener('focusout',event=>{if(event.target.closest('.story-card')){focusedTimelineItem=null;updateRangeGuide();}});
let scrollPending=false;$('#timeline-scroll').addEventListener('scroll',()=>{if(scrollPending)return;scrollPending=true;requestAnimationFrame(()=>{updateScroll();scrollPending=false;});},{passive:true});window.addEventListener('resize',()=>{if(catalogue&&state.view==='timeline')render();updateScroll();});
$('#surprise').addEventListener('click',()=>{if(episodes.length)showEpisode(episodes[Math.floor(Math.random()*episodes.length)].id);});
document.addEventListener('click',async event=>{
  const target=event.target;
  const locateT=target.closest('[data-locate-timeline]');if(locateT){locateTimeline(locateT.dataset.locateTimeline);return;}
  const locateM=target.closest('[data-locate-map]');if(locateM){locateMap(locateM.dataset.locateMap);return;}
  const series=target.closest('[data-series]');if(series){showSeries(series.dataset.series);return;}
  const ep=target.closest('[data-episode]');if(ep){showEpisode(ep.dataset.episode);return;}
  const era=target.closest('[data-era]');if(era){setFilter('era',era.dataset.era);$('#era-tabs .active').focus({preventScroll:true});return;}
  const cat=target.closest('[data-category]');if(cat){state.category=cat.dataset.category;state.beyondLimit=8;render();$('#category-tabs .active').focus({preventScroll:true});return;}
  if(target.closest('[data-clear]')){clearFilters();return;}if(target.closest('[data-about]')){openAbout();return;}
  if(target.closest('#copy-episode')){try{await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${currentSeries?'series='+currentSeries:'episode='+currentEpisode}`);notify(currentSeries?'Series link copied.':'Episode link copied.');}catch{notify('Copy the link from your browser’s address bar.');}}
});
$('#episode-dialog .dialog-close').addEventListener('click',closeEpisode);$('#about-dialog .dialog-close').addEventListener('click',closeAbout);
$('#episode-dialog').addEventListener('cancel',e=>{e.preventDefault();closeEpisode();});$('#about-dialog').addEventListener('cancel',e=>{e.preventDefault();closeAbout();});
for(const selector of ['#episode-dialog','#about-dialog'])$(selector).addEventListener('click',e=>{if(e.target!==$(selector))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)(selector==='#episode-dialog'?closeEpisode:closeAbout)();});
window.addEventListener('hashchange',readHash);window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);state.q=p.get('q')||'';state.region=REGIONS.includes(p.get('region'))?p.get('region'):'all';state.era=ERAS.some(e=>e.id===p.get('era'))?p.get('era'):'all';state.view=p.get('view')==='index'?'index':'timeline';$('#search').value=state.q;$('#region').value=state.region;render();readHash();});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();$('#search').focus();$('#search').scrollIntoView({block:'center',behavior:motion()});}});
renderControls();
// Align section links against the reserved loading layout, before fetching data.
if(['#episode-map','#collection','#beyond'].includes(location.hash))$(location.hash)?.scrollIntoView({block:'start',behavior:'instant'});
load();
