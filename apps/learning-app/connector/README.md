# Connect Learning Grove to ChatGPT

The MCP server uses stdio. The Secure MCP Tunnel client launches it on the homelab. The connector calls the app at `http://127.0.0.1:8009` and never opens a listener or accesses SQLite. Tunnel access is controlled by the OpenAI organization and workspace association, so use a private tunnel associated only with your intended account or workspace.

## Run on the homelab

From the repo checkout containing these changes, in `apps/learning-app`:

```sh
curl -fsS http://127.0.0.1:8009/api/health
python3 -m venv .venv-mcp
.venv-mcp/bin/pip install -r connector/requirements.txt
.venv-mcp/bin/python -c 'from connector.server import mcp; print(mcp.name)'
```

Install the OpenAI [tunnel client](https://github.com/openai/tunnel-client/releases/latest) for the host architecture. Configure the tunnel runtime key locally as `CONTROL_PLANE_API_KEY` using a private secret or environment file. Check the installed client's `help quickstart` before configuring it. From the same app directory, with `LEARNING_GROVE_TUNNEL_ID` set to your Platform tunnel ID:

```sh
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile learning-grove \
  --tunnel-id "$LEARNING_GROVE_TUNNEL_ID" \
  --mcp-command "$PWD/.venv-mcp/bin/python -m connector.server"
tunnel-client doctor --profile learning-grove --explain
tunnel-client run --profile learning-grove
```

Once it connects, run the last command as a persistent service under the same Unix user, with the app directory as the service working directory and the runtime key supplied locally. Verify that discovery lists exactly the five expected tools. Leave both existing Funnel ports and the app's Caddy configuration alone.

## Connect and test

Use **Plugins → Add custom MCP server → Tunnel** to test the server with your verified tunnel ID. For the full private plugin package with tutor instructions, build the archive and save it with Plugin Creator once the tunnel is running.

```sh
python3 connector/package_plugin.py "$LEARNING_GROVE_TUNNEL_ID" /tmp/learning-grove.zip
```

In a text chat with the plugin selected, say “Let's do today's lesson.” Check that a second start for the same concept reuses the pending session. Try Voice in the same conversation. At the end, verify that preview changes nothing. Approve the recap explicitly, then confirm it appears on the concept in Learning Grove. If tool calls are unavailable in Voice on your client, use text in the same chat to start the lesson and save the recap.

The plugin relies on the conversation's explicit approval and the host's write confirmation behavior. Its accept tool forwards to the existing API, which validates the recap and rejects duplicate saves. The app does not record an independent approval token.

[Secure MCP Tunnel setup](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
