import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const children = [
  spawn(process.execPath, ["--watch", "src/main.ts"], {
    cwd: resolve(root, "apps/server"),
    stdio: "inherit",
    env: { ...process.env, PEERWEAVE_MODE: "development", PEERWEAVE_HOST: "127.0.0.1" },
  }),
  spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js")], {
    cwd: resolve(root, "apps/web"),
    stdio: "inherit",
  }),
];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
};
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stop();
  });
  child.on("exit", (code) => {
    if (!stopping && code) process.exitCode = code;
    stop();
  });
}
