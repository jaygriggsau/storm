import "server-only";
import { StackServerApp } from "@stackframe/stack";

// Neon Auth (Stack Auth under the hood). Constructed lazily so that
// `next build`'s page-data collection — which evaluates server modules
// without runtime env vars — doesn't blow up on a missing project ID.

// Must stay in sync with the placeholder in next.config.mjs.
const BUILD_STUB_PROJECT_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

export function isAuthConfigured(): boolean {
  const id = process.env.NEXT_PUBLIC_STACK_PROJECT_ID;
  if (!id || id === BUILD_STUB_PROJECT_ID) return false;
  if (!process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY) return false;
  if (!process.env.STACK_SECRET_SERVER_KEY) return false;
  return true;
}

let cached: StackServerApp<true> | null = null;

export function getStackServerApp(): StackServerApp<true> {
  if (!cached) {
    cached = new StackServerApp({
      tokenStore: "nextjs-cookie",
      urls: {
        signIn: "/handler/sign-in",
        afterSignIn: "/play",
        afterSignUp: "/play",
        afterSignOut: "/"
      }
    });
  }
  return cached;
}
