import { isCompanyId, normalizeCompanyDomain, normalizeCompanyName } from "@crm/core/company";

/**
 * Pure decisions behind the companies endpoints and the shape proxy: input normalisation and
 * workspace authorisation. No I/O, so they are tested directly.
 */

export type Decision<A> = { ok: true; value: A } | { ok: false; message: string };

const fail = (message: string): Decision<never> => ({ ok: false, message });

export interface NewCompany {
  id: string;
  name: string;
  domain: string | null;
}

export interface CompanyPatch {
  name?: string;
  domain?: string | null;
}

export function parseCompanyId(id: string): Decision<string> {
  return isCompanyId(id) ? { ok: true, value: id } : fail("Company id must be a lowercase UUID");
}

export function parseNewCompany(input: {
  id: string;
  name: string;
  domain: string | null;
}): Decision<NewCompany> {
  const id = parseCompanyId(input.id);

  if (!id.ok) return id;

  const name = normalizeCompanyName(input.name);

  if (!name.ok) return fail(name.message);

  const domain = normalizeCompanyDomain(input.domain);

  if (!domain.ok) return fail(domain.message);

  return { ok: true, value: { id: id.value, name: name.name, domain: domain.domain } };
}

/** Normalises only the fields present; absent fields stay unchanged. */
export function parseCompanyPatch(input: {
  name?: string | undefined;
  domain?: string | null | undefined;
}): Decision<CompanyPatch> {
  const patch: CompanyPatch = {};

  if (input.name !== undefined) {
    const name = normalizeCompanyName(input.name);

    if (!name.ok) return fail(name.message);

    patch.name = name.name;
  }

  if (input.domain !== undefined) {
    const domain = normalizeCompanyDomain(input.domain);

    if (!domain.ok) return fail(domain.message);

    patch.domain = domain.domain;
  }

  return { ok: true, value: patch };
}

/**
 * The workspace a request may act in: the session's active workspace, only when the user is a
 * member of it. `requested` (the shape proxy's `?workspace=`) must name that same workspace, so a
 * client can never pick another tenant by changing the URL.
 */
export function authorizeWorkspace(input: {
  activeWorkspaceId: string | null;
  requested?: string | null | undefined;
  isMember: boolean;
}): Decision<string> {
  if (!input.activeWorkspaceId) return fail("Choose a workspace first");

  if (input.requested !== undefined && input.requested !== input.activeWorkspaceId) {
    return fail("That workspace is not your active workspace");
  }

  if (!input.isMember) return fail("You are not a member of this workspace");

  return { ok: true, value: input.activeWorkspaceId };
}
