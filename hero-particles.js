/* Homepage-only particles: no connection to the modelling state. */
(()=>{
 const host=document.querySelector('.hero-drone'),image=host.querySelector('.drone-photo');
 const canvas=document.createElement('canvas');canvas.className='hero-light-canvas';canvas.setAttribute('aria-hidden','true');const surface=document.createElement('span');surface.className='hero-particle-surface';image.replaceWith(surface);surface.append(canvas);
 const context=canvas.getContext('2d'),palette=['#f4fbff','#eaf6ff','#ffffff','#eef8ff','#f7fcff','#e1f2ff'];
 const points=window.skyweaveHeroPoints.map(([x,y,r,color],i)=>({x,y,r,color,accent:(i*37%101)<8,dx:0,dy:0,vx:0,vy:0}));
 const moving=new Set();let pointer=null,frame=0,last=0,scale=1,width=1,height=1;
 const padding=120;
 const sway={x:0,y:0,angle:0};let aim={x:0,y:0};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function paint(){
   context.clearRect(0,0,width,height);
   context.save();context.translate(width/2+sway.x,height/2+sway.y);context.rotate(sway.angle);context.translate(-width/2,-height/2);
   for(let color=0;color<palette.length;color++){
     context.fillStyle=palette[color];context.beginPath();
     for(const p of points){if(p.color!==color)continue;const x=padding+p.x*scale+p.dx,y=padding+p.y*scale+p.dy,r=Math.max(.65,p.r*scale*1.28);context.moveTo(x+r,y);context.arc(x,y,r,0,Math.PI*2);}
     context.fill();
   }
   // Separate blue highlights retain the white body and do not blur its silhouette.
   for(const p of points){
     const displaced=moving.has(p)&&Math.hypot(p.dx,p.dy)>2;
     if(!p.accent&&!displaced)continue;
     const x=padding+p.x*scale+p.dx,y=padding+p.y*scale+p.dy;
     const r=Math.max(.9,p.r*scale*(displaced?1.8:1.55));
     context.fillStyle='#48cfff';context.globalAlpha=.13;
     context.beginPath();context.arc(x,y,r*2.2,0,Math.PI*2);context.fill();
     context.globalAlpha=1;context.fillStyle='#5bdcff';
     context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.fill();
     context.fillStyle='#f3feff';context.beginPath();context.arc(x,y,r*.42,0,Math.PI*2);context.fill();
   }
   context.globalAlpha=1;context.restore();
 }
 function tick(now){
   frame=0;if(document.hidden||!document.body.classList.contains('home-mode'))return;
   const blend=1-Math.exp(-Math.min(50,now-last||16)/85);last=now;
   const tx=pointer?aim.x*15:0,ty=pointer?aim.y*10:0,ta=pointer?aim.x*.045:0;
   sway.x+=(tx-sway.x)*blend;sway.y+=(ty-sway.y)*blend;sway.angle+=(ta-sway.angle)*blend;
   const targets=new Map();
   if(pointer&&!reduced.matches){
     const cx=pointer.x-width/2-sway.x,cy=pointer.y-height/2-sway.y;
     const local={x:cx*Math.cos(sway.angle)+cy*Math.sin(sway.angle)+width/2,y:-cx*Math.sin(sway.angle)+cy*Math.cos(sway.angle)+height/2};
     const nearby=[];
     for(let i=0;i<points.length;i++){const p=points[i],dx=padding+p.x*scale-local.x,dy=padding+p.y*scale-local.y,d=Math.hypot(dx,dy);if(d<64)nearby.push({p,dx,dy,d,i});}
     nearby.sort((a,b)=>a.d-b.d);
     for(const n of nearby.slice(0,95)){const angle=n.d>.01?Math.atan2(n.dy,n.dx):n.i*2.399;const displacement=12+(1-n.d/64)*44;targets.set(n.p,{x:Math.cos(angle)*displacement-Math.sin(angle)*displacement*.22,y:Math.sin(angle)*displacement+Math.cos(angle)*displacement*.22});moving.add(n.p);}
   }
   let unsettled=Math.abs(tx-sway.x)+Math.abs(ty-sway.y)+Math.abs(ta-sway.angle)>.02;
   for(const p of moving){
     const target=targets.get(p)||{x:0,y:0};
     p.vx=(p.vx+(target.x-p.dx)*.12)*.73;p.vy=(p.vy+(target.y-p.dy)*.12)*.73;
     p.dx+=p.vx;p.dy+=p.vy;
     if(Math.hypot(p.dx-target.x,p.dy-target.y,p.vx,p.vy)>.06)unsettled=true;
     if(!targets.has(p)&&Math.hypot(p.dx,p.dy,p.vx,p.vy)<.06){p.dx=p.dy=p.vx=p.vy=0;moving.delete(p);}
   }
   paint();if(unsettled)wake();
 }
 function wake(){if(!frame&&!document.hidden&&document.body.classList.contains('home-mode'))frame=requestAnimationFrame(tick);}
 function reset(){pointer=null;last=0;wake();}
 function resize(){const rect=surface.getBoundingClientRect();if(!rect.width)return;width=rect.width+padding*2;height=rect.height+padding*2;scale=rect.width/1500;canvas.style.width=width+'px';canvas.style.height=height+'px';const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);reset();paint();}
 // The padded drawing surface extends beyond the link and underneath the copy.
 // Track its visual bounds even when another homepage element receives the event.
 document.addEventListener('pointermove',e=>{
   if(e.pointerType==='touch'||reduced.matches||!document.body.classList.contains('home-mode'))return;
   const r=canvas.getBoundingClientRect();
   if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){if(pointer)reset();return;}
   pointer={x:(e.clientX-r.left)*width/r.width,y:(e.clientY-r.top)*height/r.height};
   aim={x:Math.max(-1,Math.min(1,pointer.x/width*2-1)),y:Math.max(-1,Math.min(1,pointer.y/height*2-1))};wake();
 },{passive:true,capture:true});
 document.addEventListener('pointerleave',reset);document.addEventListener('pointercancel',reset);
 window.addEventListener('blur',reset);
 window.addEventListener('hashchange',()=>{reset();requestAnimationFrame(resize);});
 document.addEventListener('visibilitychange',reset);
 reduced.addEventListener('change',()=>{for(const p of moving)p.dx=p.dy=p.vx=p.vy=0;sway.x=sway.y=sway.angle=0;moving.clear();reset();paint();});
 new ResizeObserver(resize).observe(surface);resize();
})();
