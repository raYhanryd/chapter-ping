#!/usr/bin/env node
// Query Context7 docs without an API key.
//   node scripts/docs.mjs search "better-auth"
//   node scripts/docs.mjs get /better-auth/better-auth "discord provider"
import { argv, exit } from "node:process";

const BASE = "https://context7.com/api/v1";

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

async function search(query) {
  const data = await getJson(`${BASE}/search?query=${encodeURIComponent(query)}`);
  const results = Array.isArray(data.results) ? data.results : [];
  if (!results.length) {
    console.log("No libraries matched.");
    return;
  }
  for (const result of results.slice(0, 8)) {
    const stars = typeof result.stars === "number" ? `${result.stars} stars` : "no star count";
    console.log(`${result.id}\n  ${result.title} (${stars})\n  ${result.description ?? ""}\n`);
  }
}

async function docs(libraryId, topic) {
  const id = libraryId.replace(/^\/+/, "");
  const url = `${BASE}/${id}?type=txt${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`;
  const response = await fetch(url, { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  const text = await response.text();
  console.log(text.slice(0, 12000));
  if (text.length > 12000) console.log(`\n[truncated, ${text.length} characters total]`);
}

const [command, ...rest] = argv.slice(2);

try {
  if (command === "search" && rest[0]) {
    await search(rest.join(" "));
  } else if (command === "get" && rest[0]) {
    await docs(rest[0], rest.slice(1).join(" "));
  } else {
    console.log("Usage:\n  node scripts/docs.mjs search <library>\n  node scripts/docs.mjs get <library/id> [topic]");
    exit(1);
  }
} catch (error) {
  console.error(`docs: ${error instanceof Error ? error.message : String(error)}`);
  exit(1);
}
