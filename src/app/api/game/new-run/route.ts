import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createRun, discardActive, loadActiveRun } from "@/lib/game/repo";
import { newRun } from "@/lib/game/engine";
import { toView } from "@/lib/game/view";
import { take } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user && (session.user as { id?: number | string }).id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!take(`new:${userId}`)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;

  const existing = await loadActiveRun(Number(userId));
  if (existing && !force) {
    return NextResponse.json({ run: toView(existing.state) });
  }
  if (existing && force) {
    await discardActive(Number(userId));
  }

  const state = newRun(Number(userId));
  await createRun(state);
  return NextResponse.json({ run: toView(state) });
}
