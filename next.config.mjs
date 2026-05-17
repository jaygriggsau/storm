// Provide placeholder Stack Auth values when none are set in the build
// environment. On Vercel the real env vars are present, so these no-ops.
// Locally / in CI without secrets, this lets `next build` finish — the
// production app will of course need real values to actually function.
process.env.NEXT_PUBLIC_STACK_PROJECT_ID ??= "f47ac10b-58cc-4372-a567-0e02b2c3d479";
process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY ??= "pck_build_stub";
process.env.STACK_SECRET_SERVER_KEY ??= "ssk_build_stub";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
