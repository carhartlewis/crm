import { createCrmAuthClient } from "@crm/core/auth/client";

// The API is served from the same origin under /api (dev proxy, or the deployment's reverse proxy).
export const authClient = createCrmAuthClient(window.location.origin);
