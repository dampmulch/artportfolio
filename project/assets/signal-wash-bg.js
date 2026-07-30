/* Signal Wash — embeddable generative background (no UI).
   Usage:
     SignalWash.attach(el, {preset:'Impasto', video:'clip.mp4', interact:'full'|'hover'|'none',
                            speed:1, seed:7, zIndex:0, overrides:{air:.5}})  -> handle
     handle: setPreset(name), set(key,val), pointer(x,y), ripple(x,y,amp), reseed(), destroy()
   Or declarative: <section data-signal-wash="Ink Wash" data-sw-interact="hover" data-sw-video="clip.mp4">
   Source defaults to a self-contained procedural signal; pass a video URL to paint from footage. */
(function(){
"use strict";
const PAL={
  molten:    ['#141f33','#454f75','#8a63c9','#c07a35','#dcd9e4'],
  impasto:   ['#0e0c0b','#5a3f63','#b06a45','#d98598','#e6d9b8'],
  ink:       ['#16171d','#4a566e','#a5673f','#b9c2d4','#eef0f4'],
  verdigris: ['#101816','#2e4f46','#7ba08c','#c8b98a','#ece7d8']
};
const PRESETS={
  'Liquidline': {palette:PAL.molten,  speed:1.0, grade:.75, trail:.86, smear:.8,  liquid:.9,  streaks:.25, contours:0, contourDensity:5, hatch:0,  poster:1, grain:.05, air:.3},
  'Impasto':    {palette:PAL.impasto, speed:1.1, grade:.85, trail:.9,  smear:1.2, liquid:.35, streaks:.85, contours:0, contourDensity:5, hatch:0,  poster:6, grain:.12, air:.12},
  'Ink Wash':   {palette:PAL.ink,     speed:.7,  grade:.95, trail:.82, smear:.55, liquid:.3,  streaks:.2,  contours:0, contourDensity:5, hatch:.6, poster:4, grain:.08, air:.5}
};
const BASE={brushSize:.06,brushForce:.85,ripplePower:1};
const REDUCED=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;

const NOISE=`
vec2 hash2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
float hash1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 float a=hash1(i),b=hash1(i+vec2(1.,0.)),c=hash1(i+vec2(0.,1.)),d=hash1(i+vec2(1.,1.));
 return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*vnoise(p);p=p*2.03+vec2(19.7,7.3);a*=.5;}return v;}
vec2 curl(vec2 p){float e=.06;
 float a=fbm(p+vec2(0.,e)),b=fbm(p-vec2(0.,e)),c=fbm(p+vec2(e,0.)),d=fbm(p-vec2(e,0.));
 return vec2(a-b,d-c)/(2.*e);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
`;
const VS=`attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}`;
const SRC_FS=`precision highp float;varying vec2 vUv;
uniform float uTime,uSeed,uAspect,uHasVideo;uniform vec2 uFit;uniform sampler2D uVideo;
${NOISE}
vec3 hcol(float h,float o){return .5+.45*cos(6.2831*h+o+vec3(0.,2.1,4.2));}
void main(){
 if(uHasVideo>.5){vec2 uv=(vUv-.5)*uFit+.5;gl_FragColor=texture2D(uVideo,uv);return;}
 float k=uTime/7.0+uSeed;
 float sc=floor(k);float ft=fract(k);
 vec2 p=(vUv-.5)*vec2(uAspect,1.);
 p+=(hash2(vec2(sc,9.1))-.5)*.5*ft;
 p+=.012*vec2(vnoise(vec2(uTime*1.7,3.)),vnoise(vec2(uTime*1.6,17.)))-.006;
 float hue=hash1(vec2(sc,1.3));
 float zoom=1.4+2.2*hash1(vec2(sc,4.7));
 float g=fbm(p*zoom+uTime*.14+sc*7.);
 vec3 col=mix(hcol(hue,0.),hcol(hue+.33,2.4),g);
 for(int i=0;i<3;i++){
  float fi=float(i);
  vec2 c=(hash2(vec2(sc,11.+fi*5.3))-.5)*vec2(uAspect,1.)*1.2;
  c+=.28*vec2(sin(uTime*(.25+.17*fi)+fi*2.1),cos(uTime*(.31+.12*fi)+fi*1.3));
  float d=length(p-c);
  float rr=.14+.3*hash1(vec2(sc,fi*9.1+2.));
  col=mix(col,hcol(hue+.1+fi*.27,1.),smoothstep(rr,rr*.25,d));
 }
 col+=.13*sin(p.y*8.+uTime*.6+g*5.);
 gl_FragColor=vec4(clamp(col,0.,1.),1.);
}`;
const FB_FS=`precision highp float;varying vec2 vUv;
uniform sampler2D uPrev,uSrc;
uniform float uTime,uAspect,uKeep,uSmear,uBrushSize,uBrushForce;
uniform vec2 uMouse,uMouseVel;
uniform vec4 uRip[6];
${NOISE}
void main(){
 vec2 uv=vUv;vec2 asp=vec2(uAspect,1.);
 vec2 flow=curl(uv*asp*1.8+uTime*.05)*uSmear*.0035;
 vec2 md=(uv-uMouse)*asp;
 float m=exp(-dot(md,md)/(uBrushSize*uBrushSize));
 vec2 mv=uMouseVel*asp;
 vec2 perp=normalize(vec2(-md.y,md.x)+1e-5);
 flow+=(mv*22.+perp*length(mv)*26.)*m*uBrushForce*.02;
 float boost=0.;
 for(int i=0;i<6;i++){vec4 rp=uRip[i];
  if(rp.w>.001){
   vec2 rd=(uv-rp.xy)*asp;float dist=length(rd)+1e-4;
   float env=exp(-pow((dist-rp.z*.3)*8.,2.))*exp(-rp.z*1.1)*rp.w;
   flow+=(rd/dist)*env*.045*sin(dist*44.-rp.z*9.);
   boost+=env;
  }
 }
 vec3 prev=texture2D(uPrev,uv-flow/asp).rgb;
 vec3 src=texture2D(uSrc,uv).rgb;
 vec3 col=mix(src,prev,uKeep);
 col=mix(col,src,clamp(boost,0.,.85));
 col=mix(col,col*col*(3.-2.*col),.07);
 col+=(hash1(gl_FragCoord.xy+fract(uTime)*61.7)-.5)*(2./255.);
 gl_FragColor=vec4(col,1.);
}`;
const FINAL_FS=`precision highp float;varying vec2 vUv;
uniform sampler2D uFB;
uniform vec2 uRes,uMouse;
uniform float uTime,uAspect,uHover;
uniform vec4 uRip[6];
uniform float uLiquid,uChroma,uStreaks,uStreakLen,uSortThr;
uniform float uPoster,uGrade;
uniform vec3 uPal[5];
uniform float uContours,uCDensity,uCWarp,uHatch,uGrain,uAir;
${NOISE}
vec3 pal5(float x){
 x=clamp(x,0.,1.)*4.;
 vec3 c=uPal[0];
 c=mix(c,uPal[1],clamp(x,0.,1.));
 c=mix(c,uPal[2],clamp(x-1.,0.,1.));
 c=mix(c,uPal[3],clamp(x-2.,0.,1.));
 c=mix(c,uPal[4],clamp(x-3.,0.,1.));
 return c;
}
float hatchf(vec2 p,float ang,float sc){
 vec2 dir=vec2(cos(ang),sin(ang));
 float s=dot(p,dir)*sc+(vnoise(p*sc*.14)-.5)*4.5;
 float f=abs(fract(s)-.5)*2.;
 return smoothstep(.55,.98,f);
}
void main(){
 vec2 uv=vUv;vec2 asp=vec2(uAspect,1.);
 vec2 w=curl(uv*asp*2.6+uTime*.06);
 vec2 md=(uv-uMouse)*asp;float mm=exp(-dot(md,md)/.02);
 vec2 duv=w*uLiquid*.018+vec2(-md.y,md.x)*mm*uHover*.05;
 for(int i=0;i<6;i++){vec4 rp=uRip[i];
  if(rp.w>.001){
   vec2 rd=(uv-rp.xy)*asp;float dist=length(rd)+1e-4;
   float env=exp(-pow((dist-rp.z*.3)*10.,2.))*exp(-rp.z*1.2)*rp.w;
   duv+=(rd/dist)*env*.014*cos(dist*58.-rp.z*11.);
  }
 }
 duv/=asp;
 vec2 suv=uv+duv;
 float ca=uChroma*(1.+mm*2.);
 vec2 cd=normalize(suv-.5+1e-5)*ca;
 vec3 col;
 col.r=texture2D(uFB,suv+cd).r;
 col.g=texture2D(uFB,suv).g;
 col.b=texture2D(uFB,suv-cd).b;
 float sa=(fbm(uv*asp*1.6+uTime*.03)-.5)*3.4+1.5708;
 vec2 sd=vec2(cos(sa),sin(sa))/asp;
 vec3 acc=col;float wsum=1.;
 for(int i=1;i<=14;i++){
  float fi=float(i)/14.;
  vec3 s=texture2D(uFB,suv+sd*fi*uStreakLen).rgb;
  float wg=smoothstep(uSortThr,1.,lum(s))*(1.-fi*.45);
  acc+=s*wg;wsum+=wg;
 }
 col=mix(col,acc/wsum,uStreaks);
 float l=lum(col);
 float lp=l;
 if(uPoster>1.5){float lv=floor(uPoster+.5);lp=floor(lp*lv+(hash1(uv*uRes)-.5)*.4)/lv+.5/lv;}
 vec3 graded=pal5(lp);
 col=mix(col,graded,uGrade);
 if(uContours>.003){
  float ls=lum(texture2D(uFB,suv).rgb)*.28;
  ls+=lum(texture2D(uFB,suv+vec2(.016,0.)/asp).rgb)*.18;
  ls+=lum(texture2D(uFB,suv-vec2(.016,0.)/asp).rgb)*.18;
  ls+=lum(texture2D(uFB,suv+vec2(0.,.016)).rgb)*.18;
  ls+=lum(texture2D(uFB,suv-vec2(0.,.016)).rgb)*.18;
  float cf=ls*uCDensity+(fbm(uv*asp*1.15+uTime*.012)-.5)*uCWarp*uCDensity*.55;
  float idx=floor(cf);
  float f=fract(cf);
  float dd=min(f,1.-f)*2.;
  float wob=.5+.5*fbm(uv*asp*1.9+idx*3.7);
  float th=.05+.06*wob;
  float core=1.-smoothstep(0.,th,dd);
  float halo=(1.-smoothstep(0.,th*4.,dd))*.25;
  float major=step(.62,hash1(vec2(idx,7.3)));
  vec3 lc=mix(uPal[0],vec3(.97,.97,.98),major*.9+.06);
  float aline=(core*(.28+.34*major)+halo*.5)*(.45+.55*hash1(vec2(idx,3.1)));
  float mask=smoothstep(.03,.12,ls)*smoothstep(1.,.9,ls);
  col=mix(col,lc,aline*uContours*mask);
 }
 if(uHatch>.003){
  float dark=1.-l;
  float cl=smoothstep(.32,.78,fbm(uv*asp*1.3+11.7));
  float h=hatchf(uv*asp,.55,110.)*smoothstep(.3,.72,dark)
         +hatchf(uv*asp,-.62,78.)*smoothstep(.5,.92,dark);
  col=mix(col,uPal[0]*.5,clamp(h,0.,1.)*cl*uHatch*.8);
 }
 float am=fbm(uv*asp*.8+vec2(3.1,7.7)+uTime*.01);
 float veil=smoothstep(.45,.92,am)*uAir;
 col=mix(col,uPal[4]*1.02,veil*.85);
 float glz=smoothstep(.42,.05,am)*uAir;
 col=mix(col,uPal[0],glz*.18);
 col+=(hash1(gl_FragCoord.xy+fract(uTime*7.)*97.)-.5)*uGrain*(.35+.65*(1.-l));
 vec2 q=(uv-.5)*asp;
 col*=1.-.14*dot(q,q)*1.3;
 gl_FragColor=vec4(col,1.);
}`;

function hex2rgb(h){h=String(h).replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');
 const n=parseInt(h,16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}

class SW{
 constructor(host,opts){
  opts=opts||{};
  this.host=host;
  const preset=PRESETS[opts.preset]?opts.preset:'Liquidline';
  this.T=Object.assign({},BASE,PRESETS[preset],{preset},opts.overrides||{});
  if(opts.speed!=null&&opts.speed!=='')this.T.speed=+opts.speed;
  this.interact=opts.interact||'full';
  this.seed=(opts.seed!=null&&opts.seed!=='')?+opts.seed:Math.random()*100;
  if(getComputedStyle(host).position==='static')host.style.position='relative';
  const c=this.canvas=document.createElement('canvas');
  c.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:'+(opts.zIndex!=null?opts.zIndex:0);
  host.insertBefore(c,host.firstChild);
  const gl=this.gl=c.getContext('webgl2',{antialias:false,alpha:false})||c.getContext('webgl',{antialias:false,alpha:false});
  if(!gl){c.remove();this.dead=true;return;}
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  this.srcProg=this._compile(SRC_FS);this.fbProg=this._compile(FB_FS);this.finProg=this._compile(FINAL_FS);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  this.videoTex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,this.videoTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  this.video=null;this.videoReady=false;
  if(opts.video)this.setVideo(opts.video);
  this.mx=.5;this.my=.5;this.lastX=.5;this.lastY=.5;this.vx=0;this.vy=0;this.activity=0;this.down=false;
  this.ripples=[];this.ripArr=new Float32Array(24);
  this.palKey='';this.palArr=new Float32Array(15);
  this.t=Math.random()*40;this.last=performance.now();this.visible=true;this.raf=0;
  this._step=now=>this.step(now);
  this.ro=new ResizeObserver(()=>this.resize());this.ro.observe(host);
  this.io=new IntersectionObserver(en=>{this.visible=en[0].isIntersecting;if(this.visible)this.kick();});this.io.observe(host);
  this.onMove=e=>{const r=this.host.getBoundingClientRect();
   this.mx=(e.clientX-r.left)/Math.max(1,r.width);this.my=1-(e.clientY-r.top)/Math.max(1,r.height);};
  this.onDown=e=>{if(this.interact!=='full')return;this.down=true;this.onMove(e);this.addRipple(this.mx,this.my,this.T.ripplePower);};
  this.onUp=()=>{this.down=false;};
  if(this.interact!=='none'){
   host.addEventListener('pointermove',this.onMove);
   host.addEventListener('pointerdown',this.onDown);
   addEventListener('pointerup',this.onUp);
  }
  this.resize();this.kick();
 }
 _compile(fs){
  const gl=this.gl,p=gl.createProgram();
  const v=gl.createShader(gl.VERTEX_SHADER);gl.shaderSource(v,VS);gl.compileShader(v);
  const f=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(f,fs);gl.compileShader(f);
  if(!gl.getShaderParameter(f,gl.COMPILE_STATUS))console.error('SignalWash FS:',gl.getShaderInfoLog(f));
  gl.attachShader(p,v);gl.attachShader(p,f);gl.bindAttribLocation(p,0,'aPos');gl.linkProgram(p);
  const U={};
  return {p,u:n=>(n in U?U[n]:U[n]=gl.getUniformLocation(p,n))};
 }
 _target(w,h){
  const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
  return {t,fb,w,h};
 }
 _free(x){if(x){this.gl.deleteTexture(x.t);this.gl.deleteFramebuffer(x.fb);}}
 resize(){
  if(this.dead)return;
  const r=this.host.getBoundingClientRect();
  if(r.width<2||r.height<2)return;
  const dpr=Math.min(window.devicePixelRatio||1,1.25);
  this.W=Math.min(1600,Math.max(2,Math.round(r.width*dpr)));
  this.H=Math.max(2,Math.round(this.W*r.height/Math.max(1,r.width)));
  this.canvas.width=this.W;this.canvas.height=this.H;
  this._free(this.srcT);this._free(this.fbA);this._free(this.fbB);
  this.srcT=this._target(Math.max(2,this.W>>1),Math.max(2,this.H>>1));
  this.fbA=this._target(this.W,this.H);this.fbB=this._target(this.W,this.H);
  this.kick();
 }
 setVideo(url){
  if(!this.video){
   const v=this.video=document.createElement('video');
   v.muted=true;v.loop=true;v.playsInline=true;v.setAttribute('playsinline','');
   v.crossOrigin='anonymous';v.autoplay=true;
   v.addEventListener('loadeddata',()=>{this.videoReady=true;});
  }
  this.videoReady=false;this.video.src=url;this.video.play().catch(()=>{});
 }
 clearVideo(){if(this.video){this.video.pause();this.video.removeAttribute('src');}this.videoReady=false;}
 setPreset(name){if(!PRESETS[name])return;Object.assign(this.T,PRESETS[name]);this.T.preset=name;}
 set(k,v){this.T[k]=v;}
 pointer(x,y){this.mx=x;this.my=1-y;}
 ripple(x,y,a){this.addRipple(x,1-y,a==null?this.T.ripplePower:a);}
 reseed(){this.seed=Math.random()*100;}
 addRipple(x,y,a){this.ripples.push({x,y,t0:performance.now()/1000,a});if(this.ripples.length>6)this.ripples.shift();}
 kick(){if(!this.raf&&!this.dead&&this.gl)this.raf=requestAnimationFrame(this._step);}
 step(now){
  this.raf=0;
  if(this.dead)return;
  if(!this.visible)return;
  const gl=this.gl,T=this.T;
  const dt=Math.min(.05,(now-this.last)/1000);this.last=now;
  this.t+=dt*T.speed*(REDUCED?.12:1);
  const ivx=this.mx-this.lastX,ivy=this.my-this.lastY;this.lastX=this.mx;this.lastY=this.my;
  this.vx+=(ivx-this.vx)*.25;this.vy+=(ivy-this.vy)*.25;
  const mag=Math.sqrt(this.vx*this.vx+this.vy*this.vy);
  this.activity+=((mag>.0002?1:0)-this.activity)*.08;
  const aspect=this.W/this.H,rnow=now/1000;
  const R=this.ripArr;R.fill(0);
  for(let i=this.ripples.length-1;i>=0;i--){
   const r=this.ripples[i],age=rnow-r.t0;
   if(age>4){this.ripples.splice(i,1);continue;}
   const k=i*4;R[k]=r.x;R[k+1]=r.y;R[k+2]=age;R[k+3]=r.a;
  }
  let hasVid=0,fitX=1,fitY=1;
  if(this.video&&this.videoReady&&this.video.readyState>=2){
   gl.bindTexture(gl.TEXTURE_2D,this.videoTex);
   try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.video);hasVid=1;}catch(err){}
   const va=(this.video.videoWidth||16)/(this.video.videoHeight||9);
   if(va>aspect){fitX=aspect/va;fitY=1;}else{fitX=1;fitY=va/aspect;}
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.srcT.fb);gl.viewport(0,0,this.srcT.w,this.srcT.h);
  gl.useProgram(this.srcProg.p);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.videoTex);
  gl.uniform1i(this.srcProg.u('uVideo'),0);
  gl.uniform1f(this.srcProg.u('uTime'),this.t);gl.uniform1f(this.srcProg.u('uSeed'),this.seed);
  gl.uniform1f(this.srcProg.u('uAspect'),aspect);gl.uniform1f(this.srcProg.u('uHasVideo'),hasVid);
  gl.uniform2f(this.srcProg.u('uFit'),fitX,fitY);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbB.fb);gl.viewport(0,0,this.W,this.H);
  gl.useProgram(this.fbProg.p);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.fbA.t);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.srcT.t);
  gl.uniform1i(this.fbProg.u('uPrev'),0);gl.uniform1i(this.fbProg.u('uSrc'),1);
  gl.uniform1f(this.fbProg.u('uTime'),this.t);gl.uniform1f(this.fbProg.u('uAspect'),aspect);
  gl.uniform1f(this.fbProg.u('uKeep'),.75+.235*T.trail);
  gl.uniform1f(this.fbProg.u('uSmear'),T.smear);
  gl.uniform1f(this.fbProg.u('uBrushSize'),T.brushSize);
  gl.uniform1f(this.fbProg.u('uBrushForce'),T.brushForce*(this.down?2.6:1));
  gl.uniform2f(this.fbProg.u('uMouse'),this.mx,this.my);
  gl.uniform2f(this.fbProg.u('uMouseVel'),this.vx,this.vy);
  gl.uniform4fv(this.fbProg.u('uRip[0]'),R);
  gl.drawArrays(gl.TRIANGLES,0,3);
  const tmp=this.fbA;this.fbA=this.fbB;this.fbB=tmp;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.W,this.H);
  gl.useProgram(this.finProg.p);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.fbA.t);
  gl.uniform1i(this.finProg.u('uFB'),0);
  gl.uniform2f(this.finProg.u('uRes'),this.W,this.H);
  gl.uniform2f(this.finProg.u('uMouse'),this.mx,this.my);
  gl.uniform1f(this.finProg.u('uTime'),this.t);gl.uniform1f(this.finProg.u('uAspect'),aspect);
  gl.uniform1f(this.finProg.u('uHover'),Math.min(1,this.activity)*T.brushForce*.8*(this.interact==='none'?0:1));
  gl.uniform4fv(this.finProg.u('uRip[0]'),R);
  gl.uniform1f(this.finProg.u('uLiquid'),T.liquid);
  gl.uniform1f(this.finProg.u('uChroma'),.002+.005*T.liquid);
  gl.uniform1f(this.finProg.u('uStreaks'),T.streaks*.85);
  gl.uniform1f(this.finProg.u('uStreakLen'),.04+.26*T.streaks);
  gl.uniform1f(this.finProg.u('uSortThr'),.34);
  gl.uniform1f(this.finProg.u('uPoster'),T.poster);
  gl.uniform1f(this.finProg.u('uGrade'),T.grade);
  gl.uniform3fv(this.finProg.u('uPal[0]'),this.palette(T.palette));
  gl.uniform1f(this.finProg.u('uContours'),T.contours);
  gl.uniform1f(this.finProg.u('uCDensity'),T.contourDensity);
  gl.uniform1f(this.finProg.u('uCWarp'),.55);
  gl.uniform1f(this.finProg.u('uHatch'),T.hatch);
  gl.uniform1f(this.finProg.u('uGrain'),T.grain);
  gl.uniform1f(this.finProg.u('uAir'),T.air||0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  this.raf=requestAnimationFrame(this._step);
 }
 palette(list){
  const arr=Array.isArray(list)?list:[list];
  const key=arr.join(',');
  if(key===this.palKey)return this.palArr;
  this.palKey=key;
  const cols=arr.map(hex2rgb);
  for(let i=0;i<5;i++){
   const x=(cols.length-1)*i/4,j=Math.floor(x),f=x-j;
   const a=cols[j],b=cols[Math.min(cols.length-1,j+1)];
   this.palArr[i*3]=a[0]+(b[0]-a[0])*f;this.palArr[i*3+1]=a[1]+(b[1]-a[1])*f;this.palArr[i*3+2]=a[2]+(b[2]-a[2])*f;
  }
  return this.palArr;
 }
 destroy(){
  if(this.dead)return;this.dead=true;
  cancelAnimationFrame(this.raf);this.raf=0;
  this.ro&&this.ro.disconnect();this.io&&this.io.disconnect();
  this.host.removeEventListener('pointermove',this.onMove);
  this.host.removeEventListener('pointerdown',this.onDown);
  removeEventListener('pointerup',this.onUp);
  this.clearVideo();
  const ext=this.gl&&this.gl.getExtension('WEBGL_lose_context');
  ext&&ext.loseContext();
  this.canvas.remove();
 }
}

function init(root){
 (root||document).querySelectorAll('[data-signal-wash]').forEach(el=>{
  if(el.__signalWash)return;
  el.__signalWash=new SW(el,{
   preset:el.getAttribute('data-signal-wash')||undefined,
   video:el.getAttribute('data-sw-video')||undefined,
   interact:el.getAttribute('data-sw-interact')||undefined,
   speed:el.getAttribute('data-sw-speed')||undefined,
   seed:el.getAttribute('data-sw-seed')||undefined
  });
 });
}
if(document.readyState!=='loading')init();
else document.addEventListener('DOMContentLoaded',()=>init());
window.SignalWash={attach:(el,opts)=>new SW(el,opts||{}),init,PRESETS,PAL};
})();
