import { cn } from "cn";
import { createElement, type ComponentProps, type ReactNode } from "react";

/**
 * Carbon icons from `@carbon/icons` (one ES module per icon and size), rendered here.
 * `@carbon/icons-react` re-exports from ~120 kB "bucket" modules that bundlers can't
 * tree-shake, which added ~75 kB brotli to cold entry; per-icon descriptors cost ~1 kB.
 *
 *   import close from "@carbon/icons/es/close/16.js";
 *   const CloseIcon = carbonIcon(close);
 */
export interface CarbonIconNode {
  readonly elem: string;
  readonly attrs: Readonly<Record<string, string | number>>;
  readonly content?: readonly CarbonIconNode[];
}

export interface CarbonIconDescriptor extends CarbonIconNode {
  readonly name: string;
  readonly size: number;
}

// Carbon attribute names → React props (`data-*` and `aria-*` stay dashed).
const ATTRIBUTE_PROPS = new Map([
  ["class", "className"],
  ["fill-rule", "fillRule"],
  ["clip-rule", "clipRule"],
  ["stroke-width", "strokeWidth"],
  ["stroke-linecap", "strokeLinecap"],
  ["stroke-linejoin", "strokeLinejoin"],
]);

function toProps(attrs: CarbonIconNode["attrs"], key: number) {
  return Object.fromEntries([
    ["key", key],
    ...Object.entries(attrs).map(([name, value]) => [ATTRIBUTE_PROPS.get(name) ?? name, value]),
  ]);
}

function renderNode(node: CarbonIconNode, index: number): ReactNode {
  return createElement(node.elem, toProps(node.attrs, index), node.content?.map(renderNode));
}

export type IconProps = Omit<ComponentProps<"svg">, "children"> & { icon: CarbonIconDescriptor };

/** Decorative by default; pass `aria-label` (and it becomes `role="img"`) when the icon carries meaning. */
function Icon({ icon, className, ...props }: IconProps) {
  const labelled = props["aria-label"] !== undefined;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={String(icon.attrs["viewBox"])}
      width={icon.size}
      height={icon.size}
      fill="currentColor"
      focusable="false"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      data-icon={icon.name}
      className={cn("shrink-0", className)}
      {...props}
    >
      {icon.content?.map(renderNode)}
    </svg>
  );
}

/** A named icon component, so call sites read `<CloseIcon />` like any icon library. */
function carbonIcon(icon: CarbonIconDescriptor) {
  function CarbonIcon(props: Omit<IconProps, "icon">) {
    return <Icon icon={icon} {...props} />;
  }

  CarbonIcon.displayName = `CarbonIcon(${icon.name})`;

  return CarbonIcon;
}

export { carbonIcon, Icon };
