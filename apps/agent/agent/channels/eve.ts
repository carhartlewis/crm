import { localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { crmProxy } from "../lib/crm-auth.ts";

// Only the CRM API, which checks who may see each chat (ADR 0018); same-machine callers in
// `eve dev` only.
export default eveChannel({
  auth: [crmProxy(process.env["AGENT_PROXY_SECRET"]), localDev()],
});
