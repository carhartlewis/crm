import { BorderBeam as Beam, type BorderBeamProps } from "border-beam";
import { useTheme } from "@crm/ui/components/theme-provider";

export type { BorderBeamProps };

/**
 * The house border beam: monochrome, quiet, and following the app theme. Wrap a surface in it;
 * the beam reads the child's border radius. Honors `prefers-reduced-motion` (the library stops
 * the animation). Use this, never `border-beam` directly.
 */
function BorderBeam({ theme, ...props }: BorderBeamProps) {
  const { theme: appTheme } = useTheme();

  return (
    <Beam
      colorVariant="mono"
      staticColors
      strength={0.7}
      theme={theme ?? (appTheme === "system" ? "auto" : appTheme)}
      {...props}
    />
  );
}

export { BorderBeam };
