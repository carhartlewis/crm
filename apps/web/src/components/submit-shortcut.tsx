import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { formToSubmit } from "../lib/submit-shortcut.ts";

/** ⌘Enter submits the focused form, on every page (mounted once, at the root). */
export function SubmitShortcut() {
  useMountEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const focused = document.activeElement;
      const form = formToSubmit(event, focused instanceof Element ? focused : null);

      if (!(form instanceof HTMLFormElement)) return;

      event.preventDefault();
      // `requestSubmit` runs the form's own submit handler and validation, as the button would.
      form.requestSubmit();
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  });

  return null;
}
