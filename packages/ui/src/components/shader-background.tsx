import { GrainGradient } from "@paper-design/shaders-react";
import { cn } from "cn";
import { useSyncExternalStore } from "react";

/**
 * Full-bleed animated backdrop for the welcome screen (Paper shaders, WebGL). Load it with
 * React.lazy: it is decorative and must stay out of the cold-entry bundle.
 *
 * Colors come from the theme tokens, so the backdrop follows light/dark with the text on top.
 */

const TOKENS = ["--background", "--muted", "--secondary"] as const;

let canvas: CanvasRenderingContext2D | null = null;

/** Theme tokens are OKLCH; the shader parses hex/rgb/hsl, so resolve each token to an sRGB pixel. */
function toRgb(color: string) {
  canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });

  if (!canvas) return "rgb(250, 250, 250)";

  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = color;
  canvas.fillRect(0, 0, 1, 1);

  const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;

  return `rgb(${r}, ${g}, ${b})`;
}

/** Snapshot is a stable string so useSyncExternalStore only re-renders on a real change. */
function readThemeColors() {
  const style = getComputedStyle(document.documentElement);

  return TOKENS.map((token) => toRgb(style.getPropertyValue(token).trim())).join("|");
}

/** The theme changes via the `dark` class on <html> (ThemeProvider) or the OS color scheme. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  scheme.addEventListener("change", onChange);

  return () => {
    observer.disconnect();
    scheme.removeEventListener("change", onChange);
  };
}

function ShaderBackground({ className }: { className?: string }) {
  const [background = "", muted = "", secondary = ""] = useSyncExternalStore(
    subscribe,
    readThemeColors,
    () => "",
  ).split("|");

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10 bg-background", className)}
    >
      {background && (
        <GrainGradient
          // Fades in once the lazy chunk arrives, instead of popping in behind settled content.
          className="size-full animate-backdrop"
          colorBack={background}
          colors={[background, muted, secondary]}
          // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `shape` is the Paper shader's own prop name.
          shape="wave"
          softness={0.9}
          intensity={0.25}
          noise={0.35}
          speed={0.25}
        />
      )}
    </div>
  );
}

export default ShaderBackground;

export { ShaderBackground };
