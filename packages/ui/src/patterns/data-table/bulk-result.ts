export type BulkResult = {
  succeeded: number;
  failed: number;
  message: string | null;
};

export type BulkToast = {
  type: "success" | "warning" | "error";
  title: string;
};

export type BulkToastCopy = {
  done: (count: number) => string;
  someFailed: (count: number) => string;
  nothingChanged: string;
};

export function bulkToast(result: BulkResult, copy: BulkToastCopy): BulkToast {
  if (result.succeeded === 0) {
    return { type: "error", title: result.message ?? copy.nothingChanged };
  }

  if (result.failed > 0) {
    return {
      type: "warning",
      title: [copy.done(result.succeeded), copy.someFailed(result.failed), result.message]
        .filter(Boolean)
        .join(" "),
    };
  }

  return { type: "success", title: copy.done(result.succeeded) };
}
