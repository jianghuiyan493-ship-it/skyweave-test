/* Presentation only: move existing controls, preserve their nodes and listeners. */
(function(){
  const steps=[
    ["assets","素材","选择示例，拖入图片，或导入已保存的模型。"],
    ["image","图像处理","识别类型、去底色和采样；处理参数只作用于上传图片。"],
    ["model","点阵模型","调整架数、模型厚度与平滑；切换分区不会重新生成模型。"],
    ["flight","飞行预演","设置播放倍率、基准高度和速度上限，再开始转场。"],
    ["export","视频导出","导出可播放的演示视频，支持当前造型或整个图片系列。"],
  ];
  function setupWorkspaceUI(){
    const sidebar=document.querySelector(".sidebar");
    const nav=document.createElement("nav");
    nav.className="workflow-nav";nav.setAttribute("aria-label","工作流程");
    const content=document.createElement("div");content.className="workflow-content";
    const panels=new Map(),buttons=new Map();
    let active="assets";
    for(const [id,title,description] of steps){
      const button=document.createElement("button");
      button.type="button";button.className="workflow-step";
      button.textContent=`${steps.findIndex(s=>s[0]===id)+1} ${title}`;
      button.setAttribute("aria-controls",`workflow-${id}`);
      const panel=document.createElement("section");
      panel.id=`workflow-${id}`;panel.className="workflow-pane";
      const h=document.createElement("h3");h.textContent=title;
      const p=document.createElement("p");p.className="workflow-help";p.textContent=description;
      panel.append(h,p);content.append(panel);nav.append(button);
      panels.set(id,panel);buttons.set(id,button);
      button.addEventListener("click",()=>select(id));
    }
    function select(id){
      active=id;
      for(const [key,panel] of panels){
        panel.hidden=key!==id;
        buttons.get(key).setAttribute("aria-current",key===id?"step":"false");
      }
      $("#workflow-current").textContent=steps.find(s=>s[0]===id)[1];
    }
    function move(id,node){if(!node)throw new Error("Missing workflow control: "+id);panels.get(id).append(node);}
    const range=id=>$(id).closest(".range-row");
    const imageSettings=$("#image-mode").closest("details");
    const modelSettings=$("#depth-method").closest("details");
    move("assets",document.querySelector('label[for="scenario-select"]'));
    move("assets",$("#scenario-select"));
    move("assets",$("#image-dropzone"));
    move("assets",$("#image-preview"));
    move("assets",$("#model-import").closest("label"));
    move("image",imageSettings);
    move("image",$("#cutout-panel"));
    move("image",$("#processed-panel"));
    move("model",modelSettings);
    move("model",range("#count-range"));
    move("model",$("#add-drone-btn").closest(".button-row"));
    move("flight",range("#speed-range"));
    move("flight",$("#height-number").closest("label"));
    move("flight",$("#velocity-number").closest("label"));
    move("flight",$("#takeoff-btn"));
    move("flight",$("#transition-btn"));
    move("flight",$("#land-btn"));
    const currentVideo=document.createElement('button');currentVideo.className='button button-primary';currentVideo.textContent='导出当前造型视频';currentVideo.onclick=()=>window.openVideoExport('current');
    const seriesVideo=document.createElement('button');seriesVideo.className='button button-secondary';seriesVideo.textContent='导出整个系列视频';seriesVideo.onclick=()=>window.openVideoExport('series');
    panels.get('export').append(currentVideo,seriesVideo);
    const backup=document.createElement('details');backup.className='import-settings';
    const backupTitle=document.createElement('summary');backupTitle.textContent='高级：模型数据备份';backup.append(backupTitle,$('#export-btn'));panels.get('export').append(backup);
    const exportNote=document.createElement("p");
    exportNote.className="workflow-help";
    exportNote.textContent="打开视频窗口后，可配城市夜景，点击“从头录制并导出”。完成后回看并下载 MP4 / WebM（按浏览器支持提供）。当前单张造型导出为 5 秒展示视频。";
    panels.get("export").append(exportNote);
    // Hide only redundant or unimplemented controls, not their event targets.
    document.querySelector(".control-grid").hidden=true;
    range("#cohesion-range").hidden=true; // parameter has no effect in current 3D kernel
    sidebar.querySelector(".divider").hidden=true;
    sidebar.querySelector(".panel-heading.compact").hidden=true;
    sidebar.querySelector(".image-import").hidden=true;
    const status=document.createElement("div");status.className="workflow-status";
    status.append($("#import-status"));
    sidebar.querySelector("h2").textContent="工作流程";
    sidebar.querySelector(".section-kicker").textContent="PROJECT WORKSPACE";
    sidebar.querySelector(".panel-heading").after(nav,content,status);
    const footer=document.createElement("div");footer.className="workflow-navigation";
    for(const [text,delta] of [["← 上一步",-1],["下一步 →",1]]){
      const b=document.createElement("button");b.className="button button-ghost";b.textContent=text;
      b.addEventListener("click",()=>{
        const n=steps.findIndex(s=>s[0]===active);
        select(steps[Math.max(0,Math.min(steps.length-1,n+delta))][0]);
      });footer.append(b);
    }
    sidebar.append(footer);
    $("#image-input").addEventListener("change",()=>select("image"));
    document.addEventListener("drop",e=>{if(location.hash!=="#library"&&e.dataTransfer?.files?.length)select("image");});
    $("#model-import").addEventListener("change",()=>select("model"));
    $("#preview-btn").textContent="静态造型";
    $("#reset-btn").textContent="回到静态造型";
    $("#reset-btn").title="停止预演并回到当前目标，不删除图片与模型参数";
    $("#reset-btn").addEventListener("click",()=>{
      state.elapsed=0;presentation.preview=true;previewFormation();
    },true);
    document.addEventListener("click",syncWorkspacePlayback);
    select("assets");
    syncWorkspacePlayback();
  }
  setupWorkspaceUI();
})();
function syncWorkspacePlayback(){
  const preview=flight.phase==="preview";
  $("#play-btn").disabled=preview;
  const label=preview?"静态预览":state.running?"暂停预演":"继续预演";
  if($("#play-btn").textContent!==label)$("#play-btn").textContent=label;
}
