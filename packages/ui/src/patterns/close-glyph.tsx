import close16 from "@carbon/icons/es/close/16.js";
import { carbonIcon } from "@crm/ui/components/icon";

const CloseIcon = carbonIcon(close16);

/** The small muted close mark of sheets and search fields. */
export function CloseGlyph() {
  return <CloseIcon className="size-3 text-muted-foreground" />;
}
