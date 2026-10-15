// Procedural surface point models, not depth inferred from a photograph.
function resampleLightPoints(points,count) {
  if(!points.length||!count)return [];
  if(count<=points.length)return Array.from({length:count},(_,i)=>({
    ...points[Math.floor((i+.5)*points.length/count)]
  }));
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
function buildShowModel(kind, count) {
  if (!count) return [];
  if(kind==="model")return resampleLightPoints(standaloneModel.points,count);
  if(kind==="image") {
    return resampleLightPoints(upload.points,count);
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
