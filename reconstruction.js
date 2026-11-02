/* Geometry-only relief reconstruction. A shape prior, not recovered physical depth. */
(function(root){
  function cleanPoints(points,aspect,options={}){
    if(!options.denoise || points.length<6)return points.slice();
    const radius=options.noiseRadius??.022;
    const cell=radius,grid=new Map();
    points.forEach((p,i)=>{
      const key=`${Math.floor(p.u/cell)},${Math.floor(p.v/aspect/cell)}`;
      if(!grid.has(key))grid.set(key,[]);
      grid.get(key).push(i);
    });
    return points.filter((p,i)=>{
      const x=Math.floor(p.u/cell),y=Math.floor(p.v/aspect/cell);
      let neighbors=0;
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
        for(const j of grid.get(`${x+dx},${y+dy}`)||[]){
          if(i!==j&&Math.hypot(p.u-points[j].u,(p.v-points[j].v)/aspect)<=radius)neighbors++;
          if(neighbors>=2)return true;
        }
      }
      return false;
    });
  }
  function buildField(points,aspect,options={}){
    const width=aspect>=1?192:Math.max(24,Math.round(192*aspect));
    const height=aspect>=1?Math.max(24,Math.round(192/aspect)):192;
    const size=width*height,mask=new Uint8Array(size);
    const join=Math.max(1,Math.min(8,options.join??3));
    if(options.subjectMask){
      const source=options.subjectMask;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const sx=Math.min(source.width-1,Math.floor(x/(width-1)*(source.width-1)));
        const sy=Math.min(source.height-1,Math.floor(y/(height-1)*(source.height-1)));
        mask[y*width+x]=source.mask[sy*source.width+sx]?1:0;
      }
    } else for(const p of points){
      const x=Math.round(p.u*(width-1)),y=Math.round(p.v*(height-1));
      for(let dy=-join;dy<=join;dy++)for(let dx=-join;dx<=join;dx++){
        if(dx*dx+dy*dy>join*join)continue;
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&nx<width&&ny>=0&&ny<height)mask[ny*width+nx]=1;
      }
    }
    if(options.fillHoles!==false&&!options.subjectMask){
      const outside=new Uint8Array(size),queue=new Int32Array(size);let head=0,tail=0;
      const add=(x,y)=>{
        if(x<0||x>=width||y<0||y>=height)return;
        const i=y*width+x;
        if(!mask[i]&&!outside[i]){outside[i]=1;queue[tail++]=i;}
      };
      for(let x=0;x<width;x++){add(x,0);add(x,height-1);}
      for(let y=0;y<height;y++){add(0,y);add(width-1,y);}
      while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);}
      for(let i=0;i<size;i++)if(!outside[i])mask[i]=1;
    }
    // Chamfer distance to background, used as an explicit inflation prior.
    let distance=new Float32Array(size);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;
      distance[i]=mask[i]?Math.min(x+1,y+1,width-x,height-y):0;
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;if(!mask[i])continue;
      if(x)distance[i]=Math.min(distance[i],distance[i-1]+1);
      if(y)distance[i]=Math.min(distance[i],distance[i-width]+1);
      if(x&&y)distance[i]=Math.min(distance[i],distance[i-width-1]+1.4142);
    }
    for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
      const i=y*width+x;if(!mask[i])continue;
      if(x+1<width)distance[i]=Math.min(distance[i],distance[i+1]+1);
      if(y+1<height)distance[i]=Math.min(distance[i],distance[i+width]+1);
      if(x+1<width&&y+1<height)distance[i]=Math.min(distance[i],distance[i+width+1]+1.4142);
    }
    const smooth=Math.max(0,Math.min(12,Math.round(options.smooth??4)));
    for(let pass=0;pass<smooth;pass++){
      const next=new Float32Array(size);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=y*width+x;if(!mask[i])continue;
        let sum=distance[i]*4,n=4;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=x+dx,ny=y+dy;
          if(nx>=0&&nx<width&&ny>=0&&ny<height){sum+=distance[ny*width+nx];n++;}
        }
        next[i]=sum/n;
      }
      distance=next;
    }
    const max=Math.max(1,...distance);
    const values=Float32Array.from(distance,d=>Math.sqrt(d/max));
    return {width,height,mask,values};
  }
  function volumePoints(dots,aspect,field,options){
    if(!dots.length)return [];
    const depth=Math.max(0,Math.min(160,Number(options.depth??10)));
    const budget=Math.max(0,Math.min(10000,Math.round(Number(options.volumeBudget??6000))));
    if(!budget)return [];
    const {width,height,mask,values}=field,size=width*height;
    const color=p=>options.monochrome?"#d9ebff":`rgb(${p.r},${p.g},${p.b})`;
    const position=(p,y)=>({x:(p.u-.5)*210,y,z:(1-p.v)*210/aspect,color:color(p)});
    // A single photograph cannot recover a back surface. Keep the extracted lights
    // in their exact front positions; never replace facial/detail pixels with a
    // filled silhouette. The thin rear/edge are explicitly just a shape cue.
    if(options.mode==="shell"){
      const pick=(items,n)=>n>=items.length?items.slice():Array.from({length:n},(_,i)=>items[Math.floor((i+.5)*items.length/n)]);
      if(depth===0)return pick(dots,budget).map(p=>position(p,0));
      const frontLimit=Math.max(1,Math.ceil(budget*.9));
      const front=pick(dots,Math.min(dots.length,frontLimit)).map(p=>position(p,0));
      const remaining=budget-front.length;
      if(!remaining)return front;
      const backCount=Math.min(dots.length,remaining,Math.ceil(front.length*.075));
      const back=pick(dots,backCount).map(p=>position(p,depth));
      const edgeLimit=Math.min(remaining-back.length,Math.ceil(front.length*.04));
      if(!edgeLimit)return front.concat(back);
      const edges=[];
      for(let i=0;i<size;i++){
        if(!mask[i])continue;
        const x=i%width,y=Math.floor(i/width);
        if(x===0||x===width-1||y===0||y===height-1||
          !mask[i-1]||!mask[i+1]||!mask[i-width]||!mask[i+width])edges.push(i);
      }
      // Color comes from the nearest original light, never from a newly filled face.
      const owner=new Int32Array(size).fill(-1),queue=new Int32Array(size);let head=0,tail=0;
      dots.forEach((p,k)=>{
        const x=Math.max(0,Math.min(width-1,Math.round(p.u*(width-1))));
        const y=Math.max(0,Math.min(height-1,Math.round(p.v*(height-1)))),i=y*width+x;
        if(owner[i]<0){owner[i]=k;queue[tail++]=i;}
      });
      while(head<tail){
        const i=queue[head++],x=i%width,y=Math.floor(i/width);
        for(const j of [x?i-1:-1,x+1<width?i+1:-1,y?i-width:-1,y+1<height?i+width:-1])
          if(j>=0&&owner[j]<0){owner[j]=owner[i];queue[tail++]=j;}
      }
      const side=pick(edges,Math.min(edges.length,edgeLimit)).map((i,k)=>{
        const x=i%width,y=Math.floor(i/width),p=dots[owner[i]];
        return {x:(x/(width-1)-.5)*210,y:depth*(k%2?.35:.7),
          z:(1-y/(height-1))*210/aspect,color:color(p)};
      });
      return front.concat(back,side);
    }
    // Multi-source propagation assigns source colors without quadratic nearest-point searches.
    const owner=new Int32Array(size).fill(-1),queue=new Int32Array(size);let head=0,tail=0;
    dots.forEach((p,k)=>{
      const x=Math.max(0,Math.min(width-1,Math.round(p.u*(width-1)))),y=Math.max(0,Math.min(height-1,Math.round(p.v*(height-1)))),i=y*width+x;
      if(owner[i]<0){owner[i]=k;queue[tail++]=i;}
    });
    while(head<tail){
      const i=queue[head++],x=i%width,y=Math.floor(i/width);
      for(const j of [x?i-1:-1,x+1<width?i+1:-1,y?i-width:-1,y+1<height?i+width:-1])
        if(j>=0&&owner[j]<0){owner[j]=owner[i];queue[tail++]=j;}
    }
    const candidates=[];
    for(let i=0;i<size;i++){
      if(!mask[i])continue;
      const x=i%width,y=Math.floor(i/width),p=dots[owner[i]];
      const boundary=x===0||x===width-1||y===0||y===height-1||!mask[i-1]||!mask[i+1]||!mask[i-width]||!mask[i+width];
      const half=depth*.5*(.18+.82*values[i]);
      const levels=depth===0?[0]:(options.mode==="solid"||boundary)?[-1,-.5,0,.5,1]:[-1,1];
      for(const fraction of levels)candidates.push({
        x:(x/(width-1)-.5)*210,y:half*fraction,z:(1-y/(height-1))*210/aspect,
        color:options.monochrome?"#d9ebff":`rgb(${p.r},${p.g},${p.b})`
      });
    }
    // Deterministic spatial mixing distributes a bounded point budget over both faces and sides.
    const hash=i=>{let n=Math.imul(i+1,0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;};
    const indices=Array.from({length:candidates.length},(_,i)=>i).sort((a,b)=>hash(a)-hash(b)||a-b);
    return indices.slice(0,budget).map(i=>candidates[i]);
  }
  function layeredPoints(dots,aspect,options){
    if(!dots.length)return [];
    const depth=Math.max(0,Math.min(80,Number(options.depth??10)));
    const budget=Math.max(0,Math.min(10000,Math.round(Number(options.volumeBudget??6000))));
    if(!budget)return [];
    const color=p=>options.monochrome?"#d9ebff":`rgb(${p.r},${p.g},${p.b})`;
    const frontCount=Math.min(dots.length,budget);
    const stride=Math.max(1,Math.ceil(dots.length/frontCount));
    const front=[];
    for(let i=0;i<dots.length&&front.length<frontCount;i+=stride){
      const p=dots[i];
      front.push({x:(p.u-.5)*210,y:0,z:(1-p.v)*210/aspect,color:color(p)});
    }
    // Preserve the readable front plane. Only duplicate a small, deterministic
    // subset of wide-spaced accents into two shallow structural layers.
    const spare=budget-front.length;
    if(depth===0||spare<=0)return front;
    const accents=[];
    const accentCount=Math.min(spare,Math.max(1,Math.floor(front.length*.12)));
    const accentStride=Math.max(1,Math.floor(dots.length/accentCount));
    for(let i=0;i<dots.length&&accents.length<accentCount;i+=accentStride){
      const p=dots[i],layer=accents.length%2;
      accents.push({x:(p.u-.5)*210,y:depth*(layer?-.42:.42),z:(1-p.v)*210/aspect,color:color(p)});
    }
    return front.concat(accents);
  }
  function reconstruct(points,aspect,options={}){
    if(!Number.isFinite(aspect)||aspect<=0)throw Error("图像比例无效");
    const dots=cleanPoints(points,aspect,options);
    const field=buildField(dots,aspect,options);
    const depth=Math.max(0,Number(options.depth??10)),mode=options.mode??"contour";
    if(mode==="layered"){
      return {points:layeredPoints(dots,aspect,options),dots,field,removed:points.length-dots.length,generated:true};
    }
    if(mode==="shell"||mode==="solid"){
      return {points:volumePoints(dots,aspect,field,options),dots,field,removed:points.length-dots.length,generated:true};
    }
    const positions=dots.map(p=>{
      const x=Math.min(field.width-1,Math.max(0,Math.round(p.u*(field.width-1))));
      const y=Math.min(field.height-1,Math.max(0,Math.round(p.v*(field.height-1))));
      const inflation=field.values[y*field.width+x];
      return {x:(p.u-.5)*210,y:mode==="flat"?0:-depth*inflation,z:(1-p.v)*210/aspect,
        color:options.monochrome?"#d9ebff":`rgb(${p.r},${p.g},${p.b})`};
    });
    return {points:positions,dots,field,removed:points.length-dots.length};
  }
  root.Reconstruction={reconstruct,buildField,cleanPoints};
  if(typeof module!=="undefined")module.exports=root.Reconstruction;
})(globalThis);
