// Procedural texture generation - all textures created in JS
const Textures = {
  SIZE: 256,

  // Perlin noise implementation
  _perm: null,
  _initPerm() {
    if (this._perm) return;
    this._perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this._perm[i] = p[i & 255];
  },

  _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); },
  _lerp(a, b, t) { return a + t * (b - a); },
  _grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  },

  perlin(x, y) {
    this._initPerm();
    const p = this._perm;
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = this._fade(xf), v = this._fade(yf);
    const aa = p[p[xi] + yi], ab = p[p[xi] + yi + 1];
    const ba = p[p[xi + 1] + yi], bb = p[p[xi + 1] + yi + 1];
    return this._lerp(
      this._lerp(this._grad(aa, xf, yf), this._grad(ba, xf - 1, yf), u),
      this._lerp(this._grad(ab, xf, yf - 1), this._grad(bb, xf - 1, yf - 1), u),
      v
    );
  },

  fbm(x, y, octaves = 4) {
    let val = 0, amp = 0.5, freq = 1;
    for (let i = 0; i < octaves; i++) {
      val += amp * this.perlin(x * freq, y * freq);
      amp *= 0.5; freq *= 2;
    }
    return val;
  },

  // Voronoi for cobblestone
  voronoi(x, y, density = 8) {
    const ix = Math.floor(x * density), iy = Math.floor(y * density);
    let minDist = 999, minDist2 = 999;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cx = ix + dx, cy = iy + dy;
        const hash = (cx * 7919 + cy * 104729) & 0xFFFF;
        const px = cx + (hash % 100) / 100;
        const py = cy + ((hash * 31) % 100) / 100;
        const d = Math.sqrt((x * density - px) ** 2 + (y * density - py) ** 2);
        if (d < minDist) { minDist2 = minDist; minDist = d; }
        else if (d < minDist2) { minDist2 = d; }
      }
    }
    return { dist: minDist, edge: minDist2 - minDist };
  },

  createTexture(gl, width, height, data) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  },

  generateGrass(gl) {
    const s = this.SIZE, data = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const n = this.fbm(x / 40, y / 40, 5) * 0.5 + 0.5;
        const n2 = this.fbm(x / 15 + 100, y / 15 + 100, 3) * 0.5 + 0.5;
        const detail = this.perlin(x / 3, y / 3) * 0.1;
        const g = 80 + n * 60 + n2 * 30 + detail * 40;
        data[i] = 30 + n * 30 + detail * 20;
        data[i + 1] = Math.min(255, g);
        data[i + 2] = 20 + n * 15;
        data[i + 3] = 255;
      }
    }
    return this.createTexture(gl, s, s, data);
  },

  generateCobblestone(gl) {
    const s = this.SIZE, data = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const v = this.voronoi(x / s, y / s, 12);
        const isEdge = v.edge < 0.08 ? 1 : 0;
        const n = this.fbm(x / 20, y / 20, 3) * 0.3;
        const stoneColor = 120 + v.dist * 40 + n * 60;
        if (isEdge) {
          data[i] = 60; data[i + 1] = 55; data[i + 2] = 45;
        } else {
          const variation = this.perlin(x / 5 + v.dist * 100, y / 5) * 15;
          data[i] = Math.min(255, stoneColor + variation);
          data[i + 1] = Math.min(255, stoneColor - 5 + variation);
          data[i + 2] = Math.min(255, stoneColor - 15 + variation);
        }
        data[i + 3] = 255;
      }
    }
    return this.createTexture(gl, s, s, data);
  },

  generateStone(gl) {
    const s = this.SIZE, data = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const brickH = 24, brickW = 48;
        const row = Math.floor(y / brickH);
        const offset = (row % 2) * (brickW / 2);
        const bx = (x + offset) % brickW, by = y % brickH;
        const isMortar = bx < 2 || by < 2;
        const n = this.fbm(x / 30, y / 30, 4) * 0.3;
        const detail = this.perlin(x / 4, y / 4) * 0.1;
        if (isMortar) {
          data[i] = 80; data[i + 1] = 75; data[i + 2] = 65; 
        } else {
          const base = 140 + n * 60 + detail * 30;
          const rowVar = ((row * 17 + Math.floor((x + offset) / brickW) * 31) % 30) - 15;
          data[i] = Math.min(255, base + rowVar);
          data[i + 1] = Math.min(255, base - 5 + rowVar);
          data[i + 2] = Math.min(255, base - 15 + rowVar);
        }
        data[i + 3] = 255;
      }
    }
    return this.createTexture(gl, s, s, data);
  },

  generateWood(gl) {
    const s = this.SIZE, data = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const grain = Math.sin((y / 3) + this.perlin(x / 20, y / 60) * 5) * 0.5 + 0.5;
        const n = this.fbm(x / 25, y / 25, 3) * 0.3;
        const knot = Math.max(0, 1 - Math.sqrt((x - 128) ** 2 + (y - 128) ** 2) / 30);
        const base = 100 + grain * 50 + n * 40;
        data[i] = Math.min(255, base + knot * 30);
        data[i + 1] = Math.min(255, base * 0.7 + knot * 20);
        data[i + 2] = Math.min(255, base * 0.4);
        data[i + 3] = 255;
      }
    }
    return this.createTexture(gl, s, s, data);
  },

  generateWater(gl) {
    const s = this.SIZE, data = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const n = this.fbm(x / 30, y / 30, 4) * 0.5 + 0.5;
        const caustic = Math.abs(this.perlin(x / 15, y / 15)) * 0.5;
        data[i] = 20 + caustic * 40;
        data[i + 1] = 60 + n * 60 + caustic * 30;
        data[i + 2] = 120 + n * 80 + caustic * 50;
        data[i + 3] = 200;
      }
    }
    return this.createTexture(gl, s, s, data);
  },

  generateDirt(gl) {
    const s = this.SIZE, data = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const n = this.fbm(x / 20, y / 20, 5) * 0.5 + 0.5;
        const detail = this.perlin(x / 3, y / 3) * 0.15;
        data[i] = Math.min(255, 100 + n * 50 + detail * 30);
        data[i + 1] = Math.min(255, 70 + n * 40 + detail * 20);
        data[i + 2] = Math.min(255, 40 + n * 25 + detail * 15);
        data[i + 3] = 255;
      }
    }
    return this.createTexture(gl, s, s, data);
  },

  generateSand(gl) {
    const s = this.SIZE, data = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const n = this.fbm(x / 15, y / 15, 4) * 0.3 + 0.7;
        const sparkle = Math.random() < 0.01 ? 30 : 0;
        data[i] = Math.min(255, 180 * n + sparkle);
        data[i + 1] = Math.min(255, 160 * n + sparkle);
        data[i + 2] = Math.min(255, 100 * n + sparkle);
        data[i + 3] = 255;
      }
    }
    return this.createTexture(gl, s, s, data);
  },

  generateRoof(gl) {
    const s = this.SIZE, data = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const tileH = 16;
        const row = Math.floor(y / tileH);
        const offset = (row % 2) * 12;
        const ty = y % tileH;
        const isShadow = ty < 3;
        const n = this.perlin(x / 10, y / 10) * 0.2;
        const base = isShadow ? 80 : 130;
        data[i] = Math.min(255, base + n * 30 + 20);
        data[i + 1] = Math.min(255, base * 0.5 + n * 15);
        data[i + 2] = Math.min(255, base * 0.3 + n * 10);
        data[i + 3] = 255;
      }
    }
    return this.createTexture(gl, s, s, data);
  },

  // Normal map from height
  generateNormalMap(gl, heightFn) {
    const s = this.SIZE, data = new Uint8Array(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const h = heightFn(x, y);
        const hx = heightFn(x + 1, y) - heightFn(x - 1, y);
        const hy = heightFn(x, y + 1) - heightFn(x, y - 1);
        const len = Math.sqrt(hx * hx + hy * hy + 1);
        data[i] = (((-hx / len) * 0.5 + 0.5) * 255) | 0;
        data[i + 1] = (((-hy / len) * 0.5 + 0.5) * 255) | 0;
        data[i + 2] = (((1 / len) * 0.5 + 0.5) * 255) | 0;
        data[i + 3] = 255;
      }
    }
    return this.createTexture(gl, s, s, data);
  },

  allTextures: null,
  generateAll(gl) {
    this._initPerm();
    this.allTextures = {
      grass: this.generateGrass(gl),
      cobblestone: this.generateCobblestone(gl),
      stone: this.generateStone(gl),
      wood: this.generateWood(gl),
      water: this.generateWater(gl),
      dirt: this.generateDirt(gl),
      sand: this.generateSand(gl),
      roof: this.generateRoof(gl),
      normalStone: this.generateNormalMap(gl, (x, y) => {
        const v = Textures.voronoi(x / 256, y / 256, 12);
        return v.edge < 0.08 ? 0 : v.dist;
      }),
      normalGrass: this.generateNormalMap(gl, (x, y) => 
        Textures.fbm(x / 40, y / 40, 4) * 2
      ),
    };
    return this.allTextures;
  }
};
