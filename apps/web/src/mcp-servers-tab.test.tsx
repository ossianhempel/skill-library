import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCALE_STORAGE_KEY, LocaleProvider } from "./i18n/locale.js";
import type { McpServersClient, McpServerView } from "./api/mcp-servers.js";
import { McpServersTab } from "./components/mcp-servers-tab.js";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const server = (overrides: Partial<McpServerView> = {}): McpServerView => ({
  id: "1",
  workspaceId: "main",
  slug: "brain",
  name: "Company brain",
  description: "Search the company wiki.",
  url: "https://brain.example.com/mcp",
  access: "Everyone",
  notes: "Sign in with your work account.",
  docsUrl: null,
  createdById: "ada",
  createdByName: "Ada",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  canEdit: false,
  claudeCodeCommand:
    "claude mcp add --transport http --scope user brain https://brain.example.com/mcp",
  codexCommand: "codex mcp add brain --url https://brain.example.com/mcp",
  ...overrides,
});

function fakeClient(servers: McpServerView[]): McpServersClient {
  const list = [...servers];
  return {
    list: vi.fn(async () => list),
    save: vi.fn(async (input) => {
      const saved = server({ ...input, slug: "new", canEdit: true });
      list.push(saved);
      return saved;
    }),
    remove: vi.fn(async () => undefined),
  };
}

function renderTab(client: McpServersClient) {
  return render(
    <LocaleProvider>
      <McpServersTab
        registryUrl=""
        workspaceId="main"
        client={client}
        onNotice={() => undefined}
      />
    </LocaleProvider>
  );
}

describe("MCPs tab", () => {
  it("shows each server's address, and the command for the client the reader picks", async () => {
    renderTab(fakeClient([server()]));

    expect(await screen.findByText("Company brain")).toBeTruthy();
    expect(screen.getByText("https://brain.example.com/mcp")).toBeTruthy();
    expect(screen.getByText("Who can use it: Everyone")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    expect(
      screen.getByText(
        "claude mcp add --transport http --scope user brain https://brain.example.com/mcp"
      )
    ).toBeTruthy();
    // The choice is remembered for the next visit.
    expect(window.localStorage.getItem("skill-library-mcp-client")).toBe(
      "code"
    );
  });

  it("adds a server from the form and lists it", async () => {
    const client = fakeClient([]);
    renderTab(client);
    await screen.findByText(/No MCP servers are listed yet/);

    fireEvent.click(screen.getByRole("button", { name: /Add MCP server/ }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Assignments" },
    });
    fireEvent.change(screen.getByLabelText("Address (URL)"), {
      target: { value: "https://panel.example.com/mcp" },
    });
    fireEvent.change(screen.getByLabelText("What it does"), {
      target: { value: "Find assignments and draft applications." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(client.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Assignments",
          url: "https://panel.example.com/mcp",
        }),
        undefined
      )
    );
    expect(await screen.findByText("Assignments")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeTruthy();
  });

  it("speaks Swedish when the reader chose Swedish", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "sv");
    renderTab(fakeClient([server()]));

    expect(await screen.findByText("Company brain")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Claude-appen" })).toBeTruthy();
    expect(screen.getByText(/Vem kan använda den/)).toBeTruthy();
  });
});
