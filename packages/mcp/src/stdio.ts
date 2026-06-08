#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createHttpMcpApi, createRegistryMcpTools, handleMcpJsonRpc, type JsonRpcRequest } from "./index.js";

const registryUrl = process.env.SKILL_LIBRARY_REGISTRY_URL ?? "http://localhost:3000";
const tools = createRegistryMcpTools(
  createHttpMcpApi({
    registryUrl,
    apiToken: process.env.SKILL_LIBRARY_MCP_TOKEN ?? process.env.SKILL_LIBRARY_API_TOKEN,
    role: parseRole(process.env.SKILL_LIBRARY_MCP_ROLE),
    actorId: process.env.SKILL_LIBRARY_MCP_ACTOR ?? "mcp"
  })
);
const input = createInterface({ input: stdin });

for await (const line of input) {
  if (!line.trim()) {
    continue;
  }

  try {
    const response = await handleMcpJsonRpc(tools, JSON.parse(line) as JsonRpcRequest);
    stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: error instanceof Error ? error.message : "Parse error"
        }
      })}\n`
    );
  }
}

function parseRole(value: string | undefined) {
  return value === "maintainer" || value === "admin" || value === "user" ? value : "user";
}
