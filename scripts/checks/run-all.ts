import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const suites = readdirSync(here)
  .filter((f) => f.endsWith(".check.ts"))
  .sort();

const failed: string[] = [];
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const run = spawnSync("npx", ["tsx", path.join(here, suite)], {
    stdio: "inherit",
  });
  if (run.status !== 0) failed.push(suite);
}

console.log(
  `\n${suites.length - failed.length}/${suites.length} suites passed`,
);
if (failed.length) {
  console.log(`Failed: ${failed.join(", ")}`);
  process.exit(1);
}
