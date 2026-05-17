import { StackHandler } from "@stackframe/stack";
import { getStackServerApp } from "@/stack";

export default function Handler(props: {
  params: Promise<Record<string, unknown>>;
  searchParams: Promise<Record<string, unknown>>;
}) {
  return <StackHandler fullPage app={getStackServerApp()} routeProps={props} />;
}
