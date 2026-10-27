# Security

The status service reads Claude Code's login, Codex session logs, and T3 Code session tokens on your computer, so a hole in it can expose more than this project's own data.

## Reporting a problem

Open a [GitHub issue](https://github.com/snowopsdev/t3-things/issues) with the steps to reproduce it. Leave out your own tokens, hostnames, and tailnet name.

## What's in scope

- `service/agent-status.mjs`: anything that gets around the bearer token, reads or writes outside what it documents, or leaks a credential into `status.json` or its logs.
- The Car Thing app and its settings page: anything that leaks the service URL or token beyond the device and the companion app.

Claude, Codex, T3 Code, bridgething, and Tailscale belong to their own projects, so report problems in them there.

## Running it safely

- Keep the service on `127.0.0.1` and reach it only through `tailscale serve`. Don't publish it with `tailscale funnel` or open its port to the internet.
- Use a long random display token (`openssl rand -hex 24`). The service won't start with one shorter than 16 characters.
- Give each T3 Code host a session token with only the `orchestration:read` scope.
- Keep `~/.config/agent-status` readable only by you: `chmod 700 ~/.config/agent-status && chmod 600 ~/.config/agent-status/*`.
