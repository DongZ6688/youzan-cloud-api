#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const EXCLUDED_DIRECTORIES = new Set([".git", "node_modules", "logs", "tmp", "output"]);
const RULES = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["github-token", /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ["webhook-url", /https:\/\/[^\s"']+\/(?:webhook|hook)\/(?!example)[A-Za-z0-9_-]{12,}/i],
  ["long-hex-secret", /\b[a-f0-9]{40,}\b/i]
];
const ASSIGNMENT = /(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|app[_-]?secret|authorization|password)\s*["']?\s*[:=]\s*["']([^"'\s,}]+)["']/i;

async function collect(directory, output = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute, output);
    else if (entry.isFile() && absolute !== SCRIPT_PATH) output.push(absolute);
  }
  return output;
}

function placeholder(value) {
  return !value || /^(?:your_|example|placeholder|redacted|changeme|\.\.\.|<.*>|\[.*\])$/i.test(value);
}

async function scanFile(file) {
  const stat = await fs.stat(file);
  if (stat.size > 2_000_000) return [];
  const buffer = await fs.readFile(file);
  if (buffer.includes(0)) return [];
  const lines = buffer.toString("utf8").split(/\r?\n/);
  const findings = [];
  lines.forEach((line, index) => {
    for (const [rule, pattern] of RULES) {
      if (pattern.test(line)) findings.push({ file, line: index + 1, rule });
    }
    const assignment = line.match(ASSIGNMENT);
    if (assignment && !placeholder(assignment[1])) findings.push({ file, line: index + 1, rule: "assigned-secret" });
  });
  return findings;
}

const files = await collect(ROOT);
const findings = (await Promise.all(files.map(scanFile))).flat();
if (findings.length) {
  console.error(`发现 ${findings.length} 个疑似秘密；未显示匹配内容：`);
  for (const finding of findings) {
    console.error(`${path.relative(ROOT, finding.file)}:${finding.line} ${finding.rule}`);
  }
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ clean: true, filesScanned: files.length, root: ROOT }, null, 2));
}
