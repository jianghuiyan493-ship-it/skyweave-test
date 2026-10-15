const upload = { image:null, pixels:null, width:0, height:0, dots:[], aspect:1,
  points:[], rawDots:[], removed:0, field:null, subjectMask:null, detectedMode:"lights", token:0, url:null, fileName:"", timer:null };
function uploadStatus(text,error=false) {
  $("#import-status").textContent=text;
  $("#import-status").classList.toggle("error",error);
}
function importOptions(){
  return {threshold:Number($("#light-threshold").value),crop:Number($("#bottom-crop").value),
    keepWhite:$("#keep-white").checked,gap:Number($("#sample-gap").value)||3,
    normalize:$("#normalize-light").checked,
    imageMode:$("#image-mode").value,
    upperLimit:Number($("#upper-limit")?.value??65),vividStrength:Number($("#vivid-strength")?.value??25),
    bgTolerance:Number($("#background-tolerance").value)||45,
    budget:Number($("#art-budget").value)||8000,
    removeBackground:$("#remove-paper").checked,
    cityFilter:!!$("#city-filter")?.checked,
    subjectKeep:typeof subjectSelection!=="undefined"?subjectSelection.keep:null,
    subjectExclude:typeof subjectSelection!=="undefined"?subjectSelection.exclude:[]};
}
function reconstructionOptions(){
  return {mode:$("#depth-method").value==="flat"?"flat":"contour",
    depth:Number($("#relief-depth").value),join:Number($("#shape-join").value)||3,
    smooth:Number($("#shape-smooth").value)||0,fillHoles:$("#fill-shape").checked,
    denoise:$("#remove-strays").checked,monochrome:$("#model-monochrome").checked};
}
function renderDepthPreview(){
  if(!upload.field)return;
  const f=upload.field,c=document.createElement("canvas");c.width=f.width;c.height=f.height;
  const context=c.getContext("2d");
  context.fillStyle="#060911";context.fillRect(0,0,c.width,c.height);
  for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){
    const i=y*f.width+x;if(!f.mask[i])continue;
    const value=Math.round(35+220*f.values[i]);
    context.fillStyle=`rgb(${Math.round(value*.45)},${Math.round(value*.8)},${value})`;
    context.fillRect(x,y,1,1);
  }
  $("#depth-preview").src=c.toDataURL("image/png");
}
function renderExtractionPreview(){
  const c=document.createElement("canvas");
  c.width=upload.width;c.height=Math.round(upload.width/upload.aspect);
  const context=c.getContext("2d");
  context.fillStyle="#060911";context.fillRect(0,0,c.width,c.height);
  for(const p of upload.dots){
    context.fillStyle=`rgb(${p.r},${p.g},${p.b})`;
    context.beginPath();context.arc(p.u*c.width,p.v*c.height,1,0,Math.PI*2);context.fill();
  }
  $("#processed-preview").src=c.toDataURL("image/png");
  $("#processed-panel").classList.remove("is-hidden");
}
function renderCutoutPreview(){
  const shape=upload.subjectMask;
  $("#cutout-panel").classList.toggle("is-hidden",!shape);
  if(!shape)return;
  const c=document.createElement("canvas");c.width=shape.width;c.height=shape.height;
  const context=c.getContext("2d"),image=context.createImageData(c.width,c.height);
  image.data.set(upload.pixels.subarray(0,c.width*c.height*4));
  for(let i=0;i<shape.mask.length;i++)if(!shape.mask[i])image.data[i*4+3]=0;
  context.putImageData(image,0,0);
  $("#cutout-preview").src=c.toDataURL("image/png");
}
function applyUploadedModel(resetCount) {
  const result=Reconstruction.reconstruct(upload.rawDots,upload.aspect,{...reconstructionOptions(),subjectMask:upload.subjectMask});
  upload.points=result.points;upload.dots=result.dots;upload.removed=result.removed;upload.field=result.field;
  renderExtractionPreview();renderDepthPreview();
  state.scenario="image";$("#scenario-select").value="image";
  presentation.preview=true;
  if(resetCount)state.count=Math.min(10000,upload.points.length);
  state.image=upload.image;
  previewFormation();updateMetrics();sceneMetrics();
  state.running=true;$("#play-btn").textContent="暂停仿真";
  updateUploadCountStatus();
}
function updateUploadCountStatus(){
  const source=upload.points.length,extra=Math.max(0,state.count-source);
  if(!source){uploadStatus("没有可用灯点，请上传图片或调整识别参数。",true);return;}
  const mode=upload.detectedMode==="illustration"?"插画：去底色 + 外轮廓 + 内部细节 + 色块采样":"灯光秀：亮点 + 细线采样";
  uploadStatus(`${mode}\n提取 ${source} 点 · 排除 ${upload.removed} 个孤立点 · 当前 ${state.count} 架\n${extra ? `另有 ${extra} 个生成补点（非原图细节）` : state.count<source ? "已按架数抽样；可点「采用全部提取点」恢复细节" : "使用全部提取点"}\n几何浮雕，不是完整人物或真实背面重建。`);
}
async function processUploadedPixels(resetCount=true) {
  if(!upload.pixels)return;
  const updateSeries=$("#subject-update-series");if(updateSeries)updateSeries.disabled=true;
  const token=++upload.token;
  uploadStatus("正在判断图片类型并提取图形…");
  await new Promise(resolve=>setTimeout(resolve,0));
  if(token!==upload.token)return;
  try{
    const options=importOptions();
    const mode=["city","upper"].includes(options.imageMode)?"lights":["lights","illustration"].includes(options.imageMode)?options.imageMode:IllustrationPipeline.detect(upload.pixels,upload.width,upload.height);
    const prepared=ImagePipeline.prepareSubject(upload.pixels,upload.width,upload.height,{...options,cityFilter:mode==="lights"&&(options.cityFilter||options.imageMode==="city")});
    const result=mode==="illustration"?
      IllustrationPipeline.extract(prepared.data,upload.width,upload.height,options):
      ImagePipeline.extract(prepared.data,upload.width,upload.height,options);
    if(token!==upload.token)return;
    upload.rawDots=result.dots;upload.aspect=result.aspect;upload.detectedMode=mode;
    upload.subjectMask=result.mask?{mask:result.mask,width:result.width,height:result.height}:null;
    for(const id of ["light-threshold","normalize-light","keep-white"])$("#"+id).disabled=mode==="illustration";
    renderCutoutPreview();
    applyUploadedModel(resetCount);
    if(typeof renderSubjectSelection==="function")renderSubjectSelection(prepared);
    if(updateSeries)updateSeries.disabled=!upload.points.length;
    if(!upload.dots.length)uploadStatus(mode==="illustration"?"未识别到有效图形。减小去底色容差，或关闭去底色；复杂背景暂不支持语义抠图。":"未识别到灯点。普通插画请切换「插画 / 普通图片」，不要只调整亮度阈值。",true);
  }catch(error){uploadStatus(`处理失败：${error.message}`,true);}
}
async function importLightImage(file) {
  if(!file)return;
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)){
    uploadStatus("请拖入 PNG、JPG 或 WEBP 图片。",true);return;
  }
  if(file.size>25*1024*1024){uploadStatus("图片超过 25 MB，请缩小后重试。",true);return;}
  const token=++upload.token, url=URL.createObjectURL(file),image=new Image();
  uploadStatus("读取图片…");
  try{
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error("图片无法解码"));image.src=url;});
    if(token!==upload.token){URL.revokeObjectURL(url);return;}
    if(image.naturalWidth*image.naturalHeight>40000000)throw new Error("图片超过 4000 万像素");
    const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const sample=document.createElement("canvas");
    sample.width=Math.max(1,Math.round(image.naturalWidth*ratio));
    sample.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const context=sample.getContext("2d",{willReadFrequently:true});
    context.drawImage(image,0,0,sample.width,sample.height);
    const pixels=context.getImageData(0,0,sample.width,sample.height).data;
    if(typeof resetSubjectSelection==="function")resetSubjectSelection(false);
    if(upload.url)URL.revokeObjectURL(upload.url);
    upload.url=url;upload.image=image;upload.pixels=pixels;
    upload.width=sample.width;upload.height=sample.height;upload.fileName=file.name;
    $("#image-preview img").src=url;$("#image-preview").classList.remove("is-hidden");
    await processUploadedPixels();
    return true;
  }catch(error){
    URL.revokeObjectURL(url);
    if(token===upload.token)uploadStatus(`导入失败：${error.message}`,true);
  }
}
function clearUploadedImage(){
  if(typeof resetSubjectSelection==="function")resetSubjectSelection(false);
  upload.token++;clearTimeout(upload.timer);
  if(upload.url)URL.revokeObjectURL(upload.url);
  Object.assign(upload,{image:null,pixels:null,dots:[],rawDots:[],points:[],field:null,subjectMask:null,removed:0,url:null});
  $("#image-input").value="";$("#image-preview img").removeAttribute("src");
  $("#image-preview").classList.add("is-hidden");
  $("#processed-panel").classList.add("is-hidden");
  $("#processed-preview").removeAttribute("src");
  $("#depth-preview").removeAttribute("src");
  $("#cutout-panel").classList.add("is-hidden");$("#cutout-preview").removeAttribute("src");
  state.image=null;state.imagePoints=[];
  state.scenario="reference";$("#scenario-select").value="reference";
  presentation.preview=true;setDroneCount(referenceDots.length);
  uploadStatus("拖入图片：自动区分灯光秀与普通插画，生成点阵浮雕。");
}
function setupImageWorkflow(){
  $("#image-input").addEventListener("change",e=>{importLightImage(e.target.files[0]);e.target.value="";});
  $("#clear-image-btn").addEventListener("click",clearUploadedImage);
  // Accept drops on the stage as well as the upload card, preventing file navigation.
  document.addEventListener("dragover",e=>{
    if(location.hash==="#library")return;
    if(!Array.from(e.dataTransfer?.types||[]).includes("Files"))return;
    e.preventDefault();e.dataTransfer.dropEffect="copy";$("#image-dropzone").classList.add("is-dragging");
  });
  document.addEventListener("dragleave",e=>{if(!e.relatedTarget)$("#image-dropzone").classList.remove("is-dragging");});
  document.addEventListener("drop",e=>{
    if(location.hash==="#library")return;
    e.preventDefault();$("#image-dropzone").classList.remove("is-dragging");
    const files=e.dataTransfer?.files;
    if(files?.length)importLightImage(files[0]);
  });
  $("#use-all-points").addEventListener("click",()=>{if(upload.pixels)applyUploadedModel(true);});
  for(const id of ["light-threshold","bottom-crop","sample-gap","background-tolerance","art-budget"]){
    $("#"+id).addEventListener("input",e=>{
      $("#"+id+"-value").textContent=e.target.value;
      clearTimeout(upload.timer);upload.token++;
      upload.timer=setTimeout(()=>processUploadedPixels(false),180);
    });
  }
  $("#keep-white").addEventListener("change",()=>processUploadedPixels(false));
  $("#normalize-light").addEventListener("change",()=>processUploadedPixels(false));
  $("#image-mode").addEventListener("change",()=>processUploadedPixels(true));
  $("#remove-paper").addEventListener("change",()=>processUploadedPixels(false));
  for(const id of ["shape-join","shape-smooth"]){
    $("#"+id).addEventListener("input",e=>{
      $("#"+id+"-value").textContent=e.target.value;
      clearTimeout(upload.timer);
      upload.timer=setTimeout(()=>{if(upload.pixels)applyUploadedModel(false);},100);
    });
  }
  for(const id of ["depth-method","fill-shape","remove-strays","model-monochrome"]){
    $("#"+id).addEventListener("change",()=>{if(upload.pixels)applyUploadedModel(false);});
  }
  $("#relief-depth").addEventListener("input",e=>{
    $("#relief-depth-value").textContent=e.target.value;
    if(upload.pixels)applyUploadedModel(false);
  });
}
