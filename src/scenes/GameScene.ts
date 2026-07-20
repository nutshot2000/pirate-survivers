import Phaser from 'phaser';
import { WORLD, PLAYER, ENEMY, PORT, PORTS, PortDef, RUMOR, TRADE, ENCOUNTER, ISLANDS, WINCH, FLOTSAM, BOSS, EVOLUTION, FIRESHIP, BRIG, FRIGATE, EVENTS, BIOMES, killsToNextLevel } from '../config';
import { recordRun } from '../systems/save';
import { biomeAt, setFogBanks, FogBank } from '../systems/biomes';
import { generateTextures } from '../textures';
import { PlayerShip } from '../objects/PlayerShip';
import { EnemyShip, EnemyKind } from '../objects/EnemyShip';
import { BossShip } from '../objects/BossShip';
import { drawCards, getEvolution } from '../systems/cards';
import { WEAPONS, WeaponId } from '../systems/weapons';
import { showOverlay, closeAllOverlays } from '../ui/overlays';
import { sfx } from '../systems/sfx';
import { skyState } from '../systems/sky';

type LootKind = 'coins' | 'rum' | 'powder' | 'relic';

export interface IslandSpot {
  x: number;
  y: number;
  r: number;
  treasure: boolean;
  plundered: boolean;
  marker: Phaser.GameObjects.Text | null;
}

export interface Whirlpool {
  x: number;
  y: number;
  r: number;
  img: Phaser.GameObjects.Image;
}

export interface Glint {
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  progress: number; // seconds spent dredging
}

interface BarrelZone {
  x: number;
  y: number;
  radius: number;
  damage: number;
  until: number;
  emberAt: number;
  img: Phaser.GameObjects.Image;
}

export type SeaEventKind = 'distress' | 'coffin' | 'whale' | 'cache';

export interface SeaEvent {
  kind: SeaEventKind;
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text | null;
  until: number; // despawn time (scene time ms)
  driftA: number; // lazy drift heading (coffins & caches ride the tide)
  guarded: boolean; // cache: guards lurk nearby
  guardsSpawned: boolean;
  spoutAt: number; // whale: next spout time
  whaleUntil: number; // whale: when she swims off
  glintDone: boolean; // whale: already flushed a treasure up
}

export class GameScene extends Phaser.Scene {
  // public: the UI scene reads these every frame
  player!: PlayerShip;
  enemies!: Phaser.Physics.Arcade.Group;
  islands: IslandSpot[] = [];
  whirlpools: Whirlpool[] = [];
  glints: Glint[] = [];
  seaEvents: SeaEvent[] = [];
  boss: BossShip | null = null;
  overlayOpen = false;
  shopLevels = { damage: 0, rate: 0, hull: 0, speed: 0, accuracy: 0 };
  contextHint = ''; // dock/dig/dredge prompt, rendered by the UI scene
  glintsRevealedUntil = 0; // tavern rumor: glints on the chart (scene time ms)
  bossKills = 0; // Men O' War felled this voyage (for the records)

  private playerBalls!: Phaser.Physics.Arcade.Group;
  private enemyBalls!: Phaser.Physics.Arcade.Group;
  private loot!: Phaser.Physics.Arcade.Group;
  private flags = new Map<EnemyShip, Phaser.GameObjects.Text>();
  private winchReadyAt = 0;
  private nextBossAt = 0; // notoriety that wakes the next Man O' War (endless mode keeps them coming)
  private swellAt = 0;
  private lightningAt = 0;
  private weaponCd: Partial<Record<WeaponId, number>> = {};
  private barrels: BarrelZone[] = [];
  private wakeDropAt = 0; // Inferno Wake drip timer
  private harpoons!: Phaser.Physics.Arcade.Group;
  private ember!: Phaser.GameObjects.Particles.ParticleEmitter;
  private enemyBars!: Phaser.GameObjects.Graphics;
  private lantern!: Phaser.GameObjects.Image;
  private fogPuffs: { img: Phaser.GameObjects.Image; cx: number; cy: number; r: number; a: number; speed: number }[] = [];
  private clouds: { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; speed: number }[] = [];
  private waterA!: Phaser.GameObjects.TileSprite;
  private waterB!: Phaser.GameObjects.TileSprite;
  private splash!: Phaser.GameObjects.Particles.ParticleEmitter;

  private cooldownL = 0;
  private cooldownR = 0;
  private xp = 0;
  private pendingDraft = false;

  constructor() {
    super('game');
  }

  create(): void {
    closeAllOverlays();
    // the HUD lives in its own unzoomed scene — launch it alongside the world
    // (guard: on scene.restart() the UI scene is still running)
    if (!this.scene.isActive('ui')) this.scene.launch('ui');
    generateTextures(this);
    this.cooldownL = 0;
    this.cooldownR = 0;
    this.xp = 0;
    this.overlayOpen = false;
    this.pendingDraft = false;
    this.shopLevels = { damage: 0, rate: 0, hull: 0, speed: 0, accuracy: 0 };
    this.islands = [];
    this.whirlpools = [];
    this.glints = [];
    this.seaEvents = [];
    this.winchReadyAt = 0;
    this.flags = new Map();
    this.boss = null;
    this.swellAt = 0;
    this.lightningAt = 0;
    this.weaponCd = {};
    this.barrels = [];
    this.wakeDropAt = 0;
    this.contextHint = '';
    this.fogPuffs = []; // images were destroyed with the last run — drop the dead refs
    this.nextBossAt = BOSS.notorietyRequired;
    this.glintsRevealedUntil = 0;
    this.bossKills = 0;
    this.runTallied = false;

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);

    // two parallax water layers, pinned to the screen and offset by the camera
    this.waterA = this.add.tileSprite(0, 0, 1280, 720, 'water').setOrigin(0).setScrollFactor(0).setDepth(-10);
    this.waterB = this.add.tileSprite(0, 0, 1280, 720, 'water2').setOrigin(0).setScrollFactor(0).setDepth(-9).setAlpha(0.42);

    // islands (landmarks + manual collision + treasure)
    this.placeIslands();
    this.placeWhirlpools();
    this.placeGlints();
    this.placeClouds();

    // the rings of risk: golden shallows → storm belt → the deep
    this.add.image(0, 0, 'zones').setOrigin(0).setDepth(-5).setDisplaySize(WORLD.width, WORLD.height)
      .setBlendMode(Phaser.BlendModes.MULTIPLY); // grade, don't wash: keeps the water detail

    // the ports of call — each faction flies its own colors
    for (const port of PORTS) {
      this.add.image(port.x, port.y, 'port').setDepth(1).setTint(port.tint);
      this.add.text(port.x, port.y - 100, port.name, {
        fontFamily: 'Georgia', fontSize: '16px', color: '#ffd97a',
      }).setOrigin(0.5).setDepth(2);
      const ring = this.add.graphics().setDepth(1);
      ring.lineStyle(2, 0xc8a24a, 0.35);
      ring.strokeCircle(port.x, port.y, PORT.dockRadius);
    }

    // the player
    this.player = new PlayerShip(this, WORLD.width / 2, 2500);
    this.player.setDepth(10);
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setZoom(1.12); // slightly tighter framing — weightier ships

    // groups
    this.enemies = this.physics.add.group();
    this.playerBalls = this.physics.add.group();
    this.enemyBalls = this.physics.add.group();
    this.loot = this.physics.add.group();
    this.harpoons = this.physics.add.group();

    // fog banks + the hulls lurking in them (needs the enemies group)
    this.placeFogBanks();

    // wake trailing the ship
    this.add.particles(0, 0, 'foam', {
      follow: this.player,
      lifespan: 1100,
      speed: { min: 2, max: 16 },
      scale: { start: 1.15, end: 0 },
      alpha: { start: 0.18, end: 0 },
      frequency: 45,
      blendMode: 'ADD',
    }).setDepth(5);

    // reusable splash emitter for cannon hits and muzzle smoke
    this.splash = this.add.particles(0, 0, 'foam', {
      lifespan: 500,
      speed: { min: 20, max: 90 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.6, end: 0 },
      emitting: false,
      blendMode: 'ADD',
    });
    this.splash.setDepth(20);

    // fire particles for barrels and mortar blasts
    this.ember = this.add.particles(0, 0, 'ember', {
      lifespan: 650,
      speed: { min: 5, max: 30 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.8, end: 0 },
      emitting: false,
      blendMode: 'ADD',
    });
    this.ember.setDepth(13);

    // collisions
    this.physics.add.overlap(this.playerBalls, this.enemies, (b, e) =>
      this.hitEnemy(b as Phaser.Physics.Arcade.Image, e as EnemyShip));
    this.physics.add.overlap(this.enemyBalls, this.player, (_p, b) =>
      this.hitPlayer(b as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.loot, this.player, (_p, l) =>
      this.collectLoot(l as Phaser.Physics.Arcade.Image));
    this.physics.add.collider(this.player, this.enemies, (_p, e) => this.ram(e as EnemyShip));
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.harpoons, this.enemies, (h, e) =>
      this.hitEnemyHarpoon(h as Phaser.Physics.Arcade.Image, e as EnemyShip));

    // enemy health bars are world-space, so they stay here (the HUD proper lives in UIScene)
    this.enemyBars = this.add.graphics().setDepth(15);

    // a lantern for the dark — the sky washes themselves live in the UI scene
    this.lantern = this.add.image(this.player.x, this.player.y, 'light')
      .setDepth(21).setScale(4.5).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

    // audio unlocks on first input (browser rule)
    this.input.keyboard!.on('keydown', () => sfx.init());
    this.input.on('pointerdown', () => sfx.init());

    // ESC drops anchor; switching away from the tab drops it for you
    this.input.keyboard!.on('keydown-ESC', () => this.pauseGame());
    const onBlur = (): void => this.pauseGame();
    this.game.events.on('blur', onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off('blur', onBlur));

    this.input.keyboard!.on('keydown-E', () => {
      if (this.overlayOpen) return;
      const port = this.nearPort();
      if (port) {
        this.openShop(port);
        return;
      }
      const t = this.nearTreasure();
      if (t) this.plunderIsland(t);
    });

    // a living sea: steady trickle of ships, a few nearby to start
    this.time.addEvent({ delay: ENCOUNTER.spawnIntervalMs, loop: true, callback: () => this.maintainEnemies() });
    this.time.addEvent({ delay: FLOTSAM.intervalMs, loop: true, callback: () => this.spawnFlotsam() });
    this.time.delayedCall(EVENTS.firstDelayMs, () => this.scheduleEvent());
    for (let i = 0; i < 4; i++) this.spawnEnemy(900, 1300);
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;

    if (this.pendingDraft && !this.overlayOpen) {
      this.pendingDraft = false;
      this.openDraft();
      return;
    }

    this.player.update(dt);
    this.collideIslands();
    this.applyWhirlpools(dt);
    this.applyStorm(time);

    // scroll the water with the camera (second layer parallaxes + drifts)
    const cam = this.cameras.main;
    this.waterA.tilePositionX = cam.scrollX;
    this.waterA.tilePositionY = cam.scrollY;
    this.waterB.tilePositionX = cam.scrollX * 0.55 + time * 0.008;
    this.waterB.tilePositionY = cam.scrollY * 0.55 + time * 0.004;

    // the sun sails its own course — the UI scene reads the same sky state
    const sky = skyState(time);
    this.lantern.setAlpha(sky.night * 0.4);
    this.lantern.setPosition(this.player.x, this.player.y);

    // clouds wander overhead, dragging their shadows on the water
    for (const c of this.clouds) {
      c.img.x += c.speed * dt;
      c.shadow.x = c.img.x + 50;
      c.shadow.y = c.img.y + 60;
      if (c.img.x > WORLD.width + 320) c.img.x = -320;
    }

    // the mist breathes — puffs slowly orbit their fog bank
    for (const p of this.fogPuffs) {
      p.a += p.speed * dt;
      p.img.setPosition(p.cx + Math.cos(p.a) * p.r, p.cy + Math.sin(p.a) * p.r);
    }

    sfx.setMood(this.player.level, this.player.notoriety);

    // ship AI + return fire + boarding + flags
    for (const e of this.enemies.getChildren() as EnemyShip[]) {
      if (!e.active) continue;
      e.update(dt, this.player);

      if (e.surrendered) {
        const sd = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
        if (!e.sinking && sd < 130) {
          this.boardShip(e);
        } else if (!e.sinking && sd > 1600) {
          // left behind, she limps away over the horizon
          e.sinking = true;
          this.clearFlag(e);
          const body = e.body as Phaser.Physics.Arcade.Body;
          body.enable = false;
          this.tweens.add({ targets: e, alpha: 0, duration: 900, onComplete: () => e.destroy() });
        }
        continue;
      }

      // burning hulks smolder as they bear down on you
      if (e.kind === 'fireship' && !e.sinking && Math.random() < dt * 18) {
        this.ember.emitParticleAt(e.x + Phaser.Math.Between(-5, 5), e.y + Phaser.Math.Between(-5, 5), 1);
      }

      if ((e.kind === 'gunboat' || e.kind === 'brig') && e.aggroed && !e.sinking) {
        e.fireCooldown -= dt;
        const d = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
        if (e.fireCooldown <= 0 && d < ENEMY[e.kind].range) {
          e.fireCooldown = ENEMY[e.kind].cooldown;
          const a = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
          if (e.kind === 'brig') {
            for (const off of [-0.09, 0.09]) this.fireBall(this.enemyBalls, e.x, e.y, a + off, ENEMY.brig.damage, 260);
          } else {
            this.fireBall(this.enemyBalls, e.x, e.y, a, ENEMY.gunboat.damage, 270);
          }
        }
      }

      // elite frigate: a gold flash, then a broadside fan with a gap
      if (e.kind === 'frigate' && e.aggroed && !e.sinking) {
        if (e.volleyAt > 0) {
          if (time >= e.volleyAt) {
            e.volleyAt = 0;
            e.clearTint(); // telegraph over
            this.frigateVolley(e);
          }
        } else {
          e.fireCooldown -= dt;
          const d = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
          if (e.fireCooldown <= 0 && d < ENEMY.frigate.range) {
            e.fireCooldown = ENEMY.frigate.cooldown;
            e.volleyAt = time + FRIGATE.telegraphMs;
            e.setTintFill(0xffd97a); // the broadside warning
            sfx.harpoon(); // taut as a bowstring
          }
        }
      }
    }
    this.flags.forEach((txt, ship) => {
      if (ship.active && !ship.sinking) txt.setPosition(ship.x, ship.y - 22);
    });

    // the Man O' War: broadside fans and escort summons
    if (this.boss && this.boss.active && !this.boss.sinking) {
      const b = this.boss;
      const bd = Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y);
      if (time > b.volleyReadyAt && bd < ENEMY.manowar.range) {
        b.volleyReadyAt = time + (b.enraged ? BOSS.volleyIntervalEnraged : BOSS.volleyInterval) * 1000;
        this.bossVolley(b);
      }
      if (time > b.escortReadyAt) {
        b.escortReadyAt = time + BOSS.escortIntervalMs;
        this.spawnEscorts(b);
      }
    }

    // all owned weapons auto-fire on their own cooldowns
    this.updateWeapons(time, dt);
    this.updateBarrels(time);
    this.updateEvents(time, dt);
    this.drawEnemyBars();

    // loot magnet
    const magnetR = PLAYER.magnetRadius * this.player.mods.magnetMul;
    for (const l of this.loot.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!l.active) continue;
      const body = l.body as Phaser.Physics.Arcade.Body;
      const d = Phaser.Math.Distance.Between(l.x, l.y, this.player.x, this.player.y);
      if (d < magnetR) {
        const a = Phaser.Math.Angle.Between(l.x, l.y, this.player.x, this.player.y);
        body.setVelocity(Math.cos(a) * 250, Math.sin(a) * 250);
      } else {
        body.setVelocity(body.velocity.x * 0.94, body.velocity.y * 0.94);
      }
    }

    // sunken treasure: hover over a glint to dredge it up by hand
    let dredgeG: Glint | null = null;
    for (const g of [...this.glints]) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, g.x, g.y);
      if (d < 70) {
        dredgeG = g;
        g.progress += dt;
        if (g.progress >= WINCH.dredgeTime) this.dredgeGlint(g, false);
      } else {
        g.progress = Math.max(0, g.progress - dt * 0.5);
      }
    }

    // the winch: auto-harpoon the best prize in reach
    if (this.player.winchLevel > 0 && time > this.winchReadyAt) {
      const lvl = this.player.winchLevel - 1;
      const range = WINCH.range[lvl];
      let targetG: Glint | null = null;
      let bestD = range;
      for (const g of this.glints) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, g.x, g.y);
        if (d < bestD) {
          bestD = d;
          targetG = g;
        }
      }
      if (targetG) {
        this.winchReadyAt = time + WINCH.cooldown[lvl] * 1000;
        const g = targetG;
        this.fireHarpoon(g.x, g.y, () => {
          if (this.glints.includes(g)) this.dredgeGlint(g, true);
        });
      } else {
        // no treasure in reach? yank a far loot crate instead
        const magnetR = PLAYER.magnetRadius * this.player.mods.magnetMul;
        let targetL: Phaser.Physics.Arcade.Image | null = null;
        bestD = range;
        for (const l of this.loot.getChildren() as Phaser.Physics.Arcade.Image[]) {
          if (!l.active) continue;
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, l.x, l.y);
          if (d < bestD && d > magnetR) {
            bestD = d;
            targetL = l;
          }
        }
        if (targetL) {
          this.winchReadyAt = time + WINCH.cooldown[lvl] * 1000;
          const l = targetL;
          this.fireHarpoon(l.x, l.y, () => {
            if (l.active) {
              const a = Phaser.Math.Angle.Between(l.x, l.y, this.player.x, this.player.y);
              (l.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a) * 420, Math.sin(a) * 420);
            }
          });
        }
      }
    }

    // context hint: dock, dig, event, or dredge (rendered by the UI scene)
    const port = this.nearPort();
    const treasure = this.nearTreasure();
    const ev = this.nearEvent();
    if (port) {
      this.contextHint = `Press E to dock — ${port.name}`;
    } else if (treasure) {
      this.contextHint = 'Press E to dig for treasure';
    } else if (ev) {
      this.contextHint = ev.kind === 'distress'
        ? 'Distressed sailors ahead — approach?'
        : ev.kind === 'coffin'
          ? 'A floating coffin — sail close to pry it open'
          : "Smuggler's cache — break it open";
    } else if (dredgeG && dredgeG.progress > 0.05) {
      const pct = Math.min(100, Math.round((dredgeG.progress / WINCH.dredgeTime) * 100));
      this.contextHint = `Raising sunken treasure… ${pct}%`;
    } else {
      this.contextHint = '';
    }
  }

  // ---------- islands ----------

  private placeIslands(): void {
    const taken: { x: number; y: number }[] = [
      ...PORTS.map((p) => ({ x: p.x, y: p.y })), // every port gets its sea room
      { x: WORLD.width / 2, y: 2500 }, // player spawn
    ];

    // one guaranteed landmark visible-ish from spawn
    this.addIsland(WORLD.width / 2 + 700, 2000, taken);

    let attempts = 0;
    while (this.islands.length < ISLANDS.count && attempts < 500) {
      attempts++;
      const x = Phaser.Math.Between(300, WORLD.width - 300);
      const y = Phaser.Math.Between(300, WORLD.height - 300);
      if (!taken.every((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) > ISLANDS.minSpacing)) continue;
      this.addIsland(x, y, taken);
    }

    // guarantee the full set of treasure islands
    let tCount = this.islands.filter((i) => i.treasure).length;
    for (const isl of this.islands) {
      if (tCount >= ISLANDS.treasureCount) break;
      if (!isl.treasure) {
        isl.treasure = true;
        isl.marker = this.treasureMarker(isl.x, isl.y);
        tCount++;
      }
    }
  }

  private addIsland(x: number, y: number, taken: { x: number; y: number }[]): void {
    taken.push({ x, y });
    const variant = Phaser.Math.Between(0, 2);
    this.add.image(x, y, `island${variant}`).setDepth(1);

    const treasure = Math.random() < 0.35;
    const isl: IslandSpot = { x, y, r: 82, treasure, plundered: false, marker: null };
    if (treasure) isl.marker = this.treasureMarker(x, y);
    this.islands.push(isl);
  }

  private treasureMarker(x: number, y: number): Phaser.GameObjects.Text {
    return this.add.text(x, y, '✕', {
      fontFamily: 'Georgia', fontSize: '26px', color: '#d93a2b',
    }).setOrigin(0.5).setDepth(3);
  }

  // manual circle collision — no sailing over beaches, ever
  private collideIslands(): void {
    this.pushOutOfIslands(this.player, 16);
    for (const e of this.enemies.getChildren() as EnemyShip[]) {
      if (e.active && !e.sinking) this.pushOutOfIslands(e, 14);
    }
  }

  private pushOutOfIslands(ship: Phaser.Physics.Arcade.Sprite, pad: number): void {
    const body = ship.body as Phaser.Physics.Arcade.Body;
    for (const isl of this.islands) {
      const dx = ship.x - isl.x;
      const dy = ship.y - isl.y;
      const min = isl.r + pad;
      if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= min || d < 0.001) continue;
      const nx = dx / d;
      const ny = dy / d;
      ship.setPosition(isl.x + nx * min, isl.y + ny * min);
      const dot = body.velocity.x * nx + body.velocity.y * ny;
      if (dot < 0) {
        body.setVelocity(body.velocity.x - dot * nx, body.velocity.y - dot * ny);
      }
    }
  }

  private placeClouds(): void {
    this.clouds = [];
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(0, WORLD.width);
      const y = Phaser.Math.Between(0, WORLD.height);
      const scale = Phaser.Math.FloatBetween(1.3, 2.3);
      const img = this.add.image(x, y, 'cloud').setDepth(40).setScale(scale).setAlpha(0.3);
      const shadow = this.add.image(x + 50, y + 60, 'cloud')
        .setDepth(-8).setScale(scale * 1.1).setAlpha(0.09).setTint(0x04203a);
      this.clouds.push({ img, shadow, speed: Phaser.Math.Between(8, 18) });
    }
  }

  // fog banks: pools of mist in open water, with hulls lurking inside
  private placeFogBanks(): void {
    const banks: FogBank[] = [];
    let attempts = 0;
    while (banks.length < BIOMES.fog.count && attempts < 200) {
      attempts++;
      const x = Phaser.Math.Between(600, WORLD.width - 600);
      const y = Phaser.Math.Between(600, WORLD.height - 600);
      const r = Phaser.Math.Between(BIOMES.fog.radius[0], BIOMES.fog.radius[1]);
      if (Phaser.Math.Distance.Between(x, y, PORT.x, PORT.y) < BIOMES.shallowsR + 500) continue;
      if (!PORTS.every((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) > r + 700)) continue; // mist never swallows a harbor
      if (!this.islands.every((isl) => Phaser.Math.Distance.Between(x, y, isl.x, isl.y) > r * 0.6 + isl.r)) continue;
      if (!banks.every((b) => Phaser.Math.Distance.Between(x, y, b.x, b.y) > r + b.r + 400)) continue;
      banks.push({ x, y, r });
    }
    setFogBanks(banks);
    for (const b of banks) {
      // ground mist: soft puffs UNDER the ships, so hulls stay readable
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * b.r * 0.55;
        const img = this.add.image(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 'cloud')
          .setDepth(2)
          .setTint(0xc8d4de)
          .setAlpha(0.1 + Math.random() * 0.06)
          .setScale((b.r * Phaser.Math.FloatBetween(0.7, 1.4)) / 110)
          .setRotation(Math.random() * Math.PI * 2);
        this.fogPuffs.push({ img, cx: b.x, cy: b.y, r, a, speed: Phaser.Math.FloatBetween(0.02, 0.06) });
      }
      // two thin veils above the waves so you feel inside the mist, not under it
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * b.r * 0.3;
        const img = this.add.image(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 'cloud')
          .setDepth(25)
          .setTint(0xd4dee8)
          .setAlpha(0.07 + Math.random() * 0.04)
          .setScale((b.r * Phaser.Math.FloatBetween(1.2, 1.8)) / 110)
          .setRotation(Math.random() * Math.PI * 2);
        this.fogPuffs.push({ img, cx: b.x, cy: b.y, r, a, speed: Phaser.Math.FloatBetween(0.015, 0.04) });
      }
      for (let i = 0; i < BIOMES.fog.lurkers; i++) {
        const kind: EnemyKind = Math.random() < 0.5 ? 'sloop' : 'gunboat';
        this.enemies.add(new EnemyShip(
          this,
          b.x + Phaser.Math.Between(-b.r * 0.5, b.r * 0.5),
          b.y + Phaser.Math.Between(-b.r * 0.5, b.r * 0.5),
          kind
        ));
      }
    }
  }

  nearTreasure(): IslandSpot | null {
    for (const isl of this.islands) {
      if (!isl.treasure || isl.plundered) continue;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, isl.x, isl.y) < ISLANDS.digRadius) {
        return isl;
      }
    }
    return null;
  }

  private plunderIsland(isl: IslandSpot): void {
    isl.plundered = true;
    if (isl.marker) {
      isl.marker.destroy();
      isl.marker = null;
    }
    sfx.dig();
    const total = Phaser.Math.Between(ISLANDS.loot[0], ISLANDS.loot[1]);
    const toPlayer = Phaser.Math.Angle.Between(isl.x, isl.y, this.player.x, this.player.y);
    for (let i = 0; i < 6; i++) {
      const a = toPlayer + Phaser.Math.FloatBetween(-0.7, 0.7);
      const d = isl.r + Phaser.Math.Between(30, 110);
      this.spawnLoot(isl.x + Math.cos(a) * d, isl.y + Math.sin(a) * d, 'coins', Math.max(2, Math.round(total / 6)));
    }
    if (Math.random() < 0.5) this.spawnLoot(isl.x, isl.y - isl.r - 30, 'rum', 0);
    this.floatText(isl.x, isl.y - 60, 'TREASURE!', '#ffd97a', 26);
    if (Math.random() < ISLANDS.relicChance) this.pendingDraft = true; // dug up a relic
  }

  // ---------- sunken treasure / winch / flotsam ----------

  private placeGlints(): void {
    for (let i = 0; i < WINCH.glintCount; i++) this.addGlint();
  }

  private addGlint(atX?: number, atY?: number): void {
    // a whale-flushed treasure appears where she surfaced — no spacing rules needed
    if (atX !== undefined && atY !== undefined) {
      if (!this.islands.every((isl) => Phaser.Math.Distance.Between(atX, atY, isl.x, isl.y) > 200)) return;
      const img = this.add.image(atX, atY, 'glint').setDepth(4);
      this.tweens.add({ targets: img, alpha: 0.2, yoyo: true, repeat: -1, duration: 650 });
      this.glints.push({ x: atX, y: atY, img, progress: 0 });
      return;
    }
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = Phaser.Math.Between(250, WORLD.width - 250);
      const y = Phaser.Math.Between(250, WORLD.height - 250);
      if (Phaser.Math.Distance.Between(x, y, PORT.x, PORT.y) < 500) continue;
      if (!this.islands.every((isl) => Phaser.Math.Distance.Between(x, y, isl.x, isl.y) > 300)) continue;
      if (!this.glints.every((g) => Phaser.Math.Distance.Between(x, y, g.x, g.y) > 700)) continue;
      const img = this.add.image(x, y, 'glint').setDepth(4);
      this.tweens.add({ targets: img, alpha: 0.2, yoyo: true, repeat: -1, duration: 650, delay: Math.random() * 650 });
      this.glints.push({ x, y, img, progress: 0 });
      return;
    }
  }

  private removeGlint(g: Glint): void {
    g.img.destroy();
    this.glints = this.glints.filter((o) => o !== g);
    this.time.delayedCall(20000, () => this.addGlint()); // the sea restocks her secrets
  }

  private dredgeGlint(g: Glint, reelIn: boolean): void {
    const total = Phaser.Math.Between(WINCH.loot[0], WINCH.loot[1]);
    for (let i = 0; i < 4; i++) {
      this.spawnLoot(g.x + Phaser.Math.Between(-18, 18), g.y + Phaser.Math.Between(-18, 18), 'coins', Math.max(2, Math.round(total / 4)));
    }
    if (Math.random() < 0.25) this.spawnLoot(g.x, g.y - 16, 'relic', 0);
    else if (Math.random() < 0.4) this.spawnLoot(g.x, g.y - 16, 'rum', 0);

    // a winch yanks the whole haul straight home
    if (reelIn) {
      for (const l of this.loot.getChildren() as Phaser.Physics.Arcade.Image[]) {
        if (!l.active) continue;
        const d = Phaser.Math.Distance.Between(l.x, l.y, this.player.x, this.player.y);
        if (d < 300) {
          const a = Phaser.Math.Angle.Between(l.x, l.y, this.player.x, this.player.y);
          (l.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a) * 380, Math.sin(a) * 380);
        }
      }
    }

    this.floatText(g.x, g.y - 20, 'SUNKEN TREASURE!', '#ffd97a', 16);
    sfx.dig();
    this.removeGlint(g);
  }

  private fireHarpoon(tx: number, ty: number, onHit: () => void): void {
    sfx.harpoon();
    const line = this.add
      .line(this.player.x, this.player.y, 0, 0, tx - this.player.x, ty - this.player.y, 0xe8e8e8, 0.9)
      .setOrigin(0, 0)
      .setLineWidth(2)
      .setDepth(15);
    this.tweens.add({ targets: line, alpha: 0, duration: 300, onComplete: () => line.destroy() });
    this.time.delayedCall(240, () => {
      this.splash.emitParticleAt(tx, ty, 3);
      onHit();
    });
  }

  private spawnFlotsam(): void {
    if (this.overlayOpen) return;
    const a = Math.random() * Math.PI * 2;
    const d = Phaser.Math.Between(800, 1400);
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * d, 40, WORLD.width - 40);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * d, 40, WORLD.height - 40);
    const roll = Math.random();
    let kind: LootKind = 'coins';
    let coins = Phaser.Math.Between(3, 6);
    if (roll >= 0.95) { kind = 'relic'; coins = 0; }
    else if (roll >= 0.8) { kind = 'powder'; coins = 0; }
    else if (roll >= 0.55) { kind = 'rum'; coins = 0; }
    this.spawnLoot(x, y, kind, coins);
  }

  // ---------- sea events ----------

  private scheduleEvent(): void {
    this.rollEvent();
    this.time.delayedCall(Phaser.Math.Between(EVENTS.intervalMs[0], EVENTS.intervalMs[1]), () => this.scheduleEvent());
  }

  private rollEvent(): void {
    if (this.overlayOpen) return;
    if (this.seaEvents.length >= EVENTS.maxActive) return;
    const r = Math.random();
    const w = EVENTS.weights;
    if (r < w.distress) {
      this.spawnDistress();
    } else if (r < w.distress + w.coffin) {
      this.spawnCoffin();
    } else if (r < w.distress + w.coffin + w.cache) {
      this.spawnCache();
    } else if (this.seaEvents.some((e) => e.kind === 'whale')) {
      this.spawnCache(); // one whale at a time
    } else {
      this.spawnWhale();
    }
  }

  private eventSpot(minD: number, maxD: number): { x: number; y: number } {
    let x = this.player.x + 600;
    let y = this.player.y;
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.Between(minD, maxD);
      x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * d, 60, WORLD.width - 60);
      y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * d, 60, WORLD.height - 60);
      if (Phaser.Math.Distance.Between(x, y, PORT.x, PORT.y) < 400) continue;
      if (!this.islands.every((isl) => Phaser.Math.Distance.Between(x, y, isl.x, isl.y) > 200)) continue;
      break;
    }
    return { x, y };
  }

  private removeEvent(ev: SeaEvent, fade = false): void {
    this.seaEvents = this.seaEvents.filter((o) => o !== ev);
    const objs: Phaser.GameObjects.GameObject[] = ev.label ? [ev.img, ev.label] : [ev.img];
    if (fade) {
      this.tweens.add({ targets: objs, alpha: 0, duration: 800, onComplete: () => objs.forEach((o) => o.destroy()) });
    } else {
      objs.forEach((o) => o.destroy());
    }
  }

  private spawnDistress(): void {
    const { x, y } = this.eventSpot(700, 1100);
    const img = this.add.image(x, y, 'ship-merchant')
      .setDepth(7).setTint(0x9a9a9a).setRotation(Math.random() * Math.PI * 2);
    const label = this.add.text(x, y - 28, '⚑', {
      fontFamily: 'Georgia', fontSize: '22px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(8);
    this.seaEvents.push({
      kind: 'distress', x, y, img, label,
      until: this.time.now + EVENTS.despawnMs,
      driftA: 0, guarded: false, guardsSpawned: false,
      spoutAt: 0, whaleUntil: 0, glintDone: false,
    });
    this.floatText(this.player.x, this.player.y - 52, 'A DISTRESS CALL ON THE WIND…', '#ffffff', 14);
  }

  private spawnCoffin(): void {
    const { x, y } = this.eventSpot(500, 900);
    const img = this.add.image(x, y, 'coffin').setDepth(7).setRotation(Math.random() * Math.PI * 2);
    this.seaEvents.push({
      kind: 'coffin', x, y, img, label: null,
      until: this.time.now + EVENTS.despawnMs,
      driftA: Math.random() * Math.PI * 2, guarded: false, guardsSpawned: false,
      spoutAt: 0, whaleUntil: 0, glintDone: false,
    });
    this.floatText(this.player.x, this.player.y - 52, 'SOMETHING DRIFTS ON THE TIDE…', '#9db8cc', 13);
  }

  private spawnCache(): void {
    const { x, y } = this.eventSpot(600, 1000);
    const img = this.add.image(x, y, 'cache').setDepth(7);
    this.seaEvents.push({
      kind: 'cache', x, y, img, label: null,
      until: this.time.now + EVENTS.despawnMs,
      driftA: Math.random() * Math.PI * 2,
      guarded: Math.random() < EVENTS.cache.guardedChance, guardsSpawned: false,
      spoutAt: 0, whaleUntil: 0, glintDone: false,
    });
    this.floatText(this.player.x, this.player.y - 52, "WORD OF A SMUGGLER'S CACHE…", '#ffd97a', 13);
  }

  private spawnWhale(): void {
    const { x, y } = this.eventSpot(500, 800);
    const img = this.add.image(x, y, 'whale').setDepth(4).setAlpha(0.85);
    const whaleUntil = this.time.now + EVENTS.whale.followMs;
    this.seaEvents.push({
      kind: 'whale', x, y, img, label: null,
      until: whaleUntil + 9000,
      driftA: 0, guarded: false, guardsSpawned: false,
      spoutAt: this.time.now + 2500, whaleUntil, glintDone: false,
    });
    this.floatText(this.player.x, this.player.y - 52, 'A WHALE SHADOWS YOUR WAKE', '#9fd6ff', 14);
  }

  private updateEvents(time: number, dt: number): void {
    for (let i = this.seaEvents.length - 1; i >= 0; i--) {
      const ev = this.seaEvents[i];
      const pd = Phaser.Math.Distance.Between(ev.x, ev.y, this.player.x, this.player.y);

      // coffins and caches ride the tide
      if (ev.kind === 'coffin' || ev.kind === 'cache') {
        ev.x += Math.cos(ev.driftA) * 8 * dt;
        ev.y += Math.sin(ev.driftA) * 8 * dt;
        ev.img.setPosition(ev.x, ev.y);
        ev.img.rotation += dt * 0.05;
      }

      if (ev.kind === 'whale') this.updateWhale(ev, time, dt);

      // guards spring when you close on a marked cache
      if (ev.kind === 'cache' && ev.guarded && !ev.guardsSpawned && pd < EVENTS.cache.guardRange) {
        ev.guardsSpawned = true;
        this.floatText(ev.x, ev.y - 30, 'GUARDS!', '#ff5544', 16);
        for (let g = 0; g < 2; g++) {
          const s = new EnemyShip(this, ev.x + Phaser.Math.Between(-80, 80), ev.y + Phaser.Math.Between(-80, 80), 'sloop');
          s.aggroed = true;
          this.enemies.add(s);
        }
      }

      // answering the call is always a choice — proximity resolves
      if (ev.kind === 'coffin' && pd < EVENTS.coffin.approach) {
        this.openCoffin(ev);
        continue;
      }
      if (ev.kind === 'cache' && pd < EVENTS.cache.approach) {
        this.openCache(ev);
        continue;
      }
      if (ev.kind === 'distress' && pd < EVENTS.distress.approach) {
        this.resolveDistress(ev);
        continue;
      }

      // ignored events are lost to the sea
      if (time > ev.until) this.removeEvent(ev, true);
    }
  }

  private updateWhale(ev: SeaEvent, time: number, dt: number): void {
    const d = Phaser.Math.Distance.Between(ev.x, ev.y, this.player.x, this.player.y);
    const toPlayer = Phaser.Math.Angle.Between(ev.x, ev.y, this.player.x, this.player.y);
    let heading: number;
    let speed = EVENTS.whale.speed;
    if (time > ev.whaleUntil) {
      heading = toPlayer + Math.PI; // she's done with you — swimming off
      speed *= 1.4;
      ev.img.setAlpha(Math.max(0, ev.img.alpha - dt * 0.22));
    } else if (d > EVENTS.whale.distance) {
      heading = toPlayer;
    } else {
      heading = toPlayer + Math.PI / 2; // cruise alongside, off your beam
      speed *= 0.6;
    }
    ev.x += Math.cos(heading) * speed * dt;
    ev.y += Math.sin(heading) * speed * dt;
    ev.img.setPosition(ev.x, ev.y);
    ev.img.setRotation(heading);

    if (time > ev.spoutAt && time <= ev.whaleUntil) {
      ev.spoutAt = time + EVENTS.whale.spoutMs + Math.random() * 2000;
      this.splash.emitParticleAt(ev.x + Math.cos(heading) * 20, ev.y + Math.sin(heading) * 20, 6);
      sfx.splashSmall();
      // sometimes she flushes something glittering up from the bottom
      if (!ev.glintDone && Math.random() < EVENTS.whale.glintChance) {
        ev.glintDone = true;
        this.addGlint(ev.x + Phaser.Math.Between(-40, 40), ev.y + Phaser.Math.Between(-40, 40));
        this.floatText(ev.x, ev.y - 30, 'THE WHALE FLUSHES SOMETHING UP!', '#ffd97a', 14);
      }
    }
  }

  private resolveDistress(ev: SeaEvent): void {
    this.removeEvent(ev);
    const n = this.player.notoriety;
    const trapChance = Math.min(
      EVENTS.distress.trapChance + n * EVENTS.distress.trapPerStar,
      EVENTS.distress.trapMax
    );
    if (Math.random() < trapChance) {
      // a decoy — the navy springs its trap
      this.floatText(ev.x, ev.y - 40, 'AMBUSH!', '#ff5544', 22);
      sfx.bossHorn();
      const decoy = new EnemyShip(this, ev.x, ev.y, 'gunboat', true);
      this.enemies.add(decoy);
      // the trap scales with your infamy — the navy learns what it takes
      const wingman = new EnemyShip(this, ev.x + 70, ev.y + 50, n >= 4 ? 'brig' : 'gunboat');
      wingman.aggroed = true;
      this.enemies.add(wingman);
      if (n >= 2) {
        const powder = new EnemyShip(this, ev.x - 70, ev.y + 50, 'fireship');
        powder.aggroed = true;
        this.enemies.add(powder);
      }
    } else {
      // grateful sailors share what little they have
      const total = Phaser.Math.Between(EVENTS.distress.loot[0], EVENTS.distress.loot[1]);
      for (let i = 0; i < 4; i++) {
        this.spawnLoot(ev.x + Phaser.Math.Between(-24, 24), ev.y + Phaser.Math.Between(-24, 24), 'coins', Math.max(2, Math.round(total / 4)));
      }
      if (Math.random() < 0.5) this.spawnLoot(ev.x, ev.y - 20, 'rum', 0);
      this.floatText(ev.x, ev.y - 40, 'GRATEFUL SAILORS', '#7be07b', 16);
      sfx.dig();
    }
  }

  private openCoffin(ev: SeaEvent): void {
    this.removeEvent(ev);
    sfx.dig();
    const c = EVENTS.coffin;
    const r = Math.random();
    if (r < c.coinChance) {
      const total = Phaser.Math.Between(c.loot[0], c.loot[1]);
      for (let i = 0; i < 3; i++) {
        this.spawnLoot(ev.x + Phaser.Math.Between(-18, 18), ev.y + Phaser.Math.Between(-18, 18), 'coins', Math.max(2, Math.round(total / 3)));
      }
      this.floatText(ev.x, ev.y - 24, 'BURIAL COINS', '#ffd97a', 14);
    } else if (r < c.coinChance + c.rumChance) {
      this.spawnLoot(ev.x, ev.y - 16, 'rum', 0);
      this.floatText(ev.x, ev.y - 24, 'RUM FOR THE ROAD', '#7be07b', 14);
    } else if (r < c.coinChance + c.rumChance + c.curseChance) {
      this.cameras.main.shake(220, 0.006);
      this.floatText(ev.x, ev.y - 24, 'THE DEAD RESENT YOU', '#c89aff', 16);
      this.damagePlayer(c.curseDamage);
    } else {
      this.floatText(ev.x, ev.y - 24, 'NOTHING BUT BONES', '#9db8cc', 13);
    }
  }

  private openCache(ev: SeaEvent): void {
    this.removeEvent(ev);
    sfx.dig();
    const total = Phaser.Math.Between(EVENTS.cache.loot[0], EVENTS.cache.loot[1]);
    for (let i = 0; i < 4; i++) {
      this.spawnLoot(ev.x + Phaser.Math.Between(-22, 22), ev.y + Phaser.Math.Between(-22, 22), 'coins', Math.max(2, Math.round(total / 4)));
    }
    if (Math.random() < 0.6) this.spawnLoot(ev.x, ev.y - 18, 'powder', 0);
    if (Math.random() < 0.3) this.spawnLoot(ev.x + 16, ev.y + 12, 'relic', 0);
    this.floatText(ev.x, ev.y - 26, "SMUGGLER'S CACHE!", '#ffd97a', 18);
  }

  private nearEvent(): SeaEvent | null {
    let best: SeaEvent | null = null;
    let bestD = 260;
    for (const ev of this.seaEvents) {
      if (ev.kind === 'whale') continue;
      const d = Phaser.Math.Distance.Between(ev.x, ev.y, this.player.x, this.player.y);
      if (d < bestD) {
        bestD = d;
        best = ev;
      }
    }
    return best;
  }

  // ---------- the storm belt ----------

  private applyStorm(time: number): void {
    if (biomeAt(this.player.x, this.player.y) !== 'storm') return;

    // a swell shoves every hull in the belt
    if (time > this.swellAt) {
      this.swellAt = time + BIOMES.storm.swellEveryMs;
      const a = Math.random() * Math.PI * 2;
      const push = (ship: PlayerShip | EnemyShip): void => {
        if (biomeAt(ship.x, ship.y) !== 'storm') return;
        const body = ship.body as Phaser.Physics.Arcade.Body;
        body.velocity.x += Math.cos(a) * BIOMES.storm.swellForce;
        body.velocity.y += Math.sin(a) * BIOMES.storm.swellForce;
      };
      push(this.player);
      for (const e of this.enemies.getChildren() as EnemyShip[]) {
        if (e.active && !e.sinking) push(e);
      }
      this.cameras.main.shake(150, 0.002);
    }

    // lightning — flash first, thunder rolls in behind
    if (time > this.lightningAt) {
      this.lightningAt = time + Phaser.Math.Between(BIOMES.storm.lightningMinMs, BIOMES.storm.lightningMaxMs);
      this.cameras.main.flash(140, 235, 245, 255);
      this.time.delayedCall(Phaser.Math.Between(500, 1100), () => sfx.explosion());
    }

    // rain-lashed spray
    this.splash.emitParticleAt(
      this.player.x + Phaser.Math.Between(-420, 420),
      this.player.y + Phaser.Math.Between(-320, 320),
      1
    );
  }

  // ---------- whirlpools ----------

  private placeWhirlpools(): void {
    let attempts = 0;
    while (this.whirlpools.length < 4 && attempts < 300) {
      attempts++;
      const x = Phaser.Math.Between(400, WORLD.width - 400);
      const y = Phaser.Math.Between(400, WORLD.height - 400);
      if (!PORTS.every((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) > 900)) continue;
      if (Phaser.Math.Distance.Between(x, y, WORLD.width / 2, 2500) < 900) continue;
      if (!this.islands.every((i) => Phaser.Math.Distance.Between(x, y, i.x, i.y) > 500)) continue;
      if (!this.whirlpools.every((w) => Phaser.Math.Distance.Between(x, y, w.x, w.y) > 900)) continue;
      const img = this.add.image(x, y, 'whirlpool').setDepth(0).setAlpha(0.85);
      this.whirlpools.push({ x, y, r: 260, img });
    }
  }

  private applyWhirlpools(dt: number): void {
    for (const w of this.whirlpools) {
      w.img.rotation += dt * 1.4;
      this.whirlPull(this.player, w, dt);
      for (const e of this.enemies.getChildren() as EnemyShip[]) {
        if (e.active && !e.sinking) this.whirlPull(e, w, dt);
      }
    }
  }

  private whirlPull(ship: PlayerShip | EnemyShip, w: Whirlpool, dt: number): void {
    if (ship instanceof EnemyShip && ship.kind === 'manowar') return; // too big to swallow
    const body = ship.body as Phaser.Physics.Arcade.Body;
    const d = Phaser.Math.Distance.Between(ship.x, ship.y, w.x, w.y);
    if (d > w.r) return;
    const a = Phaser.Math.Angle.Between(ship.x, ship.y, w.x, w.y);
    const pull = 40 + (1 - d / w.r) * 150;
    body.velocity.x += Math.cos(a) * pull * dt;
    body.velocity.y += Math.sin(a) * pull * dt;

    // the core chews ships up
    if (d < 45 && this.time.now > ship.whirlReadyAt) {
      ship.whirlReadyAt = this.time.now + 700;
      if (ship instanceof PlayerShip) {
        this.damagePlayer(3);
      } else {
        ship.hp -= 3;
        this.splash.emitParticleAt(ship.x, ship.y, 3);
        if (ship.hp <= 0) this.sinkEnemy(ship);
      }
    }
  }

  // ---------- loot ----------

  private spawnLoot(x: number, y: number, kind: LootKind, coins: number): void {
    const key = kind === 'coins' ? 'loot' : `loot-${kind}`;
    const l = this.loot.create(x, y, key) as Phaser.Physics.Arcade.Image;
    l.setDepth(8);
    l.setData('kind', kind);
    l.setData('coins', coins);
    // the sea reclaims mundane cargo in 30s — but a relic waits for its captain
    if (kind !== 'relic') this.time.delayedCall(30000, () => { if (l.active) l.destroy(); });
  }

  private collectLoot(l: Phaser.Physics.Arcade.Image): void {
    if (!l.active) return;
    const kind = l.getData('kind') as LootKind;
    const coins = l.getData('coins') as number; // read BEFORE destroy wipes the data
    l.destroy();
    switch (kind) {
      case 'rum': {
        // rum patches what ails you — scales with the size of your hull
        const heal = Math.max(8, Math.round(this.player.maxHp * 0.12));
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        this.floatText(this.player.x, this.player.y - 24, `+${heal} HP`, '#7be07b');
        sfx.rum();
        break;
      }
      case 'powder':
        this.player.powderUntil = this.time.now + 12000;
        this.floatText(this.player.x, this.player.y - 24, 'POWDER! faster guns', '#ffb04a');
        sfx.buff();
        break;
      case 'relic':
        this.pendingDraft = true;
        this.floatText(this.player.x, this.player.y - 24, 'RELIC!', '#c89aff', 18);
        sfx.levelup();
        break;
      default: {
        // the deep pays half again — if you dare collect it
        const bonus = biomeAt(this.player.x, this.player.y) === 'deep' ? BIOMES.deepLootMul : 1;
        const c = Math.round(coins * bonus);
        this.player.coins += c;
        this.floatText(this.player.x, this.player.y - 24, `+${c}g`, '#ffd97a');
        sfx.coin();
      }
    }
  }

  // ---------- combat / weapons ----------

  private updateWeapons(time: number, dt: number): void {
    const powder = time < this.player.powderUntil ? 1.25 : 1;
    const rateMul = this.player.mods.fireRateMul * powder;

    for (const [id, lvl] of this.player.weapons) {
      const def = WEAPONS[id];
      const ready = (key: WeaponId): boolean => time >= (this.weaponCd[key] ?? 0);
      const setCd = (key: WeaponId): void => {
        this.weaponCd[key] = time + (def.cooldown[lvl - 1] / rateMul) * 1000;
      };

      switch (id) {
        case 'broadsides': {
          this.cooldownL -= dt;
          this.cooldownR -= dt;
          // Devastator Barrage: the guns take longer to ready for a triple volley
          const cd = (def.cooldown[lvl - 1] / rateMul)
            * (this.player.evolved.has('broadsides') ? EVOLUTION.broadsides.cooldownMul : 1);
          if (this.cooldownL <= 0 && this.findTargetInArc(-1)) {
            this.cooldownL = cd;
            this.fireBroadside(-1, lvl);
          }
          if (this.cooldownR <= 0 && this.findTargetInArc(1)) {
            this.cooldownR = cd;
            this.fireBroadside(1, lvl);
          }
          break;
        }
        case 'barrels': {
          if (ready(id)) {
            setCd(id);
            this.dropBarrel(lvl);
          }
          if (this.player.evolved.has('barrels')) this.layInfernoWake(time, lvl);
          break;
        }
        case 'mortar': {
          if (ready(id)) {
            const target = this.nearestEnemy(560);
            if (target) {
              setCd(id);
              this.fireMortar(target, lvl);
            }
          }
          break;
        }
        case 'harpoon': {
          if (ready(id)) {
            const target = this.findTargetBearing(this.player.rotation, 0.45, 520);
            if (target) {
              setCd(id);
              this.fireBallista(lvl);
            }
          }
          break;
        }
        case 'swivel': {
          if (ready(id)) {
            // Wasp Nest: guns sweep every direction; otherwise stern-only
            const target = this.player.evolved.has('swivel')
              ? this.nearestEnemy(EVOLUTION.swivel.range)
              : this.findTargetBearing(this.player.rotation + Math.PI, 0.5, 420);
            if (target) {
              setCd(id);
              this.fireSwivel(lvl, target);
            }
          }
          break;
        }
        case 'ramprow':
          break; // passive — handled in ram()
      }
    }
  }

  private findTargetInArc(side: -1 | 1): EnemyShip | null {
    return this.findTargetBearing(
      this.player.rotation + (side < 0 ? -Math.PI / 2 : Math.PI / 2),
      0.78,
      PLAYER.cannonRange * this.player.mods.rangeMul
    );
  }

  private findTargetBearing(centerAngle: number, halfArc: number, range: number): EnemyShip | null {
    let best: EnemyShip | null = null;
    let bestD = range;
    for (const e of this.enemies.getChildren() as EnemyShip[]) {
      if (!e.active || e.sinking || e.surrendered) continue; // beaten ships are spared the guns
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d > bestD) continue;
      const bearing = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
      const rel = Phaser.Math.Angle.Wrap(bearing - centerAngle);
      if (rel > -halfArc && rel < halfArc) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  private nearestEnemy(range: number): EnemyShip | null {
    let best: EnemyShip | null = null;
    let bestD = range;
    for (const e of this.enemies.getChildren() as EnemyShip[]) {
      if (!e.active || e.sinking || e.surrendered) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  private fireBroadside(side: -1 | 1, lvl: number): void {
    if (!this.player.evolved.has('broadsides')) {
      this.fireBroadsideVolley(side, lvl, 1);
      return;
    }
    // Devastator Barrage: one trigger pull, a rolling thunder of volleys
    for (let v = 0; v < EVOLUTION.broadsides.volleys; v++) {
      this.time.delayedCall(EVOLUTION.broadsides.volleyGapMs * v, () => {
        if (this.player.active) this.fireBroadsideVolley(side, lvl, EVOLUTION.broadsides.dmgMul);
      });
    }
  }

  private fireBroadsideVolley(side: -1 | 1, lvl: number, dmgMul: number): void {
    const m = this.player.mods;
    const def = WEAPONS.broadsides;
    const base = this.player.rotation + (side < 0 ? -Math.PI / 2 : Math.PI / 2);
    const spreadMul = 1 / m.accuracyMul; // deadeye gunners tighten the fan
    const ballSpeed = PLAYER.cannonballSpeed * (1 + (m.accuracyMul - 1) * 0.4);
    const dmg = def.damage[lvl - 1] * m.damageMul * dmgMul;
    for (let i = 0; i < lvl; i++) {
      const spread = (i - (lvl - 1) / 2) * 0.1 * spreadMul + Phaser.Math.FloatBetween(-0.03, 0.03) * spreadMul;
      this.fireBall(
        this.playerBalls,
        this.player.x + Math.cos(base) * 14,
        this.player.y + Math.sin(base) * 14,
        base + spread,
        dmg,
        ballSpeed
      );
    }
    this.splash.emitParticleAt(this.player.x + Math.cos(base) * 18, this.player.y + Math.sin(base) * 18, 3);
    this.ember.emitParticleAt(this.player.x + Math.cos(base) * 16, this.player.y + Math.sin(base) * 16, 2);
    sfx.cannon();

    // the guns kick — feel the mass of a broadside
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.velocity.x -= Math.cos(base) * 12 * dmgMul;
    body.velocity.y -= Math.sin(base) * 12 * dmgMul;
  }

  private dropBarrel(lvl: number): void {
    const def = WEAPONS.barrels;
    const evo = this.player.evolved.has('barrels');
    const sternX = this.player.x - Math.cos(this.player.rotation) * 22;
    const sternY = this.player.y - Math.sin(this.player.rotation) * 22;
    const img = this.add.image(sternX, sternY, 'barrel').setDepth(7);
    this.splash.emitParticleAt(sternX, sternY, 2);
    sfx.splashSmall();
    this.barrels.push({
      x: sternX,
      y: sternY,
      radius: def.radius![lvl - 1] * (evo ? EVOLUTION.barrels.radiusMul : 1),
      damage: def.damage[lvl - 1] * this.player.mods.damageMul * (evo ? EVOLUTION.barrels.dmgMul : 1),
      until: this.time.now + 7000,
      emberAt: 0,
      img,
    });
  }

  // Inferno Wake: at speed, the sea itself catches fire astern
  private layInfernoWake(time: number, lvl: number): void {
    if (time < this.wakeDropAt) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const maxSpeed = PLAYER.maxSpeed * this.player.mods.speedMul;
    if (body.velocity.length() < maxSpeed * EVOLUTION.barrels.wakeMinSpeed) return;
    this.wakeDropAt = time + EVOLUTION.barrels.wakeEveryMs;
    const def = WEAPONS.barrels;
    const sternX = this.player.x - Math.cos(this.player.rotation) * 24;
    const sternY = this.player.y - Math.sin(this.player.rotation) * 24;
    this.spawnFirePatch(
      sternX, sternY,
      EVOLUTION.barrels.wakeRadius,
      def.damage[lvl - 1] * this.player.mods.damageMul * EVOLUTION.barrels.wakeDmgMul,
      EVOLUTION.barrels.wakeLifeMs
    );
  }

  // a burning patch with no barrel — mortar craters and the Inferno Wake
  private spawnFirePatch(x: number, y: number, radius: number, damage: number, lifeMs: number): void {
    const img = this.add.image(x, y, 'light')
      .setDepth(6)
      .setTint(0xff7a2a)
      .setAlpha(0.5)
      .setScale((radius * 2) / 256)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.barrels.push({ x, y, radius, damage, until: this.time.now + lifeMs, emberAt: 0, img });
  }

  private updateBarrels(time: number): void {
    for (let i = this.barrels.length - 1; i >= 0; i--) {
      const b = this.barrels[i];
      if (time > b.until) {
        b.img.destroy();
        this.barrels.splice(i, 1);
        continue;
      }
      if (b.until - time < 1500) b.img.setAlpha(0.4 + 0.3 * Math.sin(time * 0.02)); // burning out
      if (time > b.emberAt) {
        b.emberAt = time + 220;
        this.ember.emitParticleAt(b.x + Phaser.Math.Between(-6, 6), b.y + Phaser.Math.Between(-6, 6), 1);
      }
      for (const e of this.enemies.getChildren() as EnemyShip[]) {
        if (!e.active || e.sinking || time < e.barrelTickAt) continue;
        if (Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y) < b.radius) {
          e.barrelTickAt = time + 500;
          this.damageEnemy(e, b.damage);
        }
      }
    }
  }

  private fireMortar(target: EnemyShip, lvl: number): void {
    const def = WEAPONS.mortar;
    const evo = this.player.evolved.has('mortar');
    const shell = this.add.image(this.player.x, this.player.y, 'shell').setDepth(16);
    if (evo) shell.setTint(0xff6a3a).setScale(1.4); // Doombringer shells glow like a grudge
    const tx = target.x;
    const ty = target.y;
    sfx.cannon();
    this.tweens.add({ targets: shell, x: tx, y: ty, duration: 800, ease: 'Linear' });
    this.tweens.add({ targets: shell, scaleX: 2.1, scaleY: 2.1, duration: 400, yoyo: true, ease: 'Sine.easeOut' });
    this.time.delayedCall(800, () => {
      if (shell.active) shell.destroy();
      const aoe = def.aoe![lvl - 1] * (evo ? EVOLUTION.mortar.aoeMul : 1);
      const dmg = def.damage[lvl - 1] * this.player.mods.damageMul * (evo ? EVOLUTION.mortar.dmgMul : 1);
      this.explodeMortar(tx, ty, aoe, dmg);
      if (evo) this.spawnFirePatch(tx, ty, aoe * 0.55, dmg * EVOLUTION.mortar.burnDmgMul, EVOLUTION.mortar.burnLifeMs);
    });
  }

  private explodeMortar(x: number, y: number, aoe: number, dmg: number): void {
    sfx.explosion();
    this.cameras.main.shake(160, 0.004);
    this.ember.emitParticleAt(x, y, 14);
    this.splash.emitParticleAt(x, y, 8);
    const ringG = this.add.graphics().setDepth(19);
    ringG.lineStyle(3, 0xffb04a, 0.9);
    ringG.strokeCircle(0, 0, aoe);
    ringG.setPosition(x, y);
    ringG.setScale(0.2);
    this.tweens.add({ targets: ringG, scaleX: 1, scaleY: 1, alpha: 0, duration: 320, onComplete: () => ringG.destroy() });
    for (const e of this.enemies.getChildren() as EnemyShip[]) {
      if (!e.active || e.sinking) continue;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) < aoe) this.damageEnemy(e, dmg);
    }
  }

  private fireBallista(lvl: number): void {
    const def = WEAPONS.harpoon;
    const evo = this.player.evolved.has('harpoon');
    const a = this.player.rotation;
    const h = this.harpoons.create(
      this.player.x + Math.cos(a) * 20,
      this.player.y + Math.sin(a) * 20,
      'harpoon'
    ) as Phaser.Physics.Arcade.Image;
    h.setDepth(13);
    h.setRotation(a);
    if (evo) h.setScale(1.5).setTint(0xb98aff); // the Kraken's Spear flies dark and barbed
    h.setData('damage', def.damage[lvl - 1] * this.player.mods.damageMul * (evo ? EVOLUTION.harpoon.dmgMul : 1));
    h.setData('pierce', evo ? EVOLUTION.harpoon.pierce : def.pierce![lvl - 1]);
    h.setData('hitUids', [] as number[]);
    const speed = evo ? EVOLUTION.harpoon.speed : 560;
    const body = h.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
    sfx.harpoon();
    this.time.delayedCall(1100, () => { if (h.active) h.destroy(); });
  }

  private hitEnemyHarpoon(h: Phaser.Physics.Arcade.Image, enemy: EnemyShip): void {
    if (!h.active || !enemy.active || enemy.sinking) return;
    const hits = h.getData('hitUids') as number[];
    if (hits.includes(enemy.uid)) return;
    hits.push(enemy.uid);
    h.setData('hitUids', hits);
    this.damageEnemy(enemy, h.getData('damage') as number, h.rotation);
    if (this.player.evolved.has('harpoon')) {
      // Kraken's Spear: barbs bite deep and the line reels them to your guns
      enemy.slowUntil = this.time.now + EVOLUTION.harpoon.slowMs;
      const a = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const eb = enemy.body as Phaser.Physics.Arcade.Body;
      eb.velocity.x += Math.cos(a) * EVOLUTION.harpoon.yank;
      eb.velocity.y += Math.sin(a) * EVOLUTION.harpoon.yank;
    } else {
      enemy.slowUntil = this.time.now + 1500; // tangled rigging
    }
    const pierce = (h.getData('pierce') as number) - 1;
    h.setData('pierce', pierce);
    if (pierce <= 0) h.destroy(); // pierce N = N hulls total, not N+1
  }

  private fireSwivel(lvl: number, target: EnemyShip): void {
    const def = WEAPONS.swivel;
    const dmg = def.damage[lvl - 1] * this.player.mods.damageMul;

    if (this.player.evolved.has('swivel')) {
      // Wasp Nest: a chain-loaded fan that stings from any quarter
      const a = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
      const n = EVOLUTION.swivel.balls;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * EVOLUTION.swivel.fan;
        this.fireBall(
          this.playerBalls,
          this.player.x + Math.cos(a) * 16,
          this.player.y + Math.sin(a) * 16,
          a + spread,
          dmg * EVOLUTION.swivel.dmgMul,
          EVOLUTION.swivel.speed
        );
      }
      sfx.cannon();
      return;
    }

    const back = this.player.rotation + Math.PI;
    for (const off of [-0.08, 0.08]) {
      this.fireBall(
        this.playerBalls,
        this.player.x + Math.cos(back) * 16,
        this.player.y + Math.sin(back) * 16,
        back + off,
        dmg,
        430
      );
    }
    sfx.cannon();
  }

  private fireBall(
    group: Phaser.Physics.Arcade.Group,
    x: number, y: number, angle: number, damage: number, speed: number
  ): void {
    const ball = group.create(x, y, 'ball') as Phaser.Physics.Arcade.Image;
    ball.setDepth(12);
    ball.setData('damage', damage);
    const body = ball.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.time.delayedCall(1400, () => {
      if (ball.active) {
        this.splash.emitParticleAt(ball.x, ball.y, 2);
        sfx.splashSmall();
        ball.destroy();
      }
    });
  }

  private hitEnemy(ball: Phaser.Physics.Arcade.Image, enemy: EnemyShip): void {
    if (!ball.active) return;
    const dmg = ball.getData('damage') as number; // read BEFORE destroy wipes the data
    const v = (ball.body as Phaser.Physics.Arcade.Body).velocity;
    const srcAngle = Math.atan2(v.y, v.x); // where the shot was travelling — armor cares
    ball.destroy();
    if (!enemy.active) return;
    this.damageEnemy(enemy, dmg, srcAngle);
  }

  // every weapon funnels damage through here
  private damageEnemy(enemy: EnemyShip, dmg: number, srcAngle?: number): void {
    if (!enemy.active || enemy.sinking) return;

    // an armored brig's iron prow turns head-on shot to plink — flank her
    if (enemy.kind === 'brig' && srcAngle !== undefined) {
      const rel = Phaser.Math.Angle.Wrap(srcAngle - enemy.rotation);
      if (Math.abs(rel) > BRIG.frontalArc) {
        dmg *= BRIG.frontalDmgMul;
        this.floatText(enemy.x, enemy.y - 26, 'ARMORED', '#9aa8b4', 11);
      }
    }

    enemy.hp -= dmg;
    // a shot across the bow gets their attention — hostiles fight back when attacked
    if (enemy.kind !== 'merchant') enemy.aggroed = true;
    if (this.player.mods.chainShot) enemy.slowUntil = this.time.now + 3000;
    this.splash.emitParticleAt(enemy.x, enemy.y, 5);
    this.floatText(enemy.x, enemy.y - 14, `${Math.round(dmg)}`, '#ffffff', 13);
    sfx.hit();
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      if (!enemy.active || enemy.sinking) return;
      enemy.clearTint();
      // restore special paint jobs the flash wiped
      if (enemy.surrendered) enemy.setTint(0xbbbbbb);
      else if (enemy.kind === 'manowar' && (enemy as BossShip).enraged) enemy.setTint(0xff7766);
      else if (enemy.kind === 'frigate' && enemy.volleyAt > 0) enemy.setTintFill(0xffd97a); // telegraph still burning
      else if (enemy.hunter) enemy.setTint(0xff9999);
    });

    if (enemy.hp <= 0) {
      this.sinkEnemy(enemy);
      return;
    }

    // beaten ships may strike their colors and wait to be boarded
    // (the Man O' War never strikes; fire ships burn to the waterline; frigates are too proud)
    if (!enemy.surrendered
      && enemy.kind !== 'manowar' && enemy.kind !== 'fireship' && enemy.kind !== 'frigate'
      && enemy.hp < enemy.maxHp * 0.35) {
      const chance = enemy.kind === 'merchant' ? 0.4 : enemy.kind === 'gunboat' ? 0.25 : 0.2;
      if (Math.random() < chance) this.strikeColors(enemy);
    }
  }

  private strikeColors(e: EnemyShip): void {
    e.surrendered = true;
    e.aggroed = false;
    e.setTint(0xbbbbbb);
    this.flags.set(e, this.add.text(e.x, e.y - 22, '⚑', {
      fontFamily: 'Georgia', fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(14));
    this.floatText(e.x, e.y - 34, 'STRIKES HER COLORS', '#ffffff', 13);
  }

  private boardShip(e: EnemyShip): void {
    // grapple alongside and strip her bare — better pay than sinking
    const cfg = ENEMY[e.kind];
    const total = Math.round(Phaser.Math.Between(cfg.coins[0], cfg.coins[1]) * 1.4 * (e.prize ? RUMOR.prizeLootMul : 1));
    for (let i = 0; i < 5; i++) {
      this.spawnLoot(e.x + Phaser.Math.Between(-24, 24), e.y + Phaser.Math.Between(-24, 24), 'coins', Math.max(2, Math.round(total / 5)));
    }
    this.spawnLoot(e.x, e.y - 20, Math.random() < 0.5 ? 'rum' : 'powder', 0);
    if (e.kind === 'merchant' && Math.random() < 0.25) this.spawnLoot(e.x + 16, e.y + 16, 'relic', 0);
    this.floatText(e.x, e.y - 34, 'PLUNDERED!', '#ffd97a', 18);
    sfx.dig();
    this.player.notoriety++;
    this.checkBossSpawn();
    this.clearFlag(e);

    // the emptied hulk slips under quietly
    e.sinking = true;
    const body = e.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
    this.tweens.add({ targets: e, alpha: 0, duration: 1500, onComplete: () => e.destroy() });
  }

  private clearFlag(e: EnemyShip): void {
    const t = this.flags.get(e);
    if (t) {
      t.destroy();
      this.flags.delete(e);
    }
  }

  private hitPlayer(ball: Phaser.Physics.Arcade.Image): void {
    if (!ball.active) return;
    const dmg = ball.getData('damage') as number; // read BEFORE destroy wipes the data
    ball.destroy();
    this.damagePlayer(dmg);
  }

  private damagePlayer(dmg: number): void {
    if (this.overlayOpen) return;
    this.player.hp -= dmg;
    this.cameras.main.shake(120, 0.004);
    sfx.hurt();
    this.player.setTintFill(0xff6b5e);
    this.time.delayedCall(90, () => { if (this.player.active) this.player.clearTint(); });
    if (this.player.hp <= 0) this.gameOver();
  }

  private ram(enemy: EnemyShip): void {
    if (enemy.sinking || enemy.surrendered) return;

    // the iron ram prow turns every collision into an attack
    const prowLvl = this.player.weapons.get('ramprow') ?? 0;
    const leviathan = prowLvl > 0 && this.player.evolved.has('ramprow');
    if (prowLvl > 0) {
      if (this.time.now > enemy.prowHitAt) {
        enemy.prowHitAt = this.time.now + 500;
        let dmg = WEAPONS.ramprow.damage[prowLvl - 1] * this.player.mods.damageMul;
        if (leviathan) {
          // Leviathan Prow: hit like a breaching monster and send them reeling
          dmg *= EVOLUTION.ramprow.dmgMul;
          const a = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
          const eb = enemy.body as Phaser.Physics.Arcade.Body;
          eb.velocity.x += Math.cos(a) * EVOLUTION.ramprow.knockback;
          eb.velocity.y += Math.sin(a) * EVOLUTION.ramprow.knockback;
          enemy.slowUntil = Math.max(enemy.slowUntil, this.time.now + EVOLUTION.ramprow.stunMs);
        }
        this.damageEnemy(enemy, dmg);
        this.cameras.main.shake(100, leviathan ? 0.006 : 0.003);
      }
      if (enemy.sinking) return; // the prow finished them — no reprisal
    }

    // touching a fire ship detonates it — hull to hull with a powder hulk, nobody wins
    if (enemy.kind === 'fireship') {
      enemy.hp = 0;
      this.sinkEnemy(enemy);
      return;
    }

    const ramDmg = ENEMY[enemy.kind].ramDamage;
    if (ramDmg <= 0) return;
    // drifting traffic in the shallows bumps hulls, it doesn't board you
    if (!enemy.aggroed && !enemy.hunter && biomeAt(this.player.x, this.player.y) === 'shallows') return;
    if (this.time.now < enemy.ramReadyAt) return;
    enemy.ramReadyAt = this.time.now + 900;
    const reduction = prowLvl > 0 ? (leviathan ? 0 : 0.5) : 1; // iron bow shrugs off half; the Leviathan notices nothing
    if (reduction > 0) this.damagePlayer(ramDmg * reduction);
    if (enemy.kind === 'sloop') {
      // a sloop dashes itself to splinters against you; heavier hulls trade paint instead
      enemy.hp = 0;
      this.sinkEnemy(enemy);
    }
  }

  private sinkEnemy(e: EnemyShip): void {
    if (e.sinking) return;
    e.sinking = true;
    this.clearFlag(e);
    const body = e.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
    sfx.sink();

    // a fire ship doesn't sink so much as detonate
    if (e.kind === 'fireship') this.explodeFireship(e.x, e.y);

    // spill the cargo — every hull has its own manifest; a prize galleon overflows
    const cfg = ENEMY[e.kind];
    const total = Phaser.Math.Between(cfg.coins[0], cfg.coins[1]) * (e.prize ? RUMOR.prizeLootMul : 1);
    const n = Phaser.Math.Between(3, 5);
    for (let i = 0; i < n; i++) {
      this.spawnLoot(
        e.x + Phaser.Math.Between(-26, 26),
        e.y + Phaser.Math.Between(-26, 26),
        'coins',
        Math.max(1, Math.round(total / n))
      );
    }
    const roll = Math.random();
    if (e.kind === 'manowar') {
      // the legendary bounty pays legendary money
      this.spawnLoot(e.x, e.y - 24, 'relic', 0);
      this.spawnLoot(e.x + 20, e.y - 16, 'relic', 0);
      this.spawnLoot(e.x - 20, e.y + 16, 'powder', 0);
      this.spawnLoot(e.x + 20, e.y + 16, 'rum', 0);
    } else if (e.kind === 'frigate') {
      // an elite's strongbox always holds a relic
      this.spawnLoot(e.x, e.y - 24, 'relic', 0);
      if (roll < 0.5) this.spawnLoot(e.x + 18, e.y - 14, 'powder', 0);
    } else if (e.kind === 'merchant') {
      if (roll < 0.2) this.spawnLoot(e.x, e.y - 24, 'relic', 0);
      else if (roll < 0.5) this.spawnLoot(e.x, e.y - 24, 'rum', 0);
    } else if (e.kind === 'gunboat') {
      if (roll < 0.35) this.spawnLoot(e.x, e.y - 24, 'powder', 0);
      else if (roll < 0.5) this.spawnLoot(e.x, e.y - 24, 'rum', 0);
    } else if (e.kind === 'brig') {
      if (roll < 0.4) this.spawnLoot(e.x, e.y - 24, 'powder', 0);
      else if (roll < 0.6) this.spawnLoot(e.x, e.y - 24, 'rum', 0);
    } else if (e.kind === 'fireship') {
      if (roll < 0.5) this.spawnLoot(e.x, e.y - 24, 'powder', 0); // unspent powder
    } else {
      if (roll < 0.3) this.spawnLoot(e.x, e.y - 24, 'rum', 0);
      else if (roll < 0.45) this.spawnLoot(e.x, e.y - 24, 'powder', 0);
    }

    this.tweens.add({
      targets: e,
      rotation: e.rotation + 1.1,
      alpha: 0,
      scaleX: 0.8,
      scaleY: 0.8,
      duration: 1300,
      onComplete: () => e.destroy(),
    });

    // broken timbers drift where she went down
    for (let i = 0; i < 4; i++) {
      const d = this.add.image(
        e.x + Phaser.Math.Between(-14, 14),
        e.y + Phaser.Math.Between(-10, 10),
        'debris'
      ).setDepth(6).setRotation(Math.random() * Math.PI);
      this.tweens.add({
        targets: d,
        x: d.x + Phaser.Math.Between(-26, 26),
        y: d.y + Phaser.Math.Between(-26, 26),
        rotation: d.rotation + Phaser.Math.FloatBetween(-2, 2),
        alpha: 0,
        duration: Phaser.Math.Between(6000, 9000),
        onComplete: () => d.destroy(),
      });
    }

    this.player.kills++;
    if (e.kind === 'gunboat' || e.kind === 'brig') this.player.notoriety++;
    if (e.kind === 'merchant') this.player.notoriety += 2; // piracy has a price
    if (e.kind === 'frigate') this.player.notoriety += 2; // sinking an elite raises eyebrows
    if (e.kind === 'manowar') {
      this.player.notoriety += 5;
      this.boss = null;
      this.bossKills++;
      this.nextBossAt = this.player.notoriety + 5; // the navy never forgives — another will come
      this.time.delayedCall(1600, () => this.victory());
    }
    this.checkBossSpawn();

    this.xp += e.kind === 'frigate' ? 2 : 1; // an elite counts double
    if (this.xp >= killsToNextLevel(this.player.level)) {
      this.xp = 0;
      this.player.level++;
      this.pendingDraft = true;
    }
  }

  // ---------- the legendary bounty ----------

  private checkBossSpawn(): void {
    // a Man O' War answers every five stars of infamy — even in endless mode
    if (this.player.notoriety >= this.nextBossAt) {
      this.spawnBoss();
    }
  }

  private spawnBoss(): void {
    this.nextBossAt = Number.MAX_SAFE_INTEGER; // until this one rests on the ocean floor
    const a = Math.random() * Math.PI * 2;
    const d = 1400;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * d, 100, WORLD.width - 100);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * d, 100, WORLD.height - 100);
    this.boss = new BossShip(this, x, y);
    this.enemies.add(this.boss);
    this.cameras.main.shake(400, 0.006);
    sfx.bossHorn();
    this.floatText(this.player.x, this.player.y - 60, 'THE NAVY SENDS ITS FINEST…', '#ff5544', 24);
    this.time.delayedCall(1300, () => {
      if (this.player.active) this.floatText(this.player.x, this.player.y - 60, BOSS.name, '#ffaa22', 28);
    });
  }

  // elite frigate: a fan of shot with one hole in it — thread the gap
  private frigateVolley(e: EnemyShip): void {
    if (!e.active || e.sinking) return;
    const toPlayer = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
    sfx.cannon();
    this.splash.emitParticleAt(e.x, e.y, 6);
    const gap = Phaser.Math.Between(0, FRIGATE.volley - 1);
    for (let i = 0; i < FRIGATE.volley; i++) {
      if (i === gap) continue;
      const spread = (i - (FRIGATE.volley - 1) / 2) * 0.11;
      this.fireBall(
        this.enemyBalls,
        e.x + Math.cos(toPlayer) * 24,
        e.y + Math.sin(toPlayer) * 24,
        toPlayer + spread,
        ENEMY.frigate.damage,
        FRIGATE.ballSpeed
      );
    }
  }

  // a fire ship goes up like a powder magazine — everyone in the blast feels it
  private explodeFireship(x: number, y: number): void {
    sfx.explosion();
    this.cameras.main.shake(180, 0.005);
    this.ember.emitParticleAt(x, y, 18);
    this.splash.emitParticleAt(x, y, 10);
    const ringG = this.add.graphics().setDepth(19);
    ringG.lineStyle(3, 0xff7a2a, 0.95);
    ringG.strokeCircle(0, 0, FIRESHIP.blastRadius);
    ringG.setPosition(x, y);
    ringG.setScale(0.2);
    this.tweens.add({ targets: ringG, scaleX: 1, scaleY: 1, alpha: 0, duration: 300, onComplete: () => ringG.destroy() });

    // the blast plays no favorites — bait them into packs and watch the chain
    for (const e of this.enemies.getChildren() as EnemyShip[]) {
      if (!e.active || e.sinking) continue;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) < FIRESHIP.blastRadius) {
        this.damageEnemy(e, FIRESHIP.enemyDamage);
      }
    }
    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < FIRESHIP.blastRadius) {
      this.damagePlayer(FIRESHIP.playerDamage);
    }
  }

  private bossVolley(b: BossShip): void {
    const toPlayer = Phaser.Math.Angle.Between(b.x, b.y, this.player.x, this.player.y);
    sfx.cannon();
    this.splash.emitParticleAt(b.x, b.y, 8);
    const fan = (): void => {
      for (let i = 0; i < 7; i++) {
        const spread = (i - 3) * 0.09;
        this.fireBall(
          this.enemyBalls,
          b.x + Math.cos(toPlayer) * 24,
          b.y + Math.sin(toPlayer) * 24,
          toPlayer + spread,
          ENEMY.manowar.damage,
          300
        );
      }
    };
    fan();
    if (b.enraged) {
      this.time.delayedCall(380, () => {
        if (b.active && !b.sinking) fan();
      });
    }
  }

  private spawnEscorts(b: BossShip): void {
    let sloops = 0;
    for (const e of this.enemies.getChildren() as EnemyShip[]) {
      if (e.active && !e.sinking && e.kind === 'sloop') sloops++;
    }
    let launched = 0;
    for (let i = 0; i < 2 && sloops < 5; i++, sloops++, launched++) {
      const e = new EnemyShip(this, b.x + Phaser.Math.Between(-90, 90), b.y + Phaser.Math.Between(-90, 90), 'sloop');
      e.aggroed = true;
      this.enemies.add(e);
    }
    if (launched > 0) this.floatText(b.x, b.y - 44, 'ESCORTS LAUNCHED', '#ffaa22', 13);
  }

  private runTallied = false; // a voyage tallies its lifetime stats once

  private recordsHtml(): string {
    const r = recordRun({
      coins: this.player.coins,
      kills: this.player.kills,
      notoriety: this.player.notoriety,
      level: this.player.level,
      bosses: this.bossKills,
    }, !this.runTallied);
    this.runTallied = true;
    return `<p style="text-align:center;font-size:12px;color:#9db8cc">
      best purse ${r.bestCoins}g &middot; best kills ${r.bestKills} &middot; most infamous ★${r.bestNotoriety}<br/>
      voyage #${r.runs} &middot; ${r.totalSunk} ships sunk all-time &middot; ${r.bossesFelled} Men O' War felled
    </p>`;
  }

  private victory(): void {
    if (this.overlayOpen) return;
    this.overlayOpen = true;
    this.scene.pause();
    sfx.levelup();
    const el = showOverlay(`
      <div class="panel">
        <h2>LEGENDARY BOUNTY CLAIMED</h2>
        <p style="text-align:center">${BOSS.name} rests on the ocean floor.</p>
        <p style="text-align:center">${this.player.kills} ships sunk &middot; ${this.player.coins}g plundered &middot; ★${this.player.notoriety} &middot; Lv ${this.player.level}</p>
        ${this.recordsHtml()}
        <button class="btn big" data-k="sail">KEEP SAILING — endless mode</button>
        <button class="btn big" data-k="new">NEW VOYAGE</button>
      </div>`);
    el.querySelector('[data-k="sail"]')!.addEventListener('click', () => this.closeOverlay(el));
    el.querySelector('[data-k="new"]')!.addEventListener('click', () => {
      el.remove();
      this.overlayOpen = false;
      this.scene.resume();
      this.scene.restart();
    });
  }

  private floatText(x: number, y: number, msg: string, color = '#ffffff', size = 14): void {
    const t = this.add.text(x, y, msg, {
      fontFamily: 'Georgia', fontSize: `${size}px`, color,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  // ---------- spawning ----------

  private spawnEnemy(minDist?: number, maxDist?: number): void {
    const a = Math.random() * Math.PI * 2;
    const d = Phaser.Math.Between(minDist ?? ENCOUNTER.spawnMinDist, maxDist ?? ENCOUNTER.spawnMaxDist);
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * d, 60, WORLD.width - 60);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * d, 60, WORLD.height - 60);

    let kind: EnemyKind;
    let hunter = false;
    const biome = biomeAt(x, y);
    if (biome === 'shallows') {
      kind = Math.random() < 0.35 ? 'merchant' : 'sloop'; // safe waters
    } else if (biome === 'deep') {
      // the deep sends its worst — and no easy prey
      const r = Math.random();
      if (r < 0.45) {
        kind = 'gunboat';
        hunter = true; // the deep knows your name
      } else if (r < 0.75) {
        kind = 'brig';
      } else {
        kind = 'fireship';
      }
    } else if (Math.random() < 0.3) {
      kind = 'merchant';
    } else {
      // the mix gets uglier as your infamy grows: first fire ships, then brigs, then elites
      const n = this.player.notoriety;
      const r = Math.random();
      let frigateChance = 0;
      if (n >= ENCOUNTER.frigate.notoriety) {
        let frigates = 0;
        for (const e of this.enemies.getChildren() as EnemyShip[]) {
          if (e.active && !e.sinking && e.kind === 'frigate') frigates++;
        }
        if (frigates < FRIGATE.maxAlive) frigateChance = ENCOUNTER.frigate.chance;
      }
      const brigChance = n >= ENCOUNTER.brig.notoriety
        ? Math.min(ENCOUNTER.brig.base + n * ENCOUNTER.brig.perStar, ENCOUNTER.brig.max) : 0;
      const fireChance = n >= ENCOUNTER.fireship.notoriety
        ? Math.min(ENCOUNTER.fireship.base + n * ENCOUNTER.fireship.perStar, ENCOUNTER.fireship.max) : 0;

      if (r < frigateChance) kind = 'frigate';
      else if (r < frigateChance + brigChance) kind = 'brig';
      else if (r < frigateChance + brigChance + fireChance) kind = 'fireship';
      else {
        const gunboatChance = Math.min(0.35 + n * 0.05, 0.75);
        kind = Math.random() < gunboatChance ? 'gunboat' : 'sloop';
        // at notoriety 3+ some navy ships spawn already hunting you —
        // and a fat hold puts word on the wind at any infamy
        const fatHold = this.totalCargo() >= TRADE.huntedAt;
        if (kind === 'gunboat' && Math.random() < (n >= 3 ? 0.4 : 0) + (fatHold ? 0.35 : 0)) hunter = true;
      }
    }
    const e = new EnemyShip(this, x, y, kind, hunter);
    this.enemies.add(e);
    if (kind === 'frigate') {
      this.floatText(this.player.x, this.player.y - 52, 'AN ELITE FRIGATE HUNTS YOU', '#ffd97a', 15);
    }
  }

  private maintainEnemies(): void {
    if (this.overlayOpen) return;
    const cap = Math.min(
      ENCOUNTER.baseCap + Math.floor(this.player.kills / 4) + Math.floor(this.player.notoriety / 5),
      ENCOUNTER.maxCap
    );
    let alive = 0;
    for (const e of this.enemies.getChildren() as EnemyShip[]) {
      // beaten hulks waiting to be plundered don't count against the spawn cap
      if (e.active && !e.sinking && !e.surrendered) alive++;
    }
    if (alive < cap) this.spawnEnemy();
  }

  // ---------- port / shop / draft ----------

  nearPort(): PortDef | null {
    for (const port of PORTS) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, port.x, port.y) < PORT.dockRadius) {
        return port;
      }
    }
    return null;
  }

  private openDraft(): void {
    if (this.overlayOpen) {
      this.pendingDraft = true;
      return;
    }
    this.overlayOpen = true;
    this.scene.pause();
    sfx.levelup();
    const state = {
      mods: this.player.mods,
      weapons: this.player.weapons,
      passives: this.player.passives,
      evolved: this.player.evolved,
    };
    const picks = drawCards(state, 3);
    const el = showOverlay(`
      <div class="panel">
        <h2>SPOILS OF THE SEA — LEVEL ${this.player.level}</h2>
        <div class="cards">
          ${picks.map((c, i) => `
            <div class="card${c.tagClass === 'evo' ? ' card-evo' : ''}" data-i="${i}">
              <span class="tag tag-${c.tagClass}">${c.tag}</span>
              <h3>${c.name}</h3>
              <p>${c.desc}</p>
            </div>`).join('')}
        </div>
        <div class="hint">choose one</div>
      </div>`);
    el.querySelectorAll('.card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const i = parseInt((cardEl as HTMLElement).getAttribute('data-i')!, 10);
        const picked = picks[i];
        picked.apply(state);
        this.player.syncStats();
        if (picked.evoWeapon) {
          const evo = getEvolution(picked.evoWeapon)!;
          sfx.buff();
          this.floatText(this.player.x, this.player.y - 44, `EVOLVED: ${evo.name.toUpperCase()}`, '#c89aff', 22);
        }
        this.closeOverlay(el);
      });
    });
  }

  private openShop(port: PortDef): void {
    this.overlayOpen = true;
    this.scene.pause();

    // the harbormaster has standards — a wanted pirate gets no dock here
    if (this.player.notoriety >= port.refusesAt) {
      const el = showOverlay(`
        <div class="panel">
          <h2>${port.name}</h2>
          <p style="text-align:center">The harbormaster spits over the rail. <em>"We know your face, pirate. No dock for you here."</em></p>
          <p style="text-align:center;color:#9db8cc">Word is, Tortuga asks no questions… if you can reach her.</p>
          <button class="btn big">SET SAIL</button>
        </div>`);
      el.querySelector('button')!.addEventListener('click', () => this.closeOverlay(el));
      return;
    }

    const el = showOverlay('');

    const render = (): void => {
      const p = this.player;
      const L = this.shopLevels;
      const price = (base: number): number => Math.max(1, Math.round(base * port.priceMul));
      const allRows: { key: string; name: string; cost: number; can: boolean }[] = [
        { key: 'repair', name: 'Shipwright: patch hull (+40 HP)', cost: price(20), can: p.hp < p.maxHp },
        { key: 'damage', name: `Cannons: +10% damage (Lv ${L.damage})`, cost: price(40 * (L.damage + 1)), can: true },
        { key: 'rate', name: `Gun crews: +8% fire rate (Lv ${L.rate})`, cost: price(40 * (L.rate + 1)), can: true },
        { key: 'hull', name: `Hull plating: +20 max HP (Lv ${L.hull})`, cost: price(30 * (L.hull + 1)), can: true },
        { key: 'speed', name: `New sails: +6% speed (Lv ${L.speed})`, cost: price(35 * (L.speed + 1)), can: true },
        { key: 'accuracy', name: `Gunnery school: +12% accuracy (Lv ${L.accuracy})`, cost: price(35 * (L.accuracy + 1)), can: true },
        {
          key: 'winch',
          name: p.winchLevel >= 3
            ? 'Salvage winch: fully rigged'
            : p.winchLevel === 0
              ? 'Salvage winch: harpoon loot & sunken treasure'
              : `Winch Lv ${p.winchLevel + 1}: longer reach, faster reel`,
          cost: p.winchLevel >= 3 ? -1 : price(WINCH.costs[p.winchLevel]),
          can: p.winchLevel < 3,
        },
        {
          key: 'rumor-glint',
          name: 'Tavern rumor: sunken secrets — glints charted for 90s',
          cost: price(RUMOR.glintCost),
          can: this.time.now >= this.glintsRevealedUntil,
        },
        {
          key: 'rumor-prize',
          name: "Tavern rumor: a fat prize galleon — she's marked on your chart",
          cost: price(RUMOR.prizeCost),
          can: true,
        },
      ];
      const rows = allRows.filter((r) => port.stock.includes(r.key as never));

      // the trade counter: every port buys and sells every good — profit is in the sailing
      const hold = p.cargoCount();
      const tradeRows = Object.entries(TRADE.goods).map(([gid, g]) => {
        const [buy, sell] = g.prices[port.id];
        const held = p.cargo[gid] ?? 0;
        return `<div class="shop-row">
          <span>${g.name} <span style="color:#7fa6bd">× ${held}</span></span>
          <span style="display:flex;gap:8px">
            <button class="btn" data-key="buy:${gid}" ${p.coins < buy || hold >= TRADE.capacity ? 'disabled' : ''}>BUY ${buy}g</button>
            <button class="btn" data-key="sell:${gid}" ${held <= 0 ? 'disabled' : ''}>SELL ${sell}g</button>
          </span>
        </div>`;
      }).join('');

      el.innerHTML = `
        <div class="panel">
          <h2>${port.name}</h2>
          <div class="shop-row"><span>Your purse</span><span class="coins">${p.coins}g</span></div>
          ${rows.map((r) => `
            <div class="shop-row">
              <span>${r.name}</span>
              <button class="btn" data-key="${r.key}" ${!r.can || p.coins < r.cost ? 'disabled' : ''}>${r.cost < 0 ? 'MAX' : r.cost + 'g'}</button>
            </div>`).join('')}
          <div class="shop-row" style="border-bottom:none;padding-bottom:0"><span style="color:#c8a24a;font-size:11px;letter-spacing:2px">THE TRADE COUNTER — HOLD ${hold}/${TRADE.capacity}${hold >= TRADE.huntedAt ? ' ⚠ fat hold, they know' : ''}</span></div>
          ${tradeRows}
          <button class="btn big" data-key="leave">SET SAIL</button>
        </div>`;
      el.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = (btn as HTMLElement).getAttribute('data-key')!;
          if (key === 'leave') {
            this.closeOverlay(el);
            return;
          }
          if (key.startsWith('buy:') || key.startsWith('sell:')) {
            this.tradeGood(port, key);
            render();
            return;
          }
          const row = rows.find((r) => r.key === key)!;
          if (this.player.coins < row.cost) return;
          this.player.coins -= row.cost;
          this.applyShopUpgrade(key);
          sfx.buy();
          render();
        });
      });
    };
    render();
  }

  private applyShopUpgrade(key: string): void {
    const m = this.player.mods;
    switch (key) {
      case 'repair':
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
        break;
      case 'damage':
        m.damageMul *= 1.1;
        this.shopLevels.damage++;
        break;
      case 'rate':
        m.fireRateMul *= 1.08;
        this.shopLevels.rate++;
        break;
      case 'hull':
        m.maxHpBonus += 20;
        this.player.syncStats();
        this.shopLevels.hull++;
        break;
      case 'speed':
        m.speedMul *= 1.06;
        this.shopLevels.speed++;
        break;
      case 'accuracy':
        m.accuracyMul *= 1.12;
        this.shopLevels.accuracy++;
        break;
      case 'winch':
        this.player.winchLevel++;
        break;
      case 'rumor-glint':
        // the tavern's best ears point you at the glitter
        this.glintsRevealedUntil = this.time.now + RUMOR.glintRevealMs;
        this.floatText(this.player.x, this.player.y - 44, 'SUNKEN GLINTS CHARTED', '#ffd97a', 16);
        break;
      case 'rumor-prize':
        this.spawnPrizeGalleon();
        break;
    }
  }

  // buy or sell one crate at the trade counter
  private tradeGood(port: PortDef, key: string): void {
    const [verb, gid] = key.split(':');
    const g = TRADE.goods[gid];
    if (!g) return;
    const [buy, sell] = g.prices[port.id];
    const p = this.player;
    if (verb === 'buy') {
      if (p.coins < buy || p.cargoCount() >= TRADE.capacity) return;
      p.coins -= buy;
      p.cargo[gid] = (p.cargo[gid] ?? 0) + 1;
    } else {
      if ((p.cargo[gid] ?? 0) <= 0) return;
      p.cargo[gid] -= 1;
      p.coins += sell;
    }
    sfx.coin();
  }

  private totalCargo(): number {
    return this.player.cargoCount();
  }

  // a fat, gold-hulled merchant wallowing under easy escort — rumor made flesh
  private spawnPrizeGalleon(): void {
    const { x, y } = this.eventSpot(900, 1400);
    const g = new EnemyShip(this, x, y, 'merchant');
    g.prize = true;
    g.setTint(0xffd97a);
    g.setScale(1.15); // heavy with cargo
    this.enemies.add(g);
    const escort = new EnemyShip(this, x + 90, y + 60, 'gunboat');
    this.enemies.add(escort);
    this.floatText(this.player.x, this.player.y - 52, 'A FAT PRIZE SAILS NEARBY — CHECK YOUR CHART', '#ffd97a', 15);
  }

  private pauseGame(): void {
    if (this.overlayOpen) return;
    this.overlayOpen = true;
    this.scene.pause();
    const el = showOverlay(`
      <div class="panel">
        <h2>ANCHORED</h2>
        <p style="text-align:center">The sea waits for no captain — but she'll wait for you.</p>
        <button class="btn big">RESUME</button>
      </div>`);
    el.querySelector('button')!.addEventListener('click', () => this.closeOverlay(el));
  }

  private gameOver(): void {
    if (this.overlayOpen) return;
    this.overlayOpen = true;
    this.scene.pause();
    sfx.sink();
    const el = showOverlay(`
      <div class="panel">
        <h2>SHE'S GOING DOWN</h2>
        <p style="text-align:center">${this.player.kills} ships sunk &middot; ${this.player.coins}g in the hold</p>
        ${this.recordsHtml()}
        <button class="btn big">SAIL AGAIN</button>
      </div>`);
    el.querySelector('button')!.addEventListener('click', () => {
      el.remove();
      this.overlayOpen = false;
      this.scene.resume();
      this.scene.restart();
    });
  }

  private closeOverlay(el: HTMLElement): void {
    el.remove();
    this.overlayOpen = false;
    this.scene.resume();
  }

  // ---------- world-space enemy bars (HUD itself lives in UIScene) ----------

  private drawEnemyBars(): void {
    const g = this.enemyBars;
    g.clear();
    for (const e of this.enemies.getChildren() as EnemyShip[]) {
      if (!e.active || e.sinking || e.hp >= e.maxHp) continue;
      const big = e.kind === 'brig' || e.kind === 'frigate';
      const w = e.kind === 'manowar' ? 60 : big ? 36 : 26;
      const x = e.x - w / 2;
      const y = e.y - (e.kind === 'manowar' ? 28 : big ? 20 : 16);
      g.fillStyle(0x08131c, 0.8);
      g.fillRect(x - 1, y - 1, w + 2, 5);
      g.fillStyle(0xd9534f, 1);
      g.fillRect(x, y, w * Phaser.Math.Clamp(e.hp / e.maxHp, 0, 1), 3);
    }
  }

}
