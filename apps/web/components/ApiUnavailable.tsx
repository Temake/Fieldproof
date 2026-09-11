import type { ApiError } from "@/lib/api/errors";
import { Alert } from "./ui/alert";

/** Shown by server pages when the first load fails, instead of a blank screen. */
export function ApiUnavailable({ error, what = "this page" }: { error: ApiError; what?: string }) {
  if (error.isUnreachable) {
    return (
      <Alert tone="danger" title="The FieldProof API is not reachable">
        <p>
          The console could not load {what}. Start the API from the repository root, then reload:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-control bg-surface px-3 py-2 font-mono text-micro text-ink">
          uvicorn fieldproof_api.main:app --port 8000 --env-file .env
        </pre>
      </Alert>
    );
  }
  if (error.status === 401) {
    return (
      <Alert tone="danger" title="The API rejected the console's credentials">
        Set <code className="font-mono">FIELDPROOF_API_KEY</code> for the web server to the same value the API uses.
      </Alert>
    );
  }
  return (
    <Alert tone="danger" title={`Could not load ${what}`}>
      {error.message}
    </Alert>
  );
}
