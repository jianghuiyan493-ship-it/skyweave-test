/* Luminance-only, regular staggered stippling. No face recognition or depth inference. */
(function(root){
 function extract(data,width,height,options={}){
  const h=Math.max(1,Math.floor(height*(1-Math.max(0,Math.min(40,options.crop||0))/100)));
  const budget=Math.max(0,Math.min(10000,Math.round(options.budget??2000)));
  const stride=width+1,sum=new Float64Array(stride*(h+1));
  for(let y=0;y<h;y++){let row=0;for(let x=0;x<width;x++){
   const i=(y*width+x)*4;
   row+=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])*data[i+3]/255;
   sum[(y+1)*stride+x+1]=sum[y*stride+x+1]+row;
  }}
  const mean=(x,y,r)=>{
   const x0=Math.max(0,Math.floor(x-r)),y0=Math.max(0,Math.floor(y-r)),x1=Math.min(width,Math.ceil(x+r+1)),y1=Math.min(h,Math.ceil(y+r+1));
   return (sum[y1*stride+x1]-sum[y0*stride+x1]-sum[y1*stride+x0]+sum[y0*stride+x0])/((x1-x0)*(y1-y0));
  };
  const threshold=Math.max(8,Math.min(160,Number(options.threshold??38)));
  // Smooth source LED gaps before growing dark regions. Restrict growth to
  // dense bright areas, so sparse hair/clothing outlines are not eroded away.
  const expansion=Math.max(0,Math.min(12,Number(options.portraitDarkGap??6)))*Math.min(width,h)/650;
  const distance=new Float32Array(width*h);
  const blur=Math.max(2,Math.min(width,h)*.006);
  if(expansion>0){
   for(let y=0;y<h;y++)for(let x=0;x<width;x++)
    distance[y*width+x]=mean(x,y,blur)<threshold*.8?0:1e6;
   for(let y=0;y<h;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(x)distance[i]=Math.min(distance[i],distance[i-1]+1);
    if(y)distance[i]=Math.min(distance[i],distance[i-width]+1);
    if(x&&y)distance[i]=Math.min(distance[i],distance[i-width-1]+Math.SQRT2);
    if(x+1<width&&y)distance[i]=Math.min(distance[i],distance[i-width+1]+Math.SQRT2);
   }
   for(let y=h-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const i=y*width+x;
    if(x+1<width)distance[i]=Math.min(distance[i],distance[i+1]+1);
    if(y+1<h)distance[i]=Math.min(distance[i],distance[i+width]+1);
    if(x+1<width&&y+1<h)distance[i]=Math.min(distance[i],distance[i+width+1]+Math.SQRT2);
    if(x&&y+1<h)distance[i]=Math.min(distance[i],distance[i+width-1]+Math.SQRT2);
   }
  }
  function sample(gap){
   const dots=[];let row=0;
   for(let y=gap/2;y<h;y+=gap*.866,row++)for(let x=gap/2+(row%2)*gap/2;x<width;x+=gap){
    // Average over a small area to suppress photographic microtexture and
    // source LED halos. Retain dark holes rather than fill the face silhouette.
    if(mean(x,y,Math.max(1,gap*.38))<threshold)continue;
    if(expansion>0&&mean(x,y,blur*5)>threshold*1.35&&
      distance[Math.floor(y)*width+Math.floor(x)]<=expansion)continue;
    dots.push({u:x/width,v:y/h,r:255,g:255,b:255});
   }
   return dots;
  }
  if(!budget)return {dots:[],aspect:width/h};
  let low=1,high=Math.max(width,h),best=[];
  for(let k=0;k<20;k++){
   const gap=(low+high)/2,dots=sample(gap);
   if(dots.length>budget)low=gap;else{high=gap;if(dots.length>best.length)best=dots;}
  }
  return {dots:best,aspect:width/h};
 }
 root.PortraitPipeline={extract};
 if(typeof module!=='undefined')module.exports=root.PortraitPipeline;
})(globalThis);
