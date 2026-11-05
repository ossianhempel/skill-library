import { expect, it } from "vitest";
import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { traceToolCalls } from "./telemetry.js";

function providerWith(exporter: InMemorySpanExporter) {
  return new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
}

it("records tool calls with the tracer provider set up last", async () => {
  // Azure Monitor's startup disables the global tracer provider and installs
  // its own; tool calls must reach that one, not an earlier provider.
  const earlier = new InMemorySpanExporter();
  trace.setGlobalTracerProvider(providerWith(earlier));

  const server = new McpServer({ name: "test", version: "1.0.0" });
  traceToolCalls(server, {
    id: "u1",
    role: "user",
    name: "Ada",
    email: "ada@example.com",
    clientName: "Claude",
  });
  server.registerTool("ping", { description: "Ping." }, async () => ({
    content: [{ type: "text", text: "pong" }],
  }));

  const azure = new InMemorySpanExporter();
  trace.disable();
  trace.setGlobalTracerProvider(providerWith(azure));

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientSide);
  await client.callTool({ name: "ping", arguments: {} });

  expect(azure.getFinishedSpans().map((span) => span.name)).toEqual([
    "tools/call ping",
  ]);
  expect(earlier.getFinishedSpans()).toEqual([]);
  trace.disable();
});
