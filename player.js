// Player character, skills, combat, inventory

const SKILLS = [
  'Attack', 'Strength', 'Defence', 'Hitpoints',
  'Mining', 'Smithing', 'Woodcutting', 'Firemaking',
  'Fishing', 'Cooking', 'Prayer', 'Magic'
];

// XP table calculation (RS formula)
function xpForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.floor(i + 300 * Math.pow(2, i / 7));
  }
  return Math.floor(total / 4);
}

// Pre-compute XP table
const XP_TABLE = [0];
for (let i = 1; i <= 99; i++) XP_TABLE[i] = xpForLevel(i);

function levelForXP(xp) {
  for (let i = 98; i >= 1; i--) {
    if (xp >= XP_TABLE[i]) return i;
  }
  return 1;
}

class Player {
  constructor() {
    // Position
    this.x = 40;
    this.y = 40;
    this.z = 0;
    this.targetX = 40;
    this.targetY = 40;
    this.moving = false;
    this.direction = 0; // 0=S, 1=W, 2=N, 3=E
    this.speed = 3;
    
    // Path
    this.path = [];
    this.pathIndex = 0;
    
    // Skills
    this.skills = {};
    for (const skill of SKILLS) {
      this.skills[skill] = { xp: 0, level: 1 };
    }
    this.skills.Hitpoints.xp = XP_TABLE[10];
    this.skills.Hitpoints.level = 10;
    
    // Combat
    this.hp = 10;
    this.maxHp = 10;
    this.prayer = 1;
    this.maxPrayer = 1;
    this.runEnergy = 100;
    this.combatTarget = null;
    this.combatTimer = 0;
    this.combatStyle = 'accurate'; // accurate, aggressive, defensive
    
    // Inventory (28 slots)
    this.inventory = new Array(28).fill(null);
    this.inventoryCount = 0;
    
    // Equipment
    this.equipment = {
      head: null, cape: null, neck: null,
      weapon: null, body: null, shield: null,
      legs: null, hands: null, feet: null, ring: null
    };
    
    // Bank
    this.bank = [];
    
    // Skilling
    this.skillingTarget = null;
    this.skillingTimer = 0;
    this.skillingAction = null;
    
    // Coins
    this.coins = 50;
    
    // Sprite
    this.spriteW = 0.8;
    this.spriteH = 1.2;
    this.texture = null;
    this.vao = null;
    this.alpha = 1;
    this.color = null;
    this.animOffset = 0;
    
    // State
    this.interacting = false;
  }
  
  init(renderer) {
    this.renderer = renderer;
    this.updateSprite();
    
    // Give starting items
    this.addItem('Bronze sword', 1);
    this.addItem('Bronze shield', 1);
  }
  
  updateSprite() {
    // Generate player sprite based on equipment
    const config = {
      skin: [220, 180, 140],
      hair: [80, 50, 20],
      shirt: [100, 100, 200],
      pants: [60, 60, 100],
      boots: [60, 40, 20]
    };
    
    if (this.equipment.weapon) {
      config.weapon = 'sword';
    }
    if (this.equipment.shield) {
      config.shield = true;
    }
    if (this.equipment.body) {
      config.armor = true;
      // Color based on tier
      const name = this.equipment.body;
      if (name.includes('Bronze')) config.armorColor = [150, 100, 50];
      else if (name.includes('Iron')) config.armorColor = [150, 150, 160];
      else if (name.includes('Steel')) config.armorColor = [180, 180, 190];
      else if (name.includes('Mithril')) config.armorColor = [80, 80, 160];
      else if (name.includes('Adamant')) config.armorColor = [60, 120, 60];
      else if (name.includes('Rune')) config.armorColor = [60, 160, 180];
      else config.armorColor = [130, 130, 140];
    }
    
    const spriteData = CharSprite.generate(config);
    this.texture = this.renderer.createSpriteTexture(spriteData.data, spriteData.w, spriteData.h);
    this.vao = null;
  }
  
  getLevel(skill) {
    return levelForXP(this.skills[skill].xp);
  }
  
  addXP(skill, amount) {
    const oldLevel = this.getLevel(skill);
    this.skills[skill].xp += amount;
    const newLevel = this.getLevel(skill);
    this.skills[skill].level = newLevel;
    
    if (skill === 'Hitpoints') {
      this.maxHp = newLevel;
    }
    if (skill === 'Prayer') {
      this.maxPrayer = newLevel;
    }
    
    if (newLevel > oldLevel) {
      return newLevel; // Level up!
    }
    return 0;
  }
  
  getCombatLevel() {
    const base = 0.25 * (this.getLevel('Defence') + this.getLevel('Hitpoints') + 
                  Math.floor(this.getLevel('Prayer') / 2));
    const melee = 0.325 * (this.getLevel('Attack') + this.getLevel('Strength'));
    return Math.floor(base + melee);
  }
  
  getAttackBonus() {
    let bonus = 0;
    for (const [slot, item] of Object.entries(this.equipment)) {
      if (item && ITEMS[item] && ITEMS[item].stats) {
        bonus += ITEMS[item].stats.attack || 0;
      }
    }
    return bonus;
  }
  
  getStrengthBonus() {
    let bonus = 0;
    for (const [slot, item] of Object.entries(this.equipment)) {
      if (item && ITEMS[item] && ITEMS[item].stats) {
        bonus += ITEMS[item].stats.strength || 0;
      }
    }
    return bonus;
  }
  
  getDefenceBonus() {
    let bonus = 0;
    for (const [slot, item] of Object.entries(this.equipment)) {
      if (item && ITEMS[item] && ITEMS[item].stats) {
        bonus += ITEMS[item].stats.defence || 0;
      }
    }
    return bonus;
  }
  
  // Inventory management
  addItem(itemId, count = 1) {
    const def = ITEMS[itemId];
    if (!def) return false;
    
    // Coins are special
    if (itemId === 'Coins') {
      this.coins += count;
      return true;
    }
    
    // Stackable items
    if (def.stackable) {
      for (let i = 0; i < 28; i++) {
        if (this.inventory[i] && this.inventory[i].id === itemId) {
          this.inventory[i].count += count;
          return true;
        }
      }
    }
    
    // Find empty slot
    for (let i = 0; i < 28; i++) {
      if (!this.inventory[i]) {
        this.inventory[i] = { id: itemId, count };
        this.inventoryCount++;
        return true;
      }
    }
    return false; // Inventory full
  }
  
  removeItem(itemId, count = 1) {
    if (itemId === 'Coins') {
      if (this.coins >= count) {
        this.coins -= count;
        return true;
      }
      return false;
    }
    
    for (let i = 0; i < 28; i++) {
      if (this.inventory[i] && this.inventory[i].id === itemId) {
        this.inventory[i].count -= count;
        if (this.inventory[i].count <= 0) {
          this.inventory[i] = null;
          this.inventoryCount--;
        }
        return true;
      }
    }
    return false;
  }
  
  hasItem(itemId) {
    if (itemId === 'Coins') return this.coins > 0;
    return this.inventory.some(s => s && s.id === itemId);
  }
  
  inventoryFull() {
    return !this.inventory.some(s => s === null);
  }
  
  equip(slotIndex) {
    const item = this.inventory[slotIndex];
    if (!item) return;
    const def = ITEMS[item.id];
    if (!def || !def.slot) return;
    
    // Unequip current
    const current = this.equipment[def.slot];
    this.equipment[def.slot] = item.id;
    this.inventory[slotIndex] = current ? { id: current, count: 1 } : null;
    if (!current) this.inventoryCount--;
    
    this.updateSprite();
  }
  
  unequip(slot) {
    if (!this.equipment[slot]) return;
    if (this.inventoryFull()) return;
    
    const item = this.equipment[slot];
    this.equipment[slot] = null;
    this.addItem(item);
    this.updateSprite();
  }
  
  // Pathfinding (simple A*)
  findPath(tx, ty) {
    const sx = Math.floor(this.x), sy = Math.floor(this.y);
    tx = Math.floor(tx); ty = Math.floor(ty);
    
    if (sx === tx && sy === ty) return [];
    
    const open = [{ x: sx, y: sy, g: 0, h: 0, parent: null }];
    const closed = new Set();
    const key = (x, y) => `${x},${y}`;
    
    let iterations = 0;
    while (open.length > 0 && iterations < 500) {
      iterations++;
      // Find lowest f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if ((open[i].g + open[i].h) < (open[bestIdx].g + open[bestIdx].h)) bestIdx = i;
      }
      
      const current = open.splice(bestIdx, 1)[0];
      
      if (current.x === tx && current.y === ty) {
        // Reconstruct path
        const path = [];
        let node = current;
        while (node.parent) {
          path.unshift({ x: node.x + 0.5, y: node.y + 0.5 });
          node = node.parent;
        }
        return path;
      }
      
      closed.add(key(current.x, current.y));
      
      // Neighbors (4-directional)
      const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
      for (const [dx, dy] of dirs) {
        const nx = current.x + dx, ny = current.y + dy;
        if (closed.has(key(nx, ny))) continue;
        // Allow walking to target even if blocked (for interacting)
        if (World.isBlocked(nx, ny) && !(nx === tx && ny === ty)) continue;
        
        const g = current.g + 1;
        const h = Math.abs(nx - tx) + Math.abs(ny - ty);
        
        const existing = open.find(n => n.x === nx && n.y === ny);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.parent = current;
          }
        } else {
          open.push({ x: nx, y: ny, g, h, parent: current });
        }
      }
    }
    
    return []; // No path
  }
  
  moveTo(tx, ty) {
    this.path = this.findPath(tx, ty);
    this.pathIndex = 0;
    this.combatTarget = null;
    this.skillingTarget = null;
    this.interacting = false;
  }
  
  update(dt, entities) {
    // Follow path
    if (this.path.length > 0 && this.pathIndex < this.path.length) {
      const target = this.path[this.pathIndex];
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 0.1) {
        this.x = target.x;
        this.y = target.y;
        this.pathIndex++;
        this.vao = null;
      } else {
        const speed = this.speed * dt;
        this.x += (dx / dist) * Math.min(speed, dist);
        this.y += (dy / dist) * Math.min(speed, dist);
        
        // Update direction
        if (Math.abs(dx) > Math.abs(dy)) {
          this.direction = dx > 0 ? 3 : 1;
        } else {
          this.direction = dy > 0 ? 0 : 2;
        }
        this.moving = true;
        this.vao = null;
      }
    } else {
      this.moving = false;
      this.path = [];
    }
    
    // Combat
    if (this.combatTarget) {
      const m = this.combatTarget;
      if (m.dead) {
        this.combatTarget = null;
      } else {
        const dist = Math.sqrt((m.x - this.x) ** 2 + (m.y - this.y) ** 2);
        if (dist > 1.5) {
          // Move to target
          this.path = this.findPath(m.x, m.y);
          this.pathIndex = 0;
        } else {
          this.path = [];
          this.combatTimer -= dt;
          if (this.combatTimer <= 0) {
            this.combatTimer = 0.6; // Combat tick
            this._lastCombatResult = this.performCombatTick(m, entities);
          }
        }
      }
    }
    
    // Skilling
    this._lastSkillingResult = null;
    if (this.skillingTarget && !this.moving) {
      this.skillingTimer -= dt;
      if (this.skillingTimer <= 0) {
        this._lastSkillingResult = this.performSkilling(entities);
      }
    }
    
    // HP regen (1 hp per 60 seconds)
    if (this.hp < this.maxHp) {
      this._regenTimer = (this._regenTimer || 0) + dt;
      if (this._regenTimer >= 6) {
        this._regenTimer = 0;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
    }
  }
  
  performCombatTick(monster, entities) {
    // Player attacks
    const attackLevel = this.getLevel('Attack');
    const strengthLevel = this.getLevel('Strength');
    const attackBonus = this.getAttackBonus();
    const strBonus = this.getStrengthBonus();
    
    const accuracy = (attackLevel + attackBonus) / (attackLevel + attackBonus + monster.defence);
    const maxHit = Math.floor(1.3 + strengthLevel / 10 + strBonus / 80 + 
                    (strengthLevel * strBonus) / 640);
    
    if (Math.random() < accuracy) {
      const damage = Math.floor(Math.random() * (maxHit + 1));
      monster.hp -= damage;
      entities.addHitsplat(monster, damage);
      
      if (monster.hp <= 0) {
        // Monster dies
        monster.dead = true;
        monster.respawnTimer = 15 + Math.random() * 15;
        monster.alpha = 0;
        this.combatTarget = null;
        
        // Drop items
        const drops = monster.drops;
        if (drops.length > 0) {
          const drop = drops[Math.floor(Math.random() * drops.length)];
          const amount = drop === 'Coins' ? Math.floor(Math.random() * monster.level * 5) + 1 : 1;
          entities.dropItem(monster.x, monster.y, drop, amount);
        }
        
        // XP rewards
        const combatXP = monster.xp;
        return { killed: true, xp: combatXP };
      }
    } else {
      entities.addHitsplat(monster, 0);
    }
    
    // Monster retaliates
    if (!monster.dead) {
      const mAccuracy = monster.attack / (monster.attack + this.getLevel('Defence') + this.getDefenceBonus());
      if (Math.random() < mAccuracy) {
        const mDamage = Math.floor(Math.random() * (monster.maxHit + 1));
        this.hp -= mDamage;
        entities.addHitsplat(this, mDamage);
        
        if (this.hp <= 0) {
          return { died: true };
        }
      } else {
        entities.addHitsplat(this, 0);
      }
    }
    
    return { hit: true };
  }
  
  startSkilling(resource, action) {
    this.skillingTarget = resource;
    this.skillingAction = action;
    this.skillingTimer = 2; // 2 second gather interval
    this.interacting = true;
  }
  
  performSkilling(entities) {
    const res = this.skillingTarget;
    if (!res || res.depleted) {
      this.skillingTarget = null;
      this.skillingAction = null;
      return null;
    }
    
    if (this.inventoryFull()) {
      this.skillingTarget = null;
      return { msg: 'Your inventory is full.' };
    }
    
    this.skillingTimer = 2 + Math.random(); // Reset timer with small variation
    
    let result = null;
    
    if (this.skillingAction === 'woodcutting') {
      const level = this.getLevel('Woodcutting');
      if (level < res.level) return { msg: `You need Woodcutting level ${res.level}.` };
      
      const chance = 0.3 + (level - res.level) * 0.02;
      if (Math.random() < chance) {
        const logMap = { 'Normal': 'Logs', 'Oak': 'Oak logs', 'Willow': 'Willow logs',
                        'Yew': 'Yew logs', 'Magic': 'Magic logs' };
        const logId = logMap[res.type] || 'Logs';
        this.addItem(logId);
        result = { xp: res.xp, skill: 'Woodcutting', msg: `You get some ${logId.toLowerCase()}.`, item: logId };
        
        res.health -= 30 + Math.random() * 20;
        if (res.health <= 0) {
          res.depleted = true;
          res.respawnTime = 10 + Math.random() * 20;
          this.skillingTarget = null;
        }
      }
    } else if (this.skillingAction === 'mining') {
      const level = this.getLevel('Mining');
      if (level < res.level) return { msg: `You need Mining level ${res.level}.` };
      
      const chance = 0.25 + (level - res.level) * 0.015;
      if (Math.random() < chance) {
        const oreMap = { 'Copper': 'Copper ore', 'Tin': 'Tin ore', 'Iron': 'Iron ore',
                        'Coal': 'Coal', 'Mithril': 'Mithril ore', 'Adamant': 'Adamant ore', 'Rune': 'Rune ore' };
        const oreId = oreMap[res.type] || 'Copper ore';
        this.addItem(oreId);
        result = { xp: res.xp, skill: 'Mining', msg: `You mine some ${res.type.toLowerCase()} ore.`, item: oreId };
        entities.spawnSparks(res.x, res.y);
        
        res.health -= 25 + Math.random() * 25;
        if (res.health <= 0) {
          res.depleted = true;
          res.respawnTime = 15 + Math.random() * 30;
          this.skillingTarget = null;
        }
      }
    } else if (this.skillingAction === 'fishing') {
      const level = this.getLevel('Fishing');
      if (level < res.level) return { msg: `You need Fishing level ${res.level}.` };
      
      const chance = 0.3 + (level - res.level) * 0.02;
      if (Math.random() < chance) {
        const fishMap = { 'Shrimp': 'Raw shrimp', 'Trout': 'Raw trout', 'Swordfish': 'Raw swordfish' };
        const fishId = fishMap[res.type] || 'Raw shrimp';
        this.addItem(fishId);
        entities.spawnWaterSplash(res.x, res.y);
        result = { xp: res.xp, skill: 'Fishing', msg: `You catch a ${res.type.toLowerCase()}.`, item: fishId };
      }
    }
    
    return result;
  }
  
  eatFood(slotIndex) {
    const item = this.inventory[slotIndex];
    if (!item) return null;
    const def = ITEMS[item.id];
    if (!def || def.type !== 'food') return null;
    
    const heal = def.heal || 0;
    const oldHp = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + heal);
    this.removeItem(item.id);
    
    return { healed: this.hp - oldHp, msg: `You eat the ${item.id.toLowerCase()}. It heals ${this.hp - oldHp} HP.` };
  }
  
  buryBones(slotIndex) {
    const item = this.inventory[slotIndex];
    if (!item) return null;
    const def = ITEMS[item.id];
    if (!def || !def.prayerXP) return null;
    
    this.removeItem(item.id);
    return { xp: def.prayerXP, skill: 'Prayer', msg: `You bury the ${item.id.toLowerCase()}.` };
  }
  
  // Save/Load
  save() {
    const data = {
      x: this.x, y: this.y,
      skills: this.skills,
      hp: this.hp, prayer: this.prayer,
      inventory: this.inventory,
      equipment: this.equipment,
      bank: this.bank,
      coins: this.coins
    };
    localStorage.setItem('rs10_save', JSON.stringify(data));
  }
  
  load() {
    const raw = localStorage.getItem('rs10_save');
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      this.x = data.x; this.y = data.y;
      this.skills = data.skills;
      this.hp = data.hp;
      this.maxHp = this.getLevel('Hitpoints');
      this.prayer = data.prayer;
      this.maxPrayer = this.getLevel('Prayer');
      this.inventory = data.inventory;
      this.equipment = data.equipment;
      this.bank = data.bank || [];
      this.coins = data.coins || 0;
      this.updateSprite();
      return true;
    } catch (e) {
      return false;
    }
  }
}
