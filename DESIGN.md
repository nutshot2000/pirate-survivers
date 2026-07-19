# SALT & POWDER — Design Document

*Working title. A top-down pirate roguelite for the browser (prototype) — with Steam in its future.*

**The pitch:** Vampire Survivors' upgrade dopamine meets Sid Meier's *Pirates!* Sail a living sea, hunt merchants, duel navy ships, plunder wrecks and dredge sunken treasure — then bank it all at port into an ever-deadlier ship, while your own notoriety hunts you back.

---

## Design pillars

1. **The sea is alive** — ships mind their own business, loot drifts by, treasure glints beneath the waves, islands dot the horizon. The world feels inhabited, not staged.
2. **Every fight is a choice** — nothing attacks unless you sail into it. Close in, give a wide berth, sink them, or spare them and board for better pay.
3. **Greed is the difficulty slider** — notoriety rises with every kill; hunters spawn because of *what you did*. The player authors their own danger.
4. **Upgrades you can feel** — everything stacks multiplicatively, so builds genuinely diverge: a deadeye long-range sniper plays nothing like a chain-shot rammer or a winch-rigged treasure barge.

## The core loop

**Sail → spot prey/treasure → kill or capture → plunder → port → upgrade → hunt bigger.**

---

## Current state — what's implemented (v0.3, playable)

### Sailing & world
- Momentum sailing (W/S sails, A/D rudder), drag, turn rate, foam wake, camera follow with lag
- 6000×6000 world, two parallax procedurally-generated water layers
- 14 islands (rock-solid manual collision) — one guaranteed landmark near spawn
- 4 whirlpools that drag *all* ships in and chew up whatever reaches the core (environmental kills work on enemies — baiting hunters in is a legit tactic)
- Minimap: islands, treasure, port, whirlpools, ships color-coded by state, player heading

### Combat
- Auto-firing broadsides, port and starboard arcs with independent cooldowns — positioning *is* aiming
- Spread, accuracy (tighter fan + faster shot), range, multi-shot, chain-shot slow
- Damage numbers, hit flash, splash particles, cannonballs splash when they fall short
- Enemy navy gunboats fire back while orbiting at broadside range

### Enemies & AI
| Ship | Behavior | Notes |
|---|---|---|
| **Sloop** (red) | Charges and rams | Low HP, swarm-minded |
| **Gunboat** (navy) | Orbits at range, fires volleys | +1 notoriety when sunk |
| **Merchant** (tan) | Unarmed, *flees* when approached | Fat loot, +2 notoriety |
| **Hunter** (red-tinted gunboat) | Spawns pre-aggroed at ★3+ notoriety, faster, never breaks off | Your greed, personified |
| **Fire Ship** (burning, ★1+) | Charges and **detonates** on contact or death | Blast hurts EVERYONE in radius — bait packs, chain-react. No notoriety |
| **Armored Brig** (iron prow, ★2+) | Slow, orbits, 2-ball volleys, rams hard | Head-on shot does 30% — flank, burn, mortar, or ram her. +1 notoriety |
| **Elite Frigate** (navy+gold, ★3+, max 1) | Kites at long range; **gold flash telegraphs a 6-ball fan with a gap** | Never surrenders, worth 2 XP, always drops a relic. +2 notoriety |

- AI states: wander → aggro (within 700px — **halved inside fog banks**, and **never in the shallows** unless provoked) → deaggro (beyond 1050px); island collision veering
- Firing on a ship **provokes** it — even in safe waters, even at extreme range
- Ram damage is generalized: any hull with `ramDamage > 0` hurts on collision; sloops still dash themselves to splinters
- Surrendered hulks don't count against the world spawn cap

### Surrender & boarding
- Ships below 35% HP can **strike their colors** ⚑ (merchants 40%, gunboats 25%, sloops 20%)
- Surrendered ships stop fighting; your broadsides hold fire on them
- Sail within 130px to **board**: 1.4× coins + guaranteed rum/powder (+relic chance on merchants), +1 notoriety, then the emptied hulk slips under
- Or sink them anyway for scraps. The pirate's choice.

### Looting (four ways to get rich)
1. **Wrecks** — hulls spill cargo by manifest: gunboats carry powder, merchants carry relics
2. **Boarding** — better pay than sinking (see above)
3. **Treasure islands** (4, marked ✕) — E to dig, coin burst + rum, 25% free card draft
4. **The sea herself** — flotsam drifts by every ~9s; **sunken treasure glints** (5, pulsing) can be dredged by hovering 2.5s… or harpooned

### Sea events (moments of choice, ~1 per minute)
Every event spawns nearby, announces itself, and drifts away if ignored — all on the minimap.
| Event | The choice |
|---|---|
| **Distress call** ⚑ | Genuine sailors share cargo… or it's a **navy decoy** (45% + 5%/★, cap 75%). The trap scales with infamy: gunboats, **+a fire ship at ★2, a brig at ★4** |
| **Floating coffin** | Pry it open: burial coins, rum, bare bones… or **THE DEAD RESENT YOU** (curse damage) |
| **Smuggler's cache** | Fat lashed cargo — 50% chance **hidden guards** (2 sloops) spring as you close in |
| **Following whale** | Shadows your wake ~70s, spouts; may **flush a sunken treasure glint** up for you (40%/spout) |

### Biomes — the rings of risk
- **Golden shallows** (within 1400px of Port Royal): warm sunlit water; genuinely safe — nothing turns hostile here unless you fire first, and drifting traffic bumps hulls without bloodshed
- **Open sea**: the standard hunt
- **Storm belt** (2800–4200px): steel-gray water — a **swell shoves every hull** every ~3.6s, lightning flashes with thunder rolling behind, rain spray
- **The deep** (beyond 4200px): dark steel-blue; the spawn mix turns ugly (hunters, brigs, fire ships) and all coin pays **×1.5**
- **Fog banks** (3, scattered open water): layered drifting mist; predators inside spot you at barely **half range** — and 2 hulls lurk in each
- The minimap charts the rings and the banks; the zone tint is multiply-graded so the water's sparkle survives

### Loot types
| Drop | Effect |
|---|---|
| Coin crate | Gold (mundane cargo washes away after 30s) |
| Rum barrel | +12% max HP (min 8) |
| Powder keg | +25% fire rate for 12s (⚡ HUD timer) |
| Relic chest | Instant card draft — **never washes away** |

### The Salvage Winch (port upgrade, 3 levels: 80/140/220g)
Auto-harpoon that spears sunken treasure and far loot, reels it home with a visible harpoon line.
- L1: 280px reach · L2: 380px + **glints revealed on minimap** · L3: 480px, fast reel

### Progression
- Kills → XP → level-up → **card draft** (pick 1 of 3), with three card types:
  - **NEW WEAPON** (gold) — adds a weapon system to your ship
  - **UPGRADE** (blue) — levels an owned weapon (5 levels each, card says exactly what improves)
  - **CREW** (gray) — passive stats: Heavier Shot, Powder Monkeys, Reinforced Hull, Silk Sails, Navigator's Eye, Deadeye Gunners, Long Nines, Chain Shot
- **6 weapons** (HUD loadout display bottom-left):
  | Weapon | Behavior |
  |---|---|
  | **Broadsides** (starter) | Side-arc auto-fire; levels add balls/damage/reload |
  | **Fire Barrels** | Burning slicks dropped astern; area burn-over-time |
  | **Mortar** | Lobs AoE shells at nearest enemy; huge blast + shockwave ring |
  | **Harpoon Ballista** | Bow chaser, pierces through ships, slows (tangled rigging) |
  | **Swivel Guns** | Stern chasers, anti-pursuit |
  | **Iron Ram Prow** | Contact damage on collision + half ram damage taken |
- **Evolutions**: max a weapon (Lv5) + hold its matching crew card → the next draft guarantees a purple **EVOLUTION** card (all tuning in `EVOLUTION` in config.ts):
  | Pair | Evolved form | What it does |
  |---|---|---|
  | Broadsides + Deadeye Gunners | **Devastator Barrage** | Triple volley per broadside (0/140/280ms), −15% dmg per ball, +30% reload |
  | Fire Barrels + Silk Sails | **Inferno Wake** | Barrels +50% dmg/size; sailing fast lays a continuous burning wake |
  | Mortar + Heavier Shot | **Doombringer** | +40% dmg, +50% blast, crater burns 4s (glowing shell) |
  | Harpoon + Long Nines | **Kraken's Spear** | +50% dmg, ~infinite pierce, 900-speed barb, 3s tangle, yanks victims toward you |
  | Swivel Guns + Chain Shot | **Wasp Nest** | 360° auto-target, 4-ball fan; chain-shackle comes free with the requirement |
  | Iron Ram Prow + Reinforced Hull | **Leviathan Prow** | ×2.2 contact dmg, heavy knockback + stun, you take NO ram damage |
- **Port Royal shop**: repair, damage, fire rate, hull, speed, accuracy (scaling costs) + the winch
- **Notoriety**: gunboats +1, merchants +2, boarding +1 → drives hunter spawns and world population
- Enemy HP bars over damaged ships; hit-flash no longer erases hunter/surrender/enrage tints

### Juice & atmosphere
- Fully synthesized WebAudio SFX (zero audio files): cannons, hits, coins, sinking, digging, harpoon, boss horn, shop, level-up fanfare, hurt
- **Day/night cycle** (4 min): dawn → golden hour → sunset → dusk → night, color-graded washes + a warm **lantern glow** around your ship at night
- **Ocean ambience**: looping waves, random gull cries, hull creaks
- **Adaptive sea shanty**: original procedural tune that builds with your run — bass drone always, melody at level 2+, rhythm section at notoriety ★3+
- Drifting **clouds** with shadows on the water
- **Cannon recoil** (broadsides nudge your ship), muzzle flash embers
- Sinking ships leave drifting **wood debris**
- Floating text feedback everywhere (damage, loot, events)
- **UI layer**: HUD/minimap/boss bar/sky washes live in a separate unzoomed UI scene — **H** hides the HUD, **TAB** opens the captain's ledger (purse, armament, refits)
- **ESC drops anchor** (pause menu); switching away from the tab drops it for you — no more unfair deaths

### The Legendary Bounty (boss + win condition)
- At **★5 notoriety**, the navy sends the **HMS INEXORABLE** — horn blast, screen shake, gold minimap dot
- 600 HP Man O' War with a screen-top boss health bar; charges you firing 7-ball broadside fans
- Launches 2 sloop escorts every 12s (cap 5); **enrages at 50% HP** (faster double volleys, red tint)
- Never surrenders, immune to whirlpools, ramming it hurts *you* (20 dmg)
- Kill payout: 60–90g + **2 guaranteed relics** + rum + powder, then the **LEGENDARY BOUNTY CLAIMED** victory screen → endless mode or new voyage
- In endless mode the navy never forgives: **another Man O' War answers every +5 notoriety**

### Already procedural
- Islands, whirlpools, sunken glints, flotsam, and ship spawns all reroll on every run/restart — no two voyages share a sea (port location is fixed by design, for now)

---

## The road forward

### Tier 1 — prototype depth (next up)
- ~~**Boss**: legendary bounty at ★5~~ **DONE** (HMS INEXORABLE)
- ~~**Procedural map reroll**~~ **DONE** (world rerolls every run; seeded runs for dailies still TODO)
- ~~**New weapons**: fire barrels, mortar, harpoon, ram prow, swivel guns — 6 weapons × 5 levels~~ **DONE**
- ~~**Evolutions**: max a weapon + hold the matching crew card → evolved form~~ **DONE** (6 pairs, e.g. Broadsides + Deadeye Gunners = triple-volley *Devastator Barrage*)
- ~~**Biomes/zones**: golden shallows (safe), storm belt (lightning, waves push you), fog banks (ambushes), the deep (monsters)~~ **DONE** (sea-serpent monster for the deep still TODO)
- ~~**Day/night cycle** over a run; night = scarier, better loot~~ **DONE** (4-min cycle, lantern glow; night-loot hook still TODO)
- ~~**Sea events table**: distress calls (maybe traps), floating coffins, a following whale, smuggler caches~~ **DONE**
- ~~**New enemies**: fire ships (sail at you and explode), elite frigates with dodgeable volley patterns, armored brigs~~ **DONE**
- ~~**Music**: procedural shanty layers that build as your build grows~~ **DONE** (adaptive WebAudio shanty)

### Tier 2 — roguelite structure (the "proper game")
- **Multiple ports**: navy / merchant / pirate haven / smuggler cove — different stock and prices; some refuse you at high notoriety
- **Tavern**: rumors that mark treasure/bounties on the map; hire named crew specialists who level up
- **Trading**: buy low/sell high between ports, cargo hold capacity — a heavy hold makes you slow *and* hunted
- **Cursed relics**: powerful items with hooks (raise the **curse** dial — the supernatural notices you)
- **Three escalation dials**: notoriety (humans), curse (supernatural), depth (distance from safe waters) — player-controlled difficulty
- **Captains & hulls**: unlockable starting characters/ships (smuggler: fast + big hold; ex-navy: military cannons, wanted from the start)
- **Meta progression**: permanent home-port upgrades; achievements unlock new cards into the draft pool forever
- **Run finale**: kill the legendary bounty, then the Royal Navy armada closes in — survive or die glorious; endless mode after
- **Challenge modifiers**: permadeath ironman, eternal storm, no-ports, max notoriety start
- **Save system** (localStorage → Steam Cloud later)

### Tier 3 — the works
- **The bestiary**: kraken (tentacles as arena hazards, sever 8 to win — heart becomes *Summon the Deep* weapon), megalodon (ambush rammer, teeth for crafting), the Flying Dutchman (ghost boss, only hittable when it fires), sirens (charm your own crew), the Leviathan (endgame, a living island)
- **Fleet system**: capture ships and sail with an escort you upgrade
- **Faction reputation**: navy / pirates / merchants remember how you treat them
- **Named legendary captains** as recurring bounty bosses
- **Daily seed + leaderboards**

---

## Tech notes

- **Stack**: Phaser 3 + TypeScript + Vite. Zero asset files — every sprite is generated in code (`src/textures.ts`), every sound synthesized (`src/systems/sfx.ts`)
- **All tuning lives in `src/config.ts`** — speeds, costs, drop rates, spawn rules. Tweak → refresh → feel it
- **Structure**:
  - `src/scenes/GameScene.ts` — the world (spawning, combat, looting, whirlpools, shop, drafts)
  - `src/scenes/UIScene.ts` — screen-space HUD (unzoomed camera), minimap, boss bar, sky washes, captain's ledger
  - `src/objects/` — `PlayerShip`, `EnemyShip` (AI states), `BossShip`
  - `src/systems/` — `cards.ts` (mods + draft pool), `weapons.ts` (6 weapons × 5 lvls), `sfx.ts`, `sky.ts` (shared day/night state)
  - `src/ui/overlays.ts` — DOM overlays (draft/shop/death/victory)
- **Run it**: `npm install` once, then `npm run dev` → http://localhost:5173 · **Build**: `npm run build`
- **Future engine question**: if this heads to Steam, options are keep Phaser (ships fine on Steam via Electron/Tauri) or port to Rust/Bevy or Godot once the design is proven. Game logic translates directly; the design doc is engine-agnostic.

## Selling it — honest assessment

**For**: The VS-like genre is proven on Steam; "Vampire Survivors × Pirates!" is a one-line hook anyone gets; the loop is *already fun at v0.1*, which is the hard part; low art requirements (stylized top-down + shader water is achievable for a tiny team); demo-friendly (perfect Steam Next Fest material).

**Needed before a Steam page**: real art direction (commissioned or a deliberate procedural style), music, ~3–5× content (weapons, enemies, biomes, ports), meta progression, a win condition, save system, gamepad support, and a few months of playtesting.

**Realistic path**: finish Tier 1 → private playtests → Tier 2 essentials (meta progression, win condition, more ports) → free demo → Steam page + wishlists → Early Access.
