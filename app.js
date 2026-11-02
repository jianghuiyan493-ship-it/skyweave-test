const canvas = document.querySelector("#sim-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const $ = (selector) => document.querySelector(selector);

const state = {
  running: false, scenario: "empty", command: "formation", speed: 1, cohesion: .72,
  count: 0, elapsed: 0, lastFrame: performance.now(), fps: 60,
  image: null, imagePoints: [], landing: false,
  drones: [], trails: [], events: [
    ["00:00:04", "编队已稳定，<b>24</b> 台设备进入队形保持"],
    ["00:00:03", "通信链路质量 <b>98.7%</b>，无丢包"],
    ["00:00:02", "航迹规划器完成局部重规划"],
  ],
};

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if(camera.autoFit&&flight.phase==="preview")fitSceneView();
}

function initDrones() { sceneInit(); }

function imagePointForDrone(i) {
  if (!state.imagePoints.length || !state.count) return null;
  const pointIndex = Math.min(
    state.imagePoints.length - 1,
    Math.floor((i / Math.max(state.count - 1, 1)) * state.imagePoints.length),
  );
  return state.imagePoints[pointIndex];
}

function targetFor(i, t) {
  if (state.scenario === "image" && state.imagePoints.length) {
    const point = imagePointForDrone(i);
    return { x: .18 + point.x * .64, y: .16 + point.y * .68 };
  }
  const cols = 6, row = Math.floor(i / cols), col = i % cols;
  const gridCols = Math.max(1, Math.ceil(Math.sqrt(Math.max(state.count, 1) * 1.45)));
  const gridRows = Math.max(1, Math.ceil(Math.max(state.count, 1) / gridCols));
  const gridCol = i % gridCols, gridRow = Math.floor(i / gridCols);
  if (state.scenario === "orbit") {
    const angle = (i / state.count) * Math.PI * 2 + t * .18;
    return { x: .5 + Math.cos(angle) * .25, y: .5 + Math.sin(angle) * .27 };
  }
  if (state.scenario === "wave") {
    return { x: .18 + (i % cols) * .13, y: .5 + (row - 1.5) * .13 + Math.sin(t * 1.4 + col * .8) * .11 };
  }
  return {
    x: gridCols === 1 ? .5 : .14 + (gridCol / (gridCols - 1)) * .72,
    y: gridRows === 1 ? .5 : .14 + (gridRow / (gridRows - 1)) * .72,
  };
}

function update(dt) { sceneUpdate(dt); }
function draw() { sceneDraw(); }

function formatTime(seconds) { const min = Math.floor(seconds / 60).toString().padStart(2, "0"); return `${min}:${(seconds % 60).toFixed(1).padStart(4, "0")}`; }
function renderEvents() { $("#event-feed").innerHTML = state.events.map(([time, text]) => `<div class="event"><time>${time}</time><p>${text}</p></div>`).join(""); }
function updateMetrics() {
  $("#count-range").value=state.count;
  $("#count-number").value=state.count;
  $("#drone-count").textContent = state.count;
  $("#online-metric").textContent = `${state.count} / ${state.count}`;
  $("#throughput-metric").textContent = `${(state.count * 75).toLocaleString()} /s`;
  $("#cohesion-output").textContent = `${Math.round(state.cohesion * 100)}%`;
  $("#count-output").textContent = `${state.count} 架`;
  $("#progress-metric").textContent = `${Math.min(99, Math.round(state.elapsed / 1.8))}%`;
}

function frame(now) {
  const dt = Math.min((now - state.lastFrame) / 1000, .05); state.lastFrame = now;
  state.fps = state.fps * .9 + (1 / Math.max(dt, .001)) * .1;
  update(dt); if(typeof tickImageSeries==="function")tickImageSeries(dt); draw(); requestAnimationFrame(frame);
}

$("#play-btn").addEventListener("click", () => {
  state.running = !state.running;
  $("#play-btn").textContent = state.running ? "暂停仿真" : "继续仿真";
  $("#sim-status").textContent = state.running ? "● 运行中" : "Ⅱ 已暂停";
  $("#sim-status").classList.toggle("is-live", state.running);
});
$("#reset-btn").addEventListener("click", () => { state.elapsed = 0; initDrones(); });
$("#scenario-select").addEventListener("change", (e) => { state.scenario = e.target.value; if(state.scenario==="empty")state.count=0;else if(!state.count)state.count=400; presentation.preview=true; previewFormation(); updateMetrics(); state.events.unshift(["NOW", `场景切换为 <b>${e.target.options[e.target.selectedIndex].text}</b>`]); state.events = state.events.slice(0, 4); renderEvents(); });
$("#speed-range").addEventListener("input", (e) => { state.speed = Number(e.target.value); $("#speed-output").textContent = `${state.speed.toFixed(2).replace(".00", "")}×`; });
$("#cohesion-range").addEventListener("input", (e) => { state.cohesion = Number(e.target.value) / 100; updateMetrics(); });
document.querySelectorAll(".command-card").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".command-card").forEach((item) => item.classList.remove("is-active")); button.classList.add("is-active"); state.command = button.dataset.command; if (state.command === "return") { $("#land-btn").click(); } else if (state.command === "formation") { beginFlight(); }
}));
function setDroneCount(value) {
  if(flight.transition)presentation.preview=true;
  state.count = Math.max(0, Math.min(10000, Math.round(Number(value) || 0)));
  $("#count-range").value = state.count;
  $("#count-number").value = state.count;
  initDrones();
  updateMetrics();
  if(state.scenario === "image")updateUploadCountStatus();
}
$("#count-range").addEventListener("input", (e) => setDroneCount(e.target.value));
$("#count-number").addEventListener("change", (e) => setDroneCount(e.target.value));
$("#add-drone-btn").addEventListener("click", () => setDroneCount(state.count + 1));
$("#remove-drone-btn").addEventListener("click", () => setDroneCount(state.count - 1));
$("#emergency-btn").addEventListener("click", () => { state.running = false; state.command = "hold"; $("#play-btn").textContent = "继续仿真"; $("#sim-status").textContent = "Ⅱ 紧急悬停"; state.events.unshift(["NOW", "<b>紧急悬停</b>已执行，所有设备保持当前位置"]); state.events = state.events.slice(0, 4); renderEvents(); });
$("#land-btn").addEventListener("click", () => { clearTransition(); state.landing = true; state.command = "return"; flight.phase = "return"; state.running = true; $("#play-btn").textContent = "暂停仿真"; state.events.unshift(["NOW", "<b>返航降落</b>任务已下发"]); state.events = state.events.slice(0, 4); renderEvents(); });
$("#export-btn").addEventListener("click", () => {
  const config = { version: 3, scenario: state.scenario, command: state.command, droneCount: state.count, speed: state.speed, cohesion: state.cohesion, createdAt: new Date().toISOString(), modelType: "preview-only-not-flight-plan", points: presentation.points, imageSettings: state.scenario === "image" ? {...importOptions(), reconstruction:reconstructionOptions()} : null };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "skyweave-mission.json"; link.click(); URL.revokeObjectURL(link.href);
});
document.addEventListener("keydown", (e) => { if (e.code === "Space" && !["INPUT","TEXTAREA","BUTTON","SELECT","A"].includes(e.target.tagName) && !e.target.isContentEditable && location.hash!=="#library") { e.preventDefault(); $("#play-btn").click(); } });
window.addEventListener("resize", resize);
setupModelStore(); setupImageWorkflow(); setupScene(); resize(); initDrones(); updateMetrics(); state.events = [["LOCAL", "三维概念预演；无实机连接，点击起飞开始。"], ["CHECK", "2m 近距检查仅为离散采样，非连续轨迹安全证明。"]]; renderEvents(); requestAnimationFrame(frame);
