#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EnvHttpProxyAgent } from "undici";
import { z } from "zod";

const server = new McpServer({
  name: "grok-native-search",
  version: "1.0.1",
}, {
  instructions:
    "Routing: use web_fetch whenever an exact URL is known or page text must be verified. " +
    "Prefer it over Browser, curl, and shell unless it fails or the task requires login, " +
    "clicks, forms, visual inspection, or browser state. Use x_search for X posts, accounts, " +
    "threads, replies, and trends. Use web_search for other discovery. After search returns a " +
    "relevant external URL, use web_fetch to read it.",
});

const jinaProxyAgent = new EnvHttpProxyAgent();

function registerSearchTool(name, description) {
  server.registerTool(
    name,
    {
      description,
      inputSchema: {
        query: z.string().min(1).describe("The question or search query to investigate"),
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
  "Use this when no exact URL is known and current information must be discovered across the " +
    "public web. For X-only content use x_search. After finding a page whose contents must be " +
    "verified, call web_fetch with its exact URL. Returns the raw xAI Responses API body.",
);

registerSearchTool(
  "x_search",
  "Use this for current X posts, accounts, threads, replies, and trends. Prefer it over " +
    "web_search for X content. If a post links to an external page that must be read, call " +
    "web_fetch with that URL. Returns the raw xAI Responses API body.",
);

server.registerTool(
  "web_fetch",
  {
    description:
      "Use this when an exact HTTP(S) URL is known, including URLs returned by web_search or " +
      "x_search, and the task is to read, quote, summarize, or verify page text. Prefer it over " +
      "Browser, curl, or shell when no login, click, form interaction, or visual inspection is " +
      "required. Do not use it to discover URLs. Returns raw Markdown from Jina Reader.",
    inputSchema: {
      url: z.url().describe(
        "Exact HTTP(S) URL to read; pass source URLs from web_search or x_search unchanged",
      ),
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
