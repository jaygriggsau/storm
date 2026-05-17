import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createRun, discardActive, loadActiveRun } from "@/lib/game/repo";
import { newRun } from "@/lib/game/engine";
import { toView } from "@/lib/game/view";
import { take } from "@/lib/rate-limit";
import { CHARACTER_IDS, isCharacterId } from "@/lib/game/characters";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  force: z.boolean().optional(),
  character: z.enum(CHARACTER_IDS as [string, ...string[]]).optional()
});

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user && (session.user as { id?: number | string }).id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!take(`new:${userId}`)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { force, character } = parsed.data;

  const existing = await loadActiveRun(Number(userId));
  if (existing && !force) {
    return NextResponse.json({ run: toView(existing.state) });
  }

  if (!character || !isCharacterId(character)) {
    return NextResponse.json({ error: "character_required" }, { status: 400 });
  }

  if (existing && force) {
    await discardActive(Number(userId));
  }

  const state = newRun(Number(userId), character);
  await createRun(state);
  return NextResponse.json({ run: toView(state) });
}
