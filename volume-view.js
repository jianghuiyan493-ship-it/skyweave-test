/* Camera-only inspection; geometry and playback are not mutated. */
(function(){
 const group=document.createElement('div');group.className='volume-view-tools';
 for(const [label,yaw,pitch] of [['正面',0,0],['侧面',Math.PI/2,0],['背面',Math.PI,0],['俯视',0,Math.PI/2],['立体',.65,.22]]){
  const button=document.createElement('button');button.className='button button-secondary';button.textContent=label;
  button.onclick=()=>{camera.yaw=yaw;camera.pitch=pitch;camera.orthographic=label!=='立体';fitSceneView();};group.append(button);
 }
 const tip=document.createElement('span');tip.textContent='先看正面识别 · 侧面/背面仅为稀疏假设';group.append(tip);
 document.querySelector('.stage-heading').append(group);
})();
