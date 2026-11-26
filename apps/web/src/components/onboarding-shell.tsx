import { lazy, Suspense, type ReactNode } from "react";
import { AppMark } from "./brand.tsx";

// Decorative WebGL backdrop: its own chunk, never part of cold entry.
const ShaderBackground = lazy(() => import("@crm/ui/components/shader-background"));

/** Full-window layout for sign-in and workspace setup: shader backdrop, mark, title, content. */
export function OnboardingShell({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 select-none">
      <div className="app-region-drag fixed inset-x-0 top-0 h-10" />
      <Suspense>
        <ShaderBackground />
      </Suspense>
      <div className="flex w-full max-w-xl flex-col items-center gap-12 text-center">
        <div className="animate-pop">
          <AppMark />
        </div>
        <h1 className="animate-enter enter-delay-1 text-5xl font-medium tracking-tight text-balance">
          {title}
        </h1>
        <div className="animate-enter enter-delay-2 flex w-full flex-col items-center">
          {children}
        </div>
      </div>
    </main>
  );
}
