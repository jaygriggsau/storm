export type CardId = string;
export type EnemyTemplateId = "goblin" | "brute" | "tower_guard";
export type Phase = "map" | "combat" | "reward" | "victory" | "defeat";

export type EnemyState = {
  uid: string;
  template: EnemyTemplateId;
  hp: number;
  maxHp: number;
  block: number;
  // The intent the enemy will execute on its next turn. Always public.
  intent: EnemyIntent;
  // Internal scripted move index, hidden from the client.
  moveIndex: number;
};

export type EnemyIntent =
  | { kind: "attack"; damage: number }
  | { kind: "defend"; block: number }
  | { kind: "buff" }
  | { kind: "attack_defend"; damage: number; block: number };

export type PlayerState = {
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  maxEnergy: number;
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

export type MapNodeKind = "combat" | "elite" | "rest" | "boss";

export type MapNode = {
  id: string;
  kind: MapNodeKind;
  floor: number;
  visited: boolean;
  available: boolean; // reachable from current position
  enemyTemplates?: EnemyTemplateId[]; // hidden detail: stripped by view layer
};

export type RewardOption = {
  kind: "card";
  cardId: CardId;
};

export type RunState = {
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
