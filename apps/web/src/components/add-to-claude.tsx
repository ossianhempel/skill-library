import { useState } from "react";
import { Bot, ClipboardCheck, Copy, Download } from "lucide-react";
import {
  buildClaudeSkillPrompt,
  type ClaudeSkillPromptInput,
} from "../lib/claude-skill-prompt.js";
import { fetchMcpSetupAgentAuth } from "../mcp-setup-prompts.js";
import { browserToken } from "../lib/browser.js";
import { useI18n } from "../i18n/locale.js";

export const CLAUDE_APP_URL = "https://claude.ai";
export const CLAUDE_DOWNLOAD_URL = "https://claude.com/download";

/**
 * Plain-language steps for adding a skill to the Claude apps (claude.ai or the
 * desktop app) by uploading it. Written for people who use Claude but have
 * never installed anything into it: no terminal, no agent, no config files.
 */
export function AddToClaudeSteps({
  downloadUrl,
  fileName,
}: {
  downloadUrl: string;
  fileName: string;
}) {
  const { t } = useI18n();
  return (
    <div className="add-to-claude">
      <ol className="claude-steps">
        <li>
          <strong>{t.addToClaude.downloadTitle}</strong>
          <span>
            {t.addToClaude.downloadBefore} <code>{fileName}</code>{" "}
            {t.addToClaude.downloadAfter}
          </span>
          <a className="button claude-download" href={downloadUrl}>
            <Download size={17} />
            {t.addToClaude.downloadButton}
          </a>
        </li>
        <li>
          <strong>{t.addToClaude.openTitle}</strong>
          <span>
            {t.addToClaude.openBefore}{" "}
            <a href={CLAUDE_APP_URL} target="_blank" rel="noreferrer">
              claude.ai
            </a>{" "}
            {t.addToClaude.openAfter}
          </span>
        </li>
        <li>
          <strong>{t.addToClaude.customizeTitle}</strong>
        </li>
        <li>
          <strong>{t.addToClaude.uploadTitle}</strong>
          <span>{t.addToClaude.uploadBody}</span>
        </li>
        <li>
          <strong>{t.addToClaude.enableTitle}</strong>
          <span>{t.addToClaude.enableBody}</span>
        </li>
      </ol>
    </div>
  );
}

/**
 * The other way in: a prompt the user pastes into any Claude that has access to
 * their computer. Claude checks access, downloads the skill and saves it as a
 * global skill. The on-screen preview shows a placeholder; the user's personal
 * access key is fetched and added only to the copied text.
 */
export function ClaudePromptInstall({
  promptInput,
}: {
  promptInput: Omit<ClaudeSkillPromptInput, "token">;
}) {
  const { t } = useI18n();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  async function copyPrompt() {
    // Signed-in users get their personal agent token. People using the API
    // token fallback (no SSO session) get the token they entered instead.
    const agentAuth = await fetchMcpSetupAgentAuth({
      registryUrl: promptInput.registryUrl,
      hasSession: true,
    });
    const prompt = buildClaudeSkillPrompt({
      ...promptInput,
      token: agentAuth?.token ?? browserToken(),
    });

    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2500);
  }

  return (
    <div className="claude-prompt-install">
      <p className="claude-prompt-title">
        <Bot size={17} />
        <strong>{t.addToClaude.promptTitle}</strong>
      </p>
      <p className="install-hint">{t.addToClaude.promptHint}</p>
      <code>{buildClaudeSkillPrompt(promptInput)}</code>
      <div className="actions">
        <button type="button" onClick={() => void copyPrompt()}>
          {copyState === "copied" ? (
            <ClipboardCheck size={17} />
          ) : (
            <Copy size={17} />
          )}
          {copyState === "copied"
            ? t.addToClaude.copied
            : t.addToClaude.copyPrompt}
        </button>
      </div>
      {copyState === "failed" && (
        <p className="install-warning" role="alert">
          {t.addToClaude.copyFailed}
        </p>
      )}
    </div>
  );
}

/** The three-step summary on the overview page, before a skill is picked. */
export function HowItWorks({ onBrowse }: { onBrowse: () => void }) {
  const { t } = useI18n();
  return (
    <section className="how-it-works" aria-label={t.howItWorks.title}>
      <p className="kicker">{t.howItWorks.title}</p>
      <ol className="how-it-works-steps">
        <li>
          <strong>{t.howItWorks.findTitle}</strong>
          <span>
            <button type="button" className="link-button" onClick={onBrowse}>
              {t.howItWorks.browse}
            </button>{" "}
            {t.howItWorks.findRest}
          </span>
        </li>
        <li>
          <strong>{t.howItWorks.downloadTitle}</strong>
          <span>{t.howItWorks.downloadBody}</span>
        </li>
        <li>
          <strong>{t.howItWorks.addTitle}</strong>
          <span>{t.howItWorks.addBody}</span>
        </li>
      </ol>
      <p className="how-it-works-note">
        {t.howItWorks.newToClaude}{" "}
        <a href={CLAUDE_APP_URL} target="_blank" rel="noreferrer">
          claude.ai
        </a>{" "}
        {t.howItWorks.inBrowserOr}{" "}
        <a href={CLAUDE_DOWNLOAD_URL} target="_blank" rel="noreferrer">
          {t.howItWorks.downloadApp}
        </a>
        .
      </p>
    </section>
  );
}
