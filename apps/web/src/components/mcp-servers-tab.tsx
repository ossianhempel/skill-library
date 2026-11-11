import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ClipboardCheck,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Unplug,
  User,
} from "lucide-react";
import type { McpServerInput } from "@skill-library/domain";
import {
  createMcpServersClient,
  type McpServersClient,
  type McpServerView,
} from "../api/mcp-servers.js";
import { useI18n } from "../i18n/locale.js";
import { InfoTip } from "./chrome.js";

export type McpClient = "app" | "code" | "codex";
const CLIENTS: McpClient[] = ["app", "code", "codex"];
const CLIENT_KEY = "skill-library-mcp-client";

/**
 * The MCPs tab: the team's other MCP servers, each with what it does, who can
 * use it and how to connect from the client the reader uses. Anyone signed in
 * can add one; whoever added it (or a maintainer) can change or remove it.
 */
export function McpServersTab({
  registryUrl,
  token,
  workspaceId,
  client: clientProp,
  onNotice,
}: {
  registryUrl: string;
  token?: string;
  workspaceId: string;
  /** Injected in tests; defaults to the registry API. */
  client?: McpServersClient;
  onNotice: (notice: string) => void;
}) {
  const { t } = useI18n();
  const api = useMemo(
    () =>
      clientProp ?? createMcpServersClient({ registryUrl, token, workspaceId }),
    [clientProp, registryUrl, token, workspaceId]
  );
  const [servers, setServers] = useState<McpServerView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectWith, setConnectWith] = useState<McpClient>(readClient);
  // null = closed, "" = adding a new server, a slug = editing that one.
  const [editing, setEditing] = useState<string | null>(null);

  async function load() {
    try {
      setServers(await api.list());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setServers([]);
    }
  }

  useEffect(() => {
    setServers(null);
    void load();
  }, [api]);

  function chooseClient(next: McpClient) {
    setConnectWith(next);
    try {
      window.localStorage.setItem(CLIENT_KEY, next);
    } catch {
      // Remembering the choice is a convenience only.
    }
  }

  async function remove(server: McpServerView) {
    if (!window.confirm(t.mcps.confirmRemove(server.name))) return;
    try {
      await api.remove(server.slug);
      onNotice(t.mcps.removed(server.name));
      await load();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const clientLabel: Record<McpClient, string> = {
    app: t.mcps.clientApp,
    code: t.mcps.clientCode,
    codex: t.mcps.clientCodex,
  };

  return (
    <section className="admin-panel mcp-panel" aria-label={t.mcps.title}>
      <div className="admin-header">
        <div className="panel-title">
          <Unplug size={17} aria-hidden="true" />
          {t.mcps.title}
          <InfoTip text={t.mcps.intro} />
        </div>
        {editing === null && (
          <button type="button" onClick={() => setEditing("")}>
            <Plus size={16} aria-hidden="true" />
            {t.mcps.add}
          </button>
        )}
      </div>

      <div
        className="sort-control mcp-client-switch"
        role="group"
        aria-label={t.mcps.connectWith}
      >
        <span className="sort-control-label">{t.mcps.connectWith}</span>
        {CLIENTS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={connectWith === option}
            className={`category-pill ${connectWith === option ? "active" : ""}`}
            onClick={() => chooseClient(option)}
          >
            {clientLabel[option]}
          </button>
        ))}
      </div>

      {editing === "" && (
        <McpServerForm
          api={api}
          onDone={async (saved) => {
            setEditing(null);
            if (saved) {
              onNotice(t.mcps.saved(saved.name));
              await load();
            }
          }}
        />
      )}

      {error && (
        <p className="empty-catalog-copy">{t.mcps.loadFailed(error)}</p>
      )}

      {servers === null ? (
        <div className="skill-list-loading" role="status" aria-live="polite">
          <Loader2 size={22} className="spin" aria-hidden="true" />
          <p>{t.mcps.loading}</p>
        </div>
      ) : servers.length === 0 && !error ? (
        <p className="empty-catalog-copy">{t.mcps.empty}</p>
      ) : (
        <ul className="mcp-list">
          {servers.map((server) =>
            editing === server.slug ? (
              <li key={server.slug}>
                <McpServerForm
                  api={api}
                  server={server}
                  onDone={async (saved) => {
                    setEditing(null);
                    if (saved) {
                      onNotice(t.mcps.saved(saved.name));
                      await load();
                    }
                  }}
                />
              </li>
            ) : (
              <McpServerCard
                key={server.slug}
                server={server}
                connectWith={connectWith}
                onEdit={() => setEditing(server.slug)}
                onRemove={() => void remove(server)}
              />
            )
          )}
        </ul>
      )}
    </section>
  );
}

function McpServerCard({
  server,
  connectWith,
  onEdit,
  onRemove,
}: {
  server: McpServerView;
  connectWith: McpClient;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const connect = {
    app: { text: server.url, how: t.mcps.appSteps },
    code: { text: server.claudeCodeCommand, how: t.mcps.codeSteps },
    codex: { text: server.codexCommand, how: t.mcps.codexSteps(server.slug) },
  }[connectWith];

  return (
    <li className="mcp-card">
      <div className="mcp-card-head">
        <h3>{server.name}</h3>
        {server.canEdit && (
          <span className="mcp-card-actions">
            <button type="button" className="secondary" onClick={onEdit}>
              <Pencil size={14} aria-hidden="true" />
              {t.mcps.edit}
            </button>
            <button type="button" className="secondary" onClick={onRemove}>
              <Trash2 size={14} aria-hidden="true" />
              {t.mcps.remove}
            </button>
          </span>
        )}
      </div>
      <p className="mcp-card-description">{server.description}</p>
      <div className="mcp-connect">
        <CopyLine text={connect.text} />
        <p className="mcp-connect-how">{connect.how}</p>
      </div>
      {server.notes && <p className="mcp-card-notes">{server.notes}</p>}
      <p className="mcp-card-meta">
        {server.access && (
          <span>
            {t.mcps.access}: {server.access}
          </span>
        )}
        {server.createdByName && (
          <span>
            <User size={12} aria-hidden="true" />
            {t.mcps.addedBy(server.createdByName)}
          </span>
        )}
        {server.docsUrl && (
          <a href={server.docsUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={12} aria-hidden="true" />
            {t.mcps.help}
          </a>
        )}
      </p>
    </li>
  );
}

function CopyLine({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="connect-claude-url mcp-copy-line">
      <code>{text}</code>
      <button type="button" className="secondary" onClick={() => void copy()}>
        {copied ? <ClipboardCheck size={16} /> : <Copy size={16} />}
        {copied ? t.mcps.copied : t.mcps.copy}
      </button>
    </div>
  );
}

function McpServerForm({
  api,
  server,
  onDone,
}: {
  api: McpServersClient;
  server?: McpServerView;
  onDone: (saved?: McpServerView) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<Required<McpServerInput>>({
    name: server?.name ?? "",
    url: server?.url ?? "",
    description: server?.description ?? "",
    access: server?.access ?? "",
    notes: server?.notes ?? "",
    docsUrl: server?.docsUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (key: keyof McpServerInput) => ({
    value: form[key] ?? "",
    onChange: (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onDone(await api.save(form, server?.slug));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="mcp-card mcp-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="form-grid">
        <label>
          {t.mcps.fieldName}
          <input
            required
            placeholder={t.mcps.placeholderName}
            {...field("name")}
          />
        </label>
        <label className="mcp-form-wide">
          {t.mcps.fieldUrl}
          <input
            required
            type="url"
            placeholder={t.mcps.placeholderUrl}
            {...field("url")}
          />
        </label>
        <label className="mcp-form-full">
          {t.mcps.fieldDescription}
          <input
            required
            placeholder={t.mcps.placeholderDescription}
            {...field("description")}
          />
        </label>
        <label>
          {t.mcps.fieldAccess}
          <input placeholder={t.mcps.placeholderAccess} {...field("access")} />
        </label>
        <label>
          {t.mcps.fieldNotes}
          <input placeholder={t.mcps.placeholderNotes} {...field("notes")} />
        </label>
        <label>
          {t.mcps.fieldDocs}
          <input type="url" {...field("docsUrl")} />
        </label>
      </div>
      {error && (
        <p className="mcp-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? t.mcps.saving : t.mcps.save}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void onDone()}
        >
          {t.mcps.cancel}
        </button>
      </div>
    </form>
  );
}

function readClient(): McpClient {
  try {
    const stored = window.localStorage.getItem(CLIENT_KEY);
    return CLIENTS.includes(stored as McpClient)
      ? (stored as McpClient)
      : "app";
  } catch {
    return "app";
  }
}
