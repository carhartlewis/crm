import { localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { crmSession } from "../lib/crm-auth.ts";

// Signed-in CRM users in every environment; same-machine callers in `eve dev` only.
export default eveChannel({
  auth: [crmSession(process.env["CRM_API_URL"] ?? "http://localhost:3001"), localDev()],
});
