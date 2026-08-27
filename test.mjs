import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "grok-native-search-test", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["index.js"],
  cwd: import.meta.dirname,
});

await client.connect(transport);

const tools = await client.listTools();
assert.deepEqual(
  tools.tools.map((tool) => tool.name),
  ["web_search", "x_search", "web_fetch"],
);
assert.match(client.getInstructions(), /complementary discovery queries may run in parallel/i);
assert.match(client.getInstructions(), /avoid exact duplicates/i);
assert.match(
  tools.tools.find((tool) => tool.name === "web_fetch").description,
  /Prefer it over Browser, curl, or shell/,
);
assert.match(
  tools.tools.find((tool) => tool.name === "x_search").description,
  /Prefer it over web_search for X content/,
);

await client.close();
