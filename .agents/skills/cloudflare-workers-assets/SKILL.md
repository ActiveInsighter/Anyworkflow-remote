---
name: cloudflare-workers-assets
description: Configure, debug, or release AnyWorkflow Remote on Cloudflare Workers Static Assets through Wrangler and GitHub Actions.
---

# Cloudflare Workers Static Assets

Use this skill for `wrangler.jsonc`, deployment Actions, SPA routing, workers.dev, or custom-domain deployment.

## Project deployment contract

- Build output is `dist/`.
- Deploy with Wrangler 4 as Workers Static Assets.
- React Router fallback is configured through:
  `assets.not_found_handling = "single-page-application"`.
- Do not add a Pages-style catch-all `public/_redirects` rule; it conflicts with Workers SPA fallback and can be rejected as an infinite redirect.
- GitHub Actions secrets are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Main-branch deploys must typecheck and build before Wrangler deploys.

## Verification

Read the actual Actions job result. A successful Vite build is not a successful deployment. Confirm Wrangler reports a deployed Worker URL/version before reporting success.
