# API clients (Bearer JWT)

The app sets an **httpOnly cookie** after `POST /api/auth/login` and `POST /api/auth/register` for browsers. Programmatic clients (scripts, mobile apps) can read the **`token`** field from the JSON body and send:

```http
Authorization: Bearer <token>
```

If both a cookie and a Bearer token are present, the **cookie takes precedence** (see `loadUser` in `server/src/middleware/auth.js`).

## Login and call an API

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}'
```

Copy `token` from the response, then:

```bash
curl -s http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Accept: application/json"
```

## Logout

`POST /api/auth/logout` clears the **cookie**. Bearer-only clients should **delete the JWT locally**; the server does not maintain a revoke list for access tokens.

## Optional fields

Login and register responses may include **`expires_in`** (seconds until JWT expiry), derived from the JWT payload.

## Google-only accounts

Password login returns `401` with `hint: "use_google_oauth"` when the account has no password (Google sign-in only).

## Password reset (API)

- `POST /api/auth/forgot-password` JSON `{ "email": "…" }` — always returns `{ ok: true }` (anti-enumeration).
- `POST /api/auth/reset-password` JSON `{ "token": "…", "password": "…" }` — sets a new password when the token is valid.

HTML equivalents: `GET/POST /forgot-password`, `GET/POST /reset-password?token=…` (forms require `_csrf`).

## Email verification

After registration, the API sends a verification email when SMTP is configured. Confirm with:

`GET /auth/verify-email?token=…`

## Profile (authenticated)

- `PATCH /api/auth/me` — JSON `{ "name": "…" }`.
- `POST /api/auth/change-password` — `{ "currentPassword", "newPassword" }` (local password accounts only). Response includes a fresh `token`.
- `POST /api/auth/change-email` — `{ "newEmail", "password" }`; sends a new verification email to the new address.

## Google sign-in (browser)

`GET /auth/google` starts the OAuth redirect. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and optionally `GOOGLE_OAUTH_REDIRECT_URI` (see `server/.env.example`).

## Playwright / E2E helpers

When `NODE_ENV=test` and `E2E_CAPTURE_MAIL=1`, the server exposes `GET /__e2e/last-mail-links` (optional `?reset=1` to clear captured URLs). Playwright’s `webServer` block in `playwright.config.js` sets these env vars when it boots the app. If Playwright **reuses** an already running server that does not have those flags, password-reset and verify-email tests that rely on capture are skipped.
