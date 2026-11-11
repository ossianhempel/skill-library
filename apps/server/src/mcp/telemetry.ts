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
 * Sends tool-call spans to Azure Monitor when
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
export function traceToolCalls(server: McpServer, user: McpUser) {
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
            ...clientAttributes(server, user),
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

/**
 * The server is stateless, so a tools/call request does not carry the
 * clientInfo sent at initialize; fall back to the name the client registered
 * with OAuth (e.g. "Claude").
 */
function clientAttributes(server: McpServer, user: McpUser) {
  const info = server.server.getClientVersion();
  return {
    "mcp.client.name": info?.name ?? user.clientName,
    ...(info?.version ? { "mcp.client.version": info.version } : {}),
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
