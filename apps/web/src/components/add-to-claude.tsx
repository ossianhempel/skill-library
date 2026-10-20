import { Download, ExternalLink } from "lucide-react";

export const CLAUDE_APP_URL = "https://claude.ai";
export const CLAUDE_DOWNLOAD_URL = "https://claude.com/download";
export const CLAUDE_SKILLS_HELP_URL =
  "https://support.claude.com/en/articles/12512180-using-skills-in-claude";

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
      <p className="claude-steps-help">
        Don&apos;t see Skills? Ask whoever manages Claude at your company to
        turn on Skills and code execution.{" "}
        <a href={CLAUDE_SKILLS_HELP_URL} target="_blank" rel="noreferrer">
          Claude&apos;s help page
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </p>
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
