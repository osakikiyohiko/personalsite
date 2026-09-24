// Cloudflare Worker: valida no servidor o token do Turnstile gerado pela verificação anti-robô
// do site (#humanGate) e responde { ok: true } quando ele é válido.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(origin ? corsHeaders(origin) : {}),
    },
  });
}

export default {
  async fetch(request, env) {
    const allowedOrigins = (env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
    const origin = request.headers.get("Origin");
    const originOk = origin && allowedOrigins.includes(origin);

    if (!originOk) return json({ error: "forbidden" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

    let token;
    try {
      ({ token } = await request.json());
    } catch {
      return json({ error: "bad_request" }, 400, origin);
    }
    if (typeof token !== "string" || !token || token.length > 2048) {
      return json({ error: "bad_request" }, 400, origin);
    }

    if (!env.TURNSTILE_SECRET_KEY) {
      return json({ error: "verification_failed", codes: ["worker-missing-TURNSTILE_SECRET_KEY"] }, 500, origin);
    }

    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET_KEY);
    form.append("response", token);
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) form.append("remoteip", ip);

    const outcome = await (await fetch(SITEVERIFY_URL, { method: "POST", body: form })).json();
    const allowedHosts = allowedOrigins.map((o) => new URL(o).hostname);
    if (!outcome.success || !allowedHosts.includes(outcome.hostname)) {
      // Códigos do siteverify (ex.: invalid-input-secret) ajudam a diagnosticar; não são sensíveis.
      const codes = outcome["error-codes"] || [];
      if (outcome.success) codes.push(`hostname-mismatch:${outcome.hostname}`);
      return json({ error: "verification_failed", codes }, 403, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};
