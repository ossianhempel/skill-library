import { useState } from "react";
import { Bot, ClipboardCheck, Copy, Download } from "lucide-react";
import {
  buildClaudeSkillPrompt,
  type ClaudeSkillPromptInput,
} from "../lib/claude-skill-prompt.js";
import { fetchMcpSetupAgentAuth } from "../mcp-setup-prompts.js";

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
  return (
    <div className="add-to-claude">
      <ol className="claude-steps">
        <li>
          <strong>Download the skill.</strong>
          <span>
            This saves <code>{fileName}</code> to your Downloads folder. You
            don&apos;t need to open it.
          </span>
          <a className="button claude-download" href={downloadUrl}>
            <Download size={17} />
            Download for Claude
          </a>
        </li>
        <li>
          <strong>Open Claude.</strong>
          <span>
            Use{" "}
            <a href={CLAUDE_APP_URL} target="_blank" rel="noreferrer">
              claude.ai
            </a>{" "}
            in your browser, or the Claude desktop app.
          </span>
        </li>
        <li>
          <strong>Go to Customize, then Skills.</strong>
        </li>
        <li>
          <strong>Click +, then Create skill, then Upload a skill.</strong>
          <span>Pick the file you just downloaded.</span>
        </li>
        <li>
          <strong>Turn the skill on.</strong>
          <span>
            Use the switch next to it in your list of skills. After that, just
            ask Claude for help as usual. It uses the skill when it fits.
          </span>
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
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    const agentAuth = await fetchMcpSetupAgentAuth({
      registryUrl: promptInput.registryUrl,
      hasSession: true,
    });
    const prompt = buildClaudeSkillPrompt({
      ...promptInput,
      token: agentAuth?.token,
    });
    await navigator.clipboard?.writeText(prompt).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="claude-prompt-install">
      <p className="claude-prompt-title">
        <Bot size={17} />
        <strong>Or let Claude add it for you</strong>
      </p>
      <p className="install-hint">
        Copy this prompt and paste it into Claude, in the desktop app or Claude
        Code. Claude checks your access, downloads the skill and saves it so it
        works in all your conversations. Your personal access key is added when
        you copy, so don&apos;t share the copied text.
      </p>
      <code>{buildClaudeSkillPrompt(promptInput)}</code>
      <div className="actions">
        <button type="button" onClick={() => void copyPrompt()}>
          {copied ? <ClipboardCheck size={17} /> : <Copy size={17} />}
          {copied ? "Copied" : "Copy prompt for Claude"}
        </button>
      </div>
    </div>
  );
}

/** The three-step summary on the overview page, before a skill is picked. */
export function HowItWorks({ onBrowse }: { onBrowse: () => void }) {
  return (
    <section className="how-it-works" aria-label="How it works">
      <p className="kicker">How it works</p>
      <ol className="how-it-works-steps">
        <li>
          <strong>Find a skill</strong>
          <span>
            <button type="button" className="link-button" onClick={onBrowse}>
              Browse the skills
            </button>{" "}
            and click one to see what it does.
          </span>
        </li>
        <li>
          <strong>Download it</strong>
          <span>One click. The file lands in your Downloads folder.</span>
        </li>
        <li>
          <strong>Add it to Claude</strong>
          <span>Upload it under Customize, then Skills. That&apos;s it.</span>
        </li>
      </ol>
      <p className="how-it-works-note">
        New to Claude? Use it at{" "}
        <a href={CLAUDE_APP_URL} target="_blank" rel="noreferrer">
          claude.ai
        </a>{" "}
        in your browser, or{" "}
        <a href={CLAUDE_DOWNLOAD_URL} target="_blank" rel="noreferrer">
          download the desktop app
        </a>
        .
      </p>
    </section>
  );
}
