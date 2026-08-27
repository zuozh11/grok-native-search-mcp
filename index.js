#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EnvHttpProxyAgent } from "undici";
import { z } from "zod";

const server = new McpServer({
  name: "grok-native-search",
  version: "1.0.2",
}, {
  instructions:
    "Routing and depth: start with one focused search. Stop when the question is answered and " +
    "supported by an authoritative first-party source. Deepen only if evidence is incomplete or " +
    "conflicting; do not run overlapping searches. Use web_fetch for known URLs and page-text " +
    "verification, before Browser, curl, or shell unless interaction or visual inspection is " +
    "required. Use x_search for X content and web_search for other discovery.",
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
          max_turns: 2,
          instructions:
            "Search incrementally. Start with the most authoritative first-party source. Stop " +
            "as soon as the question is answered and directly supported. Broaden only when " +
            "evidence is missing or conflicting. Avoid redundant or overlapping searches.",
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
    "public web. Start with one focused query and stop after an authoritative source answers it; " +
    "deepen only for missing or conflicting evidence. For X-only content use x_search. After " +
    "finding a page whose contents must be verified, call web_fetch with its exact URL. Returns " +
    "the raw xAI Responses API body.",
);

registerSearchTool(
  "x_search",
  "Use this for current X posts, accounts, threads, replies, and trends. Prefer it over " +
    "web_search for X content. Start with one focused query and stop when the requested official " +
    "post or account result is found; deepen only if evidence is missing or conflicting. If a " +
    "post links to an external page that must be read, call web_fetch with that URL. Returns the " +
    "raw xAI Responses API body.",
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
