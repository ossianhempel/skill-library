import { useEffect, useState } from "react";
import type { Workspace } from "@skill-library/domain";
import type { WebApiClient } from "../types.js";
import { useI18n } from "../i18n/locale.js";

export function useWorkspace({
  apiClient,
  workspaceId,
  setNotice,
}: {
  apiClient: WebApiClient;
  workspaceId: string;
  setNotice: (notice: string) => void;
}) {
  const { t } = useI18n();
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      const workspace = await apiClient.workspaceDetail(workspaceId);

      if (!cancelled) {
        setActiveWorkspace(workspace ?? null);
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [apiClient, workspaceId]);

  async function handleWorkspaceLogoChange(logoUrl: string) {
    const workspace = await apiClient.updateWorkspace(workspaceId, { logoUrl });
    setActiveWorkspace(workspace);
    setNotice(logoUrl.trim() ? t.notices.logoUpdated : t.notices.logoCleared);
  }

  return { activeWorkspace, handleWorkspaceLogoChange };
}
