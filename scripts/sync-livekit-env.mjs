import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const configPath = path.join(process.env.HOME || "/Users/iris", ".livekit", "cli-config.yaml");
const envPath = path.join(root, ".env.local");

if (!existsSync(configPath)) {
  throw new Error(`LiveKit CLI config not found at ${configPath}. Run lk cloud auth first.`);
}

const config = readFileSync(configPath, "utf8");
const defaultProject = matchValue(config, "default_project") || "cocoa-os";
const projectBlock =
  config
    .split(/\n\s*-\s+name:\s+/)
    .find((block) => block.startsWith(`${defaultProject}\n`) || block.startsWith(`${defaultProject}\r\n`)) ||
  config;

const livekitUrl = matchValue(projectBlock, "url");
const apiKey = matchValue(projectBlock, "api_key");
const apiSecret = matchValue(projectBlock, "api_secret");

if (!livekitUrl || !apiKey || !apiSecret) {
  throw new Error("Could not read LiveKit URL/API key/API secret from CLI config.");
}

const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const next = setEnvValues(existing, {
  PORT: process.env.PORT || "8791",
  LIVEKIT_URL: livekitUrl,
  LIVEKIT_API_KEY: apiKey,
  LIVEKIT_API_SECRET: apiSecret,
  LIVEKIT_PHONE_NUMBER: "+14159085000"
});

writeFileSync(envPath, next);
console.log(`Wrote LiveKit settings to ${envPath}`);

function matchValue(text, key) {
  return text.match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, "m"))?.[1]?.trim();
}

function setEnvValues(text, values) {
  const lines = text ? text.split(/\r?\n/) : [];
  const seen = new Set();
  const updated = lines.map((line) => {
    const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
    if (!key || !(key in values)) return line;
    seen.add(key);
    return `${key}=${values[key]}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) updated.push(`${key}=${value}`);
  }

  if (!updated.includes("AI_GATEWAY_BASE_URL=")) updated.push("AI_GATEWAY_BASE_URL=");
  if (!updated.includes("AI_GATEWAY_API_KEY=")) updated.push("AI_GATEWAY_API_KEY=");
  if (!updated.includes("AI_GATEWAY_MODEL=")) updated.push("AI_GATEWAY_MODEL=");

  return `${updated.filter(Boolean).join("\n")}\n`;
}
