export default function SetupNeeded() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-12">
      <h1 className="font-display text-4xl text-storm-accent">Storm the Tower</h1>
      <div className="card-frame mt-8 w-full rounded-lg p-6">
        <h2 className="font-display text-xl text-storm-danger">Auth isn&apos;t configured</h2>
        <p className="mt-3 text-sm text-slate-300">
          This deployment is missing its Neon Auth credentials, so sign-in
          can&apos;t work yet. To fix:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm text-slate-300">
          <li>Open your project in the Neon console and enable <b>Auth</b>.</li>
          <li>
            Copy the three values it gives you into your Vercel project&apos;s
            environment variables:
            <ul className="mt-1 list-disc pl-6 font-mono text-xs">
              <li>NEXT_PUBLIC_STACK_PROJECT_ID</li>
              <li>NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY</li>
              <li>STACK_SECRET_SERVER_KEY</li>
            </ul>
          </li>
          <li>
            Also set <code className="font-mono">DATABASE_URL</code> (from the
            Vercel ↔ Neon integration, or pasted from Neon).
          </li>
          <li>Redeploy. <code className="font-mono">NEXT_PUBLIC_*</code> values are
            inlined at build time, so this redeploy is necessary even though
            most env-var changes don&apos;t need one.</li>
        </ol>
      </div>
    </main>
  );
}
