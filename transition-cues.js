/* Local, explicit command grammar. Not a semantic AI or a flight planner. */
(function(root){
  function parse(text){
    const s=String(text).trim();
    if(!s)throw Error('请填写转场描述。');
    const kinds=[];
    if(/只变灯光|只亮|保持队形|原地渐变/.test(s))kinds.push('lights');
    if(/直线|平滑变换/.test(s))kinds.push('move');
    if(/弧线|绕弧/.test(s))kinds.push('arc');
    if(/散开|展开再聚合/.test(s))kinds.push('spread');
    if(kinds.length!==1)throw Error('请选择一种动作：直线、弧线、散开再聚合、只变灯光。组合动作请拆成多幕。');
    const duration=s.match(/(\d+(?:\.\d+)?)\s*秒/),distance=s.match(/(\d+(?:\.\d+)?)\s*米/);
    const seconds=duration?Number(duration[1]):6,amplitude=distance?Number(distance[1]):15;
    if(seconds<.5||seconds>180||amplitude<0||amplitude>100)throw Error('时长范围 0.5～180 秒，幅度范围 0～100 米。');
    const dirs=[['左',[-1,0,0]],['右',[1,0,0]],['上',[0,0,1]],['下',[0,0,-1]]].filter(([d])=>s.includes('向'+d));
    if(dirs.length>1)throw Error('每幕只支持一个弧线方向。');
    // Reject unsupported language rather than silently guessing choreography.
    const rest=s.replace(/只变灯光|只亮|保持队形|原地渐变|直线|平滑变换|弧线|绕弧|散开再聚合|展开再聚合|散开|向[左右上下]|\d+(?:\.\d+)?\s*[秒米]|转场|幅度|用时|耗时|完成|移动|飞行|过渡|切换|到下一幕|再聚合|，|。|、|：|:|\s/g,'');
    if(rest)throw Error('未识别描述：“'+rest+'”。请使用下方示例的动作、方向、秒数和米数。');
    return {kind:kinds[0],seconds,amplitude,direction:dirs[0]?.[1]||[0,0,1]};
  }
  function create(from,to,cue,{vmax=5,accel=2}={}){
    if(from.length!==to.length)throw Error('转场点位数量不一致。');
    const source=from.map(p=>({...p})),target=to.map(p=>({...p}));
    const center=source.reduce((a,p)=>a.map((v,k)=>v+p[['x','y','z'][k]]/Math.max(1,source.length)),[0,0,0]);
    const offsets=source.map(p=>{
      if(cue.kind==='lights'||cue.kind==='move')return [0,0,0];
      if(cue.kind==='arc')return cue.direction.map(v=>v*cue.amplitude);
      const v=[p.x-center[0],p.y-center[1],p.z-center[2]],n=Math.hypot(...v);
      return n?v.map(x=>x/n*cue.amplitude):[0,0,0];
    });
    let bound=0;
    source.forEach((p,i)=>{bound=Math.max(bound,Math.hypot(target[i].x-p.x,target[i].y-p.y,target[i].z-p.z)+4*Math.hypot(...offsets[i]));});
    const duration=cue.kind==='lights'?cue.seconds:Math.max(cue.seconds,2*bound/vmax,Math.sqrt(24*bound/accel));
    const rgb=c=>c.startsWith('#')?[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)):c.match(/\d+/g).slice(0,3).map(Number);
    const colors=source.map(p=>rgb(p.color)),ends=target.map(p=>rgb(p.color));
    return {duration,sample(time){
      const t=Math.max(0,Math.min(1,time/duration)),s=t*t*t*(10+t*(-15+6*t)),b=4*s*(1-s);
      return source.map((p,i)=>{
        const q=target[i],o=offsets[i],fixed=cue.kind==='lights';
        return {x:fixed?p.x:p.x+(q.x-p.x)*s+o[0]*b,y:fixed?p.y:p.y+(q.y-p.y)*s+o[1]*b,z:fixed?p.z:p.z+(q.z-p.z)*s+o[2]*b,
          color:t===1?q.color:`rgb(${colors[i].map((v,k)=>Math.round(v+(ends[i][k]-v)*s)).join(',')})`};
      });
    }};
  }
  root.TransitionCues={parse,create};
  if(typeof module!=='undefined')module.exports=root.TransitionCues;
})(globalThis);
