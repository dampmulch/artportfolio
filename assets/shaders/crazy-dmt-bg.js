/* CrazyDMT — drop-in glitch video background.
   Usage:
     <script src="crazy-dmt-bg.js"></script>
     <script>CrazyDMT.attach(document.body, { src: 'abstract5.mp4' })</script>
   Options: src (video url, required), preset ('BlueCrazyDMT' | 'CrazyDMT'),
   plus any individual parameter override (e.g. { veil: 0.4, riotOn: true }).
   Returns { canvas, video, params, set(k,v), destroy() }. */
(function(global){
  const PRESETS = {
    BlueCrazyDMT: {"zoom":2.35,"hue":255,"sat":1.5,"smearOn":true,"smearAmt":0,"smearAngle":35,"posterOn":true,"posterLvl":4,"chromaOn":true,"chromaAmt":0.019,"displaceOn":true,"displaceAmt":0.15,"displaceScale":9.5,"sortOn":true,"sortThr":0.86,"glitchOn":true,"glitchAmt":0.45,"glitchBlock":14,"glitchRate":9,"glitchTear":0.45,"riotOn":false,"riotAmt":0.72,"riotHue":0.58,"riotBlock":19,"riotSpeed":25,"streaksOn":false,"streakAmt":0.8,"streakLen":0.12,"streakScale":5,"streakFlow":1,"linesOn":false,"linesDensity":90,"linesThick":0.4,"linesWarp":0.5,"linesScale":2.5,"linesFlow":0.6,"linesContrast":0.85,"bloomOn":true,"bloomThr":1,"bloomStr":1,"grainOn":true,"grainAmt":0.4,"scanOn":true,"scanAmt":1,"veil":0.09,"desat":0,"speed":0.55},
    CrazyDMT: {"zoom":2.35,"hue":255,"sat":1.5,"smearOn":true,"smearAmt":0,"smearAngle":35,"posterOn":true,"posterLvl":4,"chromaOn":true,"chromaAmt":0.019,"displaceOn":true,"displaceAmt":0.15,"displaceScale":9.5,"sortOn":true,"sortThr":0.86,"glitchOn":true,"glitchAmt":0.45,"glitchBlock":14,"glitchRate":9,"glitchTear":0.45,"riotOn":true,"riotAmt":0.72,"riotHue":0.58,"riotBlock":19,"riotSpeed":25,"streaksOn":false,"streakAmt":0.8,"streakLen":0.12,"streakScale":5,"streakFlow":1,"linesOn":false,"linesDensity":90,"linesThick":0.4,"linesWarp":0.5,"linesScale":2.5,"linesFlow":0.6,"linesContrast":0.85,"bloomOn":true,"bloomThr":1,"bloomStr":1,"grainOn":true,"grainAmt":0.4,"scanOn":true,"scanAmt":1,"veil":0.09,"desat":0,"speed":0.55}
  };
  const FLOAT_KEYS = ["zoom","hue","sat","smearAmt","smearAngle","posterLvl","chromaAmt","displaceAmt","displaceScale","sortThr","glitchAmt","glitchBlock","glitchRate","glitchTear","riotAmt","riotHue","riotBlock","riotSpeed","streakAmt","streakLen","streakScale","streakFlow","linesDensity","linesThick","linesWarp","linesScale","linesFlow","linesContrast","grainAmt","scanAmt","veil","desat"];
  const BOOL_KEYS = ["smearOn","posterOn","chromaOn","displaceOn","sortOn","glitchOn","riotOn","streaksOn","linesOn","grainOn","scanOn"];

  const VS = `attribute vec2 a_pos; varying vec2 v_uv;
    void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.,1.); }`;
  const FS_MAIN = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_tex;
    uniform vec2 u_res;
    uniform vec2 u_vidRes;
    uniform float u_time;

    uniform float u_zoom;
    uniform float u_hue;
    uniform float u_sat;
    uniform float u_smearOn, u_smearAmt, u_smearAngle;
    uniform float u_posterOn, u_posterLvl;
    uniform float u_chromaOn, u_chromaAmt;
    uniform float u_displaceOn, u_displaceAmt, u_displaceScale;
    uniform float u_sortOn, u_sortThr;
    uniform float u_glitchOn, u_glitchAmt, u_glitchBlock, u_glitchRate, u_glitchTear;
    uniform float u_riotOn, u_riotAmt, u_riotHue, u_riotBlock, u_riotSpeed;
    uniform float u_streaksOn, u_streakAmt, u_streakLen, u_streakScale, u_streakFlow;
    uniform float u_linesOn, u_linesDensity, u_linesThick, u_linesWarp, u_linesScale, u_linesFlow, u_linesContrast;
    uniform float u_grainOn, u_grainAmt;
    uniform float u_scanOn, u_scanAmt;
    uniform float u_veil, u_desat;

    // Random / noise
    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
    }

    // HSV helpers
    vec3 rgb2hsv(vec3 c){
      vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
      vec4 p = mix(vec4(c.bg,K.wz), vec4(c.gb,K.xy), step(c.b,c.g));
      vec4 q = mix(vec4(p.xyw,c.r), vec4(c.r,p.yzx), step(p.x,c.r));
      float d = q.x - min(q.w,q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w-q.y)/(6.0*d+e)), d/(q.x+e), q.x);
    }
    vec3 hsv2rgb(vec3 c){
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p-K.xxx,0.0,1.0), c.y);
    }

    // Map screen uv -> video uv (cover fit + zoom)
    vec2 coverUV(vec2 uv){
      float sa = u_res.x / u_res.y;
      float va = u_vidRes.x / u_vidRes.y;
      vec2 s = vec2(1.0);
      if (sa > va) s.y = va / sa;
      else         s.x = sa / va;
      vec2 o = (1.0 - s) * 0.5;
      vec2 vu = o + uv * s;
      // zoom about center
      vu = (vu - 0.5) / u_zoom + 0.5;
      return vu;
    }

    vec4 sampleVid(vec2 uv){
      vec2 vu = coverUV(uv);
      vu = clamp(vu, vec2(0.002), vec2(0.998));
      return texture2D(u_tex, vu);
    }

    void main(){
      vec2 uv = v_uv;

      // --- Slit-scan smear: shift each stripe along angle by time/noise ---
      if (u_smearOn > 0.5) {
        float a = radians(u_smearAngle);
        vec2 dir = vec2(cos(a), sin(a));
        float coord = dot(uv - 0.5, vec2(-dir.y, dir.x)); // perpendicular stripe coord
        float offset = (noise(vec2(coord*60.0, u_time*0.3)) - 0.5) * u_smearAmt;
        uv += dir * offset;
      }

      // --- Scribble displacement via noise field ---
      if (u_displaceOn > 0.5) {
        float nx = noise(uv * u_displaceScale + u_time*0.3);
        float ny = noise(uv * u_displaceScale + 13.7 + u_time*0.3);
        uv += (vec2(nx,ny) - 0.5) * u_displaceAmt;
      }

      // --- Chroma shift (RGB split) ---
      vec3 col;
      if (u_chromaOn > 0.5) {
        vec2 dir = vec2(cos(u_time*0.2), sin(u_time*0.2)) * u_chromaAmt;
        col.r = sampleVid(uv + dir).r;
        col.g = sampleVid(uv).g;
        col.b = sampleVid(uv - dir).b;
      } else {
        col = sampleVid(uv).rgb;
      }

      // --- Datamosh: block displacement + row tearing + channel offset ---
      if (u_glitchOn > 0.5) {
        float sl = floor(u_time * max(u_glitchRate, 0.1));
        float rows = max(u_glitchBlock, 4.0);
        float row = floor(uv.y * rows);
        float active = step(1.0 - u_glitchAmt * 0.7, hash(vec2(row, sl)));
        vec2 g = uv;
        g.x = fract(g.x + (hash(vec2(row*3.1, sl*7.7)) - 0.5) * 0.35 * u_glitchAmt * active);
        vec2 blk = floor(g * vec2(rows*1.6, rows));
        if (hash(blk + sl*13.0) > 1.0 - u_glitchAmt * 0.35) {
          g += (vec2(hash(blk+1.0), hash(blk+2.7)) - 0.5) * 0.14 * u_glitchAmt;
        }
        float tear = u_glitchTear * (0.004 + 0.05 * active);
        vec3 gc;
        gc.r = sampleVid(g + vec2(tear, 0.0)).r;
        gc.g = sampleVid(g).g;
        gc.b = sampleVid(g - vec2(tear, 0.0)).b;
        float inv = step(1.0 - u_glitchAmt * 0.14, hash(vec2(row*5.3, sl*2.1)));
        gc = mix(gc, vec3(1.0) - gc.bgr, inv * 0.85);
        col = mix(col, gc, clamp(u_glitchAmt * 1.4, 0.0, 1.0));
      }

      // --- Chroma riot: per-cell hue rotation + channel split + neon bands ---
      if (u_riotOn > 0.5) {
        float rsl = floor(u_time * max(u_riotSpeed, 0.1));
        float cells = max(u_riotBlock, 3.0);
        vec2 rblk = floor(uv * vec2(cells*1.7, cells));
        float rh = hash(rblk + rsl*3.77);
        vec2 roff = (vec2(hash(rblk+5.1), hash(rblk+9.3)) - 0.5) * 0.06 * u_riotAmt;
        vec3 rc;
        rc.r = sampleVid(uv + roff).r;
        rc.g = sampleVid(uv - roff*0.6).g;
        rc.b = sampleVid(uv + roff.yx*1.4).b;
        vec3 rhsv = rgb2hsv(rc);
        rhsv.x = fract(rhsv.x + rh * u_riotHue);
        rhsv.y = clamp(rhsv.y * (1.0 + 1.6*u_riotAmt) + 0.35*u_riotAmt, 0.0, 1.0);
        rhsv.z = clamp(rhsv.z * 1.05 + 0.05*u_riotAmt, 0.0, 1.0);
        rc = hsv2rgb(rhsv);
        float rband = step(1.0 - 0.25*u_riotAmt, hash(vec2(floor(uv.y*cells*2.0), rsl*1.7)));
        rc = mix(rc, vec3(1.0) - rc.gbr, rband * 0.7);
        col = mix(col, rc, clamp(u_riotAmt * 1.3, 0.0, 1.0));
      }

      // --- Flow streaks: march along a noise-driven direction field ---
      // Produces abstract flowing lines that fully abstract the source.
      if (u_streaksOn > 0.5) {
        vec2 p = uv;
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        // backward walk
        for (int i = 0; i < 18; i++) {
          float fi = float(i);
          float ang = noise(p * u_streakScale + u_time * u_streakFlow * 0.1) * 6.2831853 * 2.0;
          vec2 fdir = vec2(cos(ang), sin(ang));
          p -= fdir * (u_streakLen / 18.0);
          float w = 1.0 - fi / 18.0;
          acc += sampleVid(p).rgb * w;
          wsum += w;
        }
        // forward walk
        vec2 q = uv;
        for (int i = 0; i < 18; i++) {
          float fi = float(i);
          float ang = noise(q * u_streakScale + u_time * u_streakFlow * 0.1) * 6.2831853 * 2.0;
          vec2 fdir = vec2(cos(ang), sin(ang));
          q += fdir * (u_streakLen / 18.0);
          float w = 1.0 - fi / 18.0;
          acc += sampleVid(q).rgb * w;
          wsum += w;
        }
        vec3 streaked = acc / max(wsum, 0.001);
        col = mix(col, streaked, u_streakAmt);
      }

      // --- Pixel sort (fake): replace dark rows with shifted brighter sample ---
      if (u_sortOn > 0.5) {
        float lum = dot(col, vec3(0.299,0.587,0.114));
        if (lum < u_sortThr) {
          // stretch horizontally from nearest bright pixel
          vec3 acc = col;
          float dx = 0.002;
          for (int i = 1; i < 24; i++) {
            vec2 sUV = uv + vec2(dx*float(i), 0.0);
            vec3 s = sampleVid(sUV).rgb;
            float sl = dot(s, vec3(0.299,0.587,0.114));
            if (sl > u_sortThr) { acc = s; break; }
          }
          col = mix(col, acc, 0.9);
        }
      }

      // --- Posterize ---
      if (u_posterOn > 0.5) {
        float l = max(u_posterLvl, 2.0);
        col = floor(col * l) / l;
      }

      // --- Hue / saturation ---
      vec3 hsv = rgb2hsv(col);
      hsv.x = fract(hsv.x + u_hue/360.0);
      hsv.y *= u_sat;
      col = hsv2rgb(hsv);

      // --- Scanlines ---
      if (u_scanOn > 0.5) {
        float s = sin(uv.y * u_res.y * 1.2) * 0.5 + 0.5;
        col *= mix(1.0, s, u_scanAmt);
      }

      // --- Grain ---
      if (u_grainOn > 0.5) {
        float g = hash(uv * u_res + u_time*60.0) - 0.5;
        col += g * u_grainAmt;
      }

      // --- Pure lines: procedural hatching warped by video flow ---
      // Replaces col entirely with abstract line art. Underlying source
      // becomes invisible as content — only its motion drives the lines.
      if (u_linesOn > 0.5) {
        // Sample current video luminance + a second offset sample for flow
        float lumA = dot(sampleVid(uv).rgb, vec3(0.299,0.587,0.114));
        float lumB = dot(sampleVid(uv + vec2(0.01, 0.01)).rgb, vec3(0.299,0.587,0.114));

        // Build a flow angle from animated noise + a low-freq video gradient
        float baseAng = noise(uv * u_linesScale + u_time * u_linesFlow * 0.15) * 6.2831853 * 2.0;
        float ang = baseAng + (lumB - lumA) * 8.0;
        vec2 perp = vec2(-sin(ang), cos(ang));

        // Stripe coordinate along the perpendicular direction
        float stripe = dot(uv - 0.5, perp) * u_linesDensity;

        // Warp stripe phase by video luminance + slow noise — this is what
        // makes the lines bend with the source motion.
        float wn = noise(uv * (u_linesScale * 0.5) + 17.3 + u_time * u_linesFlow * 0.1);
        stripe += (lumA - 0.5) * u_linesWarp * 4.0 + (wn - 0.5) * u_linesWarp * 2.0;

        float band = abs(fract(stripe) - 0.5) * 2.0;
        float line = smoothstep(u_linesThick + 0.04, u_linesThick - 0.04, band);

        // Anti-aliased contrast
        vec3 bg = mix(vec3(0.5), vec3(0.02), u_linesContrast);
        vec3 fg = mix(vec3(0.5), vec3(0.98), u_linesContrast);
        col = mix(bg, fg, line);
      }

      // --- Readability veil (darken + desaturate) ---
      float gray = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, vec3(gray), u_desat);
      col *= (1.0 - u_veil);

      // Subtle vignette to anchor
      float vig = smoothstep(1.4, 0.35, length((uv-0.5)*vec2(u_res.x/u_res.y,1.0)));
      col *= mix(0.75, 1.0, vig);

      gl_FragColor = vec4(col, 1.0);
    }
  `;
  const FS_BRIGHT = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_tex; uniform float u_thr;
    void main(){
      vec3 c = texture2D(u_tex, v_uv).rgb;
      float lum = dot(c, vec3(0.299,0.587,0.114));
      float w = smoothstep(u_thr, u_thr+0.1, lum);
      gl_FragColor = vec4(c * w, 1.0);
    }
  `;
  const FS_BLUR = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_tex; uniform vec2 u_dir;
    void main(){
      vec3 c = vec3(0.0);
      c += texture2D(u_tex, v_uv + u_dir * -3.0).rgb * 0.05;
      c += texture2D(u_tex, v_uv + u_dir * -2.0).rgb * 0.12;
      c += texture2D(u_tex, v_uv + u_dir * -1.0).rgb * 0.20;
      c += texture2D(u_tex, v_uv                ).rgb * 0.26;
      c += texture2D(u_tex, v_uv + u_dir *  1.0).rgb * 0.20;
      c += texture2D(u_tex, v_uv + u_dir *  2.0).rgb * 0.12;
      c += texture2D(u_tex, v_uv + u_dir *  3.0).rgb * 0.05;
      gl_FragColor = vec4(c, 1.0);
    }
  `;
  const FS_COMP = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_base; uniform sampler2D u_bloom;
    uniform float u_str;
    void main(){
      vec3 b = texture2D(u_base, v_uv).rgb;
      vec3 g = texture2D(u_bloom, v_uv).rgb * u_str;
      gl_FragColor = vec4(b + g, 1.0);
    }
  `;

  function attach(host, opts){
    opts = opts || {};
    const base0 = PRESETS[opts.preset || 'BlueCrazyDMT'] || PRESETS.BlueCrazyDMT;
    const T = Object.assign({}, base0, opts);
    if (!opts.src) { console.warn('CrazyDMT: no src video given'); }

    const video = document.createElement('video');
    Object.assign(video, { autoplay:true, muted:true, loop:true, playsInline:true, crossOrigin:'anonymous' });
    video.setAttribute('muted',''); video.setAttribute('playsinline','');
    video.style.cssText = 'position:fixed;inset:0;width:1px;height:1px;opacity:0;pointer-events:none';
    if (opts.src) { video.src = opts.src; }
    document.body.appendChild(video);
    video.play().catch(()=>{});

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none';
    if (host === document.body) document.body.appendChild(canvas);
    else { if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
           canvas.style.position = 'absolute'; host.appendChild(canvas); }

    const gl = canvas.getContext('webgl', { antialias:false, premultipliedAlpha:false });
    if (!gl) { console.warn('CrazyDMT: no WebGL'); return null; }

    function compile(type, src){
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('CrazyDMT shader:', gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    function makeProg(vs, fs){
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
      return p;
    }
    const progMain = makeProg(VS, FS_MAIN), progBright = makeProg(VS, FS_BRIGHT),
          progBlur = makeProg(VS, FS_BLUR), progComp = makeProg(VS, FS_COMP);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    function bindAttrib(p){
      const loc = gl.getAttribLocation(p, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    const vidTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, vidTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    function makeFBO(w, h){
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo, tex, w, h };
    }
    let base = null, bA = null, bB = null;
    const dpr = Math.min(global.devicePixelRatio || 1, 1.25);
    function resize(){
      const r = (host === document.body) ? { width: innerWidth, height: innerHeight } : host.getBoundingClientRect();
      const w = Math.max(2, Math.floor(r.width * dpr)), hh = Math.max(2, Math.floor(r.height * dpr));
      canvas.width = w; canvas.height = hh;
      gl.viewport(0,0,w,hh);
      base = makeFBO(w, hh);
      bA = makeFBO(Math.floor(w/2), Math.floor(hh/2));
      bB = makeFBO(Math.floor(w/2), Math.floor(hh/2));
    }
    resize();
    addEventListener('resize', resize);

    const uL = (prog, name) => gl.getUniformLocation(prog, name);
    const start = performance.now();
    let alive = true;
    function frame(){
      if (!alive) return;
      const t = (performance.now() - start) / 1000;
      video.playbackRate = Math.max(0.1, T.speed || 1);
      if (video.readyState >= 2) {
        gl.bindTexture(gl.TEXTURE_2D, vidTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); } catch(e){}
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, base.fbo);
      gl.viewport(0,0, base.w, base.h);
      gl.useProgram(progMain);
      bindAttrib(progMain);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, vidTex);
      gl.uniform1i(uL(progMain,'u_tex'), 0);
      gl.uniform2f(uL(progMain,'u_res'), base.w, base.h);
      gl.uniform2f(uL(progMain,'u_vidRes'), video.videoWidth || 16, video.videoHeight || 9);
      gl.uniform1f(uL(progMain,'u_time'), t);
      FLOAT_KEYS.forEach(k => gl.uniform1f(uL(progMain,'u_'+k), T[k]));
      BOOL_KEYS.forEach(k => gl.uniform1f(uL(progMain,'u_'+k), T[k] ? 1 : 0));
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (T.bloomOn) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, bA.fbo);
        gl.viewport(0,0, bA.w, bA.h);
        gl.useProgram(progBright); bindAttrib(progBright);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, base.tex);
        gl.uniform1i(uL(progBright,'u_tex'), 0);
        gl.uniform1f(uL(progBright,'u_thr'), T.bloomThr);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.bindFramebuffer(gl.FRAMEBUFFER, bB.fbo);
        gl.viewport(0,0, bB.w, bB.h);
        gl.useProgram(progBlur); bindAttrib(progBlur);
        gl.bindTexture(gl.TEXTURE_2D, bA.tex);
        gl.uniform1i(uL(progBlur,'u_tex'), 0);
        gl.uniform2f(uL(progBlur,'u_dir'), 1/bA.w, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.bindFramebuffer(gl.FRAMEBUFFER, bA.fbo);
        gl.useProgram(progBlur); bindAttrib(progBlur);
        gl.bindTexture(gl.TEXTURE_2D, bB.tex);
        gl.uniform1i(uL(progBlur,'u_tex'), 0);
        gl.uniform2f(uL(progBlur,'u_dir'), 0, 1/bB.h);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0,0, canvas.width, canvas.height);
      gl.useProgram(progComp); bindAttrib(progComp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, base.tex);
      gl.uniform1i(uL(progComp,'u_base'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, T.bloomOn ? bA.tex : base.tex);
      gl.uniform1i(uL(progComp,'u_bloom'), 1);
      gl.uniform1f(uL(progComp,'u_str'), T.bloomOn ? T.bloomStr : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(frame);
    }
    frame();

    return {
      canvas, video, params: T,
      set(k, v){ T[k] = v; },
      destroy(){ alive = false; removeEventListener('resize', resize); canvas.remove(); video.remove(); }
    };
  }

  global.CrazyDMT = { attach, presets: PRESETS };
})(window);
