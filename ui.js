// UI management - panels, inventory, chat, context menus, minimap
class GameUI {
  constructor() {
    this.activeTab = 'inventory';
    this.chatMessages = [];
    this.contextMenuVisible = false;
    this.dialogueActive = false;
    this.shopActive = false;
    this.bankActive = false;
    this.currentShop = null;
    this.currentDialogue = null;
    this.dialogueNPC = null;
  }
  
  init() {
    // Tab switching
    document.querySelectorAll('#panel-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#panel-tabs .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel-page').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        document.getElementById(`${tabName}-panel`).classList.add('active');
        this.activeTab = tabName;
      });
    });
    
    // Chat input
    document.getElementById('chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const input = e.target;
        if (input.value.trim()) {
          this.addChatMessage(input.value, 'chat');
          input.value = '';
        }
      }
    });
    
    // Create inventory slots
    const grid = document.getElementById('inventory-grid');
    for (let i = 0; i < 28; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.dataset.index = i;
      grid.appendChild(slot);
    }
    
    // Close buttons
    document.getElementById('shop-close').addEventListener('click', () => this.closeShop());
    document.getElementById('bank-close').addEventListener('click', () => this.closeBank());
    
    // Hide context menu on click
    document.addEventListener('click', () => this.hideContextMenu());
    
    // Chat tabs
    document.querySelectorAll('.chat-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });
    
    this.addChatMessage('Welcome to RuneScape 10! Click to move, right-click for options.', 'system');
    this.addChatMessage('Tip: Visit NPCs to trade, bank, and learn skills.', 'game');
  }
  
  addChatMessage(text, type = 'game') {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-msg-${type}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    
    this.chatMessages.push({ text, type, time: Date.now() });
    // Keep last 100
    if (container.children.length > 100) {
      container.removeChild(container.firstChild);
    }
  }
  
  updateInventory(player) {
    const slots = document.querySelectorAll('.inv-slot');
    slots.forEach((slot, i) => {
      const item = player.inventory[i];
      if (item) {
        const def = ITEMS[item.id];
        slot.textContent = item.id.split(' ').map(w => w[0]).join('');
        slot.title = item.id;
        slot.style.background = 'rgba(60,40,20,0.6)';
        if (item.count > 1) {
          slot.innerHTML = `${slot.textContent}<span class="item-count">${item.count}</span>`;
        }
      } else {
        slot.textContent = '';
        slot.title = '';
        slot.style.background = 'rgba(0,0,0,0.4)';
      }
    });
  }
  
  updateStats(player) {
    const list = document.getElementById('stats-list');
    list.innerHTML = '';
    
    for (const skill of SKILLS) {
      const level = player.getLevel(skill);
      const xp = player.skills[skill].xp;
      const nextXP = XP_TABLE[Math.min(level + 1, 99)] || 200000000;
      
      const div = document.createElement('div');
      div.className = 'stat-entry';
      div.innerHTML = `
        <span class="stat-name">${skill.substring(0, 6)}</span>
        <span class="stat-level">${level}</span>
        <span class="stat-xp">${Math.floor(xp)} / ${nextXP}</span>
      `;
      div.title = `${skill}: Level ${level}\nXP: ${Math.floor(xp)}\nNext level: ${nextXP}`;
      list.appendChild(div);
    }
    
    // Combat level
    const cl = document.createElement('div');
    cl.className = 'stat-entry';
    cl.innerHTML = `<span class="stat-name" style="color:#ff0">Combat</span><span class="stat-level">${player.getCombatLevel()}</span>`;
    list.appendChild(cl);
  }
  
  updateEquipment(player) {
    document.querySelectorAll('.equip-slot').forEach(slot => {
      const slotName = slot.dataset.slot;
      const equipped = player.equipment[slotName];
      if (equipped) {
        slot.textContent = equipped.split(' ').map(w => w[0]).join('');
        slot.title = equipped;
        slot.classList.add('equipped');
      } else {
        slot.textContent = slotName.charAt(0).toUpperCase() + slotName.slice(1);
        slot.title = '';
        slot.classList.remove('equipped');
      }
    });
    
    // Update equip stats
    const statsDiv = document.getElementById('equip-stats');
    statsDiv.innerHTML = `
      <div>Attack: +${player.getAttackBonus()}</div>
      <div>Strength: +${player.getStrengthBonus()}</div>
      <div>Defence: +${player.getDefenceBonus()}</div>
    `;
  }
  
  updateOrbs(player) {
    document.getElementById('hp-text').textContent = `${player.hp}/${player.maxHp}`;
    document.querySelector('.hp-fill').style.height = `${(player.hp / player.maxHp) * 100}%`;
    
    document.getElementById('prayer-text').textContent = `${player.prayer}/${player.maxPrayer}`;
    document.querySelector('.prayer-fill').style.height = `${(player.prayer / player.maxPrayer) * 100}%`;
    
    document.getElementById('run-text').textContent = `${Math.floor(player.runEnergy)}%`;
    document.querySelector('.run-fill').style.height = `${player.runEnergy}%`;
  }
  
  showContextMenu(x, y, items) {
    const menu = document.getElementById('context-menu');
    const menuItems = document.getElementById('context-menu-items');
    menuItems.innerHTML = '';
    
    for (const item of items) {
      const div = document.createElement('div');
      if (item.title) {
        div.className = 'ctx-item ctx-title';
        div.textContent = item.label;
      } else {
        div.className = 'ctx-item ctx-action';
        div.innerHTML = `<span>${item.action}</span> ${item.label}`;
        div.addEventListener('click', (e) => {
          e.stopPropagation();
          item.callback();
          this.hideContextMenu();
        });
      }
      menuItems.appendChild(div);
    }
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');
    this.contextMenuVisible = true;
    
    // Prevent going off screen
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 5}px`;
      if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 5}px`;
    });
  }
  
  hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
    this.contextMenuVisible = false;
  }
  
  showDialogue(npc) {
    this.dialogueActive = true;
    this.dialogueNPC = npc;
    this.currentDialogue = 0;
    this._renderDialogue();
    document.getElementById('dialogue-box').classList.remove('hidden');
  }
  
  _renderDialogue() {
    const npc = this.dialogueNPC;
    const d = npc.dialogue[this.currentDialogue];
    
    document.getElementById('dialogue-npc-name').textContent = npc.name;
    document.getElementById('dialogue-text').textContent = d.text;
    
    const optionsDiv = document.getElementById('dialogue-options');
    optionsDiv.innerHTML = '';
    
    d.options.forEach((opt, i) => {
      const btn = document.createElement('div');
      btn.className = 'dialogue-option';
      btn.textContent = opt;
      btn.addEventListener('click', () => this._handleDialogueOption(i));
      optionsDiv.appendChild(btn);
    });
  }
  
  _handleDialogueOption(index) {
    const npc = this.dialogueNPC;
    
    if (this.currentDialogue + 1 < npc.dialogue.length && index === 0) {
      this.currentDialogue++;
      this._renderDialogue();
    } else {
      this.closeDialogue();
      // Handle actions
      if (npc.action === 'bank') {
        this.openBank();
      } else if (npc.action === 'shop_general') {
        this.openShop('general');
      } else if (npc.action === 'shop_weapons') {
        this.openShop('weapons');
      }
    }
  }
  
  closeDialogue() {
    this.dialogueActive = false;
    this.dialogueNPC = null;
    document.getElementById('dialogue-box').classList.add('hidden');
  }
  
  openShop(shopId) {
    const shop = SHOPS[shopId];
    if (!shop) return;
    
    this.shopActive = true;
    this.currentShop = shop;
    
    document.getElementById('shop-title').textContent = shop.name;
    const itemsDiv = document.getElementById('shop-items');
    itemsDiv.innerHTML = '';
    
    for (const item of shop.items) {
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <div>${item.id.split(' ').map(w => w[0]).join('')}</div>
        <div style="font-size:9px">${item.id}</div>
        <div class="price">${item.price}gp</div>
      `;
      div.title = `${item.id} - ${item.price}gp`;
      div.addEventListener('click', () => {
        if (this._onShopBuy) this._onShopBuy(item);
      });
      itemsDiv.appendChild(div);
    }
    
    document.getElementById('shop-window').classList.remove('hidden');
  }
  
  closeShop() {
    this.shopActive = false;
    this.currentShop = null;
    document.getElementById('shop-window').classList.add('hidden');
  }
  
  openBank(player) {
    this.bankActive = true;
    document.getElementById('bank-window').classList.remove('hidden');
    if (player) this.updateBankDisplay(player);
  }
  
  updateBankDisplay(player) {
    const div = document.getElementById('bank-items');
    div.innerHTML = '';
    
    // Show bank items
    for (let i = 0; i < player.bank.length; i++) {
      const item = player.bank[i];
      if (!item) continue;
      const el = document.createElement('div');
      el.className = 'bank-item';
      el.innerHTML = `<div>${item.id.split(' ').map(w => w[0]).join('')}</div><div style="font-size:9px">${item.id}</div>`;
      el.title = item.id;
      el.addEventListener('click', () => {
        if (this._onBankWithdraw) this._onBankWithdraw(i);
      });
      div.appendChild(el);
    }
    
    // Deposit all button
    const depBtn = document.createElement('div');
    depBtn.className = 'bank-item';
    depBtn.style.background = 'rgba(60,100,60,0.4)';
    depBtn.innerHTML = '<div>📥</div><div style="font-size:9px">Deposit All</div>';
    depBtn.addEventListener('click', () => {
      if (this._onBankDepositAll) this._onBankDepositAll();
    });
    div.appendChild(depBtn);
  }
  
  closeBank() {
    this.bankActive = false;
    document.getElementById('bank-window').classList.add('hidden');
  }
  
  // Minimap rendering
  renderMinimap(player, entities) {
    const canvas = document.getElementById('minimapCanvas');
    const ctx = canvas.getContext('2d');
    const size = 160;
    const scale = size / 30; // Show 30 tile radius
    
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(0, 0, size, size);
    
    const px = player.x, py = player.y;
    
    // Draw tiles
    for (let dy = -15; dy < 15; dy++) {
      for (let dx = -15; dx < 15; dx++) {
        const tx = Math.floor(px + dx), ty = Math.floor(py + dy);
        const tile = World.getTile(tx, ty);
        
        const sx = (dx + 15) * scale;
        const sy = (dy + 15) * scale;
        
        switch (tile) {
          case TILE.GRASS: ctx.fillStyle = '#2d5a1e'; break;
          case TILE.COBBLE: ctx.fillStyle = '#888'; break;
          case TILE.STONE: ctx.fillStyle = '#777'; break;
          case TILE.DIRT: ctx.fillStyle = '#6a4a2a'; break;
          case TILE.WATER: ctx.fillStyle = '#2255aa'; break;
          case TILE.SAND: ctx.fillStyle = '#c8b060'; break;
          default: ctx.fillStyle = '#2d5a1e';
        }
        ctx.fillRect(sx, sy, scale + 1, scale + 1);
      }
    }
    
    // Draw buildings
    for (const b of World.buildings) {
      const bx = (b.x - px + 15) * scale;
      const by = (b.y - py + 15) * scale;
      ctx.fillStyle = '#555';
      ctx.fillRect(bx, by, b.width * scale, b.depth * scale);
    }
    
    // Draw NPCs
    for (const npc of entities.npcs) {
      const nx = (npc.x - px + 15) * scale;
      const ny = (npc.y - py + 15) * scale;
      ctx.fillStyle = '#ff0';
      ctx.fillRect(nx - 2, ny - 2, 4, 4);
    }
    
    // Draw monsters
    for (const m of entities.monsters) {
      if (m.dead) continue;
      const mx = (m.x - px + 15) * scale;
      const my = (m.y - py + 15) * scale;
      ctx.fillStyle = '#f00';
      ctx.fillRect(mx - 1, my - 1, 3, 3);
    }
    
    // Draw player
    ctx.fillStyle = '#fff';
    ctx.fillRect(size / 2 - 2, size / 2 - 2, 5, 5);
    
    // Circular mask
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  
  // Draw entity labels and hitsplats on a 2D overlay
  renderOverlays(ctx, renderer, player, entities) {
    // NPC names
    for (const npc of entities.npcs) {
      const screen = renderer.worldToScreen(npc.x, npc.y, 1.4);
      const sx = screen[0] * ctx.canvas.width;
      const sy = (1 - screen[1]) * ctx.canvas.height;
      
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff0';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeText(npc.name, sx, sy);
      ctx.fillText(npc.name, sx, sy);
    }
    
    // Monster names and HP bars
    for (const m of entities.monsters) {
      if (m.dead) continue;
      const screen = renderer.worldToScreen(m.x, m.y, 1.5);
      const sx = screen[0] * ctx.canvas.width;
      const sy = (1 - screen[1]) * ctx.canvas.height;
      
      // Name
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      const color = m.level <= player.getCombatLevel() ? '#0f0' : 
                    m.level <= player.getCombatLevel() + 10 ? '#ff0' : '#f00';
      ctx.fillStyle = color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeText(`${m.name} (Lv ${m.level})`, sx, sy);
      ctx.fillText(`${m.name} (Lv ${m.level})`, sx, sy);
      
      // HP bar
      if (m.hp < m.maxHp) {
        const barW = 40, barH = 5;
        ctx.fillStyle = '#300';
        ctx.fillRect(sx - barW/2, sy + 2, barW, barH);
        ctx.fillStyle = '#0a0';
        ctx.fillRect(sx - barW/2, sy + 2, barW * (m.hp / m.maxHp), barH);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - barW/2, sy + 2, barW, barH);
      }
    }
    
    // Hitsplats
    for (const h of entities.hitsplats) {
      const screen = renderer.worldToScreen(h.x, h.y, h.z);
      const sx = screen[0] * ctx.canvas.width;
      const sy = (1 - screen[1]) * ctx.canvas.height;
      
      const alpha = Math.min(1, h.timer);
      ctx.globalAlpha = alpha;
      
      // Background circle
      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, Math.PI * 2);
      ctx.fillStyle = h.damage > 0 ? '#c00' : '#00c';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Damage number
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(h.damage.toString(), sx, sy + 4);
      
      ctx.globalAlpha = 1;
    }
    
    // Ground items
    for (const item of entities.groundItems) {
      const screen = renderer.worldToScreen(item.x, item.y, 0.3);
      const sx = screen[0] * ctx.canvas.width;
      const sy = (1 - screen[1]) * ctx.canvas.height;
      
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f0f';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeText(item.itemId, sx, sy);
      ctx.fillText(item.itemId, sx, sy);
    }
    
    // Player name
    const pScreen = renderer.worldToScreen(player.x, player.y, 1.5);
    const psx = pScreen[0] * ctx.canvas.width;
    const psy = (1 - pScreen[1]) * ctx.canvas.height;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f0';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeText(`Player (Lv ${player.getCombatLevel()})`, psx, psy);
    ctx.fillText(`Player (Lv ${player.getCombatLevel()})`, psx, psy);
  }
  
  hideLoading() {
    const loading = document.getElementById('loading-screen');
    loading.style.opacity = '0';
    loading.style.transition = 'opacity 0.5s';
    setTimeout(() => loading.style.display = 'none', 500);
  }
  
  setLoadingProgress(pct, text) {
    document.getElementById('loading-bar').style.width = `${pct}%`;
    document.getElementById('loading-text').textContent = text;
  }
}
