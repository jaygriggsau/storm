export type CardId = string;
export type EnemyTemplateId =
  | "goblin"
  | "brute"
  | "slime"
  | "spider"
  | "cultist"
  | "sentry"
  | "bandit_captain"
  | "tower_guard"
  | "stormlord";
export type Phase = "map" | "combat" | "reward" | "rest" | "victory" | "defeat";

// Bump when the canonical RunState shape changes in a way that breaks
// resume. Mismatched runs are silently abandoned on next load.
export const SCHEMA_VERSION = 2;

// ---------------- Status effects -------------------------------------------
// Vulnerable: target takes +50% attack damage. Ticks down at end of own turn.
// Weak:       attacker deals -25% attack damage. Ticks down at end of own turn.
// Strength:   permanent flat bonus to attack damage (positive or negative).

export type Statuses = {
  vulnerable: number;
  weak: number;
  strength: number;
};

export function emptyStatuses(): Statuses {
  return { vulnerable: 0, weak: 0, strength: 0 };
}

// --------------- Combat actors ---------------------------------------------

export type EnemyState = {
  uid: string;
  template: EnemyTemplateId;
  hp: number;
  maxHp: number;
  block: number;
  statuses: Statuses;
  // The intent the enemy will execute on its next turn. Always public.
  intent: EnemyIntent;
  // Internal scripted move index, hidden from the client.
  moveIndex: number;
};

export type EnemyIntent =
  | { kind: "attack"; damage: number }
  | { kind: "defend"; block: number }
  | { kind: "attack_defend"; damage: number; block: number }
  | { kind: "buff_strength"; amount: number }
  | { kind: "debuff"; vulnerable?: number; weak?: number }
  | { kind: "heal"; amount: number };

export type PlayerState = {
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  maxEnergy: number;
  statuses: Statuses;
};

export type CombatState = {
  player: PlayerState;
  enemies: EnemyState[];
  drawPile: CardId[];
  hand: CardId[];
  discardPile: CardId[];
  exhaustPile: CardId[];
  turn: number;
  // True between end-turn and start-turn so the client can play turn animations.
  awaitingEnemyResolution: boolean;
};

// ---------------- Map ------------------------------------------------------

export type MapNodeKind = "combat" | "elite" | "rest" | "boss";

export type MapNode = {
  id: string;
  kind: MapNodeKind;
  floor: number;
  // Horizontal lane index (for client rendering of a branching map).
  lane: number;
  // IDs of the nodes this connects to on the next floor.
  next: string[];
  visited: boolean;
  available: boolean; // reachable from current position
  enemyTemplates?: EnemyTemplateId[]; // hidden detail: stripped by view layer
};

export type RewardOption = {
  kind: "card";
  cardId: CardId;
};

export type RunState = {
  schemaVersion: number;
  id: string;
  userId: number;
  seed: string;
  rngState: number;
  phase: Phase;
  floor: number;
  player: PlayerState;
  gold: number;
  deck: CardId[];
  map: MapNode[];
  currentNodeId: string | null;
  combat: CombatState | null;
  rewardOptions: RewardOption[] | null;
  // Server-side audit log (not sent to client). Kept small.
  log: string[];
};
