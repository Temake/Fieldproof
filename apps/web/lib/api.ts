/**
 * API access is split by where it runs:
 *
 *   lib/api/server.ts  Server Components - calls the API directly with the key
 *   lib/api/client.ts  Browser - same-origin calls through app/api/[...path]
 *   lib/api/errors.ts  Shared error type, imported by both
 *
 * This entry point exposes only what is safe everywhere.
 */
export { ApiError, errorMessage, toApiError } from "./api/errors";
