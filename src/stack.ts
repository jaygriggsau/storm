import "server-only";
import { StackServerApp } from "@stackframe/stack";

// Neon Auth (Stack Auth under the hood). Constructed lazily so that
// `next build`'s page-data collection — which evaluates server modules
// without runtime env vars — doesn't blow up on a missing project ID.

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
