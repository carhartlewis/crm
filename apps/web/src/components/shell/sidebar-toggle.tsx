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
 * Shows or hides the sidebar (⌘B). It sits at the top-left of the page panel, never in the
 * sidebar, and the icon shows what a click will do.
 */
export function SidebarToggle() {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  const ToggleIcon = expanded ? CloseIcon : OpenIcon;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="app-region-no-drag"
      aria-label={expanded ? "Hide sidebar" : "Show sidebar"}
      aria-expanded={expanded}
      onClick={toggleSidebar}
    >
      <ToggleIcon />
    </Button>
  );
}
