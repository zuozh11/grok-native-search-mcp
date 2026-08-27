#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EnvHttpProxyAgent } from "undici";
import { z } from "zod";

const server = new McpServer({
  name: "grok-native-search",
  version: "1.0.8",
}, {
  instructions:
    "Use web_search once with the user's complete question to access the internet for real-time " +
    "information, then answer from its complete result. Use web_fetch for a specific HTTP(S) URL " +
    "the user asks to read.",
});

const jinaProxyAgent = new EnvHttpProxyAgent();

async function fetchPage(url) {
  const response = await fetch(`https://r.jina.ai/${url}`, {
    dispatcher: jinaProxyAgent,
    headers: {
      Authorization: `Bearer ${process.env.JINA_API_KEY}`,
    },
  });
  return {
    text: await response.text(),
    isError: !response.ok,
  };
}

function compactSearchResponse(payload) {
  const toolCalls = payload.usage?.server_side_tool_usage_details ?? {};
  const outputText = (payload.output ?? [])
    .flatMap((item) => (item.type === "message" ? item.content ?? [] : []))
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n")
    .replace(/<\|eos\|>\s*$/, "");
  const result = JSON.parse(outputText);

  return {
    answer: result.answer,
    citations: result.citations,
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
      "Use this tool once with the user's complete real-time research question. It searches " +
      "relevant sources, reads citations selected by Grok, and returns a complete answer, citation " +
      "URLs, should_fetch decisions, selected page content, model, token usage, and Web/X " +
      "search-call counts.",
    inputSchema: {
      query: z.string().min(1).describe("The user's complete research question"),
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
        parallel_tool_calls: true,
        tool_choice: "required",
        instructions:
          "Available source categories include Chinese-language communities, English-language " +
          "communities, official sources, and general public websites. Select the categories " +
          "relevant to the query. Return a concise answer. For every cited URL, set should_fetch " +
          "to true when its page text is required to complete the answer. Set should_fetch to " +
          "false when the search result supports the answer.",
        input: query,
        tools: [{ type: "web_search" }, { type: "x_search" }],
        text: {
          format: {
            type: "json_schema",
            name: "search_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
                citations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                      should_fetch: { type: "boolean" },
                    },
                    required: ["url", "should_fetch"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["answer", "citations"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      return {
        content: [{ type: "text", text: body }],
        isError: true,
      };
    }

    const result = compactSearchResponse(JSON.parse(body));
    result.citations = await Promise.all(result.citations.map(async (citation) => {
      if (!citation.should_fetch) return citation;
      const page = await fetchPage(citation.url);
      return { ...citation, content: page.text };
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError: false,
    };
  },
);

server.registerTool(
  "web_fetch",
  {
    description:
      "Use this tool for a specific HTTP(S) URL the user asks to read, quote, summarize, or " +
      "inspect. Returns raw Markdown from Jina Reader.",
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
    const page = await fetchPage(url);
    return {
      content: [{ type: "text", text: page.text }],
      isError: page.isError,
    };
  },
);

await server.connect(new StdioServerTransport());
