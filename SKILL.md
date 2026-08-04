---
name: youzan-cloud-api
description: Securely discover and call Youzan Cloud Open APIs with a complete refreshable official API catalog, generic API/version invocation, pagination and retry guidance, sanitized diagnostics, and application-dependent access-token refresh. Use when Codex needs to integrate, inspect, automate, troubleshoot, or document Youzan Cloud APIs for orders, goods, promotions, salesmen, commissions, shops, customers, or other Youzan domains without exposing credentials.
---

# Youzan Cloud API

Use the bundled catalog and scripts to work with Youzan Cloud without placing credentials in chat, source files, logs, or Git.

## Non-negotiable safety

1. Never ask the user to paste an access token, refresh token, client secret, webhook, or private key into chat.
2. Never print, echo, diff, commit, or attach credential values. Report only whether each credential is set.
3. Load credentials from environment variables or an external mode-`0600` token store. Never create a real credential file inside this skill or another repository.
4. Before committing or uploading, run `node scripts/scan-secrets.mjs` from the skill root and stop on any finding.
5. Treat APIs that create, update, delete, refund, pay, issue, send, bind, or change status as mutating. Obtain explicit user approval before a live call, show the intended target and parameters with secrets removed, and avoid broad or production-wide tests.
6. Do not interpret an API error as an empty business result. Stop downstream reports or writes when authentication, pagination, or detail retrieval is incomplete.

## Choose the workflow

- Find an interface: update or search the bundled catalog.
- Call an interface: use the generic caller with the documented API name, version, and parameters.
- Diagnose authentication: inspect token status, then refresh only if the application type supports it.
- Build an order, goods, promotion, salesman, commission, or synchronization job: read the relevant references before coding.
- Summarize prior project knowledge: use the sanitized lessons, never the original credentials or identifiers.

## Find any interface

Refresh the official catalog before work when internet access is available:

```bash
node scripts/catalog.mjs update
node scripts/catalog.mjs search '订单'
node scripts/catalog.mjs search '限时折扣'
```

The catalog packages every interface exposed by the public Youzan Cloud server-side documentation menu at generation time. It stores names and official documentation links, not private API entitlements. Read the selected official page to confirm the exact API method, version, request schema, availability, billing, shop type, and permission bundle before calling it.

## Configure credentials outside the repository

Prefer environment variables for short-lived work:

```bash
export YOUZAN_ACCESS_TOKEN='...'
export YOUZAN_REFRESH_TOKEN='...'
export YOUZAN_CLIENT_ID='...'
export YOUZAN_CLIENT_SECRET='...'
```

For scheduled refresh, copy `assets/credentials.example.json` to an external path such as `~/.config/youzan-cloud-api/credentials.json`, fill it locally, set file mode `0600`, and optionally set `YOUZAN_TOKEN_STORE` to that path. Do not copy the completed file back into the skill.

Check configuration without revealing values:

```bash
node scripts/youzan-api.mjs status
```

Read [authentication.md](references/authentication.md) before implementing refresh. Refresh support depends on application type and granted capabilities; a debug tool being able to issue a token does not prove that an external server may refresh it.

## Call an API

Use the API name and version shown on the official documentation page:

```bash
node scripts/youzan-api.mjs call \
  --api youzan.trades.sold.get \
  --version 4.0.4 \
  --params '{"page_no":1,"page_size":20}'
```

Pass larger parameters from a file to reduce shell quoting mistakes:

```bash
node scripts/youzan-api.mjs call \
  --api youzan.trade.get \
  --version 4.0.2 \
  --params @request.json \
  --out response.private.json
```

The caller restricts requests to the official gateway, retries transient failures, refreshes once on a recognized invalid-token response when supported, redacts credential values from diagnostics, and writes output files with restrictive permissions. Use `--dry-run` to validate the endpoint and request shape without sending it.

Read [calling-apis.md](references/calling-apis.md) for pagination, error envelopes, personal-data handling, and request formats.

## Handle token refresh

Run an explicit refresh only after confirming support:

```bash
node scripts/youzan-api.mjs refresh
```

If refresh returns an application-capability error such as `4005` or a persistent parameter error, do not loop, invent alternate OAuth endpoints, or expose credentials for debugging. Use the Youzan console/debug tool to obtain a new token, update the external store locally, and keep the manual rotation path documented and monitored.

## Apply the proven business patterns

For reusable aggregation and synchronization algorithms, read [workflows.md](references/workflows.md). For prior project conclusions and failure modes, read [history-lessons.md](references/history-lessons.md). These references are deliberately sanitized.

Key defaults:

- Orders: page through the list, fetch detail only when required fields are absent, cap concurrency, retry detail failures, and record incomplete coverage.
- Amounts: state whether the metric is paid amount, real payment, net of refund, or an allocated line-item amount.
- Goods: treat SKU as the stable row unit when price, stock, cost, or promotions vary by specification.
- Promotions: calculate only the explicitly requested active promotion stack; do not silently add member prices or coupons.
- Commission: distinguish profit-ratio, transaction-price-ratio, and fixed-amount rules; never guess missing enum meanings.
- Synchronization: upsert by a stable key, checkpoint progress, and never clear the destination because an upstream call failed.

## Validate the skill

From the skill root:

```bash
node scripts/self-test.mjs
node scripts/scan-secrets.mjs
python3 /path/to/skill-creator/scripts/quick_validate.py .
```
