/** Shared error shape for server and browser API calls. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNotFound() {
    return this.status === 404;
  }

  /** The API process could not be reached at all (proxy returns 502). */
  get isUnreachable() {
    return this.status === 0 || this.status === 502 || this.status === 503;
  }
}

/**
 * FastAPI answers `{"detail": "..."}` for HTTP errors and
 * `{"detail": [{loc, msg}, ...]}` for validation errors.
 */
export async function toApiError(res: Response): Promise<ApiError> {
  let message = `${res.status} ${res.statusText}`.trim();
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body.detail)) {
      message = body.detail
        .map((item: { loc?: unknown[]; msg?: string }) => {
          const field = Array.isArray(item.loc) ? item.loc.slice(1).join(".") : "";
          return field ? `${field}: ${item.msg}` : item.msg;
        })
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    // Non-JSON body; keep the status line.
  }
  return new ApiError(res.status, message);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.isUnreachable
      ? "The FieldProof API is not reachable. Check that it is running."
      : error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
