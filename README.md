# Grok Native Search MCP

一个极简的 stdio MCP Server，提供三个只读工具：

- `web_search(query)`：Grok 原生 Web Search
- `x_search(query)`：Grok 原生 X Search
- `web_fetch(url)`：Jina Reader 网页转 Markdown

搜索固定使用 `grok-4.6`、`reasoning.effort: low` 和 `max_turns: 1`。单轮内允许互补搜索并行执行，
找到足够的一手证据后停止，需要澄清或协调证据时扩大范围。

`web_search` 和 `x_search` 返回紧凑 JSON，只保留最终答案、实际引用、模型、状态、token 用量与
底层工具调用统计；`web_fetch` 继续原样返回 Jina Reader Markdown。

所有网页研究使用本 MCP：全网信息和来源发现使用 `web_search`；X 帖子、账号、线程和趋势使用
`x_search`；已知 URL 和搜索得到的来源使用 `web_fetch`。互补查询并行执行，随后读取权威一手
来源；一手证据解决问题后立即回答，需要澄清或协调证据时继续深入。

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
