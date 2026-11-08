/** A failed HTTP call, keeping the status so the UI can tell "refused" (401/403) from "unreachable". */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** The site refused the call: typically sign-in required, or bot protection. Retrying won't help. */
export function isRefused(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 401 || error.status === 403);
}
