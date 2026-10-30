import './vendor/d3.v7.9.0.min.js';
import './vendor/topojson-client.v3.1.0.min.js';
import {clusterPoints,locationGroupLabel,groupZoom,mapLayerTransform,placeCityLabels} from './map-core.mjs';
import {chronological} from './core.mjs';

const d3=globalThis.d3,topojson=globalThis.topojson;
const $=selector=>document.querySelector(selector);
const MAX_ZOOM=256,PAGE_SIZE=12;
const node=(tag,className,text)=>{
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
};

export class EpisodeMap {
  constructor({onItem,onEpisode,thumb}) {
    this.onItem=onItem;this.onEpisode=onEpisode;this.thumb=thumb;this.focusedEpisode=null;
    this.episodes=[];this.points=[];this.worldwide=[];this.selected=[];this.page=0;this.dataKey=null;
    this.surface=$('#map-surface');this.svg=d3.select('.map-drawing');this.geography=d3.select('.map-geography');
    this.world=this.geography.select('.map-world');this.labels=this.svg.select('.map-country-labels');
    this.cityLabels=this.svg.select('.map-city-labels');this.cityData=[];this.cityPoints=[];
    this.pins=d3.select('.map-pins');this.transform=d3.zoomIdentity;
    this.width=0;this.height=0;this.ready=false;this.frame=null;this.geographyTransform=null;this.commitGeography=true;
    this.zoom=d3.zoom().scaleExtent([1,MAX_ZOOM]).touchable(()=>true)
      .filter(event=>!event.target.closest('button')&&!event.button&&(event.type!=='wheel'||event.ctrlKey||event.metaKey))
      .on('zoom',event=>{this.transform=event.transform;this.requestDraw();})
      .on('end',()=>this.requestDraw(true));
    this.selection=d3.select(this.surface).call(this.zoom);
    $('#map-zoom-in').addEventListener('click',()=>this.selection.call(this.zoom.scaleBy,2));
    $('#map-zoom-out').addEventListener('click',()=>this.selection.call(this.zoom.scaleBy,.5));
    $('#map-reset').addEventListener('click',()=>{this.clearFocus();this.selection.call(this.zoom.transform,d3.zoomIdentity);this.closeList();});
    $('#map-focus-clear').addEventListener('click',()=>this.clearFocus());
    $('#map-worldwide').addEventListener('click',()=>this.openList(this.worldwide,'Worldwide','Series and single episodes without a single geographic setting.'));
    $('#map-selection-close').addEventListener('click',()=>this.closeList(true));
    $('#map-list-previous').addEventListener('click',()=>{this.page--;this.renderList();});
    $('#map-list-next').addEventListener('click',()=>{this.page++;this.renderList();});
    this.surface.addEventListener('keydown',event=>{
      if(event.target!==this.surface)return;
      const movement={ArrowLeft:[80,0],ArrowRight:[-80,0],ArrowUp:[0,80],ArrowDown:[0,-80]}[event.key];
      if(movement){event.preventDefault();this.selection.call(this.zoom.translateBy,movement[0]/this.transform.k,movement[1]/this.transform.k);}
      else if(['+','=','-','Home'].includes(event.key)){
        event.preventDefault();
        if(event.key==='Home'){this.clearFocus();this.selection.call(this.zoom.transform,d3.zoomIdentity);}
        else this.selection.call(this.zoom.scaleBy,event.key==='-'?.5:2);
      }
    });
    this.observer=new ResizeObserver(()=>this.resize());
    this.observer.observe(this.surface);
    this.load();
    this.loadCities();
  }

  async loadCities(){
    try{
      const response=await fetch('/data/map-cities.json');
      if(!response.ok)throw new Error('City labels HTTP '+response.status);
      this.cityData=await response.json();
      if(this.ready){this.projectCities();this.requestDraw();}
    }catch(error){console.warn('Optional city labels could not be loaded:',error);}
  }

  projectCities(){this.cityPoints=this.cityData.map(city=>{const [x,y]=this.projection(city.coordinates);return {...city,x,y};});this.labelCamera=null;}

  async load() {
    $('#map-message').hidden=false;$('#map-message').textContent='Loading map…';
    try {
      const response=await fetch('/data/world-countries.json');
      if(!response.ok)throw new Error('Map HTTP '+response.status);
      const topology=await response.json();
      this.land=topojson.feature(topology,topology.objects.land);
      this.borders=topojson.mesh(topology,topology.objects.countries,(a,b)=>a!==b);
      this.countries=topojson.feature(topology,topology.objects.countries).features;
      this.world.append('path').attr('class','map-ocean').datum({type:'Sphere'});
      this.world.append('path').attr('class','map-graticule').datum(d3.geoGraticule10());
      this.world.append('path').attr('class','map-land').datum(this.land);
      this.world.append('path').attr('class','map-borders').datum(this.borders);
      this.ready=true;this.resize(true);if(this.focusedEpisode)this.focusEpisode(this.focusedEpisode);
    } catch(error) {
      console.error('Map could not be loaded:',error);
      const message=$('#map-message');message.replaceChildren(node('p','','The map couldn’t be loaded.'));
      const retry=node('button','text-link','Try again');
      retry.addEventListener('click',()=>this.load());message.append(retry);
      const browse=node('button','text-link','Browse series and episodes');
      browse.addEventListener('click',()=>this.openList(this.episodes,'All matching series and episodes','The map is unavailable. Series and episode details still work.'));
      message.append(browse);
    }
  }

  setEpisodes(episodes) {
    const key=episodes.map(e=>e.id+':'+e.matches.map(m=>m.id).join(',')).join('|');
    if(key===this.dataKey)return;
    this.dataKey=key;this.episodes=episodes;this.focusedEpisode=null;$('#map-focus').hidden=true;
    this.worldwide=episodes.filter(e=>!e.location?.coordinates);
    const series=episodes.filter(e=>e.type==='series').length;
    $('#map-count').textContent=series+' series · '+(episodes.length-series)+' singles';
    const button=$('#map-worldwide');
    button.hidden=!this.worldwide.length;
    button.querySelector('span').textContent=this.worldwide.length;
    button.setAttribute('aria-label','Worldwide: '+this.worldwide.length+' series and singles without a single location');
    this.closeList();
    if(this.ready){this.projectPoints();this.selection.call(this.zoom.transform,d3.zoomIdentity);}
  }

  resize(force=false) {
    if(!this.ready)return;
    const width=this.surface.clientWidth,height=this.surface.clientHeight;
    if(!width||!height||(!force&&width===this.width&&height===this.height))return;
    const center=this.projection?.invert(this.transform.invert([this.width/2,this.height/2]));
    this.width=width;this.height=height;
    this.svg.attr('viewBox','0 0 '+width+' '+height);
    // A bounded margin lets the compositor move existing geography during a drag.
    this.geographyMargin=Math.ceil(Math.max(width,height)/4);
    const margin=this.geographyMargin;
    this.geography.attr('viewBox',`${-margin} ${-margin} ${width+2*margin} ${height+2*margin}`)
      .style('left',-margin+'px').style('top',-margin+'px')
      .style('width',width+2*margin+'px').style('height',height+2*margin+'px');
    this.geographyTransform=null;
    this.projection=d3.geoEqualEarth().fitExtent([[18,20],[width-18,height-20]],{type:'Sphere'});
    const path=d3.geoPath(this.projection);
    this.world.selectAll('path').attr('d',path);
    this.countryLabels=this.countries.map(country=>({
      name:country.properties.name,point:this.projection(d3.geoCentroid(country)),
      area:path.area(country)
    })).filter(country=>country.point.every(Number.isFinite));
    this.zoom.extent([[0,0],[width,height]]).translateExtent([[-width*.12,-height*.12],[width*1.12,height*1.12]]);
    this.projectPoints();
    this.projectCities();
    let transform=d3.zoomIdentity;
    if(center&&this.transform.k>1) {
      const projected=this.projection(center);
      transform=d3.zoomIdentity.translate(width/2,height/2).scale(this.transform.k).translate(-projected[0],-projected[1]);
    }
    this.selection.call(this.zoom.transform,transform);
  }

  projectPoints() {
    this.labelCamera=null;
    this.clustersByLevel=new Map();
    this.points=this.episodes.filter(e=>e.location?.coordinates&&!e.members.some(m=>m.id===this.focusedEpisode?.id)).map(episode=>{
      const [x,y]=this.projection(episode.location.coordinates);
      return {id:episode.id,x,y,episode};
    });
    if(this.focusedEpisode){const e=this.focusedEpisode,[x,y]=this.projection(e.location.coordinates);this.focusPoint={id:'focus:'+e.id,x,y,episode:{...e,type:'episode',color:'#6b2636'},targetEpisode:e.id};}else this.focusPoint=null;
  }

  focusEpisode(episode){
    this.focusedEpisode=episode;$('#map-focus').hidden=false;$('#map-focus-label').textContent=episode.title+' · '+episode.location.label;
    if(!this.ready)return;this.projectPoints();this.closeList();
    const [x,y]=this.projection(episode.location.coordinates);
    this.selection.call(this.zoom.transform,d3.zoomIdentity.translate(this.width/2,this.height/2).scale(16).translate(-x,-y));
    this.focusOnDraw=true;
  }
  clearFocus(){this.focusedEpisode=null;this.focusOnDraw=false;$('#map-focus').hidden=true;if(this.ready){this.projectPoints();this.requestDraw();}}

  requestDraw(commitGeography=false) {
    this.commitGeography ||= commitGeography;
    if(this.frame!==null)return;
    this.frame=requestAnimationFrame(()=>{this.frame=null;this.draw();});
  }

  drawGeography(t) {
    const camera=mapLayerTransform(t,this.geographyTransform,this.geographyMargin,this.commitGeography);
    if(camera.refresh){
      // Refresh vector detail at rest or before the cached margin runs out.
      this.world.attr('transform',t.toString());
      this.geography.style('transform','translate3d(0,0,0)');
      this.geographyTransform=t;this.commitGeography=false;
    }else this.geography.style('transform',`translate3d(${camera.x}px,${camera.y}px,0) scale(${camera.scale})`);
  }

  drawLabels(t,clusters) {
    const previous=this.labelCamera,margin=64;
    const dx=previous?t.x-previous.x:0,dy=previous?t.y-previous.y:0;
    if(previous&&t.k===previous.k&&Math.abs(dx)<margin/2&&Math.abs(dy)<margin/2){
      this.svg.style('transform',`translate3d(${dx}px,${dy}px,0)`);return;
    }
    this.svg.style('transform','translate3d(0,0,0)');this.labelCamera=t;
    const labels=t.k<2?[]:this.countryLabels.filter(c=>{
      const [x,y]=t.apply(c.point);
      return c.area*t.k*t.k>900&&x>-margin&&x<this.width+margin&&y>-margin&&y<this.height+margin;
    });
    this.labels.selectAll('text').data(labels,c=>c.name).join(enter=>enter.append('text').text(c=>c.name))
      .attr('transform',c=>`translate(${t.applyX(c.point[0])},${t.applyY(c.point[1])})`);
    const markers=this.focusPoint?[...clusters,this.focusPoint]:clusters;
    const obstacles=markers.map(c=>{const [x,y]=t.apply([c.x,c.y]);return [x-25+margin,y-25+margin,x+25+margin,y+25+margin];});
    for(const c of labels){const [x,y]=t.apply(c.point),w=c.name.length*3;obstacles.push([x-w+margin,y-10+margin,x+w+margin,y+5+margin]);}
    obstacles.push([this.width-65+margin,margin,this.width+margin,165+margin]);
    const camera={k:t.k,x:t.x+margin,y:t.y+margin};
    const cities=placeCityLabels(this.cityPoints,camera,this.width+2*margin,this.height+2*margin,obstacles);
    this.cityLabels.selectAll('g').data(cities,c=>c.id).join(enter=>{
      const city=enter.append('g');city.append('circle').attr('r',1.7);city.append('text').text(c=>c.name);return city;
    }).attr('transform',c=>`translate(${c.x-margin},${c.y-margin})`).select('text').attr('x',c=>c.labelX).attr('y',c=>c.labelY);
  }

  draw() {
    if(!this.ready)return;
    const t=this.transform;
    this.drawGeography(t);
    $('#map-zoom-level').textContent=Number(t.k.toFixed(1))+'×';
    $('#map-zoom-in').disabled=t.k>=MAX_ZOOM-.01;
    $('#map-zoom-out').disabled=t.k<=1.01;
    const message=$('#map-message');
    message.hidden=Boolean(this.points.length||this.focusPoint);
    if(!message.hidden)message.textContent=this.episodes.length?'These series and episodes have no single location. Select Worldwide to browse them.':'No series or episodes match the current filters.';
    const level=Math.floor(Math.log2(t.k));
    if(!this.clustersByLevel.has(level))this.clustersByLevel.set(level,clusterPoints(this.points,2**level,this.width<600?44:40));
    const clusters=this.clustersByLevel.get(level).filter(c=>{
      const [x,y]=t.apply([c.x,c.y]);
      return x>-24&&x<this.width+24&&y>-24&&y<this.height+24;
    });
    if(this.focusPoint){const p=this.focusPoint;clusters.push({id:p.id,items:[p],x:p.x,y:p.y,bounds:[[p.x,p.y],[p.x,p.y]]});}
    this.drawLabels(t,this.clustersByLevel.get(level));
    const self=this;
    this.pins.selectAll('button').data(clusters,c=>c.id).join(
      enter=>enter.append('button').attr('type','button')
        .on('click',(event,c)=>{this.hideTooltip();this.selectCluster(c,event.currentTarget);})
        .on('mouseenter',(event,c)=>this.showTooltip(c))
        .on('focus',(event,c)=>this.showTooltip(c))
        .on('mouseleave',()=>this.hideTooltip()).on('blur',()=>this.hideTooltip())
      .attr('class',c=>'map-pin '+(c.items.length===1?'map-pin-single'+(c.items[0].episode.type==='series'?' map-pin-series':'')+(c.items[0].targetEpisode?' map-pin-focused':''):'map-cluster'))
      .attr('data-focused',c=>c.items[0].targetEpisode?'true':null)
      .style('--series-color',c=>c.items.length===1?c.items[0].episode.color:'var(--wine)')
      .attr('aria-label',c=>c.items.length===1?'Open '+c.items[0].episode.title+(c.items[0].episode.type==='series'?', series of '+c.items[0].episode.members.length+' episodes':'')+' — '+locationGroupLabel(c.items):c.items.length+' series and singles · '+locationGroupLabel(c.items)+' · zoom or browse')
      .each(function(c){
        const button=this;
        if(button.dataset.contents===c.id)return;
        button.dataset.contents=c.id;button.replaceChildren();
        if(c.items.length===1) {
          const img=node('img');img.src=self.thumb(c.items[0].episode.image,90);img.alt='';img.width=32;img.height=32;img.loading='lazy';
          button.append(img);if(c.items[0].episode.type==='series')button.append(node('span','map-series-count',c.items[0].episode.members.length));
        } else button.textContent=c.items.length;
      }),
      update=>update,
      exit=>exit.remove()
    ).style('transform',c=>`translate3d(${t.applyX(c.x)}px,${t.applyY(c.y)}px,0) translate(-50%,-50%)`);
    if(this.focusOnDraw){this.focusOnDraw=false;this.pins.select('[data-focused]').node()?.focus({preventScroll:true});}
    this.hideTooltip();
  }

  showTooltip(cluster) {
    const tip=$('#map-tooltip'),[x,y]=this.transform.apply([cluster.x,cluster.y]);
    tip.textContent=cluster.items.length===1?cluster.items[0].episode.title+' · '+locationGroupLabel(cluster.items):cluster.items.length+' series & singles · '+locationGroupLabel(cluster.items);
    tip.style.left=Math.max(8,Math.min(this.width-268,x-130))+'px';
    tip.style.top=(y>90?y-34:y+30)+'px';
    tip.classList.toggle('above',y>90);tip.hidden=false;
  }
  hideTooltip(){const tip=$('#map-tooltip');if(!tip.hidden)tip.hidden=true;}

  selectCluster(cluster,button) {
    if(cluster.items.length===1){const point=cluster.items[0];if(point.targetEpisode)this.onEpisode(point.targetEpisode);else this.onItem(point.episode.id);return;}
    const target=groupZoom(cluster,this.width,this.height,this.transform.k,MAX_ZOOM);
    if((target.coincident&&this.transform.k>=8)||this.transform.k>=MAX_ZOOM-.01) {
      this.groupTrigger=button;
      this.openList(cluster.items.map(p=>p.episode),locationGroupLabel(cluster.items),
        target.coincident?'These series and episodes share an approximate location.':'Nearby series and episodes at the closest map zoom.');
      return;
    }
    const transform=d3.zoomIdentity.translate(this.width/2,this.height/2).scale(target.scale).translate(-cluster.x,-cluster.y);
    this.selection.call(this.zoom.transform,transform);
  }

  openList(episodes,title,note) {
    this.selected=[...episodes].sort(chronological);this.page=0;
    $('#map-selection-title').textContent=title;
    $('#map-selection-note').textContent=episodes.length+' series and singles · '+note;
    $('#map-selection').hidden=false;this.renderList();
    $('#map-selection-title').focus({preventScroll:true});
    $('#map-selection').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
  }
  closeList(returnFocus=false) {
    $('#map-selection').hidden=true;this.selected=[];this.page=0;
    if(returnFocus)(this.groupTrigger?.isConnected?this.groupTrigger:this.surface).focus({preventScroll:true});
  }
  renderList() {
    const list=$('#map-episode-list');list.replaceChildren();
    const start=this.page*PAGE_SIZE;
    for(const episode of this.selected.slice(start,start+PAGE_SIZE)) {
      const button=node('button','map-episode');
      button.setAttribute('aria-label','Open '+episode.title);
      const image=node('img');image.src=this.thumb(episode.image,100);image.alt='';image.width=40;image.height=40;image.loading='lazy';
      const text=node('span','map-episode-text');text.append(node('strong','',episode.title),node('span','',(episode.type==='series'?episode.members.length+' episodes · ':'')+episode.location.label+' · '+episode.dateLabel));
      button.append(image,text,node('span','map-episode-arrow','↗'));
      button.style.setProperty('--series-color',episode.color);button.classList.toggle('is-series',episode.type==='series');
      button.addEventListener('click',()=>this.onItem(episode.id));list.append(button);
    }
    $('#map-list-pagination').hidden=this.selected.length<=PAGE_SIZE;
    $('#map-list-previous').disabled=this.page===0;
    $('#map-list-next').disabled=start+PAGE_SIZE>=this.selected.length;
    $('#map-list-page').textContent=(start+1)+'–'+Math.min(start+PAGE_SIZE,this.selected.length)+' of '+this.selected.length;
  }
}
