const PLAN_LIBRARY_KEY = "skyweave.image-model-plans.v1";

function readImagePlans() {
  try {
    const plans = JSON.parse(localStorage.getItem(PLAN_LIBRARY_KEY) || "[]");
    return Array.isArray(plans) ? plans.filter(plan => plan && Array.isArray(plan.points)) : [];
  } catch {
    return [];
  }
}

function writeImagePlans(plans) {
  localStorage.setItem(PLAN_LIBRARY_KEY, JSON.stringify(plans.slice(0, 24)));
}

function planPreviewText(plan) {
  const count = plan.points.length.toLocaleString();
  const source = plan.sourceName ? ` · ${plan.sourceName}` : "";
  return `${count} 点${source}`;
}

function renderImagePlans() {
  const list = document.querySelector("#image-plan-list");
  const count = document.querySelector("#image-plan-count");
  if (!list || !count) return;
  const plans = readImagePlans();
  count.textContent = `${plans.length} 个本地方案`;
  if (!plans.length) {
    list.innerHTML = '<div class="library-empty">还没有保存的图片建模方案。先在上方导入图片并完成识别。</div>';
    return;
  }
  list.innerHTML = plans.map(plan => `
    <article class="plan-card" data-plan-id="${escapePlanText(plan.id)}">
      <div class="plan-card-mark">IMG</div>
      <div class="plan-card-content">
        <strong>${escapePlanText(plan.name)}</strong>
        <small>${escapePlanText(planPreviewText(plan))}</small>
        <time>${escapePlanText(new Date(plan.updatedAt).toLocaleString("zh-CN", {year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}))}</time>
      </div>
      <div class="plan-card-actions">
        <button class="button button-secondary plan-load" type="button">载入</button>
        <button class="button button-ghost plan-delete" type="button" aria-label="删除方案">×</button>
      </div>
    </article>
  `).join("");
}

function escapePlanText(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[character]));
}

function currentPlanPoints() {
  const points = typeof presentation !== "undefined" && Array.isArray(presentation.points)
    ? presentation.points
    : (typeof state !== "undefined" ? state.imagePoints : []);
  return points.map(point => ({x:point.x, y:point.y, z:point.z, color:point.color}));
}

function saveCurrentImagePlan() {
  const points = currentPlanPoints();
  if (!points.length) {
    if (typeof uploadStatus === "function") uploadStatus("请先导入图片并完成识别，再保存建模方案。", true);
    return;
  }
  const input = document.querySelector("#plan-name");
  const plans = readImagePlans();
  const sourceName = typeof state !== "undefined" && state.image?.name ? state.image.name : "";
  plans.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.value.trim() || `图片建模方案 ${plans.length + 1}`,
    sourceName,
    points,
    count: typeof state !== "undefined" ? state.count : points.length,
    imageSettings: typeof importOptions === "function" ? importOptions() : null,
    reconstruction: typeof reconstructionOptions === "function" ? reconstructionOptions() : null,
    updatedAt: new Date().toISOString()
  });
  try { writeImagePlans(plans); } catch { uploadStatus("本地空间不足或存储不可用，请先导出模型 JSON。",true); return; }
  input.value = "";
  renderImagePlans();
  if (typeof uploadStatus === "function") uploadStatus(`图片建模方案已保存，可在方案库重新载入。`);
}

function loadImagePlan(plan) {
  if (!plan?.points?.length) return;
  if(typeof stopImageSeries==="function")stopImageSeries();
  const points=validateSavedModel({modelType:"preview-only-not-flight-plan",points:plan.points});
  if (typeof clearUploadedImage === "function") clearUploadedImage();
  if (typeof standaloneModel !== "undefined") standaloneModel.points = points;
  state.scenario = "model";
  document.querySelector("#scenario-select").value = "model";
  presentation.preview = true;
  setDroneCount(Math.min(10000, plan.count || plan.points.length));
  previewFormation();
  if (typeof uploadStatus === "function") uploadStatus(`已载入图片建模方案「${plan.name}」，当前按独立模型预览。`);
  location.hash="studio";
}

function setupPlanLibrary() {
  document.querySelector("#save-image-plan")?.addEventListener("click", saveCurrentImagePlan);
  document.querySelector("#image-plan-list")?.addEventListener("click", event => {
    const card = event.target.closest(".plan-card");
    if (!card) return;
    const plans = readImagePlans();
    const plan = plans.find(item => item.id === card.dataset.planId);
    if (!plan) return;
    if (event.target.closest(".plan-load")) loadImagePlan(plan);
    if (event.target.closest(".plan-delete")) {
      writeImagePlans(plans.filter(item => item.id !== plan.id));
      renderImagePlans();
    }
  });
  renderImagePlans();
}

setupPlanLibrary();
