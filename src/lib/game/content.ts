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

export function dealAttackToPlayer(player: PlayerState, attacker: Statuses, base: number): void {
  applyDamage(player, modifyAttack(attacker, player.statuses, base));
}

// ---------- Cards: data-driven effects --------------------------------------

export type CardTargeting = "enemy" | "self" | "all_enemies" | "none";

// Discriminated-union of every primitive effect a card can perform.
// Card upgrades change only the numbers, not the structure, so a
// single executor handles base and upgraded variants identically.
export type Effect =
  | { kind: "damage"; amount: number; count?: number }
  | { kind: "damage_all"; amount: number }
  | { kind: "damage_random"; amount: number; count: number }
  | { kind: "damage_equal_block" }
  | { kind: "block"; amount: number }
  | { kind: "apply_status"; status: "vulnerable" | "weak"; amount: number }
  | { kind: "apply_status_all"; status: "vulnerable" | "weak"; amount: number }
  | { kind: "gain_strength"; amount: number }
  | { kind: "modify_target_strength"; amount: number }
  | { kind: "draw"; amount: number }
  | { kind: "lose_hp"; amount: number }
  | { kind: "gain_energy"; amount: number }
  | { kind: "double_strength" };

export type Card = {
  id: CardId;
  name: string;
  cost: number;
  targeting: CardTargeting;
  description: string;
  exhaust?: boolean;
  effects: Effect[];
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

export function executeEffects(effects: Effect[], ctx: ApplyContext): void {
  for (const e of effects) {
    switch (e.kind) {
      case "damage": {
        const reps = e.count ?? 1;
        for (let i = 0; i < reps; i++) {
          if (ctx.target && ctx.target.hp > 0) dealAttackToEnemy(ctx.combat, ctx.target, e.amount);
        }
        break;
      }
      case "damage_all":
        for (const en of ctx.combat.enemies) dealAttackToEnemy(ctx.combat, en, e.amount);
        break;
      case "damage_random":
        for (let i = 0; i < e.count; i++) {
          const alive = ctx.combat.enemies.filter((en) => en.hp > 0);
          if (alive.length === 0) return;
          dealAttackToEnemy(ctx.combat, pick(ctx.rng, alive), e.amount);
        }
        break;
      case "damage_equal_block":
        if (ctx.target) dealAttackToEnemy(ctx.combat, ctx.target, ctx.combat.player.block);
        break;
      case "block":
        gainBlock(ctx.combat, e.amount);
        break;
      case "apply_status":
        if (ctx.target) ctx.target.statuses[e.status] += e.amount;
        break;
      case "apply_status_all":
        for (const en of ctx.combat.enemies) en.statuses[e.status] += e.amount;
        break;
      case "gain_strength":
        ctx.combat.player.statuses.strength += e.amount;
        break;
      case "modify_target_strength":
        if (ctx.target) ctx.target.statuses.strength += e.amount;
        break;
      case "draw":
        ctx.drawCards(e.amount);
        break;
      case "lose_hp":
        ctx.combat.player.hp = Math.max(1, ctx.combat.player.hp - e.amount);
        break;
      case "gain_energy":
        ctx.combat.player.energy += e.amount;
        break;
      case "double_strength":
        if (ctx.combat.player.statuses.strength > 0) {
          ctx.combat.player.statuses.strength *= 2;
        }
        break;
    }
  }
}

// ---------- Card definition table ------------------------------------------
//
// Every card here has an upgraded "+ variant", id-suffixed with `_plus`,
// generated by defineCard. Smith nodes upgrade by swapping a card's id
// in the deck array for its `_plus` form.

type BaseCardSpec = {
  id: CardId;
  name: string;
  cost: number;
  targeting: CardTargeting;
  description: string;
  exhaust?: boolean;
  effects: Effect[];
};

type UpgradeSpec = Partial<Omit<BaseCardSpec, "id" | "name" | "targeting">>;

function defineCard(base: BaseCardSpec, upgrade: UpgradeSpec): [Card, Card] {
  const baseCard: Card = { ...base };
  const upgradedCard: Card = {
    ...baseCard,
    ...upgrade,
    id: `${base.id}_plus`,
    name: `${base.name}+`
  };
  return [baseCard, upgradedCard];
}

function dmg(amount: number, count?: number): Effect {
  return count ? { kind: "damage", amount, count } : { kind: "damage", amount };
}
const dmgAll = (amount: number): Effect => ({ kind: "damage_all", amount });
const dmgRandom = (amount: number, count: number): Effect => ({
  kind: "damage_random", amount, count
});
const block = (amount: number): Effect => ({ kind: "block", amount });
const status = (s: "vulnerable" | "weak", amount: number): Effect => ({
  kind: "apply_status", status: s, amount
});
const statusAll = (s: "vulnerable" | "weak", amount: number): Effect => ({
  kind: "apply_status_all", status: s, amount
});
const gainStr = (amount: number): Effect => ({ kind: "gain_strength", amount });
const modTargetStr = (amount: number): Effect => ({ kind: "modify_target_strength", amount });
const draw = (amount: number): Effect => ({ kind: "draw", amount });
const loseHp = (amount: number): Effect => ({ kind: "lose_hp", amount });
const gainEnergy = (amount: number): Effect => ({ kind: "gain_energy", amount });

const ALL_CARDS: [Card, Card][] = [
  // ---- Shared starter ---------------------------------------------------
  defineCard(
    { id: "strike", name: "Strike", cost: 1, targeting: "enemy",
      description: "Deal 6 damage.", effects: [dmg(6)] },
    { description: "Deal 9 damage.", effects: [dmg(9)] }
  ),
  defineCard(
    { id: "defend", name: "Defend", cost: 1, targeting: "self",
      description: "Gain 5 block.", effects: [block(5)] },
    { description: "Gain 8 block.", effects: [block(8)] }
  ),
  defineCard(
    { id: "thunderclap", name: "Thunderclap", cost: 1, targeting: "all_enemies",
      description: "Deal 4 damage and apply 1 Vulnerable to ALL enemies.",
      effects: [dmgAll(4), statusAll("vulnerable", 1)] },
    { description: "Deal 7 damage and apply 1 Vulnerable to ALL enemies.",
      effects: [dmgAll(7), statusAll("vulnerable", 1)] }
  ),

  // ---- Stormcaller starter (also class-defining basics) -----------------
  // (Strike & Defend serve Stormcaller too.)

  // ---- Tempest starter --------------------------------------------------
  defineCard(
    { id: "spark", name: "Spark", cost: 1, targeting: "enemy",
      description: "Deal 5 damage.", effects: [dmg(5)] },
    { description: "Deal 7 damage.", effects: [dmg(7)] }
  ),
  defineCard(
    { id: "ward", name: "Ward", cost: 1, targeting: "self",
      description: "Gain 5 block.", effects: [block(5)] },
    { description: "Gain 8 block.", effects: [block(8)] }
  ),
  defineCard(
    { id: "chain_bolt", name: "Chain Bolt", cost: 1, targeting: "all_enemies",
      description: "Deal 4 damage to a random enemy twice.",
      effects: [dmgRandom(4, 2)] },
    { description: "Deal 5 damage to a random enemy twice.",
      effects: [dmgRandom(5, 2)] }
  ),

  // ---- Neutral common ---------------------------------------------------
  defineCard(
    { id: "iron_wave", name: "Iron Wave", cost: 1, targeting: "enemy",
      description: "Gain 5 block. Deal 5 damage.",
      effects: [block(5), dmg(5)] },
    { description: "Gain 7 block. Deal 7 damage.",
      effects: [block(7), dmg(7)] }
  ),
  defineCard(
    { id: "cleave", name: "Cleave", cost: 1, targeting: "all_enemies",
      description: "Deal 8 damage to ALL enemies.", effects: [dmgAll(8)] },
    { description: "Deal 11 damage to ALL enemies.", effects: [dmgAll(11)] }
  ),
  defineCard(
    { id: "shrug_it_off", name: "Shrug It Off", cost: 1, targeting: "self",
      description: "Gain 8 block. Draw 1.", effects: [block(8), draw(1)] },
    { description: "Gain 11 block. Draw 1.", effects: [block(11), draw(1)] }
  ),
  defineCard(
    { id: "true_grit", name: "True Grit", cost: 1, targeting: "self",
      description: "Gain 7 block.", effects: [block(7)] },
    { description: "Gain 9 block.", effects: [block(9)] }
  ),
  defineCard(
    { id: "body_slam", name: "Body Slam", cost: 1, targeting: "enemy",
      description: "Deal damage equal to your current block.",
      effects: [{ kind: "damage_equal_block" }] },
    { cost: 0 }
  ),

  // ---- Neutral rare -----------------------------------------------------
  defineCard(
    { id: "bloodletting", name: "Bloodletting", cost: 0, targeting: "self",
      description: "Lose 3 HP. Gain 2 energy.",
      effects: [loseHp(3), gainEnergy(2)] },
    { description: "Lose 3 HP. Gain 2 energy. Draw 1.",
      effects: [loseHp(3), gainEnergy(2), draw(1)] }
  ),
  defineCard(
    { id: "disarm", name: "Disarm", cost: 1, targeting: "enemy", exhaust: true,
      description: "Reduce enemy's Strength by 2. Exhaust.",
      effects: [modTargetStr(-2)] },
    { description: "Reduce enemy's Strength by 3. Exhaust.",
      effects: [modTargetStr(-3)] }
  ),
  defineCard(
    { id: "inflame", name: "Inflame", cost: 1, targeting: "self",
      description: "Gain 2 Strength.", effects: [gainStr(2)] },
    { description: "Gain 3 Strength.", effects: [gainStr(3)] }
  ),

  // ---- Stormcaller class common -----------------------------------------
  defineCard(
    { id: "heavy_slash", name: "Heavy Slash", cost: 2, targeting: "enemy",
      description: "Deal 14 damage.", effects: [dmg(14)] },
    { description: "Deal 18 damage.", effects: [dmg(18)] }
  ),
  defineCard(
    { id: "twin_strike", name: "Twin Strike", cost: 1, targeting: "enemy",
      description: "Deal 5 damage twice.", effects: [dmg(5, 2)] },
    { description: "Deal 7 damage twice.", effects: [dmg(7, 2)] }
  ),
  defineCard(
    { id: "pommel_strike", name: "Pommel Strike", cost: 1, targeting: "enemy",
      description: "Deal 9 damage. Draw 1.", effects: [dmg(9), draw(1)] },
    { description: "Deal 10 damage. Draw 2.", effects: [dmg(10), draw(2)] }
  ),
  defineCard(
    { id: "sucker_punch", name: "Sucker Punch", cost: 1, targeting: "enemy",
      description: "Deal 7 damage. Apply 1 Weak.",
      effects: [dmg(7), status("weak", 1)] },
    { description: "Deal 8 damage. Apply 2 Weak.",
      effects: [dmg(8), status("weak", 2)] }
  ),

  // ---- Stormcaller class rare -------------------------------------------
  defineCard(
    { id: "bash", name: "Bash", cost: 2, targeting: "enemy",
      description: "Deal 8 damage. Apply 2 Vulnerable.",
      effects: [dmg(8), status("vulnerable", 2)] },
    { description: "Deal 10 damage. Apply 3 Vulnerable.",
      effects: [dmg(10), status("vulnerable", 3)] }
  ),
  defineCard(
    { id: "surge", name: "Surge", cost: 2, targeting: "enemy", exhaust: true,
      description: "Deal 14 damage. Exhaust.", effects: [dmg(14)] },
    { description: "Deal 22 damage. Exhaust.", effects: [dmg(22)] }
  ),
  defineCard(
    { id: "pummel", name: "Pummel", cost: 1, targeting: "enemy", exhaust: true,
      description: "Deal 2 damage 4 times. Exhaust.", effects: [dmg(2, 4)] },
    { description: "Deal 2 damage 5 times. Exhaust.", effects: [dmg(2, 5)] }
  ),
  defineCard(
    { id: "sword_boomerang", name: "Sword Boomerang", cost: 1, targeting: "all_enemies",
      description: "Deal 3 damage to a random enemy 3 times.",
      effects: [dmgRandom(3, 3)] },
    { description: "Deal 3 damage to a random enemy 4 times.",
      effects: [dmgRandom(3, 4)] }
  ),
  defineCard(
    { id: "limit_break", name: "Limit Break", cost: 1, targeting: "self", exhaust: true,
      description: "Double your Strength. Exhaust.",
      effects: [{ kind: "double_strength" }] },
    { exhaust: false, description: "Double your Strength.",
      effects: [{ kind: "double_strength" }] }
  ),

  // ---- Tempest class common ---------------------------------------------
  defineCard(
    { id: "jolt", name: "Jolt", cost: 0, targeting: "enemy",
      description: "Deal 3 damage.", effects: [dmg(3)] },
    { description: "Deal 5 damage.", effects: [dmg(5)] }
  ),
  defineCard(
    { id: "static_discharge", name: "Static Discharge", cost: 1, targeting: "all_enemies",
      description: "Deal 4 damage to ALL enemies.", effects: [dmgAll(4)] },
    { description: "Deal 6 damage to ALL enemies.", effects: [dmgAll(6)] }
  ),
  defineCard(
    { id: "lightning_rod", name: "Lightning Rod", cost: 1, targeting: "enemy",
      description: "Deal 8 damage. Draw 1.", effects: [dmg(8), draw(1)] },
    { description: "Deal 11 damage. Draw 1.", effects: [dmg(11), draw(1)] }
  ),
  defineCard(
    { id: "insulate", name: "Insulate", cost: 1, targeting: "self",
      description: "Gain 8 block.", effects: [block(8)] },
    { description: "Gain 11 block.", effects: [block(11)] }
  ),

  // ---- Tempest class rare -----------------------------------------------
  defineCard(
    { id: "shock_wave", name: "Shock Wave", cost: 1, targeting: "all_enemies", exhaust: true,
      description: "Apply 2 Vulnerable to ALL enemies. Exhaust.",
      effects: [statusAll("vulnerable", 2)] },
    { description: "Apply 3 Vulnerable to ALL enemies. Exhaust.",
      effects: [statusAll("vulnerable", 3)] }
  ),
  defineCard(
    { id: "conduit", name: "Conduit", cost: 1, targeting: "self", exhaust: true,
      description: "Gain 3 Strength. Exhaust.", effects: [gainStr(3)] },
    { description: "Gain 5 Strength. Exhaust.", effects: [gainStr(5)] }
  ),
  defineCard(
    { id: "overcharge", name: "Overcharge", cost: 0, targeting: "self", exhaust: true,
      description: "Lose 4 HP. Gain 2 energy. Exhaust.",
      effects: [loseHp(4), gainEnergy(2)] },
    { description: "Lose 2 HP. Gain 3 energy. Exhaust.",
      effects: [loseHp(2), gainEnergy(3)] }
  ),
  defineCard(
    { id: "tempest", name: "Tempest", cost: 2, targeting: "all_enemies",
      description: "Deal 5 damage to ALL enemies. Apply 1 Vulnerable to ALL.",
      effects: [dmgAll(5), statusAll("vulnerable", 1)] },
    { description: "Deal 7 damage to ALL enemies. Apply 1 Vulnerable to ALL.",
      effects: [dmgAll(7), statusAll("vulnerable", 1)] }
  )
];

export const CARDS: Record<CardId, Card> = Object.fromEntries(
  ALL_CARDS.flatMap(([a, b]) => [[a.id, a], [b.id, b]])
);

export function isUpgraded(id: CardId): boolean {
  return id.endsWith("_plus");
}
export function upgradeId(id: CardId): CardId | null {
  if (isUpgraded(id)) return null;
  const up = `${id}_plus`;
  return CARDS[up] ? up : null;
}

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
  const easy: EnemyTemplateId[] = ["goblin", "slime", "spider"];
  const mid: EnemyTemplateId[] = ["brute", "cultist", "slime", "spider"];
  const hard: EnemyTemplateId[] = ["brute", "cultist", "sentry"];

  if (floor <= 1) return shuffle(rng, [...easy]).slice(0, randInt(rng, 1, 2));
  if (floor <= 3) return shuffle(rng, [...mid]).slice(0, randInt(rng, 1, 2));
  return shuffle(rng, [...hard]).slice(0, randInt(rng, 1, 2));
}

export function rollEliteEnemies(rng: RngState, _floor: number): EnemyTemplateId[] {
  void _floor;
  return [pick(rng, ["bandit_captain", "sentry"] as const)];
}

export function rollBoss(rng: RngState): EnemyTemplateId {
  return pick(rng, ["tower_guard", "stormlord"] as const);
}
