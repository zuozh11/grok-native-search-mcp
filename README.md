# Grok Native Search MCP

一个极简的 stdio MCP Server，提供三个只读工具：

- `web_search(query)`：Grok 原生 Web Search
- `x_search(query)`：Grok 原生 X Search
- `web_fetch(url)`：Jina Reader 网页转 Markdown

搜索固定使用 `grok-4.6` 和 `reasoning.effort: low`。工具响应不做解析或改写，直接作为 MCP 文本返回。

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
