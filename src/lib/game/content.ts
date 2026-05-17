import type {
  CardId,
  CombatState,
  EnemyIntent,
  EnemyState,
  EnemyTemplateId,
  PlayerState,
  Statuses
} from "./types";
import { emptyStatuses } from "./types";
import { type RngState, randInt, pick, shuffle } from "@/lib/rng";

// =============================================================================
// All card and enemy logic. Server-only: clients receive a stripped CardView
// (id, name, cost, description) computed by view.ts.
// =============================================================================

// ---------- Damage helpers --------------------------------------------------

// Modify base attack damage by attacker.strength, attacker.weak, target.vulnerable.
// Order matches Slay the Spire: (base + strength) → weak × 0.75 → vuln × 1.5.
export function modifyAttack(
  attackerStatuses: Statuses,
  targetStatuses: Statuses,
  base: number
): number {
  let d = base + attackerStatuses.strength;
  if (attackerStatuses.weak > 0) d = Math.floor(d * 0.75);
  if (targetStatuses.vulnerable > 0) d = Math.floor(d * 1.5);
  return Math.max(0, d);
}

function applyDamage(target: { hp: number; block: number }, amount: number): void {
  if (amount <= 0) return;
  const absorbed = Math.min(target.block, amount);
  target.block -= absorbed;
  target.hp = Math.max(0, target.hp - (amount - absorbed));
}

export function dealAttackToEnemy(combat: CombatState, target: EnemyState, base: number): void {
  applyDamage(target, modifyAttack(combat.player.statuses, target.statuses, base));
}

export function dealTrueDamageToEnemy(target: EnemyState, amount: number): void {
  applyDamage(target, amount);
}

export function dealAttackToPlayer(player: PlayerState, attacker: Statuses, base: number): void {
  applyDamage(player, modifyAttack(attacker, player.statuses, base));
}

// ---------- Cards -----------------------------------------------------------

export type CardTargeting = "enemy" | "self" | "all_enemies" | "none";

export type Card = {
  id: CardId;
  name: string;
  cost: number;
  targeting: CardTargeting;
  description: string;
  exhaust?: boolean;
  apply: (ctx: ApplyContext) => void;
};

export type ApplyContext = {
  combat: CombatState;
  target?: EnemyState;
  rng: RngState;
  drawCards: (n: number) => void;
};

function gainBlock(combat: CombatState, amount: number): void {
  // Future hook: Dexterity status would add here.
  combat.player.block += Math.max(0, amount);
}

export const CARDS: Record<CardId, Card> = {
  // ---- Starter / common --------------------------------------------------
  strike: {
    id: "strike",
    name: "Strike",
    cost: 1,
    targeting: "enemy",
    description: "Deal 6 damage.",
    apply: ({ combat, target }) => target && dealAttackToEnemy(combat, target, 6)
  },
  defend: {
    id: "defend",
    name: "Defend",
    cost: 1,
    targeting: "self",
    description: "Gain 5 block.",
    apply: ({ combat }) => gainBlock(combat, 5)
  },
  thunderclap: {
    id: "thunderclap",
    name: "Thunderclap",
    cost: 1,
    targeting: "all_enemies",
    description: "Deal 4 damage and apply 1 Vulnerable to ALL enemies.",
    apply: ({ combat }) => {
      for (const e of combat.enemies) {
        dealAttackToEnemy(combat, e, 4);
        e.statuses.vulnerable += 1;
      }
    }
  },

  // ---- Damage ------------------------------------------------------------
  bash: {
    id: "bash",
    name: "Bash",
    cost: 2,
    targeting: "enemy",
    description: "Deal 8 damage. Apply 2 Vulnerable.",
    apply: ({ combat, target }) => {
      if (!target) return;
      dealAttackToEnemy(combat, target, 8);
      target.statuses.vulnerable += 2;
    }
  },
  iron_wave: {
    id: "iron_wave",
    name: "Iron Wave",
    cost: 1,
    targeting: "enemy",
    description: "Gain 5 block. Deal 5 damage.",
    apply: ({ combat, target }) => {
      gainBlock(combat, 5);
      if (target) dealAttackToEnemy(combat, target, 5);
    }
  },
  cleave: {
    id: "cleave",
    name: "Cleave",
    cost: 1,
    targeting: "all_enemies",
    description: "Deal 8 damage to ALL enemies.",
    apply: ({ combat }) => {
      for (const e of combat.enemies) dealAttackToEnemy(combat, e, 8);
    }
  },
  surge: {
    id: "surge",
    name: "Surge",
    cost: 2,
    targeting: "enemy",
    description: "Deal 14 damage. Exhaust.",
    exhaust: true,
    apply: ({ combat, target }) => target && dealAttackToEnemy(combat, target, 14)
  },
  heavy_slash: {
    id: "heavy_slash",
    name: "Heavy Slash",
    cost: 2,
    targeting: "enemy",
    description: "Deal 14 damage.",
    apply: ({ combat, target }) => target && dealAttackToEnemy(combat, target, 14)
  },
  twin_strike: {
    id: "twin_strike",
    name: "Twin Strike",
    cost: 1,
    targeting: "enemy",
    description: "Deal 5 damage twice.",
    apply: ({ combat, target }) => {
      if (!target) return;
      dealAttackToEnemy(combat, target, 5);
      if (target.hp > 0) dealAttackToEnemy(combat, target, 5);
    }
  },
  pummel: {
    id: "pummel",
    name: "Pummel",
    cost: 1,
    targeting: "enemy",
    description: "Deal 2 damage 4 times. Exhaust.",
    exhaust: true,
    apply: ({ combat, target }) => {
      if (!target) return;
      for (let i = 0; i < 4 && target.hp > 0; i++) dealAttackToEnemy(combat, target, 2);
    }
  },
  sword_boomerang: {
    id: "sword_boomerang",
    name: "Sword Boomerang",
    cost: 1,
    targeting: "all_enemies",
    description: "Deal 3 damage to a random enemy 3 times.",
    apply: ({ combat, rng }) => {
      for (let i = 0; i < 3; i++) {
        const alive = combat.enemies.filter((e) => e.hp > 0);
        if (alive.length === 0) return;
        const t = pick(rng, alive);
        dealAttackToEnemy(combat, t, 3);
      }
    }
  },
  body_slam: {
    id: "body_slam",
    name: "Body Slam",
    cost: 1,
    targeting: "enemy",
    description: "Deal damage equal to your current block.",
    apply: ({ combat, target }) => {
      if (!target) return;
      dealAttackToEnemy(combat, target, combat.player.block);
    }
  },
  sucker_punch: {
    id: "sucker_punch",
    name: "Sucker Punch",
    cost: 1,
    targeting: "enemy",
    description: "Deal 7 damage. Apply 1 Weak.",
    apply: ({ combat, target }) => {
      if (!target) return;
      dealAttackToEnemy(combat, target, 7);
      target.statuses.weak += 1;
    }
  },

  // ---- Skills ------------------------------------------------------------
  shrug_it_off: {
    id: "shrug_it_off",
    name: "Shrug It Off",
    cost: 1,
    targeting: "self",
    description: "Gain 8 block. Draw 1.",
    apply: ({ combat, drawCards }) => {
      gainBlock(combat, 8);
      drawCards(1);
    }
  },
  pommel_strike: {
    id: "pommel_strike",
    name: "Pommel Strike",
    cost: 1,
    targeting: "enemy",
    description: "Deal 9 damage. Draw 1.",
    apply: ({ combat, target, drawCards }) => {
      if (target) dealAttackToEnemy(combat, target, 9);
      drawCards(1);
    }
  },
  true_grit: {
    id: "true_grit",
    name: "True Grit",
    cost: 1,
    targeting: "self",
    description: "Gain 7 block.",
    apply: ({ combat }) => gainBlock(combat, 7)
  },
  bloodletting: {
    id: "bloodletting",
    name: "Bloodletting",
    cost: 0,
    targeting: "self",
    description: "Lose 3 HP. Gain 2 energy.",
    apply: ({ combat }) => {
      combat.player.hp = Math.max(1, combat.player.hp - 3);
      combat.player.energy += 2;
    }
  },
  disarm: {
    id: "disarm",
    name: "Disarm",
    cost: 1,
    targeting: "enemy",
    description: "Reduce enemy's Strength by 2. Exhaust.",
    exhaust: true,
    apply: ({ target }) => {
      if (target) target.statuses.strength -= 2;
    }
  },

  // ---- Powers ------------------------------------------------------------
  inflame: {
    id: "inflame",
    name: "Inflame",
    cost: 1,
    targeting: "self",
    description: "Gain 2 Strength.",
    apply: ({ combat }) => {
      combat.player.statuses.strength += 2;
    }
  },
  limit_break: {
    id: "limit_break",
    name: "Limit Break",
    cost: 1,
    targeting: "self",
    description: "Double your Strength. Exhaust.",
    exhaust: true,
    apply: ({ combat }) => {
      if (combat.player.statuses.strength > 0) {
        combat.player.statuses.strength *= 2;
      }
    }
  },

  // ============================================================
  // Tempest cards
  // ============================================================

  // ---- Tempest starter ----------------------------------------------------
  spark: {
    id: "spark",
    name: "Spark",
    cost: 1,
    targeting: "enemy",
    description: "Deal 5 damage.",
    apply: ({ combat, target }) => target && dealAttackToEnemy(combat, target, 5)
  },
  ward: {
    id: "ward",
    name: "Ward",
    cost: 1,
    targeting: "self",
    description: "Gain 5 block.",
    apply: ({ combat }) => gainBlock(combat, 5)
  },
  chain_bolt: {
    id: "chain_bolt",
    name: "Chain Bolt",
    cost: 1,
    targeting: "all_enemies",
    description: "Deal 4 damage to a random enemy twice.",
    apply: ({ combat, rng }) => {
      for (let i = 0; i < 2; i++) {
        const alive = combat.enemies.filter((e) => e.hp > 0);
        if (alive.length === 0) return;
        dealAttackToEnemy(combat, pick(rng, alive), 4);
      }
    }
  },

  // ---- Tempest class common ----------------------------------------------
  jolt: {
    id: "jolt",
    name: "Jolt",
    cost: 0,
    targeting: "enemy",
    description: "Deal 3 damage.",
    apply: ({ combat, target }) => target && dealAttackToEnemy(combat, target, 3)
  },
  static_discharge: {
    id: "static_discharge",
    name: "Static Discharge",
    cost: 1,
    targeting: "all_enemies",
    description: "Deal 4 damage to ALL enemies.",
    apply: ({ combat }) => {
      for (const e of combat.enemies) dealAttackToEnemy(combat, e, 4);
    }
  },
  lightning_rod: {
    id: "lightning_rod",
    name: "Lightning Rod",
    cost: 1,
    targeting: "enemy",
    description: "Deal 8 damage. Draw 1.",
    apply: ({ combat, target, drawCards }) => {
      if (target) dealAttackToEnemy(combat, target, 8);
      drawCards(1);
    }
  },
  insulate: {
    id: "insulate",
    name: "Insulate",
    cost: 1,
    targeting: "self",
    description: "Gain 8 block.",
    apply: ({ combat }) => gainBlock(combat, 8)
  },

  // ---- Tempest class rare ------------------------------------------------
  shock_wave: {
    id: "shock_wave",
    name: "Shock Wave",
    cost: 1,
    targeting: "all_enemies",
    description: "Apply 2 Vulnerable to ALL enemies. Exhaust.",
    exhaust: true,
    apply: ({ combat }) => {
      for (const e of combat.enemies) e.statuses.vulnerable += 2;
    }
  },
  conduit: {
    id: "conduit",
    name: "Conduit",
    cost: 1,
    targeting: "self",
    description: "Gain 3 Strength. Exhaust.",
    exhaust: true,
    apply: ({ combat }) => {
      combat.player.statuses.strength += 3;
    }
  },
  overcharge: {
    id: "overcharge",
    name: "Overcharge",
    cost: 0,
    targeting: "self",
    description: "Lose 4 HP. Gain 2 energy. Exhaust.",
    exhaust: true,
    apply: ({ combat }) => {
      combat.player.hp = Math.max(1, combat.player.hp - 4);
      combat.player.energy += 2;
    }
  },
  tempest: {
    id: "tempest",
    name: "Tempest",
    cost: 2,
    targeting: "all_enemies",
    description: "Deal 5 damage to ALL enemies. Apply 1 Vulnerable to ALL.",
    apply: ({ combat }) => {
      for (const e of combat.enemies) {
        dealAttackToEnemy(combat, e, 5);
        e.statuses.vulnerable += 1;
      }
    }
  }
};

// Reward pools available to every character.
export const NEUTRAL_COMMON: CardId[] = [
  "iron_wave", "cleave", "shrug_it_off", "true_grit", "body_slam"
];
export const NEUTRAL_RARE: CardId[] = [
  "bloodletting", "disarm", "inflame"
];

// ---------- Enemies ---------------------------------------------------------

type Move = (r: RngState, self: EnemyState, combat: CombatState) => EnemyIntent;

type EnemyTemplate = {
  id: EnemyTemplateId;
  name: string;
  hp: [number, number];
  pattern: Move[];
};

export const ENEMY_TEMPLATES: Record<EnemyTemplateId, EnemyTemplate> = {
  goblin: {
    id: "goblin",
    name: "Goblin",
    hp: [16, 20],
    pattern: [
      (r) => ({ kind: "attack", damage: randInt(r, 5, 7) }),
      () => ({ kind: "defend", block: 4 })
    ]
  },
  brute: {
    id: "brute",
    name: "Brute",
    hp: [28, 34],
    pattern: [
      (r) => ({ kind: "attack", damage: randInt(r, 8, 10) }),
      (r) => ({ kind: "attack", damage: randInt(r, 8, 10) }),
      () => ({ kind: "buff_strength", amount: 2 })
    ]
  },
  slime: {
    id: "slime",
    name: "Acid Slime",
    hp: [22, 28],
    pattern: [
      (r) => ({ kind: "attack", damage: randInt(r, 6, 9) }),
      () => ({ kind: "debuff", weak: 1 }),
      () => ({ kind: "defend", block: 5 })
    ]
  },
  spider: {
    id: "spider",
    name: "Tower Spider",
    hp: [14, 18],
    pattern: [
      () => ({ kind: "debuff", vulnerable: 2 }),
      (r) => ({ kind: "attack", damage: randInt(r, 7, 9) }),
      (r) => ({ kind: "attack", damage: randInt(r, 7, 9) })
    ]
  },
  cultist: {
    id: "cultist",
    name: "Cultist",
    hp: [20, 26],
    // Buffs up early, then unloads.
    pattern: [
      () => ({ kind: "buff_strength", amount: 3 }),
      (r) => ({ kind: "attack", damage: randInt(r, 6, 6) }),
      (r) => ({ kind: "attack", damage: randInt(r, 6, 6) })
    ]
  },
  sentry: {
    id: "sentry",
    name: "Tower Sentry",
    hp: [38, 42],
    pattern: [
      () => ({ kind: "defend", block: 8 }),
      (r) => ({ kind: "attack", damage: randInt(r, 10, 12) }),
      (r) => ({ kind: "attack_defend", damage: randInt(r, 6, 8), block: 4 })
    ]
  },
  bandit_captain: {
    id: "bandit_captain",
    name: "Bandit Captain",
    hp: [55, 65],
    pattern: [
      (r) => ({ kind: "attack", damage: randInt(r, 11, 14) }),
      () => ({ kind: "debuff", vulnerable: 2, weak: 1 }),
      (r) => ({ kind: "attack_defend", damage: randInt(r, 8, 10), block: 6 }),
      () => ({ kind: "heal", amount: 8 })
    ]
  },
  tower_guard: {
    id: "tower_guard",
    name: "Tower Guard",
    hp: [80, 80],
    pattern: [
      (r) => ({ kind: "attack_defend", damage: randInt(r, 8, 10), block: 6 }),
      (r) => ({ kind: "attack", damage: randInt(r, 13, 16) }),
      () => ({ kind: "buff_strength", amount: 2 }),
      () => ({ kind: "defend", block: 12 })
    ]
  },
  stormlord: {
    id: "stormlord",
    name: "The Stormlord",
    hp: [95, 95],
    pattern: [
      () => ({ kind: "debuff", vulnerable: 2, weak: 1 }),
      (r) => ({ kind: "attack", damage: randInt(r, 16, 20) }),
      (r) => ({ kind: "attack", damage: randInt(r, 8, 10) }),
      () => ({ kind: "buff_strength", amount: 3 })
    ]
  }
};

export function spawnEnemy(
  template: EnemyTemplateId,
  rng: RngState,
  uid: string
): EnemyState {
  const t = ENEMY_TEMPLATES[template];
  const hp = randInt(rng, t.hp[0], t.hp[1]);
  const enemy: EnemyState = {
    uid,
    template,
    hp,
    maxHp: hp,
    block: 0,
    statuses: emptyStatuses(),
    intent: { kind: "defend", block: 0 }, // placeholder, overwritten below
    moveIndex: 0
  };
  enemy.intent = t.pattern[0]!(rng, enemy, {} as CombatState);
  return enemy;
}

export function rollNextIntent(enemy: EnemyState, rng: RngState, combat: CombatState): void {
  const t = ENEMY_TEMPLATES[enemy.template];
  enemy.moveIndex = (enemy.moveIndex + 1) % t.pattern.length;
  enemy.intent = t.pattern[enemy.moveIndex]!(rng, enemy, combat);
}

// Roll enemy line-ups for combat / elite nodes.
export function rollCombatEnemies(rng: RngState, floor: number): EnemyTemplateId[] {
  // Difficulty scales loosely with floor.
  const easy: EnemyTemplateId[] = ["goblin", "slime", "spider"];
  const mid: EnemyTemplateId[] = ["brute", "cultist", "slime", "spider"];
  const hard: EnemyTemplateId[] = ["brute", "cultist", "sentry"];

  if (floor <= 1) {
    return shuffle(rng, [...easy]).slice(0, randInt(rng, 1, 2));
  }
  if (floor <= 3) {
    return shuffle(rng, [...mid]).slice(0, randInt(rng, 1, 2));
  }
  return shuffle(rng, [...hard]).slice(0, randInt(rng, 1, 2));
}

export function rollEliteEnemies(rng: RngState, _floor: number): EnemyTemplateId[] {
  void _floor;
  // One elite enemy.
  return [pick(rng, ["bandit_captain", "sentry"] as const)];
}

export function rollBoss(rng: RngState): EnemyTemplateId {
  return pick(rng, ["tower_guard", "stormlord"] as const);
}
