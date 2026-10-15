const standaloneModel={points:[]};
function validateSavedModel(data){
  if(data?.modelType!=="preview-only-not-flight-plan"||!Array.isArray(data.points))throw new Error("请选择本工具导出的模型 JSON");
  if(data.points.length>10000)throw new Error("模型超过 10000 点");
  return data.points.map(p=>{
    if(!p||!["x","y","z"].every(k=>typeof p[k]==="number"&&Number.isFinite(p[k])&&Math.abs(p[k])<=100000))throw new Error("模型含无效坐标");
    if(typeof p.color!=="string"||!/^#[0-9a-f]{6}$|^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(p.color))throw new Error("模型含无效颜色");
    return {x:p.x,y:p.y,z:p.z,color:p.color};
  });
}
function setupModelStore(){
  $("#model-import").addEventListener("change",async e=>{
    const file=e.target.files[0];e.target.value="";if(!file)return;
    try{
      if(file.size>8*1024*1024)throw new Error("模型文件超过 8 MB");
      const points=validateSavedModel(JSON.parse(await file.text()));
      clearUploadedImage();
      standaloneModel.points=points;
      state.scenario="model";$("#scenario-select").value="model";
      presentation.preview=true;setDroneCount(points.length);
      uploadStatus(`已载入 ${points.length} 个模型点。无需原图，可独立预览、调架数与导出。`);
    }catch(error){uploadStatus(`模型导入失败：${error.message}`,true);}
  });
}
