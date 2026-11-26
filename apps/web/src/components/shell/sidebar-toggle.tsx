import sidePanelClose from "@carbon/icons/es/side-panel--close/16.js";
import sidePanelOpen from "@carbon/icons/es/side-panel--open/16.js";
import { desktopBridge } from "@crm/core/desktop";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import { useSidebar } from "@crm/ui/components/sidebar";

const CloseIcon = carbonIcon(sidePanelClose);
const OpenIcon = carbonIcon(sidePanelOpen);

// The macOS desktop window draws its traffic lights in the top-left corner.
export const trafficLights = desktopBridge()?.platform === "darwin";

/**
 * Shows or hides the sidebar (⌘B). A title-bar control, not part of the sidebar: it stays in the
 * same place, beside the traffic lights, whether the sidebar is open or not. The icon shows what
 * a click will do.
 */
export function SidebarToggle() {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  const ToggleIcon = expanded ? CloseIcon : OpenIcon;

  return (
    <div
      data-traffic-lights={trafficLights || undefined}
      className="app-region-no-drag fixed top-2.5 left-3 z-20 data-traffic-lights:left-19"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={expanded ? "Hide sidebar" : "Show sidebar"}
        aria-expanded={expanded}
        onClick={toggleSidebar}
      >
        <ToggleIcon />
      </Button>
    </div>
  );
}
