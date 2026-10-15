/* City-photo compositing and real-time local video export, independent of editor state. */
(function(){
  const dialog=document.createElement("dialog");dialog.id="video-dialog";
  dialog.innerHTML=`
    <header class="video-header"><div><div class="section-kicker">CITY SHOW / VIDEO</div><h2>城市夜景 · 系列演示视频</h2></div><button id="video-close" class="button button-ghost">关闭</button></header>
    <div class="video-layout"><div class="video-screen"><canvas id="video-canvas" width="1280" height="720" aria-label="城市夜景合成预览"></canvas>
      <p id="video-status" role="status" aria-live="polite">上传你的城市夜景，或使用内置示意城市。</p>
      <video id="video-result" controls playsinline hidden aria-label="导出视频回看"></video>
      <a id="video-download" class="button button-primary" hidden>下载完整演示视频</a>
    </div>
    <aside class="video-settings"><fieldset id="video-options">
      <label class="button button-secondary">上传城市夜景<input id="video-background" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
      <button id="video-default-bg" class="button button-ghost">使用示意城市</button>
      <p id="video-bg-name">当前：内置示意城市（非真实城市）</p>
      <label>输出尺寸<select id="video-resolution" class="select"><option value="720">1280 × 720</option><option value="1080">1920 × 1080</option></select></label>
      <label>视频格式<select id="video-format" class="select"></select></label>
      <label>图案左右位置 <output id="video-x-value">50%</output><input id="video-x" type="range" min="10" max="90" value="50"></label>
      <label>图案上下位置 <output id="video-y-value">35%</output><input id="video-y" type="range" min="10" max="85" value="35"></label>
      <label>图案大小 <output id="video-scale-value">70%</output><input id="video-scale" type="range" min="15" max="100" value="70"></label>
      <label>夜景亮度 <output id="video-bg-light-value">75%</output><input id="video-bg-light" type="range" min="15" max="100" value="75"></label>
      <label>检查某一幕<select id="video-scene" class="select"></select></label>
      <p>沿用系列顺序、各幕亮灯架数和每幕停留时间，以及工作台的限速。完整视频含全部变换与末幕停留，无音轨。</p>
    </fieldset>
    <div class="video-buttons"><button id="video-preview" class="button button-secondary">从头预览系列</button><button id="video-record" class="button button-primary">从头录制并导出</button><button id="video-cancel" class="button button-ghost" disabled>停止 / 取消</button></div>
    <p>实时录制约需播放同样长的时间，请保持本页面可见。夜景为二维背景合成，可手动调整构图，尚不模拟建筑遮挡、反射或真实飞行。</p>
    </aside></div>`;
  document.body.append(dialog);
  // The editor's document shortcuts/drop targets must not consume modal interactions.
  dialog.addEventListener("keydown",event=>event.stopPropagation());
  dialog.addEventListener("dragover",event=>{event.preventDefault();event.stopPropagation();});
  dialog.addEventListener("drop",event=>{event.preventDefault();event.stopPropagation();});
  const el=id=>dialog.querySelector("#video-"+id),c=el("canvas"),context=c.getContext("2d",{alpha:false});
  let frames=[],engine=null,bounds=null,background=null,backgroundURL=null,downloadURL=null,job=null,raf=0,loading=false;
  let sessionSettings;
  const formats=[
    ["video/mp4;codecs=avc1.42E01E","MP4 / H.264"],
    ["video/mp4","MP4"],
    ["video/webm;codecs=vp9","WebM / VP9"],
    ["video/webm;codecs=vp8","WebM / VP8"],
    ["video/webm","WebM"]
  ];
  function status(text){el("status").textContent=text;}
  function busy(value){
    el("options").disabled=value;el("preview").disabled=value||loading;
    el("record").disabled=value||loading||!el("format").options.length;
    el("cancel").disabled=!value;el("close").disabled=value;
  }
  // Fixed camera computed across the entire series avoids per-scene scale jumps.
  function projected(p){return {x:p.x*.9800666-p.y*.1986693,y:p.z*.9950042+(p.x*.1986693+p.y*.9800666)*.0998334};}
  function calculateBounds(){
    bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
    for(const frame of frames)for(const p of frame.points){const v=projected(p);bounds.minX=Math.min(bounds.minX,v.x);bounds.maxX=Math.max(bounds.maxX,v.x);bounds.minY=Math.min(bounds.minY,v.y);bounds.maxY=Math.max(bounds.maxY,v.y);}
  }
  function drawBackground(){
    const w=c.width,h=c.height;
    context.fillStyle="#030913";context.fillRect(0,0,w,h);
    context.save();context.globalAlpha=Number(el("bg-light").value)/100;
    if(background){
      const scale=Math.max(w/background.naturalWidth,h/background.naturalHeight);
      const bw=background.naturalWidth*scale,bh=background.naturalHeight*scale;
      context.drawImage(background,(w-bw)/2,(h-bh)/2,bw,bh);
    }else{
      const gradient=context.createLinearGradient(0,0,0,h);gradient.addColorStop(0,"#081020");gradient.addColorStop(.7,"#25364d");gradient.addColorStop(1,"#0c1422");
      context.fillStyle=gradient;context.fillRect(0,0,w,h);
      for(let i=0;i<31;i++){
        const bx=i*w/30,bw=w/31,bh=h*(.11+((i*17)%13)/70),by=h*.94-bh;
        context.fillStyle=i%2?"#080e19":"#101b2b";context.fillRect(bx,by,bw,bh);
        for(let row=0;row<12;row++)for(let col=0;col<4;col++)if((row*13+col*7+i)%4!==0){
          context.fillStyle=(row+i)%3?"#beaa79":"#79a4be";
          context.fillRect(bx+bw*(.12+col*.22),by+bh*(.08+row*.07),Math.max(1,w*.002),Math.max(1,h*.003));
        }
      }
      context.fillStyle="#080d16";context.fillRect(0,h*.94,w,h*.06);
    }
    context.restore();
  }
  function draw(){
    drawBackground();
    if(!bounds||!engine)return;
    const w=c.width,h=c.height,size=Number(el("scale").value)/100;
    const scale=Math.min(w*.86/Math.max(1,bounds.maxX-bounds.minX),h*.68/Math.max(1,bounds.maxY-bounds.minY))*size;
    const mx=(bounds.minX+bounds.maxX)/2,my=(bounds.minY+bounds.maxY)/2;
    const ox=w*Number(el("x").value)/100,oy=h*Number(el("y").value)/100;
    const radius=Math.max(.7,Math.min(2.2,1.05*w/1280));
    for(const d of engine.drones){
      if(d.color==="#000000"||d.color==="rgb(0,0,0)")continue;
      const p=projected(d),x=ox+(p.x-mx)*scale,y=oy-(p.y-my)*scale;
      context.fillStyle=d.color;context.globalAlpha=.13;context.beginPath();context.arc(x,y,radius*2,0,Math.PI*2);context.fill();
      context.globalAlpha=1;context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.fill();
    }
    context.globalAlpha=1;
    context.font=`${Math.round(w*.012)}px "Microsoft YaHei",sans-serif`;
    context.fillStyle="#050a14bd";context.fillRect(12,h-h*.054,w*.30,h*.042);
    context.fillStyle="#e1eafa";context.fillText("SKYWEAVE · 模拟演示 / 非实拍",w*.02,h*.97);
  }
  function resetEngine(){
    engine=VideoSeriesEngine.create(frames,sessionSettings);
  }
  function clearDownload(){
    el("result").pause();el("result").removeAttribute("src");el("result").load();el("result").hidden=true;
    el("download").hidden=true;
    if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;
  }
  function release(jobValue){
    if(job!==jobValue)return;
    cancelAnimationFrame(raf);
    if(jobValue.stream)jobValue.stream.getTracks().forEach(t=>t.stop());
    job=null;busy(false);
  }
  function fail(message){
    if(!job){status(message);return;}
    job.cancelled=true;job.error=message;
    cancelAnimationFrame(raf);
    if(job.recorder&&job.recorder.state!=="inactive")job.recorder.stop();
    else{const old=job;release(old);status(message);}
  }
  function complete(){
    if(!job)return;
    cancelAnimationFrame(raf);
    if(job.recorder){
      const old=job;
      // Keep final pose visible for at least one captured frame, including zero-hold series.
      old.finishing=true;
      setTimeout(()=>{if(job===old&&old.recorder.state!=="inactive")old.recorder.stop();},120);
    }else{const old=job;release(old);status("完整系列预览结束。可以调整构图后录制。");}
  }
  function animate(now){
    if(!job||job.finishing)return;
    const dt=Math.min(.20,Math.max(0,(now-job.last)/1000));job.last=now;
    try{
      engine.advance(dt);draw();
      if(now-job.lastStatus>400){
        status(`${job.recorder?"录制":"预览"} ${engine.index+1}/${frames.length} 幕 · 目标亮灯 ${frames[engine.index].litCount??engine.drones.length} 架 · ${engine.phase==="hold"?"造型停留":"连续变换"} · ${Math.floor(engine.elapsed)} 秒`);
        job.lastStatus=now;
      }
      if(now-job.started>10*60*1000){fail("演示超过 10 分钟上限，已停止且未输出完整视频。请减少停留、架数或缩短系列后重试。");return;}
      if(engine.done){complete();return;}
      raf=requestAnimationFrame(animate);
    }catch(error){fail("演示失败："+error.message);}
  }
  function start(record){
    if(job||loading)return;
    try{
      if(document.hidden)throw Error("请保持页面可见后再开始");
      resetEngine();draw();
      const current={last:performance.now(),started:performance.now(),lastStatus:0,cancelled:false,chunks:[],bytes:0};
      if(record){
        if(!window.MediaRecorder||!c.captureStream)throw Error("当前浏览器不支持本地视频录制");
        clearDownload();
        current.stream=c.captureStream(30);
        try{
          current.recorder=new MediaRecorder(current.stream,{mimeType:el("format").value,videoBitsPerSecond:c.height===1080?10000000:6000000});
        }catch(error){current.stream.getTracks().forEach(t=>t.stop());throw error;}
        current.recorder.ondataavailable=event=>{
          if(event.data.size){current.chunks.push(event.data);current.bytes+=event.data.size;}
          if(current.bytes>400*1024*1024&&!current.cancelled)fail("视频超过 400 MB 内存上限，已取消导出。请减少系列长度。");
        };
        current.recorder.onerror=event=>fail("视频编码失败："+(event.error?.message||"请改用其他格式或 720p 重试"));
        current.recorder.onstop=()=>{
          if(current.cancelled){release(current);status(current.error||"已取消，未生成不完整视频。");return;}
          const type=current.recorder.mimeType||el("format").value;
          const blob=new Blob(current.chunks,{type});
          release(current);
          if(!blob.size){status("没有生成视频数据，请改用其他格式重试。");return;}
          downloadURL=URL.createObjectURL(blob);
          const extension=type.includes("mp4")?"mp4":"webm";
          el("download").href=downloadURL;
          el("download").download=(($("#series-name").value||"城市夜景系列").replace(/[\\/:*?"<>|]/g,"-"))+"-模拟演示."+extension;
          el("download").hidden=false;el("result").src=downloadURL;el("result").hidden=false;
          status(`完整视频已生成 · ${frames.length} 幕 · ${c.width}×${c.height} · ${(blob.size/1024/1024).toFixed(1)} MB。请回看并下载。`);
        };
      }
      job=current;busy(true);
      if(current.recorder)current.recorder.start(1000);
      status(record?"开始录制整个系列，请保持页面可见…":"开始从头预览…");
      raf=requestAnimationFrame(animate);
    }catch(error){fail("无法开始："+error.message);}
  }
  function open(source="series"){
    if(imageSeries.busy){seriesMessage("请等待图片处理完成再导出。");return;}
    try{
      let count,hold;
      if(source==='current'){
        const points=validateSavedModel({modelType:'preview-only-not-flight-plan',points:presentation.points});
        if(!points.length)throw Error('请先导入图片或选择一个模型');
        count=points.length;hold=5;frames=[{name:upload.fileName||'当前造型',points}];
      }else{
        ({count,hold}=seriesSettings());
        if(!imageSeries.frames.length)throw Error('请先添加或打开一个图片系列');
        frames=prepareSeriesPlaybackFrames(imageSeries.frames,count);
      }
      if(frames.some(frame=>!frame.points.length))throw Error("存在空模型，请先修正识别结果");
      sessionSettings={hold,vmax:flight.vmax,accel:flight.accel};
      el("scene").replaceChildren();
      frames.forEach((frame,i)=>{const option=document.createElement("option");option.value=i;option.textContent=`${i+1}. ${frame.name}`;el("scene").append(option);});
      el("format").replaceChildren();
      for(const [type,label] of formats)if(window.MediaRecorder?.isTypeSupported(type)){const option=document.createElement("option");option.value=type;option.textContent=label;el("format").append(option);}
      calculateBounds();resetEngine();clearDownload();draw();busy(false);
      if(imageSeries.playback)state.running=false;
      dialog.showModal();
      status(el("format").options.length?`已载入 ${frames.length} 幕、${count} 架。上传城市夜景或使用示意城市，先预览构图，再从头录制。`:"浏览器未提供可用视频编码格式，可以预览，请用支持录制的浏览器导出。");
    }catch(error){seriesMessage("视频导出未打开："+error.message);uploadStatus("视频导出未打开："+error.message,true);}
  }
  $("#series-video").onclick=()=>open('series');
  window.openVideoExport=open;
  el("preview").onclick=()=>start(false);el("record").onclick=()=>start(true);
  el("cancel").onclick=()=>fail("已取消，未生成不完整视频。");
  el("close").onclick=()=>{if(!job&&!loading)dialog.close();};
  dialog.addEventListener("cancel",event=>{if(job||loading){event.preventDefault();if(job)status("请先点击“停止 / 取消”，再关闭视频窗口。");}});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&job)fail("页面转入后台，已取消以避免缺帧视频。请保持页面可见并重新录制。");});
  window.addEventListener("beforeunload",event=>{if(job){event.preventDefault();event.returnValue="";}});
  el("background").onchange=async event=>{
    const file=event.target.files[0];event.target.value="";if(!file||job)return;
    if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>25*1024*1024){status("请选择不超过 25 MB 的 PNG / JPG / WEBP 夜景图片。");return;}
    loading=true;busy(true);el("cancel").disabled=true;
    const url=URL.createObjectURL(file),image=new Image();
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error("图片无法解码"));image.src=url;});
      if(image.naturalWidth*image.naturalHeight>40000000)throw Error("图片超过 4000 万像素，请缩小后重试");
      if(backgroundURL)URL.revokeObjectURL(backgroundURL);
      background=image;backgroundURL=url;el("bg-name").textContent="当前夜景："+file.name;
      draw();status("夜景已载入，图片按铺满画面裁切。调整左右、上下和大小，把整组造型放到天空区域。");
    }catch(error){URL.revokeObjectURL(url);status("背景导入失败："+error.message);}
    finally{loading=false;busy(false);}
  };
  el("default-bg").onclick=()=>{if(backgroundURL)URL.revokeObjectURL(backgroundURL);backgroundURL=null;background=null;el("bg-name").textContent="当前：内置示意城市（非真实城市）";draw();};
  for(const id of ["x","y","scale","bg-light"])el(id).oninput=()=>{el(id+"-value").textContent=el(id).value+"%";draw();};
  el("resolution").onchange=()=>{c.height=Number(el("resolution").value);c.width=c.height*16/9;draw();};
  el("scene").onchange=()=>{engine=VideoSeriesEngine.create([frames[Number(el("scene").value)]],sessionSettings);draw();};
})();
