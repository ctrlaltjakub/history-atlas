// Build a hierarchy from close zoom to world view. Nearby cluster centres
// merge once per level; proximity chains cannot swallow a whole continent.
// Coordinates are projection-space pixels, independent of pan.
export function clusterPoints(points, scale=1, radius=42) {
  let clusters=[...points].sort((a,b)=>a.id.localeCompare(b.id)).map(point=>({
    id:point.id,items:[point],x:point.x,y:point.y,
    bounds:[[point.x,point.y],[point.x,point.y]]
  }));
  const target=Math.max(0,Math.floor(Math.log2(scale)));
  for(let level=Math.max(8,target);level>=target;level--){
    const distance=radius/2**level,cells=new Map(),visited=new Set(),next=[];
    const key=(x,y)=>x+','+y;
    clusters.forEach((cluster,index)=>{
      const cell=key(Math.floor(cluster.x/distance),Math.floor(cluster.y/distance));
      if(!cells.has(cell))cells.set(cell,[]);
      cells.get(cell).push(index);
    });
    clusters.forEach((seed,index)=>{
      if(visited.has(index))return;
      const cx=Math.floor(seed.x/distance),cy=Math.floor(seed.y/distance),members=[];
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
        for(const otherIndex of cells.get(key(cx+dx,cy+dy))||[]){
          if(visited.has(otherIndex))continue;
          const other=clusters[otherIndex];
          if(Math.hypot(seed.x-other.x,seed.y-other.y)<=distance){
            visited.add(otherIndex);members.push(other);
          }
        }
      }
      const items=members.flatMap(cluster=>cluster.items).sort((a,b)=>a.id.localeCompare(b.id));
      next.push({
        id:items.map(point=>point.id).join(','),items,
        x:items.reduce((sum,point)=>sum+point.x,0)/items.length,
        y:items.reduce((sum,point)=>sum+point.y,0)/items.length,
        bounds:[
          [Math.min(...items.map(point=>point.x)),Math.min(...items.map(point=>point.y))],
          [Math.max(...items.map(point=>point.x)),Math.max(...items.map(point=>point.y))]
        ]
      });
    });
    clusters=next.sort((a,b)=>a.id.localeCompare(b.id));
  }
  return clusters;
}

export function locationGroupLabel(items) {
  const labels=[...new Set(items.map(p=>p.episode.location?.label||'Worldwide'))];
  if(labels.length===1)return labels[0];
  const regions=[...new Set(items.map(p=>p.episode.region))];
  return regions.length===1?regions[0]:'Multiple locations';
}

export function groupZoom(cluster,width,height,current,max=256) {
  const [[x0,y0],[x1,y1]]=cluster.bounds;
  const spread=Math.max(x1-x0,y1-y0);
  const fit=spread<=0.01?Math.max(8,current*2):Math.max(current*2,Math.min(width*.65/Math.max(x1-x0,1),height*.65/Math.max(y1-y0,1)));
  const target=Math.min(max,2**Math.ceil(Math.log2(fit)));
  return {scale:target,canSeparate:spread>0.01&&current<max,coincident:spread<=0.01};
}
