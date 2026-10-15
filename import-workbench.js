/* Single-image actions stay reachable throughout editing. */
(function(){
  const toolbar=document.createElement('section');toolbar.className='single-image-actions';
  toolbar.innerHTML='<div class="single-image-heading"><strong>单图工作台</strong><span id="single-image-name">添加图片开始创作</span></div><div class="single-image-buttons"><button class="button button-primary" id="single-import">＋ 导入 / 替换图片</button><button class="button button-secondary" id="single-process">重新识别</button><button class="button button-secondary" id="single-export">导出视频</button><button class="button button-ghost" id="single-download">保存识别预览</button></div><p id="single-import-state" role="status">支持 PNG / JPG / WEBP，可拖入画布。先识别主体，再调整模型。</p>';
  document.querySelector('.workflow-nav').before(toolbar);
  const selectStep=id=>document.querySelector('[aria-controls="workflow-'+id+'"]').click();
  $('#single-import').onclick=()=>$('#image-input').click();
  $('#single-process').onclick=async()=>{if(!upload.pixels)return;selectStep('image');await processUploadedPixels(false);};
  $('#single-export').onclick=()=>window.openVideoExport('current');
  $('#single-download').onclick=()=>{
    const source=$('#processed-preview').getAttribute('src');if(!source)return;
    const a=document.createElement('a');a.href=source;a.download=(upload.fileName||'image').replace(/\.[^.]+$/,'')+'-点阵预览.png';a.click();
  };
  $('#fit-view').onclick=()=>{fitSceneView(flight.transition?state.drones.concat(flight.transition.targets):state.drones);};
  for(const size of ['large','fullscreen','standard']){
    document.querySelector('[data-view-size="'+size+'"]').addEventListener('click',()=>{
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(camera.autoFit)fitSceneView(flight.transition?state.drones.concat(flight.transition.targets):state.drones);
      }));
    });
  }
  function sync(){
    const available=!!upload.pixels;
    $('#single-image-name').textContent=available?upload.fileName:'添加图片开始创作';
    $('#single-process').disabled=!available;
    $('#single-download').disabled=!available||!upload.points.length;
    $('#single-export').disabled=!presentation.points.length;
    $('#single-import-state').textContent=$('#import-status').textContent;
  }
  new MutationObserver(sync).observe($('#import-status'),{childList:true,characterData:true,subtree:true});
  sync();
  // Keep preview comparison next to recognition controls rather than in a separate workflow step.
  const comparison=document.createElement('details');comparison.className='image-comparison';comparison.open=true;
  const title=document.createElement('summary');title.textContent='原图 / 识别结果对照';comparison.append(title);
  comparison.append($('#image-preview'),$('#cutout-panel'),$('#processed-panel'));
  const pane=$('#workflow-image');pane.insertBefore(comparison,pane.children[2]||null);
})();
