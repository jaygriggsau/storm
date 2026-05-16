import { nanoid } from "nanoid";
import { type RngState, rngFromString, randInt, shuffle, pick } from "@/lib/rng";
import { CARDS, REWARD_POOL, STARTER_DECK, ENEMY_TEMPLATES, rollNextIntent, spawnEnemy } from "./content";
import type {
  CardId,
  CombatState,
  EnemyState,
  EnemyTemplateId,
  MapNode,
  Phase,
  PlayerState,
  RunState
} from "./types";

// ============================================================================
// Server-only game engine.
//
// All state transitions go through this module. Every function takes the
// full RunState (the canonical server-side truth) plus a minimal intent
// payload and returns the new state. Validation lives here, NOT in the
// API route, so the engine cannot be bypassed by a malformed client.
// ============================================================================

const PLAYER_MAX_HP = 50;
const HAND_SIZE = 5;
const MAX_ENERGY = 3;
const FLOORS = 3;

// ----------------------------------------------------------------- RNG ------

// We serialise the RNG as a single 32-bit integer to keep the persisted
// state compact and reproducible. `withRng` lifts a thunk into a fresh
// RngState seeded from the run's current rngState and writes back the
// resulting state.

function loadRng(state: RunState): RngState {
  return { s: state.rngState >>> 0 };
}

function saveRng(state: RunState, rng: RngState): void {
  state.rngState = rng.s >>> 0;
}

// --------------------------------------------------------------- Run setup --

export function newRun(userId: number): RunState {
  const seed = nanoid(16);
  const rng = rngFromString(seed);
  const map = generateMap(rng);
  const state: RunState = {
    id: nanoid(12),
    userId,
    seed,
    rngState: rng.s,
    phase: "map",
    floor: 1,
    player: {
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      block: 0,
      energy: 0,
      maxEnergy: MAX_ENERGY
    },
    gold: 0,
    deck: [...STARTER_DECK],
    map,
    currentNodeId: null,
    combat: null,
    rewardOptions: null,
    log: []
  };
  saveRng(state, rng);
  markAvailable(state);
  return state;
}

function generateMap(rng: RngState): MapNode[] {
  // A trivial linear path for the vertical slice: floor 1-2 combat, floor 3 boss.
  const map: MapNode[] = [];
  for (let f = 1; f <= FLOORS; f++) {
    if (f === FLOORS) {
      map.push({
        id: `f${f}-boss`,
        kind: "boss",
        floor: f,
        visited: false,
        available: false,
        enemyTemplates: ["tower_guard"]
      });
    } else {
      const count = randInt(rng, 1, 2);
      const enemies: EnemyTemplateId[] = [];
      for (let i = 0; i < count; i++) {
        enemies.push(pick(rng, ["goblin", "brute"] as const));
      }
      map.push({
        id: `f${f}-combat`,
        kind: "combat",
        floor: f,
        visited: false,
        available: false,
        enemyTemplates: enemies
      });
    }
  }
  return map;
}

function markAvailable(state: RunState): void {
  // The next un-visited node on the lowest un-cleared floor is available.
  let firstUncleared: MapNode | null = null;
  for (const node of state.map) {
    node.available = false;
    if (!node.visited && !firstUncleared) firstUncleared = node;
  }
  if (firstUncleared) firstUncleared.available = true;
}

// ------------------------------------------------------------- Map actions --

export function chooseNode(state: RunState, nodeId: string): RunState {
  requirePhase(state, "map");
  const node = state.map.find((n) => n.id === nodeId);
  if (!node) throw badRequest("unknown node");
  if (!node.available) throw badRequest("node not available");
  node.visited = true;
  state.currentNodeId = node.id;
  state.floor = node.floor;

  if (node.kind === "combat" || node.kind === "elite" || node.kind === "boss") {
    enterCombat(state, node.enemyTemplates ?? ["goblin"]);
  }
  return state;
}

// ---------------------------------------------------------------- Combat ----

function enterCombat(state: RunState, templates: EnemyTemplateId[]): void {
  const rng = loadRng(state);
  const enemies: EnemyState[] = templates.map((t) =>
    spawnEnemy(t, rng, nanoid(6))
  );
  const drawPile = shuffle(rng, [...state.deck]);
  state.combat = {
    player: {
      ...state.player,
      block: 0,
      energy: MAX_ENERGY
    },
    enemies,
    drawPile,
    hand: [],
    discardPile: [],
    exhaustPile: [],
    turn: 1,
    awaitingEnemyResolution: false
  };
  drawTo(state.combat, rng, HAND_SIZE);
  state.phase = "combat";
  saveRng(state, rng);
}

function drawTo(combat: CombatState, rng: RngState, target: number): void {
  while (combat.hand.length < target) {
    if (combat.drawPile.length === 0) {
      if (combat.discardPile.length === 0) return;
      combat.drawPile = shuffle(rng, combat.discardPile);
      combat.discardPile = [];
    }
    combat.hand.push(combat.drawPile.pop()!);
  }
}

export function playCard(
  state: RunState,
  cardId: CardId,
  targetUid?: string
): RunState {
  requirePhase(state, "combat");
  const combat = state.combat!;
  if (combat.awaitingEnemyResolution) {
    throw badRequest("enemies are resolving");
  }
  const handIdx = combat.hand.indexOf(cardId);
  if (handIdx === -1) throw badRequest("card not in hand");

  const card = CARDS[cardId];
  if (!card) throw badRequest("unknown card");
  if (combat.player.energy < card.cost) throw badRequest("not enough energy");

  let target: EnemyState | undefined;
  if (card.targeting === "enemy") {
    target = combat.enemies.find((e) => e.uid === targetUid && e.hp > 0);
    if (!target) throw badRequest("invalid target");
  }

  // Spend energy + move the card out of hand before applying effect.
  combat.player.energy -= card.cost;
  combat.hand.splice(handIdx, 1);

  const rng = loadRng(state);
  card.apply({ combat, target, rng });
  saveRng(state, rng);

  if (card.exhaust) combat.exhaustPile.push(card.id);
  else combat.discardPile.push(card.id);

  // Clean up dead enemies; if all dead, end combat.
  combat.enemies = combat.enemies.filter((e) => e.hp > 0);
  if (combat.enemies.length === 0) {
    onCombatWon(state);
  }
  return state;
}

export function endTurn(state: RunState): RunState {
  requirePhase(state, "combat");
  const combat = state.combat!;
  if (combat.awaitingEnemyResolution) throw badRequest("already ended");

  // Discard hand.
  combat.discardPile.push(...combat.hand);
  combat.hand = [];

  // Resolve enemy intents.
  const rng = loadRng(state);
  for (const e of combat.enemies) {
    applyEnemyIntent(combat, e);
    if (state.combat === null) {
      saveRng(state, rng);
      return state; // player died
    }
    rollNextIntent(e, rng);
  }

  // New player turn.
  combat.turn += 1;
  combat.player.block = 0;
  combat.player.energy = combat.player.maxEnergy;
  drawTo(combat, rng, HAND_SIZE);
  saveRng(state, rng);

  // Player dead?
  if (combat.player.hp <= 0) {
    state.player.hp = 0;
    state.phase = "defeat";
    state.combat = null;
  }
  return state;
}

function applyEnemyIntent(combat: CombatState, enemy: EnemyState): void {
  switch (enemy.intent.kind) {
    case "attack":
      damagePlayer(combat, enemy.intent.damage);
      break;
    case "defend":
      enemy.block += enemy.intent.block;
      break;
    case "attack_defend":
      damagePlayer(combat, enemy.intent.damage);
      enemy.block += enemy.intent.block;
      break;
    case "buff":
      // Vertical slice: buff = self-heal a bit. Keeps cards interesting.
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + 3);
      break;
  }
  // Block decays at end of OWN turn (StS rule). Enemy turn ends here.
}

function damagePlayer(combat: CombatState, amount: number): void {
  const absorbed = Math.min(combat.player.block, amount);
  combat.player.block -= absorbed;
  combat.player.hp = Math.max(0, combat.player.hp - (amount - absorbed));
}

function onCombatWon(state: RunState): void {
  // Persist player HP from combat back to the run.
  state.player.hp = state.combat!.player.hp;
  state.combat = null;

  state.gold += 15;
  // Offer a card reward.
  const rng = loadRng(state);
  const pool = [...REWARD_POOL];
  shuffle(rng, pool);
  state.rewardOptions = pool.slice(0, 3).map((cardId) => ({ kind: "card" as const, cardId }));
  saveRng(state, rng);
  state.phase = "reward";

  // If the cleared node was the boss, victory after reward.
  const node = state.map.find((n) => n.id === state.currentNodeId);
  if (node?.kind === "boss") {
    // Skip reward into victory? Keep one final reward for fun.
  }
}

// ---------------------------------------------------------------- Reward ----

export function pickReward(state: RunState, cardId: CardId): RunState {
  requirePhase(state, "reward");
  const opts = state.rewardOptions ?? [];
  const found = opts.find((o) => o.cardId === cardId);
  if (!found) throw badRequest("not an offered reward");
  state.deck.push(cardId);
  finishReward(state);
  return state;
}

export function skipReward(state: RunState): RunState {
  requirePhase(state, "reward");
  finishReward(state);
  return state;
}

function finishReward(state: RunState): void {
  state.rewardOptions = null;

  const node = state.map.find((n) => n.id === state.currentNodeId);
  if (node?.kind === "boss") {
    state.phase = "victory";
    return;
  }
  state.phase = "map";
  markAvailable(state);
}

// ----------------------------------------------------------------- Util -----

class BadRequest extends Error {
  status = 400;
}
function badRequest(msg: string): BadRequest {
  return new BadRequest(msg);
}

function requirePhase(state: RunState, phase: Phase): void {
  if (state.phase !== phase) throw badRequest(`wrong phase: ${state.phase}`);
}

export { BadRequest };
