import Phaser from 'phaser';
import { ENEMY, ENCOUNTER } from '../config';
import { aggroRangeAt, biomeAt } from '../systems/biomes';

export type EnemyKind = 'gunboat' | 'sloop' | 'merchant' | 'manowar' | 'fireship' | 'brig' | 'frigate';

export class EnemyShip extends Phaser.Physics.Arcade.Sprite {
  private static nextUid = 1;
  readonly uid = EnemyShip.nextUid++;
  readonly kind: EnemyKind;
  readonly hunter: boolean;
  readonly maxHp: number;
  hp: number;
  slowUntil = 0;
  fireCooldown = Phaser.Math.FloatBetween(0.5, 2);
  ramReadyAt = 0;
  whirlReadyAt = 0;
  barrelTickAt = 0; // fire damage tick cooldown
  prowHitAt = 0; // ram prow hit cooldown
  volleyAt = 0; // frigate: telegraph ends, broadside fan fires (scene time ms, 0 = idle)
  sinking = false;
  surrendered = false;
  aggroed = false;
  prize = false; // a fat prize galleon, marked by a tavern rumor — pays triple

  private wobble: number;
  private wanderHeading: number;
  private wanderTimer = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind, hunter = false) {
    super(scene, x, y, `ship-${kind}`);
    this.kind = kind;
    this.hunter = hunter;
    this.hp = ENEMY[kind].hp;
    this.maxHp = ENEMY[kind].hp;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setDrag(20, 20);
    body.setCollideWorldBounds(true);

    this.setDepth(9);
    this.wobble = Math.random() * Math.PI * 2;
    this.wanderHeading = Math.random() * Math.PI * 2;

    if (hunter) {
      this.aggroed = true;
      this.setTint(0xff9999);
    }
  }

  update(dt: number, player: Phaser.Physics.Arcade.Sprite): void {
    if (this.sinking) return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    // a beaten ship drifts and waits to be plundered
    if (this.surrendered) {
      body.setAcceleration(0, 0);
      return;
    }

    const cfg = ENEMY[this.kind];
    const toPlayer = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    // hostiles only hunt the player when close (hunters never lose the scent;
    // predators in the fog strike late and close; the golden shallows are safe
    // waters — unless you're daft enough to fire first)
    if (this.kind !== 'merchant') {
      const safeWaters = biomeAt(player.x, player.y) === 'shallows';
      if (this.hunter) this.aggroed = true;
      else if (this.aggroed && dist > ENCOUNTER.deaggroRange) this.aggroed = false;
      else if (!this.aggroed && !safeWaters && dist < aggroRangeAt(this.x, this.y)) this.aggroed = true;
    }

    let heading: number;
    let throttle: number;

    if (this.kind === 'merchant') {
      // fat and scared: run from the player, otherwise drift along trade routes
      if (dist < 550) {
        heading = toPlayer + Math.PI;
        throttle = 1;
      } else {
        heading = this.wander(dt);
        throttle = 0.5;
      }
    } else if (this.aggroed) {
      // sloops & fire ships charge in; gunboats, brigs and frigates keep broadside distance and orbit
      heading = toPlayer;
      throttle = 1;
      if (this.kind === 'gunboat' || this.kind === 'brig' || this.kind === 'frigate') {
        const veer = this.kind === 'frigate' ? 0.78 : 0.65; // frigates are shy — they kite
        if (dist < cfg.range * veer) heading = toPlayer + Math.PI * 0.8; // veer off
        else if (dist < cfg.range) heading = toPlayer + Math.PI / 2 + Math.sin(this.wobble) * 0.35; // circle
      }
    } else {
      heading = this.wander(dt);
      throttle = 0.45;
    }

    // slid nose-first into an island? veer off instead of grinding the hull
    if (throttle > 0 && body.speed < 25) heading += Math.PI / 3;

    const slowed = this.scene.time.now < this.slowUntil;
    const max = cfg.speed * (this.hunter ? 1.15 : 1) * (slowed ? 0.45 : 1) * throttle;
    body.setAcceleration(Math.cos(heading) * 100 * throttle, Math.sin(heading) * 100 * throttle);
    if (body.velocity.length() > max) body.velocity.setLength(max);

    this.wobble += dt * 0.8;

    // ships don't snap to their heading — they answer the rudder
    if (body.velocity.lengthSq() > 400) {
      const target = Math.atan2(body.velocity.y, body.velocity.x);
      const delta = Phaser.Math.Angle.Wrap(target - this.rotation);
      const maxTurn = 2.0 * dt;
      this.rotation += Phaser.Math.Clamp(delta, -maxTurn, maxTurn);
    }
  }

  private wander(dt: number): number {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderHeading = Math.random() * Math.PI * 2;
      this.wanderTimer = 3 + Math.random() * 4;
    }
    return this.wanderHeading;
  }
}
