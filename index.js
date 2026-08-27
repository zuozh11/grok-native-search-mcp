#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EnvHttpProxyAgent } from "undici";
import { z } from "zod";

const server = new McpServer({
  name: "grok-native-search",
  version: "1.0.6",
}, {
  instructions:
    "Use web_search to access the internet for real-time information. Use " +
    "web_fetch to read a specific HTTP(S) URL.",
});

const jinaProxyAgent = new EnvHttpProxyAgent();

function compactSearchResponse(payload) {
  const toolCalls = payload.usage?.server_side_tool_usage_details ?? {};
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
    usage: {
      input_tokens: payload.usage?.input_tokens,
      output_tokens: payload.usage?.output_tokens,
      total_tokens: payload.usage?.total_tokens,
      tool_calls: {
        web_search_calls: toolCalls.web_search_calls ?? 0,
        x_search_calls: toolCalls.x_search_calls ?? 0,
      },
    },
  };
}

server.registerTool(
  "web_search",
  {
    description:
      "Use this tool for real-time information. Returns compact JSON containing the answer, " +
      "cited URLs, model, token usage, and Web/X search-call counts.",
    inputSchema: {
      query: z.string().min(1).describe("The question to search"),
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
        tool_choice: "required",
        instructions:
          "Return a concise answer with citations as soon as the search result resolves the question.",
        input: query,
        tools: [{ type: "web_search" }, { type: "x_search" }],
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

server.registerTool(
  "web_fetch",
  {
    description:
      "Use this tool to read, quote, summarize, or verify the page text of a specific HTTP(S) URL. " +
      "Returns raw Markdown from Jina Reader.",
    inputSchema: {
      url: z.url().describe(
        "Exact HTTP(S) URL to read; pass source URLs from web_search unchanged",
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
