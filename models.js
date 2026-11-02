// Procedural surface point models, not depth inferred from a photograph.
// Split the widest occupied regions, then keep a real light near each centroid.
// Unlike array-stride sampling, this is independent of scan order and keeps
// spatially separated small subjects represented. It is not semantic detection.
function spatialLightSample(points,count){
  if(!count||!points.length)return [];
  if(count>=points.length)return points.map(p=>({...p}));
  let serial=0;
  function region(items){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const p of items)['x','y','z'].forEach((k,i)=>{min[i]=Math.min(min[i],p[k]);max[i]=Math.max(max[i],p[k]);});
    const spans=max.map((v,i)=>v-min[i]),axis=spans.indexOf(Math.max(...spans));
    return {items,axis,score:items.length>1?(spans[axis]+1e-9)*Math.sqrt(items.length):-1,id:serial++};
  }
  const heap=[],better=(a,b)=>a.score>b.score||a.score===b.score&&a.id<b.id;
  function push(a){heap.push(a);let i=heap.length-1;while(i){const p=(i-1)>>1;if(!better(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}}
  function pop(){const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&better(heap[c+1],heap[c]))c++;if(!better(heap[c],heap[i]))break;[heap[c],heap[i]]=[heap[i],heap[c]];i=c;}}return top;}
  push(region(points.slice()));
  while(heap.length<count){
    const node=pop(),key=['x','y','z'][node.axis];
    node.items.sort((a,b)=>a[key]-b[key]||a.x-b.x||a.z-b.z||a.y-b.y||a.color.localeCompare(b.color));
    const mid=node.items.length>>1;
    push(region(node.items.slice(0,mid)));push(region(node.items.slice(mid)));
  }
  return heap.map(({items})=>{
    const mean=[0,0,0];for(const p of items)['x','y','z'].forEach((k,i)=>mean[i]+=p[k]/items.length);
    let best=items[0],distance=Infinity;
    for(const p of items){const d=(p.x-mean[0])**2+(p.y-mean[1])**2+(p.z-mean[2])**2;if(d<distance){distance=d;best=p;}}
    return {...best};
  }).sort((a,b)=>a.x-b.x||a.z-b.z||a.y-b.y);
}
function budgetImageSource(points,count,options={}){
  const enabled=options.compactBudget===true;
  let source=points;
  if(enabled&&['shell','layered'].includes(options.mode)){
    const front=points.filter(p=>p.y===0);
    if(front.length&&count<points.length)source=front;
  }
  const scale=enabled&&source.length?Math.max(.4,Math.min(1,Math.sqrt(count/source.length))):1;
  return {source,scale};
}
function scaleLightPoints(points,scale){
  if(!points.length)return [];
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  return points.map(p=>({...p,x:cx+(p.x-cx)*scale,y:cy+(p.y-cy)*scale,z:p.z*scale}));
}
function resampleLightPoints(points,count) {
  if(!points.length||!count)return [];
  if(count<=points.length)return spatialLightSample(points,count);
  const used=new Set();
  return Array.from({length:count},(_,i)=>{
    const p=points[i%points.length], ring=Math.floor(i/points.length);
    const angle=ring*2.399963229728653+(i%points.length)*.73;
    // Added points preserve source color, but are synthetic local detail.
    const radius=ring ? .35*Math.sqrt(ring) : 0;
    const q={...p,x:p.x+Math.cos(angle)*radius,z:p.z+Math.sin(angle)*radius};
    let key=`${q.x.toFixed(5)},${q.y.toFixed(5)},${q.z.toFixed(5)}`;
    while(used.has(key)){
      q.x+=.0001;
      key=`${q.x.toFixed(5)},${q.y.toFixed(5)},${q.z.toFixed(5)}`;
    }
    used.add(key);return q;
  });
}
const ribbonSettings={turns:2.2,width:15,radius:35,height:165,separation:115,depthScale:.8};
function buildShowModel(kind, count) {
  if (!count) return [];
  if(kind==="ribbon")return RibbonModel.build(count,ribbonSettings);
  if(kind==="model")return resampleLightPoints(standaloneModel.points,count);
  if(kind==="image") {
    const prepared=budgetImageSource(upload.points,count,reconstructionOptions());
    upload.budgetScale=prepared.scale;
    return resampleLightPoints(scaleLightPoints(prepared.source,prepared.scale),count);
  }
  if(kind==="reference") {
    return Array.from({length:count},(_,i)=>{
      const p=referenceDots[Math.min(referenceDots.length-1,Math.floor((i+.5)*referenceDots.length/count))];
      return {x:p[0],y:p[1],z:p[2],color:`rgb(${p[3]},${p[4]},${p[5]})`};
    });
  }
  const points=[];
  if(kind==="rose"){
    // Curved, overlapping petal surfaces, arranged in four offset whorls.
    for(let layer=0;layer<4;layer++){
      const petals=9-layer, outer=58-layer*12;
      for(let petal=0;petal<petals;petal++){
        const angle=petal/petals*Math.PI*2+layer*.48;
        for(let row=0;row<16;row++)for(let col=0;col<40;col++){
          const v=.12+row/15*.88, u=(col/39-.5)*2;
          const theta=angle+u*(.40+.10*v);
          const r=outer*(.30+.70*v)*(1-.13*u*u);
          const z=layer*7+22*(1-v)**2+12*u*u*v-7*Math.sin(v*Math.PI);
          const edge=col<2||col>37||row===15;
          points.push({x:r*Math.cos(theta),y:r*Math.sin(theta),z,
            color:edge?"#ffdbf9":(layer%2?"#ff6edc":"#f127b2")});
        }
      }
    }
  } else if(kind==="city"){
    const buildings=[
      [-62,16,18,22,45],[-36,22,20,24,72],[-9,26,18,20,104],
      [18,25,17,21,124],[43,19,20,24,82],[68,12,16,19,56],
      [-57,-16,22,18,28],[-26,-12,22,22,52],[4,-14,20,24,86],
      [31,-16,19,19,60],[57,-19,18,17,35],
    ];
    buildings.forEach(([cx,cy,width,depth,height],b)=>{
      const perimeter=2*(width+depth), columns=Math.ceil(perimeter/1.7);
      const floors=Math.ceil(height/1.8);
      for(let floor=0;floor<=floors;floor++)for(let col=0;col<columns;col++){
        let d=col/columns*perimeter, x,y;
        if(d<width){x=-width/2+d;y=-depth/2;}
        else if((d-=width)<depth){x=width/2;y=-depth/2+d;}
        else if((d-=depth)<width){x=width/2-d;y=depth/2;}
        else {d-=width;x=-width/2;y=depth/2-d;}
        const edge=Math.min(Math.abs(x-width/2),Math.abs(x+width/2))<.7 &&
          Math.min(Math.abs(y-depth/2),Math.abs(y+depth/2))<.7;
        points.push({x:cx+x,y:cy+y,z:floor/floors*height,
          color:edge||floor===floors?"#ffffff": ["#cbdcff","#bbb9ff","#fff0c8"][b%3]});
      }
      // Roof ridges give a readable solid depth from overhead views.
      for(let k=0;k<=12;k++)points.push({x:cx-width/2+k/12*width,y:cy,z:height,color:"#ffffff"});
    });
  }
  if(!points.length)return [];
  // Midpoint stratification samples the entire model, never just its first rows.
  return Array.from({length:count},(_,i)=>points[Math.min(points.length-1,Math.floor((i+.5)*points.length/count))]);
}
