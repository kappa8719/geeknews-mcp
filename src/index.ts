/**
 * GeekNews MCP Server
 * Cloudflare Workers + MCP Streamable HTTP transport (spec 2025-06-18)
 */

import { getLatestPostsTool, handleGetLatestPosts } from "./tools/latest.js";
import { searchPostsTool, handleSearchPosts } from "./tools/search.js";

export interface Env {
  MCP_TOKEN: string;
}

const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_NAME = "geeknews-mcp";
const SERVER_VERSION = "1.0.0";

// In-memory session store (lives for the duration of the isolate)
const sessions = new Set<string>();

function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      ...extraHeaders,
    },
  });
}

function validateToken(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  return token === env.MCP_TOKEN;
}

// ---------------------------------------------------------------------------
// MCP message handlers
// ---------------------------------------------------------------------------

function handleInitialize(id: unknown, _params: unknown, sessionId: string) {
  sessions.add(sessionId);
  return {
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
    },
  };
}

function handleToolsList(id: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      tools: [getLatestPostsTool, searchPostsTool],
    },
  };
}

async function handleToolsCall(id: unknown, params: { name: string; arguments?: Record<string, unknown> }) {
  const { name, arguments: args = {} } = params;

  try {
    let text: string;

    if (name === "get_latest_posts") {
      text = await handleGetLatestPosts(args as { limit?: number });
    } else if (name === "search_posts") {
      text = await handleSearchPosts(args as { query: string; limit?: number });
    } else {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${name}` },
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text }],
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Main request dispatcher
// ---------------------------------------------------------------------------

async function handlePost(request: Request, env: Env): Promise<Response> {
  // Token auth
  if (!validateToken(request, env)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Session management
  let sessionId = request.headers.get("Mcp-Session-Id") ?? "";
  if (!sessionId || !sessions.has(sessionId)) {
    sessionId = generateSessionId();
    // Will be registered on initialize
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      400,
    );
  }

  // Support both single message and batch (array)
  const messages: unknown[] = Array.isArray(body) ? body : [body];
  const responses: unknown[] = [];

  for (const msg of messages) {
    if (typeof msg !== "object" || msg === null) {
      responses.push({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
      continue;
    }

    const { id, method, params } = msg as { id?: unknown; method?: string; params?: unknown };

    if (typeof method !== "string") {
      responses.push({ jsonrpc: "2.0", id: id ?? null, error: { code: -32600, message: "Invalid Request" } });
      continue;
    }

    // Notifications (no id) — handle but don't push a response
    if (id === undefined) {
      if (method === "notifications/initialized") {
        // Client signals it's ready — no response needed
      }
      continue;
    }

    let result: unknown;
    switch (method) {
      case "initialize":
        result = handleInitialize(id, params, sessionId);
        break;
      case "tools/list":
        result = handleToolsList(id);
        break;
      case "tools/call":
        result = await handleToolsCall(id, params as { name: string; arguments?: Record<string, unknown> });
        break;
      case "ping":
        result = { jsonrpc: "2.0", id, result: {} };
        break;
      default:
        result = { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
    }

    responses.push(result);
  }

  const responseBody = Array.isArray(body) ? responses : responses[0];

  return jsonResponse(responseBody, 200, { "Mcp-Session-Id": sessionId });
}

// ---------------------------------------------------------------------------
// Worker fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Only handle root path
    if (url.pathname !== "/") {
      return new Response("Not Found", { status: 404 });
    }

    // HEAD — return protocol version header (used by claude.ai to discover MCP servers)
    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
          "Content-Type": "application/json",
        },
      });
    }

    // GET — not allowed per spec; return 405
    if (request.method === "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST, HEAD" },
      });
    }

    // POST — main MCP endpoint
    if (request.method === "POST") {
      return handlePost(request, env);
    }

    // All other methods
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST, HEAD" },
    });
  },
};
