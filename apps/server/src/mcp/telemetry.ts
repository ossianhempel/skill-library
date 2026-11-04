import { SpanKind, SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpUser } from "./oauth.js";

const tracer = trace.getTracer("skill-library-mcp");

/**
 * Sends traces to Azure Monitor when APPLICATIONINSIGHTS_CONNECTION_STRING is
 * set; otherwise spans stay no-ops. Call once at startup.
 */
export async function startTelemetry(): Promise<void> {
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    return;
  }

  process.env.OTEL_SERVICE_NAME ??= "skill-library";
  const { useAzureMonitor } = await import("@azure/monitor-opentelemetry");
  useAzureMonitor();
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
      tracer.startActiveSpan(
        `tools/call ${name}`,
        {
          kind: SpanKind.SERVER,
          attributes: {
            "mcp.method.name": "tools/call",
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": name,
            "enduser.id": user.email || "unknown",
            ...clientAttributes(server, user),
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

function markFailed(span: Span) {
  span.setAttribute("error.type", "tool_error");
  span.setStatus({ code: SpanStatusCode.ERROR });
}
