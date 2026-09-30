const DEFAULT_ORIGINS = [
  "https://333mtrsprts.com",
  "https://www.333mtrsprts.com",
  "https://333mtrsprts.myshopify.com",
];

export function storefrontOrigins(): string[] {
  const extra = (process.env.STOREFRONT_ORIGINS || "")
    .split(",")
    .map((v) => v.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

export function corsHeaders(request: Request): Headers {
  const origin = request.headers.get("origin") || "";
  const allowed = storefrontOrigins();
  const headers = new Headers();
  if (origin && allowed.includes(origin.replace(/\/$/, ""))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, X-333-Suggestions-Key",
  );
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export function corsResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(corsHeaders(request)),
    },
  });
}

export function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Same-origin or non-browser clients (curl) — allow if a matching key is used, else deny for POST from unknown sites.
    return false;
  }
  return storefrontOrigins().includes(origin.replace(/\/$/, ""));
}

export function suggestionsKeyOk(request: Request): boolean {
  const expected = (process.env.STOREFRONT_SUGGESTIONS_KEY || "").trim();
  if (!expected) return true;
  const got = (request.headers.get("x-333-suggestions-key") || "").trim();
  return got.length > 0 && got === expected;
}
