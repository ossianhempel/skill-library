import {
  ProxyTracerProvider,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type TracerProvider,
} from "@opentelemetry/api";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpUser } from "./oauth.js";
import { VIEW_CALL_KEY } from "./views.js";

const TRACER_NAME = "skill-library-mcp";

/**
 * Sends MCP request spans to Azure Monitor when
 * APPLICATIONINSIGHTS_CONNECTION_STRING is set; otherwise spans stay no-ops.
 * OTEL_SERVICE_NAME becomes the cloud role name (AppRoleName) that usage
 * dashboards group servers by. Call once at startup.
 */
export async function startTelemetry(): Promise<void> {
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    return;
  }

  process.env.OTEL_SERVICE_NAME ??= "skill-library";
  const { useAzureMonitor } = await import("@azure/monitor-opentelemetry");
  const off = { enabled: false };
  // Only the tool-call spans: no HTTP or database spans, no console logs or
  // metrics, and every call kept (the default rate limit drops bursts).
  useAzureMonitor({
    samplingRatio: 1,
    tracesPerSecond: 0,
    enableLiveMetrics: false,
    enableStandardMetrics: false,
    enablePerformanceCounters: false,
    instrumentationOptions: {
      http: off,
      azureSdk: off,
      mongoDb: off,
      mySql: off,
      postgreSql: off,
      redis: off,
      redis4: off,
      bunyan: off,
      winston: off,
      console: off,
    },
  });

  // Libraries such as Better Auth create their own spans through the global
  // API; keep them out so only tool calls reach the usage stats.
  const azure = (
    trace.getTracerProvider() as ProxyTracerProvider
  ).getDelegate();
  const noop = new ProxyTracerProvider();
  const toolSpansOnly: TracerProvider = {
    getTracer: (name, version, options) =>
      (name === TRACER_NAME ? azure : noop).getTracer(name, version, options),
  };
  trace.disable();
  trace.setGlobalTracerProvider(toolSpansOnly);
}

/**
 * Wraps every tool the server registers in one SERVER span per call, named and
 * attributed after the OpenTelemetry MCP semantic conventions. Arguments and
 * results are never recorded.
 */
export function traceToolCalls(
  server: McpServer,
  user: McpUser,
  userAgent?: string
) {
  const register = server.registerTool.bind(server) as (
    name: string,
    config: unknown,
    callback: (...args: unknown[]) => Promise<CallToolResult>
  ) => unknown;

  (server as { registerTool: unknown }).registerTool = (
    name: string,
    config: unknown,
    callback: (...args: unknown[]) => Promise<CallToolResult>
  ) =>
    register(name, config, (...args: unknown[]) =>
      // Looked up per call: useAzureMonitor replaces the global tracer
      // provider, so a tracer taken before startup would stay a no-op.
      trace.getTracer(TRACER_NAME).startActiveSpan(
        `tools/call ${name}`,
        {
          kind: SpanKind.SERVER,
          attributes: {
            "mcp.method.name": "tools/call",
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": name,
            "enduser.id": user.email || "unknown",
            ...clientAttributes(server, user, userAgent),
            ...(calledByView(args) ? { "mcp.tool.caller": "view" } : {}),
          },
        },
        async (span) => {
          try {
            const result = await callback(...args);
            if (result.isError) markFailed(span);
            return result;
          } catch (error) {
            markFailed(span);
            throw error;
          } finally {
            span.end();
          }
        }
      )
    );
}

/** Protocol methods, besides tool calls, that get one span per request. */
const LISTED_METHODS = ["initialize", "tools/list"];

/**
 * One SERVER span per initialize and tools/list request, so the usage data
 * shows how often a client connects and re-reads the tool list (Claude keeps
 * its own copy of the list, so new tools or views reach a user only when it
 * fetches the list again). Call after the tools are registered: McpServer
 * installs its tools/list handler with the first tool. Usage reports count
 * only `mcp.method.name == "tools/call"`.
 */
export function traceListRequests(
  server: McpServer,
  user: McpUser,
  userAgent?: string
) {
  // The SDK has no public way to wrap a handler it installed itself.
  const handlers = (
    server.server as unknown as {
      _requestHandlers: Map<string, (...args: unknown[]) => Promise<unknown>>;
    }
  )._requestHandlers;

  for (const method of LISTED_METHODS) {
    const handler = handlers.get(method);
    if (!handler) throw new Error(`No ${method} handler to trace`);
    handlers.set(method, (...args: unknown[]) =>
      trace.getTracer(TRACER_NAME).startActiveSpan(
        method,
        {
          kind: SpanKind.SERVER,
          attributes: {
            "mcp.method.name": method,
            "enduser.id": user.email || "unknown",
          },
        },
        async (span) => {
          try {
            return await handler(...args);
          } catch (error) {
            span.setAttribute("error.type", "request_error");
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            // After the handler, so initialize already saw the clientInfo.
            span.setAttributes(clientAttributes(server, user, userAgent));
            span.end();
          }
        }
      )
    );
  }
}

/**
 * The server is stateless, so a tools/call request does not carry the
 * clientInfo sent at initialize; fall back to the name the client registered
 * with OAuth (e.g. "Claude"), and record the request's User-Agent.
 */
function clientAttributes(
  server: McpServer,
  user: McpUser,
  userAgent?: string
) {
  const info = server.server.getClientVersion();
  return {
    "mcp.client.name": info?.name ?? user.clientName,
    ...(info?.version ? { "mcp.client.version": info.version } : {}),
    // Every request carries it, so it tells clients apart where clientInfo
    // (initialize only) can't, e.g. Claude Code and claude.ai on tools/list.
    ...(userAgent ? { "user_agent.original": userAgent } : {}),
  };
}

/**
 * True when an MCP Apps view (a button in the host's UI) made the call rather
 * than the model; the view marks its calls in the request `_meta`.
 */
function calledByView(args: unknown[]): boolean {
  const extra = args.at(-1) as { _meta?: Record<string, unknown> } | undefined;
  return extra?._meta?.[VIEW_CALL_KEY] === "view";
}

function markFailed(span: Span) {
  span.setAttribute("error.type", "tool_error");
  span.setStatus({ code: SpanStatusCode.ERROR });
}
