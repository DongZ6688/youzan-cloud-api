#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  apiFailure,
  buildApiUrl,
  credentialPresence,
  normalizeExpiry,
  redactObject,
  redactText,
  validateApiSpec
} from "./youzan-api.mjs";

const now = 1_700_000_000_000;
assert.equal(normalizeExpiry(3600, now), now + 3_600_000);
assert.equal(normalizeExpiry(1_700_000_000, now), 1_700_000_000_000);
assert.equal(normalizeExpiry(1_700_000_000_000, now), 1_700_000_000_000);
assert.equal(normalizeExpiry(null, now), null);

validateApiSpec("youzan.trade.get", "4.0.2");
assert.throws(() => validateApiSpec("https://evil.example/x", "4.0.2"));
assert.throws(() => validateApiSpec("youzan.trade.get", "4"));

const url = buildApiUrl("youzan.trade.get", "4.0.2", "test-secret-token");
assert.equal(url.origin, "https://open.youzanyun.com");
assert.equal(url.pathname, "/api/youzan.trade.get/4.0.2");
assert.equal(url.searchParams.get("access_token"), "test-secret-token");

assert.deepEqual(credentialPresence({ accessToken: "<set>", refreshToken: "", clientId: "<set>", clientSecret: "<set>" }), {
  clientId: true,
  clientSecret: true,
  accessToken: true,
  refreshToken: false
});

assert.deepEqual(redactObject({ access_token: "[redacted]", nested: { value: 3, webhook: "[redacted]" } }), {
  access_token: "[redacted]",
  nested: { value: 3, webhook: "[redacted]" }
});
assert.equal(redactText("Authorization: Bearer abcdefgh"), "Authorization: [redacted]");

const invalid = apiFailure({ ok: true, status: 200 }, { gw_err_resp: { err_code: 4203, err_msg: "Token 不存在" } });
assert.equal(invalid.tokenInvalid, true);
assert.equal(apiFailure({ ok: true, status: 200 }, { response: { ok: true } }), null);

console.log(JSON.stringify({ passed: true, tests: 15 }, null, 2));
