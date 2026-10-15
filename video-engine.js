/* Independent series playback for video composition. No changes to the editor scene. */
(function(root){
  function create(frames,{hold=3,vmax=5,accel=2}={}){
    if(!frames.length||!frames[0].points.length)throw Error("没有可演示的点阵");
    const count=frames[0].points.length;
    if(frames.some(f=>f.points.length!==count))throw Error("系列各幕需要统一架数");
    if(!Number.isFinite(hold)||hold<0||!Number.isFinite(vmax)||vmax<=0||!Number.isFinite(accel)||accel<=0)throw Error("播放参数无效");
    const rgb=c=>c.startsWith("#")?[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)):c.match(/\d+/g).slice(0,3).map(Number);
    const colors=frames.map(f=>f.points.map(p=>rgb(p.color)));
    const drones=frames[0].points.map(p=>({...p,vx:0,vy:0,vz:0}));
    const playback={frames,drones,index:0,phase:"hold",elapsed:0,held:0,progress:0,done:false};
    let initial=0,lightElapsed=0;
    function step(dt){
      if(playback.done)return;
      playback.elapsed+=dt;
      if(playback.phase==="hold"){
        playback.held+=dt;
        if(playback.held>=hold){
          if(playback.index===frames.length-1){playback.done=true;return;}
          playback.index++;playback.phase="transition";playback.held=0;lightElapsed=0;
          initial=drones.reduce((sum,d,i)=>{const p=frames[playback.index].points[i];return sum+Math.hypot(p.x-d.x,p.y-d.y,p.z-d.z);},0);
        }
        return;
      }
      let arrived=true,remaining=0;
      const target=frames[playback.index].points;
      const lightOnly=frames[playback.index].transitionMode==="lights";
      if(!lightOnly)drones.forEach((d,i)=>{
        const p=target[i],dx=p.x-d.x,dy=p.y-d.y,dz=p.z-d.z,distance=Math.hypot(dx,dy,dz);
        remaining+=distance;
        const speed=Math.min(vmax,Math.sqrt(2*accel*distance),distance*1.4),s=distance>1e-8?speed/distance:0;
        const ax=dx*s-d.vx,ay=dy*s-d.vy,az=dz*s-d.vz;
        const scale=Math.min(1,accel*dt/Math.max(1e-12,Math.hypot(ax,ay,az)));
        d.vx+=ax*scale;d.vy+=ay*scale;d.vz+=az*scale;
        d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;
        if(distance>.2||Math.hypot(d.vx,d.vy,d.vz)>.2)arrived=false;
      });
      lightElapsed+=dt;
      playback.progress=lightOnly?Math.min(1,lightElapsed/.8):Math.max(0,Math.min(1,initial?1-remaining/initial:1));
      if(lightOnly)arrived=lightElapsed>=.8;
      drones.forEach((d,i)=>{
        const a=colors[playback.index-1][i],b=colors[playback.index][i];
        d.color=`rgb(${a.map((v,k)=>Math.round(v+(b[k]-v)*playback.progress)).join(",")})`;
      });
      if(arrived){
        playback.phase="hold";playback.held=0;playback.progress=1;
        drones.forEach((d,i)=>Object.assign(d,{color:target[i].color}));
      }
    }
    playback.advance=dt=>{
      if(!Number.isFinite(dt)||dt<0)throw Error("播放时间无效");
      let remaining=dt;
      while(remaining>1e-8&&!playback.done){const d=Math.min(1/60,remaining);step(d);remaining-=d;}
    };
    return playback;
  }
  root.VideoSeriesEngine={create};
  if(typeof module!=="undefined")module.exports=root.VideoSeriesEngine;
})(globalThis);
