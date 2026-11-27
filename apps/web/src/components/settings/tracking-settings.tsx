import copy16 from "@carbon/icons/es/copy/16.js";
import { trackingSnippet } from "@crm/core/tracking";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { toast } from "sonner";
import {
  disableTrackingMutation,
  enableTrackingMutation,
  trackingSettingsQuery,
} from "../../lib/tracking.ts";
import { SettingsCard } from "./settings-card.tsx";

const CopyIcon = carbonIcon(copy16);

type Props = { userId: string; workspaceId: string };

/**
 * Website tracking: turn the snippet on, copy it into the website's `<head>`, or turn it off.
 * Visits then show on matching companies and contacts as "Website activity". It has its own
 * Suspense boundary, so the rest of the page never waits for its key.
 */
export function TrackingSettings(props: Props) {
  return (
    <Suspense fallback={null}>
      <TrackingCard {...props} />
    </Suspense>
  );
}

function TrackingCard({ userId, workspaceId }: Props) {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(trackingSettingsQuery(userId, workspaceId));

  const enable = useMutation({
    ...enableTrackingMutation(queryClient, userId, workspaceId),
    onError: (error) => toast.error(error.message),
  });

  const disable = useMutation({
    ...disableTrackingMutation(queryClient, userId, workspaceId),
    onSuccess: () => toast.success("Website tracking is off"),
    onError: (error) => toast.error(error.message),
  });

  const snippet = settings.key ? trackingSnippet(window.location.origin, settings.key) : null;

  const copySnippet = useMutation({
    mutationFn: (text: string) => navigator.clipboard.writeText(text),
    onSuccess: () => toast.success("Snippet copied"),
    onError: () => toast.error("Couldn't copy. Select the snippet and copy it instead."),
  });

  if (!snippet) {
    return (
      <SettingsCard
        action={
          <Button loading={enable.isPending} onClick={() => enable.mutate()} size="sm">
            Turn on
          </Button>
        }
        description="See which companies and contacts visit your website, what they read and where they came from."
        hint="You get a snippet to paste into your website."
        title="Website tracking"
      >
        <p className="text-pretty text-muted-foreground">
          Visitors stay anonymous until your site calls{" "}
          <code className="select-text">crm.identify(email)</code>, such as after a sign-up.
        </p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      action={
        <Button
          loading={disable.isPending}
          onClick={() => disable.mutate()}
          size="sm"
          variant="outline"
        >
          Turn off
        </Button>
      }
      description="Paste this snippet into the <head> of every page on your website."
      hint="Turning it off stops new visits; the ones you have stay."
      title="Website tracking"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Input
          aria-label="Tracking snippet"
          className="min-w-0 flex-1"
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          value={snippet}
        />
        <Button
          loading={copySnippet.isPending}
          onClick={() => copySnippet.mutate(snippet)}
          size="sm"
          variant="outline"
        >
          <CopyIcon />
          Copy
        </Button>
      </div>
      <p className="mt-3 text-pretty text-muted-foreground">
        Call <code className="select-text">crm.identify(email)</code> once a visitor tells you who
        they are, and their visits join that contact and their company.
      </p>
    </SettingsCard>
  );
}
