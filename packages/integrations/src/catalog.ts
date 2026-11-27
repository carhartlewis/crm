/**
 * The apps a user can connect. Each one is a remote MCP server that authorizes with standard
 * MCP OAuth (RFC 9728 discovery, PKCE, then a Client ID Metadata Document or dynamic client
 * registration). Nothing here is per-app: scopes, endpoints and client registration are
 * discovered from `mcpUrl` at connect time, and the read/write choice is applied to the tools
 * the server publishes (see `access.ts`).
 *
 * To add an app, add one entry; its logo comes from context.dev by `domain`. Remote MCP servers are listed at https://integrations.sh/?kind=mcp.
 */
export interface Integration {
  /**
   * Stable id, stored on each connection. Also the tool prefix the agent sees, such as
   * `granola__list_meetings`, so use lowercase letters, digits and `-` only.
   */
  readonly id: string;
  readonly name: string;
  /** Who publishes the MCP server, shown as "by <vendor>". */
  readonly vendor: string;
  /**
   * The vendor's domain. `https://integrations.sh/<domain>/` is its directory entry, and its
   * logo comes from context.dev by this domain.
   */
  readonly domain: string;
  /** One line for people choosing what to connect. */
  readonly summary: string;
  /** What the server gives the agent. The model reads it to decide which tools to search. */
  readonly description: string;
  /** Streamable HTTP endpoint. */
  readonly mcpUrl: string;
}

export const integrations = [
  {
    id: "granola",
    name: "Granola",
    vendor: "Granola",
    domain: "granola.ai",
    summary: "Meeting notes and transcripts.",
    description:
      "Granola meeting notes: search meetings by person, company, topic or date, and read their notes, summaries and transcripts.",
    mcpUrl: "https://mcp.granola.ai/mcp",
  },
  {
    id: "superhuman",
    name: "Superhuman",
    vendor: "Superhuman",
    domain: "superhuman.com",
    summary: "Email: search, read, draft and send.",
    description:
      "The user's Superhuman mailbox: search and read email threads, and draft, reply to or send messages.",
    mcpUrl: "https://mcp.mail.superhuman.com/mcp",
  },
  // Enrichment and prospecting
  {
    id: "apollo",
    name: "Apollo",
    vendor: "Apollo.io",
    domain: "apollo.io",
    summary: "People and company data, emails and phone numbers.",
    description:
      "Apollo's B2B database: search and enrich people and companies by name, domain, title or industry, and find work emails and phone numbers.",
    mcpUrl: "https://mcp.apollo.io/mcp",
  },
  {
    id: "lusha",
    name: "Lusha",
    vendor: "Lusha",
    domain: "lusha.com",
    summary: "Contact and company data for prospecting.",
    description:
      "Lusha's B2B data: find and enrich contacts and companies, with work emails, phone numbers, roles and firmographics.",
    mcpUrl: "https://mcp.lusha.com/",
  },
  {
    id: "explorium",
    name: "Explorium",
    vendor: "Explorium",
    domain: "explorium.ai",
    summary: "Firmographics, technographics and buying signals.",
    description:
      "Explorium's B2B data: match and enrich companies and people, with firmographics, technographics, funding, hiring and intent signals.",
    mcpUrl: "https://mcp.explorium.ai/mcp",
  },
  {
    id: "clay",
    name: "Clay",
    vendor: "Clay",
    domain: "clay.com",
    summary: "Enrichment from many data providers.",
    description:
      "The user's Clay workspace: enrich people and companies from many data providers, and read and run Clay tables.",
    mcpUrl: "https://api.clay.com/v3/mcp",
  },
  {
    id: "harmonic",
    name: "Harmonic",
    vendor: "Harmonic",
    domain: "harmonic.ai",
    summary: "Startups: funding, headcount and founders.",
    description:
      "Harmonic's startup data: search companies and people, with funding rounds, investors, headcount growth and founder backgrounds.",
    mcpUrl: "https://mcp.api.harmonic.ai",
  },
  {
    id: "happenstance",
    name: "Happenstance",
    vendor: "Happenstance",
    domain: "happenstance.ai",
    summary: "Search the people in your network.",
    description:
      "Happenstance people search over the user's professional network: find who they or their team know at a company or with a given background.",
    mcpUrl: "https://happenstance.ai/mcp",
  },
  {
    id: "common-room",
    name: "Common Room",
    vendor: "Common Room",
    domain: "commonroom.io",
    summary: "Signals about people and accounts.",
    description:
      "Common Room's go-to-market data: look up people and accounts, with their activity and buying signals across product, community and the web.",
    mcpUrl: "https://mcp.commonroom.io/mcp",
  },
  {
    id: "fairvalid",
    name: "FairValid",
    vendor: "FairValid",
    domain: "fairvalid.com",
    summary: "Email address verification.",
    description:
      "FairValid email verification: check whether an email address is valid and deliverable before it is saved or used.",
    mcpUrl: "https://mcp.fairvalid.com/mcp",
  },
  // Research and news
  {
    id: "tavily",
    name: "Tavily",
    vendor: "Tavily",
    domain: "tavily.com",
    summary: "Web search and page extraction.",
    description:
      "Tavily web search: search the web, extract the content of pages, and crawl or map websites.",
    mcpUrl: "https://mcp.tavily.com/mcp/",
  },
  {
    id: "you-com",
    name: "You.com",
    vendor: "You.com",
    domain: "you.com",
    summary: "Real-time web and news search.",
    description: "You.com search: real-time web and news results, and the content of web pages.",
    mcpUrl: "https://api.you.com/mcp",
  },
  {
    id: "search1api",
    name: "Search1API",
    vendor: "Search1API",
    domain: "search1api.com",
    summary: "Web and news search, and page crawling.",
    description: "Search1API: web and news search, page crawling and site maps.",
    mcpUrl: "https://mcp.search1api.com/mcp",
  },
  {
    id: "specstream",
    name: "Specstream",
    vendor: "Specstream",
    domain: "specstream.ai",
    summary: "Find and extract structured data from the live web.",
    description:
      "Specstream live-web data: find, extract and enrich structured data, such as company and people lists, from the web.",
    mcpUrl: "https://api.specstream.ai/mcp",
  },
  {
    id: "similarweb",
    name: "Similarweb",
    vendor: "Similarweb",
    domain: "similarweb.com",
    summary: "Website traffic and digital intelligence.",
    description:
      "Similarweb data about websites and companies: traffic, engagement, traffic sources, rankings and competitors.",
    mcpUrl: "https://mcp.similarweb.com",
  },
  {
    id: "cb-insights",
    name: "CB Insights",
    vendor: "CB Insights",
    domain: "cbinsights.com",
    summary: "Private companies, funding and markets.",
    description:
      "CB Insights private-market data: companies, funding, investors, acquisitions and market research.",
    mcpUrl: "https://mcp.cbinsights.com",
  },
  {
    id: "factiva",
    name: "Factiva",
    vendor: "Dow Jones",
    domain: "dowjones.com",
    summary: "News and business information.",
    description:
      "Dow Jones Factiva: search licensed news and business publications about companies, people and industries.",
    mcpUrl: "https://factiva.mcp.shared-data.dowjones.io/mcp",
  },
  // Meetings
  {
    id: "fireflies",
    name: "Fireflies",
    vendor: "Fireflies.ai",
    domain: "fireflies.ai",
    summary: "Meeting recordings, transcripts and summaries.",
    description:
      "Fireflies meetings: search meetings by person, company, topic or date, and read their transcripts, summaries and action items.",
    mcpUrl: "https://api.fireflies.ai/mcp",
  },
  {
    id: "fathom",
    name: "Fathom",
    vendor: "Fathom",
    domain: "fathom.ai",
    summary: "Meeting recordings, transcripts and summaries.",
    description:
      "Fathom meetings: search recorded meetings, and read their transcripts, summaries and action items.",
    mcpUrl: "https://api.fathom.ai/mcp",
  },
  {
    id: "otter",
    name: "Otter",
    vendor: "Otter.ai",
    domain: "otter.ai",
    summary: "Meeting transcripts and summaries.",
    description:
      "Otter meetings: search meetings and conversations, and read their transcripts, summaries and action items.",
    mcpUrl: "https://mcp.otter.ai/mcp",
  },
  {
    id: "grain",
    name: "Grain",
    vendor: "Grain",
    domain: "grain.com",
    summary: "Meeting recordings and conversation intelligence.",
    description:
      "Grain meetings: search recorded calls, and read their transcripts, notes, highlights and deal insights.",
    mcpUrl: "https://api.grain.com/_/mcp",
  },
  {
    id: "circleback",
    name: "Circleback",
    vendor: "Circleback",
    domain: "circleback.ai",
    summary: "Meeting notes, transcripts and action items.",
    description:
      "Circleback meetings: search meetings, and read their notes, transcripts and action items.",
    mcpUrl: "https://app.circleback.ai/api/mcp",
  },
  {
    id: "read-ai",
    name: "Read AI",
    vendor: "Read AI",
    domain: "read.ai",
    summary: "Meeting reports and transcripts.",
    description:
      "Read AI meetings: search meetings, and read their reports, transcripts and action items.",
    mcpUrl: "https://api.read.ai/mcp",
  },
  {
    id: "fellow",
    name: "Fellow",
    vendor: "Fellow",
    domain: "fellow.ai",
    summary: "Meeting notes, recordings and action items.",
    description:
      "Fellow meetings: search meetings, and read their notes, transcripts and action items.",
    mcpUrl: "https://fellow.app/mcp",
  },
  {
    id: "sybill",
    name: "Sybill",
    vendor: "Sybill",
    domain: "sybill.ai",
    summary: "Sales call notes and deal summaries.",
    description:
      "Sybill sales calls: read call summaries, deal context and follow-ups from the user's sales meetings.",
    mcpUrl: "https://mcp.sybill.ai/mcp",
  },
  // Scheduling and outreach
  {
    id: "calendly",
    name: "Calendly",
    vendor: "Calendly",
    domain: "calendly.com",
    summary: "Scheduling links and booked meetings.",
    description:
      "The user's Calendly: event types, scheduling links, booked meetings and invitees.",
    mcpUrl: "https://mcp.calendly.com",
  },
  {
    id: "cal-com",
    name: "Cal.com",
    vendor: "Cal.com",
    domain: "cal.com",
    summary: "Scheduling links and bookings.",
    description: "The user's Cal.com: event types, availability and bookings.",
    mcpUrl: "https://mcp.cal.com/mcp",
  },
  {
    id: "outreach",
    name: "Outreach",
    vendor: "Outreach",
    domain: "outreach.io",
    summary: "Sales sequences, prospects and accounts.",
    description: "The user's Outreach: prospects, accounts, sequences and their activity.",
    mcpUrl: "https://api.outreach.io/mcp/",
  },
  {
    id: "instantly",
    name: "Instantly",
    vendor: "Instantly",
    domain: "instantly.ai",
    summary: "Cold email campaigns and leads.",
    description: "The user's Instantly: email campaigns, leads, replies and campaign results.",
    mcpUrl: "https://mcp.instantly.ai/mcp",
  },
  {
    id: "lemlist",
    name: "lemlist",
    vendor: "lemlist",
    domain: "lemlist.com",
    summary: "Outreach campaigns and leads.",
    description: "The user's lemlist: multichannel campaigns, leads and their activity.",
    mcpUrl: "https://app.lemlist.com/mcp",
  },
  {
    id: "mixmax",
    name: "Mixmax",
    vendor: "Mixmax",
    domain: "mixmax.com",
    summary: "Email sequences, tracking and meetings.",
    description: "The user's Mixmax: email sequences, email tracking and meeting scheduling.",
    mcpUrl: "https://mcp.mixmax.com/mcp",
  },
  // Other CRMs
  {
    id: "attio",
    name: "Attio",
    vendor: "Attio",
    domain: "attio.com",
    summary: "CRM records, lists, notes and tasks.",
    description: "The user's Attio CRM: companies, people, deals, lists, notes and tasks.",
    mcpUrl: "https://mcp.attio.com/mcp",
  },
  {
    id: "close",
    name: "Close",
    vendor: "Close",
    domain: "close.com",
    summary: "CRM leads, contacts and opportunities.",
    description: "The user's Close CRM: leads, contacts, opportunities, calls, emails and tasks.",
    mcpUrl: "https://mcp.close.com/mcp",
  },
  {
    id: "streak",
    name: "Streak",
    vendor: "Streak",
    domain: "streak.com",
    summary: "Gmail CRM pipelines and boxes.",
    description:
      "The user's Streak CRM in Gmail: pipelines, boxes, contacts and their email threads.",
    mcpUrl: "https://api.streak.com/mcp",
  },
  // Customers and deals
  {
    id: "stripe",
    name: "Stripe",
    vendor: "Stripe",
    domain: "stripe.com",
    summary: "Customers, subscriptions and invoices.",
    description: "The user's Stripe account: customers, subscriptions, invoices and payments.",
    mcpUrl: "https://mcp.stripe.com",
  },
  {
    id: "pandadoc",
    name: "PandaDoc",
    vendor: "PandaDoc",
    domain: "pandadoc.com",
    summary: "Proposals, quotes and contracts.",
    description: "The user's PandaDoc: proposals, quotes and contracts, and their status.",
    mcpUrl: "https://mcp.pandadoc.com/v1/mcp",
  },
  {
    id: "crossbeam",
    name: "Crossbeam",
    vendor: "Crossbeam",
    domain: "crossbeam.com",
    summary: "Partner account overlaps.",
    description:
      "The user's Crossbeam: which partners share an account, customer or open opportunity.",
    mcpUrl: "https://mcp.crossbeam.com",
  },
  {
    id: "intercom",
    name: "Intercom",
    vendor: "Intercom",
    domain: "intercom.com",
    summary: "Customer conversations and support.",
    description: "The user's Intercom: customer conversations, contacts and companies.",
    mcpUrl: "https://mcp.intercom.com/mcp",
  },
  {
    id: "pylon",
    name: "Pylon",
    vendor: "Pylon",
    domain: "usepylon.com",
    summary: "B2B support issues and accounts.",
    description: "The user's Pylon: support issues, accounts and their conversations.",
    mcpUrl: "https://mcp.usepylon.com/",
  },
] as const satisfies readonly Integration[];

export type IntegrationId = (typeof integrations)[number]["id"];

const byId = new Map<string, Integration>(integrations.map((entry) => [entry.id, entry]));

export function integrationById(id: string): Integration | undefined {
  return byId.get(id);
}

export function isIntegrationId(value: string): value is IntegrationId {
  return byId.has(value);
}

/** The directory entry for an integration on integrations.sh. */
export function directoryUrl(integration: Integration) {
  return `https://integrations.sh/${integration.domain}/`;
}
