// Persistent captain's records (localStorage). The roguelite memory:
// bests to beat, lifetime tallies — the "one more run" hook.

export interface Records {
  bestCoins: number;
  bestKills: number;
  bestNotoriety: number;
  bestLevel: number;
  runs: number;
  totalSunk: number;
  bossesFelled: number;
}

const KEY = 'salt-and-powder-records';

function blank(): Records {
  return { bestCoins: 0, bestKills: 0, bestNotoriety: 0, bestLevel: 0, runs: 0, totalSunk: 0, bossesFelled: 0 };
}

export function loadRecords(): Records {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return { ...blank(), ...(JSON.parse(raw) as Partial<Records>) };
  } catch {
    return blank();
  }
}

export interface RunStats {
  coins: number;
  kills: number;
  notoriety: number;
  level: number;
  bosses: number;
}

// called when a voyage ends (death or legendary bounty claimed); a voyage that
// claims the bounty and sails on only tallies its lifetime stats once
export function recordRun(stats: RunStats, countLifetime = true): Records {
  const r = loadRecords();
  r.bestCoins = Math.max(r.bestCoins, stats.coins);
  r.bestKills = Math.max(r.bestKills, stats.kills);
  r.bestNotoriety = Math.max(r.bestNotoriety, stats.notoriety);
  r.bestLevel = Math.max(r.bestLevel, stats.level);
  if (countLifetime) {
    r.runs += 1;
    r.totalSunk += stats.kills;
    r.bossesFelled += stats.bosses;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    // private browsing etc — records are nice-to-have, not vital
  }
  return r;
}
