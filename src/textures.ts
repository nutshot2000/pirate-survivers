import Phaser from 'phaser';

// Every sprite in the game is generated in code — zero asset files needed.

export function generateTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('water')) return; // survive scene restarts
  makeWater(scene, 'water', '#0b3a57', '#174f74');
  makeWater(scene, 'water2', '#0d4062', '#1d6a93');
  makeShip(scene, 'ship-player', 0x8a5a2b, 0xf5efe0, 1.0);
  makeShip(scene, 'ship-gunboat', 0x33506b, 0xe9e4d8, 0.95);
  makeShip(scene, 'ship-sloop', 0x7a3636, 0xd8c9a8, 0.68);
  makeShip(scene, 'ship-merchant', 0xa9854f, 0xf2e8d0, 1.05);
  makeFireShip(scene);
  makeBrig(scene);
  makeFrigate(scene);
  makeBossShip(scene);
  makeIsland(scene, 'island0', 0);
  makeIsland(scene, 'island1', 1);
  makeIsland(scene, 'island2', 2);
  makeBall(scene);
  makeLoot(scene);
  makeFoam(scene);
  makePort(scene);
  makeWhirlpool(scene);
  makeGlint(scene);
  makeBarrel(scene);
  makeShell(scene);
  makeHarpoon(scene);
  makeEmber(scene);
  makeCloud(scene);
  makeLight(scene);
  makeDebris(scene);
  makeCoffin(scene);
  makeWhale(scene);
  makeCache(scene);
}

function makeWater(scene: Phaser.Scene, key: string, base: string, light: string): void {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // speckle noise
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.04 + Math.random() * 0.09;
    const s = Math.random() < 0.85 ? 1 : 2;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }

  // wavy streaks
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = light;
  for (let i = 0; i < 14; i++) {
    const y0 = Math.random() * size;
    const amp = 2 + Math.random() * 4;
    const wavelength = 40 + Math.random() * 60;
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath();
    for (let x = 0; x <= size; x += 4) {
      const y = y0 + Math.sin((x / wavelength) * Math.PI * 2) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  scene.textures.addCanvas(key, canvas);
}

function makeShip(scene: Phaser.Scene, key: string, hullColor: number, sailColor: number, s: number): void {
  const g = scene.add.graphics();
  const w = Math.ceil(40 * s) + 8;
  const h = Math.ceil(18 * s) + 8;
  g.translateCanvas(w / 2, h / 2);

  // hull (pointed bow facing +x, which is rotation 0)
  g.fillStyle(hullColor, 1);
  g.beginPath();
  g.moveTo(-17 * s, -6.5 * s);
  g.lineTo(9 * s, -6.5 * s);
  g.lineTo(18 * s, 0);
  g.lineTo(9 * s, 6.5 * s);
  g.lineTo(-17 * s, 6.5 * s);
  g.closePath();
  g.fillPath();
  g.lineStyle(1.5, 0x0a141c, 0.6);
  g.strokePath();

  // deck
  g.fillStyle(0xd9c9a3, 0.9);
  g.fillRect(-12 * s, -3.2 * s, 19 * s, 6.4 * s);

  // cannon ports on both broadsides
  g.fillStyle(0x10181f, 1);
  for (const cx of [-8, -2, 4]) {
    g.fillCircle(cx * s, -6 * s, 1.5 * s);
    g.fillCircle(cx * s, 6 * s, 1.5 * s);
  }

  // sails seen from above
  g.fillStyle(sailColor, 0.95);
  g.fillTriangle(-9 * s, -4 * s, -9 * s, 4 * s, -1.5 * s, 0);
  g.fillTriangle(1 * s, -3.5 * s, 1 * s, 3.5 * s, 7.5 * s, 0);

  // mast
  g.fillStyle(0x3a2a18, 1);
  g.fillCircle(-5 * s, 0, 1.4 * s);

  g.generateTexture(key, w, h);
  g.destroy();
}

// Fire ship — a scorched sloop hull, sails alight, powder kegs on deck
function makeFireShip(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const w = 36;
  const h = 22;
  g.translateCanvas(w / 2, h / 2);

  // blackened hull (pointed bow facing +x)
  g.fillStyle(0x2a1a12, 1);
  g.beginPath();
  g.moveTo(-12, -4.5);
  g.lineTo(6, -4.5);
  g.lineTo(13, 0);
  g.lineTo(6, 4.5);
  g.lineTo(-12, 4.5);
  g.closePath();
  g.fillPath();
  g.lineStyle(1.5, 0xff7a2a, 0.7); // embers glow through the seams
  g.strokePath();

  // burning sails
  g.fillStyle(0xd94a1a, 0.95);
  g.fillTriangle(-6.5, -3, -6.5, 3, -1, 0);
  g.fillStyle(0xffb04a, 0.95);
  g.fillTriangle(0.5, -2.5, 0.5, 2.5, 5.5, 0);

  // powder kegs waiting to go
  g.fillStyle(0x6e4a2a, 1);
  g.fillCircle(-3, 2.5, 1.8);
  g.fillCircle(1.5, -2.5, 1.8);

  g.generateTexture('ship-fireship', w, h);
  g.destroy();
}

// Armored brig — heavy hull with an iron-plated bow you can SEE
function makeBrig(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const w = 56;
  const h = 30;
  g.translateCanvas(w / 2, h / 2);

  // heavy gray hull
  g.fillStyle(0x4a5560, 1);
  g.beginPath();
  g.moveTo(-22, -8);
  g.lineTo(12, -8);
  g.lineTo(24, 0);
  g.lineTo(12, 8);
  g.lineTo(-22, 8);
  g.closePath();
  g.fillPath();
  g.lineStyle(1.5, 0x0a141c, 0.6);
  g.strokePath();

  // iron prow plate — the armored third, riveted
  g.fillStyle(0x9aa8b4, 1);
  g.beginPath();
  g.moveTo(8, -8);
  g.lineTo(12, -8);
  g.lineTo(24, 0);
  g.lineTo(12, 8);
  g.lineTo(8, 8);
  g.closePath();
  g.fillPath();
  g.fillStyle(0x2a343c, 1);
  for (const [rx, ry] of [[11, -5], [14, 0], [11, 5]]) g.fillCircle(rx, ry, 1);

  // deck
  g.fillStyle(0xd9c9a3, 0.9);
  g.fillRect(-16, -4, 24, 8);

  // gun ports, two rows of them
  g.fillStyle(0x10181f, 1);
  for (const cx of [-12, -6, 0, 6]) {
    g.fillCircle(cx, -7, 1.8);
    g.fillCircle(cx, 7, 1.8);
  }

  // dull sails
  g.fillStyle(0xcfc4a8, 0.95);
  g.fillTriangle(-13, -5, -13, 5, -4, 0);
  g.fillTriangle(-1, -4.5, -1, 4.5, 7, 0);

  g.generateTexture('ship-brig', w, h);
  g.destroy();
}

// Elite frigate — navy blue and gold, white sails, built to run down pirates
function makeFrigate(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const w = 60;
  const h = 30;
  g.translateCanvas(w / 2, h / 2);

  // long navy hull
  g.fillStyle(0x27435e, 1);
  g.beginPath();
  g.moveTo(-24, -7.5);
  g.lineTo(14, -7.5);
  g.lineTo(26, 0);
  g.lineTo(14, 7.5);
  g.lineTo(-24, 7.5);
  g.closePath();
  g.fillPath();
  g.lineStyle(1.5, 0xc8a24a, 0.9); // gold trim — the navy's pride
  g.strokePath();

  // deck
  g.fillStyle(0xd9c9a3, 0.9);
  g.fillRect(-18, -4, 28, 8);

  // a full gun deck
  g.fillStyle(0x10181f, 1);
  for (const cx of [-14, -8, -2, 4, 10]) {
    g.fillCircle(cx, -6.5, 1.7);
    g.fillCircle(cx, 6.5, 1.7);
  }

  // crisp white sails, three of them
  g.fillStyle(0xf2ead8, 0.95);
  g.fillTriangle(-16, -5, -16, 5, -7, 0);
  g.fillTriangle(-4, -5.5, -4, 5.5, 5, 0);
  g.fillTriangle(7, -4.5, 7, 4.5, 14, 0);

  // masts
  g.fillStyle(0x3a2a18, 1);
  g.fillCircle(-11, 0, 1.6);
  g.fillCircle(1, 0, 1.6);

  g.generateTexture('ship-frigate', w, h);
  g.destroy();
}

function makeBossShip(scene: Phaser.Scene): void {
  // the Man O' War — nearly twice the player's length, black hull, gold trim, crimson sails
  const g = scene.add.graphics();
  const w = 84;
  const h = 40;
  g.translateCanvas(w / 2, h / 2);

  // hull
  g.fillStyle(0x23232e, 1);
  g.beginPath();
  g.moveTo(-34, -11);
  g.lineTo(18, -11);
  g.lineTo(36, 0);
  g.lineTo(18, 11);
  g.lineTo(-34, 11);
  g.closePath();
  g.fillPath();
  g.lineStyle(2, 0xc8a24a, 0.9);
  g.strokePath();

  // deck
  g.fillStyle(0xd9c9a3, 0.9);
  g.fillRect(-26, -5, 38, 10);

  // two full gun decks
  g.fillStyle(0x10181f, 1);
  for (const cx of [-22, -14, -6, 2, 10]) {
    g.fillCircle(cx, -10, 2);
    g.fillCircle(cx, 10, 2);
  }

  // crimson sails, three of them
  g.fillStyle(0x8a2a2a, 0.95);
  g.fillTriangle(-26, -7, -26, 7, -15, 0);
  g.fillTriangle(-11, -8, -11, 8, 1, 0);
  g.fillTriangle(5, -6, 5, 6, 14, 0);

  // masts
  g.fillStyle(0x3a2a18, 1);
  g.fillCircle(-20, 0, 2);
  g.fillCircle(-5, 0, 2);

  g.generateTexture('ship-manowar', w, h);
  g.destroy();
}

function makeIsland(scene: Phaser.Scene, key: string, variant: number): void {
  const g = scene.add.graphics();
  g.translateCanvas(120, 100);

  // sand ring
  g.fillStyle(0xcbb27a, 1);
  g.fillEllipse(0, 0, 190, 150);
  g.fillStyle(0xbfa468, 1);
  g.fillEllipse(8, 6, 155, 115);

  // grass blobs, different layout per variant
  const layouts: [number, number, number][][] = [
    [[-30, -15, 26], [18, 12, 19]],
    [[0, -22, 28], [-42, 14, 16], [36, 20, 14]],
    [[-8, 2, 34]],
  ];
  const blobs = layouts[variant % layouts.length];
  g.fillStyle(0x4a8a5a, 1);
  for (const [bx, by, br] of blobs) g.fillCircle(bx, by, br);

  // palms
  g.fillStyle(0x2e5c3a, 1);
  for (const [bx, by, br] of blobs) {
    g.fillCircle(bx + br * 0.3, by - br * 0.2, br * 0.38);
  }
  g.fillStyle(0x5a3d22, 1);
  for (const [bx, by, br] of blobs) {
    g.fillCircle(bx + br * 0.3, by - br * 0.2, br * 0.12);
  }

  // rocks
  g.fillStyle(0x8a8a8a, 1);
  g.fillCircle(-62, 30, 7);
  g.fillCircle(66, -24, 5);
  if (variant === 2) g.fillCircle(50, 40, 6);

  g.generateTexture(key, 240, 200);
  g.destroy();
}

function makeBall(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0x22262b, 1);
  g.fillCircle(4, 4, 3.5);
  g.fillStyle(0x9aa7b0, 0.9);
  g.fillCircle(3, 3, 1.2);
  g.generateTexture('ball', 8, 8);
  g.destroy();
}

function makeLoot(scene: Phaser.Scene): void {
  // coin crate
  let g = scene.add.graphics();
  g.fillStyle(0x6e4a2a, 1);
  g.fillRect(1, 3, 10, 8);
  g.lineStyle(1, 0x3c2812, 1);
  g.strokeRect(1, 3, 10, 8);
  g.fillStyle(0xffd97a, 1);
  g.fillRect(1, 6, 10, 2);
  g.generateTexture('loot', 12, 12);
  g.destroy();

  // rum barrel (healing)
  g = scene.add.graphics();
  g.fillStyle(0x7a4a22, 1);
  g.fillEllipse(6, 6, 9, 11);
  g.lineStyle(1, 0x3c2812, 1);
  g.strokeEllipse(6, 6, 9, 11);
  g.lineStyle(1, 0xd9c9a3, 0.9);
  g.lineBetween(2, 4, 10, 4);
  g.lineBetween(2, 8, 10, 8);
  g.generateTexture('loot-rum', 12, 12);
  g.destroy();

  // powder keg (fire-rate buff)
  g = scene.add.graphics();
  g.fillStyle(0x2b2f36, 1);
  g.fillEllipse(6, 6, 9, 11);
  g.lineStyle(1, 0x10141a, 1);
  g.strokeEllipse(6, 6, 9, 11);
  g.fillStyle(0xff8a3a, 1);
  g.fillCircle(6, 2, 1.6);
  g.generateTexture('loot-powder', 12, 12);
  g.destroy();

  // relic chest (card draft)
  g = scene.add.graphics();
  g.fillStyle(0xc89aff, 0.35);
  g.fillCircle(6, 6, 6);
  g.fillStyle(0xc8a24a, 1);
  g.fillRect(1, 3, 10, 8);
  g.lineStyle(1, 0x7a5c1e, 1);
  g.strokeRect(1, 3, 10, 8);
  g.fillStyle(0xffffff, 1);
  g.fillRect(1, 6, 10, 2);
  g.generateTexture('loot-relic', 12, 12);
  g.destroy();
}

function makeFoam(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(4, 4, 3);
  g.generateTexture('foam', 8, 8);
  g.destroy();
}

function makeWhirlpool(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.translateCanvas(80, 80);
  // concentric broken rings; the game object rotates for the swirl
  for (let i = 0; i < 4; i++) {
    g.lineStyle(3 - i * 0.5, 0xbfe6f2, 0.65 - i * 0.12);
    const r = 62 - i * 13;
    g.beginPath();
    g.arc(0, 0, r, Phaser.Math.DegToRad(i * 45), Phaser.Math.DegToRad(270 + i * 45), false);
    g.strokePath();
  }
  g.fillStyle(0x06283d, 0.9);
  g.fillCircle(0, 0, 9);
  g.generateTexture('whirlpool', 160, 160);
  g.destroy();
}

function makeGlint(scene: Phaser.Scene): void {
  // sparkle marking sunken treasure below
  const g = scene.add.graphics();
  g.lineStyle(2, 0xfff6c8, 0.95);
  g.lineBetween(6, 0, 6, 12);
  g.lineBetween(0, 6, 12, 6);
  g.lineStyle(1, 0xfff6c8, 0.6);
  g.lineBetween(2, 2, 10, 10);
  g.lineBetween(10, 2, 2, 10);
  g.generateTexture('glint', 12, 12);
  g.destroy();
}

function makeBarrel(scene: Phaser.Scene): void {
  // burning barrel dropped astern
  const g = scene.add.graphics();
  g.fillStyle(0x4a3524, 1);
  g.fillEllipse(6, 7, 9, 10);
  g.lineStyle(1, 0x2a1c10, 1);
  g.strokeEllipse(6, 7, 9, 10);
  g.fillStyle(0xff8a3a, 1);
  g.fillCircle(6, 3, 2.6);
  g.fillStyle(0xffd97a, 1);
  g.fillCircle(6, 3, 1.2);
  g.generateTexture('barrel', 12, 12);
  g.destroy();
}

function makeShell(scene: Phaser.Scene): void {
  // mortar shell — bigger and meaner than a cannonball
  const g = scene.add.graphics();
  g.fillStyle(0x1a1e24, 1);
  g.fillCircle(5, 5, 4.5);
  g.fillStyle(0x9aa7b0, 0.9);
  g.fillCircle(3.5, 3.5, 1.4);
  g.fillStyle(0xff8a3a, 1);
  g.fillCircle(7.5, 2.5, 1);
  g.generateTexture('shell', 10, 10);
  g.destroy();
}

function makeHarpoon(scene: Phaser.Scene): void {
  // long harpoon bolt, barb facing +x
  const g = scene.add.graphics();
  g.lineStyle(2, 0x8a8f96, 1);
  g.lineBetween(0, 3, 20, 3);
  g.fillStyle(0xd8dde2, 1);
  g.fillTriangle(18, 0, 18, 6, 24, 3);
  g.generateTexture('harpoon', 24, 6);
  g.destroy();
}

function makeEmber(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0xff8a3a, 0.95);
  g.fillCircle(3, 3, 2.5);
  g.generateTexture('ember', 6, 6);
  g.destroy();
}

function makeCloud(scene: Phaser.Scene): void {
  // soft blobby cloud — also tinted black for water shadows
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 0.85);
  g.fillEllipse(70, 55, 120, 50);
  g.fillEllipse(130, 45, 100, 55);
  g.fillEllipse(160, 60, 80, 40);
  g.fillEllipse(40, 62, 70, 35);
  g.generateTexture('cloud', 220, 100);
  g.destroy();
}

function makeLight(scene: Phaser.Scene): void {
  // soft radial glow for the ship's lantern at night
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 214, 140, 0.9)');
  grad.addColorStop(0.35, 'rgba(255, 190, 110, 0.35)');
  grad.addColorStop(1, 'rgba(255, 180, 100, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  scene.textures.addCanvas('light', canvas);
}

// Floating coffin — dark box, pale cross, bobbing on the tide
function makeCoffin(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.translateCanvas(13, 8);
  g.fillStyle(0x3a2a1a, 1);
  g.fillRect(-11, -5, 22, 10);
  g.lineStyle(1.5, 0x1a1008, 1);
  g.strokeRect(-11, -5, 22, 10);
  g.lineStyle(2, 0xcfc4a8, 0.8);
  g.lineBetween(-6, 0, 4, 0);
  g.lineBetween(-1, -3, -1, 3);
  g.generateTexture('coffin', 26, 16);
  g.destroy();
}

// The whale — a great dark back, tail fluke, and a spout waiting to happen
function makeWhale(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.translateCanvas(40, 22);
  // body (facing +x like the ships)
  g.fillStyle(0x3a5468, 1);
  g.fillEllipse(2, 2, 62, 22);
  // pale belly shadow
  g.fillStyle(0x6a8aa0, 0.5);
  g.fillEllipse(8, 7, 44, 10);
  // tail fluke
  g.fillStyle(0x3a5468, 1);
  g.fillTriangle(-28, 0, -40, -8, -40, 6);
  // fin
  g.fillTriangle(4, 2, -6, 14, 12, 12);
  // blowhole
  g.fillStyle(0x1a2833, 1);
  g.fillCircle(20, -4, 1.5);
  g.generateTexture('whale', 80, 44);
  g.destroy();
}

// Smuggler's cache — lashed crates riding low in the water
function makeCache(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.translateCanvas(16, 12);
  g.fillStyle(0x6e4a2a, 1);
  g.fillRect(-13, -6, 12, 10);
  g.fillRect(1, -5, 11, 9);
  g.fillRect(-6, 2, 12, 8);
  g.lineStyle(1, 0x3a2412, 1);
  g.strokeRect(-13, -6, 12, 10);
  g.strokeRect(1, -5, 11, 9);
  g.strokeRect(-6, 2, 12, 8);
  // rope lashing
  g.lineStyle(1.5, 0xd9c9a3, 0.9);
  g.lineBetween(-14, 0, 13, 0);
  g.lineBetween(0, -7, 0, 11);
  g.generateTexture('cache', 32, 24);
  g.destroy();
}

function makeDebris(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0x6e4a2a, 1);
  g.fillRect(0, 0, 12, 4);
  g.lineStyle(1, 0x3c2812, 1);
  g.strokeRect(0, 0, 12, 4);
  g.generateTexture('debris', 12, 4);
  g.destroy();
}

function makePort(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.translateCanvas(100, 100);

  // sandy island
  g.fillStyle(0xcbb27a, 1);
  g.fillEllipse(0, 0, 150, 120);
  g.fillStyle(0xbfa468, 1);
  g.fillEllipse(20, 14, 90, 60);

  // greenery
  g.fillStyle(0x3f7a4a, 1);
  g.fillCircle(-30, -18, 22);
  g.fillCircle(-52, 2, 14);

  // dock reaching out into the water
  g.fillStyle(0x6e4a2a, 1);
  g.fillRect(60, -10, 70, 20);
  g.fillStyle(0x54371d, 1);
  for (const px of [70, 90, 110, 128]) {
    g.fillRect(px, -12, 4, 24);
  }

  // buildings with red roofs
  g.fillStyle(0xe8e0cc, 1);
  g.fillRect(-6, -20, 22, 18);
  g.fillStyle(0xa83c32, 1);
  g.fillTriangle(-10, -20, 20, -20, 5, -32);
  g.fillStyle(0xe8e0cc, 1);
  g.fillRect(22, -4, 16, 14);
  g.fillStyle(0xa83c32, 1);
  g.fillTriangle(19, -4, 41, -4, 30, -14);

  g.generateTexture('port', 200, 200);
  g.destroy();
}
