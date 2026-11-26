/**
 * Workspace rules shared by the API (better-auth hooks) and the web setup form. Client-safe.
 * "Workspace" is the product name for a better-auth organization.
 */

export const WORKSPACE_NAME_MAX = 64;

/**
 * The better-auth organization schema for workspaces, shared by the server plugin and the
 * client plugin (`inferOrgAdditionalFields`) so `website` is typed end to end.
 */
export const workspaceSchema = {
  organization: {
    modelName: "workspace",
    additionalFields: { website: { type: "string", required: true, input: true } },
  },
} as const;

export type WebsiteResult = { ok: true; url: string } | { ok: false; message: string };

/** Accepts `acme.com`, `www.acme.com/about`, `https://acme.com`; stores a canonical https origin+path. */
export function normalizeWebsite(input: string): WebsiteResult {
  const trimmed = input.trim();

  if (!trimmed) return { ok: false, message: "Enter your website" };

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  if (!URL.canParse(candidate))
    return { ok: false, message: "Enter a valid website, like acme.com" };

  const url = new URL(candidate);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: "Website must be an http or https address" };
  }

  if (!url.hostname.includes(".") || url.username || url.password) {
    return { ok: false, message: "Enter a valid website, like acme.com" };
  }

  url.protocol = "https:";
  url.hash = "";
  url.search = "";

  return { ok: true, url: url.href.replace(/\/$/, "") };
}

export type WorkspaceNameResult = { ok: true; name: string } | { ok: false; message: string };

export function normalizeWorkspaceName(input: string): WorkspaceNameResult {
  const name = input.trim().replaceAll(/\s+/g, " ");

  if (!name) return { ok: false, message: "Enter a workspace name" };

  if (name.length > WORKSPACE_NAME_MAX) {
    return { ok: false, message: `Keep it under ${WORKSPACE_NAME_MAX} characters` };
  }

  return { ok: true, name };
}

/** URL-safe slug from the name; `suffix` disambiguates when the slug is taken. */
export function workspaceSlug(name: string, suffix?: string) {
  const base =
    name
      .normalize("NFKD")
      .replaceAll(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z\d]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace";

  return suffix ? `${base}-${suffix}` : base;
}

const SLUG = /^[a-z\d]+(?:-[a-z\d]+)*$/;

/** Slugs are lowercase words joined by single hyphens, at most 64 characters. */
export function isWorkspaceSlug(value: string) {
  return value.length <= 64 && SLUG.test(value);
}

/** Logos are https URLs only, so a logo can never be a script or tracking-pixel vector. */
export function isWorkspaceLogo(value: string) {
  return URL.canParse(value) && new URL(value).protocol === "https:";
}
