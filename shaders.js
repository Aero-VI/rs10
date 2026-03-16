// GLSL Shader sources for WebGL2 rendering
const Shaders = {
  // ===================== TERRAIN SHADER =====================
  terrainVert: `#version 300 es
    precision highp float;
    
    in vec3 aPosition;
    in vec2 aTexCoord;
    in float aTileType;
    in float aHeight;
    
    uniform mat4 uProjection;
    uniform mat4 uView;
    uniform vec3 uCameraPos;
    uniform float uTime;
    
    out vec2 vTexCoord;
    out vec3 vWorldPos;
    out float vTileType;
    out float vHeight;
    out float vFogDist;
    
    void main() {
      vec3 pos = aPosition;
      // Water animation
      if (aTileType > 3.5 && aTileType < 4.5) {
        pos.z += sin(pos.x * 2.0 + uTime * 1.5) * 0.05 + cos(pos.y * 3.0 + uTime) * 0.03;
      }
      vWorldPos = pos;
      vTexCoord = aTexCoord;
      vTileType = aTileType;
      vHeight = aHeight;
      vFogDist = length(pos.xy - uCameraPos.xy);
      gl_Position = uProjection * uView * vec4(pos, 1.0);
    }`,

  terrainFrag: `#version 300 es
    precision highp float;
    
    in vec2 vTexCoord;
    in vec3 vWorldPos;
    in float vTileType;
    in float vHeight;
    in float vFogDist;
    
    uniform sampler2D uTexGrass;
    uniform sampler2D uTexCobble;
    uniform sampler2D uTexStone;
    uniform sampler2D uTexWater;
    uniform sampler2D uTexDirt;
    uniform sampler2D uTexSand;
    
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uAmbientColor;
    uniform float uTime;
    uniform float uDayNight; // 0=midnight, 0.5=noon, 1=midnight
    
    // Point lights (torches, etc)
    uniform vec3 uPointLights[16];
    uniform vec3 uPointLightColors[16];
    uniform int uNumPointLights;
    
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    
    out vec4 fragColor;
    
    vec3 sampleTerrain(vec2 uv) {
      int t = int(vTileType + 0.5);
      if (t == 0) return texture(uTexGrass, uv).rgb;
      if (t == 1) return texture(uTexCobble, uv).rgb;
      if (t == 2) return texture(uTexStone, uv).rgb;
      if (t == 3) return texture(uTexDirt, uv).rgb;
      if (t == 4) {
        vec2 wuv = uv + vec2(sin(uTime * 0.5 + uv.y * 5.0) * 0.02, cos(uTime * 0.7 + uv.x * 4.0) * 0.02);
        vec3 water = texture(uTexWater, wuv).rgb;
        float specular = pow(max(0.0, sin(uTime * 2.0 + vWorldPos.x * 3.0 + vWorldPos.y * 2.0)), 8.0) * 0.3;
        return water + vec3(specular);
      }
      if (t == 5) return texture(uTexSand, uv).rgb;
      return texture(uTexGrass, uv).rgb;
    }
    
    void main() {
      vec2 uv = vTexCoord * 4.0;
      vec3 color = sampleTerrain(uv);
      
      // Basic normal from terrain (flat for ground)
      vec3 normal = vec3(0.0, 0.0, 1.0);
      
      // Sun lighting
      float sunDot = max(dot(normal, normalize(uSunDir)), 0.0);
      vec3 lighting = uAmbientColor + uSunColor * sunDot;
      
      // Point lights
      for (int i = 0; i < 16; i++) {
        if (i >= uNumPointLights) break;
        vec3 toLight = uPointLights[i] - vWorldPos;
        float dist = length(toLight);
        float atten = 1.0 / (1.0 + 0.3 * dist + 0.1 * dist * dist);
        float flicker = 0.9 + 0.1 * sin(uTime * 8.0 + float(i) * 3.7);
        lighting += uPointLightColors[i] * atten * flicker;
      }
      
      color *= lighting;
      
      // Height-based ambient occlusion
      color *= (0.7 + 0.3 * clamp(vHeight + 0.5, 0.0, 1.0));
      
      // Fog
      float fog = 1.0 - exp(-vFogDist * uFogDensity);
      color = mix(color, uFogColor, clamp(fog, 0.0, 0.8));
      
      fragColor = vec4(color, 1.0);
    }`,

  // ===================== SPRITE/ENTITY SHADER =====================
  spriteVert: `#version 300 es
    precision highp float;
    
    in vec3 aPosition;
    in vec2 aTexCoord;
    in vec4 aColor;
    
    uniform mat4 uProjection;
    uniform mat4 uView;
    
    out vec2 vTexCoord;
    out vec4 vColor;
    out vec3 vWorldPos;
    
    void main() {
      vTexCoord = aTexCoord;
      vColor = aColor;
      vWorldPos = aPosition;
      gl_Position = uProjection * uView * vec4(aPosition, 1.0);
    }`,

  spriteFrag: `#version 300 es
    precision highp float;
    
    in vec2 vTexCoord;
    in vec4 vColor;
    in vec3 vWorldPos;
    
    uniform sampler2D uTexture;
    uniform float uAlpha;
    uniform vec3 uAmbientColor;
    uniform vec3 uSunColor;
    uniform vec3 uSunDir;
    
    out vec4 fragColor;
    
    void main() {
      vec4 tex = texture(uTexture, vTexCoord);
      if (tex.a < 0.1) discard;
      vec3 color = tex.rgb * vColor.rgb;
      float light = max(dot(vec3(0,0,1), normalize(uSunDir)), 0.0);
      color *= (uAmbientColor + uSunColor * light * 0.5);
      fragColor = vec4(color, tex.a * uAlpha * vColor.a);
    }`,

  // ===================== BUILDING SHADER =====================
  buildingVert: `#version 300 es
    precision highp float;
    
    in vec3 aPosition;
    in vec2 aTexCoord;
    in vec3 aNormal;
    
    uniform mat4 uProjection;
    uniform mat4 uView;
    uniform mat4 uModel;
    
    out vec2 vTexCoord;
    out vec3 vNormal;
    out vec3 vWorldPos;
    
    void main() {
      vec4 worldPos = uModel * vec4(aPosition, 1.0);
      vWorldPos = worldPos.xyz;
      vTexCoord = aTexCoord;
      vNormal = mat3(uModel) * aNormal;
      gl_Position = uProjection * uView * worldPos;
    }`,

  buildingFrag: `#version 300 es
    precision highp float;
    
    in vec2 vTexCoord;
    in vec3 vNormal;
    in vec3 vWorldPos;
    
    uniform sampler2D uTexture;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uAmbientColor;
    uniform float uTime;
    
    uniform vec3 uPointLights[16];
    uniform vec3 uPointLightColors[16];
    uniform int uNumPointLights;
    
    out vec4 fragColor;
    
    void main() {
      vec4 tex = texture(uTexture, vTexCoord);
      vec3 normal = normalize(vNormal);
      
      // Directional sun light
      float sunDot = max(dot(normal, normalize(uSunDir)), 0.0);
      vec3 lighting = uAmbientColor + uSunColor * sunDot;
      
      // Point lights
      for (int i = 0; i < 16; i++) {
        if (i >= uNumPointLights) break;
        vec3 toLight = uPointLights[i] - vWorldPos;
        float dist = length(toLight);
        vec3 lightDir = toLight / dist;
        float atten = 1.0 / (1.0 + 0.2 * dist + 0.08 * dist * dist);
        float ndl = max(dot(normal, lightDir), 0.0);
        float flicker = 0.85 + 0.15 * sin(uTime * 10.0 + float(i) * 5.3);
        lighting += uPointLightColors[i] * atten * ndl * flicker;
      }
      
      vec3 color = tex.rgb * lighting;
      fragColor = vec4(color, tex.a);
    }`,

  // ===================== POST-PROCESS: BLOOM =====================
  postVert: `#version 300 es
    precision highp float;
    in vec2 aPosition;
    out vec2 vTexCoord;
    void main() {
      vTexCoord = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`,

  bloomExtractFrag: `#version 300 es
    precision highp float;
    in vec2 vTexCoord;
    uniform sampler2D uScene;
    uniform float uThreshold;
    out vec4 fragColor;
    void main() {
      vec3 c = texture(uScene, vTexCoord).rgb;
      float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
      fragColor = vec4(brightness > uThreshold ? c : vec3(0.0), 1.0);
    }`,

  blurFrag: `#version 300 es
    precision highp float;
    in vec2 vTexCoord;
    uniform sampler2D uTexture;
    uniform vec2 uDirection;
    uniform vec2 uResolution;
    out vec4 fragColor;
    void main() {
      vec2 texel = uDirection / uResolution;
      vec3 result = vec3(0.0);
      float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
      result += texture(uTexture, vTexCoord).rgb * weights[0];
      for (int i = 1; i < 5; i++) {
        result += texture(uTexture, vTexCoord + texel * float(i)).rgb * weights[i];
        result += texture(uTexture, vTexCoord - texel * float(i)).rgb * weights[i];
      }
      fragColor = vec4(result, 1.0);
    }`,

  compositeFrag: `#version 300 es
    precision highp float;
    in vec2 vTexCoord;
    uniform sampler2D uScene;
    uniform sampler2D uBloom;
    uniform float uBloomStrength;
    uniform float uExposure;
    
    // God rays
    uniform vec2 uSunScreenPos;
    uniform float uGodRayStrength;
    
    out vec4 fragColor;
    
    void main() {
      vec3 scene = texture(uScene, vTexCoord).rgb;
      vec3 bloom = texture(uBloom, vTexCoord).rgb;
      
      // God rays (radial blur from sun position)
      vec3 godRays = vec3(0.0);
      if (uGodRayStrength > 0.01) {
        vec2 deltaUV = (vTexCoord - uSunScreenPos) * (1.0 / 60.0);
        vec2 uv = vTexCoord;
        float illumination = 1.0;
        for (int i = 0; i < 60; i++) {
          uv -= deltaUV;
          vec3 s = texture(uScene, clamp(uv, 0.0, 1.0)).rgb;
          float brightness = dot(s, vec3(0.2126, 0.7152, 0.0722));
          godRays += s * illumination * step(0.5, brightness);
          illumination *= 0.97;
        }
        godRays /= 60.0;
      }
      
      vec3 color = scene + bloom * uBloomStrength + godRays * uGodRayStrength;
      
      // Tone mapping
      color = vec3(1.0) - exp(-color * uExposure);
      
      // Slight vignette
      float vignette = 1.0 - 0.3 * length(vTexCoord - 0.5);
      color *= vignette;
      
      fragColor = vec4(color, 1.0);
    }`,

  // ===================== PARTICLE SHADER =====================
  particleVert: `#version 300 es
    precision highp float;
    
    in vec3 aPosition;
    in vec4 aColor;
    in float aSize;
    
    uniform mat4 uProjection;
    uniform mat4 uView;
    
    out vec4 vColor;
    
    void main() {
      vColor = aColor;
      vec4 viewPos = uView * vec4(aPosition, 1.0);
      gl_Position = uProjection * viewPos;
      gl_PointSize = aSize * (300.0 / length(viewPos.xyz));
    }`,

  particleFrag: `#version 300 es
    precision highp float;
    in vec4 vColor;
    out vec4 fragColor;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      if (d > 1.0) discard;
      float alpha = (1.0 - d * d) * vColor.a;
      fragColor = vec4(vColor.rgb, alpha);
    }`,

  // Helper to compile
  compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  },

  link(gl, vertSrc, fragSrc, attribs) {
    const vs = this.compile(gl, gl.VERTEX_SHADER, vertSrc);
    const fs = this.compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    if (attribs) attribs.forEach((a, i) => gl.bindAttribLocation(prog, i, a));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    // Cache uniform locations
    prog.uniforms = {};
    const numUniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(prog, i);
      prog.uniforms[info.name] = gl.getUniformLocation(prog, info.name);
    }
    return prog;
  }
};
