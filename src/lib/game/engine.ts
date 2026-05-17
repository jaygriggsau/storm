import { nanoid } from "nanoid";
import { type RngState, next, randInt, shuffle, pick } from "@/lib/rng";
import {
  CARDS,
  NEUTRAL_COMMON,
  NEUTRAL_RARE,
  rollNextIntent,
  spawnEnemy,
  rollCombatEnemies,
  rollEliteEnemies,
  rollBoss,
  dealAttackToPlayer
} from "./content";
import { CHARACTERS, type CharacterId } from "./characters";
import type {
  CardId,
  CombatState,
  EnemyState,
  EnemyTemplateId,
  MapNode,
  MapNodeKind,
  Phase,
  RunState
} from "./types";
import { SCHEMA_VERSION, emptyStatuses } from "./types";

// ============================================================================
// Server-only game engine.
//
// All state transitions go through this module. Every function takes the
// full RunState (the canonical server-side truth) plus a minimal intent
// payload and returns the new state. Validation lives here, NOT in the
// API route, so the engine cannot be bypassed by a malformed client.
// ============================================================================

const HAND_SIZE = 5;
const MAX_ENERGY = 3;
const FLOORS = 6;
const REST_HEAL_FRACTION = 0.3;
const GOLD_COMBAT = 15;
const GOLD_ELITE = 30;

// ----------------------------------------------------------------- RNG ------

function loadRng(state: RunState): RngState {
  return { s: state.rngState >>> 0 };
}

function saveRng(state: RunState, rng: RngState): void {
  state.rngState = rng.s >>> 0;
}

// --------------------------------------------------------------- Run setup --

export function newRun(userId: number, characterId: CharacterId): RunState {
  const character = CHARACTERS[characterId];
  const seed = nanoid(16);
  const rng = { s: rngFromString(seed) };
  const map = generateMap(rng);
  const state: RunState = {
    schemaVersion: SCHEMA_VERSION,
    id: nanoid(12),
    userId,
    character: character.id,
    seed,
    rngState: rng.s,
    phase: "map",
    floor: 1,
    player: {
      hp: character.maxHp,
      maxHp: character.maxHp,
      block: 0,
      energy: 0,
      maxEnergy: MAX_ENERGY,
      statuses: emptyStatuses()
    },
    gold: 0,
    deck: [...character.starterDeck],
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

// FNV-1a → seed integer.
function rngFromString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function isCurrentSchema(state: { schemaVersion?: number }): boolean {
  return state.schemaVersion === SCHEMA_VERSION;
}

// --------------- Map generation --------------------------------------------

function generateMap(rng: RngState): MapNode[] {
  const map: MapNode[] = [];
  const layers: MapNode[][] = [];

  for (let f = 1; f < FLOORS; f++) {
    const count = f === 1 ? randInt(rng, 2, 3) : randInt(rng, 2, 3);
    const layer: MapNode[] = [];
    for (let lane = 0; lane < count; lane++) {
      const kind = pickNodeKind(rng, f);
      const node: MapNode = {
        id: `f${f}-l${lane}`,
        kind,
        floor: f,
        lane,
        next: [],
        visited: false,
        available: false
      };
      if (kind === "combat") node.enemyTemplates = rollCombatEnemies(rng, f);
      else if (kind === "elite") node.enemyTemplates = rollEliteEnemies(rng, f);
      layer.push(node);
    }
    layers.push(layer);
    map.push(...layer);
  }

  // Boss is always alone on the final floor.
  const boss: MapNode = {
    id: `f${FLOORS}-boss`,
    kind: "boss",
    floor: FLOORS,
    lane: 0,
    next: [],
    visited: false,
    available: false,
    enemyTemplates: [rollBoss(rng)]
  };
  map.push(boss);
  layers.push([boss]);

  // Connect each node to 1-2 children on the next layer, biased by lane proximity.
  for (let i = 0; i < layers.length - 1; i++) {
    const cur = layers[i]!;
    const nxt = layers[i + 1]!;
    for (const node of cur) {
      const fromX = (node.lane + 0.5) / cur.length;
      const ranked = nxt
        .map((n) => ({ n, d: Math.abs((n.lane + 0.5) / nxt.length - fromX) }))
        .sort((a, b) => a.d - b.d);
      const childCount = nxt.length === 1 ? 1 : (randInt(rng, 1, 2));
      const picked = ranked.slice(0, childCount).map((c) => c.n.id);
      node.next.push(...picked);
    }
    // Make sure every next-layer node has at least one parent.
    const parented = new Set(cur.flatMap((c) => c.next));
    for (const child of nxt) {
      if (parented.has(child.id)) continue;
      const childX = (child.lane + 0.5) / nxt.length;
      const closest = [...cur].sort(
        (a, b) =>
          Math.abs((a.lane + 0.5) / cur.length - childX) -
          Math.abs((b.lane + 0.5) / cur.length - childX)
      )[0]!;
      closest.next.push(child.id);
    }
  }

  return map;
}

function pickNodeKind(rng: RngState, floor: number): MapNodeKind {
  // Floor 1: always combat (don't open with rest).
  if (floor === 1) return "combat";
  // Penultimate floor: half rest, half combat (give a heal before boss run-up).
  if (floor === FLOORS - 1) return pick(rng, ["rest", "rest", "combat"] as const);
  // Mid floors: weighted bag.
  const bag: MapNodeKind[] = floor >= 3
    ? ["combat", "combat", "combat", "elite", "elite", "rest"]
    : ["combat", "combat", "combat", "combat", "rest"];
  return pick(rng, bag);
}

function markAvailable(state: RunState): void {
  if (state.currentNodeId === null) {
    for (const n of state.map) n.available = n.floor === 1 && !n.visited;
    return;
  }
  const cur = state.map.find((n) => n.id === state.currentNodeId);
  for (const n of state.map) n.available = false;
  if (!cur) return;
  for (const id of cur.next) {
    const n = state.map.find((x) => x.id === id);
    if (n && !n.visited) n.available = true;
  }
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

  switch (node.kind) {
    case "combat":
    case "elite":
    case "boss":
      enterCombat(state, node.enemyTemplates ?? ["goblin"]);
      break;
    case "rest":
      state.phase = "rest";
      break;
  }
  return state;
}

// --------------- Rest --------------------------------------------------------

export function restHeal(state: RunState): RunState {
  requirePhase(state, "rest");
  const amount = Math.floor(state.player.maxHp * REST_HEAL_FRACTION);
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
  state.phase = "map";
  markAvailable(state);
  return state;
}

// ---------------------------------------------------------------- Combat ----

function enterCombat(state: RunState, templates: EnemyTemplateId[]): void {
  const rng = loadRng(state);
  const enemies: EnemyState[] = templates.map((t) => spawnEnemy(t, rng, nanoid(6)));
  const drawPile = shuffle(rng, [...state.deck]);
  state.combat = {
    player: {
      ...state.player,
      block: 0,
      energy: MAX_ENERGY,
      statuses: emptyStatuses() // statuses reset each combat
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

function drawN(combat: CombatState, rng: RngState, n: number): void {
  for (let i = 0; i < n; i++) {
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
  card.apply({
    combat,
    target,
    rng,
    drawCards: (n) => drawN(combat, rng, n)
  });
  saveRng(state, rng);

  if (card.exhaust) combat.exhaustPile.push(card.id);
  else combat.discardPile.push(card.id);

  // Clean up dead enemies.
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

  // Tick player statuses at end of player turn.
  tickStatuses(combat.player.statuses);

  // Resolve enemy intents. Each enemy: reset block (block decays at start
  // of own turn), apply intent, tick its statuses, roll next intent.
  const rng = loadRng(state);
  for (const e of combat.enemies) {
    e.block = 0;
    applyEnemyIntent(combat, e);
    if (combat.player.hp <= 0) break;
    tickStatuses(e.statuses);
    rollNextIntent(e, rng, combat);
  }

  // Player turn start.
  combat.turn += 1;
  combat.player.block = 0;
  combat.player.energy = combat.player.maxEnergy;
  drawTo(combat, rng, HAND_SIZE);
  saveRng(state, rng);

  if (combat.player.hp <= 0) {
    state.player.hp = 0;
    state.phase = "defeat";
    state.combat = null;
  }
  return state;
}

function tickStatuses(s: { vulnerable: number; weak: number }): void {
  if (s.vulnerable > 0) s.vulnerable -= 1;
  if (s.weak > 0) s.weak -= 1;
}

function applyEnemyIntent(combat: CombatState, enemy: EnemyState): void {
  switch (enemy.intent.kind) {
    case "attack":
      dealAttackToPlayer(combat.player, enemy.statuses, enemy.intent.damage);
      break;
    case "defend":
      enemy.block += enemy.intent.block;
      break;
    case "attack_defend":
      dealAttackToPlayer(combat.player, enemy.statuses, enemy.intent.damage);
      enemy.block += enemy.intent.block;
      break;
    case "buff_strength":
      enemy.statuses.strength += enemy.intent.amount;
      break;
    case "debuff":
      if (enemy.intent.vulnerable) combat.player.statuses.vulnerable += enemy.intent.vulnerable;
      if (enemy.intent.weak) combat.player.statuses.weak += enemy.intent.weak;
      break;
    case "heal":
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.intent.amount);
      break;
  }
}

function onCombatWon(state: RunState): void {
  // Persist player HP from combat back to the run.
  state.player.hp = state.combat!.player.hp;
  state.combat = null;

  const node = state.map.find((n) => n.id === state.currentNodeId);
  const isElite = node?.kind === "elite";
  const isBoss = node?.kind === "boss";
  state.gold += isElite ? GOLD_ELITE : isBoss ? GOLD_ELITE * 2 : GOLD_COMBAT;

  // Build a reward of 3 cards from neutral + class pools.
  // Elite / boss tip toward the rare pool.
  const character = CHARACTERS[state.character];
  const commonPool = [...NEUTRAL_COMMON, ...character.classCommon];
  const rarePool = [...NEUTRAL_RARE, ...character.classRare];
  const rng = loadRng(state);
  const pool: CardId[] = [];
  const rareChance = isElite ? 0.6 : isBoss ? 0.9 : 0.15;
  let attempts = 0;
  while (pool.length < 3 && attempts++ < 30) {
    const draw = next(rng) < rareChance ? rarePool : commonPool;
    const candidate = pick(rng, draw);
    if (!pool.includes(candidate)) pool.push(candidate);
  }
  state.rewardOptions = pool.map((cardId) => ({ kind: "card" as const, cardId }));
  saveRng(state, rng);
  state.phase = "reward";
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
