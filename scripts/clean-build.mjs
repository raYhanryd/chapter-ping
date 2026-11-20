// The Cloudflare Vite plugin emits dist/<worker>/.dev.vars so `wrangler dev` can
// read local secrets from the build output. That file must never ship, so drop it
// after every build and fail loudly if it survives.
import { existsSync, rmSync } from "node:fs";

const target = "dist/chapter_tracker_web/.dev.vars";
rmSync(target, { force: true });

if (existsSync(target)) {
  console.error(`build cleanup failed: ${target} is still present`);
  process.exit(1);
}

console.log(`build cleanup: removed ${target}`);
