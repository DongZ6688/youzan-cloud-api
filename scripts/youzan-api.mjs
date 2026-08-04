#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const API_ROOT = "https://open.youzanyun.com/api";
const TOKEN_URL = "https://open.youzanyun.com/auth/token";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_REFRESH_SKEW_MS = 24 * 60 * 60 * 1000;
const SELF_PATH = fileURLToPath(import.meta.url);

class YouzanError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "YouzanError";
    this.code = options.code ?? null;
    this.tokenInvalid = Boolean(options.tokenInvalid);
    this.retryable = Boolean(options.retryable);
    this.status = options.status ?? null;
  }
}

function parseArgs(argv) {
  const result = { _: [] };
  const booleans = new Set(["dry-run", "no-refresh", "help"]);
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      result._.push(current);
      continue;
    }
    const key = current.slice(2);
    if (booleans.has(key)) {
      result[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new YouzanError(`缺少参数值：--${key}`);
    }
    result[key] = value;
    index += 1;
  }
  return result;
}

function showHelp() {
  console.log(`用法:
  node scripts/youzan-api.mjs status [--config /external/credentials.json]
  node scripts/youzan-api.mjs refresh [--config /external/credentials.json]
  node scripts/youzan-api.mjs call --api youzan.trade.get --version 4.0.2 --params '{"tid":"..."}'

call 选项:
  --api NAME          官方 API 名称，不含版本
  --version X.Y.Z     官方版本
  --params JSON|@FILE|-
  --method POST|GET   默认 POST
  --format json|form|query
  --out FILE          以 0600 权限写入脱敏响应
  --dry-run           不联网，仅检查请求形状
  --no-refresh        禁止主动或失败后刷新
  --config FILE       外部凭证文件

环境变量:
  YOUZAN_ACCESS_TOKEN, YOUZAN_REFRESH_TOKEN, YOUZAN_CLIENT_ID,
  YOUZAN_CLIENT_SECRET, YOUZAN_ACCESS_TOKEN_EXPIRES_AT, YOUZAN_TOKEN_STORE`);
}

function defaultStorePath() {
  return path.join(os.homedir(), ".config", "youzan-cloud-api", "credentials.json");
}

function selectedStorePath(args) {
  return path.resolve(args.config || process.env.YOUZAN_TOKEN_STORE || defaultStorePath());
}

async function readStore(storePath) {
  try {
    const text = await fs.readFile(storePath, "utf8");
    return { exists: true, value: JSON.parse(text.replace(/^\uFEFF/, "")) };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, value: {} };
    if (error instanceof SyntaxError) {
      throw new YouzanError(`凭证文件不是有效 JSON：${storePath}`);
    }
    throw error;
  }
}

function firstSet(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value) !== "");
}

async function loadCredentials(args) {
  const storePath = selectedStorePath(args);
  const store = await readStore(storePath);
  const source = store.value || {};
  return {
    storePath,
    storeExists: store.exists,
    source,
    clientId: firstSet(process.env.YOUZAN_CLIENT_ID, source.clientId, source.client_id),
    clientSecret: firstSet(process.env.YOUZAN_CLIENT_SECRET, source.clientSecret, source.client_secret),
    accessToken: firstSet(process.env.YOUZAN_ACCESS_TOKEN, source.accessToken, source.access_token),
    refreshToken: firstSet(process.env.YOUZAN_REFRESH_TOKEN, source.refreshToken, source.refresh_token),
    accessTokenExpiresAt: firstSet(
      process.env.YOUZAN_ACCESS_TOKEN_EXPIRES_AT,
      source.accessTokenExpiresAt,
      source.access_token_expires_at
    )
  };
}

function credentialPresence(credentials) {
  return {
    clientId: Boolean(credentials.clientId),
    clientSecret: Boolean(credentials.clientSecret),
    accessToken: Boolean(credentials.accessToken),
    refreshToken: Boolean(credentials.refreshToken)
  };
}

function redactObject(value) {
  if (Array.isArray(value)) return value.map(redactObject);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (/token|secret|authorization|password|private.?key|webhook/i.test(key)) {
      result[key] = "[redacted]";
    } else {
      result[key] = redactObject(child);
    }
  }
  return result;
}

function redactText(value, credentials = {}) {
  let text = String(value ?? "");
  for (const secret of [
    credentials.accessToken,
    credentials.refreshToken,
    credentials.clientSecret,
    credentials.clientId
  ]) {
    if (secret && String(secret).length >= 6) text = text.split(String(secret)).join("[redacted]");
  }
  return text
    .replace(/(authorization\s*[:=]\s*)(?:Bearer\s+)?[^\s,}"']+/gi, "$1[redacted]")
    .replace(/((?:access|refresh)[_-]?token|client[_-]?secret|webhook)(\s*[:=]\s*)[^\s,}"']+/gi, "$1$2[redacted]")
    .replace(/Bearer\s+[^\s,}"']+/gi, "Bearer [redacted]");
}

function normalizeExpiry(value, now = Date.now()) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric >= 1e12) return Math.trunc(numeric);
  if (numeric >= 1e9) return Math.trunc(numeric * 1000);
  return Math.trunc(now + numeric * 1000);
}

function refreshAvailable(credentials) {
  return Boolean(credentials.clientId && credentials.clientSecret && credentials.refreshToken);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 30_000);
  return Math.min(500 * 2 ** attempt, 8_000);
}

async function fetchWithTimeout(url, init, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new YouzanError(`请求超时（${timeoutMs}ms）`, { retryable: true });
    throw new YouzanError(`网络请求失败：${error.message}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(url, init, credentials, options = {}) {
  const retries = Number(options.retries ?? process.env.YOUZAN_HTTP_RETRIES ?? DEFAULT_RETRIES);
  const timeoutMs = Number(options.timeoutMs ?? process.env.YOUZAN_HTTP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new YouzanError(
          `接口返回非 JSON：HTTP ${response.status} ${redactText(text.slice(0, 300), credentials)}`,
          { status: response.status, retryable: response.status >= 500 }
        );
      }
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      return { response, data };
    } catch (error) {
      lastError = error;
      if (!error.retryable || attempt >= retries) throw error;
      await sleep(Math.min(500 * 2 ** attempt, 8_000));
    }
  }
  throw lastError;
}

function apiFailure(response, data) {
  const envelope = data?.gw_err_resp || data?.error_response || (data?.success === false ? data : null);
  if (response.ok && !envelope) return null;
  const code = envelope?.err_code ?? envelope?.code ?? data?.code ?? response.status;
  const message = envelope?.err_msg ?? envelope?.msg ?? envelope?.message ?? data?.message ?? `HTTP ${response.status}`;
  const combined = `${code} ${message}`;
  return new YouzanError(`有赞接口失败 ${code}：${message}`, {
    code,
    status: response.status,
    tokenInvalid: String(code) === "4203" || /token.*(不存在|无效|失效|过期)|invalid.*token|expired.*token/i.test(combined),
    retryable: response.status === 429 || response.status >= 500
  });
}

async function persistCredentials(credentials, refreshed) {
  if (!credentials.storeExists) return false;
  const expiresAt = normalizeExpiry(
    refreshed.expires_at ?? refreshed.expires ?? refreshed.expires_in ?? refreshed.expire_time
  );
  const next = {
    ...credentials.source,
    clientId: credentials.source.clientId ?? credentials.clientId ?? "",
    clientSecret: credentials.source.clientSecret ?? credentials.clientSecret ?? "",
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || credentials.refreshToken,
    accessTokenExpiresAt: expiresAt,
    updatedAt: new Date().toISOString()
  };
  delete next.access_token;
  delete next.refresh_token;
  delete next.client_id;
  delete next.client_secret;
  const directory = path.dirname(credentials.storePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${credentials.storePath}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(temporary, 0o600);
  await fs.rename(temporary, credentials.storePath);
  await fs.chmod(credentials.storePath, 0o600);
  return true;
}

async function refreshCredentials(credentials) {
  if (!refreshAvailable(credentials)) {
    throw new YouzanError("缺少 clientId、clientSecret 或 refreshToken，不能自动刷新。请在本地外部凭证文件中补齐，或人工轮换 access token。");
  }
  const payload = {
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    authorize_type: "refresh_token",
    refresh_token: credentials.refreshToken
  };
  const { response, data } = await requestJson(
    TOKEN_URL,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
    credentials,
    { retries: 0 }
  );
  if (!response.ok || !data?.access_token) {
    const safe = redactObject(data || {});
    const code = data?.code ?? data?.err_code ?? response.status;
    const message = data?.message ?? data?.msg ?? data?.err_msg ?? JSON.stringify(safe);
    if (String(code) === "4005" || /参数错误|未开通|无权限|能力/i.test(String(message))) {
      throw new YouzanError(
        `当前应用可能未开放外部 Token 刷新能力（${code}）。请停止重试，在有赞控制台/调试工具人工获取新 Token，并在本地更新外部凭证文件。`
      );
    }
    throw new YouzanError(`有赞 Token 刷新失败 ${code}：${message}`);
  }
  const persisted = await persistCredentials(credentials, data);
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || credentials.refreshToken,
    accessTokenExpiresAt: normalizeExpiry(data.expires_at ?? data.expires ?? data.expires_in ?? data.expire_time),
    storeExists: persisted || credentials.storeExists
  };
}

function validateApiSpec(api, version) {
  if (!api || !/^[a-z0-9][a-z0-9._-]+$/i.test(api)) throw new YouzanError("--api 格式无效");
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new YouzanError("--version 必须为 X.Y.Z");
}

function buildApiUrl(api, version, accessToken = "") {
  validateApiSpec(api, version);
  const url = new URL(`${API_ROOT}/${api}/${version}`);
  if (accessToken) url.searchParams.set("access_token", accessToken);
  return url;
}

function appendParams(searchParams, params) {
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") searchParams.set(key, JSON.stringify(value));
    else searchParams.set(key, String(value));
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readParams(source) {
  if (!source) return {};
  let text = source;
  if (source === "-") text = await readStdin();
  else if (source.startsWith("@")) text = await fs.readFile(path.resolve(source.slice(1)), "utf8");
  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("not object");
    return parsed;
  } catch {
    throw new YouzanError("--params 必须是 JSON 对象、@JSON文件或 -");
  }
}

async function callOnce(spec, credentials) {
  if (!credentials.accessToken) throw new YouzanError("未配置 access token");
  const url = buildApiUrl(spec.api, spec.version, credentials.accessToken);
  const method = String(spec.method || "POST").toUpperCase();
  const format = spec.format || "json";
  const init = { method, headers: {} };
  if (format === "query") {
    appendParams(url.searchParams, spec.params);
  } else if (format === "form") {
    init.headers["content-type"] = "application/x-www-form-urlencoded; charset=utf-8";
    const form = new URLSearchParams();
    appendParams(form, spec.params);
    init.body = form;
  } else if (format === "json") {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(spec.params || {});
  } else {
    throw new YouzanError("--format 仅支持 json、form、query");
  }
  const { response, data } = await requestJson(url, init, credentials);
  const failure = apiFailure(response, data);
  if (failure) throw failure;
  return data;
}

async function writePrivateJson(outputPath, value) {
  const absolute = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(redactObject(value), null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(absolute, 0o600);
  return absolute;
}

async function commandStatus(args) {
  const credentials = await loadCredentials(args);
  const expiresAt = normalizeExpiry(credentials.accessTokenExpiresAt);
  console.log(JSON.stringify({
    tokenStore: credentials.storePath,
    tokenStoreExists: credentials.storeExists,
    credentials: credentialPresence(credentials),
    refreshSupportedByConfiguration: refreshAvailable(credentials),
    accessTokenExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    accessTokenExpired: expiresAt ? expiresAt <= Date.now() : null
  }, null, 2));
}

async function commandRefresh(args) {
  const credentials = await loadCredentials(args);
  const refreshed = await refreshCredentials(credentials);
  console.log(JSON.stringify({
    refreshed: true,
    persisted: credentials.storeExists,
    tokenStore: credentials.storePath,
    accessTokenExpiresAt: refreshed.accessTokenExpiresAt ? new Date(refreshed.accessTokenExpiresAt).toISOString() : null
  }, null, 2));
}

async function commandCall(args) {
  const spec = {
    api: args.api,
    version: args.version,
    params: await readParams(args.params),
    method: args.method || "POST",
    format: args.format || "json"
  };
  validateApiSpec(spec.api, spec.version);
  if (args["dry-run"]) {
    console.log(JSON.stringify({
      endpoint: `${API_ROOT}/${spec.api}/${spec.version}`,
      method: spec.method.toUpperCase(),
      format: spec.format,
      params: redactObject(spec.params),
      credentialSent: false
    }, null, 2));
    return;
  }
  let credentials = await loadCredentials(args);
  const noRefresh = Boolean(args["no-refresh"]);
  const expiresAt = normalizeExpiry(credentials.accessTokenExpiresAt);
  const skew = Number(process.env.YOUZAN_REFRESH_SKEW_SECONDS || DEFAULT_REFRESH_SKEW_MS / 1000) * 1000;
  if (!noRefresh && refreshAvailable(credentials) && (!credentials.accessToken || (expiresAt && expiresAt <= Date.now() + skew))) {
    credentials = await refreshCredentials(credentials);
  }
  let data;
  try {
    data = await callOnce(spec, credentials);
  } catch (error) {
    if (!noRefresh && error.tokenInvalid && refreshAvailable(credentials)) {
      credentials = await refreshCredentials(credentials);
      data = await callOnce(spec, credentials);
    } else {
      throw error;
    }
  }
  if (args.out) {
    const output = await writePrivateJson(args.out, data);
    console.log(JSON.stringify({ saved: true, output, mode: "0600", sensitiveFieldsRedacted: true }, null, 2));
  } else {
    console.log(JSON.stringify(redactObject(data), null, 2));
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command || command === "help" || args.help) {
    showHelp();
    return;
  }
  if (command === "status") await commandStatus(args);
  else if (command === "refresh") await commandRefresh(args);
  else if (command === "call") await commandCall(args);
  else throw new YouzanError(`未知命令：${command}`);
}

export {
  YouzanError,
  apiFailure,
  buildApiUrl,
  credentialPresence,
  normalizeExpiry,
  redactObject,
  redactText,
  validateApiSpec
};

if (path.resolve(process.argv[1] || "") === path.resolve(SELF_PATH)) {
  main().catch((error) => {
    console.error(redactText(error.message || error));
    process.exitCode = 1;
  });
}
