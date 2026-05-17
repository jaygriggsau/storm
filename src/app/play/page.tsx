import Link from "next/link";
import { redirect } from "next/navigation";
import { getStackServerApp, isAuthConfigured } from "@/stack";
import GameClient from "@/components/GameClient";
import SetupNeeded from "@/components/SetupNeeded";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  if (!isAuthConfigured()) return <SetupNeeded />;

  let user;
  try {
    user = await getStackServerApp().getUser();
  } catch (err) {
    console.error("PlayPage getUser failed", err);
    return <SetupNeeded />;
  }
  if (!user) redirect("/handler/sign-in");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-storm-accent">Storm the Tower</h1>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>{user.primaryEmail ?? user.displayName ?? "signed in"}</span>
          <Link href="/handler/account-settings" className="hover:text-slate-200">
            account
          </Link>
          <Link href="/handler/sign-out" className="hover:text-slate-200">
            sign out
          </Link>
        </div>
      </header>
      <GameClient />
    </main>
  );
}
