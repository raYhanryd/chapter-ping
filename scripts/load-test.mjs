// Runs the deterministic local-D1 load test and prints its measured batch.
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["vitest", "run", "tests/worker/load.test.ts", "--reporter=verbose"], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
