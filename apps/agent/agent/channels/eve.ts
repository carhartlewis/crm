import { localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { CHAT_FILE_BYTES, fetchChatFile } from "../lib/chat-files.ts";
import { crmProxy } from "../lib/crm-auth.ts";

// Only the CRM API, which checks who may see each chat (ADR 0018); same-machine callers in
// `eve dev` only. Attached files arrive as URLs to the CRM's storage, up to 30 MB.
export default eveChannel({
  auth: [crmProxy(process.env["AGENT_PROXY_SECRET"]), localDev()],
  uploadPolicy: { maxBytes: CHAT_FILE_BYTES },
  fetchFile: fetchChatFile,
});
