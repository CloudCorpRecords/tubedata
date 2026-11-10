# tubedata

tubedata is a small local bridge to the hosted HasData
YouTube MCP server, which returns YouTube data as JSON.
Ask it for a search query and it returns the results
page split into videos, channels, Shorts, shelves and
ads; give it one video ID and it fetches that video's
full details or its timed transcript; give it a channel
ID or handle and it fetches that channel's page, tab by
tab.

The bridge keeps no YouTube data of its own. It serves
the upstream server's tool list locally, exactly as
captured from the live endpoint, and forwards each
tool call upstream, returning the result untouched.
The captured surface is read-only public YouTube data:
there is no upload, comment-posting, messaging, or
payment tool in it.

## Tools

- `hasdata_youtube_search_getYoutubeSearchResults` —
  search YouTube. Required: `q`. Optional filters
  include `gl`, `hl`, `deviceType`, `sp`, `sortBy`,
  `date`, `videoType`, `length`, `filters__`, and
  `paginationToken`. Returns video, channel and Shorts
  results, shelves, ads, and the total-results count.
- `hasdata_youtube_video_getYoutubeVideo` — fetch one
  video by its 11-character ID. Required: `v`.
  Optional: `gl`, `hl`, `deviceType`. Returns title,
  views and likes, duration, channel, description,
  caption tracks, music matches, and related rails.
- `hasdata_youtube_channel_getYoutubeChannel` — fetch
  one channel by ID (`UC...`) or handle (`@name`).
  Required: `channelId`. Optional: `tab`, `gl`, `hl`,
  `deviceType`, `paginationToken`. Returns channel
  identity, subscriber count, and the requested tab's
  items.
- `hasdata_youtube_transcript_getYoutubeTranscript` —
  fetch a video's timed transcript. Required: `v`.
  Optional: `languageCode`, `type` (`asr` for the
  auto-generated track). Returns transcript segments
  plus every available track on the video.

## Configuration

- `HASDATA_YOUTUBE_MCP_URL` (optional) — override the
  upstream endpoint. Defaults to
  `https://mcp.hasdata.com/mcp?apis=youtube`. (The
  override hook is this rebuild's own labelled
  reconstruction.)
- `HASDATA_API_KEY` (optional) — when set, every
  upstream request carries an `x-api-key: <key>`
  header, for the caller's own HasData API key. When
  it is not set, no key header is sent. (The header
  name and the env name are pinned by the original's
  registry record; forwarding the key from this env
  var is a labelled reconstruction — the original
  surface was captured keyless.)

### Forwarding mechanics

On the first tool call the client opens a streamable
HTTP session with the upstream: a JSON-RPC
`initialize` request (protocolVersion `2025-03-26`,
clientInfo name `tubedata`), then a
`notifications/initialized` notification, then the
`tools/call` request carrying the caller's arguments
unchanged. When the upstream answers `initialize`
with an `Mcp-Session-Id` header, that value rides on
every later request of the session, which is reused
for the life of the process. Replies may arrive as
plain JSON or as server-sent events; both are read.

Successful upstream results pass through verbatim,
including any `isError` flag the upstream sets.
Failures — a JSON-RPC error, a non-2xx status, an
unreadable response, or a request that cannot be
completed — come back as an `isError` result whose
text starts with `tubedata error:` (this rendering
is this rebuild's own labelled reconstruction).

## CLI

Each tool is also a subcommand taking one JSON
argument string:

```bash
npx @reneturcios/tubedata hasdata_youtube_search_getYoutubeSearchResults '{"q":"lofi beats"}'
npx @reneturcios/tubedata hasdata_youtube_video_getYoutubeVideo '{"v":"dQw4w9WgXcQ"}'
npx @reneturcios/tubedata hasdata_youtube_channel_getYoutubeChannel '{"channelId":"@PewDiePie"}'
npx @reneturcios/tubedata hasdata_youtube_transcript_getYoutubeTranscript '{"v":"dQw4w9WgXcQ","languageCode":"en"}'
npx @reneturcios/tubedata --version
```

Exit codes: `0` on success, `1` on an `isError`
result, `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/tubedata mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "tubedata": {
      "command": "npx",
      "args": ["-y", "@reneturcios/tubedata", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/tubedata
docker run --rm ghcr.io/cloudcorprecords/tubedata --version
```

The container's default command is `mcp`, so the first
form is a stdio MCP server; any other arguments reach
the CLI normally.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

The test suite runs entirely against a stubbed
JSON-RPC upstream — no live network calls.

## License

MIT — see `LICENSE`.
