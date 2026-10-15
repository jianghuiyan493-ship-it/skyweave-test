/* One active series, editable directly inside the modeling workbench. */
let workbenchSeriesURLs=[];
let workbenchSeriesSignature='';
function renderWorkbenchSeries(){
  const bar=document.querySelector('#workbench-series');if(!bar)return;
  const frames=imageSeries.frames,active=frames.indexOf(subjectSelection.seriesEdit);
  bar.hidden=!frames.length;
  $('#workbench-series-title').textContent=($('#series-name').value||'当前图片系列')+' · '+frames.length+' 张'+(active>=0?' · 正在编辑第 '+(active+1)+' 张':'');
  const signature=frames.map(f=>f.name).join('|');
  if(signature!==workbenchSeriesSignature||bar._frames?.some((f,i)=>f!==frames[i])){
    workbenchSeriesURLs.forEach(url=>URL.revokeObjectURL(url));workbenchSeriesURLs=[];
    const strip=$('#workbench-series-strip');strip.replaceChildren();
    frames.forEach((frame,i)=>{
      const button=document.createElement('button');button.type='button';button.className='workbench-frame';button.dataset.index=i;
      const image=document.createElement('img');image.src=URL.createObjectURL(frame.file);workbenchSeriesURLs.push(image.src);image.alt='';
      const label=document.createElement('span');label.textContent=(i+1)+'. '+frame.name;button.title=frame.name;button.append(image,label);
      button.onclick=async()=>{
        if(imageSeries.busy||seriesEditNavigating||i===imageSeries.frames.indexOf(subjectSelection.seriesEdit))return;
        const current=imageSeries.frames.indexOf(subjectSelection.seriesEdit);
        if(current>=0)await navigateSeriesEditor(i-current);
        else await editSeriesSubject(i);
      };strip.append(button);
    });
    workbenchSeriesSignature=signature;bar._frames=frames.slice();
  }
  for(const button of bar.querySelectorAll('.workbench-frame')){
    button.setAttribute('aria-current',Number(button.dataset.index)===active?'true':'false');button.disabled=imageSeries.busy||seriesEditNavigating;
  }
}
(function(){
  const bar=document.createElement('section');bar.id='workbench-series';bar.hidden=true;
  bar.innerHTML='<div class="workbench-series-heading"><strong id="workbench-series-title"></strong><div><button id="workbench-series-save" class="button button-secondary">保存整个系列</button><button id="workbench-series-play" class="button button-secondary">演示系列</button><button id="workbench-series-video" class="button button-primary">导出系列视频</button><a href="#library" class="button button-ghost">系列管理</a></div></div><div id="workbench-series-strip" aria-label="选择系列中的图片"></div><p id="workbench-series-status" role="status">点击缩略图直接编辑；切换图片会保留当前修改，保存系列后写入本地。</p>';
  document.querySelector('.stage-heading').after(bar);
  async function flush(){
    if(imageSeries.busy||seriesEditNavigating)return false;
    if(imageSeries.frames.includes(subjectSelection.seriesEdit))return await navigateSeriesEditor(0,true);
    return true;
  }
  $('#workbench-series-save').onclick=async()=>{if(await flush()){await saveImageSeries();$('#workbench-series-status').textContent=$('#series-status').textContent;}};
  $('#workbench-series-play').onclick=async()=>{if(await flush())startImageSeries();};
  $('#workbench-series-video').onclick=async()=>{if(await flush())window.openVideoExport('series');};
  const importButton=document.createElement('button');importButton.className='button button-secondary';importButton.textContent='＋ 导入图片系列';
  importButton.onclick=async()=>{if(await flush())$('#series-files').click();};
  document.querySelector('.single-image-buttons').append(importButton);
  new MutationObserver(renderWorkbenchSeries).observe($('#series-frames'),{childList:true});
  new MutationObserver(()=>{$('#workbench-series-status').textContent=$('#series-status').textContent;}).observe($('#series-status'),{childList:true,characterData:true,subtree:true});
  $('#series-name').addEventListener('input',renderWorkbenchSeries);
  for(const [id,event] of [['count-range','input'],['count-number','change']]){
    $('#'+id).addEventListener(event,()=>{
      const frame=subjectSelection.seriesEdit;if(!imageSeries.frames.includes(frame))return;
      frame.lightCount=state.count;imageSeries.dirty=true;
    });
  }
  renderWorkbenchSeries();
})();
