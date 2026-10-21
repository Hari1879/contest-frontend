# Reveal & Win — Mobile Purchase Contest PWA (Frontend)

Angular 22 PWA that implements the *Mobile Purchase Contest PWA — Technical Specification*.

```
Landing  →  Entry form (+ T&C modal)  →  IMEI confirmation  →  Rewards API
                                                              ├─ won → Reveal result → Receipt
                                                              ├─ business outcome → Status screen
                                                              └─ rejection / network / 5xx → inline recovery
```

## Run

Requires Node **22.22.3+ or 24.15+**.

```bash
npm install
npm start            # http://localhost:4200 — uses the in-browser MOCK Rewards API
npm test             # unit tests (Vitest)
npm run build        # production build + service worker → dist/contest-pwa/browser
npx http-server dist/contest-pwa/browser -p 8080   # to test install / offline shell
```

Append `?store=CHN-042` to any URL to attach an outlet ID to the entry (spec Open Question 7).

## Testing every outcome (dev mock)

`src/app/core/interceptors/mock-rewards.interceptor.ts` simulates the provider. Use any
valid IMEI (e.g. `490154203237518`, `356938035643809`) and these phone numbers:

| Phone        | Outcome                              |
|--------------|--------------------------------------|
| 9000000001   | `campaign_closed`                    |
| 9000000002   | HTTP 500 → "Something went wrong"    |
| 9000000003   | Hangs → timeout, then one same-key retry → network error |
| 9000000004   | `model_not_eligible`                  |
| 9000000005   | Always wins ₹8,000                   |
| 9000000006   | Always `not_won`                     |
| 9000000007   | `duplicate`                           |
| 9000000008   | `rejected`                            |
| anything else| Random tier (₹500 / ₹1,000 / ₹2,000 / ₹8,000 / no win) |

Use `9000000007` to exercise the duplicate response without storing used IMEIs in the browser.

## Project map

```
src/app
├── core
│   ├── config/        campaign.config.ts (models, tiers, API URL)  ·  terms.ts (versioned T&C)
│   ├── models/        API request/response + normalised EntryOutcome union
│   ├── validators/    IMEI (15 digits + Luhn), name, email, Indian mobile
│   ├── services/      contest-api (HTTP + error mapping) · entry-state (BehaviorSubject flow state)
│   │                  analytics (funnel → window.dataLayer) · network-status
│   ├── interceptors/  mock Rewards API (dev only)
│   └── guards/        route guards for each step
├── features
│   ├── landing/       contest intro, qualifying models, resume banner
│   ├── entry-form/    reactive form, IMEI mask, T&C <dialog>
│   ├── scratch/       lazy-loaded result reveal + payout page
│   ├── confirmation/  win receipt (masked IMEI, amount, reference ID)
│   └── status/        not-won, duplicate, eligibility, and campaign screens
└── shared/            IMEI input directive, ₹ pipe
```

## How the spec is covered

| Spec | Implementation |
|---|---|
| §3 Fields & validation | Reactive Forms + custom validators; inline errors on blur and on submit; focus moves to first invalid field |
| §3 IMEI entry aid | `appImeiInput` shows `AA BBBBBB CCCCCC D` grouping, model stores raw digits, 0/15 counter |
| §4 IMEI uniqueness | Client does format + Luhn only; duplicate is always decided by the API and shown as its own screen |
| §5 T&C | Unchecked by default, submit disabled until checked, modal text, `termsAccepted` + `termsAcceptedAt` + `termsVersion` in payload |
| §6 Result reveal | Customer taps "Reveal my result"; prize is already decided by API and the result can only be revealed once |
| §7 Error cases | Every response/HTTP error normalised to one `EntryOutcome`; timeout retries reuse the same `Idempotency-Key`; double-submit blocked |
| §8 PWA | `@angular/pwa` service worker caches app shell only — **no** API caching or background sync; submit disabled offline |
| §8 Routing | Guards: no scratch without a submission, no receipt before reveal |
| §9 Security | No PII in storage. The masked result and short-lived claim URL/payment state go to `sessionStorage` so the payment return can be verified; cleared on "Done" |
| §9 Performance | Only landing is eager; scratch/form/receipt are lazy chunks. ~86 KB gzipped initial |
| §9 Accessibility | Labels, `aria-invalid`/`aria-describedby`, live-region announcements, "Reveal my result" button, reduced-motion support |
| §9 Analytics | `landing_viewed → form_started → form_submitted → entry_outcome → scratch_revealed → confirmation_viewed`, no PII |

## Before go-live (spec §10 open items)

1. **Claim/webhook integration** — winning entry responses must include `claimUrl` with the backend-issued token in `/contest/claims/:token`. The app polls `GET /api/contest/claims/:token` every 2 seconds for up to 60 seconds while waiting for `status: "link_ready"` and a `payoutUrl`. The customer opens that URL with the **Claim** button in a new tab; while awaiting payment, the page polls every 5 seconds for up to 10 minutes and checks again on tab focus/visibility. The endpoint should return `status` (`pending`, `link_ready`, `processing`, `paid`, `failed`, or `expired`), `amount`, optional `payoutUrl`/`expiresAt`, and `canRequestNewLink`. If expired and allowed, the frontend calls `POST /api/contest/claims/:token/new-link`. The backend must report `paid` only after verifying Razorpay's signed webhook. Webhook verification and persistence belong in the API backend.
2. **Proxy** — if the provider needs a secret, point `rewardsApiBaseUrl` at a same-origin backend proxy. Never add keys to `environment.ts`.
3. Set `useMockApi: false` everywhere except dev (already `false` in production).
4. Replace placeholders: qualifying models & retailer name (`campaign.config.ts`), legal T&C text (`terms.ts`), icons in `public/icons`, colours in `src/styles.scss` `:root`.
5. Confirm the final contest date range with the campaign owner.
