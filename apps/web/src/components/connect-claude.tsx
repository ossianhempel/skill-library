import { useState } from "react";
import { ClipboardCheck, Copy, Plug } from "lucide-react";
import { mcpEndpointUrl } from "../mcp-setup-prompts.js";
import { useI18n } from "../i18n/locale.js";

/**
 * Connect Claude to the library once, through the hosted MCP server, and then
 * just ask Claude for skills. Written for people who use the Claude app and
 * never touch a terminal: the only thing to copy is the address.
 */
export function ConnectClaude({
  registryUrl,
  appName,
}: {
  registryUrl: string;
  appName: string;
}) {
  const { t } = useI18n();
  const url = mcpEndpointUrl(registryUrl);
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="connect-claude" aria-label={t.connectClaude.title}>
      <p className="kicker">
        <Plug size={14} /> {t.connectClaude.kicker}
      </p>
      <h3>{t.connectClaude.title}</h3>
      <p>{t.connectClaude.intro}</p>
      <div className="connect-claude-url actions">
        <code>{url}</code>
        <button
          type="button"
          className="secondary"
          onClick={() => void copyUrl()}
        >
          {copied ? <ClipboardCheck size={16} /> : <Copy size={16} />}
          {copied ? t.connectClaude.copied : t.connectClaude.copy}
        </button>
      </div>
      <ol className="how-it-works-steps connect-claude-steps">
        <li>
          <strong>{t.connectClaude.step1Title}</strong>
          <span>{t.connectClaude.step1Body}</span>
        </li>
        <li>
          <strong>{t.connectClaude.step2Title}</strong>
          <span>{t.connectClaude.step2Body(appName)}</span>
        </li>
        <li>
          <strong>{t.connectClaude.step3Title}</strong>
          <span>{t.connectClaude.step3Body}</span>
        </li>
      </ol>
      <p className="how-it-works-note">{t.connectClaude.tryIt}</p>
    </section>
  );
}
