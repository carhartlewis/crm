import { loadFonts } from "@crm/ui/lib/fonts";
import { applyInitialTheme } from "@crm/ui/components/theme-provider";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router.tsx";
import { dismissSplash } from "./splash.ts";

// Clean launch: correct theme on the first frame, and text that enters in its final font
// rather than swapping mid-animation. The font is local (~29 kB); the wait is capped.
applyInitialTheme();

const fontWait = new Promise<void>((resolve) => setTimeout(resolve, 300));

await Promise.race([loadFonts().catch(() => undefined), fontWait]);

const root = document.getElementById("root");

if (!root) throw new Error("index.html is missing #root");

dismissSplash(router);

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
