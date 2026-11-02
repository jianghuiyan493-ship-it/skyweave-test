/* UI-only layer. Existing controls and modelling/export handlers are preserved. */
(()=>{
 const home=document.querySelector('#home-page');
 const drone='<img class="drone-photo" src="./assets/drone-pointlight-bright.svg" alt="冷白光点组成的无人机，点击进入创作工作台"><span class="glass-orbit orbit-one"></span><span class="glass-orbit orbit-two"></span><span class="floating-label label-one">LIGHT, REIMAGINED.<small>让每一个光点，成为表达。</small></span><span class="floating-label label-two"><b>∞</b> POSSIBILITIES<small>从灵感出发，不止于想象</small></span>';
 home.innerHTML=`<nav class="home-nav"><a class="home-brand" href="#home">SKYWEAVE<span>®</span></a><span class="home-tag">LIGHT SHOW / CREATIVE STUDIO</span><a class="home-enter" href="#studio">进入工作台 ↗</a></nav><div class="home-hero"><div class="hero-copy"><p class="micro">IMAGINATION TAKES FLIGHT — 01</p><h1>MAKE<br>IDEAS<br><span>FLY.</span></h1><h2>让想象，成为光。</h2><p class="hero-description">从一张图片，到一片星空。<br>为你的灵感编排下一场灯光秀。</p><a class="hero-cta" href="#studio"><span class="cta-copy"><small>CREATE YOUR LIGHT SHOW</small><strong>开始创作</strong></span><span class="cta-orbit" aria-hidden="true"><i></i><i></i><i></i><svg class="cta-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></a><p class="hero-note">本地处理 · 无需上传图片 · 概念预演</p></div><a class="hero-drone" href="#studio" aria-label="点击无人机，进入建模工作台">${drone}<span class="drone-caption">01 / SKYWEAVE CONCEPT<br>LIGHT IN MOTION</span></a></div><footer class="home-footer"><span>YOUR VISION. A NEW DIMENSION.</span><span>图片 → 点阵 → 编排 → 影像</span><span>非实机航线 / LOCAL ONLY</span></footer>`;
 const createEntry=home.querySelector('.hero-cta');
 let entering=false,entryTimer;
 const entryCover=document.createElement('div');entryCover.className='creation-entry-cover';entryCover.setAttribute('aria-hidden','true');
 entryCover.innerHTML='<div class="entry-ring"></div><div class="entry-copy"><small>SKYWEAVE / CREATIVE STUDIO</small><strong>让想象，进入夜空。</strong></div>';document.body.append(entryCover);
 function clearEntry(){clearTimeout(entryTimer);entering=false;document.body.classList.remove('entering-studio');createEntry.removeAttribute('aria-busy');}
 createEntry.addEventListener('click',e=>{
   if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
   e.preventDefault();if(entering)return;entering=true;createEntry.setAttribute('aria-busy','true');document.body.classList.add('entering-studio');
   entryTimer=setTimeout(()=>{location.hash='studio';},650);
 });
 window.addEventListener('hashchange',()=>{if(!entering)return;clearEntry();if(location.hash==='#studio'){const heading=document.querySelector('.stage-heading h2');heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&entering)clearEntry();});
 const back=document.createElement('a');back.href='#home';back.className='button button-ghost';back.textContent='↖ 首页';document.querySelector('.topbar-actions').prepend(back);
 const workflowNav=document.querySelector('.workflow-nav');
 const stepDescriptions=['导入图片或选择示例','识别主体与去除背景','调整点数与立体效果','设置转场并播放','输出视频与模型'];
 const flowBar=document.createElement('section');flowBar.className='workflow-strip';flowBar.setAttribute('aria-label','创作流程');
 const flowHeading=document.createElement('div');flowHeading.className='workflow-strip-heading';flowHeading.innerHTML='<strong>创作流程</strong><span>从素材到成片，按步骤完成创作</span>';
 flowBar.append(flowHeading,workflowNav);document.querySelector('.workspace').before(flowBar);
 const sideTitle=document.querySelector('.sidebar .panel-heading h2');
 function syncStepHeading(){sideTitle.textContent=document.querySelector('#workflow-current').textContent+'设置';}
 document.querySelectorAll('.workflow-step').forEach((b,i)=>{
   const title=b.textContent.replace(/^\d+\s*/, '');
   b.innerHTML=`<span class="step-no">0${i+1}</span><span class="step-copy"><strong>${title}</strong><small>${stepDescriptions[i]}</small></span><span class="step-chevron" aria-hidden="true">${i<4?'→':'✓'}</span>`;
   b.addEventListener('click',syncStepHeading);
 });
 syncStepHeading();
 new MutationObserver(syncStepHeading).observe(document.querySelector('#workflow-current'),{childList:true});
 function syncFlowRoute(){flowBar.hidden=location.hash==='#library';}
 window.addEventListener('hashchange',syncFlowRoute);syncFlowRoute();
 const empty=document.createElement('div');empty.className='refresh-empty';empty.innerHTML=`<p class="micro">YOUR NEXT SHOW STARTS HERE</p><h2>把灵感放进夜空</h2><button class="empty-drop" type="button"><span>＋</span><strong>拖放图片到这里</strong><small>或点击选择 · PNG / JPG / WEBP</small></button><p class="empty-hint">也可以从一个造型开始</p><div class="empty-templates"><button data-example="rose"><span>❀</span>玫瑰<small>ROSE</small></button><button data-example="city"><span>▥</span>城市<small>CITY</small></button><button data-example="grid"><span>⠿</span>矩阵<small>MATRIX</small></button></div><p class="empty-privacy">图片仅在本地处理，不上传服务器</p>`;
 document.querySelector('.canvas-wrap').append(empty);
 empty.querySelector('.empty-drop').onclick=()=>document.querySelector('#image-input').click();
 empty.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{const select=document.querySelector('#scenario-select');select.value=b.dataset.example;select.dispatchEvent(new Event('change',{bubbles:true}));});
 function route(){const isHome=!location.hash||location.hash==='#home';document.body.classList.toggle('home-mode',isHome);home.hidden=!isHome;if(!isHome)requestAnimationFrame(()=>{resize();if(camera.autoFit)fitSceneView();});}
 window.addEventListener('hashchange',route);route();
 function sync(){const isEmpty=state.scenario==='empty';if(empty.hidden===isEmpty)empty.hidden=!isEmpty;document.body.classList.toggle('empty-workspace',isEmpty);}
 setInterval(sync,300);sync();
})();
