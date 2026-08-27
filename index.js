#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EnvHttpProxyAgent } from "undici";
import { z } from "zod";

const server = new McpServer({
  name: "grok-native-search",
  version: "1.0.5",
}, {
  instructions:
    "For every web research task, use this MCP. Use web_search for public-web discovery, x_search " +
    "for X posts, accounts, and threads, and web_fetch for every known URL or source returned by " +
    "search. Run complementary discovery queries in parallel. Verify authoritative first-party " +
    "URLs with web_fetch, then answer. Conclude as soon as first-party evidence resolves the " +
    "question. Expand the investigation when evidence needs clarification or reconciliation.",
});

const jinaProxyAgent = new EnvHttpProxyAgent();

function compactSearchResponse(payload) {
  const outputText = (payload.output ?? [])
    .flatMap((item) => (item.type === "message" ? item.content ?? [] : []))
    .filter((item) => item.type === "output_text");
  const answer = outputText
    .map((item) => item.text)
    .join("\n")
    .replace(/<\|eos\|>\s*$/, "");
  const citedUrls = outputText.flatMap((item) =>
    (item.annotations ?? []).flatMap((annotation) => annotation.url ? [annotation.url] : []),
  );
  const citations = [...new Set(citedUrls.length ? citedUrls : payload.citations ?? [])];

  return {
    answer,
    citations,
    model: payload.model,
    status: payload.status,
    usage: {
      input_tokens: payload.usage?.input_tokens,
      output_tokens: payload.usage?.output_tokens,
      total_tokens: payload.usage?.total_tokens,
      tool_calls: payload.usage?.server_side_tool_usage_details,
    },
  };
}

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
          max_turns: 1,
          instructions:
            "Use a single tool-call turn and run complementary searches in parallel. Begin with " +
            "the most authoritative first-party source. Conclude as soon as direct evidence resolves " +
            "the question. Expand the scope when evidence needs clarification or reconciliation. " +
            "Keep every query distinct and purposeful.",
          input: query,
          tools: [{ type: name }],
        }),
      });

      const body = await response.text();
      const text = response.ok
        ? JSON.stringify(compactSearchResponse(JSON.parse(body)))
        : body;
      return {
        content: [{ type: "text", text }],
        isError: !response.ok,
      };
    },
  );
}

registerSearchTool(
  "web_search",
  "Use this tool to discover current public-web information and relevant URLs. Run complementary " +
    "queries in parallel, then verify authoritative first-party URLs with web_fetch. Answer as " +
    "soon as first-party evidence resolves the question. Expand with targeted queries when evidence " +
    "needs clarification or reconciliation. Returns compact JSON containing the answer, cited URLs, " +
    "model, status, token usage, and server-side tool-call counts.",
);

registerSearchTool(
  "x_search",
  "Use this tool for every task about current X posts, accounts, threads, replies, and trends. Run " +
    "complementary X queries in parallel. Verify linked external pages with web_fetch. Answer as " +
    "soon as the requested official post or account result is established. Expand with targeted " +
    "queries when evidence needs clarification or reconciliation. Returns compact JSON containing " +
    "the answer, cited URLs, model, status, token usage, and server-side tool-call counts.",
);

server.registerTool(
  "web_fetch",
  {
    description:
      "Use this tool for every known HTTP(S) URL, including sources returned by web_search or " +
      "x_search, to read, quote, summarize, or verify page text. After discovery, fetch authoritative " +
      "first-party URLs in parallel. Returns raw Markdown from Jina Reader.",
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
