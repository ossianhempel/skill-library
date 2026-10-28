import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CatalogSkill, WebApiClient } from "../types.js";
import { useI18n } from "../i18n/locale.js";

/** Upvote or withdraw on the selected skill, and patch its ranking in place. */
export function useSkillVote({
  apiClient,
  selected,
  setCatalog,
  setNotice,
}: {
  apiClient: WebApiClient;
  selected: CatalogSkill | undefined;
  setCatalog: Dispatch<SetStateAction<CatalogSkill[]>>;
  setNotice: (notice: string) => void;
}) {
  const { t } = useI18n();
  const [votePending, setVotePending] = useState(false);
  const pendingRef = useRef(false);

  async function onVote(voted: boolean) {
    const packageId = selected?.pkg.id;

    // One vote request at a time, so a double click can't race itself.
    if (!packageId || !apiClient.setSkillVote || pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setVotePending(true);
    try {
      const ranking = await apiClient.setSkillVote(packageId, voted);
      setCatalog((current) =>
        current.map((skill) =>
          skill.pkg.id === packageId ? { ...skill, ranking } : skill
        )
      );
      setNotice(voted ? t.notices.upvoteSaved : t.notices.upvoteRemoved);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : t.notices.upvoteFailed
      );
    } finally {
      pendingRef.current = false;
      setVotePending(false);
    }
  }

  return { onVote, votePending };
}
