// Measurements in model metres. Transition preview is not an avoidance planner.
function boundsOf(points){
  if(!points.length)return null;
  const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
  for(const p of points)for(const axis of ["x","y","z"]){min[axis]=Math.min(min[axis],p[axis]);max[axis]=Math.max(max[axis],p[axis]);}
  return {min,max,size:{x:max.x-min.x,y:max.y-min.y,z:max.z-min.z}};
}
function setMeasurements(visible){
  presentation.measurements=visible;
  $("#measure-btn").setAttribute("aria-pressed",String(visible));
  $("#measure-btn").textContent=visible?"隐藏坐标 / 尺寸":"坐标 / 尺寸";
}
function measurementLabel(position,text,color){
  const p=project3d(...position);if(!p)return;
  ctx.font="12px sans-serif";
  const width=ctx.measureText(text).width;
  const x=Math.max(8,Math.min(canvas.clientWidth-width-10,p.x+5));
  const y=Math.max(18,Math.min(canvas.clientHeight-80,p.y));
  ctx.fillStyle="rgba(5,10,18,.85)";ctx.fillRect(x-3,y-14,width+6,19);
  ctx.fillStyle=color;ctx.fillText(text,x,y);
}
function drawMeasurements(){
  if(!presentation.measurements)return;
  const bounds=boundsOf(state.drones),w=canvas.clientWidth;
  ctx.save();
  ctx.fillStyle="rgba(5,10,18,.85)";ctx.fillRect(10,36,Math.min(w-20,440),bounds?66:30);
  ctx.fillStyle="#d7e6f3";ctx.font="12px sans-serif";
  if(!bounds){ctx.fillText("0 架 · 无尺寸数据",20,57);ctx.restore();return;}
  const {min:a,max:b,size:s}=bounds;
  ctx.fillText(`当前点阵：X ${s.x.toFixed(1)} × Y ${s.y.toFixed(1)} × Z ${s.z.toFixed(1)} m`,20,56);
  ctx.fillText(`高度区间 ${a.z.toFixed(1)}～${b.z.toFixed(1)} m · ${state.count} 架`,20,75);
  ctx.fillStyle="#93a8bd";ctx.fillText("模型设定尺度，非从照片测得的实物尺寸",20,94);
  const corners=[
    [a.x,a.y,a.z],[b.x,a.y,a.z],[b.x,b.y,a.z],[a.x,b.y,a.z],
    [a.x,a.y,b.z],[b.x,a.y,b.z],[b.x,b.y,b.z],[a.x,b.y,b.z],
  ];
  ctx.lineWidth=1;ctx.setLineDash([4,5]);
  for(const [i,j] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])
    worldLine(corners[i],corners[j],"#607585");
  ctx.setLineDash([]);ctx.lineWidth=2;
  worldLine(corners[0],corners[1],"#ff8a8e");
  worldLine(corners[0],corners[3],"#7deaab");
  worldLine(corners[0],corners[4],"#81b8ff");
  measurementLabel([(a.x+b.x)/2,a.y,a.z],`X 长 ${s.x.toFixed(1)} m`,"#ff8a8e");
  measurementLabel([a.x,(a.y+b.y)/2,a.z],`Y 深 ${s.y.toFixed(1)} m`,"#7deaab");
  measurementLabel([a.x,a.y,(a.z+b.z)/2],`Z 高 ${s.z.toFixed(1)} m`,"#81b8ff");
  measurementLabel(corners[0],`角点 (${a.x.toFixed(1)}, ${a.y.toFixed(1)}, ${a.z.toFixed(1)})`,"#d7e6f3");
  // A small fixed world-axis indicator stays visible while rotating/zooming.
  const ox=w-58,oy=66;
  const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  for(const [v,label,color] of [[[1,0,0],"X","#ff8a8e"],[[0,1,0],"Y","#7deaab"],[[0,0,1],"Z","#81b8ff"]]){
    const x=ox+(v[0]*cy-v[1]*sy)*27,y=oy-(v[2]*cp+(v[0]*sy+v[1]*cy)*sp)*27;
    ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(x,y);ctx.stroke();
    ctx.fillStyle=color;ctx.fillText(label,x+3,y-3);
  }
  ctx.restore();
}
function startFormationTransition(){
  if(!state.count){
    $("#transition-note").textContent="请先添加无人机或导入造型。";return false;
  }
  rebuildModel();
  const targets=Array.from({length:state.count},(_,i)=>({...showTarget(i)}));
  if(targets.some(p=>p.z<0)){
    $("#transition-note").textContent="目标含地下坐标，请提高基准高度后再模拟。";return false;
  }
  // Stable axis-order assignment reduces gross crossovers but is NOT collision-free.
  const ordered=targets.map((p,i)=>({p,i})).sort((a,b)=>a.p.x-b.p.x||a.p.z-b.p.z||a.p.y-b.p.y);
  const slots=Array.from({length:state.count},(_,i)=>homeFor(i)).sort((a,b)=>a.x-b.x||a.y-b.y);
  const drones=new Array(state.count);let initialError=0,maxDistance=0;
  ordered.forEach(({p,i},rank)=>{
    const h=slots[rank],d={...h,z:flight.height,vx:0,vy:0,vz:0,home:{...h},conflict:false};
    drones[i]=d;const distance=Math.hypot(p.x-d.x,p.y-d.y,p.z-d.z);
    initialError+=distance;maxDistance=Math.max(maxDistance,distance);
  });
  state.drones=drones;state.elapsed=0;state.running=true;state.landing=false;
  presentation.preview=false;flight.phase="transition";
  flight.conflicts=0;
  flight.error=initialError/state.count;
  flight.transition={targets,initialError,remaining:initialError,elapsed:0,progress:0,arrived:0,complete:false,maxDistance};
  const bounds=boundsOf(drones.concat(targets));
  presentation.center=(bounds.min.z+bounds.max.z)/2;
  const radius=Math.max(20,...drones.concat(targets).map(p=>Math.hypot(p.x,p.y,p.z-presentation.center)));
  camera.distance=radius*3;camera.yaw=.45;camera.pitch=.30;camera.orthographic=false;
  fitSceneView(drones.concat(targets));
  $("#play-btn").textContent="暂停仿真";$("#sim-status").textContent="● 编队 → 造型";
  $("#transition-note").textContent="空中矩阵 → 当前造型；直线趋近，不保证避碰。";
  updateTransitionHUD();
  return true;
}
function updateTransitionHUD(){
  if(state.scenario==="empty"){
    $("#transition-progress").value=0;
    setSceneText("#transition-progress-text","未开始 · 请先导入图片或选择示例");
    setSceneText("#transition-note","生成造型后，可预演从空中矩阵到目标造型的转场。");
    return;
  }
  const t=flight.transition;
  $("#transition-progress").value=t?Math.round(t.progress*100):0;
  $("#transition-progress-text").textContent=t?
    `${Math.round(t.progress*100)}% · 到位 ${t.arrived}/${state.count} · ${t.elapsed.toFixed(1)} s${state.running?"":" · 已暂停"}`:
    "准备：空中矩阵 → 当前造型";
  if(t?.complete)$("#transition-note").textContent="转场完成。轨迹仍需独立避碰与实机校验。";
  else if(t && flight.conflicts)$("#transition-note").textContent=`当前检出 ${flight.conflicts} 对间距 <2 m；仅诊断，未做避碰。`;
  else if(t)$("#transition-note").textContent="当前未检出 <2 m，不代表连续轨迹安全；此模拟无避碰规划。";
}
function clearTransition(){
  flight.transition=null;
  $("#transition-note").textContent="从规则空中矩阵出发；可暂停、调速或重新播放。";
  updateTransitionHUD();
}
function setupSceneTools(){
  $("#measure-btn").addEventListener("click",()=>setMeasurements(!presentation.measurements));
  $("#transition-btn").addEventListener("click",startFormationTransition);
}
