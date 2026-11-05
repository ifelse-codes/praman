# Tech Steering

- Language: TypeScript (ESM), Node >= 22.12 (recorded same-host test: Node 26; Vite/Rolldown toolchain floor).
- CLI: commander. MCP: @modelcontextprotocol/sdk over stdio.
- Browser automation: Playwright (headless Chromium, exact binary recorded).
- Schemas: zod (strict, explicit modes and limits).
- Media: sharp for image assertions; host ffmpeg/ffprobe for generated movies.
- Durable campaigns: `node:sqlite`.
- Evidence stored as private files (JSON + PNG/TXT) under the output directory;
  no database server or hosted service.
- Trusted local execution only: not a sandbox; child processes inherit the caller's
  environment by design and that limit is documented.
- Keep modules small and app-independent; target-specific integrations are not part
  of the product (removed in the 2026-11-05 cleanup).
