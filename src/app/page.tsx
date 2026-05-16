import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/play");

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

      <div className="mt-10 w-full space-y-6">
        {process.env.AUTH_RESEND_KEY && (
          <form
            action={async (formData) => {
              "use server";
              await signIn("resend", { email: formData.get("email"), redirectTo: "/play" });
            }}
            className="card-frame rounded-lg p-6"
          >
            <label className="block text-sm font-medium text-slate-200" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-2 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
              placeholder="you@example.com"
            />
            <button
              type="submit"
              className="mt-4 w-full rounded bg-storm-accent px-4 py-2 font-semibold text-storm-bg hover:opacity-90"
            >
              Send magic link
            </button>
          </form>
        )}

        {process.env.AUTH_GITHUB_ID && (
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/play" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded border border-slate-600 bg-slate-800 px-4 py-2 font-semibold text-slate-100 hover:bg-slate-700"
            >
              Continue with GitHub
            </button>
          </form>
        )}

        {!process.env.AUTH_RESEND_KEY && !process.env.AUTH_GITHUB_ID && (
          <p className="text-center text-storm-danger">
            No auth provider configured. Set AUTH_RESEND_KEY or AUTH_GITHUB_ID in .env.local.
          </p>
        )}
      </div>

      <footer className="mt-12 text-xs text-slate-500">
        <Link href="https://vercel.com" className="hover:underline">Hosted on Vercel</Link>
      </footer>
    </main>
  );
}
