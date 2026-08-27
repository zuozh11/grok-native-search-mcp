import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let upstreamRequest;
const upstream = createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    upstreamRequest = JSON.parse(body);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      model: "grok-4.6-build",
      status: "completed",
      citations: ["https://unused.example"],
      output: [
        { type: "reasoning", encrypted_content: "must-not-leak" },
        {
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              answer: "Official answer.",
              citations: [{ url: "https://source.example", should_fetch: false }],
            }),
            annotations: [{ type: "url_citation", url: "https://source.example" }],
          }],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        server_side_tool_usage_details: {
          web_search_calls: 1,
          x_search_calls: 0,
          code_interpreter_calls: 0,
          file_search_calls: 0,
          mcp_calls: 0,
          document_search_calls: 0,
          image_generation_calls: 0,
        },
      },
    }));
  });
});
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const upstreamAddress = upstream.address();

const client = new Client({ name: "grok-native-search-test", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["index.js"],
  cwd: import.meta.dirname,
  env: {
    PATH: process.env.PATH,
    XAI_API_KEY: "test-key",
    XAI_BASE_URL: `http://127.0.0.1:${upstreamAddress.port}`,
  },
});

await client.connect(transport);

const tools = await client.listTools();
assert.deepEqual(
  tools.tools.map((tool) => tool.name),
  ["web_search", "web_fetch"],
);
assert.match(client.getInstructions(), /use web_search once with the user's complete question/i);
assert.match(client.getInstructions(), /answer from its complete result/i);
assert.doesNotMatch(client.getInstructions(), /Expand/i);
assert.equal(tools.tools.some((tool) => /Expand/i.test(tool.description)), false);
assert.doesNotMatch(client.getInstructions(), /parallel|complementary/i);
assert.equal(tools.tools.some((tool) => /parallel|complementary/i.test(tool.description)), false);
assert.match(
  tools.tools.find((tool) => tool.name === "web_fetch").description,
  /specific HTTP\(S\) URL the user asks to read/i,
);
assert.match(
  tools.tools.find((tool) => tool.name === "web_search").description,
  /complete real-time research question/,
);

const result = await client.callTool({
  name: "web_search",
  arguments: { query: "test query" },
});
const compact = JSON.parse(result.content[0].text);
assert.deepEqual(compact, {
  answer: "Official answer.",
  citations: [{ url: "https://source.example", should_fetch: false }],
  model: "grok-4.6-build",
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    total_tokens: 15,
    tool_calls: { web_search_calls: 1, x_search_calls: 0 },
  },
});
assert.equal(result.content[0].text.includes("must-not-leak"), false);
assert.equal(upstreamRequest.max_turns, 1);
assert.equal(upstreamRequest.parallel_tool_calls, true);
assert.equal(upstreamRequest.tool_choice, "required");
assert.equal(upstreamRequest.text.format.type, "json_schema");
assert.deepEqual(
  upstreamRequest.text.format.schema.properties.citations.items.required,
  ["url", "should_fetch"],
);
assert.match(
  upstreamRequest.instructions,
  /Available source categories include Chinese-language communities, English-language communities, official sources, and general public websites/i,
);
assert.match(
  upstreamRequest.instructions,
  /Select the categories relevant to the query/i,
);
assert.match(upstreamRequest.instructions, /Set should_fetch to true when its page text is required/i);
assert.match(upstreamRequest.instructions, /Set should_fetch to false when the search result supports the answer/i);
assert.doesNotMatch(upstreamRequest.instructions, /parallel|all categories/i);
assert.deepEqual(upstreamRequest.tools, [{ type: "web_search" }, { type: "x_search" }]);

await client.close();
await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
