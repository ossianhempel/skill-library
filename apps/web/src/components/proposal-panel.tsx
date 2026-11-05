import { CheckCircle2, Download, GitPullRequest, XCircle } from "lucide-react";
import type { LifecycleState } from "@skill-library/domain";
import type { CatalogSkill } from "../types.js";
import { artifactDownloadUrl } from "../api/catalog.js";
import { useI18n } from "../i18n/locale.js";

/**
 * A colleague's change to someone else's skill. The owner (or a maintainer)
 * approves or rejects it here; its author sees that it is waiting.
 */
export function ProposalPanel({
  selected,
  registryUrl,
  viewerId,
  isMaintainer,
  loading,
  handleLifecycle,
}: {
  selected: CatalogSkill;
  registryUrl: string;
  viewerId?: string;
  isMaintainer: boolean;
  loading: boolean;
  handleLifecycle: (toState: LifecycleState, versionId?: string) => void;
}) {
  const { t, dateLocale } = useI18n();
  const proposal = selected.proposal;

  if (!proposal) return null;

  const copy = t.detail.proposal;
  const decides =
    isMaintainer || (viewerId !== undefined && viewerId === selected.owner?.id);
  const date = new Date(proposal.createdAt).toLocaleDateString(dateLocale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="lifecycle-panel proposal-panel">
      <div className="panel-title">
        <GitPullRequest size={17} />
        {copy.title}
      </div>
      <p className="lifecycle-copy">
        {copy.summary(
          proposal.provenance.actorName ?? copy.someone,
          proposal.version,
          date
        )}{" "}
        {selected.latestApproved
          ? copy.current(selected.latestApproved.version)
          : copy.noCurrent}{" "}
        {decides
          ? copy.decide
          : copy.waiting(selected.owner?.name ?? copy.theOwner)}
      </p>
      <div className="actions">
        <a
          className="button secondary"
          href={artifactDownloadUrl(registryUrl, selected, undefined, proposal)}
        >
          <Download size={17} />
          {copy.download}
        </a>
        {decides && (
          <>
            <button
              onClick={() => handleLifecycle("approved", proposal.id)}
              disabled={loading || !proposal.validation.ok}
            >
              <CheckCircle2 size={17} />
              {copy.approve}
            </button>
            <button
              className="secondary"
              onClick={() => handleLifecycle("hidden", proposal.id)}
              disabled={loading}
            >
              <XCircle size={17} />
              {copy.reject}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
