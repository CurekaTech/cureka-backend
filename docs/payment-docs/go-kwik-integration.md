# Setup GoKwik Custom MCP Server

I need you to set up the `gokwik-custom-mcp-server` MCP server on my machine. Before doing anything, ask me for my API key. Do NOT proceed until I provide it.

**Prompt me with:** "Please provide your X-API-Key for the GoKwik MCP server."

Once I provide the key, store it as `USER_API_KEY` and proceed with the steps below.

## Server Details

- **Server name**: `gokwik-custom-mcp-server`
- **URL**: `https://api-gw-v4.dev.gokwik.io/sandbox/v1/checkout-mcp/mcp`
- **Header**: `X-API-Key:<USER_API_KEY>`
- **Bridge**: `mcp-remote` (npm package, required because native HTTP transport forces OAuth discovery — this server uses API key auth)

## Step 1 — Detect my environment

Run these diagnostic commands and report findings. Do NOT skip any.

```bash
# OS
uname -s

# Detect which Claude client configs exist
CLAUDE_CODE_CONFIG="$HOME/.claude.json"
CLAUDE_DESKTOP_CONFIG=""

# Check all possible Claude Desktop config locations
for path in "$HOME/Library/Application Support/Claude/claude_desktop_config.json" \
            "$APPDATA/Claude/claude_desktop_config.json" \
            "$HOME/.config/Claude/claude_desktop_config.json"; do
  [ -f "$path" ] && CLAUDE_DESKTOP_CONFIG="$path" && break
done

echo "=== Config files found ==="
[ -f "$CLAUDE_CODE_CONFIG" ] && echo "CLAUDE_CODE: $CLAUDE_CODE_CONFIG" || echo "CLAUDE_CODE: NOT FOUND"
[ -n "$CLAUDE_DESKTOP_CONFIG" ] && echo "CLAUDE_DESKTOP: $CLAUDE_DESKTOP_CONFIG" || echo "CLAUDE_DESKTOP: NOT FOUND"

# Node.js — check all possible sources
# nvm
ls -d "$HOME/.nvm/versions/node"/v*/bin/node 2>/dev/null | while read n; do echo "nvm: $($n -v 2>/dev/null) at $n"; done

# fnm
ls -d "$HOME/Library/Application Support/fnm/node-versions"/v*/installation/bin/node 2>/dev/null | while read n; do echo "fnm: $($n -v 2>/dev/null) at $n"; done
ls -d "$HOME/.local/share/fnm/node-versions"/v*/installation/bin/node 2>/dev/null | while read n; do echo "fnm: $($n -v 2>/dev/null) at $n"; done

# Homebrew / system
for p in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  [ -x "$p" ] && echo "system: $($p -v 2>/dev/null) at $p"
done

# Default node and npm
which node 2>/dev/null && node -v 2>/dev/null
which npm 2>/dev/null && npm -v 2>/dev/null

# Check if mcp-remote is already installed globally
npm list -g mcp-remote 2>/dev/null || echo "mcp-remote NOT installed globally"

# Show existing config content
echo "=== Claude Code config ==="
cat "$CLAUDE_CODE_CONFIG" 2>/dev/null || echo "NOT FOUND"

echo "=== Claude Desktop config ==="
[ -n "$CLAUDE_DESKTOP_CONFIG" ] && cat "$CLAUDE_DESKTOP_CONFIG" || echo "NOT FOUND"
```

## Step 2 — Evaluate and decide

Based on the diagnostic output:

1. **Pick the best Node.js version (>= 18).** Record its full bin path (e.g. `/Users/me/.nvm/versions/node/v22.16.0/bin`). If no Node >= 18 exists, STOP and give me clear instructions to install one.

2. **Check if npm works correctly under that Node.** The critical bug to watch for: if the user has nvm with an old default (e.g. v14), then even pointing `command` to a v22 npx can still spawn Node v14 for the child process. The fix is to use the full path to `node` binary directly (not `npx`) and set `env.PATH` in the config.

3. **Check if `mcp-remote` is installed under that Node version.** If not, install it:
   ```bash
   /full/path/to/npm install -g mcp-remote
   ```
   If npm itself fails (common when nvm versions are cross-contaminated), use:
   ```bash
   /full/path/to/node /full/path/to/lib/node_modules/npm/bin/npm-cli.js install -g mcp-remote
   ```

4. **Find the `mcp-remote` entry point.** Check these paths in order:
   - `<npm_global_root>/mcp-remote/dist/proxy.js`
   - `<npm_global_root>/mcp-remote/dist/cli.js`
   - `<npm_global_root>/mcp-remote/dist/index.js`
   - `<npm_global_root>/mcp-remote/bin/cli.js`
   - Fallback: read the `bin` field from `<npm_global_root>/mcp-remote/package.json`

## Step 3 — Write the config

**Update ALL config files that were found in Step 1.** If both Claude Code and Claude Desktop configs exist, add the server entry to both.

### The MCP server entry to add

```json
"gokwik-custom-mcp-server": {
    "command": "/full/path/to/node",
    "args": [
        "/full/path/to/mcp-remote/dist/proxy.js",
        "https://api-gw-v4.dev.gokwik.io/sandbox/v1/checkout-mcp/mcp",
        "--header",
        "X-API-Key:<USER_API_KEY>"
    ],
    "env": {
        "PATH": "/full/path/to/node/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
    }
}
```

Replace all `/full/path/to/` placeholders with actual paths from Step 2. Replace `<USER_API_KEY>` with the key I provided.

### If writing to Claude Code (`~/.claude.json`)

- Add the entry under the **root-level** `mcpServers` key. Create the key if it doesn't exist.
- Do NOT add it under `projects.*` — it must be at root level for global access.
- If a stale `gokwik-custom-mcp-server` entry exists under any `projects.*.mcpServers`, remove it to avoid conflicts.

### If writing to Claude Desktop (`claude_desktop_config.json`)

- Read the existing config. If it has other `mcpServers` entries, preserve them.
- Add the entry under `mcpServers`. Create the key if it doesn't exist.

### If neither config exists

- Create `~/.claude.json` with the server entry under a root-level `mcpServers` key.

**Critical rules:**
- NEVER use bare `npx` as the command — always use the full path to `node`
- ALWAYS set `env.PATH` to point to the correct Node bin directory first
- ALWAYS back up each config before writing: `cp config.json config.json.backup`
- NEVER overwrite existing `mcpServers` entries — merge only
- The URL MUST end with `/mcp` — without it the server returns 404
- The header format MUST be `X-API-Key:<value>` (no space after colon) — `mcp-remote` parses `--header` as `key:value`

## Step 4 — Verify

Run verification checks for **each** config file that was written.

```bash
# 1. Validate JSON syntax for all configs written
echo "=== Validating Claude Code config ==="
python3 -m json.tool "$HOME/.claude.json" > /dev/null 2>&1 && echo "JSON: valid" || echo "JSON: INVALID or NOT FOUND"

echo "=== Validating Claude Desktop config ==="
python3 -m json.tool "<CLAUDE_DESKTOP_CONFIG_PATH>" > /dev/null 2>&1 && echo "JSON: valid" || echo "JSON: INVALID or NOT FOUND"

# 2. Verify the node binary exists and is correct version
/full/path/to/node -v

# 3. Verify the mcp-remote entry point exists
ls -la /full/path/to/mcp-remote/dist/proxy.js

# 4. Test mcp-remote can start
/full/path/to/node /full/path/to/mcp-remote/dist/proxy.js --help 2>&1 | head -5

# 5. Test server connectivity
curl -s -o /dev/null -w "HTTP %{http_code}" -X POST \
  "https://api-gw-v4.dev.gokwik.io/sandbox/v1/checkout-mcp/mcp" \
  -H "X-API-Key: <USER_API_KEY>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'

# 6. Show the final configs
echo "=== Claude Code config ==="
python3 -c "import json; d=json.load(open('$HOME/.claude.json')); print(json.dumps(d.get('mcpServers',{}), indent=2))" 2>/dev/null || echo "NOT FOUND or PARSE ERROR"

echo "=== Claude Desktop config ==="
cat "<CLAUDE_DESKTOP_CONFIG_PATH>" 2>/dev/null || echo "NOT FOUND"
```

## Step 5 — Report

Give me a summary:
- ✅ or ❌ for each step
- The Node version and path used
- The mcp-remote entry point path used
- Which config files were updated (list all)
- The full config entries that were written
- **Next actions:**
  - If Claude Desktop was updated: "Fully quit and reopen Claude Desktop. The gokwik-custom-mcp-server will appear in your tools."
  - If Claude Code was updated: "Start a new Claude Code session and run `/mcp` to verify the server is connected."

If anything failed, explain exactly what went wrong and give me the fix — either commands to run or manual steps.

---

## Troubleshooting reference (for Claude)

| Error | Cause | Fix |
|---|---|---|
| `MCP error -32001: Invalid API key` | Wrong or expired API key | Get correct key from MCP server admin |
| `node:fs/promises does not provide export named 'constants'` | mcp-remote running under Node < 18 | Use full path to Node >= 18, set env.PATH |
| `npm is known not to run on Node.js v14` | npx resolved to wrong Node | Don't use npx. Use node + proxy.js directly |
| `SyntaxError: Unexpected token '&&='` | Node 14 running Node 18+ npm | Set env.PATH so correct Node comes first |
| Config written but server doesn't appear | Client not restarted | Restart Claude Desktop or start new Claude Code session |
| Server connects then disconnects | Wrong URL or auth header | Verify URL ends with `/mcp` and API key is valid |
| `HTTP 404: 404 Route Not Found` | URL missing `/mcp` suffix | URL must be `.../checkout-mcp/mcp` not `.../checkout-mcp` |
| `HTTP 404: Invalid OAuth error response` | Native HTTP transport trying OAuth | Use mcp-remote bridge instead of `"type": "http"` |
| `Auth: not authenticated` in `/mcp` | Native HTTP transport forces OAuth | Switch to mcp-remote stdio bridge |
| `Missing session ID` error | SSE transport vs Streamable HTTP server | Use mcp-remote which handles sessions automatically |
| Server under `projects.*` in claude.json | Scoped to wrong project | Move to root-level `mcpServers` |
| npm install fails with EACCES | Global npm dir permissions | Run with `--prefix ~/.npm-global` or fix permissions |
| No Node.js >= 18 found | Node missing or outdated | Install: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh \| bash && nvm install 22` |

