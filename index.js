#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EnvHttpProxyAgent } from "undici";
import { z } from "zod";

const server = new McpServer({
  name: "grok-native-search",
  version: "1.0.1",
});

const jinaProxyAgent = new EnvHttpProxyAgent();

function registerSearchTool(name, description) {
  server.registerTool(
    name,
    {
      description,
      inputSchema: {
        query: z.string().min(1).describe("搜索问题"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ query }) => {
      const baseUrl = process.env.XAI_BASE_URL ?? "https://aiapiv2.kamipon.com:442/v1";
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-4.6",
          reasoning: { effort: "low" },
          input: query,
          tools: [{ type: name }],
        }),
      });

      const body = await response.text();
      return {
        content: [{ type: "text", text: body }],
        isError: !response.ok,
      };
    },
  );
}

registerSearchTool(
  "web_search",
  "使用 Grok 原生 Web Search 搜索，并原样返回 xAI Responses API 响应",
);

registerSearchTool(
  "x_search",
  "使用 Grok 原生 X Search 搜索，并原样返回 xAI Responses API 响应",
);

server.registerTool(
  "web_fetch",
  {
    description: "使用 Jina Reader 读取网页，并原样返回 Markdown",
    inputSchema: {
      url: z.url().describe("要读取的网页 URL"),
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async ({ url }) => {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      dispatcher: jinaProxyAgent,
      headers: {
        Authorization: `Bearer ${process.env.JINA_API_KEY}`,
      },
    });

    const body = await response.text();
    return {
      content: [{ type: "text", text: body }],
      isError: !response.ok,
    };
  },
);

await server.connect(new StdioServerTransport());
