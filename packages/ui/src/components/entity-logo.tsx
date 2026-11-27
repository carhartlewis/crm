import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const entityLogoVariants = cva(
  "relative flex shrink-0 items-center justify-center overflow-hidden bg-muted font-medium text-muted-foreground select-none after:pointer-events-none after:absolute after:inset-0 after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten",
  {
    variants: {
      size: {
        xs: "size-4 rounded-[3px] text-[7px] after:rounded-[3px]",
        sm: "size-5 rounded-sm text-[8px] after:rounded-sm",
        default: "size-6 rounded-sm text-[9px] after:rounded-sm",
        lg: "size-8 rounded-md text-[11px] after:rounded-md",
        xl: "size-12 rounded-lg text-sm after:rounded-lg",
      },
      /** A company's mark keeps its square; a person's picture is round. */
      kind: {
        company: "",
        person: "rounded-full after:rounded-full",
      },
    },
    defaultVariants: { size: "default", kind: "company" },
  },
);

/** Up to two initials: "Northwind Labs" → "NL", "Kirinbase" → "KI". */
export function entityInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "";

  if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export type LogoTone = "opaque" | "dark" | "light";

/**
 * A company's logo, or a person's picture with `kind="person"`, falling back to initials while
 * the image loads or when it fails. A mark drawn in one colour (`tone`) is inverted in the other
 * theme when there is no dark copy, so a black logo stays visible on a dark background.
 */
export function EntityLogo({
  src,
  darkSrc,
  tone,
  name,
  size,
  kind,
  className,
}: {
  src: string | null | undefined;
  darkSrc?: string | null | undefined;
  tone?: string | null | undefined;
  name: string;
  className?: string;
} & VariantProps<typeof entityLogoVariants>) {
  const invert =
    darkSrc || !tone
      ? null
      : tone === "dark"
        ? "dark:invert"
        : tone === "light"
          ? "invert dark:invert-0"
          : null;

  return (
    <AvatarPrimitive.Root
      aria-hidden
      className={cn(entityLogoVariants({ size, kind }), className)}
      data-slot="entity-logo"
    >
      {src ? (
        <AvatarPrimitive.Image
          alt=""
          className={cn("size-full object-contain", darkSrc && "dark:hidden", invert)}
          src={src}
        />
      ) : null}
      {src && darkSrc ? (
        <AvatarPrimitive.Image
          alt=""
          className="hidden size-full object-contain dark:block"
          src={darkSrc}
        />
      ) : null}
      <AvatarPrimitive.Fallback className="leading-none tracking-tight">
        {entityInitials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
