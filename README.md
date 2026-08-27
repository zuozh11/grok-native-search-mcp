# Grok Native Search MCP

一个极简的 stdio MCP Server，提供两个只读工具：

- `web_search(query)`：Grok 原生 Web Search 与 X Search
- `web_fetch(url)`：Jina Reader 网页转 Markdown

搜索固定使用 `grok-4.6`、`reasoning.effort: low` 和 `max_turns: 1`。搜索答案解决问题后立即回答。

`web_search` 返回紧凑 JSON，只保留最终答案、实际引用、模型、token 用量与 Web/X 搜索调用统计；
`web_fetch` 继续原样返回 Jina Reader Markdown。

使用 `web_search` 联网获取实时信息；使用 `web_fetch` 读取具体 URL 的正文。搜索答案解决问题后
立即回答。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `XAI_API_KEY` | xAI 或兼容网关的 API Key |
| `XAI_BASE_URL` | 可选，Responses API 基础地址；默认使用 `https://aiapiv2.kamipon.com:442/v1` |
| `JINA_API_KEY` | Jina Reader API Key |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | 可选，仅供 Jina Reader 请求使用的环境代理配置 |

## 使用 npx 启动

```bash
npx -y grok-native-search-mcp@latest
```

## Codex 配置

```toml
[mcp_servers.grok_native_search]
command = "npx"
args = ["-y", "grok-native-search-mcp@latest"]
env_vars = ["XAI_API_KEY", "JINA_API_KEY", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"]
```

配置后重启 Codex。

## 本地开发

```bash
npm install
npm test
```
