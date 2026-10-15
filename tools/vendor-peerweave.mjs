import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(process.argv[2] ?? join(root, "../peerweave"));
const destination = join(root, "vendor/peerweave");
const scratch = mkdtempSync(join(tmpdir(), "peerweave-artifacts-"));
const run = (args, cwd = source) =>
  execFileSync("pnpm", args, { cwd, stdio: "pipe", encoding: "utf8" });
try {
  run(["build:packages"]);
  const packages = [];
  for (const name of ["peer", "media", "call", "signaling-websocket"]) {
    const directory = join(source, "packages", name);
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    const output = join(scratch, name);
    mkdirSync(output);
    run(["pack", "--pack-destination", output], directory);
    const archive = readdirSync(output).find((file) => file.endsWith(".tgz"));
    if (!archive) throw new Error(`No archive generated for ${name}`);
    const bytes = readFileSync(join(output, archive));
    cpSync(join(output, archive), join(scratch, archive));
    packages.push({
      name: manifest.name,
      version: manifest.version,
      archive,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: source,
    encoding: "utf8",
  }).trim();
  const status = execFileSync("git", ["status", "--porcelain", "--", "packages"], {
    cwd: source,
    encoding: "utf8",
  }).trim();
  if (status)
    throw new Error(
      "Framework package sources are dirty; commit/review them before producing a provenance snapshot",
    );
  mkdirSync(destination, { recursive: true });
  for (const entry of packages)
    cpSync(join(scratch, entry.archive), join(destination, entry.archive));
  const webManifestPath = join(root, "apps/web/package.json");
  const webManifest = JSON.parse(readFileSync(webManifestPath, "utf8"));
  for (const entry of packages) webManifest.dependencies[entry.name] = entry.version;
  writeFileSync(webManifestPath, `${JSON.stringify(webManifest, null, 2)}\n`);
  const workspacePath = join(root, "pnpm-workspace.yaml");
  const workspace = readFileSync(workspacePath, "utf8").split("\noverrides:\n")[0];
  writeFileSync(
    workspacePath,
    `${workspace}\noverrides:\n${packages.map((entry) => `  '${entry.name}': file:vendor/peerweave/${entry.archive}`).join("\n")}\n`,
  );
  writeFileSync(
    join(destination, "manifest.json"),
    `${JSON.stringify({ source: "https://github.com/peerweavejs/peerweave", revision, packageSourcesClean: true, packages }, null, 2)}\n`,
  );
  run(["install", "--lockfile-only"], root);
  console.log(`Updated ${packages.length} private package artifacts from ${revision}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
