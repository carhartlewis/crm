import { inferOrgAdditionalFields, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { workspaceSchema } from "../workspace/index.ts";

/** Browser auth client. `baseURL` is the origin that serves the better-auth handler under /api/auth. */
export function createCrmAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [
      // Workspaces are better-auth organizations; `website` is typed from the shared schema.
      organizationClient({ schema: inferOrgAdditionalFields(workspaceSchema) }),
    ],
  });
}

export type CrmAuthClient = ReturnType<typeof createCrmAuthClient>;
