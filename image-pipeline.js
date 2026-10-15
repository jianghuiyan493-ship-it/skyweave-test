/* Browser/Node shared, deterministic pixel pipeline. No network or semantic AI. */
(function(root) {
  // Conservative bottom-connected light-field rejection; not semantic object recognition.
  // Selection rectangles are normalized to the original image, never to a cropped preview.
  function prepareSubject(data,width,height,options={}){
    const upper=options.imageMode==="upper";
    const upperLimit=Math.max(.3,Math.min(1,Number(options.upperLimit??65)/100));
    const vivid=Math.max(0,Math.min(.8,Number(options.vividStrength??25)/100));
    if(!upper&&!options.cityFilter&&!options.subjectKeep&&!options.subjectExclude?.length)return {data,mask:new Uint8Array(width*height),groups:0,suppressed:0};
    const cell=Math.max(4,Math.ceil(Math.max(width,height)/100)),cols=Math.ceil(width/cell),rows=Math.ceil(height/cell);
    const occupied=new Uint8Array(cols*rows),count=new Uint32Array(cols*rows),white=new Uint32Array(cols*rows);
    const keep=options.subjectKeep,exclude=options.subjectExclude||[];
    const inRect=(x,y,r)=>x>=r.x&&y>=r.y&&x<=r.x+r.w&&y<=r.y+r.h;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const p=(y*width+x)*4;
      if(data[p+3]<100)continue;
      const max=Math.max(data[p],data[p+1],data[p+2]),min=Math.min(data[p],data[p+1],data[p+2]);
      if(max<85)continue;
      const i=Math.floor(y/cell)*cols+Math.floor(x/cell);
      count[i]++;if(max-min<max*.35)white[i]++;
    }
    for(let i=0;i<count.length;i++)occupied[i]=count[i]>=Math.max(2,cell*cell*.015)?1:0;
    // Bridge small gaps between building windows at coarse scale.
    const joined=new Uint8Array(occupied.length);
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const i=y*cols+x;if(!occupied[i])continue;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
        if(x+dx>=0&&x+dx<cols&&y+dy>=0&&y+dy<rows)joined[(y+dy)*cols+x+dx]=1;
    }
    const visited=new Uint8Array(joined.length),city=new Uint8Array(joined.length);
    let groups=0;
    if(options.cityFilter){
      for(let start=0;start<joined.length;start++){
        if(!joined[start]||visited[start])continue;
        const queue=[start];visited[start]=1;
        let bottom=false,minX=cols,maxX=0,minY=rows,maxY=0,n=0,pale=0,lit=0;
        for(let head=0;head<queue.length;head++){
          const i=queue[head],x=i%cols,y=Math.floor(i/cols);
          minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
          if(occupied[i]){n++;lit+=count[i];pale+=white[i];if(y>=rows*.90)bottom=true;}
          for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const nx=x+dx,ny=y+dy,j=ny*cols+nx;
            if(nx>=0&&nx<cols&&ny>=0&&ny<rows&&joined[j]&&!visited[j]){visited[j]=1;queue.push(j);}
          }
        }
        const box=(maxX-minX+1)*(maxY-minY+1);
        // Abstain for high-reaching or sparse clusters: these may be a full show silhouette.
        if(bottom&&minY>rows*.35&&maxX-minX>cols*.12&&maxY-minY>rows*.1&&n/box>.22&&pale/Math.max(1,lit)>.48){
          groups++;for(const i of queue)city[i]=1;
        }
      }
    }
    const output=new Uint8ClampedArray(data),mask=new Uint8Array(width*height);
    let suppressed=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x,u=x/width,v=y/height;
      // Explicit subject box protects selected content from automatic rejection.
      const autoRemoved=!keep&&city[Math.floor(y/cell)*cols+Math.floor(x/cell)];
      let faintColor=false;
      if(upper&&!keep&&v<upperLimit&&vivid>0){
        const p=i*4,max=Math.max(data[p],data[p+1],data[p+2]),min=Math.min(data[p],data[p+1],data[p+2]);
        faintColor=(max-min)/Math.max(1,max)<vivid;
        // Keep a white-hot core when its immediate halo is colored.
        if(faintColor&&max>=85){
          for(let dy=-2;dy<=2&&faintColor;dy++)for(let dx=-2;dx<=2;dx++){
            const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height||ny/height>=upperLimit)continue;
            const j=(ny*width+nx)*4,m=Math.max(data[j],data[j+1],data[j+2]);
            if(data[j+3]>100&&m>=max*.55&&(m-Math.min(data[j],data[j+1],data[j+2]))/Math.max(1,m)>=vivid){faintColor=false;break;}
          }
        }
      }
      const remove=autoRemoved||(!keep&&upper&&(v>=upperLimit||faintColor))||(keep&&!inRect(u,v,keep))||exclude.some(r=>inRect(u,v,r));
      if(remove){mask[i]=1;if(output[i*4+3]>100&&Math.max(output[i*4],output[i*4+1],output[i*4+2])>=85)suppressed++;output[i*4+3]=0;}
    }
    return {data:output,mask,groups,suppressed,upper:upper&&!keep,upperLimit,vivid};
  }
  function extract(data,width,height,options={}) {
    const threshold=options.threshold??135, crop=Math.max(0,Math.min(40,options.crop??0));
    const h=Math.max(1,Math.floor(height*(1-crop/100))), size=width*h;
    const keepWhite=options.keepWhite!==false;
    const gap=Math.max(1.5,Math.min(8,options.gap??3));
    const raw=new Float32Array(size),light=new Float32Array(size), integral=new Float64Array((width+1)*(h+1));
    const hist=new Uint32Array(256);
    for(let i=0;i<size;i++){
      const p=i*4;raw[i]=data[p+3]>100?Math.max(data[p],data[p+1],data[p+2]):0;hist[raw[i]]++;
    }
    const quantile=q=>{let sum=0;for(let k=0;k<256;k++){sum+=hist[k];if(sum>=size*q)return k;}return 255;};
    const black=options.normalize?quantile(.5):0;
    const gain=options.normalize?Math.max(.5,Math.min(4,255/Math.max(40,quantile(.995)-black))):1;
    const stride=width+1;
    for(let y=0;y<h;y++){
      let row=0;
      for(let x=0;x<width;x++){
        const i=y*width+x,p=i*4;
        light[i]=Math.min(255,Math.max(0,(raw[i]-black)*gain));
        row+=light[i];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
      }
    }
    const candidates=[];
    for(let y=0;y<h;y++)for(let x=0;x<width;x++){
      const i=y*width+x, p=i*4, v=light[i];
      if(v<Math.max(35,threshold*.55))continue;
      const min=Math.min(data[p],data[p+1],data[p+2]);
      if(!keepWhite && raw[i]-min<45)continue;
      const x0=Math.max(0,x-7),x1=Math.min(width,x+8),y0=Math.max(0,y-7),y1=Math.min(h,y+8);
      const mean=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0));
      const contrast=v-mean;
      if(contrast<Math.max(10,threshold*.10))continue;
      let peak=v;
      for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&nx<width&&ny>=0&&ny<h)peak=Math.max(peak,light[ny*width+nx]);
      }
      // Reject a dot's dim halo; never delete a whole connected line.
      if(v<peak*.78)continue;
      const at=(dx,dy)=>light[Math.max(0,Math.min(h-1,y+dy))*width+Math.max(0,Math.min(width-1,x+dx))];
      const ridge=(v>=at(-1,0)&&v>=at(1,0)) || (v>=at(0,-1)&&v>=at(0,1));
      if(!ridge)continue;
      candidates.push({x,y,score:contrast+v*.2});
    }
    candidates.sort((a,b)=>b.score-a.score||a.y-b.y||a.x-b.x);
    const blocked=new Uint8Array(size),dots=[],radius=Math.ceil(gap);
    for(const c of candidates){
      if(blocked[c.y*width+c.x])continue;
      const i=(c.y*width+c.x)*4, peak=raw[c.y*width+c.x];
      let r=data[i],g=data[i+1],b=data[i+2];
      let chroma=(Math.max(r,g,b)-Math.min(r,g,b))/Math.max(1,Math.max(r,g,b));
      // A warm/blue light often has a white hot core. Read chroma nearby.
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        if(dx*dx+dy*dy>4)continue;
        const nx=c.x+dx,ny=c.y+dy;if(nx<0||nx>=width||ny<0||ny>=h)continue;
        const p=(ny*width+nx)*4,m=Math.max(data[p],data[p+1],data[p+2]);
        const sat=(m-Math.min(data[p],data[p+1],data[p+2]))/Math.max(1,m);
        if(data[p+3]>100&&m>=peak*.65&&sat>chroma+.03){
          const gain=peak/m;r=Math.min(255,Math.round(data[p]*gain));g=Math.min(255,Math.round(data[p+1]*gain));b=Math.min(255,Math.round(data[p+2]*gain));chroma=sat;
        }
      }
      dots.push({u:c.x/width,v:c.y/h,r,g,b});
      for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
        if(dx*dx+dy*dy>gap*gap)continue;
        const nx=c.x+dx,ny=c.y+dy;if(nx>=0&&nx<width&&ny>=0&&ny<h)blocked[ny*width+nx]=1;
      }
    }
    dots.sort((a,b)=>a.v-b.v||a.u-b.u);
    return {dots,aspect:width/h,calibration:{black,gain}};
  }
  function relief(dots,aspect,depth=32) {
    return dots.map(p=>{
      // Rule-based colored layers, intentionally not a claim of recovered depth.
      const blue=p.b>p.r*1.35 && Math.min(p.r,p.g,p.b)<=135;
      const localCurve=Math.cos((p.u-.5)*Math.PI*2)*Math.sin(p.v*Math.PI);
      const y=depth*(blue ? .65+.18*Math.sin(p.u*7)+.1*Math.cos(p.v*6) :
        -.35-.27*localCurve-.12*Math.cos(p.u*12));
      return {x:(p.u-.5)*210,y,z:(1-p.v)*210/aspect,color:`rgb(${p.r},${p.g},${p.b})`};
    });
  }
  root.ImagePipeline={extract,relief,prepareSubject};
  if(typeof module!=="undefined")module.exports=root.ImagePipeline;
})(globalThis);
