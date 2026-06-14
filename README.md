# GayTrix — Telegram Mini App (Frontend)

React + TypeScript frontend for the GayTrix LGBTQ+ social platform, built as a Telegram Mini App.

## Stack

- React 18 + TypeScript
- Vite (with HTTPS dev server via `vite-plugin-mkcert` — required for Telegram Mini Apps)
- React Router (in-app navigation)
- Zustand (session state)
- Axios (API client)
- Lucide icons, CSS Modules

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

The dev server runs over HTTPS on port 5173. To test inside Telegram, use a tunnel (e.g. `ngrok http 5173`) and register the resulting HTTPS URL as your bot's Mini App URL via `@BotFather` → `/setmenubutton` or `/newapp`.

## Mock mode

By default `VITE_USE_MOCKS=true`, so the app runs fully standalone with realistic mock data — useful for design review without a backend. Set `VITE_USE_MOCKS=false` and configure `VITE_API_BASE_URL` to connect to the live backend.

## Structure

```
src/
  api/         API client + service layer (mock/live toggle)
  components/  Shared UI: Avatar, Badge, Chip, Button, TabBar, PageHeader, ProfileCard
  context/      Zustand session store
  hooks/        useTelegram — Telegram WebApp SDK bridge
  mock/         Mock data for dev/design preview
  pages/        Route-level pages
  styles/       Design tokens (tokens.css)
  types/        Shared TypeScript types
```

## Pages

- **Onboarding** — multi-step profile setup (photos, basics, looking-for, bio)
- **Discover** — nearby feed + Explore rails (Trending, New, Verified, Recent)
- **Filters** — advanced discovery filters
- **Profile Detail** (`/u/:id`) — view another user's profile
- **Map** — interactive community hotspot map with categories, upvote/report, add-location flow
- **Chat** — conversation list (message requests separated) + individual chat thread
- **Profile** — own profile, with links to Edit Profile, Verification, Premium, Privacy, Notifications, Help, and Admin (super admins only)

## Authentication

`useTelegram` reads `window.Telegram.WebApp.initData` and attaches it to every API request via the `X-Telegram-Init-Data` header. **The backend must verify this string's HMAC signature against the bot token before trusting any identity claims from it** — never trust `initDataUnsafe` directly for auth decisions.

## Telegram Stars (Premium)

The Premium page is wired for Telegram Stars payments:

1. Frontend calls `POST /premium/create-invoice` with the selected plan.
2. Backend calls Bot API `createInvoiceLink` with `currency: "XTR"`.
3. Frontend calls `Telegram.WebApp.openInvoice(url, callback)`.
4. On payment, Telegram sends a `successful_payment` update to the bot; the backend verifies and upgrades the user's membership server-side (never trust client-side state alone).

## Design system

See `src/styles/tokens.css` for the full palette, type scale, and the "presence ring" avatar system (`Avatar.tsx`) — the app's signature visual element, encoding online/verified/premium status via gradient rings.

## Production build

```bash
npm run build
```

Outputs to `dist/`. Serve behind Nginx/CDN with HTTPS (mandatory for Telegram Mini Apps).
