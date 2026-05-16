import type {
  CardId,
  CombatState,
  EnemyIntent,
  EnemyState,
  EnemyTemplateId
} from "./types";
import { type RngState, randInt } from "@/lib/rng";

// ---------------------------------------------------------------- Cards ---
// Cards live ONLY on the server. The client receives a stripped card view
// (id, name, cost, description) computed from this table.

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
};

function dealDamage(target: EnemyState, amount: number) {
  if (amount <= 0) return;
  const absorbed = Math.min(target.block, amount);
  target.block -= absorbed;
  target.hp = Math.max(0, target.hp - (amount - absorbed));
}

export const CARDS: Record<CardId, Card> = {
  strike: {
    id: "strike",
    name: "Strike",
    cost: 1,
    targeting: "enemy",
    description: "Deal 6 damage.",
    apply: ({ target }) => {
      if (target) dealDamage(target, 6);
    }
  },
  defend: {
    id: "defend",
    name: "Defend",
    cost: 1,
    targeting: "self",
    description: "Gain 5 block.",
    apply: ({ combat }) => {
      combat.player.block += 5;
    }
  },
  thunderclap: {
    id: "thunderclap",
    name: "Thunderclap",
    cost: 1,
    targeting: "all_enemies",
    description: "Deal 4 damage to ALL enemies.",
    apply: ({ combat }) => {
      for (const e of combat.enemies) dealDamage(e, 4);
    }
  },
  bash: {
    id: "bash",
    name: "Bash",
    cost: 2,
    targeting: "enemy",
    description: "Deal 10 damage.",
    apply: ({ target }) => {
      if (target) dealDamage(target, 10);
    }
  },
  iron_wave: {
    id: "iron_wave",
    name: "Iron Wave",
    cost: 1,
    targeting: "enemy",
    description: "Gain 5 block. Deal 5 damage.",
    apply: ({ combat, target }) => {
      combat.player.block += 5;
      if (target) dealDamage(target, 5);
    }
  },
  cleave: {
    id: "cleave",
    name: "Cleave",
    cost: 1,
    targeting: "all_enemies",
    description: "Deal 8 damage to ALL enemies.",
    apply: ({ combat }) => {
      for (const e of combat.enemies) dealDamage(e, 8);
    }
  },
  surge: {
    id: "surge",
    name: "Surge",
    cost: 2,
    targeting: "enemy",
    description: "Deal 14 damage. Exhaust.",
    exhaust: true,
    apply: ({ target }) => {
      if (target) dealDamage(target, 14);
    }
  }
};

export const REWARD_POOL: CardId[] = ["bash", "iron_wave", "cleave", "surge", "thunderclap"];

export const STARTER_DECK: CardId[] = [
  "strike", "strike", "strike", "strike", "strike",
  "defend", "defend", "defend", "defend",
  "thunderclap"
];

// --------------------------------------------------------------- Enemies ---

type EnemyTemplate = {
  id: EnemyTemplateId;
  name: string;
  hp: [number, number];
  // Scripted move list. Looped. Each move is a pure pattern that yields an
  // intent; damage is randomised per resolution if a range is provided.
  pattern: Array<(rng: RngState) => EnemyIntent>;
};

export const ENEMY_TEMPLATES: Record<EnemyTemplateId, EnemyTemplate> = {
  goblin: {
    id: "goblin",
    name: "Goblin",
    hp: [16, 20],
    pattern: [
      (r) => ({ kind: "attack", damage: randInt(r, 4, 6) }),
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
      () => ({ kind: "buff" })
    ]
  },
  tower_guard: {
    id: "tower_guard",
    name: "Tower Guard",
    hp: [60, 60],
    pattern: [
      (r) => ({ kind: "attack_defend", damage: randInt(r, 7, 9), block: 5 }),
      (r) => ({ kind: "attack", damage: randInt(r, 12, 15) }),
      () => ({ kind: "defend", block: 10 })
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
  return {
    uid,
    template,
    hp,
    maxHp: hp,
    block: 0,
    intent: t.pattern[0]!(rng),
    moveIndex: 0
  };
}

export function rollNextIntent(enemy: EnemyState, rng: RngState): void {
  const t = ENEMY_TEMPLATES[enemy.template];
  enemy.moveIndex = (enemy.moveIndex + 1) % t.pattern.length;
  enemy.intent = t.pattern[enemy.moveIndex]!(rng);
}
