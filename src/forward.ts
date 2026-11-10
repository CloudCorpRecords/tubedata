/**
 * tubedata core: a forwarding client for the hosted
 * HasData YouTube MCP server.
 *
 * No video is searched and no channel page is read
 * locally. tools/list is answered from the literal tool
 * definitions below, taken verbatim from a live capture
 * of the upstream server (name, title, description and
 * inputSchema exactly as captured, including the title
 * key all four tools carry). A tools/call is forwarded
 * over a streamable-HTTP JSON-RPC session: an initialize
 * POST, a notifications/initialized POST, then the
 * tools/call POST, honouring the Mcp-Session-Id response
 * header when the upstream issues one. The session is
 * established lazily on the first forwarded call and
 * reused for the lifetime of the client.
 *
 * The upstream endpoint is pinned to
 * https://mcp.hasdata.com/mcp?apis=youtube — the query
 * string is part of the pinned URL — and can be
 * overridden with the HASDATA_YOUTUBE_MCP_URL environment
 * variable (that override is a labelled reconstruction).
 * When HASDATA_API_KEY is set in the environment, every
 * upstream request carries an `x-api-key: <key>` header
 * (the header name is pinned by the registry record's
 * remote declaration; forwarding the key from this env
 * var is a labelled reconstruction — the capture itself
 * was taken keyless). When the variable is unset, no key
 * header is sent, and no Authorization header is sent in
 * either case.
 *
 * Upstream results pass through verbatim, including any
 * isError flag and any extra result fields. Failures — a
 * JSON-RPC error from the upstream, a non-2xx status, an
 * unparseable response, or a fetch that throws or times
 * out — surface as an isError result whose text starts
 * with `tubedata error:` (that rendering is a labelled
 * reconstruction). Responses may be plain JSON or SSE
 * (data: lines); the JSON-RPC message with the matching
 * id wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL = "https://mcp.hasdata.com/mcp?apis=youtube";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/hasdata-youtube-tools-original.json)    */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "name": "hasdata_youtube_channel_getYoutubeChannel",
    "title": "youtube_channel: GET /",
    "description": "Get YouTube Channel Data\n\nFetches a YouTube channel by its ID (`UC…`) or handle (`@name`) and returns structured data for any channel tab — `featured`/Home, `videos`, `shorts`, `streams`, `playlists`, `posts`, `podcasts`, `releases`, `store` (desktop only), `about`. Returns channel identity (title, description, avatar, banner), subscriber count, country, join date, total-view count and social links (on the `about` tab), and the items on the requested tab (videos with views and publish date, playlists, posts, podcasts, etc.). Use to monitor competitor channels, build creator/brand directories, track posting cadence and growth signals, or feed `videoId` into the YouTube Video / Transcript endpoints.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "channelId": {
          "type": "string",
          "description": "YouTube channel identifier — either the canonical channel ID (`UC…`, 24 chars) or the public handle starting with `@` (e.g. `@PewDiePie`). Legacy `/c/<custom>` and `/user/<name>` URL slugs are also accepted."
        },
        "tab": {
          "type": "string",
          "enum": [
            "featured",
            "videos",
            "shorts",
            "streams",
            "playlists",
            "posts",
            "community",
            "podcasts",
            "releases",
            "about",
            "store"
          ],
          "description": "Channel tab to scrape. Each tab returns a different content shape:\n- `featured` (default) — channel Home page (channel trailer + curated rows)\n- `videos` — uploaded long-form videos\n- `shorts` — Shorts feed\n- `streams` — past and upcoming live streams\n- `playlists` — created and saved playlists\n- `posts` / `community` — community posts\n- `podcasts` — podcast episodes\n- `releases` — music releases\n- `about` — channel description, links, stats\n- `store` — channel merch\n"
        },
        "gl": {
          "type": "string",
          "description": "The two-letter country code for the country you want to limit the search to. Provide one exact documented value (245 allowed), e.g. `ac`, `af`."
        },
        "hl": {
          "type": "string",
          "description": "The two-letter language code for the language you want to use for the search. Provide one exact documented value (159 allowed), e.g. `af`, `ak`."
        },
        "deviceType": {
          "type": "string",
          "enum": [
            "desktop",
            "mobile"
          ],
          "description": "Device type for the request."
        },
        "paginationToken": {
          "type": "string",
          "description": "Token returned in the previous response to fetch the next page of results."
        }
      },
      "required": [
        "channelId"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "hasdata_youtube_search_getYoutubeSearchResults",
    "title": "youtube_search: GET /",
    "description": "Get YouTube Search Results\n\nSearches YouTube for a query and returns the full results page split into `videoResults` (videoId, title, views, length, publish date, chapters, channel info, extensions like 4K/CC), `channelResults` (channelId, handle, subscribers, verified flag), `shortsResults` / `inlineShortsResults`, themed `shelves` (e.g. 'People also watched', 'Latest from <creator>'), `adsResults` and `sponsoredResults` (advertiser, landing URL, position), plus `searchInformation.totalResults`. Each block preserves its `positionOnPage` so the original layout is reconstructable. Use for competitor and topic monitoring, brand-mention tracking, ad-placement intelligence, creator discovery, trend research, or to feed `videoId` / `channelId` into the YouTube Video, Channel, or Transcript endpoints.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "q": {
          "type": "string",
          "description": "Free-text search query, exactly as a user would type it into the YouTube search box."
        },
        "gl": {
          "type": "string",
          "description": "The two-letter country code for the country you want to limit the search to. Provide one exact documented value (245 allowed), e.g. `ac`, `af`."
        },
        "hl": {
          "type": "string",
          "description": "The two-letter language code for the language you want to use for the search. Provide one exact documented value (159 allowed), e.g. `af`, `ak`."
        },
        "deviceType": {
          "type": "string",
          "enum": [
            "desktop",
            "mobile"
          ],
          "description": "Device type for the request."
        },
        "sp": {
          "type": "string",
          "description": "Raw YouTube `sp` filter token, copied verbatim from a YouTube search URL (e.g. `EgIQAQ%253D%253D`). When provided, it overrides `sortBy`, `date`, `videoType`, `length`, and `filters[]`. Use only if you need a YouTube-side filter that this API does not expose as a structured parameter."
        },
        "sortBy": {
          "type": "string",
          "enum": [
            "relevance",
            "popularity",
            "rating",
            "date",
            "views"
          ],
          "description": "Sort order applied to the results page. `relevance` (default) — best match for the query; `date` — newest first; `views` — most viewed first; `rating` — highest rated first; `popularity` — trending/most popular."
        },
        "date": {
          "type": "string",
          "enum": [
            "hour",
            "today",
            "week",
            "month",
            "year"
          ],
          "description": "Limit results to videos uploaded within this time window relative to now."
        },
        "videoType": {
          "type": "string",
          "enum": [
            "video",
            "shorts",
            "channel",
            "playlist",
            "movie"
          ],
          "description": "Restrict results to a single YouTube content type — regular videos, Shorts, channels, playlists, or movies."
        },
        "length": {
          "type": "string",
          "enum": [
            "under4",
            "between420",
            "plus20"
          ],
          "description": "Filter by video duration bucket:\n- `under4` — under 4 minutes\n- `between420` — 4 to 20 minutes\n- `plus20` — over 20 minutes\n"
        },
        "filters__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "hd",
              "subtitles",
              "cc",
              "d3",
              "live",
              "bought",
              "k4",
              "d360",
              "location",
              "hdr",
              "vr180"
            ]
          },
          "description": "Feature flags to require on results. Multiple values are combined with AND (every flag must apply).\n\n- `hd` — HD quality\n- `k4` — 4K quality\n- `hdr` — HDR\n- `subtitles` — has subtitles/closed captions\n- `cc` — Creative Commons license\n- `d3` — 3D video\n- `d360` — 360° video\n- `vr180` — VR180 video\n- `live` — currently live\n- `bought` — purchased/paid content\n- `location` — has a geographic location tag\n"
        },
        "paginationToken": {
          "type": "string",
          "description": "Token returned in the previous response to fetch the next page."
        }
      },
      "required": [
        "q"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "hasdata_youtube_transcript_getYoutubeTranscript",
    "title": "youtube_transcript: GET /",
    "description": "Get YouTube Video Transcript\n\nReturns the timed transcript (subtitles) of a YouTube video by its 11-character `videoId`. `languageCode` selects the track (e.g. `en`, `de-DE`, `pt-BR`); `type=asr` requests the auto-generated speech-recognition track. Each segment in `transcript[]` carries `startMs`, `endMs`, `snippet`, and a formatted `startTimeText`. The response also includes `availableTranscripts[]` listing every track on the video (language name + code, `type: asr` for auto-generated, `selected: true` for the one returned) so callers can discover what else is available. Use to feed a video's spoken content into RAG/LLM pipelines, generate summaries or chapter outlines, build searchable archives, run translation or accessibility workflows, or analyze talking points across a creator's catalog (pair with the YouTube Channel endpoint to enumerate videos, then fetch transcripts).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "v": {
          "type": "string",
          "description": "11-character YouTube video ID — the value of the `v=` query parameter in a watch URL (e.g. `dQw4w9WgXcQ` for `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)."
        },
        "languageCode": {
          "type": "string",
          "description": "BCP-47 / YouTube language code of the transcript track to return (e.g. `en`, `de`, `en-US`, `pt-BR`). Must match a track that the video actually has. When omitted, the video's default language track is returned."
        },
        "type": {
          "type": "string",
          "enum": [
            "asr"
          ],
          "description": "Set to `asr` to fetch the YouTube auto-generated (speech-recognition) track. Omit to fetch the human-authored track for `languageCode` when one exists."
        }
      },
      "required": [
        "v"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "hasdata_youtube_video_getYoutubeVideo",
    "title": "youtube_video: GET /",
    "description": "Get YouTube Video Data\n\nFetches a single YouTube video by its 11-character `videoId`. Returns title, thumbnail, raw + normalized views and likes, `lengthSeconds`, publish date, category, keywords/tags, `isFamilySafe` / `isUnlisted` flags, the uploading channel (id, link, subscribers, avatar), the full description with parsed links and hashtags, available `captions` tracks (with `kind: asr` for auto-generated), Content-ID `music` matches (song/artist/album), creator `socialLinks`, and the `relatedVideos`, `endScreenVideos`, and `relatedShorts` rails. Use to enrich a video URL with metadata, monitor view/like growth, extract music or sponsor/affiliate links, gather features for recommender or RAG pipelines, or detect caption tracks before calling the YouTube Transcript endpoint.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "v": {
          "type": "string",
          "description": "11-character YouTube video ID — the value of the `v=` query parameter in a watch URL (e.g. `dQw4w9WgXcQ` for `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)."
        },
        "gl": {
          "type": "string",
          "description": "The two-letter country code for the country you want to limit the search to. Provide one exact documented value (245 allowed), e.g. `ac`, `af`."
        },
        "hl": {
          "type": "string",
          "description": "The two-letter language code for the language you want to use for the search. Provide one exact documented value (159 allowed), e.g. `af`, `ak`."
        },
        "deviceType": {
          "type": "string",
          "enum": [
            "desktop",
            "mobile"
          ],
          "description": "Device type for the request."
        }
      },
      "required": [
        "v"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  }
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` is one of the captured tools. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `tubedata error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Parse a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * one is present, else the last parseable message, else
 * null when nothing parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not JSON; ignore this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client holding one upstream session. The
 * session is established lazily on the first forwarded
 * call and reused for the lifetime of the client (the
 * process lifetime when the client is the MCP server's
 * or a one-shot client for the CLI).
 */
export class TubedataClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).HASDATA_YOUTUBE_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private apiKey(): string | null {
    const raw = (this.deps.env ?? process.env).HASDATA_API_KEY;
    if (raw && raw.trim() !== "") return raw.trim();
    return null;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const key = this.apiKey();
    if (key !== null) headers["x-api-key"] = key;
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "tubedata", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // The notification response body carries nothing we need.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Pass the upstream result through verbatim.
    return result;
  }
}

/** Create a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): TubedataClient {
  return new TubedataClient(deps);
}

/** One-shot helper: a fresh client per call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new TubedataClient(deps).callTool(name, args);
}
