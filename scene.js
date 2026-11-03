// Local 3D rehearsal in metres. Not a flight controller or certified planner.
const camera = { yaw: .6, pitch: .38, distance: 290, centerX:0, centerY:0, autoFit:true };
const flight = { height: 50, vmax: 5, accel: 2, spacing: 4, phase: "ground", conflicts: 0, error: 0, transition:null };
const presentation = { preview:false, guides:false, measurements:false, points:[], center:80 };
function rebuildModel() {
  presentation.points=buildShowModel(state.scenario,state.count);
}
function fitSceneView(points=state.drones){
  if(!points.length||canvas.clientWidth<1||canvas.clientHeight<1)return;
  const bounds=boundsOf(points);
  camera.centerX=(bounds.min.x+bounds.max.x)/2;
  camera.centerY=(bounds.min.y+bounds.max.y)/2;
  presentation.center=(bounds.min.z+bounds.max.z)/2;
  const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  const scale=Math.min(canvas.clientWidth,canvas.clientHeight)*1.1;
  const halfW=Math.max(20,canvas.clientWidth*.40),halfH=Math.max(20,(canvas.clientHeight-90)*.40);
  let distance=8;
  for(const p of points){
    const x=p.x-camera.centerX,y=p.y-camera.centerY,z=p.z-presentation.center;
    const rx=x*cy-y*sy,ry=x*sy+y*cy,vertical=z*cp+ry*sp;
    const depth=camera.orthographic?0:ry*cp-z*sp;
    distance=Math.max(distance,Math.abs(rx)*scale/halfW-depth,Math.abs(vertical)*scale/halfH-depth,2-depth);
  }
  // Do not auto-zoom away the physical size reduction requested for a low budget.
  if(state.scenario==="image"&&upload.budgetScale>0&&upload.budgetScale<1)distance/=upload.budgetScale;
  camera.distance=distance;camera.autoFit=true;
}
function previewFormation() {
  if(state.scenario==="empty"){showEmptyWorkspace();return;}
  clearTransition();
  rebuildModel();
  flight.phase="preview";
  flight.error=0;
  state.drones=Array.from({length:state.count},(_,i)=>({...showTarget(i),vx:0,vy:0,vz:0,conflict:false}));
  const zs=state.drones.map(d=>d.z);
  presentation.center=zs.length ? (Math.min(...zs)+Math.max(...zs))/2 : flight.height;
  camera.distance=state.scenario==="city"?245:200;
  camera.yaw=state.scenario==="city"?-.35:.25;
  camera.pitch=state.scenario==="rose"?.85:.16;
  camera.orthographic=false;
  if(state.scenario==="reference"){camera.distance=300;camera.yaw=.32;camera.pitch=.06;}
  if(state.scenario==="ribbon"){camera.yaw=.10;camera.pitch=.12;camera.orthographic=true;}
  if(state.scenario==="image"){
    const fit=Math.min(Math.max(100,canvas.clientWidth-60)/210,Math.max(100,canvas.clientHeight-110)/(210/upload.aspect));
    camera.distance=Math.max(100,Math.min(canvas.clientWidth,canvas.clientHeight)*1.1/fit);
    camera.yaw=0;camera.pitch=0;camera.orthographic=true;
    // Imported 2D artwork must remain readable on first view. Side/3D inspection
    // is opt-in via the camera controls, not a destructive starting perspective.
  }
  if(state.scenario==="model"){
    let span=10;state.drones.forEach(d=>{span=Math.max(span,Math.abs(d.x),Math.abs(d.y),Math.abs(d.z-presentation.center));});
    camera.distance=span*3;camera.yaw=.3;camera.pitch=.1;
  }
  $("#sim-status").textContent="● 造型预览（非飞行）";
  fitSceneView();
}
function homeFor(i) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(state.count)));
  return { x: (i % cols - (cols - 1) / 2) * flight.spacing,
    y: (Math.floor(i / cols) - (Math.ceil(state.count / cols) - 1) / 2) * flight.spacing, z: 0 };
}
function sceneInit() {
  if(state.scenario==="empty"){showEmptyWorkspace();return;}
  clearTransition();
  flight.phase = "ground";
  state.landing = false;
  state.drones = Array.from({length:state.count}, (_,i) => ({
    ...homeFor(i), vx:0, vy:0, vz:0, color:"#6ee7f9", conflict:false,
  }));
  camera.distance = Math.max(220, Math.sqrt(state.count) * flight.spacing * 2.2);
  rebuildModel();
  if(presentation.preview)previewFormation();
  else {
    camera.yaw=.25;camera.pitch=.85;camera.orthographic=false;
    fitSceneView();
    $("#sim-status").textContent="● 地面待机 · 等待起飞";
  }
}
function showEmptyWorkspace() {
  clearTransition();
  state.running=false;state.landing=false;state.count=0;state.drones=[];
  presentation.points=[];presentation.preview=true;flight.phase="preview";flight.error=0;
  $("#sim-status").textContent="等待导入图片";
  $("#sim-status").classList.remove("is-live");
}
function showTarget(i) {
  const home = homeFor(i);
  if(presentation.points.length) {
    const p=presentation.points[i];
    return {x:p.x,y:p.y,z:flight.height+p.z};
  }
  if (state.scenario === "image") {
    const p = imagePointForDrone(i);
    if (!p) return {...home, z:flight.height};
    const aspect = state.image ? state.image.naturalWidth / state.image.naturalHeight : 1;
    const width = Math.max(60, Math.sqrt(state.count) * 3);
    return {x:(p.x - .5) * width, y:0, z:flight.height + (1-p.y) * width / aspect};
  }
  if (state.scenario === "orbit") {
    const rings = Math.max(1, Math.ceil(state.count / 80));
    const ring = Math.floor(i / 80), n = Math.min(80, state.count-ring*80);
    const a = (i % 80) / n * Math.PI*2;
    const r = Math.max(18, n * flight.spacing / (2*Math.PI));
    return {x:Math.cos(a)*r, y:Math.sin(a)*r, z:flight.height + (ring-(rings-1)/2)*flight.spacing};
  }
  return {...home, z:flight.height + (state.scenario === "wave" ? Math.sin(home.x / 16)*12 : 0)};
}
function flightTarget(i) {
  if(flight.phase==="transition"&&flight.transition)return flight.transition.targets[i];
  const home = state.drones[i]?.home || homeFor(i);
  if (flight.phase === "ground" || flight.phase === "landing") return home;
  if (flight.phase === "takeoff" || flight.phase === "return") return {...home,z:flight.height};
  return showTarget(i);
}
function sceneUpdate(dt) {
  if (!state.running) return;
  // Substeps keep acceleration stable when playback is sped up.
  let remaining = dt * state.speed;
  while (remaining > 1e-8) {
    const step = Math.min(remaining, 1/60);
    remaining -= step;
    state.elapsed += step;
    if (flight.phase === "hold" || flight.phase === "ground" || flight.phase === "preview") continue;
    let arrived = true, error = 0, arrivedCount=0;
    state.drones.forEach((d,i) => {
      const target = flightTarget(i);
      const dx = target.x-d.x, dy = target.y-d.y, dz = target.z-d.z;
      const distance = Math.hypot(dx,dy,dz);
      error += distance;
      const desiredSpeed = Math.min(flight.vmax, Math.sqrt(2*flight.accel*distance), distance*1.4);
      const s = distance > 1e-8 ? desiredSpeed/distance : 0;
      let ax = dx*s-d.vx, ay = dy*s-d.vy, az = dz*s-d.vz;
      const change = Math.hypot(ax,ay,az), limit = flight.accel*step;
      const scale = change > limit ? limit/change : 1;
      d.vx += ax*scale; d.vy += ay*scale; d.vz += az*scale;
      d.x += d.vx*step; d.y += d.vy*step; d.z = Math.max(0,d.z+d.vz*step);
      if (distance > .2 || Math.hypot(d.vx,d.vy,d.vz) > .2) arrived = false;
      else arrivedCount++;
    });
    flight.error = state.count ? error/state.count : 0;
    if(flight.phase==="transition"&&flight.transition){
      const t=flight.transition;t.elapsed+=step;t.remaining=error;t.arrived=arrivedCount;
      t.progress=Math.max(0,Math.min(.999,t.initialError>0?1-error/t.initialError:1));
      if(arrived){t.progress=1;t.complete=true;flight.phase="show";$("#sim-status").textContent="● 已成型";}
    }
    if (arrived && state.count) {
      if (flight.phase === "takeoff") flight.phase = "show";
      else if (flight.phase === "return") flight.phase = "landing";
      else if (flight.phase === "landing") {
        flight.phase = "ground";
        state.drones.forEach(d => {d.z=0; d.vx=d.vy=d.vz=0;});
      }
    }
  }
}
function project3d(x,y,z) {
  x-=camera.centerX;y-=camera.centerY;
  const cy=Math.cos(camera.yaw), sy=Math.sin(camera.yaw);
  const cp=Math.cos(camera.pitch), sp=Math.sin(camera.pitch);
  const rx=x*cy-y*sy, ry=x*sy+y*cy, rz=z-presentation.center;
  const depth=camera.distance+ry*cp-rz*sp;
  if(depth < 1) return null;
  const scale=Math.min(canvas.clientWidth,canvas.clientHeight)*1.1/(camera.orthographic?camera.distance:depth);
  return {x:canvas.clientWidth/2+rx*scale,y:(canvas.clientHeight-50)/2-(rz*cp+ry*sp)*scale,scale,depth};
}
function worldLine(a,b,color) {
  const p=project3d(...a),q=project3d(...b);
  if(!p||!q)return;
  ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
}
let metricTimer=0;
function sceneDraw() {
  const w=canvas.clientWidth,h=canvas.clientHeight;
  const sky=ctx.createLinearGradient(0,0,0,h);
  sky.addColorStop(0,"#050509");sky.addColorStop(.55,"#090910");sky.addColorStop(1,"#0d0c15");
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  if(state.scenario==="empty"){
    updateSceneDisplayStats();
    if(performance.now()-metricTimer>250){sceneMetrics();metricTimer=performance.now();}
    return;
  }
  const extent=Math.max(100,Math.ceil(Math.sqrt(state.count)*flight.spacing/20)*10+30);
  ctx.lineWidth=1;
  if(presentation.guides) {
  for(let x=-extent;x<=extent;x+=10){
    worldLine([x,-extent,0],[x,extent,0],"#284253");
    worldLine([-extent,x,0],[extent,x,0],"#284253");
  }
  worldLine([0,0,0],[40,0,0],"#ec797e");
  worldLine([0,0,0],[0,40,0],"#73e6a2");
  worldLine([0,0,0],[0,0,100],"#6da6ff");
  ctx.font="11px monospace";ctx.fillStyle="#9fb6c8";
  [[40,0,0,"X / m"],[0,40,0,"Y / m"],[0,0,100,"Z 100 m"]].forEach(([x,y,z,text])=>{
    const p=project3d(x,y,z);if(p)ctx.fillText(text,p.x+6,p.y);
  });
  }
  // Perspective-sorted circular lights; no per-drone blur at large counts.
  const visible=[];
  state.drones.forEach((d,i)=>{
    const p=project3d(d.x,d.y,d.z);if(!p)return;
    const color=presentation.points[i]?.color || (state.scenario==="image" ? (imagePointForDrone(i)?.color || "#596774") : "#6ee7f9");
    if(color==="#000000"||color==="rgb(0,0,0)")return;
    visible.push({p,d,color});
    if(presentation.guides && state.count<=200){
      const ground=project3d(d.x,d.y,0);
      if(ground){
        ctx.fillStyle="#264557";ctx.beginPath();ctx.ellipse(ground.x,ground.y,3,1.5,0,0,Math.PI*2);ctx.fill();
      }
    }
  });
  visible.sort((a,b)=>b.p.depth-a.p.depth);
  visible.forEach(({p,d,color})=>{
    const r=state.scenario==="image"?Math.max(.8,Math.min(1.4,p.scale*.32)):Math.max(.65,Math.min(1.9,p.scale*.40));
    ctx.fillStyle=presentation.guides && d.conflict?"#ff586a":color;
    ctx.globalAlpha=.04;ctx.beginPath();ctx.arc(p.x,p.y,r*1.8,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
  });
  drawMeasurements();
  const phases={preview:"静态造型预览 · 非飞行轨迹",ground:"地面待命",takeoff:"垂直起飞",transition:"编队变换",show:"空中编队",hold:"悬停",return:"返回起飞点上空",landing:"垂直降落"};
  ctx.fillStyle="#c5d9e6";ctx.font="12px sans-serif";
  ctx.fillText(`${phases[flight.phase]} · 拖动旋转 / Ctrl + 拖动平移 / 滚轮缩放`,16,h-40);
  ctx.fillStyle="#ffc77f";ctx.fillText(state.scenario==="reference"?"原图灯点 + 人工纵深（浮雕）· 非完整背面模型 / 非实机航线":"概念预演 · 轨迹未认证，禁止直接用于实机",16,h-18);
  updateSceneDisplayStats();

  if(performance.now()-metricTimer>250){sceneMetrics();metricTimer=performance.now();}
}
function setSceneText(selector,text){
  const node=$(selector);if(node.textContent!==text)node.textContent=text;
}
let displayStatsTime=-Infinity;
function updateSceneDisplayStats(){
  setSceneText("#clock",`T+${formatTime(state.elapsed)}`);
  const now=performance.now();
  if(now-displayStatsTime>=1000){setSceneText("#fps",`${Math.round(state.fps)} FPS`);displayStatsTime=now;}
}
function sceneMetrics(){
  if(state.scenario==="empty"){
    flight.conflicts=0;
    for(const id of ["online-metric","battery-metric","error-metric","throughput-metric","safety-metric","progress-metric"])setSceneText("#"+id,"未开始");
    updateTransitionHUD();
    if(typeof syncWorkspacePlayback==="function")syncWorkspacePlayback();
    return;
  }
  // Spatial hashing: flag pairs within the user-visible 2 m diagnostic threshold.
  const cells=new Map(), threshold=2; let close=0,maxHeight=0,maxSpeed=0;
  state.drones.forEach(d=>d.conflict=false);
  state.drones.forEach(d=>{
    const x=Math.floor(d.x/threshold),y=Math.floor(d.y/threshold),z=Math.floor(d.z/threshold);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const list=cells.get(`${x+dx},${y+dy},${z+dz}`);
      if(list)for(const other of list){
        if(Math.hypot(d.x-other.x,d.y-other.y,d.z-other.z)<threshold){d.conflict=other.conflict=true;close++;}
      }
    }
    const key=`${x},${y},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(d);
    maxHeight=Math.max(maxHeight,d.z);maxSpeed=Math.max(maxSpeed,Math.hypot(d.vx,d.vy,d.vz));
  });
  flight.conflicts=close;
  $("#battery-metric").textContent=`${maxHeight.toFixed(1)} m`;
  $("#throughput-metric").textContent=`${maxSpeed.toFixed(1)} m/s`;
  $("#error-metric").textContent=`${flight.error.toFixed(1)} m`;
  $("#safety-metric").textContent=close ? `${close} 对 <2m` : "未检出 <2m";
  $("#progress-metric").textContent=flight.transition?`${Math.round(flight.transition.progress*100)}%`:flight.phase==="ground"?"待起飞":flight.phase==="preview"?"静态预览":state.running?"预演中":"已暂停";
  updateTransitionHUD();
  if(typeof syncWorkspacePlayback==="function")syncWorkspacePlayback();
}
function beginFlight(){
  if(state.scenario==="empty")return;
  clearTransition();
  if(presentation.preview) {
    presentation.preview=false;
    sceneInit();
  }
  flight.phase=state.drones.some(d=>d.z>.2)?"show":"takeoff";
  state.running=true;state.landing=false;
  $("#play-btn").textContent="暂停仿真";$("#sim-status").textContent="● 三维预演";
}
function setupScene(){
  setupSceneTools();
  $("#preview-btn").addEventListener("click",()=>{presentation.preview=true;previewFormation();});
  $("#guides-toggle").addEventListener("change",e=>presentation.guides=e.target.checked);
  $("#takeoff-btn").addEventListener("click",beginFlight);
  $("#height-number").addEventListener("change",e=>{
    flight.height=Math.max(10,Math.min(120,Number(e.target.value)||50));e.target.value=flight.height;
    if(presentation.preview||flight.transition){presentation.preview=true;previewFormation();}
  });
  $("#velocity-number").addEventListener("change",e=>{
    flight.vmax=Math.max(.5,Math.min(10,Number(e.target.value)||5));e.target.value=flight.vmax;
  });
  $("#view-front").addEventListener("click",()=>{camera.yaw=0;camera.pitch=0;camera.orthographic=true;fitSceneView();});
  $("#view-perspective").addEventListener("click",()=>{camera.yaw=.6;camera.pitch=.38;camera.orthographic=false;fitSceneView();});
  let drag=null;
  canvas.addEventListener("pointerdown",e=>{
    if(e.button!==0||drag)return;
    drag={x:e.clientX,y:e.clientY,id:e.pointerId};
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener("pointermove",e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    camera.autoFit=false;
    if(e.ctrlKey){
      // Move the view target in the camera's screen plane, at target depth.
      // Model coordinates and orthographic/perspective mode stay unchanged.
      const units=camera.distance/(Math.min(canvas.clientWidth,canvas.clientHeight)*1.1);
      const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
      camera.centerX+=(-dx*cy+dy*sy*sp)*units;
      camera.centerY+=(dx*sy+dy*cy*sp)*units;
      presentation.center+=dy*cp*units;
    }else{
      camera.orthographic=false;
      camera.yaw+=dx*.006;
      camera.pitch=Math.max(.03,Math.min(1.4,camera.pitch+dy*.004));
    }
    drag.x=e.clientX;drag.y=e.clientY;
  });
  const endDrag=e=>{if(drag&&e.pointerId===drag.id)drag=null;};
  canvas.addEventListener("pointerup",endDrag);
  canvas.addEventListener("pointercancel",endDrag);
  canvas.addEventListener("lostpointercapture",endDrag);
  window.addEventListener("blur",()=>drag=null);
  canvas.addEventListener("wheel",e=>{e.preventDefault();camera.autoFit=false;camera.distance=Math.max(8,Math.min(10000,camera.distance*Math.exp(e.deltaY*.001)));},{passive:false});
}
