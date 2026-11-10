# BUILD REPORT — tubedata

Rebuild of `com.hasdata/youtube` v1.0.9 (remote-only, keyless capture)
as `@reneturcios/tubedata` 0.1.0 / `io.github.CloudCorpRecords/tubedata`.

## Fixture conflicts

**None.** The brief, the spec prose, and the fixture agree on all four
tool names and every required field. Required fields as served, taken
from the fixture (`harness/fixtures/hasdata-youtube-tools-original.json`):

- `hasdata_youtube_channel_getYoutubeChannel` — required: `channelId`
- `hasdata_youtube_search_getYoutubeSearchResults` — required: `q`
- `hasdata_youtube_transcript_getYoutubeTranscript` — required: `v`
- `hasdata_youtube_video_getYoutubeVideo` — required: `v`

The fixture's tool literals (name, title, description, inputSchema —
including all four `title` keys, every property description and enum,
`additionalProperties: false`, and the `$schema` key on every schema)
are served verbatim from `src/forward.ts`; the `TOOL_DEFS` literals
were generated programmatically by parsing the fixture JSON and
re-serialising it, so nothing was retyped. Verbatim serving was
verified by the registration-integrity test (served tools/list
deep-equals the fixture's 4 tool objects, in order) and again by the
parity harness.

## What was built

All 19 factory files under `builds/tubedata/`:

- `package.json` (`@reneturcios/tubedata` 0.1.0, bin
  `tubedata` → `dist/cli.js`, deps exactly `@modelcontextprotocol/sdk ^1`
  + `zod ^3`; devDeps `@types/node ^20`, `tsx ^4`, `typescript ^5`)
- `server.json` (description exactly the prescribed 86-char string
  "YouTube data as JSON: search results, video and channel details, and full transcripts.",
  measured at 86 characters; npm entry carries `"version": "0.1.0"`;
  OCI entry `ghcr.io/cloudcorprecords/tubedata:0.1.0` carries **no**
  version field)
- `Dockerfile` (node:20-alpine both stages; server-name label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/tubedata"`
  matches `server.json`)
- `tsconfig.json` (fleet-identical, 318 bytes), `.gitignore`,
  `package-lock.json`, `README.md` (fresh prose), `LICENSE` (MIT,
  Copyright (c) 2026 Rene Turcios), `CHANGELOG.md` (single 0.1.0 entry,
  2026-10-28)
- `src/index.ts`, `src/cli.ts`, `src/mcp.ts`, `src/types.ts`,
  `src/forward.ts` (core; exports `VERSION = "0.1.0"`)
- `test/forward.test.ts`
- `.github/workflows/{ci.yml, publish.yml, publish-container.yml,
  registry-publish.yml}` (container workflow: IMAGE
  `ghcr.io/cloudcorprecords/tubedata`, smoke assertion on server name
  `tubedata`)

Plus `BUILD-REPORT.md` (this file) and the `parity-out/` harness output.

## Design

- Forwarding client to `https://mcp.hasdata.com/mcp?apis=youtube`
  (pinned; the query string is part of the pinned URL), overridable via
  `HASDATA_YOUTUBE_MCP_URL` (labelled reconstruction). tools/call is
  forwarded as a streamable-HTTP JSON-RPC client: initialize
  (protocolVersion `2025-03-26`, clientInfo `tubedata`) →
  notifications/initialized → tools/call, honouring `Mcp-Session-Id`
  when issued; session established lazily and reused per client.
  Plain-JSON and SSE replies both parsed; the matching-id message
  wins; upstream results pass through verbatim (including `isError`
  and extra fields such as `structuredContent`).
- When `HASDATA_API_KEY` is set, an `x-api-key: <value>` header is
  sent on every upstream request (header name pinned by the registry
  record's remote declaration; forwarding it from this env var is a
  labelled reconstruction — the capture was keyless). When unset, no
  key header is sent. No `Authorization` header is sent in either
  case. Both branches are covered by tests.
- Upstream failures (JSON-RPC error, non-2xx status, malformed body,
  throwing/timing-out fetch) surface as `tubedata error:` text
  results (labelled reconstruction).
- Registration via the MCP SDK **low-level** `Server` API
  (`ListToolsRequestSchema` / `CallToolRequestSchema` handlers) serving
  the fixture literals exactly; no `McpServer` + zod registration.
  `src/mcp.ts` also exports `createServer` / `startMcpServer` /
  `handleCallTool` so the MCP layer is testable without a transport;
  the CLI's `mcp` subcommand starts it over stdio. Unknown tools are
  rejected with McpError MethodNotFound and non-object arguments with
  McpError InvalidParams, before any network hop.
- Core takes an injectable fetch (`ForwardDeps.fetchFn`), so all tests
  run against a stubbed JSON-RPC upstream. No live network calls in
  tests; no live call claimed anywhere. The captured surface is four
  read-only fetches over public YouTube data; no upload, comment,
  messaging, or payment tool exists in the surface — none was added.

## Lockfile (Route 3, clean)

Generated with `package.json` alone (no `node_modules` in the build
dir): `npm install --package-lock-only --ignore-scripts --offline`.
Verified: parses, `name == @reneturcios/tubedata`, **128 package
entries**. Then `npm install --ignore-scripts --offline` in the build
dir for `node_modules`. No write-guard failure occurred.

## Verification (all in the build dir unless noted)

- `npx tsc --noEmit` → exit 0
- `npm run build` → real `dist/` (cli.js 2293 B, forward.js 22570 B,
  mcp.js 2672 B, all non-empty, with `.d.ts` + source maps)
- `node dist/cli.js --version` → `0.1.0`; unknown subcommand → usage on
  stderr, exit 2
- `npm test` → **42 tests, 42 pass, 0 fail** (8 suites: registration
  integrity — served tools deep-equal the fixture's full 4 tool
  objects, names in order, each tool carries exactly the fixture's
  keys, required fields and every property key in order per tool;
  session establishment/reuse/session-id handling; env URL override
  and explicit url override; x-api-key header present on every request
  when the key is set / absent when unset / no Authorization header in
  either case; verbatim argument forwarding for all four tools;
  verbatim result pass-through incl. upstream isError and SSE;
  JSON-RPC/init/malformed/HTTP/throw/timeout failures →
  `tubedata error:`; parseRpcBody JSON + SSE + matching-id cases;
  MCP-layer validation with MethodNotFound / InvalidParams codes;
  CLI --version / -v / unknown exit 2 / bad-JSON exit 2)
- Parity: `python3 harness/parity.py --original
  harness/fixtures/hasdata-youtube-tools-original.json --rebuild
  "stdio:node builds/tubedata/dist/cli.js mcp" --out
  builds/tubedata/parity-out` (run from `~/workspace/mcp-rebuild-100`)
  → **PASS, parity 100.0, 4/4 identical, no missing/extra/schema
  diffs** (see `parity-out/parity.json`)
- Consistency sweep: package.json version = server.json top-level =
  npm-entry version = OCI tag = core `VERSION` = CHANGELOG heading
  (0.1.0); package.json `mcpName` = server.json `name` = Dockerfile
  label; server.json description measured at 86 chars; OCI entry
  confirmed to have no `version` field.

Clean-room: all prose and code written fresh for tubedata; only the
mechanics were patterned on the sibling staydata build, and only the
fixture's tool literals are served verbatim.
