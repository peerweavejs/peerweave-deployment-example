import { loadConfiguration } from "./config.ts";
import { createSignalingServer } from "./server.ts";

const options = await loadConfiguration(process.env);
const server = await createSignalingServer(options);
console.log(
  JSON.stringify({
    event: "server_started",
    mode: options.development ? "development" : "production",
    port: server.port,
  }),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close().then(() => {
      process.exitCode = 0;
    });
  });
