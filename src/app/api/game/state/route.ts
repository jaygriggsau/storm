import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadActiveRun } from "@/lib/game/repo";
import { toView } from "@/lib/game/view";
import { take } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user && (session.user as { id?: number | string }).id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!take(`state:${userId}`)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const loaded = await loadActiveRun(Number(userId));
  if (!loaded) return NextResponse.json({ run: null });
  return NextResponse.json({ run: toView(loaded.state) });
}
