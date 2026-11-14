// Local contrast threshold: suppress paper shadows and faint show-through without
// whitelisting characters (accents, foreign languages and maths must survive).
export function enhanceDocumentImage(canvas,{strength=0.25,radius=25}={}){
 const ctx=canvas.getContext('2d'),{width,height}=canvas;
 const pixels=ctx.getImageData(0,0,width,height),rgba=pixels.data;
 // Sliding windows use one float per pixel, instead of two full-size integral
 // tables, to leave memory available for OCR on phones and tablets.
 const grey=new Float32Array(width*height),sums=new Float64Array(width),squares=new Float64Array(width);
 for(let i=0;i<grey.length;i++){const at=i*4;grey[i]=0.299*rgba[at]+0.587*rgba[at+1]+0.114*rgba[at+2];}
 const row=(y,sign)=>{for(let x=0;x<width;x++){const v=grey[y*width+x];sums[x]+=sign*v;squares[x]+=sign*v*v;}};
 for(let y=0;y<=Math.min(radius,height-1);y++)row(y,1);
 for(let y=0;y<height;y++){
  if(y>0){if(y-radius-1>=0)row(y-radius-1,-1);if(y+radius<height)row(y+radius,1);}
  let sum=0,square=0;for(let x=0;x<=Math.min(radius,width-1);x++){sum+=sums[x];square+=squares[x];}
  for(let x=0;x<width;x++){
   const n=(Math.min(width,x+radius+1)-Math.max(0,x-radius))*(Math.min(height,y+radius+1)-Math.max(0,y-radius));
   const mean=sum/n,variance=square/n-mean*mean,threshold=mean*(1+strength*(Math.sqrt(Math.max(0,variance))/128-1));
   const at=(y*width+x)*4,value=grey[y*width+x]<threshold?0:255;
   rgba[at]=rgba[at+1]=rgba[at+2]=value;rgba[at+3]=255;
   if(x-radius>=0){sum-=sums[x-radius];square-=squares[x-radius];}
   if(x+radius+1<width){sum+=sums[x+radius+1];square+=squares[x+radius+1];}
  }
 }
 ctx.putImageData(pixels,0,0);return canvas;
}
