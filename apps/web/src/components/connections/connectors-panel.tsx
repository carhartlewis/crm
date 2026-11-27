import add from "@carbon/icons/es/add/16.js";
import checkmarkOutline from "@carbon/icons/es/checkmark--outline/16.js";
import checkmark from "@carbon/icons/es/checkmark/16.js";
import { type Access, integrations, type Integration } from "@crm/integrations";
import { desktopBridge } from "@crm/core/desktop";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Card } from "@crm/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  type Connection,
  connectionLogosQuery,
  connectMutation,
  disconnectMutation,
  setAccessMutation,
} from "../../lib/connections.ts";

const AddIcon = carbonIcon(add);
const VerifiedIcon = carbonIcon(checkmarkOutline);
const CheckIcon = carbonIcon(checkmark);

const accessLabels: Record<Access, string> = { read: "Read only", write: "Read and write" };

const accessHints: Record<Access, string> = {
  read: "Look things up",
  write: "Also act, after you approve each action",
};

const onError = (error: Error) => toast.error(error.message);

/** The apps people can connect, as a grid of cards. */
export function ConnectorsPanel({
  connections,
  userId,
  workspaceId,
}: {
  connections: readonly Connection[];
  userId: string;
  workspaceId: string;
}) {
  const byIntegration = new Map(connections.map((entry) => [entry.integration, entry]));
  const { data: logos } = useQuery(connectionLogosQuery(userId, workspaceId));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground select-none">
        The assistant can use the apps you connect. Read lets it look things up; read and write also
        lets it act, and it asks you before each action.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            logo={logos?.[integration.id] ?? null}
            connection={byIntegration.get(integration.id)}
          />
        ))}
      </div>
    </div>
  );
}

function IntegrationCard({
  integration,
  logo,
  connection,
}: {
  integration: Integration;
  logo: string | null;
  connection: Connection | undefined;
}) {
  const connect = useMutation({ ...connectMutation, onError });
  const setAccess = useMutation({ ...setAccessMutation, onError });

  const disconnect = useMutation({
    ...disconnectMutation,
    onError,
    onSuccess: () => toast(`${integration.name} is disconnected.`),
  });

  // While a change is in flight, show the level being saved.
  const access = setAccess.isPending ? setAccess.variables.access : connection?.access;

  return (
    <Card>
      <div className="flex items-start gap-4 px-5 py-1">
        <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
          {logo ? (
            <img src={logo} alt="" width={40} height={40} className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center font-medium text-muted-foreground">
              {integration.name.slice(0, 1)}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="flex items-center gap-1.5 text-base font-medium">
            {integration.name}
            <VerifiedIcon aria-label="Verified" className="text-muted-foreground" />
          </h2>
          <p className="text-muted-foreground">{integration.summary}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            {connection && access ? (
              <>
                <Badge variant="secondary">
                  <CheckIcon />
                  Added
                </Badge>
                <span aria-hidden>·</span>
                <span>{accessLabels[access]}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span>by {integration.vendor}</span>
          </p>
        </div>
        {connection && access ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="success"
                  size="icon"
                  aria-label={`${integration.name} settings`}
                  loading={setAccess.isPending || disconnect.isPending}
                />
              }
            >
              <CheckIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Access</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={access}
                  onValueChange={(next: Access) =>
                    next !== access &&
                    setAccess.mutate({ integration: integration.id, access: next })
                  }
                >
                  {(["read", "write"] as const).map((option) => (
                    <DropdownMenuRadioItem key={option} value={option}>
                      <AccessOption access={option} />
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => disconnect.mutate(integration.id)}
              >
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <DropdownMenu>
            {/* On the web, success means the page is leaving for the app's sign-in: keep the
                spinner. The desktop app stays put while the system browser signs in. */}
            <DropdownMenuTrigger
              render={
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={`Connect ${integration.name}`}
                  loading={connect.isPending || (connect.isSuccess && !desktopBridge())}
                />
              }
            >
              <AddIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Connect {integration.name}</DropdownMenuLabel>
                {(["read", "write"] as const).map((option) => (
                  <DropdownMenuItem
                    key={option}
                    onClick={() => connect.mutate({ integration: integration.id, access: option })}
                  >
                    <AccessOption access={option} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Card>
  );
}

function AccessOption({ access }: { access: Access }) {
  return (
    <span className="flex flex-col">
      <span>{accessLabels[access]}</span>
      <span className="text-xs text-muted-foreground">{accessHints[access]}</span>
    </span>
  );
}
