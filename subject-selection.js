/* Subject selection works on original-image coordinates; selection never stretches the image. */
const subjectSelection={keep:null,exclude:[],history:[],prepared:null,drag:null,seriesEdit:null,overlay:null,overlaySource:null};
function resetSubjectSelection(reprocess=true){
  subjectSelection.keep=null;subjectSelection.exclude=[];subjectSelection.history=[];subjectSelection.prepared=null;subjectSelection.seriesEdit=null;
  subjectSelection.overlay=null;subjectSelection.overlaySource=null;
  const canvas=$('#subject-canvas');if(canvas)canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  const update=$('#subject-update-series');if(update)update.hidden=true;
  const navigation=$('#series-edit-navigation');if(navigation)navigation.hidden=true;
  if(typeof renderWorkbenchSeries==='function')renderWorkbenchSeries();
  if(reprocess&&upload.pixels)processUploadedPixels(false);
}
function rememberSubjectSelection(){
  subjectSelection.history.push({keep:subjectSelection.keep?{...subjectSelection.keep}:null,exclude:subjectSelection.exclude.map(r=>({...r}))});
}
function renderSubjectSelection(prepared=subjectSelection.prepared){
  subjectSelection.prepared=prepared;
  const canvas=$('#subject-canvas'),context=canvas.getContext('2d');
  if(!upload.image){context.clearRect(0,0,canvas.width,canvas.height);return;}
  canvas.width=480;canvas.height=Math.max(1,Math.round(480*upload.height/upload.width));
  context.drawImage(upload.image,0,0,canvas.width,canvas.height);
  if(prepared){
    if(subjectSelection.overlaySource!==prepared){
      const maskCanvas=document.createElement('canvas');maskCanvas.width=upload.width;maskCanvas.height=upload.height;
      const maskContext=maskCanvas.getContext('2d'),image=maskContext.createImageData(upload.width,upload.height);
      for(let i=0;i<prepared.mask.length;i++)if(prepared.mask[i]){image.data[i*4]=245;image.data[i*4+1]=65;image.data[i*4+2]=85;image.data[i*4+3]=115;}
      maskContext.putImageData(image,0,0);subjectSelection.overlay=maskCanvas;subjectSelection.overlaySource=prepared;
    }
    context.drawImage(subjectSelection.overlay,0,0,canvas.width,canvas.height);
  }
  const box=(r,color)=>{context.strokeStyle=color;context.lineWidth=2;context.strokeRect(r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height);};
  if(subjectSelection.keep)box(subjectSelection.keep,'#79f5ba');
  subjectSelection.exclude.forEach(r=>box(r,'#ff647d'));
  if(subjectSelection.drag)box(selectionRect(subjectSelection.drag.start,subjectSelection.drag.end),'#ffffff');
  $('#subject-status').textContent=subjectSelection.keep?
    `主体已框选，已排除 ${subjectSelection.exclude.length} 块区域；框内图案保持原比例。`:
    prepared?.upper?`上部主体优先：保留上方 ${Math.round(prepared.upperLimit*100)}%，颜色强度 ${Math.round(prepared.vivid*100)}%。红区已排除；请检查图案是否完整，白色图案可降低颜色强度。`:
    prepared?.groups?`检测到 ${prepared.groups} 片疑似地面灯光，已屏蔽 ${prepared.suppressed} 个亮像素。请检查红区，误删时关闭自动过滤或框选主体。`:
    '没有足够证据自动排除建筑。请框选完整图案，或用排除框去掉楼宇；不要仅靠降低亮度阈值。';
  $('#subject-update-series').hidden=!subjectSelection.seriesEdit;
  syncUpperSubjectControls();
  syncSeriesEditNavigation();
}
function selectionRect(a,b){return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)};}
function setupSubjectSelection(){
  const canvas=$('#subject-canvas');
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
  canvas.addEventListener('pointerdown',e=>{if(!upload.image)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);subjectSelection.drag={start:point(e),end:point(e)};});
  canvas.addEventListener('pointermove',e=>{if(!subjectSelection.drag)return;subjectSelection.drag.end=point(e);renderSubjectSelection();});
  canvas.addEventListener('pointerup',e=>{
    if(!subjectSelection.drag)return;
    const rect=selectionRect(subjectSelection.drag.start,point(e));subjectSelection.drag=null;
    if(rect.w<.005||rect.h<.005){renderSubjectSelection();return;}
    rememberSubjectSelection();
    if($('#subject-action').value==='keep')subjectSelection.keep=rect;else subjectSelection.exclude.push(rect);
    processUploadedPixels(false);
  });
  canvas.addEventListener('pointercancel',()=>{subjectSelection.drag=null;renderSubjectSelection();});
  $('#subject-undo').onclick=()=>{const previous=subjectSelection.history.pop();if(previous){Object.assign(subjectSelection,previous);processUploadedPixels(false);}};
  $('#subject-reset').onclick=()=>{rememberSubjectSelection();subjectSelection.keep=null;subjectSelection.exclude=[];processUploadedPixels(false);};
  $('#city-filter').addEventListener('change',()=>processUploadedPixels(false));
  $('#image-mode').addEventListener('change',syncUpperSubjectControls);
  for(const id of ['upper-limit','vivid-strength'])$('#'+id).addEventListener('input',()=>{
    syncUpperSubjectControls();clearTimeout(upload.timer);upload.token++;
    upload.timer=setTimeout(()=>processUploadedPixels(false),180);
  });
  const update=document.createElement('button');update.id='subject-update-series';update.className='button button-secondary';update.textContent='将当前识别更新到原系列';update.hidden=true;
  update.onclick=()=>navigateSeriesEditor(0);
  canvas.parentElement.append(update);
}
function syncUpperSubjectControls(){
  $('#upper-subject-settings').hidden=$('#image-mode').value!=='upper';
  for(const id of ['upper-limit','vivid-strength'])$('#'+id+'-value').textContent=$('#'+id).value+'%';
}
let seriesEditNavigating=false;
function syncSeriesEditNavigation(){
  const bar=$('#series-edit-navigation');if(!bar)return;
  const index=typeof imageSeries!=="undefined"?imageSeries.frames.indexOf(subjectSelection.seriesEdit):-1;
  bar.hidden=index<0;if(typeof renderWorkbenchSeries==='function')renderWorkbenchSeries();if(index<0)return;
  $('#series-edit-position').textContent='图片系列 / 第 '+(index+1)+' 张，共 '+imageSeries.frames.length+' 张 · '+subjectSelection.seriesEdit.name;
  $('#series-edit-prev').disabled=seriesEditNavigating||index===0;
  $('#series-edit-next').disabled=seriesEditNavigating||index===imageSeries.frames.length-1;
  $('#series-edit-return').disabled=seriesEditNavigating;
  $('#series-edit-discard').disabled=seriesEditNavigating;
}
async function navigateSeriesEditor(direction,stay=false){
  if(seriesEditNavigating||imageSeries.busy)return;
  const frame=subjectSelection.seriesEdit,index=imageSeries.frames.indexOf(frame),next=index+direction;
  if(index<0||direction!==0&&(next<0||next>=imageSeries.frames.length))return;
  seriesEditNavigating=true;syncSeriesEditNavigation();
  try{
    clearTimeout(upload.timer);
    await processUploadedPixels(false);
    if(subjectSelection.seriesEdit!==frame||$('#subject-update-series').disabled||!upload.points.length){
      uploadStatus('当前识别未完成或没有有效点阵。请调整后重试，或点击“不保存返回”。',true);return;
    }
    frame.points=upload.points.map(p=>({...p}));frame.options=JSON.parse(JSON.stringify(importOptions()));
    frame.geometry=reconstructionOptions();frame.mode=upload.detectedMode;frame.subjectReview='已更新主体选区';
    imageSeries.dirty=true;renderSeriesFrames();
    if(direction===0&&!stay){subjectSelection.seriesEdit=null;location.hash='library';seriesMessage('已保留当前编辑，请点击“保存整个系列”写入本地。');}
    else if(direction!==0)await editSeriesSubject(next);
    return true;
  }catch(error){uploadStatus('切换失败：'+error.message,true);}
  finally{seriesEditNavigating=false;syncSeriesEditNavigation();}
}
setupSubjectSelection();
const editBar=document.createElement('div');editBar.id='series-edit-navigation';editBar.className='series-edit-navigation';editBar.hidden=true;
editBar.innerHTML='<strong id="series-edit-position"></strong><small>翻页会保留当前编辑；整组完成后保存系列。</small><div><button id="series-edit-return" class="button button-secondary">保存并返回系列</button><button id="series-edit-prev" class="button button-ghost">保存并上一张</button><button id="series-edit-next" class="button button-primary">保存并下一张</button><button id="series-edit-discard" class="button button-ghost">不保存返回</button></div>';
document.querySelector('.stage-heading').after(editBar);
$('#series-edit-return').onclick=()=>navigateSeriesEditor(0);
$('#series-edit-prev').onclick=()=>navigateSeriesEditor(-1);
$('#series-edit-next').onclick=()=>navigateSeriesEditor(1);
$('#series-edit-discard').onclick=()=>{if(seriesEditNavigating||imageSeries.busy)return;clearTimeout(upload.timer);upload.token++;subjectSelection.seriesEdit=null;syncSeriesEditNavigation();location.hash='library';};

