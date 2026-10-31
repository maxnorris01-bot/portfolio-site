# Shop Mode proxy (`/api/shop/*`)

Status: configured in `vercel.json`, **untested until a preview deployment**. The React `/shop` page and its nav entry are later stages.

## How it works

The browser only talks to this site's domain. Vercel forwards every `/api/shop/*` request to the Shop Mode API on Fly (`https://room-redesign-shop.fly.dev/api/shop/*`) and adds an `x-origin-secret` header. The service refuses every request except `/healthz` that lacks a matching header, so the Fly address can't be used directly.

`vercel.json` has three parts:

- `routes`: `/api/shop/(.*)` → `https://room-redesign-shop.fly.dev/api/shop/$1`, with a `request.headers` transform that **sets** `x-origin-secret` from `$SHOP_ORIGIN_SECRET` (listed in the transform's `env`). `set` replaces any value a visitor sends.
- `headers`: `/api/shop/:path*` gets `x-vercel-enable-rewrite-caching: 0`, so Vercel never caches these responses.
- `rewrites`: unchanged, the single-page-app fallback for everything except `/api/`.

The secret value lives only in the Vercel environment variable `SHOP_ORIGIN_SECRET` (Production and Preview) and on Fly. It is never in the repo; `tests/shopproxy.test.ts` fails if a secret-looking literal appears in `vercel.json`.

If the variable is missing in a deployment, Vercel leaves `$SHOP_ORIGIN_SECRET` as a literal string and the service answers 403.

The forms used (`routes` with `src`/`dest`/`transforms`/`env`, the header-caching entry) match Vercel's docs as of 2026-08 (routing/rewrites, "Restricting your origin to Vercel traffic"; project-configuration/vercel-json, "routes").

## Rotating the secret

1. Generate a new value (for example `openssl rand -hex 32`).
2. Change it on Fly and in Vercel (`SHOP_ORIGIN_SECRET`, Production and Preview) together.
3. Redeploy the site so the new value is picked up.

Shop calls get 403 between the Fly change and the finished redeploy. (Vercel's docs describe a no-gap rotation if the origin accepts both old and new values; the service accepts one.)

## Not verified until a preview deployment

- (a) Query strings are forwarded (the API uses `/session?id=...` and `/job/<id>`).
- (b) The new route runs before the SPA rewrite.
- (c) Responses are not cached.
- (d) The secret header reaches the origin, and a visitor-supplied `x-origin-secret` is replaced.
- (e) The login cookie (`Path=/api/shop`, `HttpOnly`, `Secure`) set by the API reaches the browser through the proxy.
- (f) A slow request (about 35 s) is not cut off.

## Preview checks

Do these in a browser signed in to Vercel (Deployment Protection is on):

1. Open `<preview-url>/api/shop/auth/session`. Expect JSON containing `"authenticated": false`. This shows the route, the secret header and the origin all work.
2. Open `<preview-url>/api/shop/session?id=x`. Expect a JSON 404 or 401 from the service, not the site's HTML page. This shows query strings and routing.
3. Open `<preview-url>/`. Expect the normal site.

A 403 on check 1 means the secret didn't match (or `SHOP_ORIGIN_SECRET` isn't set for Preview). Checks (c) and (e) need response headers: look at them in the browser's network panel on check 1 (no `x-vercel-cache: HIT`; any `Set-Cookie` the API sends).

POSTs from a preview hostname are refused by the service's Origin check (only the production origin is allowed), so login, (e) for a real cookie, and (f) can only be tested on production.
