import Phaser from 'phaser';
import { EnemyShip } from './EnemyShip';

// The legendary bounty: a Man O' War that bears down on you, enrages at half health.
// Volleys and escort summoning are orchestrated by GameScene.
export class BossShip extends EnemyShip {
  volleyReadyAt = 0;
  escortReadyAt = 0;
  enraged = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'manowar', true); // always hunting
    this.clearTint(); // no hunter tint — the black and gold stays pristine
    this.volleyReadyAt = scene.time.now + 3000;
    this.escortReadyAt = scene.time.now + 6000;
  }

  update(dt: number, player: Phaser.Physics.Arcade.Sprite): void {
    if (!this.enraged && !this.sinking && this.hp < this.maxHp * 0.5) {
      this.enraged = true;
      this.setTint(0xff7766);
    }
    super.update(dt, player); // hunter + aggroed: charges the player, gun-decks blazing
  }
}
