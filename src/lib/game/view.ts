import type { RunState, EnemyState, CombatState, MapNode, Statuses } from "./types";
import { CARDS, ENEMY_TEMPLATES, isUpgraded, upgradeId } from "./content";
import { CHARACTERS } from "./characters";

// The view layer is the anti-cheat barrier between the server's full state
// and the client. Anything the player isn't allowed to know stops here:
//
//   * RNG seed and current rngState  -> stripped
//   * Draw pile contents and order   -> only its size is exposed
//   * Enemy scripted move index      -> stripped (only the next intent shown)
//   * Card effect logic              -> the client gets a static descriptor
//   * Unvisited map node enemy lists -> stripped until the node is entered
//   * Server-side audit log          -> stripped

export type CardView = {
  id: string;
  name: string;
  cost: number;
  description: string;
  targeting: "enemy" | "self" | "all_enemies" | "none";
  exhaust: boolean;
  upgraded: boolean;
  upgradable: boolean;
};

export type StatusView = Statuses;

export type EnemyView = {
  uid: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  statuses: StatusView;
  intent: EnemyState["intent"];
};

export type PlayerView = {
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  maxEnergy: number;
  statuses: StatusView;
};

export type CombatView = {
  player: PlayerView;
  enemies: EnemyView[];
  hand: CardView[];
  drawCount: number;
  discardCount: number;
  exhaustCount: number;
  discardPile: CardView[];
  turn: number;
  awaitingEnemyResolution: boolean;
};

export type MapNodeView = {
  id: string;
  kind: MapNode["kind"];
  floor: number;
  lane: number;
  next: string[];
  visited: boolean;
  available: boolean;
  isCurrent: boolean;
};

export type RunView = {
  id: string;
  character: RunState["character"];
  characterName: string;
  phase: RunState["phase"];
  floor: number;
  player: PlayerView;
  gold: number;
  deck: CardView[];
  map: MapNodeView[];
  currentNodeId: string | null;
  combat: CombatView | null;
  rewardOptions: CardView[] | null;
};

function cardView(id: string): CardView {
  const c = CARDS[id]!;
  return {
    id: c.id,
    name: c.name,
    cost: c.cost,
    description: c.description,
    targeting: c.targeting,
    exhaust: !!c.exhaust,
    upgraded: isUpgraded(c.id),
    upgradable: !isUpgraded(c.id) && upgradeId(c.id) !== null
  };
}

function enemyView(e: EnemyState): EnemyView {
  return {
    uid: e.uid,
    name: ENEMY_TEMPLATES[e.template].name,
    hp: e.hp,
    maxHp: e.maxHp,
    block: e.block,
    statuses: e.statuses,
    intent: e.intent
  };
}

export function toView(state: RunState): RunView {
  return {
    id: state.id,
    character: state.character,
    characterName: CHARACTERS[state.character].name,
    phase: state.phase,
    floor: state.floor,
    player: state.player,
    gold: state.gold,
    deck: state.deck.map(cardView),
    map: state.map.map((n) => ({
      id: n.id,
      kind: n.kind,
      floor: n.floor,
      lane: n.lane,
      next: n.next,
      visited: n.visited,
      available: n.available,
      isCurrent: state.currentNodeId === n.id
    })),
    currentNodeId: state.currentNodeId,
    combat: state.combat
      ? {
          player: state.combat.player,
          enemies: state.combat.enemies.map(enemyView),
          hand: state.combat.hand.map(cardView),
          drawCount: state.combat.drawPile.length,
          discardCount: state.combat.discardPile.length,
          exhaustCount: state.combat.exhaustPile.length,
          discardPile: state.combat.discardPile.map(cardView),
          turn: state.combat.turn,
          awaitingEnemyResolution: state.combat.awaitingEnemyResolution
        }
      : null,
    rewardOptions: state.rewardOptions
      ? state.rewardOptions.map((o) => cardView(o.cardId))
      : null
  };
}
