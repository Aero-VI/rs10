// WebGL2 Renderer - handles all rendering operations
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {
      antialias: true, alpha: false, 
      premultipliedAlpha: false, preserveDrawingBuffer: false
    });
    if (!this.gl) throw new Error('WebGL2 not supported');
    
    // Enable float texture extensions early
    this.gl.getExtension('EXT_color_buffer_float');
    this.gl.getExtension('EXT_color_buffer_half_float');
    this.gl.getExtension('OES_texture_float_linear');
    
    this.width = 0;
    this.height = 0;
    this.time = 0;
    this.dayTime = 0.35; // Start at morning
    this.daySpeed = 0.002; // Time progression speed
    
    // Camera
    this.cameraX = 40;
    this.cameraY = 40;
    this.cameraZ = 25;
    this.cameraZoom = 1.0;
    
    // Matrices
    this.projMatrix = new Float32Array(16);
    this.viewMatrix = new Float32Array(16);
    
    // Point lights
    this.pointLights = [];
    this.pointLightColors = [];
    
    this.programs = {};
    this.textures = {};
    this.framebuffers = {};
    this.vaos = {};
    this.buffers = {};
    
    this._spriteTexCache = {};
  }
  
  init() {
    const gl = this.gl;
    this.resize();
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    
    // Compile all shader programs
    this.programs.terrain = Shaders.link(gl, Shaders.terrainVert, Shaders.terrainFrag,
      ['aPosition', 'aTexCoord', 'aTileType', 'aHeight']);
    this.programs.sprite = Shaders.link(gl, Shaders.spriteVert, Shaders.spriteFrag,
      ['aPosition', 'aTexCoord', 'aColor']);
    this.programs.building = Shaders.link(gl, Shaders.buildingVert, Shaders.buildingFrag,
      ['aPosition', 'aTexCoord', 'aNormal']);
    this.programs.particle = Shaders.link(gl, Shaders.particleVert, Shaders.particleFrag,
      ['aPosition', 'aColor', 'aSize']);
    this.programs.bloomExtract = Shaders.link(gl, Shaders.postVert, Shaders.bloomExtractFrag, ['aPosition']);
    this.programs.blur = Shaders.link(gl, Shaders.postVert, Shaders.blurFrag, ['aPosition']);
    this.programs.composite = Shaders.link(gl, Shaders.postVert, Shaders.compositeFrag, ['aPosition']);
    
    // Generate textures
    this.textures = Textures.generateAll(gl);
    
    // Setup post-processing
    this._setupPostProcess();
    
    // Fullscreen quad for post-processing
    this._setupFullscreenQuad();
    
    // Terrain VAO
    this._setupTerrainBuffers();
    
    // Particle system
    this.maxParticles = 2000;
    this._setupParticleBuffers();
  }
  
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = this.canvas.clientWidth * dpr;
    this.height = this.canvas.clientHeight * dpr;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.gl.viewport(0, 0, this.width, this.height);
    this._setupPostProcess();
  }
  
  _setupPostProcess() {
    const gl = this.gl;
    const w = this.width, h = this.height;
    
    // Scene framebuffer
    this.framebuffers.scene = this._createFBO(w, h);
    // Bloom framebuffers (half res)
    this.framebuffers.bloomA = this._createFBO(w >> 1, h >> 1);
    this.framebuffers.bloomB = this._createFBO(w >> 1, h >> 1);
  }
  
  _createFBO(w, h) {
    const gl = this.gl;
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    
    // Try to enable float buffer extension
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    
    // Try RGBA16F first, fall back to RGBA8 if not supported
    let usedFloat = false;
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w || 1, h || 1, 0, gl.RGBA, gl.FLOAT, null);
      usedFloat = true;
    } catch(e) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w || 1, h || 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    
    // Check framebuffer completeness — if not complete, recreate with RGBA8
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE && usedFloat) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w || 1, h || 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    }
    
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w || 1, h || 1);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }
  
  _setupFullscreenQuad() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vaos.quad = vao;
  }
  
  _setupTerrainBuffers() {
    const gl = this.gl;
    this.vaos.terrain = gl.createVertexArray();
    gl.bindVertexArray(this.vaos.terrain);
    
    this.buffers.terrainVerts = gl.createBuffer();
    this.buffers.terrainIndices = gl.createBuffer();
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.terrainVerts);
    // position(3) + texcoord(2) + tiletype(1) + height(1) = 7 floats
    const stride = 7 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 24);
    
    gl.bindVertexArray(null);
    this.terrainIndexCount = 0;
  }
  
  _setupParticleBuffers() {
    const gl = this.gl;
    this.vaos.particles = gl.createVertexArray();
    gl.bindVertexArray(this.vaos.particles);
    
    this.buffers.particles = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.particles);
    // position(3) + color(4) + size(1) = 8 floats
    const stride = 8 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 28);
    
    gl.bindVertexArray(null);
  }
  
  uploadTerrain(vertices, indices) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.terrainVerts);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.terrainIndices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.terrainIndexCount = indices.length;
  }
  
  // Day/night cycle lighting
  getDayLighting() {
    const t = this.dayTime;
    // Sun angle based on time
    const sunAngle = t * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);
    
    const isDay = sunHeight > -0.1;
    const dayFactor = Math.max(0, Math.min(1, (sunHeight + 0.1) / 0.6));
    
    // Sun color: warm at horizon, white at noon
    const horizonFactor = 1 - Math.abs(sunHeight);
    let sunColor, ambientColor, fogColor;
    
    if (isDay) {
      sunColor = [
        0.8 + horizonFactor * 0.4,
        0.7 + (1 - horizonFactor) * 0.3,
        0.5 + (1 - horizonFactor) * 0.5
      ];
      ambientColor = [
        0.15 + dayFactor * 0.15,
        0.15 + dayFactor * 0.2,
        0.2 + dayFactor * 0.15
      ];
      fogColor = [
        0.5 + dayFactor * 0.2 + horizonFactor * 0.2,
        0.55 + dayFactor * 0.2,
        0.6 + dayFactor * 0.2
      ];
    } else {
      const nightDepth = Math.max(0, -sunHeight);
      sunColor = [0.05, 0.05, 0.1];
      ambientColor = [
        0.05 + (1 - nightDepth) * 0.1,
        0.05 + (1 - nightDepth) * 0.1,
        0.1 + (1 - nightDepth) * 0.1
      ];
      fogColor = [0.02, 0.02, 0.05];
    }
    
    return {
      sunDir: [sunX, 0.3, Math.max(0.1, sunHeight)],
      sunColor, ambientColor, fogColor,
      dayFactor, sunHeight, isDay
    };
  }
  
  updateCamera(targetX, targetY) {
    const lerpSpeed = 0.08;
    this.cameraX += (targetX - this.cameraX) * lerpSpeed;
    this.cameraY += (targetY - this.cameraY) * lerpSpeed;
  }
  
  _computeMatrices() {
    // Isometric projection
    const aspect = this.width / this.height;
    const zoom = this.cameraZoom * 1.5;
    const w = zoom * aspect * 10;
    const h = zoom * 10;
    
    // Orthographic projection
    const l = -w, r = w, b = -h, top = h, near = -100, far = 100;
    const p = this.projMatrix;
    p.fill(0);
    p[0] = 2 / (r - l); p[5] = 2 / (top - b); p[10] = -2 / (far - near);
    p[12] = -(r + l) / (r - l); p[13] = -(top + b) / (top - b); p[14] = -(far + near) / (far - near);
    p[15] = 1;
    
    // Isometric view (rotate 45° around Z, then tilt ~30° around X)
    const v = this.viewMatrix;
    const cx = this.cameraX, cy = this.cameraY, cz = this.cameraZ;
    // Manual isometric matrix
    const a = Math.PI / 4; // 45 degrees
    const b2 = Math.atan(0.5); // ~26.57 degrees for true isometric
    const cosA = Math.cos(a), sinA = Math.sin(a);
    const cosB = Math.cos(b2), sinB = Math.sin(b2);
    
    v[0] = cosA;     v[1] = sinA * sinB;   v[2] = -sinA * cosB;  v[3] = 0;
    v[4] = -sinA;    v[5] = cosA * sinB;   v[6] = -cosA * cosB;  v[7] = 0;
    v[8] = 0;        v[9] = cosB;          v[10] = sinB;          v[11] = 0;
    v[12] = -(cosA * cx - sinA * cy);
    v[13] = -(sinA * sinB * cx + cosA * sinB * cy + cosB * cz);
    v[14] = -(-sinA * cosB * cx - cosA * cosB * cy + sinB * cz);
    v[15] = 1;
  }
  
  // Convert world position to screen UV for god rays
  worldToScreen(wx, wy, wz) {
    this._computeMatrices();
    const v = this.viewMatrix, p = this.projMatrix;
    // view transform
    const vx = v[0]*wx + v[4]*wy + v[8]*wz + v[12];
    const vy = v[1]*wx + v[5]*wy + v[9]*wz + v[13];
    const vz = v[2]*wx + v[6]*wy + v[10]*wz + v[14];
    // projection
    const px = p[0]*vx + p[4]*vy + p[8]*vz + p[12];
    const py = p[1]*vx + p[5]*vy + p[9]*vz + p[13];
    return [(px + 1) * 0.5, (py + 1) * 0.5];
  }
  
  // Create a colored sprite texture (for entities)
  createSpriteTexture(colorData, w, h) {
    const key = JSON.stringify(colorData) + w + h;
    if (this._spriteTexCache[key]) return this._spriteTexCache[key];
    
    const gl = this.gl;
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < colorData.length; i++) {
      data[i] = colorData[i];
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this._spriteTexCache[key] = tex;
    return tex;
  }
  
  beginFrame() {
    const gl = this.gl;
    this.time += 1/60;
    this.dayTime = (this.dayTime + this.daySpeed / 60) % 1;
    this._computeMatrices();
    
    // Render to scene FBO
    if (this.framebuffers.scene) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.scene.fb);
    }
    
    const lighting = this.getDayLighting();
    const bg = lighting.fogColor;
    gl.clearColor(bg[0] * 0.5, bg[1] * 0.5, bg[2] * 0.5, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
  
  renderTerrain() {
    if (this.terrainIndexCount === 0) return;
    const gl = this.gl;
    const prog = this.programs.terrain;
    gl.useProgram(prog);
    
    const u = prog.uniforms;
    gl.uniformMatrix4fv(u.uProjection, false, this.projMatrix);
    gl.uniformMatrix4fv(u.uView, false, this.viewMatrix);
    gl.uniform3f(u.uCameraPos, this.cameraX, this.cameraY, this.cameraZ);
    gl.uniform1f(u.uTime, this.time);
    
    const lighting = this.getDayLighting();
    gl.uniform3fv(u.uSunDir, lighting.sunDir);
    gl.uniform3fv(u.uSunColor, lighting.sunColor);
    gl.uniform3fv(u.uAmbientColor, lighting.ambientColor);
    gl.uniform1f(u.uDayNight, this.dayTime);
    gl.uniform3fv(u.uFogColor, lighting.fogColor);
    gl.uniform1f(u.uFogDensity, 0.015);
    
    // Point lights
    this._setPointLightUniforms(prog);
    
    // Bind textures
    const texNames = ['uTexGrass', 'uTexCobble', 'uTexStone', 'uTexWater', 'uTexDirt', 'uTexSand'];
    const texKeys = ['grass', 'cobblestone', 'stone', 'water', 'dirt', 'sand'];
    texNames.forEach((name, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[texKeys[i]]);
      gl.uniform1i(u[name], i);
    });
    
    gl.bindVertexArray(this.vaos.terrain);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.terrainIndices);
    gl.drawElements(gl.TRIANGLES, this.terrainIndexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
  
  renderBuildings(buildings) {
    const gl = this.gl;
    const prog = this.programs.building;
    gl.useProgram(prog);
    
    const u = prog.uniforms;
    gl.uniformMatrix4fv(u.uProjection, false, this.projMatrix);
    gl.uniformMatrix4fv(u.uView, false, this.viewMatrix);
    gl.uniform1f(u.uTime, this.time);
    
    const lighting = this.getDayLighting();
    gl.uniform3fv(u.uSunDir, lighting.sunDir);
    gl.uniform3fv(u.uSunColor, lighting.sunColor);
    gl.uniform3fv(u.uAmbientColor, lighting.ambientColor);
    this._setPointLightUniforms(prog);
    
    for (const b of buildings) {
      if (!b.vao) this._buildBuildingVAO(b);
      
      // Model matrix (just translation)
      const model = new Float32Array(16);
      model[0] = 1; model[5] = 1; model[10] = 1; model[15] = 1;
      model[12] = b.x; model[13] = b.y; model[14] = 0;
      gl.uniformMatrix4fv(u.uModel, false, model);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, b.texture || this.textures.stone);
      gl.uniform1i(u.uTexture, 0);
      
      gl.bindVertexArray(b.vao);
      gl.drawElements(gl.TRIANGLES, b.indexCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
  }
  
  _buildBuildingVAO(b) {
    const gl = this.gl;
    b.vao = gl.createVertexArray();
    gl.bindVertexArray(b.vao);
    
    const verts = [];
    const indices = [];
    const w = b.width, d = b.depth, h = b.height;
    
    // Generate box vertices with normals
    const faces = [
      // Front face (facing camera in iso view = -y side)
      { ps: [[0,0,0],[w,0,0],[w,0,h],[0,0,h]], n: [0,-1,0] },
      // Back face
      { ps: [[w,d,0],[0,d,0],[0,d,h],[w,d,h]], n: [0,1,0] },
      // Left
      { ps: [[0,d,0],[0,0,0],[0,0,h],[0,d,h]], n: [-1,0,0] },
      // Right
      { ps: [[w,0,0],[w,d,0],[w,d,h],[w,0,h]], n: [1,0,0] },
      // Top
      { ps: [[0,0,h],[w,0,h],[w,d,h],[0,d,h]], n: [0,0,1] },
    ];
    
    let idx = 0;
    for (const face of faces) {
      const uvs = [[0,0],[1,0],[1,1],[0,1]];
      for (let j = 0; j < 4; j++) {
        const p = face.ps[j];
        verts.push(p[0], p[1], p[2], uvs[j][0], uvs[j][1], face.n[0], face.n[1], face.n[2]);
      }
      indices.push(idx, idx+1, idx+2, idx, idx+2, idx+3);
      idx += 4;
    }
    
    // Pitched roof
    if (b.hasRoof) {
      const roofH = h + d * 0.4;
      const roofPeak = d / 2;
      // Left slope
      const roofFaces = [
        { ps: [[0,0,h],[w,0,h],[w,roofPeak,roofH],[0,roofPeak,roofH]], n: [0,-0.7,0.7] },
        { ps: [[w,d,h],[0,d,h],[0,roofPeak,roofH],[w,roofPeak,roofH]], n: [0,0.7,0.7] },
        // Gable ends
        { ps: [[0,0,h],[0,d,h],[0,roofPeak,roofH]], n: [-1,0,0], tri: true },
        { ps: [[w,d,h],[w,0,h],[w,roofPeak,roofH]], n: [1,0,0], tri: true },
      ];
      
      for (const face of roofFaces) {
        if (face.tri) {
          const uvs = [[0,0],[1,0],[0.5,1]];
          for (let j = 0; j < 3; j++) {
            const p = face.ps[j];
            verts.push(p[0], p[1], p[2], uvs[j][0], uvs[j][1], face.n[0], face.n[1], face.n[2]);
          }
          indices.push(idx, idx+1, idx+2);
          idx += 3;
        } else {
          const uvs = [[0,0],[1,0],[1,1],[0,1]];
          for (let j = 0; j < 4; j++) {
            const p = face.ps[j];
            verts.push(p[0], p[1], p[2], uvs[j][0], uvs[j][1], face.n[0], face.n[1], face.n[2]);
          }
          indices.push(idx, idx+1, idx+2, idx, idx+2, idx+3);
          idx += 4;
        }
      }
    }
    
    const vBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    
    const stride = 8 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 20);
    
    const iBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    
    b.indexCount = indices.length;
    b.texture = b.useRoof ? this.textures.roof : this.textures.stone;
    gl.bindVertexArray(null);
  }
  
  renderSprites(sprites) {
    const gl = this.gl;
    const prog = this.programs.sprite;
    gl.useProgram(prog);
    
    const u = prog.uniforms;
    gl.uniformMatrix4fv(u.uProjection, false, this.projMatrix);
    gl.uniformMatrix4fv(u.uView, false, this.viewMatrix);
    gl.uniform1f(u.uAlpha, 1.0);
    
    const lighting = this.getDayLighting();
    gl.uniform3fv(u.uAmbientColor, lighting.ambientColor);
    gl.uniform3fv(u.uSunColor, lighting.sunColor);
    gl.uniform3fv(u.uSunDir, lighting.sunDir);
    
    // Sort sprites by y for proper z-ordering
    sprites.sort((a, b) => b.y - a.y || a.x - b.x);
    
    for (const sprite of sprites) {
      if (!sprite.vao) {
        this._buildSpriteVAO(sprite);
      } else {
        this.updateSpritePosition(sprite);
      }
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sprite.texture);
      gl.uniform1i(u.uTexture, 0);
      gl.uniform1f(u.uAlpha, sprite.alpha || 1.0);
      
      gl.bindVertexArray(sprite.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
  }
  
  _buildSpriteVAO(sprite) {
    const gl = this.gl;
    sprite.vao = gl.createVertexArray();
    gl.bindVertexArray(sprite.vao);
    
    const hw = sprite.spriteW / 2, hh = sprite.spriteH;
    const x = sprite.x, y = sprite.y, z = sprite.z || 0;
    const r = sprite.color ? sprite.color[0] : 1;
    const g = sprite.color ? sprite.color[1] : 1;
    const b = sprite.color ? sprite.color[2] : 1;
    
    const verts = new Float32Array([
      x-hw, y, z,     0, 1,  r, g, b, 1,
      x+hw, y, z,     1, 1,  r, g, b, 1,
      x-hw, y, z+hh,  0, 0,  r, g, b, 1,
      x+hw, y, z+hh,  1, 0,  r, g, b, 1,
    ]);
    
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    
    const stride = 9 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 20);
    
    sprite._buf = buf;
    gl.bindVertexArray(null);
  }
  
  updateSpritePosition(sprite) {
    if (!sprite._buf) return;
    const gl = this.gl;
    const hw = sprite.spriteW / 2, hh = sprite.spriteH;
    const x = sprite.x, y = sprite.y, z = sprite.z || 0;
    const r = sprite.color ? sprite.color[0] : 1;
    const g = sprite.color ? sprite.color[1] : 1;
    const b2 = sprite.color ? sprite.color[2] : 1;
    
    const verts = new Float32Array([
      x-hw, y, z,     0, 1,  r, g, b2, 1,
      x+hw, y, z,     1, 1,  r, g, b2, 1,
      x-hw, y, z+hh,  0, 0,  r, g, b2, 1,
      x+hw, y, z+hh,  1, 0,  r, g, b2, 1,
    ]);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, sprite._buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
  }
  
  renderParticles(particles) {
    if (particles.length === 0) return;
    const gl = this.gl;
    const prog = this.programs.particle;
    gl.useProgram(prog);
    
    gl.uniformMatrix4fv(prog.uniforms.uProjection, false, this.projMatrix);
    gl.uniformMatrix4fv(prog.uniforms.uView, false, this.viewMatrix);
    
    const data = new Float32Array(particles.length * 8);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const o = i * 8;
      data[o] = p.x; data[o+1] = p.y; data[o+2] = p.z;
      data[o+3] = p.r; data[o+4] = p.g; data[o+5] = p.b; data[o+6] = p.a;
      data[o+7] = p.size;
    }
    
    gl.bindVertexArray(this.vaos.particles);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.particles);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, particles.length);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }
  
  endFrame() {
    const gl = this.gl;
    if (!this.framebuffers.scene) return;
    
    const lighting = this.getDayLighting();
    
    // Bloom extract
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.bloomA.fb);
    gl.viewport(0, 0, this.framebuffers.bloomA.w, this.framebuffers.bloomA.h);
    gl.useProgram(this.programs.bloomExtract);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.framebuffers.scene.tex);
    gl.uniform1i(this.programs.bloomExtract.uniforms.uScene, 0);
    gl.uniform1f(this.programs.bloomExtract.uniforms.uThreshold, 0.6);
    gl.bindVertexArray(this.vaos.quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // Blur passes
    for (let pass = 0; pass < 3; pass++) {
      // Horizontal
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.bloomB.fb);
      gl.useProgram(this.programs.blur);
      gl.bindTexture(gl.TEXTURE_2D, this.framebuffers.bloomA.tex);
      gl.uniform1i(this.programs.blur.uniforms.uTexture, 0);
      gl.uniform2f(this.programs.blur.uniforms.uDirection, 1, 0);
      gl.uniform2f(this.programs.blur.uniforms.uResolution, 
        this.framebuffers.bloomA.w, this.framebuffers.bloomA.h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      
      // Vertical
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.bloomA.fb);
      gl.bindTexture(gl.TEXTURE_2D, this.framebuffers.bloomB.tex);
      gl.uniform2f(this.programs.blur.uniforms.uDirection, 0, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    
    // Composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.programs.composite);
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.framebuffers.scene.tex);
    gl.uniform1i(this.programs.composite.uniforms.uScene, 0);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.framebuffers.bloomA.tex);
    gl.uniform1i(this.programs.composite.uniforms.uBloom, 1);
    
    gl.uniform1f(this.programs.composite.uniforms.uBloomStrength, 0.4);
    gl.uniform1f(this.programs.composite.uniforms.uExposure, 1.2);
    
    // God rays - compute sun screen position
    const sunDir = lighting.sunDir;
    const sunScreenPos = this.worldToScreen(
      this.cameraX + sunDir[0] * 50,
      this.cameraY + sunDir[1] * 50,
      sunDir[2] * 50
    );
    gl.uniform2fv(this.programs.composite.uniforms.uSunScreenPos, sunScreenPos);
    gl.uniform1f(this.programs.composite.uniforms.uGodRayStrength, 
      lighting.isDay ? 0.3 * lighting.dayFactor : 0);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
  
  _setPointLightUniforms(prog) {
    const gl = this.gl;
    const u = prog.uniforms;
    const n = Math.min(this.pointLights.length, 16);
    gl.uniform1i(u.uNumPointLights || u['uNumPointLights'], n);
    
    for (let i = 0; i < n; i++) {
      const pName = `uPointLights[${i}]`;
      const cName = `uPointLightColors[${i}]`;
      const pLoc = gl.getUniformLocation(prog, pName);
      const cLoc = gl.getUniformLocation(prog, cName);
      if (pLoc) gl.uniform3fv(pLoc, this.pointLights[i]);
      if (cLoc) gl.uniform3fv(cLoc, this.pointLightColors[i]);
    }
  }
  
  // Screen to world conversion for mouse picking
  screenToWorld(sx, sy) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ndcX = (sx / this.canvas.clientWidth) * 2 - 1;
    const ndcY = -((sy / this.canvas.clientHeight) * 2 - 1);
    
    // Invert projection and view
    const zoom = this.cameraZoom * 1.5;
    const aspect = this.width / this.height;
    const worldX = ndcX * zoom * aspect * 10;
    const worldY = ndcY * zoom * 10;
    
    // Invert isometric rotation
    const a = Math.PI / 4;
    const b = Math.atan(0.5);
    const cosA = Math.cos(a), sinA = Math.sin(a);
    const cosB = Math.cos(b), sinB = Math.sin(b);
    
    // Simplified inverse for z=0 plane
    const tx = worldX + this.cameraX;
    const ty = worldY + this.cameraY;
    
    const rx = cosA * tx - sinA * ty;
    const ry = sinA * tx + cosA * ty;
    
    // Adjust for isometric tilt
    const finalX = cosA * worldX - sinA * worldY / sinB + this.cameraX;
    const finalY = sinA * worldX + cosA * worldY / sinB + this.cameraY;
    
    return { x: finalX, y: finalY };
  }
}
