export interface NamedCompany {
  readonly id: string;
  readonly name: string;
  readonly domain: string | null;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The CRM companies a text names, by whole name (three letters or more) or by domain, longest
 * name first so "Acme Labs" ranks above "Acme". Shared by the API's recall and the agent's
 * capture, so both read the same companies out of a message.
 */
export function mentionedCompanies<T extends NamedCompany>(text: string, companies: readonly T[]) {
  const haystack = ` ${text.toLowerCase()} `;

  return companies
    .filter((company) => {
      const name = company.name.trim().toLowerCase();
      const domain = company.domain?.toLowerCase();

      return (
        (name.length >= 3 && new RegExp(`[^a-z0-9]${escape(name)}[^a-z0-9]`).test(haystack)) ||
        (domain !== undefined && haystack.includes(domain))
      );
    })
    .toSorted((a, b) => b.name.length - a.name.length);
}

/** Companies whose domain is an email address's domain or one of its parents. */
export function companiesForEmails<T extends NamedCompany>(
  addresses: readonly string[],
  companies: readonly T[],
) {
  const hosts = addresses.flatMap((address) => {
    const host = address.split("@")[1]?.toLowerCase();

    return host ? [host] : [];
  });

  return companies.filter((company) => {
    const domain = company.domain?.toLowerCase();

    return (
      domain !== undefined && hosts.some((host) => host === domain || host.endsWith(`.${domain}`))
    );
  });
}
