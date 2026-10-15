/* Three viewport sizes; presentation changes do not rebuild or reset the model. */
(function(){
  const stage=document.querySelector('.stage');
  let mode='standard',beforeFullscreen='large',pending=false;
  function resizeView(){requestAnimationFrame(()=>resize());}
  function applyMode(next){
    mode=next;
    document.body.dataset.viewSize=next;
    for(const button of document.querySelectorAll('[data-view-size]'))
      button.setAttribute('aria-pressed',String(button.dataset.viewSize===next));
    const status=document.querySelector('#view-size-status');
    status.hidden=next!=='fullscreen';
    status.textContent='全屏预览 · Esc 返回 · 点击“标准”恢复调试面板';
    resizeView();
  }
  async function setMode(next){
    if(pending)return;
    pending=true;
    try{
      if(next==='fullscreen'){
        if(mode==='fullscreen')return;
        beforeFullscreen=mode;
        applyMode(next);
        try{
          if(stage.requestFullscreen)await stage.requestFullscreen();
        }catch{
          // An embedded browser may disallow the native API. Keep a usable page-filling view.
          document.querySelector('#view-size-status').textContent='窗口全屏预览 · 浏览器未允许系统全屏 · Esc 返回';
        }
      }else{
        applyMode(next);
        if(document.fullscreenElement===stage)await document.exitFullscreen();
      }
    }catch(error){
      const status=document.querySelector('#view-size-status');status.hidden=false;
      status.textContent='显示模式切换未完成：'+error.message;
    }finally{pending=false;resizeView();}
  }
  for(const button of document.querySelectorAll('[data-view-size]'))
    button.addEventListener('click',()=>setMode(button.dataset.viewSize));
  document.addEventListener('fullscreenchange',()=>{
    if(!document.fullscreenElement&&mode==='fullscreen')applyMode(beforeFullscreen);
    resizeView();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&mode==='fullscreen'&&!document.fullscreenElement)setMode(beforeFullscreen);
  });
  window.addEventListener('hashchange',()=>{
    if(location.hash==='#library'&&mode!=='standard')setMode('standard');
  });
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resizeView).observe(stage);
  applyMode('standard');
})();
