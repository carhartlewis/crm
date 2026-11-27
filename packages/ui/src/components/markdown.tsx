import { Markdown as Words } from "@pierre/words/react";
import { cn } from "cn";

/**
 * Rendered Markdown (`@pierre/words`, WebAssembly). Static content only; streaming chat uses the
 * same renderer with `isAnimating`. Raw HTML is dropped, so text from third parties (skills,
 * notes) can't inject markup. Load it lazily: the renderer is ~130 kB of JS. Its stylesheet is
 * imported by globals.css.
 */
function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div data-slot="markdown" className={cn("text-sm text-foreground select-text", className)}>
      <Words mode="static" allowedHtml={{}} controls={false} lineNumbers={false}>
        {children}
      </Words>
    </div>
  );
}

export { Markdown };
