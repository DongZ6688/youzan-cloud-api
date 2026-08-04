# Calling Youzan Cloud APIs

## Endpoint model

The public gateway pattern is:

```text
https://open.youzanyun.com/api/{api-name}/{version}
```

The bundled caller adds `access_token` without printing the resulting URL. Use only the method, version, request parameters, and content type documented on the selected official page.

## Request formats

- `json` (default): `POST` with `application/json`.
- `form`: `POST` with `application/x-www-form-urlencoded`.
- `query`: parameters in the query string, normally with `GET` unless overridden.

Examples:

```bash
node scripts/youzan-api.mjs call --api youzan.item.get --version 3.0.0 --params '{"item_id":123}'
node scripts/youzan-api.mjs call --api youzan.trade.get --version 4.0.2 --params @request.json --format json
node scripts/youzan-api.mjs call --api youzan.shop.configs.get --version 1.0.0 --params @request.json --dry-run
```

## Error envelopes

Check all of these before reading business data:

- Non-2xx HTTP status.
- `gw_err_resp` gateway error.
- `error_response` API error.
- `success: false` with `code` or `message`.
- A missing expected response object or page.

Do not convert any of them to an empty list. A report must stop or explicitly mark itself incomplete.

## Pagination

1. Start at the documented first page.
2. Use the documented maximum page size, not an assumed value.
3. Stop when the page is empty, smaller than page size, or reaches the returned total.
4. Set a maximum-page guard and fail loudly if reached.
5. If the API caps accessible rows, split by a stable time field and avoid overlapping windows.
6. De-duplicate by a stable business key such as order ID, item ID plus SKU ID, or record ID.

## Reliability

- Retry `429` and `5xx` with bounded exponential backoff and honor `Retry-After` when present.
- Do not retry schema, permission, validation, or application-capability errors blindly.
- For order-detail fan-out, use small bounded concurrency, preserve failed IDs, and report coverage.
- Record the API name, version, time window, page count, success count, failure count, and data-calculation definition without recording credentials or personal data.

## Data protection

Order, customer, address, mobile, open ID, and commission data may be sensitive. Write local response files with restrictive permissions, keep them out of Git, minimize retained fields, and redact samples before sharing. Do not upload raw production responses with the skill.
