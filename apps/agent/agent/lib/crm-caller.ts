import { DEFAULT_PERMISSION_MODE, isPermissionMode, type PermissionMode } from "@crm/core/chat";
import { CHAT_RECORD_KINDS, type ChatRecordKind, isRecordOfKind } from "@crm/core/records";
import { Option, Schema } from "effect";
import type { SessionAuthContext } from "eve/context";

/** Who a CRM call acts for: the chat's caller and, for chats from the CRM, its workspace. */
export interface CrmCaller {
  readonly userId: string;
  readonly workspaceId: string | null;
  /** The chat's permission mode; Manual when the caller didn't come through a chat. */
  readonly permissionMode: PermissionMode;
  /** The record the chat is about, from a record sheet's Agent tab (ADR 0024). */
  readonly record: { readonly kind: ChatRecordKind; readonly id: string } | null;
  /**
   * What runs the turn, for usage (ADR 0027): `research` for a background session the API
   * started, `sheet` for a chat about one record, otherwise `chat`.
   */
  readonly origin: "chat" | "research" | "sheet";
}

const RecordAttributes = Schema.Struct({
  recordKind: Schema.Literals(CHAT_RECORD_KINDS),
  recordId: Schema.String,
});

const decodeRecord = Schema.decodeUnknownOption(RecordAttributes);

/** The record named by a caller's attributes, when both parts are valid. */
function recordOf(attributes: SessionAuthContext["attributes"]): CrmCaller["record"] {
  return Option.match(decodeRecord(attributes), {
    onNone: () => null,
    onSome: ({ recordKind, recordId }) =>
      isRecordOfKind(recordKind, recordId) ? { kind: recordKind, id: recordId } : null,
  });
}

/** The CRM user behind a turn; null for service, local-dev and anonymous callers. */
export function crmCaller(auth: SessionAuthContext | null | undefined): CrmCaller | null {
  if (auth?.principalType !== "user") return null;

  const workspace = auth.attributes["workspaceId"];
  const mode = auth.attributes["permissionMode"];
  const record = recordOf(auth.attributes);

  return {
    userId: auth.principalId,
    workspaceId: String(workspace) === workspace && workspace !== "" ? workspace : null,
    permissionMode:
      String(mode) === mode && isPermissionMode(mode) ? mode : DEFAULT_PERMISSION_MODE,
    record,
    origin: auth.attributes["origin"] === "research" ? "research" : record ? "sheet" : "chat",
  };
}
