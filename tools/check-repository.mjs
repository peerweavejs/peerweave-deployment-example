import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      [
        "node_modules",
        "dist",
        ".gyral",
        ".git",
        ".artifacts",
        "coverage",
        "private",
        "tls",
      ].includes(entry.name)
    )
      return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
const files = walk(root);
const errors = [];
for (const path of files) {
  if (path.includes("/apps/web/") && /\.ts$/.test(path)) {
    for (const [, specifier] of readFileSync(path, "utf8").matchAll(
      /(?:from\s+|import\s*\(?\s*)["']([^"']+)["']/g,
    )) {
      if (
        specifier.startsWith(".") &&
        !resolve(dirname(path), specifier).startsWith(`${join(root, "apps/web")}/`)
      )
        errors.push(
          `${path}: browser source must stay inside its app or use installed package exports`,
        );
      if (
        specifier.startsWith("@peerweave/") &&
        !/^@peerweave\/(peer|media|call|signaling-websocket)$/.test(specifier)
      )
        errors.push(`${path}: use a declared Peerweave package export`);
    }
  }
  if (path.endsWith(".md")) {
    for (const [, target] of readFileSync(path, "utf8").matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:|^#/i.test(target)) continue;
      if (!existsSync(resolve(dirname(path), target.split("#")[0])))
        errors.push(`${path}: broken local link ${target}`);
    }
  }
  if (/\.(ts|mjs)$/.test(path) && !path.endsWith("vendor-peerweave.mjs")) {
    const source = readFileSync(path, "utf8");
    if (
      /from\s+["'][^"']*peerweave\/packages\//.test(source) ||
      /["']\/packages\/[^"']+\/src\//.test(source)
    )
      errors.push(`${path}: import installed Peerweave exports instead of framework sources`);
    if (/alias\s*:|"paths"\s*:/.test(source) && path.includes("apps/web/"))
      errors.push(`${path}: web config must resolve real installed packages`);
  }
}
assert.ok(
  readFileSync(join(root, "AGENTS.md"), "utf8").split("\n").length <= 100,
  "AGENTS.md must remain a short map",
);
for (const path of files.filter((file) => /compose[^/]*\.yaml$/.test(file))) {
  assert.doesNotMatch(
    readFileSync(path, "utf8"),
    /^\s+build:/m,
    `${path}: Compose deploys images only`,
  );
}
const provenance = JSON.parse(readFileSync(join(root, "vendor/peerweave/manifest.json"), "utf8"));
const webManifest = JSON.parse(readFileSync(join(root, "apps/web/package.json"), "utf8"));
const webTypes = JSON.parse(readFileSync(join(root, "apps/web/tsconfig.json"), "utf8"));
assert.equal(
  Object.keys(webTypes.compilerOptions.paths ?? {}).length,
  0,
  "Web typing must use installed package declarations",
);
for (const entry of provenance.packages) {
  assert.equal(
    webManifest.dependencies[entry.name],
    entry.version,
    `Web dependency/provenance version mismatch: ${entry.name}`,
  );
  assert.ok(
    readFileSync(join(root, "pnpm-workspace.yaml"), "utf8").includes(
      `'${entry.name}': file:vendor/peerweave/${entry.archive}`,
    ),
    `Missing vendored override: ${entry.name}`,
  );
  const bytes = readFileSync(join(root, "vendor/peerweave", entry.archive));
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    entry.sha256,
    `Vendor checksum mismatch: ${entry.archive}`,
  );
}
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  `Repository checks passed: ${provenance.packages.length} package artifacts, image-only Compose, local docs and consumer boundaries`,
);
