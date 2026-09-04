/* LumenDrift — slow particle-refraction background. First-party.
   Principle: ~26 wandering particles form an analytic gaussian metaball
   field; the field's exact gradient refracts a procedural deep-gradient
   backdrop (with chromatic dispersion), so the blobs read as drifting
   glass lenses. A second additive point-sprite pass scatters twinkling
   dust motes, and the whole palette hue-drifts slowly over minutes.
   No feedback buffers, no textures.
   Usage:
     <script src="lumen-drift-bg.js"></script>
     <script>LumenDrift.attach(host, { refr:0.022, veil:0.12 })</script>
   Options: refr (refraction strength), disp (chromatic dispersion),
   veil (darken 0..1), speed (motion multiplier), pointer (bool),
   hueAmt (hue-drift depth, radians), motes (count, 0 disables).
   Returns { canvas, params, destroy() } or null without WebGL. */
(function (global) {
  const N = 26, TAU = Math.PI * 2;

  const DEFAULTS = { refr: 0.022, disp: 0.5, veil: 0.12, speed: 1, pointer: true, hueAmt: 1, motes: 90 };

  const VS = `attribute vec2 aPos; varying vec2 vUv;
    void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

  const FS = `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime, uAspect, uRefr, uDisp, uVeil, uHue;
    uniform vec4 uP[${N}];  // x, y (aspect-corrected), 1/r^2, amplitude

    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }

    // Rotate hue about the grey axis (Rodrigues) — cheap, luminance-friendly.
    vec3 hueRot(vec3 c, float a){
      const vec3 k = vec3(0.57735);
      float s = sin(a), co = cos(a);
      return c*co + cross(k,c)*s + k*dot(k,c)*(1.0-co);
    }

    // Deep molten-navy gradient with a slow drifting glow. Procedural, so
    // refraction just re-evaluates it at an offset — no texture sampling.
    vec3 bg(vec2 uv){
      float t = uv.y + 0.06*sin(uTime*0.02 + uv.x*2.2);
      vec3 c = mix(vec3(0.028,0.040,0.094), vec3(0.075,0.100,0.180), smoothstep(0.0,0.75,t));
      c = mix(c, vec3(0.165,0.140,0.300), smoothstep(0.55,1.1,t)*0.6);
      vec2 g = vec2(0.70+0.12*sin(uTime*0.011), 0.32+0.10*cos(uTime*0.009));
      vec2 d = (uv-g)*vec2(uAspect,1.0);
      c += vec3(0.075,0.070,0.135)*exp(-dot(d,d)*2.6);
      return c;
    }

    void main(){
      vec2 p = vec2(vUv.x*uAspect, vUv.y);

      // Metaball field + exact analytic gradient in one loop.
      float F = 0.0; vec2 G = vec2(0.0);
      for (int i = 0; i < ${N}; i++) {
        vec2 d = p - uP[i].xy;
        float e = uP[i].w * exp(-dot(d,d)*uP[i].z);
        F += e;
        G += -2.0*uP[i].z*d*e;
      }

      // Refract the backdrop through the field, per-channel for dispersion.
      vec2 off = G*uRefr; off.x /= uAspect;
      vec3 col;
      col.r = bg(vUv + off*(1.0-uDisp)).r;
      col.g = bg(vUv + off).g;
      col.b = bg(vUv + off*(1.0+uDisp)).b;

      // Glass body: darken interior slightly, lift toward violet.
      float body = smoothstep(0.35, 1.6, F);
      col *= 1.0 - 0.22*body;
      col += vec3(0.10,0.09,0.19)*body*0.35;

      // Lavender rim where the field crosses the surface band.
      float rim = smoothstep(0.28,0.60,F)*(1.0-smoothstep(0.60,1.15,F));
      float breathe = 0.7 + 0.3*sin(uTime*0.3);
      col += vec3(0.58,0.58,0.80)*rim*rim*0.5*breathe;

      // Specular glint from the field normal.
      vec3 n = normalize(vec3(-G*1.6, 1.0));
      float spec = pow(max(dot(n, normalize(vec3(-0.35,0.5,0.78))),0.0),48.0);
      col += vec3(0.50,0.55,0.72)*spec*smoothstep(0.25,0.9,F)*0.5;

      // Faint cyan dispersal shimmer on rims.
      col += vec3(0.03,0.09,0.11)*rim*max(0.0,sin(uTime*0.08+p.x*3.0))*0.6;

      // Slow global hue drift; slightly deeper inside the glass bodies.
      col = hueRot(col, uHue*(1.0 + 0.5*body));

      // Vignette, veil, grain.
      col *= mix(0.72, 1.0, smoothstep(1.35, 0.35, length(vUv-0.5)*1.6));
      col *= 1.0 - uVeil;
      col += (hash(gl_FragCoord.xy + fract(uTime))*2.0-1.0)*0.012;
      gl_FragColor = vec4(col, 1.0);
    }`;

  // Dust motes: additive point sprites, twinkling on slow phases.
  const MVS = `
    attribute vec2 aPt; attribute vec3 aData;  // aData: size(px), phase, tint
    uniform float uTime, uDpr;
    varying float vTw; varying float vTint;
    void main(){
      float tw = 0.5 + 0.5*sin(uTime*(0.35 + aData.y*0.12) + aData.y*7.0);
      vTw = 0.2 + 0.8*tw*tw;
      vTint = aData.z;
      gl_PointSize = aData.x*uDpr*(0.8 + 0.4*tw);
      gl_Position = vec4(aPt*2.0 - 1.0, 0.0, 1.0);
    }`;
  const MFS = `
    precision mediump float;
    varying float vTw; varying float vTint;
    uniform float uHue2;
    vec3 hueRot(vec3 c, float a){
      const vec3 k = vec3(0.57735);
      float s = sin(a), co = cos(a);
      return c*co + cross(k,c)*s + k*dot(k,c)*(1.0-co);
    }
    void main(){
      float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5));
      vec3 c = mix(vec3(0.60,0.62,0.86), vec3(0.42,0.70,0.78), vTint);
      gl_FragColor = vec4(hueRot(c, uHue2)*a*a*vTw*0.8, 1.0);
    }`;

  function attach(host, opts) {
    const T = Object.assign({}, DEFAULTS, opts || {});
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(canvas);

    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) { console.warn('LumenDrift: no WebGL'); canvas.remove(); return null; }

    function compile(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('LumenDrift shader:', gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    function makeProg(vs, fs, binds) {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      for (const [loc, name] of binds) gl.bindAttribLocation(p, loc, name);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error('LumenDrift link:', gl.getProgramInfoLog(p)); return null; }
      return p;
    }
    const prog = makeProg(VS, FS, [[0, 'aPos']]);
    const mprog = T.motes > 0 ? makeProg(MVS, MFS, [[1, 'aPt'], [2, 'aData']]) : null;
    if (!prog) { canvas.remove(); return null; }

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const U = (p, n) => gl.getUniformLocation(p, n);
    const uTime = U(prog,'uTime'), uAspect = U(prog,'uAspect'), uRefr = U(prog,'uRefr'),
          uDisp = U(prog,'uDisp'), uVeil = U(prog,'uVeil'), uHue = U(prog,'uHue'), uP = U(prog,'uP[0]');

    // ---- Lens particles: slow wander + gentle swirl + soft containment ----
    let aspect = 1, dpr = 1;
    const P = [];
    for (let i = 0; i < N; i++) P.push({
      x: Math.random(), y: Math.random(),          // x rescaled by aspect on resize
      a: Math.random()*TAU,                        // wander heading
      sp: 0.006 + Math.random()*0.012,             // units/sec — minutes to cross
      r: 0.09 + Math.random()*0.12,
      ph: Math.random()*TAU,
      pw: TAU/(10 + Math.random()*12),             // 10–22s radius pulse
      amp: 0.55 + Math.random()*0.45
    });
    const pdata = new Float32Array(N*4);

    // ---- Dust motes: slow rising drift, wrap at edges ----
    const M = Math.max(0, T.motes|0), motes = [], mdata = new Float32Array(M*5);
    const moteBuf = M ? gl.createBuffer() : null;
    const muTime = mprog && U(mprog,'uTime'), muDpr = mprog && U(mprog,'uDpr'), muHue2 = mprog && U(mprog,'uHue2');
    for (let i = 0; i < M; i++) motes.push({
      x: Math.random(), y: Math.random(),
      vx: (Math.random()-0.5)*0.008, vy: 0.004 + Math.random()*0.010,
      size: 2.5 + Math.random()*4.5,
      ph: Math.random()*TAU,
      tint: Math.random()
    });

    const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, on: false };
    const onMove = e => { ptr.tx = e.clientX/innerWidth; ptr.ty = 1 - e.clientY/innerHeight; ptr.on = true; };
    if (T.pointer) addEventListener('mousemove', onMove);

    function step(dt, t) {
      ptr.x += (ptr.tx - ptr.x)*0.4*dt; ptr.y += (ptr.ty - ptr.y)*0.4*dt;   // pointer eases lazily
      const cx = aspect*0.5, cy = 0.5;
      for (const q of P) {
        q.a += (Math.random()-0.5)*0.5*dt;
        let vx = Math.cos(q.a)*q.sp, vy = Math.sin(q.a)*q.sp;
        const dx = q.x-cx, dy = q.y-cy, dist = Math.hypot(dx,dy);
        vx += -dy*0.0045; vy += dx*0.0045;                                   // slow coherent swirl
        const excess = Math.max(0, dist - 0.55*Math.max(aspect,1));
        vx -= dx/(dist||1)*excess*0.05; vy -= dy/(dist||1)*excess*0.05;      // soft containment
        if (ptr.on) {                                                        // faint pointer pull
          const px = ptr.x*aspect - q.x, py = ptr.y - q.y;
          const f = 0.010*Math.exp(-(px*px+py*py)/0.10);
          vx += px*f; vy += py*f;
        }
        q.x += vx*dt*T.speed; q.y += vy*dt*T.speed;
      }
      for (let i = 0; i < N; i++) {
        const q = P[i], re = q.r*(1 + 0.18*Math.sin(t*q.pw + q.ph));
        pdata[i*4] = q.x; pdata[i*4+1] = q.y;
        pdata[i*4+2] = 1/(re*re); pdata[i*4+3] = q.amp;
      }
      for (let i = 0; i < M; i++) {
        const m = motes[i];
        m.x += (m.vx + Math.sin(t*0.2 + m.ph)*0.003)*dt*T.speed;             // sway as they rise
        m.y += m.vy*dt*T.speed;
        if (m.y > 1.02) { m.y = -0.02; m.x = Math.random(); }
        if (m.x > 1.02) m.x = -0.02; else if (m.x < -0.02) m.x = 1.02;
        mdata[i*5] = m.x; mdata[i*5+1] = m.y;
        mdata[i*5+2] = m.size; mdata[i*5+3] = m.ph; mdata[i*5+4] = m.tint;
      }
    }

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
      const oldAspect = aspect;
      canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
      aspect = w/h;
      for (const q of P) q.x *= aspect/oldAspect;   // keep field un-squashed
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize(); addEventListener('resize', resize);

    let alive = true, last = performance.now();
    (function frame(now) {
      if (!alive) return;
      const t = now/1000, dt = Math.min((now - last)/1000, 0.05); last = now;
      step(dt, t);
      const hue = T.hueAmt*(0.22*Math.sin(t*0.045) + 0.10*Math.sin(t*0.013 + 2.0));

      gl.disable(gl.BLEND);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(uTime, t); gl.uniform1f(uAspect, aspect);
      gl.uniform1f(uRefr, T.refr); gl.uniform1f(uDisp, T.disp); gl.uniform1f(uVeil, T.veil);
      gl.uniform1f(uHue, hue);
      gl.uniform4fv(uP, pdata);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (mprog && M) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);                   // additive sparkle
        gl.useProgram(mprog);
        gl.bindBuffer(gl.ARRAY_BUFFER, moteBuf);
        gl.bufferData(gl.ARRAY_BUFFER, mdata, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 20, 8);
        gl.uniform1f(muTime, t); gl.uniform1f(muDpr, dpr); gl.uniform1f(muHue2, hue);
        gl.drawArrays(gl.POINTS, 0, M);
        gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
      }
      requestAnimationFrame(frame);
    })(last);

    return {
      canvas, params: T,
      destroy() { alive = false; removeEventListener('resize', resize); removeEventListener('mousemove', onMove); canvas.remove(); }
    };
  }

  global.LumenDrift = { attach };
})(window);
