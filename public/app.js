import {REGIONS,ERAS,CATEGORIES,formatYear,matchesEpisode,makeTimeline,chronological,durationLabel} from './core.mjs';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = new URLSearchParams(location.search);
const state = {q:params.get('q')||'',region:REGIONS.includes(params.get('region'))?params.get('region'):'all',era:ERAS.some(e=>e.id===params.get('era'))?params.get('era'):'all',view:params.get('view')==='index'?'index':'timeline',category:'all',indexLimit:24,beyondLimit:8};
const regionColors=['#776546','#8b4753','#ac8351','#a46f4a','#747e60','#6c7c7e','#8e8173','#8b7491'];
let episodes=[],catalogue=null,byId=new Map(),timeline=null,currentEpisode=null,lastFocus=null,toastTimer,renderTimer,timelineKey='',firstTimeline=true;
const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

function thumb(url,width=180) {
  try {const u=new URL(url); if(!['https:','http:'].includes(u.protocol))return '/images/show.jpg'; if(u.hostname.endsWith('imgix.net')){u.search='';u.searchParams.set('w',width);u.searchParams.set('h',width);u.searchParams.set('fit','crop');u.searchParams.set('auto','format,compress');}return u.href;} catch{return '/images/show.jpg';}
}
function date(value) { return value ? new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : 'Release date unavailable'; }
function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
function updateUrl(){const p=new URLSearchParams();for(const k of ['q','region','era'])if(state[k] && state[k]!=='all')p.set(k,state[k]);if(state.view==='index')p.set('view','index');history.replaceState(null,'',`${location.pathname}${p.size?'?'+p:''}${location.hash}`);}
function imageFallback(event){if(event.target instanceof HTMLImageElement && !event.target.src.endsWith('/images/show.jpg')){event.target.src='/images/show.jpg';event.target.dataset.fallback='true';}}
document.addEventListener('error',imageFallback,true);

function renderControls(){
  $('#era-tabs').innerHTML=ERAS.map(e=>`<button type="button" data-era="${e.id}" class="${state.era===e.id?'active':''}" aria-pressed="${state.era===e.id}">${e.name}</button>`).join('');
  $('#timeline-view').classList.toggle('active',state.view==='timeline');$('#timeline-view').setAttribute('aria-pressed',state.view==='timeline');
  $('#list-view').classList.toggle('active',state.view==='index');$('#list-view').setAttribute('aria-pressed',state.view==='index');
  $('#timeline-section').hidden=state.view!=='timeline';$('#index-section').hidden=state.view!=='index';$('#timeline-tip').hidden=state.view!=='timeline';
  $('#reset-filters').hidden=!(state.q||state.region!=='all'||state.era!=='all');
}
function empty(message,detail){return `<div class="empty-state grid-empty"><h3>${esc(message)}</h3><p>${esc(detail)}</p><button class="text-link" data-clear>Clear filters ↗</button></div>`;}
function renderTimeline(filtered){
  const labelWidth=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--label-width'));
  const step=Math.min(252,Math.max(182,$('#timeline-scroll').clientWidth-labelWidth));
  const key=filtered.map(e=>e.id).join(',')+':'+step;
  if(key===timelineKey)return;
  timelineKey=key;
  $('#timeline-canvas').style.setProperty('--step',`${step}px`);
  timeline=makeTimeline(filtered,step);
  const canvas=$('#timeline-canvas');
  if(!timeline.positions.length){canvas.style.width='100%';canvas.innerHTML=empty('No stories in this corner of history.','Try another era, region or search. Undated results appear below.');$('#time-position').disabled=true;$('#first-year').textContent='';$('#last-year').textContent='';updateScroll();return;}
  $('#time-position').disabled=false;
  canvas.style.width=`calc(var(--label-width) + ${Math.max(timeline.width,260)}px)`;
  const axis=`<div class="timeline-axis"><div class="axis-corner"><svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><circle cx="9" cy="9" r="6.8"/><path d="m12 6-2 4-4 2 2-4 4-2Z"/></svg>REGION</div>${timeline.ticks.map(t=>`<span class="axis-tick" style="left:calc(var(--label-width) + ${t.x}px)">${formatYear(t.year)}</span>`).join('')}</div>`;
  const lanes=timeline.regions.map((region,i)=>{
    const cards=timeline.positions.filter(p=>p.episode.region===region);
    return `<section class="timeline-lane" aria-labelledby="region-${i}" style="--region-color:${regionColors[REGIONS.indexOf(region)]}">${timeline.ticks.map(t=>`<span aria-hidden="true" class="timeline-gridline" style="left:calc(var(--label-width) + ${t.x}px)"></span>`).join('')}<div class="lane-label"><span class="region-name" id="region-${i}"><span class="region-dot" aria-hidden="true"></span>${esc(region)}</span><span class="lane-count">${cards.length} ${cards.length===1?'episode':'episodes'}</span></div>${cards.map(({episode:e,x})=>`<button class="story-card" data-episode="${e.id}" style="left:calc(var(--label-width) + ${x+11}px)" title="${esc(e.title)} · ${esc(e.dateLabel)}" aria-label="${esc(e.title)}, ${esc(e.dateLabel)}, ${esc(e.region)}"><img src="${esc(thumb(e.image))}" width="59" height="59" alt="" loading="lazy" decoding="async"><span class="story-title">${esc(e.title)}</span></button>`).join('')}</section>`;
  }).join('');
  canvas.innerHTML=axis+lanes;
  $('#first-year').textContent=formatYear(timeline.ticks[0].year);$('#last-year').textContent=formatYear(timeline.ticks.at(-1).year);
  const firstCivilisations=firstTimeline&&!state.q&&state.era==='all'&&state.region==='all'?timeline.ticks.find(t=>t.year>=-3000)?.x||0:0;
  firstTimeline=false;
  $('#timeline-scroll').scrollTo({left:firstCivilisations,top:0,behavior:'instant'});requestAnimationFrame(updateScroll);
}
function updateScroll(){const el=$('#timeline-scroll');const max=el.scrollWidth-el.clientWidth;$('#time-position').value=max>0?Math.round(el.scrollLeft/max*1000):0;$('#earlier').disabled=el.scrollLeft<2;$('#later').disabled=max<2||el.scrollLeft>=max-2;if(timeline?.ticks.length){const tick=timeline.ticks.findLast(t=>t.x<=el.scrollLeft)||timeline.ticks[0];$('#time-position').setAttribute('aria-valuetext',`Around ${formatYear(tick.year)}`);}}
function libraryCard(e){return `<button class="library-card" data-episode="${e.id}" aria-label="Open ${esc(e.title)}"><div class="library-card-art"><img src="${esc(thumb(e.image,420))}" alt="" loading="lazy" decoding="async" width="350" height="350"></div><div class="library-card-body"><span class="card-eyebrow">${esc(e.category||e.region)}</span><h3>${esc(e.title)}</h3><div class="card-bottom"><span>${e.start===null?`EP. ${e.number||'BONUS'} · ${durationLabel(e.duration)}`:esc(e.dateLabel)}</span><span class="card-arrow" aria-hidden="true">↗</span></div></div></button>`;}
function render(){
  if(!catalogue)return;
  renderControls();
  const filtered=episodes.filter(e=>matchesEpisode(e,state));const dated=filtered.filter(e=>e.start!==null);const undated=filtered.filter(e=>e.start===null);
  $('#results-count').textContent=state.view==='timeline'?`${dated.length} on the timeline · ${undated.length} beyond time`:`${filtered.length} ${filtered.length===1?'episode':'episodes'} in the index`;
  if(state.view==='timeline')renderTimeline(dated);else{const sorted=[...filtered].sort(chronological);$('#index-grid').innerHTML=sorted.length?sorted.slice(0,state.indexLimit).map(libraryCard).join(''):empty('No episodes found.','Try a different name, place or episode number.');$('#index-more').hidden=sorted.length<=state.indexLimit;}
  const counts=Object.fromEntries(CATEGORIES.map(c=>[c,undated.filter(e=>e.category===c).length]));
  const categories=['all',...CATEGORIES.filter(c=>episodes.some(e=>e.category===c))];
  $('#category-tabs').innerHTML=categories.map(c=>`<button data-category="${esc(c)}" class="${state.category===c?'active':''}" aria-pressed="${state.category===c}">${c==='all'?'All curiosities':esc(c)}<span>${c==='all'?undated.length:counts[c]||0}</span></button>`).join('');
  const beyond=undated.filter(e=>state.category==='all'||e.category===state.category).sort((a,b)=>new Date(b.published)-new Date(a.published));
  $('#beyond-grid').innerHTML=beyond.length?beyond.slice(0,state.beyondLimit).map(libraryCard).join(''):empty('No curiosities here just yet.','Try another category or clear your search.');
  $('#beyond-more').hidden=beyond.length<=state.beyondLimit;
  updateUrl();
}
function setFilter(key,value){state[key]=value;state.indexLimit=24;state.beyondLimit=8;render();}
function clearFilters(){Object.assign(state,{q:'',region:'all',era:'all',category:'all',indexLimit:24,beyondLimit:8});$('#search').value='';$('#region').value='all';render();}
function link(url,label,hint,symbol,extra=''){if(!url||!/^https?:\/\//.test(url))return '';return `<a class="listen-link ${extra}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}, ${esc(hint)} (opens in a new tab)"><span class="service-icon" aria-hidden="true">${symbol}</span><span><span class="service-name">${label}</span><span class="service-hint">${hint}</span></span><span class="service-arrow" aria-hidden="true">↗</span></a>`;}
function showEpisode(id,{hash=true}={}){
  const e=byId.get(id);if(!e){notify('That episode is not in this catalogue snapshot.');return;}
  const dialog=$('#episode-dialog');if(!dialog.open)lastFocus=document.activeElement;
  currentEpisode=e.id;
  const related=e.series?episodes.filter(x=>x.series===e.series).sort((a,b)=>(a.number||0)-(b.number||0)):[];
  $('#episode-content').innerHTML=`<article class="episode-detail"><aside class="episode-aside"><img class="episode-cover" src="${esc(thumb(e.image,600))}" width="300" height="300" alt="Artwork for ${esc(e.title)}"><p class="detail-number">${e.number?'EPISODE '+e.number:'FROM THE PUBLIC FEED'}</p><p class="historical-period">${esc(e.dateLabel)}</p><p class="detail-region">${esc(e.region)}</p><p class="placement-note">${esc(e.note)}</p></aside><div class="episode-body"><p class="eyebrow">THE REST IS HISTORY</p><h2 id="episode-title">${esc(e.title)}</h2><div class="detail-meta"><span>${durationLabel(e.duration)}</span><span>Released ${date(e.published)}</span></div><div class="episode-description">${(e.description||'The publisher has not provided a description for this episode. Open it in your podcast app for more information.').split(/\n\s*\n/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('')}</div><h3 class="listen-heading">MAKE YOURSELF COMFORTABLE. PRESS PLAY.</h3><div class="listen-grid">${link(e.links.pocketCasts,'Pocket Casts','Play this episode','◔','pocket')}${link(e.links.spotify,'Spotify',e.links.spotifyKind==='episode'?'Play this episode':'Find episode · search','≋')}${link(e.links.applePodcasts,'Apple Podcasts',e.links.applePodcastsKind==='episode'?'Play this episode':'Find episode · search','◉')}${link(e.links.youtube,'YouTube','Find episode · search','▷')}</div><div class="audio-container"><p class="audio-label">OR LISTEN HERE · ORIGINAL PUBLIC AUDIO</p><audio controls preload="none" src="${esc(e.audio)}" aria-label="Play ${esc(e.title)}"></audio></div><div class="detail-actions"><button id="copy-episode">Copy episode link</button>${e.officialUrl?`<a href="${esc(e.officialUrl)}" target="_blank" rel="noopener noreferrer">Official archive ↗</a>`:''}<a href="https://therestishistory.com/club" target="_blank" rel="noopener noreferrer">The History Club ↗</a><a href="https://feeds.megaphone.fm/GLT4787413333" target="_blank" rel="noopener noreferrer">RSS feed ↗</a></div>${related.length>1?`<section class="related-episodes"><h3>Continue the story</h3>${related.map(x=>`<button class="related-episode ${x.id===e.id?'active':''}" data-episode="${x.id}" ${x.id===e.id?'aria-current="true"':''}><span>${esc(x.title)}</span><span>${x.id===e.id?'Here':'↗'}</span></button>`).join('')}</section>`:''}</div></article>`;
  if(!dialog.open)dialog.showModal();dialog.scrollTop=0;document.body.classList.add('modal-open');
  if(hash)history.pushState(null,'',`${location.pathname}${location.search}#episode=${e.id}`);
}
function closeEpisode(){const dialog=$('#episode-dialog');dialog.querySelector('audio')?.pause();dialog.close();currentEpisode=null;document.body.classList.remove('modal-open');if(location.hash.startsWith('#episode='))history.replaceState(null,'',`${location.pathname}${location.search}`);if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});}
function openAbout(){lastFocus=document.activeElement;$('#about-dialog').showModal();document.body.classList.add('modal-open');}
function closeAbout(){$('#about-dialog').close();document.body.classList.remove('modal-open');if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});}
function readHash(){if(!catalogue)return;const match=location.hash.match(/^#episode=([a-zA-Z0-9-]+)$/);if(match)showEpisode(match[1],{hash:false});else if($('#episode-dialog').open)closeEpisode();}

async function load(){
  $('#load-error').hidden=true;
  try{
    const response=await fetch('/data/catalogue.json');if(!response.ok)throw new Error(`Catalogue HTTP ${response.status}`);const data=await response.json();if(!Array.isArray(data.episodes)||!data.episodes.length)throw new Error('Catalogue is empty');
    catalogue=data;episodes=data.episodes;byId=new Map(episodes.map(e=>[e.id,e]));$('#total-count').textContent=episodes.length.toLocaleString('en-GB');$('#updated-at').textContent=`Catalogue updated ${date(data.updatedAt)}`;
    $('#about-coverage').textContent=`This snapshot contains all ${episodes.length} episodes available in the public RSS feed on ${date(data.updatedAt)}. Club-only episodes that are absent from the public feed are not included. New episodes appear when the catalogue is refreshed; this is not a live feed. Episode artwork and descriptions come from the publisher.`;
    render();readHash();
  }catch(error){console.error('Catalogue could not be loaded:',error);$('#load-error').hidden=false;$('#timeline-section').hidden=true;$('#results-count').textContent='Catalogue unavailable';}
}

$('#region').innerHTML+=[...REGIONS].map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('');$('#region').value=state.region;$('#search').value=state.q;
$('#search').addEventListener('input',e=>{clearTimeout(renderTimer);renderTimer=setTimeout(()=>setFilter('q',e.target.value),160);});
$('#region').addEventListener('change',e=>setFilter('region',e.target.value));
$('#timeline-view').addEventListener('click',()=>setFilter('view','timeline'));$('#list-view').addEventListener('click',()=>setFilter('view','index'));
$('#reset-filters').addEventListener('click',clearFilters);$('#retry').addEventListener('click',load);
$('#index-more').addEventListener('click',()=>{state.indexLimit+=24;render();});$('#beyond-more').addEventListener('click',()=>{state.beyondLimit+=12;render();});
$('#earlier').addEventListener('click',()=>$('#timeline-scroll').scrollBy({left:-Math.max(252,$('#timeline-scroll').clientWidth-160),behavior:motion()}));$('#later').addEventListener('click',()=>$('#timeline-scroll').scrollBy({left:Math.max(252,$('#timeline-scroll').clientWidth-160),behavior:motion()}));
$('#time-position').addEventListener('input',e=>{const el=$('#timeline-scroll');el.scrollLeft=(el.scrollWidth-el.clientWidth)*Number(e.target.value)/1000;});
let scrollPending=false;$('#timeline-scroll').addEventListener('scroll',()=>{if(scrollPending)return;scrollPending=true;requestAnimationFrame(()=>{updateScroll();scrollPending=false;});},{passive:true});window.addEventListener('resize',()=>{if(catalogue&&state.view==='timeline')render();updateScroll();});
$('#surprise').addEventListener('click',()=>{if(episodes.length)showEpisode(episodes[Math.floor(Math.random()*episodes.length)].id);});
document.addEventListener('click',async e=>{
  const ep=e.target.closest('[data-episode]');if(ep){showEpisode(ep.dataset.episode);return;}
  const era=e.target.closest('[data-era]');if(era){setFilter('era',era.dataset.era);$('#era-tabs .active').focus({preventScroll:true});return;}
  const cat=e.target.closest('[data-category]');if(cat){state.category=cat.dataset.category;state.beyondLimit=8;render();$('#category-tabs .active').focus({preventScroll:true});return;}
  if(e.target.closest('[data-clear]')){clearFilters();return;}
  if(e.target.closest('[data-about]')){openAbout();return;}
  if(e.target.closest('#copy-episode')){try{await navigator.clipboard.writeText(`${location.origin}${location.pathname}#episode=${currentEpisode}`);notify('Episode link copied.');}catch{notify('Copy the episode link from your browser’s address bar.');}}
});
$('#episode-dialog .dialog-close').addEventListener('click',closeEpisode);$('#about-dialog .dialog-close').addEventListener('click',closeAbout);
$('#episode-dialog').addEventListener('cancel',e=>{e.preventDefault();closeEpisode();});$('#about-dialog').addEventListener('cancel',e=>{e.preventDefault();closeAbout();});
for(const selector of ['#episode-dialog','#about-dialog'])$(selector).addEventListener('click',e=>{if(e.target!==$(selector))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)(selector==='#episode-dialog'?closeEpisode:closeAbout)();});
window.addEventListener('hashchange',readHash);window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);state.q=p.get('q')||'';state.region=REGIONS.includes(p.get('region'))?p.get('region'):'all';state.era=ERAS.some(e=>e.id===p.get('era'))?p.get('era'):'all';state.view=p.get('view')==='index'?'index':'timeline';$('#search').value=state.q;$('#region').value=state.region;render();readHash();});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();$('#search').focus();$('#search').scrollIntoView({block:'center',behavior:motion()});}});
load();
