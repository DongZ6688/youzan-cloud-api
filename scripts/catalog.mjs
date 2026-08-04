#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_URL = "https://doc.youzanyun.com/v2/doc/cloud/token/RsS0wO4sWiOHTpk6KJCczq2xnic";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const JSON_PATH = path.join(SKILL_DIR, "references", "api-catalog.json");
const MARKDOWN_PATH = path.join(SKILL_DIR, "references", "api-catalog.md");

function extractBalancedObject(source, marker) {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error(`官方页面缺少 ${marker}`);
  const start = source.indexOf("{", markerAt + marker.length);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error("官方目录 JSON 未闭合");
}

function flatten(nodes, ancestors = [], output = []) {
  for (const node of nodes || []) {
    const trail = [...ancestors, node.name].filter(Boolean);
    if (node.refId && trail.includes("API")) {
      const apiAt = trail.lastIndexOf("API");
      output.push({
        domain: trail.slice(1, apiAt).join(" / ") || "未分类",
        name: String(node.name || "").trim(),
        docToken: node.token,
        docUrl: `https://doc.youzanyun.com/v2/doc/cloud/token/${node.token}`,
        updatedAt: node.updatedAt ? new Date(node.updatedAt).toISOString() : null
      });
    }
    flatten(node.sonCategoryS, trail, output);
  }
  return output;
}

function classify(name) {
  const write = /创建|新增|添加|导入|同步|上传|发布|更新|修改|编辑|设置|绑定|解绑|删除|移除|打标|调整|上下架|发货|核销|审核|确认|取消|关闭|退款|支付|充值|赠送|开卡|入库|出库|调拨|推送|发送|启用|禁用/.test(name);
  const read = /查询|获取|搜索|列表|详情|统计|解密|校验|预览|分页|检查|下载/.test(name);
  return write && read ? "读写" : write ? "写入/操作" : read ? "读取" : "待确认";
}

async function updateCatalog() {
  const response = await fetch(ROOT_URL, { headers: { "user-agent": "youzan-cloud-api-skill/1.0" } });
  if (!response.ok) throw new Error(`官方目录请求失败：HTTP ${response.status}`);
  const html = await response.text();
  const globalData = JSON.parse(extractBalancedObject(html, "window._global ="));
  const sideMenu = globalData?.menuInfo?.sideMenu;
  const tree = globalData?.detailData?.categoryS
    || globalData?.categoryS
    || globalData?.docData?.categoryS
    || globalData?.menuInfo?.categoryS
    || (Array.isArray(sideMenu) ? sideMenu : sideMenu?.categoryS || sideMenu?.sonCategoryS);
  if (!tree) throw new Error("官方页面结构已变化，未找到 API 目录树");
  const apis = flatten(tree).map((api) => ({ ...api, direction: classify(api.name) }));
  apis.sort((left, right) => left.domain.localeCompare(right.domain, "zh-CN") || left.name.localeCompare(right.name, "zh-CN"));
  const counts = apis.reduce((result, api) => {
    result[api.direction] = (result[api.direction] || 0) + 1;
    return result;
  }, {});
  const generatedAt = new Date().toISOString();
  await fs.writeFile(JSON_PATH, `${JSON.stringify({ source: ROOT_URL, generatedAt, total: apis.length, counts, apis }, null, 2)}\n`);

  const domains = new Map();
  for (const api of apis) {
    if (!domains.has(api.domain)) domains.set(api.domain, []);
    domains.get(api.domain).push(api);
  }
  const lines = [
    "# Youzan Cloud public API catalog",
    "",
    `- Official source: ${ROOT_URL}`,
    `- Generated at: ${generatedAt}`,
    `- Interfaces: ${apis.length}`,
    "",
    "> Names and documentation links come from the official public menu. Confirm method, version, schema, permissions, billing, and availability on each current page.",
    ""
  ];
  for (const [domain, items] of domains) {
    lines.push(`## ${domain}`, "");
    for (const api of items) lines.push(`- [${api.name}](${api.docUrl}) — ${api.direction}`);
    lines.push("");
  }
  await fs.writeFile(MARKDOWN_PATH, `${lines.join("\n")}\n`);
  console.log(JSON.stringify({ updated: true, total: apis.length, domains: domains.size, counts, json: JSON_PATH, markdown: MARKDOWN_PATH }, null, 2));
}

async function loadCatalog() {
  return JSON.parse(await fs.readFile(JSON_PATH, "utf8"));
}

async function searchCatalog(query) {
  if (!query) throw new Error("search 需要关键词");
  const catalog = await loadCatalog();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = catalog.apis.filter((api) => {
    const haystack = `${api.domain} ${api.name} ${api.direction}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  console.log(JSON.stringify({ query, total: matches.length, matches: matches.slice(0, 100) }, null, 2));
}

async function main() {
  const command = process.argv[2] || "stats";
  if (command === "update") await updateCatalog();
  else if (command === "search") await searchCatalog(process.argv.slice(3).join(" "));
  else if (command === "stats") {
    const catalog = await loadCatalog();
    console.log(JSON.stringify({ generatedAt: catalog.generatedAt, total: catalog.total, counts: catalog.counts }, null, 2));
  } else {
    throw new Error("用法：node scripts/catalog.mjs update|search <关键词>|stats");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
