/* Local image series: original files and reconstructed targets live in IndexedDB. */
const imageSeries={id:null,frames:[],busy:false,dirty:false,urls:[],saved:new Map(),playback:null};
function seriesMessage(text){$('#series-status').textContent=text;}
let seriesDatabase;
function openSeriesDatabase(){
  if(!seriesDatabase)seriesDatabase=new Promise((resolve,reject)=>{
    const request=indexedDB.open('skyweave-series',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('series',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  }).catch(error=>{seriesDatabase=null;throw error;});
  return seriesDatabase;
}
async function seriesStore(operation,value){
  const db=await openSeriesDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('series',operation==='getAll'?'readonly':'readwrite');
    const request=tx.objectStore('series')[operation](...(value===undefined?[]:[value]));
    tx.oncomplete=()=>resolve(request.result);
    tx.onerror=()=>reject(tx.error||request.error);
    tx.onabort=()=>reject(tx.error||new Error('存储操作未完成'));
  });
}
function seriesSettings(){
  const count=Number($('#series-count').value),hold=Number($('#series-hold').value);
  if(!Number.isInteger(count)||count<1||count>10000)throw Error('机队上限须为 1～10000 的整数。');
  if(!Number.isFinite(hold)||hold<0||hold>60)throw Error('停留时间须在 0～60 秒之间。');
  return {count,hold};
}
function renderSeriesFrames(){
  imageSeries.urls.forEach(url=>URL.revokeObjectURL(url));imageSeries.urls=[];
  const container=$('#series-frames');container.replaceChildren();
  if(!imageSeries.frames.length){const empty=document.createElement('p');empty.className='library-empty';empty.textContent='拖入整个系列，图片与识别后的点阵会一起放在这里。';container.append(empty);}
  imageSeries.frames.forEach((frame,index)=>{
    const card=document.createElement('article');card.className='series-card';
    const url=URL.createObjectURL(frame.file);imageSeries.urls.push(url);
    const img=document.createElement('img');img.src=url;img.alt=frame.name;
    const title=document.createElement('strong');title.textContent=`${String(index+1).padStart(2,'0')} / ${frame.name}`;
    const meta=document.createElement('small');meta.textContent=`${frame.points.length.toLocaleString()} 点 · ${frame.mode==='lights'?'灯点':'插画'} · ${frame.subjectReview||'原图已加入系列'}`;
    const actions=document.createElement('div');actions.className='series-actions';
    for(const [label,fn,disabled] of [
      ['←',()=>moveSeriesFrame(index,-1),index===0],['→',()=>moveSeriesFrame(index,1),index===imageSeries.frames.length-1],
      ['查看',()=>previewSeriesFrame(index),false],['编辑主体',()=>editSeriesSubject(index),false],['移除',()=>{imageSeries.frames.splice(index,1);imageSeries.dirty=true;renderSeriesFrames();},false]
    ]){const button=document.createElement('button');button.className='button button-ghost';button.textContent=label;if(label==='编辑主体')button.classList.add('card-edit');if(label==='查看')button.classList.add('card-preview');if(label==='移除')button.classList.add('card-remove');button.disabled=disabled||imageSeries.busy;button.setAttribute('aria-label',`${label} ${frame.name}`);button.onclick=fn;actions.append(button);}
    const cueLabel=document.createElement('label');cueLabel.className='series-cue-label';cueLabel.textContent=index?'从上一张切换到此图':'第一幕（系列起点）';
    const cue=document.createElement('select');cue.className='select';cue.disabled=index===0||imageSeries.busy;
    for(const [value,text] of [['move','移动变换 · 重新组成造型'],['lights','只变灯光 · 保持队形不动']]){const option=document.createElement('option');option.value=value;option.textContent=text;cue.append(option);}
    cue.value=frame.transitionMode||'move';cue.onchange=()=>{stopImageSeries();delete frame.transitionCue;delete frame.transitionText;frame.transitionMode=cue.value;imageSeries.dirty=true;renderSeriesFrames();seriesMessage('已切换转场类型并清除该幕文字转场。请保存整个系列。');};cueLabel.append(cue);
    const countLabel=document.createElement('label');countLabel.className='series-cue-label';
    countLabel.textContent=`本幕亮灯架数 · 采样推荐 ${SeriesLighting.recommend(frame.points)} 架`;
    const lightCount=document.createElement('input');lightCount.type='number';lightCount.min='0';lightCount.max='10000';lightCount.step='1';
    lightCount.value=frame.lightCount??SeriesLighting.recommend(frame.points);lightCount.disabled=imageSeries.busy;
    lightCount.setAttribute('aria-label',`第 ${index+1} 幕亮灯架数`);
    lightCount.onchange=()=>{
      const n=Number(lightCount.value);
      if(!Number.isInteger(n)||n<0||n>10000){lightCount.value=frame.lightCount??SeriesLighting.recommend(frame.points);seriesMessage('请输入 0～10000 的整数。');return;}
      frame.lightCount=n;imageSeries.dirty=true;seriesMessage('已设置本幕亮灯上限。实际受机队数量和可用点位限制，其余无人机熄灯；请保存整个系列。');
    };
    const auto=document.createElement('button');auto.className='button button-ghost';auto.textContent='采用采样推荐';auto.disabled=imageSeries.busy;
    auto.onclick=()=>{delete frame.lightCount;imageSeries.dirty=true;renderSeriesFrames();};
    countLabel.append(lightCount,auto);
    card.append(img,title,meta,cueLabel,countLabel,actions);container.append(card);
  });
}
function moveSeriesFrame(index,offset){
  const target=index+offset;if(target<0||target>=imageSeries.frames.length)return;
  [imageSeries.frames[index],imageSeries.frames[target]]=[imageSeries.frames[target],imageSeries.frames[index]];
  imageSeries.dirty=true;renderSeriesFrames();
}
function setSeriesBusy(busy){
  imageSeries.busy=busy;
  for(const id of ['series-files','series-save','series-new','series-play'])$('#'+id).disabled=busy;
  renderSeriesFrames();
}
async function decodeSeriesImage(file,options,geometry){
  if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('仅支持 PNG / JPG / WEBP');
  if(file.size>25*1024*1024)throw Error('图片超过 25 MB');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('无法解码图片'));image.src=url;});
    if(image.naturalWidth*image.naturalHeight>40000000)throw Error('图片超过 4000 万像素');
    const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.naturalWidth*ratio));c.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const context=c.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,c.width,c.height);
    const pixels=context.getImageData(0,0,c.width,c.height).data;
    const mode=['city','upper'].includes(options.imageMode)?'lights':options.imageMode==='auto'?IllustrationPipeline.detect(pixels,c.width,c.height):options.imageMode;
    const prepared=ImagePipeline.prepareSubject(pixels,c.width,c.height,{...options,cityFilter:mode==='lights'&&(options.cityFilter||options.imageMode==='city')});
    const result=(mode==='portrait'?PortraitPipeline:mode==='illustration'?IllustrationPipeline:ImagePipeline).extract(prepared.data,c.width,c.height,mode==='portrait'?{...options,threshold:options.portraitThreshold??38,budget:Math.min(2000,options.budget)}:options);
    const subjectMask=result.mask?{mask:result.mask,width:result.width,height:result.height}:null;
    const built=Reconstruction.reconstruct(result.dots,result.aspect,{...geometry,subjectMask});
    if(!built.points.length)throw Error('未提取到点阵，请在工作台调整识别参数后重试');
    const points=validateSavedModel({modelType:'preview-only-not-flight-plan',points:built.points});
    return {name:file.name,file,points,mode,options,geometry,subjectReview:prepared.upper?'上部鲜艳主体筛选，请检查完整性':prepared.groups?'已过滤疑似地面灯光，请核对':'请检查主体与建筑是否混入'};
  }finally{URL.revokeObjectURL(url);}
}
async function addSeriesFiles(files){
  if(imageSeries.busy)return;
  const incoming=Array.from(files).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
  if(imageSeries.frames.length+incoming.length>20){seriesMessage('每个系列最多 20 张，请减少选择数量。');return;}
  if([...imageSeries.frames.map(f=>f.file),...incoming].reduce((sum,f)=>sum+f.size,0)>100*1024*1024){seriesMessage('单个系列原图总大小不能超过 100 MB。');return;}
  stopImageSeries();setSeriesBusy(true);
  const errors=[];let added=0;const firstAdded=imageSeries.frames.length;
  // A selection on one photo must not silently crop every photo in a series.
  const options={...importOptions(),subjectKeep:null,subjectExclude:[]},geometry=reconstructionOptions();
  try{
    for(const file of incoming){
      seriesMessage(`识别 ${added+errors.length+1}/${incoming.length}：${file.name}…`);
      await new Promise(resolve=>setTimeout(resolve,0));
      try{imageSeries.frames.push(await decodeSeriesImage(file,options,geometry));added++;imageSeries.dirty=true;}
      catch(error){errors.push(`${file.name}：${error.message}`);}
    }
    seriesMessage(`已加入 ${added} 张，按文件名排序，可用箭头调整顺序。请点击「保存整个系列」。${errors.length?'\n未加入：'+errors.join('；'):''}`);
  }finally{setSeriesBusy(false);}
  if(added)await editSeriesSubject(firstAdded);
}
async function refreshSavedSeries(){
  const rows=await seriesStore('getAll');imageSeries.saved=new Map(rows.map(row=>[row.id,row]));
  const list=$('#series-saved');list.replaceChildren();
  if(!rows.length){const p=document.createElement('p');p.className='library-empty';p.textContent='还没有保存的系列。';list.append(p);}
  rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).forEach(row=>{
    const card=document.createElement('article');card.className='plan-card';
    const content=document.createElement('div');content.className='plan-card-content';
    const title=document.createElement('strong');title.textContent=row.name;
    const meta=document.createElement('small');meta.textContent=`${row.frames.length} 张原图 · ${row.count} 架 · ${new Date(row.updatedAt).toLocaleDateString('zh-CN')}`;content.append(title,meta);
    const button=document.createElement('button');button.className='button button-secondary';button.textContent='打开系列';
    button.onclick=()=>{
      if(imageSeries.busy)return;
      if(imageSeries.dirty&&!confirm('当前系列有未保存修改，放弃修改并打开此系列？'))return;
      stopImageSeries();imageSeries.id=row.id;imageSeries.frames=row.frames.slice();imageSeries.dirty=false;
      $('#series-name').value=row.name;$('#series-count').value=row.count;$('#series-hold').value=row.hold;
      renderSeriesFrames();seriesMessage('已打开系列，可在工作台分页编辑。');editSeriesSubject(0);
    };
    card.append(content,button);list.append(card);
  });
}
async function saveImageSeries(){
  if(imageSeries.busy)return;
  if(!imageSeries.frames.length){seriesMessage('请先加入图片。');return;}
  try{
    const settings=seriesSettings();setSeriesBusy(true);
    const row={id:imageSeries.id||`series-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name:$('#series-name').value.trim()||'未命名图片系列',frames:imageSeries.frames,...settings,updatedAt:new Date().toISOString()};
    await seriesStore('put',row);imageSeries.id=row.id;imageSeries.dirty=false;
    await refreshSavedSeries();seriesMessage('已保存整个系列：原图、点阵、顺序和播放设置。刷新后可重新打开。');
  }catch(error){seriesMessage(`保存失败，当前图片仍保留在页面中：${error.message}`);}
  finally{setSeriesBusy(false);}
}
function prepareSeriesPlaybackFrames(frames,count){
 const checked=frames.map(frame=>({...frame,points:validateSavedModel({modelType:'preview-only-not-flight-plan',points:frame.points})}));
 // Use one transform for a stationary lighting group, so scale never introduces
 // movement into "lights only" cues. Old projects retain their existing scale.
 for(let start=0;start<checked.length;){
   let end=start+1;while(end<checked.length&&checked[end].transitionMode==='lights')end++;
   if(checked.slice(start,end).every(f=>f.geometry?.compactBudget===true)){
     const prepared=checked.slice(start,end).map(f=>budgetImageSource(f.points,Math.min(count,f.lightCount??count),f.geometry));
     const scale=Math.min(...prepared.map(p=>p.scale));
     const combined=scaleLightPoints(prepared.flatMap(p=>p.source),scale);
     let offset=0;
     prepared.forEach((p,i)=>{checked[start+i].points=combined.slice(offset,offset+p.source.length);offset+=p.source.length;});
   }
   start=end;
 }
 return SeriesLighting.build(checked,count,resampleLightPoints);
}
function orderedSeriesPoints(frame,count){
  return resampleLightPoints(frame.points,count).sort((a,b)=>a.x-b.x||a.z-b.z||a.y-b.y);
}
function previewSeriesFrame(index){
  editSeriesSubject(index);
}
async function editSeriesSubject(index){
  const frame=imageSeries.frames[index];if(!frame||imageSeries.busy)return;
  setSeriesBusy(true);
  try{
  stopImageSeries();location.hash='studio';
  // Restore this frame's own recognition and geometry settings, then allow manual correction.
  const mapping={portraitDarkGap:'portrait-dark-gap',portraitThreshold:'portrait-threshold',threshold:'light-threshold',crop:'bottom-crop',gap:'sample-gap',imageMode:'image-mode',bgTolerance:'background-tolerance',budget:'art-budget',
    keepWhite:'keep-white',normalize:'normalize-light',removeBackground:'remove-paper',cityFilter:'city-filter',upperLimit:'upper-limit',vividStrength:'vivid-strength'};
  for(const [key,id] of Object.entries(mapping)){
    const value=frame.options?.[key],control=$('#'+id);if(value===undefined||!control)continue;
    if(typeof value==='boolean')control.checked=value;else control.value=value;
    const out=$('#'+id+'-value');if(out)out.textContent=value;
  }
  const geometry={compactBudget:'compact-budget',volumeBudget:'volume-budget',mode:'depth-method',depth:'relief-depth',join:'shape-join',smooth:'shape-smooth',fillHoles:'fill-shape',denoise:'remove-strays',monochrome:'model-monochrome'};
  if($('#compact-budget'))$('#compact-budget').checked=frame.geometry?.compactBudget===true;
  for(const [key,id] of Object.entries(geometry)){
    const value=frame.geometry?.[key];if(value===undefined)continue;
    if(typeof value==='boolean')$('#'+id).checked=value;else $('#'+id).value=value;
    const out=$('#'+id+'-value');if(out)out.textContent=value;
  }
  const loaded=await importLightImage(frame.file);
  if(!loaded||!upload.pixels||upload.fileName!==frame.file.name){uploadStatus('系列原图未成功载入，请重试。',true);return;}
  subjectSelection.keep=frame.options?.subjectKeep?{...frame.options.subjectKeep}:null;
  subjectSelection.exclude=(frame.options?.subjectExclude||[]).map(r=>({...r}));
  subjectSelection.seriesEdit=frame;
  await processUploadedPixels(false);
  setDroneCount(Math.min(Number($('#series-count').value)||10000,frame.lightCount??SeriesLighting.recommend(frame.points)));
  document.querySelector('[aria-controls="workflow-image"]').click();
  }catch(error){uploadStatus(`主体编辑打开失败：${error.message}`,true);}
  finally{setSeriesBusy(false);}
}
function startImageSeries(){
  if(imageSeries.busy)return;
  try{
    if(!imageSeries.frames.length)throw Error('请先加入至少一张图片。');
    const {count,hold}=seriesSettings();
    const frames=prepareSeriesPlaybackFrames(imageSeries.frames,count);
    if(frames.some(frame=>frame.points.length!==count))throw Error('存在空模型，无法开始演示。');
    if(frames.some(frame=>frame.points.some(p=>flight.height+p.z<0)))throw Error('部分造型低于地面，请在工作台提高基准高度。');
    stopImageSeries();clearUploadedImage();
    standaloneModel.points=frames[0].points;state.scenario='model';$('#scenario-select').value='model';presentation.preview=true;setDroneCount(count);
    presentation.preview=false;flight.phase='show';state.running=true;state.elapsed=0;
    imageSeries.playback={frames,index:0,hold,held:0,phase:'hold',count};
    let radius=20,minZ=Infinity,maxZ=-Infinity;
    for(const frame of frames)for(const p of frame.points){minZ=Math.min(minZ,p.z+flight.height);maxZ=Math.max(maxZ,p.z+flight.height);}
    presentation.center=(minZ+maxZ)/2;
    for(const frame of frames)for(const p of frame.points)radius=Math.max(radius,Math.hypot(p.x,p.y,p.z+flight.height-presentation.center));
    camera.distance=radius*3;camera.yaw=.25;camera.pitch=.12;
    fitSceneView(frames.flatMap(frame=>frame.points.map(p=>({x:p.x,y:p.y,z:p.z+flight.height}))));
    $('#series-player').hidden=false;location.hash='studio';syncWorkspacePlayback();updateSeriesPlayer();
  }catch(error){seriesMessage(error.message);}
}
function beginSeriesMorph(playback){
  playback.index++;playback.phase='transition';playback.held=0;
  playback.lightOnly=playback.frames[playback.index].transitionMode==='lights';playback.lightElapsed=0;
  playback.fromColors=presentation.points.map(p=>seriesRGB(p.color));
  const points=playback.frames[playback.index].points;standaloneModel.points=points;presentation.points=points.map(p=>({...p}));
  playback.toColors=points.map(p=>seriesRGB(p.color));
  const targets=points.map(p=>({x:p.x,y:p.y,z:p.z+flight.height}));
  let initialError=0,maxDistance=0;
  targets.forEach((p,i)=>{const d=state.drones[i],distance=Math.hypot(p.x-d.x,p.y-d.y,p.z-d.z);initialError+=distance;maxDistance=Math.max(maxDistance,distance);});
  flight.phase=playback.lightOnly?'hold':'transition';flight.transition={targets,initialError,remaining:initialError,elapsed:0,progress:0,arrived:0,complete:false,maxDistance};
  const cue=playback.frames[playback.index].transitionCue;
  playback.cueMotion=null;
  if(cue){
    playback.cueMotion=TransitionCues.create(state.drones.map((d,i)=>({...d,color:`rgb(${playback.fromColors[i].join(',')})`})),
      points.map(p=>({...p,z:p.z+flight.height})),cue,{vmax:flight.vmax,accel:flight.accel});
    playback.cueElapsed=0;flight.phase='hold';
  }
}
function seriesRGB(color){return color.startsWith('#')?[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)):(color.match(/\d+/g)||[]).slice(0,3).map(Number);}
function tickImageSeries(dt){
  const p=imageSeries.playback;if(!p)return;
  if(!state.running){updateSeriesPlayer();return;}
  if(state.count!==p.count||state.scenario!=='model'){stopImageSeries();return;}
  if(p.phase==='transition'){
    if(!flight.transition){stopImageSeries();return;}
    if(p.cueMotion){
      p.cueElapsed+=dt*state.speed;
      const samples=p.cueMotion.sample(p.cueElapsed);
      samples.forEach((q,i)=>{Object.assign(state.drones[i],q,{vx:0,vy:0,vz:0});presentation.points[i].color=q.color;});
      flight.transition.progress=Math.min(1,p.cueElapsed/p.cueMotion.duration);
      flight.transition.complete=p.cueElapsed>=p.cueMotion.duration;
    }else if(p.lightOnly){p.lightElapsed+=dt*state.speed;flight.transition.progress=Math.min(1,p.lightElapsed/.8);flight.transition.complete=p.lightElapsed>=.8;}
    const amount=flight.transition.progress;
    const target=p.frames[p.index].points;
    if(!p.cueMotion)presentation.points.forEach((point,i)=>{const a=p.fromColors[i],b=p.toColors[i];point.color=`rgb(${a.map((v,k)=>Math.round(v+(b[k]-v)*amount)).join(',')})`;});
    if(flight.transition.complete){p.phase='hold';p.held=0;presentation.points=target.map(point=>({...point}));}
  }else{
    p.held+=dt*state.speed;
    if(p.held>=p.hold){
      if(p.index+1<p.frames.length)beginSeriesMorph(p);
      else{imageSeries.playback=null;state.running=false;$('#series-player-status').textContent=`演示完成 · ${p.frames.length} 幕`;$('#series-pause').disabled=true;syncWorkspacePlayback();return;}
    }
  }
  updateSeriesPlayer();
}
function updateSeriesPlayer(){
  const p=imageSeries.playback;if(!p)return;
  $('#series-player-status').textContent=`${p.index+1}/${p.frames.length} · ${p.frames[p.index].name} · 本幕亮灯 ${p.frames[p.index].litCount}/${p.count} 架 · ${p.phase==='hold'?'停留':`变换 ${Math.round((flight.transition?.progress||0)*100)}%${p.cueMotion?' · 实际 '+p.cueMotion.duration.toFixed(1)+' 秒':''}`}${state.running?'':' · 已暂停'}`;
  $('#series-pause').disabled=false;$('#series-pause').textContent=state.running?'暂停系列':'继续系列';
}
function stopImageSeries(){
  if(imageSeries.playback){imageSeries.playback=null;state.running=false;}
  const player=$('#series-player');if(player)player.hidden=true;
}
function routeLibrary(){
  const isLibrary=location.hash==='#library';
  if(isLibrary&&imageSeries.playback){state.running=false;updateSeriesPlayer();}
  document.querySelector('.workspace').hidden=isLibrary;$('#library-page').hidden=!isLibrary;
  for(const id of ['reset-btn','play-btn','sim-status'])$('#'+id).hidden=isLibrary;
  $('#library-link').setAttribute('aria-current',isLibrary?'page':'false');$('#studio-link').setAttribute('aria-current',isLibrary?'false':'page');
  if(!isLibrary)requestAnimationFrame(()=>{resize();syncWorkspacePlayback();});
}
function setupImageSeries(){
  const bar=document.createElement('div');bar.id='series-player';bar.className='series-player';bar.hidden=true;
  bar.innerHTML='<strong id="series-player-status"></strong><button id="series-pause" class="button button-secondary">暂停系列</button><button id="series-stop" class="button button-ghost">结束系列</button><a href="#library" class="button button-ghost">返回图片系列</a>';
  document.querySelector('.stage-heading').after(bar);
  $('#series-pause').onclick=()=>{if(imageSeries.playback){state.running=!state.running;updateSeriesPlayer();syncWorkspacePlayback();}};
  $('#series-stop').onclick=()=>{stopImageSeries();presentation.preview=true;previewFormation();syncWorkspacePlayback();};
  $('#series-files').onchange=e=>{addSeriesFiles(e.target.files);e.target.value='';};
  $('#series-save').onclick=saveImageSeries;$('#series-play').onclick=startImageSeries;
  $('#series-new').onclick=()=>{
    if(imageSeries.busy||imageSeries.dirty&&!confirm('当前系列尚未保存，放弃修改并新建？'))return;
    stopImageSeries();imageSeries.id=null;imageSeries.frames=[];imageSeries.dirty=false;$('#series-name').value='';renderSeriesFrames();seriesMessage('新系列已准备好，请添加图片。');
  };
  for(const id of ['series-name','series-count','series-hold'])$('#'+id).addEventListener('input',()=>imageSeries.dirty=true);
  document.addEventListener('dragover',e=>{if(location.hash==='#library')e.preventDefault();});
  document.addEventListener('drop',e=>{if(location.hash==='#library'){e.preventDefault();if(e.dataTransfer?.files?.length)addSeriesFiles(e.dataTransfer.files);}});
  // Manual changes terminate sequencing before the existing control changes the model.
  document.querySelector('.workspace').addEventListener('input',e=>{if(!e.target.closest('#series-player')&&e.target.id!=='speed-range')stopImageSeries();},true);
  document.querySelector('.workspace').addEventListener('change',e=>{if(e.target.id!=='speed-range')stopImageSeries();},true);
  document.addEventListener('click',e=>{const button=e.target.closest('button');if(button&&['reset-btn','preview-btn','transition-btn','takeoff-btn','land-btn','emergency-btn','add-drone-btn','remove-drone-btn','clear-image-btn'].includes(button.id))stopImageSeries();},true);
  window.addEventListener('hashchange',routeLibrary);
  window.addEventListener('beforeunload',e=>{if(imageSeries.dirty||imageSeries.busy){e.preventDefault();e.returnValue='';}});
  renderSeriesFrames();refreshSavedSeries().catch(error=>seriesMessage(`本地系列存储不可用：${error.message}。仍可导入并临时演示。`));routeLibrary();
}
setupImageSeries();
