import { useTheme } from "@crm/ui/components/theme-provider";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import checkmarkOutline16 from "@carbon/icons/es/checkmark--outline/16.js";
import inProgress16 from "@carbon/icons/es/in-progress/16.js";
import information16 from "@carbon/icons/es/information/16.js";
import misuse16 from "@carbon/icons/es/misuse/16.js";
import warningAlt16 from "@carbon/icons/es/warning--alt/16.js";
import { carbonIcon } from "@crm/ui/components/icon";

const CheckmarkOutlineIcon = carbonIcon(checkmarkOutline16);
const InProgressIcon = carbonIcon(inProgress16);
const InformationIcon = carbonIcon(information16);
const MisuseIcon = carbonIcon(misuse16);
const WarningAltIcon = carbonIcon(warningAlt16);

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CheckmarkOutlineIcon className="size-4" />,
        info: <InformationIcon className="size-4" />,
        warning: <WarningAltIcon className="size-4" />,
        error: <MisuseIcon className="size-4" />,
        loading: <InProgressIcon className="size-4 animate-spin" />,
      }}
      style={
        // SAFETY: React.CSSProperties does not model CSS custom properties; every key here is a `--*` variable with a string value.
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
