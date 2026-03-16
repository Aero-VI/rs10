// NPCs, Monsters, and entity management

// Pixel art character generator
const CharSprite = {
  // Generate a character sprite as pixel data (16x24 pixels)
  generate(config) {
    const w = 16, h = 24;
    const data = new Uint8Array(w * h * 4);
    
    const set = (px, py, r, g, b, a = 255) => {
      if (px < 0 || px >= w || py < 0 || py >= h) return;
      const i = (py * w + px) * 4;
      data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = a;
    };
    
    const fill = (x1, y1, x2, y2, r, g, b) => {
      for (let py = y1; py <= y2; py++)
        for (let px = x1; px <= x2; px++) set(px, py, r, g, b);
    };
    
    const skin = config.skin || [220, 180, 140];
    const hair = config.hair || [80, 50, 20];
    const shirt = config.shirt || [100, 100, 200];
    const pants = config.pants || [60, 60, 100];
    const boots = config.boots || [60, 40, 20];
    
    // Head (4x4 centered)
    fill(6, 1, 9, 4, ...skin);
    // Hair
    fill(6, 0, 9, 1, ...hair);
    if (config.hatColor) {
      fill(5, 0, 10, 1, ...config.hatColor);
      fill(6, -1 < 0 ? 0 : -1, 9, 0, ...config.hatColor);
    }
    // Eyes
    set(7, 3, 40, 40, 40);
    set(8, 3, 40, 40, 40);
    
    // Neck
    fill(7, 5, 8, 5, ...skin);
    
    // Body
    fill(5, 6, 10, 13, ...shirt);
    
    // Cape/back item
    if (config.capeColor) {
      fill(4, 6, 4, 15, ...config.capeColor);
      fill(11, 6, 11, 15, ...config.capeColor);
    }
    
    // Arms
    fill(3, 7, 4, 12, ...skin);
    fill(11, 7, 12, 12, ...skin);
    
    // Belt
    fill(5, 13, 10, 13, 80, 60, 30);
    
    // Legs
    fill(6, 14, 7, 19, ...pants);
    fill(8, 14, 9, 19, ...pants);
    
    // Boots
    fill(5, 20, 7, 22, ...boots);
    fill(8, 20, 10, 22, ...boots);
    
    // Weapon (if any)
    if (config.weapon === 'sword') {
      fill(2, 4, 2, 12, 180, 180, 200);
      set(2, 3, 200, 200, 220);
    } else if (config.weapon === 'spear') {
      fill(2, 2, 2, 14, 120, 80, 40);
      set(2, 1, 180, 180, 200);
    } else if (config.weapon === 'staff') {
      fill(2, 2, 2, 14, 100, 60, 30);
      set(2, 1, 100, 200, 255);
      set(1, 1, 80, 180, 240);
      set(3, 1, 80, 180, 240);
    }
    
    // Shield
    if (config.shield) {
      fill(12, 7, 14, 12, ...config.shieldColor || [150, 120, 40]);
      fill(13, 8, 13, 11, ...config.shieldEmblem || [200, 50, 50]);
    }
    
    // Armor overlay
    if (config.armor) {
      fill(5, 6, 10, 12, ...config.armorColor);
    }
    
    // Apron
    if (config.apron) {
      fill(5, 8, 10, 16, 240, 240, 240);
    }
    
    // Glasses
    if (config.glasses) {
      set(6, 3, 150, 150, 200);
      set(7, 3, 150, 150, 200);
      set(8, 3, 150, 150, 200);
      set(9, 3, 150, 150, 200);
    }
    
    return { data, w, h };
  }
};

// NPC definitions
const NPC_DEFS = {
  cook: {
    name: 'Cook',
    sprite: { skin: [220, 180, 140], shirt: [240, 240, 240], hatColor: [255, 255, 255], 
              pants: [80, 80, 80], apron: true },
    dialogue: [
      { text: "Welcome to my kitchen! I can teach you the art of cooking.", 
        options: ["Tell me about cooking", "Goodbye"] },
      { text: "Simply use raw food on the range to cook it. Be careful not to burn it!",
        options: ["Thanks!"] }
    ],
    x: 33, y: 49
  },
  banker: {
    name: 'Banker',
    sprite: { skin: [200, 170, 130], shirt: [40, 30, 60], hair: [30, 20, 10],
              pants: [30, 25, 50], boots: [20, 15, 10] },
    dialogue: [
      { text: "Welcome to the Bank of RuneScape. How may I help you?",
        options: ["I'd like to access my bank", "Goodbye"] }
    ],
    action: 'bank',
    x: 52, y: 38
  },
  shopkeeper: {
    name: 'Shopkeeper',
    sprite: { skin: [220, 180, 140], shirt: [120, 90, 50], hair: [60, 40, 20],
              pants: [80, 60, 30], glasses: true },
    dialogue: [
      { text: "Welcome to the General Store! Browse my wares.",
        options: ["Show me what you have", "Goodbye"] }
    ],
    action: 'shop_general',
    x: 36, y: 51
  },
  weaponsDealer: {
    name: 'Weapons Dealer',
    sprite: { skin: [200, 160, 120], shirt: [100, 70, 40], hair: [40, 30, 20],
              pants: [70, 50, 30], weapon: 'sword', armor: true, armorColor: [110, 80, 50] },
    dialogue: [
      { text: "Looking for weapons or armor? I have the finest in the land!",
        options: ["Show me weapons", "Goodbye"] }
    ],
    action: 'shop_weapons',
    x: 28, y: 39
  },
  guard1: {
    name: 'Guard',
    sprite: { skin: [200, 170, 130], shirt: [140, 140, 150], hair: [60, 50, 40],
              pants: [100, 100, 110], weapon: 'spear', shield: true,
              shieldColor: [150, 130, 50], armor: true, armorColor: [160, 160, 170] },
    dialogue: [
      { text: "Move along, citizen. The town is under our protection.",
        options: ["Yes sir"] }
    ],
    x: 32, y: 32
  },
  guard2: {
    name: 'Guard', 
    sprite: { skin: [180, 150, 120], shirt: [140, 140, 150], hair: [30, 25, 20],
              pants: [100, 100, 110], weapon: 'spear', shield: true,
              shieldColor: [150, 130, 50], armor: true, armorColor: [160, 160, 170] },
    dialogue: [
      { text: "Keep your wits about you in the wilderness to the north.",
        options: ["I'll be careful"] }
    ],
    x: 48, y: 32
  }
};

// Monster definitions
const MONSTER_DEFS = {
  chicken: { name: 'Chicken', level: 1, hp: 3, maxHit: 1, attack: 1, defence: 1, xp: 12,
    sprite: { skin: [230, 230, 230], shirt: [240, 240, 200], pants: [240, 200, 100],
              boots: [200, 150, 50], hair: [220, 50, 50] },
    drops: ['Bones', 'Raw chicken', 'Feather'],
    zone: { x: 30, y: 55, w: 8, h: 5 }, count: 5 },
  cow: { name: 'Cow', level: 2, hp: 8, maxHit: 1, attack: 1, defence: 1, xp: 18,
    sprite: { skin: [180, 150, 120], shirt: [220, 220, 220], pants: [160, 130, 100],
              boots: [80, 60, 40], hair: [140, 110, 80] },
    drops: ['Bones', 'Raw beef', 'Cowhide'],
    zone: { x: 45, y: 55, w: 10, h: 8 }, count: 5 },
  goblin: { name: 'Goblin', level: 5, hp: 5, maxHit: 2, attack: 5, defence: 5, xp: 25,
    sprite: { skin: [80, 160, 80], shirt: [100, 80, 40], pants: [80, 60, 30],
              boots: [50, 35, 15], hair: [60, 130, 60], weapon: 'sword' },
    drops: ['Bones', 'Bronze dagger', 'Coins'],
    zone: { x: 20, y: 18, w: 10, h: 8 }, count: 4 },
  guard_monster: { name: 'Guard', level: 21, hp: 22, maxHit: 4, attack: 20, defence: 18, xp: 90,
    sprite: { skin: [200, 170, 130], shirt: [130, 130, 140], pants: [100, 100, 110],
              weapon: 'sword', shield: true, armor: true, armorColor: [150, 150, 160] },
    drops: ['Bones', 'Iron sword', 'Coins'],
    zone: { x: 15, y: 10, w: 8, h: 5 }, count: 3 },
  hillGiant: { name: 'Hill Giant', level: 28, hp: 35, maxHit: 6, attack: 26, defence: 26, xp: 140,
    sprite: { skin: [160, 140, 100], shirt: [120, 100, 60], pants: [100, 80, 50],
              boots: [70, 50, 30], hair: [100, 80, 50] },
    drops: ['Big bones', 'Iron full helm', 'Limpwurt root'],
    zone: { x: 10, y: 5, w: 12, h: 6 }, count: 3 },
  lesserDemon: { name: 'Lesser Demon', level: 82, hp: 79, maxHit: 8, attack: 72, defence: 72, xp: 310,
    sprite: { skin: [180, 40, 30], shirt: [150, 30, 20], pants: [120, 25, 15],
              boots: [80, 20, 10], hair: [100, 20, 10], weapon: 'staff' },
    drops: ['Ashes', 'Rune med helm', 'Gold charm'],
    zone: { x: 30, y: 3, w: 8, h: 4 }, count: 2 },
  dragon: { name: 'Dragon', level: 110, hp: 100, maxHit: 11, attack: 100, defence: 100, xp: 500,
    sprite: { skin: [50, 120, 50], shirt: [40, 100, 40], pants: [30, 80, 30],
              boots: [20, 60, 20], hair: [60, 140, 60] },
    drops: ['Dragon bones', 'Dragon hide', 'Rune longsword'],
    zone: { x: 55, y: 2, w: 6, h: 4 }, count: 1 }
};

// Item definitions
const ITEMS = {
  // Drops
  'Bones': { name: 'Bones', value: 1, stackable: false, type: 'misc', prayerXP: 4.5 },
  'Big bones': { name: 'Big bones', value: 10, stackable: false, type: 'misc', prayerXP: 15 },
  'Dragon bones': { name: 'Dragon bones', value: 200, stackable: false, type: 'misc', prayerXP: 72 },
  'Ashes': { name: 'Ashes', value: 1, stackable: false, type: 'misc' },
  'Feather': { name: 'Feather', value: 2, stackable: true, type: 'misc' },
  'Cowhide': { name: 'Cowhide', value: 5, stackable: false, type: 'misc' },
  'Coins': { name: 'Coins', value: 1, stackable: true, type: 'currency' },
  'Gold charm': { name: 'Gold charm', value: 50, type: 'misc' },
  'Limpwurt root': { name: 'Limpwurt root', value: 20, type: 'misc' },
  'Dragon hide': { name: 'Dragon hide', value: 500, type: 'misc' },
  
  // Fish
  'Raw shrimp': { name: 'Raw shrimp', value: 5, type: 'food_raw', cookLevel: 1, cookXP: 30, cooked: 'Shrimp' },
  'Shrimp': { name: 'Shrimp', value: 10, type: 'food', heal: 3 },
  'Raw trout': { name: 'Raw trout', value: 15, type: 'food_raw', cookLevel: 15, cookXP: 70, cooked: 'Trout' },
  'Trout': { name: 'Trout', value: 25, type: 'food', heal: 7 },
  'Raw swordfish': { name: 'Raw swordfish', value: 50, type: 'food_raw', cookLevel: 45, cookXP: 140, cooked: 'Swordfish' },
  'Swordfish': { name: 'Swordfish', value: 100, type: 'food', heal: 14 },
  'Raw chicken': { name: 'Raw chicken', value: 2, type: 'food_raw', cookLevel: 1, cookXP: 30, cooked: 'Cooked chicken' },
  'Cooked chicken': { name: 'Cooked chicken', value: 5, type: 'food', heal: 3 },
  'Raw beef': { name: 'Raw beef', value: 3, type: 'food_raw', cookLevel: 1, cookXP: 30, cooked: 'Cooked meat' },
  'Cooked meat': { name: 'Cooked meat', value: 6, type: 'food', heal: 3 },
  'Burnt food': { name: 'Burnt food', value: 0, type: 'misc' },
  
  // Logs
  'Logs': { name: 'Logs', value: 4, type: 'log', fmXP: 40 },
  'Oak logs': { name: 'Oak logs', value: 10, type: 'log', fmXP: 60 },
  'Willow logs': { name: 'Willow logs', value: 20, type: 'log', fmXP: 90 },
  'Yew logs': { name: 'Yew logs', value: 60, type: 'log', fmXP: 202.5 },
  'Magic logs': { name: 'Magic logs', value: 200, type: 'log', fmXP: 303.8 },
  
  // Ores
  'Copper ore': { name: 'Copper ore', value: 5, type: 'ore' },
  'Tin ore': { name: 'Tin ore', value: 5, type: 'ore' },
  'Iron ore': { name: 'Iron ore', value: 15, type: 'ore' },
  'Coal': { name: 'Coal', value: 30, type: 'ore' },
  'Mithril ore': { name: 'Mithril ore', value: 80, type: 'ore' },
  'Adamant ore': { name: 'Adamant ore', value: 200, type: 'ore' },
  'Rune ore': { name: 'Rune ore', value: 500, type: 'ore' },
  
  // Equipment - Bronze
  'Bronze sword': { name: 'Bronze sword', value: 10, type: 'weapon', slot: 'weapon', 
    stats: { attack: 3, strength: 2 } },
  'Bronze dagger': { name: 'Bronze dagger', value: 5, type: 'weapon', slot: 'weapon',
    stats: { attack: 2, strength: 1 } },
  'Bronze shield': { name: 'Bronze shield', value: 15, type: 'armor', slot: 'shield',
    stats: { defence: 3 } },
  'Bronze helm': { name: 'Bronze helm', value: 8, type: 'armor', slot: 'head',
    stats: { defence: 2 } },
  'Bronze platebody': { name: 'Bronze platebody', value: 30, type: 'armor', slot: 'body',
    stats: { defence: 5 } },
  'Bronze platelegs': { name: 'Bronze platelegs', value: 20, type: 'armor', slot: 'legs',
    stats: { defence: 3 } },
    
  // Iron
  'Iron sword': { name: 'Iron sword', value: 30, type: 'weapon', slot: 'weapon',
    stats: { attack: 6, strength: 5 } },
  'Iron shield': { name: 'Iron shield', value: 40, type: 'armor', slot: 'shield',
    stats: { defence: 5 } },
  'Iron full helm': { name: 'Iron full helm', value: 25, type: 'armor', slot: 'head',
    stats: { defence: 4 } },
  'Iron platebody': { name: 'Iron platebody', value: 80, type: 'armor', slot: 'body',
    stats: { defence: 9 } },
    
  // Steel
  'Steel sword': { name: 'Steel sword', value: 80, type: 'weapon', slot: 'weapon',
    stats: { attack: 10, strength: 8 } },
  'Steel shield': { name: 'Steel shield', value: 100, type: 'armor', slot: 'shield',
    stats: { defence: 8 } },
  'Steel platebody': { name: 'Steel platebody', value: 200, type: 'armor', slot: 'body',
    stats: { defence: 15 } },
    
  // Mithril
  'Mithril sword': { name: 'Mithril sword', value: 300, type: 'weapon', slot: 'weapon',
    stats: { attack: 15, strength: 13 } },
  'Mithril platebody': { name: 'Mithril platebody', value: 700, type: 'armor', slot: 'body',
    stats: { defence: 22 } },
    
  // Adamant
  'Adamant sword': { name: 'Adamant sword', value: 800, type: 'weapon', slot: 'weapon',
    stats: { attack: 20, strength: 18 } },
    
  // Rune
  'Rune sword': { name: 'Rune sword', value: 2000, type: 'weapon', slot: 'weapon',
    stats: { attack: 30, strength: 25 } },
  'Rune med helm': { name: 'Rune med helm', value: 1500, type: 'armor', slot: 'head',
    stats: { defence: 15 } },
  'Rune longsword': { name: 'Rune longsword', value: 3000, type: 'weapon', slot: 'weapon',
    stats: { attack: 35, strength: 30 } },
    
  // Dragon
  'Dragon sword': { name: 'Dragon sword', value: 10000, type: 'weapon', slot: 'weapon',
    stats: { attack: 45, strength: 40 } },
};

// Shop inventories
const SHOPS = {
  general: {
    name: 'General Store',
    items: [
      { id: 'Bronze sword', stock: 5, price: 15 },
      { id: 'Bronze dagger', stock: 5, price: 8 },
      { id: 'Bronze shield', stock: 3, price: 20 },
      { id: 'Bronze helm', stock: 3, price: 12 },
      { id: 'Bronze platebody', stock: 2, price: 40 },
      { id: 'Bronze platelegs', stock: 2, price: 25 },
    ]
  },
  weapons: {
    name: 'Weapon Shop',
    items: [
      { id: 'Iron sword', stock: 3, price: 40 },
      { id: 'Iron shield', stock: 3, price: 50 },
      { id: 'Iron full helm', stock: 2, price: 35 },
      { id: 'Iron platebody', stock: 2, price: 100 },
      { id: 'Steel sword', stock: 2, price: 100 },
      { id: 'Steel shield', stock: 2, price: 120 },
      { id: 'Steel platebody', stock: 1, price: 250 },
      { id: 'Mithril sword', stock: 1, price: 400 },
      { id: 'Adamant sword', stock: 1, price: 1000 },
      { id: 'Rune sword', stock: 1, price: 2500 },
    ]
  }
};

// Entity manager
class EntityManager {
  constructor() {
    this.npcs = [];
    this.monsters = [];
    this.groundItems = [];
    this.particles = [];
    this.hitsplats = [];
  }
  
  init(renderer) {
    this.renderer = renderer;
    
    // Create NPCs
    for (const [key, def] of Object.entries(NPC_DEFS)) {
      const spriteData = CharSprite.generate(def.sprite);
      const npc = {
        id: key, name: def.name,
        x: def.x, y: def.y, z: 0,
        spriteW: 0.8, spriteH: 1.2,
        texture: renderer.createSpriteTexture(spriteData.data, spriteData.w, spriteData.h),
        dialogue: def.dialogue,
        action: def.action,
        alpha: 1,
        type: 'npc',
        animOffset: Math.random() * Math.PI * 2,
        vao: null
      };
      this.npcs.push(npc);
    }
    
    // Spawn monsters
    for (const [key, def] of Object.entries(MONSTER_DEFS)) {
      for (let i = 0; i < def.count; i++) {
        const spriteData = CharSprite.generate(def.sprite);
        const zone = def.zone;
        let mx, my;
        do {
          mx = zone.x + Math.floor(Math.random() * zone.w);
          my = zone.y + Math.floor(Math.random() * zone.h);
        } while (World.isBlocked(mx, my));
        
        this.monsters.push({
          id: `${key}_${i}`, defKey: key, name: def.name,
          x: mx, y: my, z: 0,
          homeX: mx, homeY: my,
          hp: def.hp, maxHp: def.hp,
          level: def.level, attack: def.attack, defence: def.defence,
          maxHit: def.maxHit, xp: def.xp,
          drops: def.drops,
          spriteW: 0.8, spriteH: 1.2,
          texture: renderer.createSpriteTexture(spriteData.data, spriteData.w, spriteData.h),
          alpha: 1,
          type: 'monster',
          animOffset: Math.random() * Math.PI * 2,
          vao: null,
          // AI state
          state: 'idle',
          target: null,
          moveTimer: Math.random() * 5,
          respawnTimer: 0,
          dead: false
        });
      }
    }
  }
  
  update(dt, player) {
    // Update monsters
    for (const m of this.monsters) {
      if (m.dead) {
        m.respawnTimer -= dt;
        if (m.respawnTimer <= 0) {
          m.dead = false;
          m.hp = m.maxHp;
          m.x = m.homeX;
          m.y = m.homeY;
          m.alpha = 1;
          m.vao = null;
        }
        continue;
      }
      
      // Random movement
      m.moveTimer -= dt;
      if (m.state === 'idle' && m.moveTimer <= 0) {
        m.moveTimer = 3 + Math.random() * 5;
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        const nx = Math.floor(m.x) + dx;
        const ny = Math.floor(m.y) + dy;
        if (!World.isBlocked(nx, ny) && 
            Math.abs(nx - m.homeX) < 5 && Math.abs(ny - m.homeY) < 5) {
          m.targetX = nx; m.targetY = ny;
          m.state = 'walking';
        }
      }
      
      if (m.state === 'walking') {
        const speed = 1.5 * dt;
        const dx = m.targetX - m.x, dy = m.targetY - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < speed) {
          m.x = m.targetX; m.y = m.targetY;
          m.state = 'idle';
        } else {
          m.x += (dx / dist) * speed;
          m.y += (dy / dist) * speed;
        }
        m.vao = null; // Force rebuild
      }
    }
    
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      p.a = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    
    // Update hitsplats
    for (let i = this.hitsplats.length - 1; i >= 0; i--) {
      const h = this.hitsplats[i];
      h.timer -= dt;
      h.z += dt * 0.5;
      if (h.timer <= 0) this.hitsplats.splice(i, 1);
    }
    
    // Update ground items
    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      this.groundItems[i].timer -= dt;
      if (this.groundItems[i].timer <= 0) this.groundItems.splice(i, 1);
    }
  }
  
  // Spawn particles
  spawnFireParticles(x, y) {
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 0.3,
        y: y + (Math.random() - 0.5) * 0.3,
        z: 0.5 + Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.1,
        vz: 0.8 + Math.random() * 0.5,
        r: 1.0, g: 0.5 + Math.random() * 0.4, b: 0.1,
        a: 1, size: 3 + Math.random() * 3,
        life: 0.5 + Math.random() * 0.5, maxLife: 1
      });
    }
  }
  
  spawnSparks(x, y) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x, y, z: 1,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        vz: Math.random() * 3,
        r: 1.0, g: 0.8 + Math.random() * 0.2, b: 0.4,
        a: 1, size: 2 + Math.random() * 2,
        life: 0.3 + Math.random() * 0.3, maxLife: 0.6
      });
    }
  }
  
  spawnLevelUpFireworks(x, y) {
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push({
        x, y, z: 1.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: Math.random() * 2,
        r: Math.random(), g: Math.random(), b: Math.random(),
        a: 1, size: 4 + Math.random() * 4,
        life: 0.8 + Math.random() * 0.5, maxLife: 1.3
      });
    }
  }
  
  spawnDustMotes(x, y) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 5,
      y: y + (Math.random() - 0.5) * 5,
      z: 0.5 + Math.random() * 2,
      vx: 0.1 + Math.random() * 0.1,
      vy: 0,
      vz: 0.05 + Math.random() * 0.1,
      r: 1, g: 0.95, b: 0.7,
      a: 0.3, size: 1.5,
      life: 3 + Math.random() * 3, maxLife: 6
    });
  }
  
  spawnSmokeParticle(x, y) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 0.3,
      y: y + (Math.random() - 0.5) * 0.3,
      z: 3 + Math.random(),
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.1,
      vz: 0.4 + Math.random() * 0.3,
      r: 0.5, g: 0.5, b: 0.5,
      a: 0.3, size: 4 + Math.random() * 3,
      life: 2 + Math.random() * 2, maxLife: 4
    });
  }

  spawnWaterSplash(x, y) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y, z: 0.2,
        vx: Math.cos(angle) * 0.5,
        vy: Math.sin(angle) * 0.5,
        vz: 1 + Math.random(),
        r: 0.4, g: 0.6, b: 0.9,
        a: 0.7, size: 2 + Math.random() * 2,
        life: 0.4 + Math.random() * 0.3, maxLife: 0.7
      });
    }
  }
  
  addHitsplat(target, damage) {
    this.hitsplats.push({
      x: target.x, y: target.y, z: 1.5,
      damage, timer: 1.5,
      color: damage > 0 ? '#ff0000' : '#0000ff'
    });
  }
  
  dropItem(x, y, itemId, amount = 1) {
    this.groundItems.push({
      x: Math.floor(x) + 0.5,
      y: Math.floor(y) + 0.5,
      itemId, amount,
      timer: 60 // Disappear after 60s
    });
  }
  
  getNPCAt(x, y) {
    for (const npc of this.npcs) {
      if (Math.abs(npc.x - x) < 1 && Math.abs(npc.y - y) < 1) return npc;
    }
    return null;
  }
  
  getMonsterAt(x, y) {
    for (const m of this.monsters) {
      if (!m.dead && Math.abs(m.x - x) < 1 && Math.abs(m.y - y) < 1) return m;
    }
    return null;
  }
  
  getGroundItemAt(x, y) {
    for (const item of this.groundItems) {
      if (Math.abs(item.x - x) < 0.8 && Math.abs(item.y - y) < 0.8) return item;
    }
    return null;
  }
}
