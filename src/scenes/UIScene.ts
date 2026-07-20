import Phaser from 'phaser';
import { WORLD, PORT, PORTS, BOSS, BIOMES, TRADE } from '../config';
import { WEAPONS } from '../systems/weapons';
import { getEvolution } from '../systems/cards';
import { getFogBanks } from '../systems/biomes';
import { skyState } from '../systems/sky';
import { EnemyShip } from '../objects/EnemyShip';
import { GameScene } from './GameScene';

// All screen-space UI lives here, in its own scene with its own unzoomed
// camera — the game scene's camera zoom no longer crops the HUD.
export class UIScene extends Phaser.Scene {
  private gs!: GameScene;
  private root!: Phaser.GameObjects.Container;
  private coinText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private dockHint!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;
  private minimap!: Phaser.GameObjects.Graphics;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;
  private dayOverlay!: Phaser.GameObjects.Rectangle;
  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private ledger!: HTMLDivElement;
  private ledgerOn = false;

  constructor() {
    super('ui');
  }

  create(): void {
    this.gs = this.scene.get('game') as GameScene;
    this.ledgerOn = false;

    // sky washes tint the whole screen (game scene included) but sit under the HUD
    this.dayOverlay = this.add.rectangle(0, 0, 1280, 720, 0xffffff, 0)
      .setOrigin(0).setDepth(0);
    this.nightOverlay = this.add.rectangle(0, 0, 1280, 720, 0x0a1030, 0)
      .setOrigin(0).setDepth(1);

    this.root = this.add.container(0, 0).setDepth(10);

    this.coinText = this.add.text(16, 12, '', {
      fontFamily: 'Georgia', fontSize: '18px', color: '#ffd97a',
    });
    this.hudText = this.add.text(16, 38, '', {
      fontFamily: 'Georgia', fontSize: '15px', color: '#9fc6de',
    });
    this.hpBar = this.add.graphics();
    const controls = this.add.text(640, 694,
      'W/S sails · A/D rudder · broadsides auto-fire · ⚑ strike = board & plunder · E interact · H hide HUD · TAB ledger · ESC anchor', {
      fontFamily: 'Georgia', fontSize: '13px', color: '#7fa6bd',
    }).setOrigin(0.5);
    this.dockHint = this.add.text(640, 636, '', {
      fontFamily: 'Georgia', fontSize: '20px', color: '#ffd97a',
    }).setOrigin(0.5).setVisible(false);
    this.minimap = this.add.graphics();
    this.bossBar = this.add.graphics();
    this.bossName = this.add.text(640, 38, BOSS.name, {
      fontFamily: 'Georgia', fontSize: '14px', color: '#ffaa22', letterSpacing: 4,
    }).setOrigin(0.5).setVisible(false);
    this.weaponText = this.add.text(16, 668, '', {
      fontFamily: 'Georgia', fontSize: '13px', color: '#c8a24a',
    });
    this.root.add([
      this.coinText, this.hudText, this.hpBar, controls, this.dockHint,
      this.minimap, this.bossBar, this.bossName, this.weaponText,
    ]);

    // H hides the whole HUD
    this.input.keyboard!.on('keydown-H', () => {
      this.root.setVisible(!this.root.visible);
    });

    // TAB opens the captain's ledger (addCapture stops the browser stealing focus)
    this.input.keyboard!.addCapture('TAB');
    this.input.keyboard!.on('keydown-TAB', () => this.toggleLedger());

    this.ledger = document.createElement('div');
    this.ledger.className = 'stats-panel';
    this.ledger.style.display = 'none';
    document.body.appendChild(this.ledger);

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => { if (this.ledgerOn) this.renderLedger(); },
    });
  }

  update(time: number): void {
    // the sun sails its own course — read the GAME scene's clock, not ours:
    // the game clock resets on restart and we'd drift out of sync with the lantern
    const sky = skyState(this.gs && this.gs.time ? this.gs.time.now : time);
    this.dayOverlay.setFillStyle(sky.color, sky.alpha);
    this.nightOverlay.setFillStyle(0x0a1030, sky.night * 0.34);

    const gs = this.gs;
    if (!gs || !gs.player || !gs.player.active) return;

    this.refreshHud(time);
    this.drawMinimap();
    this.drawBossBar();
  }

  private refreshHud(time: number): void {
    const p = this.gs.player;
    this.coinText.setText(`${p.coins}g`);
    const stars = p.notoriety > 0 ? '  ' + '★'.repeat(Math.min(p.notoriety, 10)) : '';
    const powder = p.powderUntil > time ? ` · ⚡${Math.ceil((p.powderUntil - time) / 1000)}s` : '';
    const hold = p.cargoCount();
    const cargo = hold > 0 ? ` · Hold ${hold}/${TRADE.capacity}${hold >= TRADE.huntedAt ? '⚠' : ''}` : '';
    this.hudText.setText(`Lv ${p.level} · Kills ${p.kills}${stars}${powder}${cargo}`);

    // weapon loadout — evolved weapons fly their true colors
    const parts: string[] = [];
    for (const [id, lvl] of p.weapons) {
      const evo = getEvolution(id);
      parts.push(evo && p.evolved.has(id) ? `${evo.short}★` : `${WEAPONS[id].short}${lvl}`);
    }
    this.weaponText.setText(parts.join(' · '));

    // context hint comes straight from the game scene (dock / dig / dredge)
    if (this.gs.contextHint) {
      this.dockHint.setText(this.gs.contextHint);
      this.dockHint.setVisible(true);
    } else {
      this.dockHint.setVisible(false);
    }

    const g = this.hpBar;
    g.clear();
    g.fillStyle(0x08131c, 0.8);
    g.fillRect(14, 62, 222, 12);
    const pct = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
    g.fillStyle(pct > 0.35 ? 0x58c26b : 0xd9534f, 1);
    g.fillRect(16, 64, 218 * Math.max(0, pct), 8);
  }

  private drawMinimap(): void {
    const gs = this.gs;
    const g = this.minimap;
    const S = 180;
    const ox = 1280 - S - 16;
    const oy = 16;
    const k = S / WORLD.width;

    g.clear();
    g.fillStyle(0x04141f, 0.72);
    g.fillRect(ox, oy, S, S);
    g.lineStyle(2, 0xc8a24a, 0.8);
    g.strokeRect(ox, oy, S, S);

    // the rings of risk around Port Royal
    g.lineStyle(1, 0xffd97a, 0.45);
    g.strokeCircle(ox + PORT.x * k, oy + PORT.y * k, BIOMES.shallowsR * k);
    g.lineStyle(1, 0x6a8aa8, 0.35);
    g.strokeCircle(ox + PORT.x * k, oy + PORT.y * k, BIOMES.stormInnerR * k);
    g.strokeCircle(ox + PORT.x * k, oy + PORT.y * k, BIOMES.stormOuterR * k);

    // pools of mist on the chart
    for (const b of getFogBanks()) {
      g.fillStyle(0xcfd8e0, 0.3);
      g.fillCircle(ox + b.x * k, oy + b.y * k, Math.max(2, b.r * k));
    }

    for (const w of gs.whirlpools) {
      g.fillStyle(0x9a6adf, 0.9);
      g.fillCircle(ox + w.x * k, oy + w.y * k, 3);
    }

    // winchman's eye — or a tavern rumor — sniffs out sunken treasure on the chart
    if (gs.player.winchLevel >= 2 || gs.time.now < gs.glintsRevealedUntil) {
      g.fillStyle(0xfff6c8, 0.9);
      for (const gl of gs.glints) {
        g.fillCircle(ox + gl.x * k, oy + gl.y * k, 1.8);
      }
    }

    for (const isl of gs.islands) {
      g.fillStyle(isl.treasure && !isl.plundered ? 0xffd97a : 0x4a8a5a, 0.95);
      g.fillCircle(ox + isl.x * k, oy + isl.y * k, isl.treasure && !isl.plundered ? 3.5 : 2.5);
    }

    // every port of call, in its faction's colors
    for (const p of PORTS) {
      const pc = p.faction === 'navy' ? 0xc8a24a : p.faction === 'merchant' ? 0x9fc6de : p.faction === 'pirate' ? 0xd97070 : 0x8ad98a;
      g.fillStyle(pc, 1);
      g.fillRect(ox + p.x * k - 3, oy + p.y * k - 3, 6, 6);
    }

    // sea events: moments drifting on the tide
    for (const ev of gs.seaEvents) {
      const color = ev.kind === 'distress' ? 0xffffff
        : ev.kind === 'cache' ? 0xffd97a
        : ev.kind === 'whale' ? 0x9fd6ff : 0x9a9a9a;
      g.fillStyle(color, 0.9);
      g.fillCircle(ox + ev.x * k, oy + ev.y * k, ev.kind === 'whale' ? 3 : 2.2);
    }

    for (const e of gs.enemies.getChildren() as EnemyShip[]) {
      if (!e.active || e.sinking) continue;
      const isBoss = e.kind === 'manowar';
      const color = isBoss ? 0xffaa22
        : e.prize ? 0xffe94a // a fat prize galleon gleams on the chart
        : e.kind === 'merchant' ? 0xd8c9a8
        : e.kind === 'fireship' ? 0xff7a2a
        : e.kind === 'frigate' ? 0xffd97a
        : e.surrendered ? 0xffffff
        : e.aggroed ? 0xff5544 : 0x6a8aa8;
      g.fillStyle(color, 0.95);
      g.fillCircle(ox + e.x * k, oy + e.y * k, isBoss ? 4 : e.kind === 'brig' || e.kind === 'frigate' ? 2.8 : 2);
    }

    const px = ox + gs.player.x * k;
    const py = oy + gs.player.y * k;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(px, py, 3);
    g.lineStyle(1.5, 0xffffff, 0.9);
    g.lineBetween(px, py, px + Math.cos(gs.player.rotation) * 8, py + Math.sin(gs.player.rotation) * 8);
  }

  private drawBossBar(): void {
    const g = this.bossBar;
    g.clear();
    const boss = this.gs.boss;
    if (!boss || !boss.active || boss.sinking) {
      this.bossName.setVisible(false);
      return;
    }
    const w = 480;
    const h = 14;
    const x = (1280 - w) / 2;
    const y = 16;
    g.fillStyle(0x08131c, 0.85);
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    const pct = Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1);
    g.fillStyle(boss.enraged ? 0xff4433 : 0xc23a2e, 1);
    g.fillRect(x, y, w * pct, h);
    this.bossName.setVisible(true);
  }

  // ---------- captain's ledger ----------

  private toggleLedger(): void {
    this.ledgerOn = !this.ledgerOn;
    this.ledger.style.display = this.ledgerOn ? 'block' : 'none';
    if (this.ledgerOn) this.renderLedger();
  }

  private renderLedger(): void {
    const gs = this.gs;
    if (!gs.player) return;
    const p = gs.player;
    const m = p.mods;
    const L = gs.shopLevels;

    const row = (label: string, value: string): string =>
      `<div class="ledger-row"><span>${label}</span><span>${value}</span></div>`;

    const weaponRows: string[] = [];
    for (const [id, lvl] of p.weapons) {
      const evo = getEvolution(id);
      if (evo && p.evolved.has(id)) weaponRows.push(row(evo.name, 'EVOLVED ★'));
      else weaponRows.push(row(WEAPONS[id].name, `Lv ${lvl}`));
    }

    const refits: string[] = [];
    if (m.damageMul !== 1) refits.push(row('Cannon damage', `×${m.damageMul.toFixed(2)}`));
    if (m.fireRateMul !== 1) refits.push(row('Fire rate', `×${m.fireRateMul.toFixed(2)}`));
    if (m.speedMul !== 1) refits.push(row('Speed', `×${m.speedMul.toFixed(2)}`));
    if (m.magnetMul !== 1) refits.push(row('Loot magnet', `×${m.magnetMul.toFixed(2)}`));
    if (m.accuracyMul !== 1) refits.push(row('Accuracy', `×${m.accuracyMul.toFixed(2)}`));
    if (m.rangeMul !== 1) refits.push(row('Range', `×${m.rangeMul.toFixed(2)}`));
    if (m.maxHpBonus > 0) refits.push(row('Hull bonus', `+${m.maxHpBonus} max HP`));
    if (m.chainShot) refits.push(row('Chain shot', 'hits slow ships'));
    if (p.winchLevel > 0) refits.push(row('Salvage winch', `Lv ${p.winchLevel}`));
    const hold = p.cargoCount();
    if (hold > 0) {
      const manifest = Object.entries(TRADE.goods)
        .filter(([gid]) => (p.cargo[gid] ?? 0) > 0)
        .map(([gid, g]) => `${g.name} ×${p.cargo[gid]}`)
        .join(' · ');
      refits.push(row(`Cargo hold (${hold}/${TRADE.capacity})`, manifest));
      if (hold >= TRADE.huntedAt) refits.push(row('⚠', 'the hold is fat — hunters smell profit'));
    }
    if (L.damage + L.rate + L.hull + L.speed + L.accuracy > 0) {
      refits.push(row('Port refits', `DMG${L.damage} · ROF${L.rate} · HULL${L.hull} · SAIL${L.speed} · ACC${L.accuracy}`));
    }

    this.ledger.innerHTML = `
      <h3>CAPTAIN'S LEDGER</h3>
      ${row('Purse', `<span class="coins">${p.coins}g</span>`)}
      ${row('Level', `${p.level}`)}
      ${row('Ships sunk', `${p.kills}`)}
      ${row('Notoriety', p.notoriety > 0 ? '★'.repeat(Math.min(p.notoriety, 10)) : '—')}
      <div class="ledger-sec">ARMAMENT</div>
      ${weaponRows.join('')}
      ${refits.length > 0 ? `<div class="ledger-sec">REFITS &amp; CREW</div>${refits.join('')}` : ''}
      <div class="hint">TAB to close</div>`;
  }
}
