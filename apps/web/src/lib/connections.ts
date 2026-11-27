import type { Access } from "@crm/integrations";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

/** A connection as the API returns it (`Connection` in `@crm/core/api`). */
export interface Connection {
  readonly integration: string;
  readonly access: Access;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Connections belong to a user in a workspace, so both are in the key. */
export const connectionKeys = {
  all: ["connections"] as const,
  list: (userId: string, workspaceId: string) =>
    [...connectionKeys.all, userId, workspaceId] as const,
};

/** The body of an API error (the `@crm/core/api` error schemas all carry a `message`). */
interface ApiFailure {
  readonly message?: string;
}

async function send(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: init.body ? { "content-type": "application/json" } : undefined,
  });

  if (!response.ok) {
    const failure: ApiFailure = await response.json().catch(() => ({}));

    throw new Error(failure.message ?? "Something went wrong. Try again.");
  }

  return response;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(path, init);

  // SAFETY: the endpoint's success schema in `@crm/core/api` is `T`; each caller names it.
  return (await response.json()) as T;
}

export const connectionsQuery = (userId: string, workspaceId: string) =>
  queryOptions({
    queryKey: connectionKeys.list(userId, workspaceId),
    queryFn: () => request<readonly Connection[]>("/api/connections"),
  });

const refresh = (client: QueryClient) => client.invalidateQueries({ queryKey: connectionKeys.all });

/**
 * Starts the app's sign-in and leaves the page for it. The app returns to /connections. In the
 * desktop app the sign-in opens in the system browser; the list refreshes when the window
 * regains focus. So success means "on its way", not "connected".
 */
export const connectMutation = mutationOptions({
  mutationKey: [...connectionKeys.all, "connect"],
  mutationFn: async ({ integration, access }: { integration: string; access: Access }) => {
    const { url } = await request<{ url: string }>(
      `/api/connections/${encodeURIComponent(integration)}/authorize`,
      { method: "POST", body: JSON.stringify({ access }) },
    );

    window.location.assign(url);
  },
});

export const setAccessMutation = mutationOptions({
  mutationKey: [...connectionKeys.all, "access"],
  mutationFn: ({ integration, access }: { integration: string; access: Access }) =>
    request<Connection>(`/api/connections/${encodeURIComponent(integration)}`, {
      method: "PATCH",
      body: JSON.stringify({ access }),
    }),
  onSettled: (_data, _error, _variables, _result, { client }) => refresh(client),
});

export const disconnectMutation = mutationOptions({
  mutationKey: [...connectionKeys.all, "disconnect"],
  mutationFn: async (integration: string) => {
    await send(`/api/connections/${encodeURIComponent(integration)}`, { method: "DELETE" });
  },
  onSettled: (_data, _error, _variables, _result, { client }) => refresh(client),
});

/** What the app's sign-in returned with (`?connected=` or `?error=` on /connections). */
export function outcomeMessage(search: { connected?: string; error?: string }, name: string) {
  if (search.connected) return { ok: true, text: `${name} is connected.` };

  switch (search.error) {
    case undefined:
      return null;
    case "denied":
      return { ok: false, text: `${name} was not connected: access was declined.` };
    case "expired":
      return { ok: false, text: "That sign-in expired. Connect again." };
    case "wrong_user":
      return { ok: false, text: "That sign-in was started by another account." };
    default:
      return { ok: false, text: `${name} could not be connected. Try again.` };
  }
}
