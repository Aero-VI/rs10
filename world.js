// World generation and management
const TILE = {
  GRASS: 0, COBBLE: 1, STONE: 2, DIRT: 3, WATER: 4, SAND: 5
};

const WORLD_SIZE = 80;

const World = {
  tiles: null,
  heightMap: null,
  buildings: [],
  trees: [],
  rocks: [],
  fishingSpots: [],
  decorations: [],
  torchPositions: [],
  
  // Resource objects on map
  resources: [],
  
  generate() {
    this.tiles = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
    this.heightMap = new Float32Array(WORLD_SIZE * WORLD_SIZE);
    this.blocked = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
    
    // Initialize with grass
    this.tiles.fill(TILE.GRASS);
    
    // Generate height variation
    Textures._initPerm();
    for (let y = 0; y < WORLD_SIZE; y++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        this.heightMap[y * WORLD_SIZE + x] = Textures.fbm(x / 30, y / 30, 3) * 0.3;
      }
    }
    
    // === Town Square (center) ===
    const cx = 40, cy = 40;
    this._fillRect(cx - 8, cy - 8, 16, 16, TILE.COBBLE);
    
    // Paths radiating from center
    this._fillRect(cx - 2, cy - 25, 4, 50, TILE.COBBLE); // N-S road
    this._fillRect(cx - 25, cy - 2, 50, 4, TILE.COBBLE); // E-W road
    
    // === River (east side) ===
    for (let y = 0; y < WORLD_SIZE; y++) {
      const riverX = 60 + Math.sin(y / 8) * 3;
      for (let dx = -2; dx <= 2; dx++) {
        const rx = Math.round(riverX + dx);
        if (rx >= 0 && rx < WORLD_SIZE) {
          this.setTile(rx, y, TILE.WATER);
          if (Math.abs(dx) === 2) this.setTile(rx, y, TILE.SAND);
        }
      }
    }
    
    // === Wilderness (dark north) ===
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        if (this.getTile(x, y) === TILE.GRASS) {
          this.setTile(x, y, TILE.DIRT);
          this.heightMap[y * WORLD_SIZE + x] -= 0.1;
        }
      }
    }
    
    // === Mining area (west) ===
    this._fillRect(8, 35, 10, 10, TILE.DIRT);
    this._fillRect(6, 37, 14, 6, TILE.STONE);
    
    // === Buildings ===
    // Bank (east of square)
    this._addBuilding(cx + 10, cy - 3, 6, 5, 3, 'Bank', true, 'stone');
    // General Store (south of square)  
    this._addBuilding(cx - 5, cy + 10, 5, 4, 2.5, 'General Store', true, 'wood');
    // Weapon Shop (west of square)
    this._addBuilding(cx - 14, cy - 2, 5, 5, 3, 'Weapon Shop', true, 'stone');
    // Kitchen (south-west)
    this._addBuilding(cx - 10, cy + 8, 4, 4, 2.5, 'Kitchen', true, 'stone');
    // Smithy (north of square)
    this._addBuilding(cx - 3, cy - 14, 6, 5, 3, 'Smithy', true, 'stone');
    // Castle (north-east)
    this._addBuilding(cx + 12, cy - 15, 10, 8, 5, 'Castle', false, 'stone');
    // Castle tower
    this._addBuilding(cx + 14, cy - 17, 3, 3, 7, 'Tower', false, 'stone');
    this._addBuilding(cx + 19, cy - 17, 3, 3, 7, 'Tower', false, 'stone');
    
    // Block building tiles
    for (const b of this.buildings) {
      for (let dy = 0; dy < b.depth; dy++) {
        for (let dx = 0; dx < b.width; dx++) {
          const bx = Math.floor(b.x) + dx;
          const by = Math.floor(b.y) + dy;
          if (bx >= 0 && bx < WORLD_SIZE && by >= 0 && by < WORLD_SIZE) {
            this.blocked[by * WORLD_SIZE + bx] = 1;
          }
        }
      }
      // Clear door tile
      if (b.name !== 'Tower') {
        const doorX = Math.floor(b.x + b.width / 2);
        const doorY = Math.floor(b.y);
        if (doorX >= 0 && doorX < WORLD_SIZE && doorY >= 0 && doorY < WORLD_SIZE) {
          this.blocked[doorY * WORLD_SIZE + doorX] = 0;
        }
      }
    }
    
    // === Trees (forest south-east) ===
    const treeTypes = ['Normal', 'Oak', 'Willow', 'Yew', 'Magic'];
    const treeLevels = [1, 15, 30, 60, 75];
    const treeXP = [25, 37.5, 67.5, 175, 250];
    
    // Forest zone
    for (let i = 0; i < 40; i++) {
      const tx = 25 + Math.floor(Math.random() * 20);
      const ty = 50 + Math.floor(Math.random() * 20);
      if (!this.blocked[ty * WORLD_SIZE + tx] && this.getTile(tx, ty) !== TILE.WATER) {
        const typeIdx = i < 15 ? 0 : i < 25 ? 1 : i < 32 ? 2 : i < 37 ? 3 : 4;
        this.trees.push({
          x: tx, y: ty, type: treeTypes[typeIdx],
          level: treeLevels[typeIdx], xp: treeXP[typeIdx],
          health: 100, maxHealth: 100, respawnTime: 0,
          depleted: false, color: typeIdx === 4 ? [0.5, 0.3, 1.0] : 
                           typeIdx === 3 ? [0.2, 0.4, 0.2] :
                           typeIdx === 2 ? [0.4, 0.6, 0.3] : [0.2, 0.5, 0.2]
        });
        this.blocked[ty * WORLD_SIZE + tx] = 1;
        this.resources.push(this.trees[this.trees.length - 1]);
      }
    }
    // Some trees near town
    for (let i = 0; i < 10; i++) {
      const tx = cx - 20 + Math.floor(Math.random() * 8);
      const ty = cy + 3 + Math.floor(Math.random() * 8);
      if (!this.blocked[ty * WORLD_SIZE + tx]) {
        this.trees.push({
          x: tx, y: ty, type: 'Normal', level: 1, xp: 25,
          health: 100, maxHealth: 100, respawnTime: 0, depleted: false,
          color: [0.2, 0.5, 0.2]
        });
        this.blocked[ty * WORLD_SIZE + tx] = 1;
        this.resources.push(this.trees[this.trees.length - 1]);
      }
    }
    
    // === Rocks (mining area) ===
    const oreTypes = ['Copper', 'Tin', 'Iron', 'Coal', 'Mithril', 'Adamant', 'Rune'];
    const oreLevels = [1, 1, 15, 30, 55, 70, 85];
    const oreXP = [17.5, 17.5, 35, 50, 80, 95, 125];
    const oreColors = [
      [0.7, 0.4, 0.2], [0.6, 0.6, 0.6], [0.4, 0.3, 0.3],
      [0.2, 0.2, 0.2], [0.3, 0.3, 0.6], [0.2, 0.5, 0.2], [0.3, 0.7, 0.8]
    ];
    
    for (let i = 0; i < 20; i++) {
      const rx = 7 + Math.floor(Math.random() * 12);
      const ry = 36 + Math.floor(Math.random() * 8);
      if (!this.blocked[ry * WORLD_SIZE + rx]) {
        const typeIdx = i < 6 ? 0 : i < 10 ? 1 : i < 14 ? 2 : i < 17 ? 3 : i < 19 ? 4 : i < 20 ? 5 : 6;
        this.rocks.push({
          x: rx, y: ry, type: oreTypes[typeIdx],
          level: oreLevels[typeIdx], xp: oreXP[typeIdx],
          health: 100, maxHealth: 100, respawnTime: 0,
          depleted: false, color: oreColors[typeIdx]
        });
        this.blocked[ry * WORLD_SIZE + rx] = 1;
        this.resources.push(this.rocks[this.rocks.length - 1]);
      }
    }
    
    // === Fishing spots ===
    for (let y = 10; y < 70; y += 12) {
      const riverX = Math.round(60 + Math.sin(y / 8) * 3);
      this.fishingSpots.push({
        x: riverX - 3, y: y, type: y < 30 ? 'Shrimp' : y < 50 ? 'Trout' : 'Swordfish',
        level: y < 30 ? 1 : y < 50 ? 20 : 50,
        xp: y < 30 ? 10 : y < 50 ? 50 : 100
      });
    }
    
    // === Torch positions (around buildings and paths) ===
    this.torchPositions = [
      [cx - 8, cy - 8], [cx + 8, cy - 8], [cx - 8, cy + 8], [cx + 8, cy + 8],
      [cx, cy - 8], [cx, cy + 8], [cx - 8, cy], [cx + 8, cy],
      [cx + 9, cy - 3], [cx + 9, cy + 2], // Bank entrance
      [cx - 3, cy - 13], [cx + 3, cy - 13], // Smithy
      [cx - 13, cy - 2], [cx - 13, cy + 3], // Weapon shop
      [cx + 11, cy - 15], [cx + 22, cy - 15], // Castle
    ];
    
    // Fountain in center
    this.decorations.push({
      x: cx, y: cy, type: 'fountain', width: 2, depth: 2
    });
  },
  
  _fillRect(x, y, w, h, tile) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setTile(x + dx, y + dy, tile);
      }
    }
  },
  
  _addBuilding(x, y, w, d, h, name, hasRoof, material) {
    this.buildings.push({
      x, y, width: w, depth: d, height: h,
      name, hasRoof,
      useRoof: material === 'wood',
      vao: null, indexCount: 0, texture: null
    });
  },
  
  getTile(x, y) {
    if (x < 0 || x >= WORLD_SIZE || y < 0 || y >= WORLD_SIZE) return TILE.WATER;
    return this.tiles[y * WORLD_SIZE + x];
  },
  
  setTile(x, y, tile) {
    if (x < 0 || x >= WORLD_SIZE || y < 0 || y >= WORLD_SIZE) return;
    this.tiles[y * WORLD_SIZE + x] = tile;
  },
  
  isBlocked(x, y) {
    if (x < 0 || x >= WORLD_SIZE || y < 0 || y >= WORLD_SIZE) return true;
    if (this.getTile(x, y) === TILE.WATER) return true;
    return this.blocked[y * WORLD_SIZE + x] === 1;
  },
  
  // Build renderable terrain mesh for visible area
  buildTerrainMesh(camX, camY, viewDist) {
    const vertices = [];
    const indices = [];
    let idx = 0;
    
    const minX = Math.max(0, Math.floor(camX - viewDist));
    const maxX = Math.min(WORLD_SIZE - 1, Math.ceil(camX + viewDist));
    const minY = Math.max(0, Math.floor(camY - viewDist));
    const maxY = Math.min(WORLD_SIZE - 1, Math.ceil(camY + viewDist));
    
    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const tile = this.getTile(x, y);
        const h = this.heightMap[y * WORLD_SIZE + x] || 0;
        const h01 = this.heightMap[y * WORLD_SIZE + x + 1] || h;
        const h10 = this.heightMap[(y + 1) * WORLD_SIZE + x] || h;
        const h11 = this.heightMap[(y + 1) * WORLD_SIZE + x + 1] || h;
        
        // 4 vertices per tile
        // position(3) + texcoord(2) + tiletype(1) + height(1) = 7
        vertices.push(
          x, y, h,           x / 4, y / 4,     tile, h,
          x + 1, y, h01,     (x+1) / 4, y / 4, tile, h01,
          x + 1, y + 1, h11, (x+1) / 4, (y+1) / 4, tile, h11,
          x, y + 1, h10,     x / 4, (y+1) / 4, tile, h10
        );
        
        indices.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);
        idx += 4;
      }
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices)
    };
  },
  
  // Get entities near a position
  getResourceAt(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    // Check trees
    for (const t of this.trees) {
      if (Math.floor(t.x) === tx && Math.floor(t.y) === ty && !t.depleted) return { ...t, resourceType: 'tree' };
    }
    // Check rocks
    for (const r of this.rocks) {
      if (Math.floor(r.x) === tx && Math.floor(r.y) === ty && !r.depleted) return { ...r, resourceType: 'rock' };
    }
    // Check fishing
    for (const f of this.fishingSpots) {
      if (Math.abs(f.x - tx) <= 1 && Math.abs(f.y - ty) <= 1) return { ...f, resourceType: 'fish' };
    }
    return null;
  },
  
  getResourceRef(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    for (const t of this.trees) {
      if (Math.floor(t.x) === tx && Math.floor(t.y) === ty) return t;
    }
    for (const r of this.rocks) {
      if (Math.floor(r.x) === tx && Math.floor(r.y) === ty) return r;
    }
    return null;
  },
  
  update(dt) {
    // Respawn depleted resources
    for (const r of this.resources) {
      if (r.depleted) {
        r.respawnTime -= dt;
        if (r.respawnTime <= 0) {
          r.depleted = false;
          r.health = r.maxHealth;
        }
      }
    }
  }
};
