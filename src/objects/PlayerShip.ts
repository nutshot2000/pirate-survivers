import Phaser from 'phaser';
import { PLAYER } from '../config';
import { PlayerMods, baseMods } from '../systems/cards';
import { WeaponId } from '../systems/weapons';

export class PlayerShip extends Phaser.Physics.Arcade.Sprite {
  mods: PlayerMods = baseMods();
  weapons: Map<WeaponId, number> = new Map([['broadsides', 1]]);
  passives: Set<string> = new Set(); // crew cards taken (evolution requirements)
  evolved: Set<WeaponId> = new Set(); // weapons evolved past Lv5
  hp: number;
  maxHp: number;
  coins = 0;
  kills = 0;
  level = 1;
  notoriety = 0;
  powderUntil = 0; // fire-rate buff expiry (scene time ms)
  whirlReadyAt = 0; // whirlpool damage tick cooldown
  winchLevel = 0; // salvage winch tier (0 = no winch)

  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'ship-player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.maxHp = PLAYER.maxHp;
    this.hp = this.maxHp;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setDrag(PLAYER.drag, PLAYER.drag);
    body.setCollideWorldBounds(true);

    this.keys = scene.input.keyboard!.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT'
    ) as unknown as Record<string, Phaser.Input.Keyboard.Key>;
  }

  update(dt: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;

    // rudder
    let turn = 0;
    if (this.keys['A'].isDown || this.keys['LEFT'].isDown) turn -= 1;
    if (this.keys['D'].isDown || this.keys['RIGHT'].isDown) turn += 1;
    this.rotation += turn * PLAYER.turnRate * dt;

    // sails: thrust along current heading, with momentum + drag doing the "ship feel"
    const forward = this.keys['W'].isDown || this.keys['UP'].isDown;
    const back = this.keys['S'].isDown || this.keys['DOWN'].isDown;
    const thrust = forward ? 1 : back ? -0.45 : 0;
    if (thrust !== 0) {
      body.setAcceleration(
        Math.cos(this.rotation) * PLAYER.accel * thrust,
        Math.sin(this.rotation) * PLAYER.accel * thrust
      );
    } else {
      body.setAcceleration(0, 0);
    }

    const max = PLAYER.maxSpeed * this.mods.speedMul;
    if (body.velocity.length() > max) {
      body.velocity.setLength(max);
    }
  }

  // Recompute max HP from mods; gaining max HP also heals the difference.
  syncStats(): void {
    const newMax = PLAYER.maxHp + this.mods.maxHpBonus;
    if (newMax > this.maxHp) this.hp += newMax - this.maxHp;
    this.maxHp = newMax;
    this.hp = Math.min(this.hp, this.maxHp);
  }
}
