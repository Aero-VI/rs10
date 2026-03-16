// Main game controller
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.renderer = new Renderer(this.canvas);
    this.player = new Player();
    this.entities = new EntityManager();
    this.ui = new GameUI();
    
    // 2D overlay canvas for text
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.style.position = 'absolute';
    this.overlayCanvas.style.top = '0';
    this.overlayCanvas.style.left = '0';
    this.overlayCanvas.style.width = '100%';
    this.overlayCanvas.style.height = '100%';
    this.overlayCanvas.style.pointerEvents = 'none';
    this.overlayCanvas.style.zIndex = '5';
    document.getElementById('game-container').appendChild(this.overlayCanvas);
    this.overlayCtx = this.overlayCanvas.getContext('2d');
    
    this.running = false;
    this.lastTime = 0;
    this.particleTimer = 0;
    this.saveTimer = 0;
    this.autoSaveInterval = 30;
  }
  
  async init() {
    this.ui.setLoadingProgress(10, 'Initializing WebGL...');
    await this._delay(50);
    
    this.renderer.init();
    
    this.ui.setLoadingProgress(40, 'Generating world...');
    await this._delay(50);
    
    World.generate();
    
    this.ui.setLoadingProgress(60, 'Building terrain...');
    await this._delay(50);
    
    // Build initial terrain mesh
    this._rebuildTerrain();
    
    this.ui.setLoadingProgress(75, 'Spawning entities...');
    await this._delay(50);
    
    this.entities.init(this.renderer);
    this.player.init(this.renderer);
    
    // Try to load save
    if (this.player.load()) {
      this.ui.addChatMessage('Save data loaded!', 'system');
    }
    
    this.ui.setLoadingProgress(90, 'Setting up UI...');
    await this._delay(50);
    
    this.ui.init();
    this._setupInput();
    this._setupPointLights();
    
    // Set renderer point lights
    this.renderer.pointLights = this._pointLightPositions;
    this.renderer.pointLightColors = this._pointLightColors;
    
    this.ui.setLoadingProgress(100, 'Ready!');
    await this._delay(300);
    this.ui.hideLoading();
    
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(t => this.gameLoop(t));
  }
  
  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
  
  _rebuildTerrain() {
    const mesh = World.buildTerrainMesh(this.player.x, this.player.y, 35);
    this.renderer.uploadTerrain(mesh.vertices, mesh.indices);
  }
  
  _setupPointLights() {
    this._pointLightPositions = [];
    this._pointLightColors = [];
    
    for (const [tx, ty] of World.torchPositions) {
      this._pointLightPositions.push([tx, ty, 1.5]);
      this._pointLightColors.push([1.0, 0.6, 0.2]);
    }
    
    // Smithy furnace glow
    this._pointLightPositions.push([39, 27, 1.0]);
    this._pointLightColors.push([1.0, 0.3, 0.05]);
    
    // Fountain
    this._pointLightPositions.push([40, 40, 0.5]);
    this._pointLightColors.push([0.3, 0.4, 0.8]);
  }
  
  _setupInput() {
    // Left click - move/interact
    this.canvas.addEventListener('click', e => {
      if (this.ui.contextMenuVisible || this.ui.dialogueActive || 
          this.ui.shopActive || this.ui.bankActive) return;
      
      const world = this.renderer.screenToWorld(e.clientX, e.clientY);
      this._handleLeftClick(world.x, world.y);
    });
    
    // Right click - context menu
    this.canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      const world = this.renderer.screenToWorld(e.clientX, e.clientY);
      this._handleRightClick(e.clientX, e.clientY, world.x, world.y);
    });
    
    // Inventory clicks
    document.getElementById('inventory-grid').addEventListener('click', e => {
      const slot = e.target.closest('.inv-slot');
      if (!slot) return;
      const idx = parseInt(slot.dataset.index);
      this._handleInventoryClick(idx);
    });
    
    document.getElementById('inventory-grid').addEventListener('contextmenu', e => {
      e.preventDefault();
      const slot = e.target.closest('.inv-slot');
      if (!slot) return;
      const idx = parseInt(slot.dataset.index);
      this._handleInventoryRightClick(e.clientX, e.clientY, idx);
    });
    
    // Equipment clicks
    document.querySelectorAll('.equip-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        const slotName = slot.dataset.slot;
        this.player.unequip(slotName);
        this.ui.updateEquipment(this.player);
        this.ui.updateInventory(this.player);
      });
    });
    
    // Keyboard
    this._keysHeld = {};
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      this._keysHeld[e.key.toLowerCase()] = true;
      
      switch (e.key) {
        case 'Escape':
          this.ui.hideContextMenu();
          this.ui.closeDialogue();
          this.ui.closeShop();
          this.ui.closeBank();
          break;
        case 'i': case 'I':
          document.querySelector('[data-tab="inventory"]').click();
          break;
        case 'e': case 'E':
          document.querySelector('[data-tab="equipment"]').click();
          break;
      }
    });
    document.addEventListener('keyup', e => {
      this._keysHeld[e.key.toLowerCase()] = false;
    });
    
    // Window resize
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.overlayCanvas.width = this.canvas.clientWidth * Math.min(window.devicePixelRatio, 2);
      this.overlayCanvas.height = this.canvas.clientHeight * Math.min(window.devicePixelRatio, 2);
    });
    this.overlayCanvas.width = this.canvas.clientWidth * Math.min(window.devicePixelRatio, 2);
    this.overlayCanvas.height = this.canvas.clientHeight * Math.min(window.devicePixelRatio, 2);
    
    // Scroll to zoom
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.renderer.cameraZoom = Math.max(0.5, Math.min(3, 
        this.renderer.cameraZoom + e.deltaY * 0.001));
    }, { passive: false });
    
    // Touch support
    let touchStart = null;
    this.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
      }
    }, { passive: false });
    
    this.canvas.addEventListener('touchend', e => {
      if (touchStart && Date.now() - touchStart.time < 300) {
        const world = this.renderer.screenToWorld(touchStart.x, touchStart.y);
        this._handleLeftClick(world.x, world.y);
      }
      touchStart = null;
    });
    
    // Shop buy callback
    this.ui._onShopBuy = (item) => {
      if (this.player.coins >= item.price) {
        if (!this.player.inventoryFull()) {
          this.player.coins -= item.price;
          this.player.addItem(item.id);
          this.ui.addChatMessage(`Bought ${item.id} for ${item.price}gp.`, 'game');
          this.ui.updateInventory(this.player);
        } else {
          this.ui.addChatMessage('Your inventory is full.', 'game');
        }
      } else {
        this.ui.addChatMessage("You don't have enough coins.", 'game');
      }
    };
    
    // Bank callbacks
    this.ui._onBankDepositAll = () => {
      for (let i = 0; i < 28; i++) {
        if (this.player.inventory[i]) {
          this.player.bank.push({ ...this.player.inventory[i] });
          this.player.inventory[i] = null;
          this.player.inventoryCount--;
        }
      }
      this.ui.updateInventory(this.player);
      this.ui.updateBankDisplay(this.player);
      this.ui.addChatMessage('All items deposited.', 'game');
    };
    
    this.ui._onBankWithdraw = (index) => {
      if (this.player.inventoryFull()) {
        this.ui.addChatMessage('Your inventory is full.', 'game');
        return;
      }
      const item = this.player.bank[index];
      if (item) {
        this.player.addItem(item.id, item.count);
        this.player.bank.splice(index, 1);
        this.ui.updateInventory(this.player);
        this.ui.updateBankDisplay(this.player);
      }
    };
  }
  
  _handleLeftClick(wx, wy) {
    const tx = Math.floor(wx), ty = Math.floor(wy);
    
    // Check NPC
    const npc = this.entities.getNPCAt(wx, wy);
    if (npc) {
      this.player.moveTo(npc.x, npc.y);
      this._pendingInteraction = () => {
        this.ui.showDialogue(npc);
      };
      return;
    }
    
    // Check monster
    const monster = this.entities.getMonsterAt(wx, wy);
    if (monster) {
      this.player.combatTarget = monster;
      this.player.combatTimer = 0;
      this.player.skillingTarget = null;
      this.player.path = this.player.findPath(monster.x, monster.y);
      this.player.pathIndex = 0;
      return;
    }
    
    // Check ground item
    const groundItem = this.entities.getGroundItemAt(wx, wy);
    if (groundItem) {
      this.player.moveTo(groundItem.x, groundItem.y);
      this._pendingInteraction = () => {
        this._pickupGroundItem(groundItem);
      };
      return;
    }
    
    // Check resource
    const resource = World.getResourceAt(wx, wy);
    if (resource) {
      const ref = World.getResourceRef(wx, wy);
      this.player.moveTo(resource.x, resource.y);
      this._pendingInteraction = () => {
        if (resource.resourceType === 'tree') {
          this.player.startSkilling(ref, 'woodcutting');
          this.ui.addChatMessage(`You swing your axe at the ${resource.type.toLowerCase()} tree...`, 'game');
        } else if (resource.resourceType === 'rock') {
          this.player.startSkilling(ref, 'mining');
          this.ui.addChatMessage(`You swing your pickaxe at the ${resource.type.toLowerCase()} rock...`, 'game');
        } else if (resource.resourceType === 'fish') {
          this.player.startSkilling(resource, 'fishing');
          this.ui.addChatMessage(`You start fishing for ${resource.type.toLowerCase()}...`, 'game');
        }
      };
      return;
    }
    
    // Move to location
    this.player.moveTo(wx, wy);
    this.player.combatTarget = null;
    this.player.skillingTarget = null;
    this._pendingInteraction = null;
  }
  
  _handleRightClick(sx, sy, wx, wy) {
    const items = [];
    
    // Check NPC
    const npc = this.entities.getNPCAt(wx, wy);
    if (npc) {
      items.push({ title: true, label: npc.name });
      items.push({ action: 'Talk-to', label: npc.name, callback: () => {
        this.player.moveTo(npc.x, npc.y);
        this._pendingInteraction = () => this.ui.showDialogue(npc);
      }});
      if (npc.action === 'bank') {
        items.push({ action: 'Bank', label: npc.name, callback: () => {
          this.player.moveTo(npc.x, npc.y);
          this._pendingInteraction = () => this.ui.openBank(this.player);
        }});
      }
      if (npc.action && npc.action.startsWith('shop')) {
        items.push({ action: 'Trade', label: npc.name, callback: () => {
          this.player.moveTo(npc.x, npc.y);
          this._pendingInteraction = () => this.ui.openShop(npc.action.split('_')[1]);
        }});
      }
    }
    
    // Check monster
    const monster = this.entities.getMonsterAt(wx, wy);
    if (monster) {
      items.push({ title: true, label: `${monster.name} (Lv ${monster.level})` });
      items.push({ action: 'Attack', label: monster.name, callback: () => {
        this.player.combatTarget = monster;
        this.player.combatTimer = 0;
      }});
    }
    
    // Check resource
    const resource = World.getResourceAt(wx, wy);
    if (resource) {
      items.push({ title: true, label: `${resource.type} ${resource.resourceType}` });
      if (resource.resourceType === 'tree') {
        items.push({ action: 'Chop down', label: `${resource.type} tree`, callback: () => {
          this._handleLeftClick(wx, wy);
        }});
      } else if (resource.resourceType === 'rock') {
        items.push({ action: 'Mine', label: `${resource.type} rock`, callback: () => {
          this._handleLeftClick(wx, wy);
        }});
      } else if (resource.resourceType === 'fish') {
        items.push({ action: 'Fish', label: resource.type, callback: () => {
          this._handleLeftClick(wx, wy);
        }});
      }
    }
    
    // Ground items
    const groundItem = this.entities.getGroundItemAt(wx, wy);
    if (groundItem) {
      items.push({ title: true, label: groundItem.itemId });
      items.push({ action: 'Take', label: groundItem.itemId, callback: () => {
        this.player.moveTo(groundItem.x, groundItem.y);
        this._pendingInteraction = () => this._pickupGroundItem(groundItem);
      }});
    }
    
    // Always show walk here
    items.push({ action: 'Walk here', label: '', callback: () => {
      this.player.moveTo(wx, wy);
      this.player.combatTarget = null;
      this.player.skillingTarget = null;
    }});
    
    if (items.length > 0) {
      this.ui.showContextMenu(sx, sy, items);
    }
  }
  
  _handleInventoryClick(idx) {
    const item = this.player.inventory[idx];
    if (!item) return;
    
    const def = ITEMS[item.id];
    if (!def) return;
    
    if (def.type === 'food') {
      const result = this.player.eatFood(idx);
      if (result) this.ui.addChatMessage(result.msg, 'game');
    } else if (def.slot) {
      this.player.equip(idx);
      this.ui.updateEquipment(this.player);
    } else if (def.prayerXP) {
      const result = this.player.buryBones(idx);
      if (result) {
        this.ui.addChatMessage(result.msg, 'game');
        const levelUp = this.player.addXP(result.skill, result.xp);
        if (levelUp) this._showLevelUp(result.skill, levelUp);
        this.ui.addChatMessage(`+${result.xp} ${result.skill} XP`, 'skill');
      }
    } else if (def.type === 'log') {
      // Firemaking
      this.player.removeItem(item.id);
      const fmXP = def.fmXP || 40;
      const levelUp = this.player.addXP('Firemaking', fmXP);
      this.ui.addChatMessage(`You light the ${item.id.toLowerCase()}. +${fmXP} Firemaking XP`, 'skill');
      if (levelUp) this._showLevelUp('Firemaking', levelUp);
      this.entities.spawnFireParticles(this.player.x, this.player.y);
    } else if (def.type === 'food_raw') {
      // Check if near range/fire
      const nearKitchen = World.buildings.some(b => 
        b.name === 'Kitchen' && 
        Math.abs(this.player.x - (b.x + b.width/2)) < 4 && 
        Math.abs(this.player.y - (b.y + b.depth/2)) < 4
      );
      if (nearKitchen) {
        const cookLevel = this.player.getLevel('Cooking');
        if (cookLevel >= def.cookLevel) {
          this.player.removeItem(item.id);
          // Burn chance based on level
          const burnChance = Math.max(0.05, 0.5 - (cookLevel - def.cookLevel) * 0.03);
          if (Math.random() < burnChance) {
            this.player.addItem('Burnt food');
            this.ui.addChatMessage('You accidentally burn the food.', 'game');
          } else {
            this.player.addItem(def.cooked);
            const levelUp = this.player.addXP('Cooking', def.cookXP);
            this.ui.addChatMessage(`You cook the ${item.id.toLowerCase()}. +${def.cookXP} Cooking XP`, 'skill');
            if (levelUp) this._showLevelUp('Cooking', levelUp);
          }
        } else {
          this.ui.addChatMessage(`You need Cooking level ${def.cookLevel} to cook that.`, 'game');
        }
      } else {
        this.ui.addChatMessage('You need to be near a range to cook.', 'game');
      }
    }
    
    this.ui.updateInventory(this.player);
  }
  
  _handleInventoryRightClick(sx, sy, idx) {
    const item = this.player.inventory[idx];
    if (!item) return;
    const def = ITEMS[item.id];
    
    const items = [{ title: true, label: item.id }];
    
    if (def.type === 'food') {
      items.push({ action: 'Eat', label: item.id, callback: () => this._handleInventoryClick(idx) });
    }
    if (def.slot) {
      items.push({ action: 'Equip', label: item.id, callback: () => {
        this.player.equip(idx);
        this.ui.updateEquipment(this.player);
        this.ui.updateInventory(this.player);
      }});
    }
    if (def.prayerXP) {
      items.push({ action: 'Bury', label: item.id, callback: () => this._handleInventoryClick(idx) });
    }
    if (def.type === 'log') {
      items.push({ action: 'Light', label: item.id, callback: () => this._handleInventoryClick(idx) });
    }
    if (def.type === 'food_raw') {
      items.push({ action: 'Cook', label: item.id, callback: () => this._handleInventoryClick(idx) });
    }
    
    items.push({ action: 'Drop', label: item.id, callback: () => {
      this.entities.dropItem(this.player.x, this.player.y, item.id, item.count);
      this.player.inventory[idx] = null;
      this.player.inventoryCount--;
      this.ui.updateInventory(this.player);
    }});
    items.push({ action: 'Examine', label: item.id, callback: () => {
      this.ui.addChatMessage(`${item.id}: Worth ${def.value || 0} coins.`, 'game');
    }});
    
    this.ui.showContextMenu(sx, sy, items);
  }
  
  _pickupGroundItem(groundItem) {
    const idx = this.entities.groundItems.indexOf(groundItem);
    if (idx === -1) return;
    
    if (this.player.inventoryFull() && groundItem.itemId !== 'Coins') {
      this.ui.addChatMessage('Your inventory is full.', 'game');
      return;
    }
    
    this.player.addItem(groundItem.itemId, groundItem.amount);
    this.entities.groundItems.splice(idx, 1);
    this.ui.addChatMessage(`Picked up: ${groundItem.itemId}${groundItem.amount > 1 ? ' x' + groundItem.amount : ''}`, 'drop');
    this.ui.updateInventory(this.player);
  }
  
  _showLevelUp(skill, level) {
    this.ui.addChatMessage(`🎉 Congratulations! You've reached ${skill} level ${level}!`, 'system');
    this.entities.spawnLevelUpFireworks(this.player.x, this.player.y);
  }
  
  gameLoop(timestamp) {
    if (!this.running) return;
    
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;
    
    this.update(dt);
    this.render();
    
    requestAnimationFrame(t => this.gameLoop(t));
  }
  
  update(dt) {
    // WASD keyboard movement
    const k = this._keysHeld || {};
    const speed = 5 * dt;
    if (k['w'] || k['arrowup']) { this.player.y -= speed; this.player.path = []; }
    if (k['s'] || k['arrowdown']) { this.player.y += speed; this.player.path = []; }
    if (k['a'] || k['arrowleft']) { this.player.x -= speed; this.player.path = []; }
    if (k['d'] || k['arrowright']) { this.player.x += speed; this.player.path = []; }
    
    // Clamp to world bounds
    this.player.x = Math.max(0, Math.min(79, this.player.x));
    this.player.y = Math.max(0, Math.min(79, this.player.y));
    
    // World update (resource respawn)
    World.update(dt);
    
    // Player update
    this.player.update(dt, this.entities);
    
    // Check pending interaction (arrived at destination)
    if (this._pendingInteraction && !this.player.moving && this.player.path.length === 0) {
      this._pendingInteraction();
      this._pendingInteraction = null;
    }
    
    // Skilling results are handled via player.update calling performSkilling
    // We just check the return value from the player's skilling loop
    if (this.player._lastSkillingResult) {
      const result = this.player._lastSkillingResult;
      this.player._lastSkillingResult = null;
      if (result.msg) this.ui.addChatMessage(result.msg, result.skill ? 'skill' : 'game');
      if (result.xp && result.skill) {
        const levelUp = this.player.addXP(result.skill, result.xp);
        this.ui.addChatMessage(`+${result.xp} ${result.skill} XP`, 'skill');
        if (levelUp) this._showLevelUp(result.skill, levelUp);
      }
    }
    
    // Handle combat results
    if (this.player.combatTarget && !this.player.combatTarget.dead) {
      // Combat is handled in player.update
    }
    
    // Combat XP
    if (this.player.combatTarget === null && this._lastCombatTarget) {
      // Monster was killed, award XP
      const m = this._lastCombatTarget;
      if (m.dead) {
        const xp = m.xp;
        const atkLvl = this.player.addXP('Attack', xp / 3);
        const strLvl = this.player.addXP('Strength', xp / 3);
        const defLvl = this.player.addXP('Defence', xp / 3);
        const hpLvl = this.player.addXP('Hitpoints', xp / 4);
        
        this.ui.addChatMessage(`You defeated the ${m.name}! +${Math.floor(xp)} combat XP`, 'combat');
        
        if (atkLvl) this._showLevelUp('Attack', atkLvl);
        if (strLvl) this._showLevelUp('Strength', strLvl);
        if (defLvl) this._showLevelUp('Defence', defLvl);
        if (hpLvl) this._showLevelUp('Hitpoints', hpLvl);
      }
    }
    this._lastCombatTarget = this.player.combatTarget;
    
    // Player death
    if (this.player.hp <= 0) {
      this.ui.addChatMessage('Oh dear, you are dead!', 'system');
      this.player.hp = this.player.maxHp;
      this.player.x = 40; this.player.y = 40;
      this.player.combatTarget = null;
      this.player.skillingTarget = null;
      this.player.path = [];
      this.player.vao = null;
    }
    
    // Entity update
    this.entities.update(dt, this.player);
    
    // Camera follow player
    this.renderer.updateCamera(this.player.x, this.player.y);
    
    // Ambient particles
    this.particleTimer += dt;
    if (this.particleTimer > 0.1) {
      this.particleTimer = 0;
      
      // Torch particles
      const lighting = this.renderer.getDayLighting();
      for (const [tx, ty] of World.torchPositions) {
        if (Math.abs(tx - this.player.x) < 20 && Math.abs(ty - this.player.y) < 20) {
          this.entities.spawnFireParticles(tx, ty);
        }
      }
      
      // Chimney smoke (smithy and kitchen)
      this.entities.spawnSmokeParticle(39, 27);
      this.entities.spawnSmokeParticle(32, 49);
      
      // Dust motes in sunlight
      if (lighting.isDay && Math.random() < 0.3) {
        this.entities.spawnDustMotes(this.player.x, this.player.y);
      }
      
      // Fireflies at night
      if (!lighting.isDay && Math.random() < 0.5) {
        this.entities.particles.push({
          x: this.player.x + (Math.random() - 0.5) * 10,
          y: this.player.y + (Math.random() - 0.5) * 10,
          z: 0.5 + Math.random() * 1.5,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          vz: (Math.random() - 0.5) * 0.3,
          r: 0.5, g: 1.0, b: 0.3,
          a: 0.3 + Math.random() * 0.7,
          size: 2,
          life: 2 + Math.random() * 3, maxLife: 5
        });
      }
    }
    
    // Rebuild terrain occasionally (when player moves significantly)
    if (!this._lastTerrainPos || 
        Math.abs(this.player.x - this._lastTerrainPos.x) > 5 ||
        Math.abs(this.player.y - this._lastTerrainPos.y) > 5) {
      this._rebuildTerrain();
      this._lastTerrainPos = { x: this.player.x, y: this.player.y };
    }
    
    // Update UI periodically
    this._uiTimer = (this._uiTimer || 0) + dt;
    if (this._uiTimer > 0.25) {
      this._uiTimer = 0;
      this.ui.updateInventory(this.player);
      this.ui.updateStats(this.player);
      this.ui.updateEquipment(this.player);
      this.ui.updateOrbs(this.player);
    }
    
    // Auto save
    this.saveTimer += dt;
    if (this.saveTimer >= this.autoSaveInterval) {
      this.saveTimer = 0;
      this.player.save();
    }
  }
  
  render() {
    // Begin WebGL frame (render to FBO)
    this.renderer.beginFrame();
    
    // Render terrain
    this.renderer.renderTerrain();
    
    // Render buildings
    this.renderer.renderBuildings(World.buildings);
    
    // Collect all sprites for z-sorted rendering
    const sprites = [];
    
    // Trees
    for (const tree of World.trees) {
      if (tree.depleted) continue;
      if (Math.abs(tree.x - this.player.x) > 30 || Math.abs(tree.y - this.player.y) > 30) continue;
      
      if (!tree.texture) {
        // Generate tree sprite
        const w = 16, h = 32;
        const data = new Uint8Array(w * h * 4);
        const tc = tree.color;
        // Trunk
        for (let py = 20; py < 32; py++) {
          for (let px = 6; px < 10; px++) {
            const i = (py * w + px) * 4;
            data[i] = 100; data[i+1] = 70; data[i+2] = 40; data[i+3] = 255;
          }
        }
        // Canopy
        for (let py = 0; py < 22; py++) {
          for (let px = 0; px < 16; px++) {
            const cx = 8, cy = 10, r = 7;
            if ((px-cx)**2 + (py-cy)**2 < r*r + Math.sin(px*3+py*2)*6) {
              const i = (py * w + px) * 4;
              const n = Math.random() * 0.3;
              data[i] = Math.min(255, (tc[0] + n) * 255);
              data[i+1] = Math.min(255, (tc[1] + n) * 255);
              data[i+2] = Math.min(255, (tc[2] + n) * 255);
              data[i+3] = 255;
            }
          }
        }
        tree.texture = this.renderer.createSpriteTexture(data, w, h);
      }
      
      sprites.push({
        x: tree.x + 0.5, y: tree.y + 0.5, z: 0,
        spriteW: 1.2, spriteH: 2.4,
        texture: tree.texture, alpha: 1,
        vao: tree._vao, _buf: tree._buf
      });
      tree._lastSprite = sprites[sprites.length - 1];
    }
    
    // Rocks
    for (const rock of World.rocks) {
      if (rock.depleted) continue;
      if (Math.abs(rock.x - this.player.x) > 30 || Math.abs(rock.y - this.player.y) > 30) continue;
      
      if (!rock.texture) {
        const w = 12, h = 10;
        const data = new Uint8Array(w * h * 4);
        const rc = rock.color;
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            const cx = 6, cy = 6;
            if ((px-cx)**2 * 0.5 + (py-cy)**2 < 20) {
              const i = (py * w + px) * 4;
              const n = Math.random() * 0.2;
              data[i] = Math.min(255, (rc[0] + n + 0.3) * 255);
              data[i+1] = Math.min(255, (rc[1] + n + 0.3) * 255);
              data[i+2] = Math.min(255, (rc[2] + n + 0.3) * 255);
              data[i+3] = 255;
            }
          }
        }
        rock.texture = this.renderer.createSpriteTexture(data, w, h);
      }
      
      sprites.push({
        x: rock.x + 0.5, y: rock.y + 0.5, z: 0,
        spriteW: 0.8, spriteH: 0.6,
        texture: rock.texture, alpha: 1,
        vao: rock._vao, _buf: rock._buf
      });
    }
    
    // NPCs
    for (const npc of this.entities.npcs) {
      if (Math.abs(npc.x - this.player.x) > 25 || Math.abs(npc.y - this.player.y) > 25) continue;
      // Subtle idle animation
      npc.z = Math.sin(this.renderer.time * 2 + npc.animOffset) * 0.02;
      sprites.push(npc);
    }
    
    // Monsters
    for (const m of this.entities.monsters) {
      if (m.dead) continue;
      if (Math.abs(m.x - this.player.x) > 25 || Math.abs(m.y - this.player.y) > 25) continue;
      m.z = Math.sin(this.renderer.time * 2 + m.animOffset) * 0.02;
      sprites.push(m);
    }
    
    // Player
    sprites.push(this.player);
    
    // Render all sprites
    this.renderer.renderSprites(sprites);
    
    // Render particles
    this.renderer.renderParticles(this.entities.particles);
    
    // Post-processing (bloom, god rays, tone mapping)
    this.renderer.endFrame();
    
    // 2D overlay (names, hitsplats, etc)
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.ui.renderOverlays(ctx, this.renderer, this.player, this.entities);
    
    // Minimap
    this.ui.renderMinimap(this.player, this.entities);
  }
}

// Start the game
const game = new Game();
game.init().catch(err => {
  console.error('Game init failed:', err);
  document.getElementById('loading-text').textContent = 'Error: ' + err.message;
});
