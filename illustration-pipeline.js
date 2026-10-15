/* Ordinary artwork -> foreground, contour and color-area samples.
   Border-color flood fill is not semantic segmentation. */
(function(root){
  function detect(data,width,height){
    let dark=0,opaque=0,transparent=0,total=0;
    for(let i=0;i<width*height;i+=17){
      total++;
      if(data[i*4+3]<100){transparent++;continue;}
      opaque++;if(Math.max(data[i*4],data[i*4+1],data[i*4+2])<85)dark++;
    }
    if(!opaque)return "lights";
    return transparent/total>.12 || dark/opaque<.60 ? "illustration":"lights";
  }
  function extract(data,width,height,options={}){
    const crop=Math.max(0,Math.min(40,options.crop??0));
    const h=Math.max(1,Math.floor(height*(1-crop/100))),size=width*h;
    const tolerance=Math.max(5,Math.min(120,options.bgTolerance??45));
    const budget=Math.max(50,Math.min(10000,Math.round(options.budget??8000)));
    const histogram=new Map();
    const border=(x,y)=>{
      const p=(y*width+x)*4;if(data[p+3]<100)return;
      const key=`${data[p]>>4},${data[p+1]>>4},${data[p+2]>>4}`;
      if(!histogram.has(key))histogram.set(key,{n:0,r:0,g:0,b:0});
      const c=histogram.get(key);c.n++;c.r+=data[p];c.g+=data[p+1];c.b+=data[p+2];
    };
    for(let x=0;x<width;x+=3){border(x,0);border(x,h-1);}
    for(let y=0;y<h;y+=3){border(0,y);border(width-1,y);}
    const common=Array.from(histogram.values()).sort((a,b)=>b.n-a.n)[0];
    const bg=common?[common.r/common.n,common.g/common.n,common.b/common.n]:[0,0,0];
    const possible=new Uint8Array(size),background=new Uint8Array(size),queue=new Int32Array(size);
    for(let i=0;i<size;i++){
      const p=i*4;
      possible[i]=data[p+3]<100 || (options.removeBackground!==false &&
        Math.hypot(data[p]-bg[0],data[p+1]-bg[1],data[p+2]-bg[2])<tolerance) ? 1:0;
    }
    let head=0,tail=0;
    const seed=i=>{if(!background[i]&&possible[i]){background[i]=1;queue[tail++]=i;}};
    for(let x=0;x<width;x++){seed(x);seed((h-1)*width+x);}
    for(let y=1;y<h-1;y++){seed(y*width);seed(y*width+width-1);}
    while(head<tail){
      const i=queue[head++],x=i%width,y=Math.floor(i/width);
      if(x)seed(i-1);if(x+1<width)seed(i+1);if(y)seed(i-width);if(y+1<h)seed(i+width);
    }
    const mask=new Uint8Array(size),visited=new Uint8Array(size);
    for(let i=0;i<size;i++)mask[i]=!background[i]&&data[i*4+3]>100?1:0;
    // Remove tiny disconnected paper-texture islands, not dark details inside the subject.
    const minComponent=Math.max(3,Math.floor(size*.00012));
    for(let start=0;start<size;start++){
      if(!mask[start]||visited[start])continue;
      head=0;tail=1;queue[0]=start;visited[start]=1;
      while(head<tail){
        const i=queue[head++],x=i%width,y=Math.floor(i/width);
        for(const j of [x?i-1:-1,x+1<width?i+1:-1,y?i-width:-1,y+1<h?i+width:-1]){
          if(j>=0&&mask[j]&&!visited[j]){visited[j]=1;queue[tail++]=j;}
        }
      }
      if(tail<minComponent)for(let j=0;j<tail;j++)mask[queue[j]]=0;
    }
    let area=0;for(const v of mask)area+=v;
    if(!area)return {dots:[],aspect:width/h,mask,width,height:h,background:bg,mode:"illustration"};
    // Smooth RGB for edge ranking; never threshold the subject by brightness.
    const smooth=new Float32Array(size*3);
    for(let y=0;y<h;y++)for(let x=0;x<width;x++){
      const i=y*width+x;if(!mask[i])continue;
      let r=0,g=0,b=0,n=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=Math.max(0,Math.min(width-1,x+dx)),ny=Math.max(0,Math.min(h-1,y+dy)),p=(ny*width+nx)*4;
        r+=data[p];g+=data[p+1];b+=data[p+2];n++;
      }
      smooth[i*3]=r/n;smooth[i*3+1]=g/n;smooth[i*3+2]=b/n;
    }
    const edges=[];
    for(let y=1;y<h-1;y++)for(let x=1;x<width-1;x++){
      const i=y*width+x;if(!mask[i])continue;
      const boundary=!mask[i-1]||!mask[i+1]||!mask[i-width]||!mask[i+width];
      const l=Math.max(0,x-2)+y*width,r=Math.min(width-1,x+2)+y*width;
      const top=Math.max(0,y-2)*width+x,bottom=Math.min(h-1,y+2)*width+x;
      const delta=(a,b)=>Math.hypot(smooth[a*3]-smooth[b*3],smooth[a*3+1]-smooth[b*3+1],smooth[a*3+2]-smooth[b*3+2]);
      const gradient=Math.max(delta(l,r),delta(top,bottom));
      if(boundary)edges.push({x,y,score:500,boundary:true});
      else if(mask[l]&&mask[r]&&mask[top]&&mask[bottom]&&gradient>28)
        edges.push({x,y,score:gradient,boundary:false});
    }
    edges.sort((a,b)=>b.score-a.score||a.y-b.y||a.x-b.x);
    const dots=[],occupied=new Uint8Array(size);
    const edgeRadius=Math.max(2,Math.min(5,options.gap??3));
    const add=(x,y,radius)=>{
      const i=y*width+x;if(!mask[i]||occupied[i]||dots.length>=budget)return false;
      const p=i*4;dots.push({u:x/width,v:y/h,r:data[p],g:data[p+1],b:data[p+2]});
      const R=Math.ceil(radius);
      for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
        const nx=x+dx,ny=y+dy;
        if(nx>=0&&nx<width&&ny>=0&&ny<h&&dx*dx+dy*dy<=radius*radius)occupied[ny*width+nx]=1;
      }
      return true;
    };
    const outlineBudget=Math.floor(budget*.22),edgeBudget=Math.floor(budget*.6);
    // Reserve separate capacity for eyes, face and clothing boundaries.
    // A long outer silhouette must not consume the whole contour budget.
    for(const e of edges){if(dots.length>=outlineBudget)break;if(e.boundary)add(e.x,e.y,edgeRadius);}
    for(const e of edges){if(dots.length>=edgeBudget)break;if(!e.boundary)add(e.x,e.y,edgeRadius);}
    const fillStep=Math.max(2,Math.sqrt(area/Math.max(1,budget-dots.length)));
    // Area samples retain clothing, dark eyes and other solid colored regions.
    for(let pass=0;pass<3&&dots.length<budget;pass++){
      const step=Math.max(2,fillStep/(1+pass*.3));
      for(let row=0,y=step/2;y<h&&dots.length<budget;y+=step*.866,row++){
        for(let x=step/2+(row%2)*step/2;x<width&&dots.length<budget;x+=step){
          add(Math.floor(x),Math.floor(y),step*.65);
        }
      }
    }
    dots.sort((a,b)=>a.v-b.v||a.u-b.u);
    return {dots,aspect:width/h,mask,width,height:h,background:bg,mode:"illustration",
      foregroundFraction:area/size};
  }
  root.IllustrationPipeline={extract,detect};
  if(typeof module!=="undefined")module.exports=root.IllustrationPipeline;
})(globalThis);
