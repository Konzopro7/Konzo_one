import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(projectRoot, "server", "src");

function collectTests(directory) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const fullPath = join(directory, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        return collectTests(fullPath);
      }
      return entry.endsWith(".test.js") ? [fullPath] : [];
    });
}

const testFiles = collectTests(sourceRoot);

if (testFiles.length === 0) {
  console.log("No server tests found.");
  process.exit(0);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit"
});

process.exit(result.status ?? 1);
