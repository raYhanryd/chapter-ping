// The Cloudflare Vite plugin emits dist/<worker>/.dev.vars so `wrangler dev` can
// read local secrets from the build output. That file must never ship. The
// directory follows the worker name, so check every output directory.
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";

const outputs = existsSync("dist")
  ? readdirSync("dist", { withFileTypes: true }).filter((entry) => entry.isDirectory())
  : [];

let removed = 0;
for (const output of outputs) {
  const target = `dist/${output.name}/.dev.vars`;
  if (existsSync(target)) {
    rmSync(target, { force: true });
    removed += 1;
  }
}

const leaked = outputs.filter((output) => existsSync(`dist/${output.name}/.dev.vars`));
if (leaked.length > 0) {
  console.error(`build cleanup failed: .dev.vars is still present in ${leaked.map((o) => o.name).join(", ")}`);
  process.exit(1);
}

// vite.config.ts generates this from src/shared/security-headers.ts. Assets are
// served before the Worker, so a missing file silently drops every security
// header on the documents.
const headers = "dist/client/_headers";
if (!existsSync(headers)) {
  console.error(`build check failed: ${headers} was not generated`);
  process.exit(1);
}
if (!readFileSync(headers, "utf8").includes("Content-Security-Policy:")) {
  console.error(`build check failed: ${headers} has no Content-Security-Policy`);
  process.exit(1);
}

console.log(`build cleanup: removed ${removed} .dev.vars, verified ${headers}`);
