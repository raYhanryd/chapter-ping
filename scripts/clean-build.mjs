// The Cloudflare Vite plugin emits dist/<worker>/.dev.vars so `wrangler dev` can
// read local secrets from the build output. That file must never ship, so drop it
// after every build and fail loudly if it survives.
import { existsSync, readFileSync, rmSync } from "node:fs";

const target = "dist/chapter_tracker_web/.dev.vars";
rmSync(target, { force: true });

if (existsSync(target)) {
  console.error(`build cleanup failed: ${target} is still present`);
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

console.log(`build cleanup: removed ${target}, verified ${headers}`);
