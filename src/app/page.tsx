import Link from "next/link";
import { redirect } from "next/navigation";
import { getStackServerApp } from "@/stack";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getStackServerApp().getUser();
  if (user) redirect("/play");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-12">
      <h1 className="font-display text-5xl tracking-wider text-storm-accent">
        Storm the Tower
      </h1>
      <p className="mt-4 text-center text-slate-300">
        A deck-builder climb. Every shuffle, every die roll, every enemy
        choice happens on the server — your client only ever sees what
        you&apos;re allowed to see.
      </p>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Link
          href="/handler/sign-in"
          className="w-64 rounded bg-storm-accent px-4 py-2 text-center font-semibold text-storm-bg hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href="/handler/sign-up"
          className="w-64 rounded border border-slate-600 bg-slate-800 px-4 py-2 text-center font-semibold text-slate-100 hover:bg-slate-700"
        >
          Create an account
        </Link>
      </div>

      <footer className="mt-12 text-xs text-slate-500">
        <Link href="https://vercel.com" className="hover:underline">Hosted on Vercel</Link>
        {" · "}
        <Link href="https://neon.com" className="hover:underline">Auth by Neon</Link>
      </footer>
    </main>
  );
}
