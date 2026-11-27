import { type ReactiveIslands, Markdown as Words } from "@pierre/words/react";
import { cn } from "cn";

/**
 * Rendered Markdown (`@pierre/words`, WebAssembly). Raw HTML is dropped, so text from third
 * parties (skills, notes, model output) can't inject markup. Load it lazily: the renderer is
 * ~130 kB of JS. Its styles live in globals.css (`[data-slot="markdown"]`), at the app's type scale.
 *
 * Static by default. For text that streams in (assistant replies), pass `isAnimating`: `true`
 * while the stream is open, `false` once it ends. Any boolean switches the renderer to streaming
 * mode, which completes unfinished syntax while the stream is open. Keep passing a boolean for the
 * life of that message so the mode never changes under the renderer.
 *
 * `islands` mounts React components from ```` ```island-NAME ```` fences (a JSON body with an
 * `id`) and, for inline entries, `:NAME[label]{key="value"}` directives. Pass one registry that
 * never changes; each `render` checks its data and returns null to show the source instead.
 */
function Markdown({
  children,
  className,
  isAnimating,
  islands,
}: {
  children: string;
  className?: string;
  isAnimating?: boolean;
  islands?: ReactiveIslands;
}) {
  const streaming = isAnimating !== undefined;

  return (
    <div
      data-slot="markdown"
      data-streaming={isAnimating || undefined}
      aria-busy={isAnimating || undefined}
      className={cn("text-sm text-foreground select-text", className)}
    >
      <Words
        mode={streaming ? "streaming" : "static"}
        isAnimating={isAnimating ?? false}
        allowedHtml={{}}
        controls={false}
        lineNumbers={false}
        islands={islands}
      >
        {children}
      </Words>
    </div>
  );
}

export { Markdown, type ReactiveIslands };
