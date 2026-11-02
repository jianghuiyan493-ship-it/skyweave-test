/* Reference-inspired parametric ribbon surfaces, not inferred photo depth. */
(function(root){
  const defaults={turns:2.2,width:15,radius:35,height:165,separation:115,depthScale:.8};
  function build(count,options={}){
    const o={...defaults,...options};
    for(const k of Object.keys(defaults))if(!Number.isFinite(o[k]))throw Error('光带参数无效');
    count=Math.max(0,Math.min(10000,Math.round(count)));
    if(!Number.isFinite(count))throw Error('点数无效');
    const turns=Math.max(.25,Math.min(5,o.turns)),width=Math.max(1,Math.min(35,o.width));
    const radius=Math.max(5,Math.min(70,o.radius)),height=Math.max(30,Math.min(250,o.height));
    const separation=Math.max(40,Math.min(220,o.separation)),depth=Math.max(.2,Math.min(1.5,o.depthScale));
    const colors=['#2364ff','#eff2ff','#ff303a','#ffc56b'],points=[];
    // Four ruled surfaces: each has its own helical centerline and radial
    // width direction. Opposite phases cross in front projection, not in depth.
    for(let band=0;band<4;band++){
      const n=Math.floor(count/4)+(band<count%4?1:0);
      const cols=Math.max(1,Math.min(10,Math.floor(Math.sqrt(n/12))||1)),rows=Math.ceil(n/cols);
      for(let row=0;row<rows;row++){
        const rowCount=Math.min(cols,n-row*cols);
        const t=(row+.5)/rows,side=band<2?-1:1;
        const phase=(band%2)*Math.PI+side*.35;
        const a=side*(t*turns*Math.PI*2)+phase;
        const taper=.14+.86*Math.pow(1-t,.8);
        const centerX=side*(separation/2+38*(1-t)**3);
        for(let col=0;col<rowCount;col++){
          const across=rowCount===1?0:col/(rowCount-1)-.5;
          const r=(radius+across*width)*taper;
          points.push({x:centerX+r*Math.cos(a),y:r*Math.sin(a)*depth,
            z:t*height,color:colors[band]});
        }
      }
    }
    return points;
  }
  root.RibbonModel={build,defaults};
  if(typeof module!=='undefined')module.exports=root.RibbonModel;
})(globalThis);
