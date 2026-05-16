import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { mutateActiveRun, NotFound } from "@/lib/game/repo";
import {
  BadRequest,
  chooseNode,
  endTurn,
  pickReward,
  playCard,
  restHeal,
  skipReward
} from "@/lib/game/engine";
import { toView } from "@/lib/game/view";
import { take } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chooseNode"), nodeId: z.string().max(64) }),
  z.object({
    type: z.literal("playCard"),
    cardId: z.string().max(64),
    targetUid: z.string().max(64).optional()
  }),
  z.object({ type: z.literal("endTurn") }),
  z.object({ type: z.literal("pickReward"), cardId: z.string().max(64) }),
  z.object({ type: z.literal("skipReward") }),
  z.object({ type: z.literal("restHeal") })
]);

const BodySchema = z.object({
  idempotencyKey: z.string().max(64).optional(),
  action: ActionSchema
});

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user && (session.user as { id?: number | string }).id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!take(`act:${userId}`)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 });
  }
  const { action, idempotencyKey } = parsed.data;

  try {
    const { state } = await mutateActiveRun(Number(userId), idempotencyKey ?? null, (s) => {
      switch (action.type) {
        case "chooseNode":
          chooseNode(s, action.nodeId);
          break;
        case "playCard":
          playCard(s, action.cardId, action.targetUid);
          break;
        case "endTurn":
          endTurn(s);
          break;
        case "pickReward":
          pickReward(s, action.cardId);
          break;
        case "skipReward":
          skipReward(s);
          break;
        case "restHeal":
          restHeal(s);
          break;
      }
    });
    return NextResponse.json({ run: toView(state) });
  } catch (err) {
    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof NotFound) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("action error", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
