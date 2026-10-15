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
  function reconstruct(points,aspect,options={}){
    const dots=cleanPoints(points,aspect,options);
    const field=buildField(dots,aspect,options);
    const depth=Math.max(0,Number(options.depth??32)),mode=options.mode??"contour";
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
