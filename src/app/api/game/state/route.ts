import { NextResponse } from "next/server";
import { getStackServerApp } from "@/stack";
import { loadActiveRun } from "@/lib/game/repo";
import { toView } from "@/lib/game/view";
import { take } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getStackServerApp().getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!take(`state:${user.id}`)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const loaded = await loadActiveRun(user.id);
  if (!loaded) return NextResponse.json({ run: null });
  return NextResponse.json({ run: toView(loaded.state) });
}
