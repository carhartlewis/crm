import chevronLeft from "@carbon/icons/es/chevron--left/16.js";
import chevronRight from "@carbon/icons/es/chevron--right/16.js";
import search from "@carbon/icons/es/search/16.js";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import { useRouter } from "@tanstack/react-router";
import { shortcuts } from "../../lib/shortcuts.ts";
import { HotkeyTooltip } from "../hotkey-tooltip.tsx";

const ChevronLeftIcon = carbonIcon(chevronLeft);
const ChevronRightIcon = carbonIcon(chevronRight);
const SearchIcon = carbonIcon(search);

export interface TitleBarControlsProps {
  readonly onSearch: () => void;
  readonly onSearchIntent: () => void;
}

/** Search, back and forward: in the sidebar's top row, or the page's when the sidebar hides. */
export function TitleBarControls({ onSearch, onSearchIntent }: TitleBarControlsProps) {
  const router = useRouter();

  return (
    <div className="app-region-no-drag flex items-center gap-0.5">
      <HotkeyTooltip shortcut={shortcuts.palette}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Search"
          onClick={onSearch}
          onPointerEnter={onSearchIntent}
        >
          <SearchIcon />
        </Button>
      </HotkeyTooltip>
      <HotkeyTooltip shortcut={shortcuts.back}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          onClick={() => router.history.back()}
        >
          <ChevronLeftIcon />
        </Button>
      </HotkeyTooltip>
      <HotkeyTooltip shortcut={shortcuts.forward}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Forward"
          onClick={() => router.history.forward()}
        >
          <ChevronRightIcon />
        </Button>
      </HotkeyTooltip>
    </div>
  );
}
