import { readFile } from "node:fs/promises";
import { issueTurnCredentials } from "../apps/server/src/turn-credentials.mjs";

if (!process.env.TURN_AUTH_SECRET_FILE || !process.env.TURN_URLS || !process.argv[2]) {
  throw new Error(
    "Set TURN_AUTH_SECRET_FILE and comma-separated TURN_URLS; pass an opaque subject as the first argument. This is an operator tool, not a public credential endpoint.",
  );
}
const result = issueTurnCredentials({
  secret: (await readFile(process.env.TURN_AUTH_SECRET_FILE, "utf8")).trim(),
  subject: process.argv[2],
  urls: process.env.TURN_URLS.split(",").map((url) => url.trim()),
});
console.log(JSON.stringify(result, null, 2));
