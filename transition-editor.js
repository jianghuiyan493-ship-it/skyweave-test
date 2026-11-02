(function(){
  const host=document.createElement('section');host.className='panel cue-editor';
  host.innerHTML=`<div class="cue-heading"><div><div class="section-kicker">TRANSITION / TEXT</div><h3>文字转场编排</h3></div><p>描述控制“上一幕 → 此幕”。每次解析一个动作。</p></div>
    <div class="cue-fields">
      <label class="cue-field" for="cue-frame"><span>01 选择目标幕</span><select class="select" id="cue-frame"></select></label>
      <label class="cue-field" for="cue-text"><span>02 描述转场动作</span><textarea id="cue-text" class="select" rows="3" placeholder="例如：向上弧线 15米 8秒"></textarea></label>
    </div>
    <p class="cue-examples">示例：直线 8秒 · 向上弧线 15米 8秒 · 散开再聚合 20米 12秒 · 只变灯光 3秒</p>
    <div class="cue-actions"><button class="button button-primary" id="cue-apply">解析并应用</button><button class="button button-secondary" id="cue-preview">演示系列</button><button class="button button-ghost" id="cue-clear">清除文字转场</button></div>
    <p id="cue-result" role="status"></p>`;
  document.querySelector('#series-frames').before(host);
  const select=$('#cue-frame'),input=$('#cue-text'),result=$('#cue-result');
  function load(){const f=imageSeries.frames[Number(select.value)];input.value=f?.transitionText||'';result.textContent=f?.transitionCue?'已应用：'+f.transitionText+'。移动时长会按速度和加速度上限延长。':'填写描述后点击“解析并应用”。';}
  function refresh(){
    const previous=select.value;select.replaceChildren();
    imageSeries.frames.forEach((f,i)=>{if(!i)return;const o=document.createElement('option');o.value=i;o.textContent=`${i} → ${i+1} · ${f.name}`;select.append(o);});
    if([...select.options].some(o=>o.value===previous))select.value=previous;
    for(const id of ['cue-frame','cue-text','cue-apply','cue-preview','cue-clear'])$('#'+id).disabled=imageSeries.busy||imageSeries.frames.length<2;
    load();
  }
  select.onchange=load;
  $('#cue-apply').onclick=()=>{
    try{const cue=TransitionCues.parse(input.value),f=imageSeries.frames[Number(select.value)];
      stopImageSeries();f.transitionCue=cue;f.transitionText=input.value.trim();f.transitionMode=cue.kind==='lights'?'lights':'move';imageSeries.dirty=true;
      renderSeriesFrames();result.textContent='已应用：'+f.transitionText+'。请保存整个系列；预览和视频使用相同转场。';
    }catch(e){result.textContent=e.message+' 原转场未改变。';}
  };
  $('#cue-clear').onclick=()=>{const f=imageSeries.frames[Number(select.value)];stopImageSeries();delete f.transitionCue;delete f.transitionText;imageSeries.dirty=true;load();};
  $('#cue-preview').onclick=startImageSeries;
  new MutationObserver(refresh).observe($('#series-frames'),{childList:true});refresh();
})();
