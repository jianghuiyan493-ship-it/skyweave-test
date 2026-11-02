/* Fixed-position light cues; front-view matching ignores relief-depth drift. */
(function(root){
 function recommend(points){
  // One light per small front-view cell: a sampling estimate, not an optimality claim.
  const cells=new Set();
  for(const p of points)if(p.color!=='#000000'&&p.color!=='rgb(0,0,0)')cells.add(`${Math.round(p.x/1.8)},${Math.round(p.y/1.8)},${Math.round(p.z/1.8)}`);
  return Math.min(10000,cells.size);
 }
 function budget(frame,count){
  const wanted=frame.lightCount==null?recommend(frame.points):Number(frame.lightCount);
  if(!Number.isInteger(wanted)||wanted<0||wanted>10000)throw Error('每幕亮灯架数须为 0～10000 的整数');
  return Math.min(count,wanted,frame.points.length);
 }
 function build(frames,count,resample){
  const volumetric=frames.some(f=>['shell','solid'].includes(f.geometry?.mode));
  const order=p=>p.sort((a,b)=>a.x-b.x||a.z-b.z||a.y-b.y),result=[],t=1.8;
  function add(c,p){const k=`${Math.floor(p.x/t)},${Math.floor(p.z/t)},${volumetric?Math.floor(p.y/t):0}`;if(!c.has(k))c.set(k,[]);c.get(k).push(p);}
  function near(c,p){const x=Math.floor(p.x/t),z=Math.floor(p.z/t);let best=null,d=t*t;
   for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=volumetric?-1:0;dy<=(volumetric?1:0);dy++)for(const q of c.get(`${x+dx},${z+dz},${volumetric?Math.floor(p.y/t)+dy:0}`)||[]){const n=(p.x-q.x)**2+(p.z-q.z)**2+(volumetric?(p.y-q.y)**2:0);if(n<=d){best=q;d=n;}}return best;}
  for(let start=0;start<frames.length;){
   let end=start+1;while(end<frames.length&&frames[end].transitionMode==='lights')end++;
   if(end===start+1){
    const frame=frames[start],n=budget(frame,count);
    const lit=order(resample(frame.points,n)),slots=order(resample(frame.points,count));
    // Reserve the remainder as dark devices; no invented extra lit detail.
    const points=lit.concat(slots.slice(n).map(p=>({...p,color:'#000000'})));
    result.push({name:frame.name,transitionMode:'move',points,litCount:n,requestedCount:frame.lightCount??recommend(frame.points)});
   }
   else{const union=[],cells=new Map();for(let f=start;f<end;f++)for(const p of frames[f].points)if(!near(cells,p)){const q={...p};union.push(q);add(cells,q);}
    const slots=order(resample(union,count));
    for(let f=start;f<end;f++){const source=new Map();for(const p of frames[f].points)add(source,p);
     const points=slots.map(p=>({...p,color:near(source,p)?.color||'#000000'}));
     const eligible=points.map((p,i)=>p.color!=='#000000'?i:-1).filter(i=>i>=0);
     const n=Math.min(budget(frames[f],count),eligible.length);
     const selected=new Set(Array.from({length:n},(_,i)=>eligible[Math.floor((i+.5)*eligible.length/n)]));
     for(const i of eligible)if(!selected.has(i))points[i].color='#000000';
     result.push({name:frames[f].name,transitionMode:f===start?'move':'lights',points,litCount:n,requestedCount:frames[f].lightCount??recommend(frames[f].points)});}}
   start=end;
  }
  result.forEach((frame,i)=>{if(frames[i].transitionCue)frame.transitionCue=JSON.parse(JSON.stringify(frames[i].transitionCue));});
  return result;
 }
 root.SeriesLighting={build,recommend,budget};if(typeof module!=='undefined')module.exports=root.SeriesLighting;
})(globalThis);
