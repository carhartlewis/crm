import type { IntegrationId } from "./catalog.ts";
import granola from "./logos/granola.png";
import superhuman from "./logos/superhuman.png";

/**
 * Client-only: each app's square logo, as a URL the web build serves (hashed file). Kept out of
 * the catalog so the API never imports image files.
 */
export const logos: Record<IntegrationId, string> = { granola, superhuman };
