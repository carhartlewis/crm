import { MemoryGraph } from "@crm/ui/patterns/memory-graph";
import type { ComponentProps } from "react";

/** The graph canvas in its own chunk: Supermemory's renderer is large and only memory views use it. */
export default function MemoryCanvas(props: ComponentProps<typeof MemoryGraph>) {
  return <MemoryGraph {...props} />;
}
