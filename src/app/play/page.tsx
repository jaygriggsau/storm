import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import GameClient from "@/components/GameClient";

export default async function PlayPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-storm-accent">Storm the Tower</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="text-xs text-slate-400 hover:text-slate-200">
            {session.user.email ?? "signed in"} — sign out
          </button>
        </form>
      </header>
      <GameClient />
    </main>
  );
}
