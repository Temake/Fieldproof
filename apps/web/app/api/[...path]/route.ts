import type { NextRequest } from "next/server";
import { API_BASE_URL, authHeaders } from "@/lib/api/server";

/**
 * Same-origin proxy to the FieldProof API.
 *
 * The browser never holds FIELDPROOF_API_KEY: this handler adds the bearer
 * header on the server. It forwards the request as-is - the API remains the
 * only authority on what is allowed.
 */

export const dynamic = "force-dynamic";

const FORWARD_REQUEST = ["content-type", "accept"];
const FORWARD_RESPONSE = ["content-type", "cache-control", "www-authenticate", "content-disposition"];

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = `${API_BASE_URL}/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;

  const headers = new Headers(authHeaders());
  for (const name of FORWARD_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return Response.json({ detail: "The FieldProof API is not reachable." }, { status: 502 });
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
