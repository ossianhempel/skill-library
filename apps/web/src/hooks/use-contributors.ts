import { useEffect, useState } from "react";
import type { ContributorRanking } from "@skill-library/domain";
import type { WebApiClient } from "../types.js";

/** Loads the contributor leaderboard each time its tab is opened, so it is never stale. */
export function useContributors({
  apiClient,
  workspaceId,
  active,
}: {
  apiClient: WebApiClient;
  workspaceId: string;
  active: boolean;
}) {
  const [contributors, setContributors] = useState<ContributorRanking[]>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active || !apiClient.workspaceRanking) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    apiClient
      .workspaceRanking(workspaceId)
      .then((ranking) => {
        if (!cancelled) setContributors(ranking.contributors);
      })
      .catch(() => {
        if (!cancelled) setContributors([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, apiClient, workspaceId]);

  return { contributors, loading };
}
