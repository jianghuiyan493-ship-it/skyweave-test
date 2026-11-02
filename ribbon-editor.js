(function(){
  const panel=document.createElement('details');panel.className='import-settings';panel.open=true;
  const summary=document.createElement('summary');summary.textContent='空间光带 · 曲面点阵建模';panel.append(summary);
  const note=document.createElement('p');note.textContent='按螺旋曲线构建四条带状曲面，保留带宽、收束与前后交错。参考造型，不是自动识图；不会覆盖已导入的图片。';panel.append(note);
  for(const [key,label,min,max,step] of [
    ['turns','旋转圈数',.25,5,.05],['width','带宽 m',1,35,1],
    ['radius','螺旋半径 m',5,70,1],['height','光带高度 m',30,250,1],
    ['separation','两组间距 m',40,220,1],['depthScale','纵深比例',.2,1.5,.05]]){
    const row=document.createElement('label');row.className='range-row';
    const caption=document.createElement('span'),out=document.createElement('output');
    caption.textContent=label+' ';out.textContent=ribbonSettings[key];caption.append(out);
    const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=ribbonSettings[key];input.setAttribute('aria-label',label);
    input.oninput=()=>{ribbonSettings[key]=Number(input.value);out.textContent=input.value;
      if(state.scenario==='ribbon'){stopImageSeries();presentation.preview=true;previewFormation();}};
    row.append(caption,input);panel.append(row);
  }
  const button=document.createElement('button');button.className='button button-primary full-width';button.textContent='生成参考光带 · 4000 架';
  button.onclick=()=>{
    stopImageSeries();state.scenario='ribbon';$('#scenario-select').value='ribbon';
    presentation.preview=true;state.running=false;setDroneCount(4000);syncWorkspacePlayback();
  };panel.append(button);
  const modelControls=$('#depth-method').closest('details');modelControls.before(panel);
  if(new URLSearchParams(location.search).get('demo')==='ribbon')button.click();
})();
