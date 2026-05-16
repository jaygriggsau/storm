"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RunView,
  CardView,
  EnemyView,
  MapNodeView,
  StatusView
} from "@/lib/game/view";

type Action =
  | { type: "chooseNode"; nodeId: string }
  | { type: "playCard"; cardId: string; targetUid?: string }
  | { type: "endTurn" }
  | { type: "pickReward"; cardId: string }
  | { type: "skipReward" }
  | { type: "restHeal" };

export default function GameClient() {
  const [run, setRun] = useState<RunView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCard, setPendingCard] = useState<CardView | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/game/state", { cache: "no-store" });
    const data = await res.json();
    setRun(data.run ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const startRun = useCallback(async (force = false) => {
    setBusy(true); setError(null);
    const res = await fetch("/api/game/new-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force })
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "error");
    else setRun(data.run);
    setBusy(false);
  }, []);

  const doAction = useCallback(async (action: Action) => {
    setBusy(true); setError(null);
    const res = await fetch("/api/game/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        action
      })
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "error");
    else setRun(data.run);
    setBusy(false);
  }, []);

  if (loading) return <p className="mt-12 text-center text-slate-400">Loading…</p>;

  if (!run) {
    return (
      <section className="mt-16 flex flex-col items-center gap-4">
        <p className="text-slate-300">No active run.</p>
        <button
          disabled={busy}
          onClick={() => startRun(false)}
          className="rounded bg-storm-accent px-4 py-2 font-semibold text-storm-bg"
        >
          Begin climb
        </button>
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-6">
      {error && <p className="rounded bg-storm-danger/30 px-3 py-2 text-sm">{error}</p>}

      <Stats run={run} />

      {run.phase === "map" && (
        <MapPhase run={run} disabled={busy} onChoose={(id) => doAction({ type: "chooseNode", nodeId: id })} />
      )}

      {run.phase === "rest" && (
        <RestPhase disabled={busy} onRest={() => doAction({ type: "restHeal" })} />
      )}

      {run.phase === "combat" && run.combat && (
        <CombatPhase
          run={run}
          disabled={busy}
          pendingCard={pendingCard}
          setPendingCard={setPendingCard}
          onPlay={(cardId, targetUid) => {
            setPendingCard(null);
            void doAction({ type: "playCard", cardId, targetUid });
          }}
          onEndTurn={() => doAction({ type: "endTurn" })}
        />
      )}

      {run.phase === "reward" && run.rewardOptions && (
        <RewardPhase
          options={run.rewardOptions}
          disabled={busy}
          onPick={(c) => doAction({ type: "pickReward", cardId: c.id })}
          onSkip={() => doAction({ type: "skipReward" })}
        />
      )}

      {run.phase === "victory" && (
        <Outcome title="Victory" tone="accent">
          <button
            disabled={busy}
            onClick={() => startRun(true)}
            className="rounded bg-storm-accent px-4 py-2 font-semibold text-storm-bg"
          >
            Climb again
          </button>
        </Outcome>
      )}

      {run.phase === "defeat" && (
        <Outcome title="Defeated" tone="danger">
          <button
            disabled={busy}
            onClick={() => startRun(true)}
            className="rounded bg-storm-accent px-4 py-2 font-semibold text-storm-bg"
          >
            Try again
          </button>
        </Outcome>
      )}
    </section>
  );
}

function Stats({ run }: { run: RunView }) {
  return (
    <div className="card-frame flex items-center justify-between rounded-lg px-4 py-3 text-sm">
      <div>Floor <span className="font-mono">{run.floor}</span></div>
      <div>HP <span className="font-mono">{run.player.hp}/{run.player.maxHp}</span></div>
      <div>Gold <span className="font-mono text-storm-gold">{run.gold}</span></div>
      <div>Deck <span className="font-mono">{run.deck.length}</span></div>
      <div className="uppercase tracking-wide text-slate-400">{run.phase}</div>
    </div>
  );
}

// -------------------------- Map ---------------------------------------------

function MapPhase({
  run, disabled, onChoose
}: { run: RunView; disabled: boolean; onChoose: (id: string) => void }) {
  // Group nodes by floor for a row-per-floor layout.
  const byFloor = useMemo(() => {
    const m = new Map<number, MapNodeView[]>();
    for (const n of run.map) {
      const list = m.get(n.floor) ?? [];
      list.push(n);
      m.set(n.floor, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.lane - b.lane);
    return [...m.entries()].sort((a, b) => b[0] - a[0]); // top floor first
  }, [run.map]);

  return (
    <div className="card-frame rounded-lg p-6">
      <h2 className="mb-4 font-display text-xl">The Tower</h2>
      <div className="space-y-3">
        {byFloor.map(([floor, nodes]) => (
          <div key={floor} className="flex items-center gap-3">
            <div className="w-16 shrink-0 text-xs uppercase tracking-wider text-slate-500">
              Floor {floor}
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              {nodes.map((n) => (
                <MapButton
                  key={n.id}
                  node={n}
                  disabled={disabled || !n.available}
                  onClick={() => onChoose(n.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MapButton({
  node, disabled, onClick
}: { node: MapNodeView; disabled: boolean; onClick: () => void }) {
  const glyph = nodeGlyph(node.kind);
  const tone = nodeTone(node);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-28 items-center justify-center gap-2 rounded border px-3 py-2 text-sm transition ${tone}`}
      title={node.kind}
    >
      <span className="text-lg">{glyph}</span>
      <span className="capitalize">{node.kind}</span>
    </button>
  );
}

function nodeGlyph(kind: MapNodeView["kind"]): string {
  switch (kind) {
    case "combat": return "⚔";
    case "elite": return "★";
    case "rest": return "♨";
    case "boss": return "☠";
  }
}

function nodeTone(node: MapNodeView): string {
  if (node.visited) return "border-slate-700 bg-slate-900 text-slate-500 line-through";
  if (node.available) return "border-storm-accent bg-storm-accent/15 text-slate-100 hover:bg-storm-accent/30";
  return "border-slate-700 bg-slate-900/50 text-slate-500 opacity-50 cursor-not-allowed";
}

// -------------------------- Rest --------------------------------------------

function RestPhase({ disabled, onRest }: { disabled: boolean; onRest: () => void }) {
  return (
    <div className="card-frame flex flex-col items-center gap-4 rounded-lg p-8">
      <h2 className="font-display text-2xl text-storm-accent">A bonfire flickers.</h2>
      <p className="text-slate-300">Rest to recover 30% of your max HP.</p>
      <button
        disabled={disabled}
        onClick={onRest}
        className="rounded bg-storm-accent px-4 py-2 font-semibold text-storm-bg"
      >
        Rest
      </button>
    </div>
  );
}

// ------------------------ Combat --------------------------------------------

function CombatPhase({
  run, disabled, pendingCard, setPendingCard, onPlay, onEndTurn
}: {
  run: RunView;
  disabled: boolean;
  pendingCard: CardView | null;
  setPendingCard: (c: CardView | null) => void;
  onPlay: (cardId: string, targetUid?: string) => void;
  onEndTurn: () => void;
}) {
  const combat = run.combat!;

  const tryPlay = (card: CardView) => {
    if (card.targeting === "enemy") {
      setPendingCard(card);
      return;
    }
    onPlay(card.id);
  };

  const onEnemyClick = (e: EnemyView) => {
    if (!pendingCard) return;
    onPlay(pendingCard.id, e.uid);
  };

  return (
    <div className="space-y-4">
      {/* Enemies */}
      <div className="flex flex-wrap gap-4">
        {combat.enemies.map((e) => (
          <button
            key={e.uid}
            onClick={() => onEnemyClick(e)}
            disabled={disabled || !pendingCard}
            className={`card-frame w-56 rounded-lg p-4 text-left ${
              pendingCard ? "ring-2 ring-storm-accent" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="font-display text-lg">{e.name}</div>
              {e.block > 0 && (
                <span className="block-pip rounded px-2 text-xs font-bold">{e.block}</span>
              )}
            </div>
            <div className="mt-2 h-2 w-full rounded bg-slate-800">
              <div className="hp-bar h-2 rounded" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate-300">{e.hp} / {e.maxHp}</div>
            <StatusBar statuses={e.statuses} />
            <div className="mt-3 text-xs text-storm-accent">
              Intent: {intentText(e.intent)}
            </div>
          </button>
        ))}
      </div>

      {/* Player */}
      <div className="card-frame flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-sm">
        <div className="flex items-center gap-3">
          <span>HP {combat.player.hp}/{combat.player.maxHp}</span>
          {combat.player.block > 0 && (
            <span className="block-pip rounded px-2 py-0.5 text-xs font-bold">Block {combat.player.block}</span>
          )}
          <StatusBar statuses={combat.player.statuses} />
        </div>
        <div>Energy <span className="font-mono">{combat.player.energy}/{combat.player.maxEnergy}</span></div>
        <div>Turn <span className="font-mono">{combat.turn}</span></div>
        <div className="text-xs text-slate-400">Draw {combat.drawCount} · Discard {combat.discardCount} · Exhaust {combat.exhaustCount}</div>
        <button
          onClick={onEndTurn}
          disabled={disabled}
          className="rounded bg-storm-danger px-3 py-1 text-sm font-semibold text-storm-bg disabled:opacity-30"
        >
          End turn
        </button>
      </div>

      {/* Hand */}
      <div className="flex flex-wrap gap-3">
        {combat.hand.map((c, i) => {
          const playable = combat.player.energy >= c.cost;
          const selected = pendingCard?.id === c.id;
          return (
            <button
              key={`${c.id}-${i}`}
              onClick={() => tryPlay(c)}
              disabled={disabled || !playable}
              className={`card-frame w-44 rounded-lg p-3 text-left transition ${
                playable ? "hover:-translate-y-1" : "opacity-40"
              } ${selected ? "ring-2 ring-storm-accent" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold">{c.name}</div>
                <div className="rounded-full bg-storm-accent px-2 text-xs font-bold text-storm-bg">{c.cost}</div>
              </div>
              <div className="mt-2 text-xs text-slate-300">{c.description}</div>
              {c.exhaust && (
                <div className="mt-1 text-[10px] uppercase tracking-wider text-storm-danger">Exhaust</div>
              )}
            </button>
          );
        })}
      </div>

      {pendingCard && (
        <p className="text-sm text-storm-accent">
          Select a target for {pendingCard.name}, or{" "}
          <button onClick={() => setPendingCard(null)} className="underline">cancel</button>.
        </p>
      )}
    </div>
  );
}

function StatusBar({ statuses }: { statuses: StatusView }) {
  const chips: { label: string; value: number; tone: string }[] = [];
  if (statuses.vulnerable > 0) chips.push({ label: "Vulnerable", value: statuses.vulnerable, tone: "bg-storm-danger/70" });
  if (statuses.weak > 0) chips.push({ label: "Weak", value: statuses.weak, tone: "bg-amber-700" });
  if (statuses.strength !== 0) chips.push({
    label: "Strength",
    value: statuses.strength,
    tone: statuses.strength > 0 ? "bg-emerald-700" : "bg-slate-600"
  });
  if (chips.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.label} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.tone}`}>
          {c.label} {c.value > 0 ? c.value : c.value}
        </span>
      ))}
    </div>
  );
}

function intentText(intent: EnemyView["intent"]): string {
  switch (intent.kind) {
    case "attack": return `Attack ${intent.damage}`;
    case "defend": return `Block ${intent.block}`;
    case "attack_defend": return `Attack ${intent.damage} + Block ${intent.block}`;
    case "buff_strength": return `+${intent.amount} Strength`;
    case "debuff": {
      const parts: string[] = [];
      if (intent.vulnerable) parts.push(`Vuln ${intent.vulnerable}`);
      if (intent.weak) parts.push(`Weak ${intent.weak}`);
      return `Debuff (${parts.join(", ")})`;
    }
    case "heal": return `Heal ${intent.amount}`;
  }
}

// ------------------------ Reward --------------------------------------------

function RewardPhase({ options, disabled, onPick, onSkip }: {
  options: CardView[];
  disabled: boolean;
  onPick: (c: CardView) => void;
  onSkip: () => void;
}) {
  return (
    <div className="card-frame rounded-lg p-6">
      <h2 className="mb-4 font-display text-xl">Reward</h2>
      <div className="flex flex-wrap gap-3">
        {options.map((c) => (
          <button
            key={c.id}
            disabled={disabled}
            onClick={() => onPick(c)}
            className="card-frame w-44 rounded-lg p-3 text-left hover:-translate-y-1"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold">{c.name}</div>
              <div className="rounded-full bg-storm-accent px-2 text-xs font-bold text-storm-bg">{c.cost}</div>
            </div>
            <div className="mt-2 text-xs text-slate-300">{c.description}</div>
          </button>
        ))}
      </div>
      <button
        disabled={disabled}
        onClick={onSkip}
        className="mt-4 text-sm text-slate-400 underline"
      >
        Skip reward
      </button>
    </div>
  );
}

function Outcome({ title, tone, children }: {
  title: string;
  tone: "accent" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div className="card-frame flex flex-col items-center gap-4 rounded-lg p-12">
      <h2 className={`font-display text-4xl ${tone === "accent" ? "text-storm-accent" : "text-storm-danger"}`}>
        {title}
      </h2>
      {children}
    </div>
  );
}
