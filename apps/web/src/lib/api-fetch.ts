/** Same-origin calls to the JSON API, throwing its error `message` on failure. */

/** The body of an API error (the `@crm/core/api` error schemas all carry a `message`). */
interface ApiFailure {
  readonly message?: string;
}

export async function send(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: init.body ? { "content-type": "application/json" } : undefined,
  });

  if (!response.ok) {
    const failure: ApiFailure = await response.json().catch(() => ({}));

    throw new Error(failure.message ?? "Something went wrong. Try again.");
  }

  return response;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(path, init);

  // SAFETY: the endpoint's success schema in `@crm/core/api` is `T`; each caller names it.
  return (await response.json()) as T;
}
