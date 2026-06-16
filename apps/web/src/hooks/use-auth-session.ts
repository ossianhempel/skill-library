import { useEffect, useState } from "react";
import type { AdminUser, AppTab, SessionUser } from "../types.js";
import { formatRoleLabel } from "../lib/format.js";

export function useAuthSession({
  registryUrl,
  activeTab,
  setNotice,
  setActiveTab,
}: {
  registryUrl: string;
  activeTab: AppTab;
  setNotice: (notice: string) => void;
  setActiveTab: (tab: AppTab) => void;
}) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [teamMembers, setTeamMembers] = useState<AdminUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  useEffect(() => {
    void fetchSession();
  }, [registryUrl]);

  async function fetchSession() {
    setSessionLoading(true);
    try {
      const baseUrl = registryUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/auth/get-session`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = (await response.json()) as { user?: SessionUser } | null;
        setSession(data?.user ?? null);
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setSessionLoading(false);
    }
  }

  async function handleLogout() {
    try {
      const baseUrl = registryUrl.replace(/\/$/, "");
      await fetch(`${baseUrl}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    setSession(null);
    setActiveTab("overview");
  }

  async function handleSignIn() {
    const baseUrl = registryUrl.replace(/\/$/, "");

    setSigningIn(true);

    try {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: "microsoft",
          callbackURL: window.location.href,
          disableRedirect: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Sign-in failed (${response.status})`);
      }

      const data = (await response.json()) as { url?: string };

      if (!data.url) {
        throw new Error("Sign-in response did not include a redirect URL.");
      }

      window.location.href = data.url;
    } catch (error) {
      setSigningIn(false);
      console.error("Microsoft sign-in failed:", error);
    }
  }

  async function loadTeamMembers() {
    setTeamLoading(true);
    try {
      const baseUrl = registryUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/api/team/members`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = (await response.json()) as { members: AdminUser[] };
        setTeamMembers(data.members);
      }
    } catch {
      /* ignore */
    } finally {
      setTeamLoading(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    const baseUrl = registryUrl.replace(/\/$/, "");
    try {
      const response = await fetch(
        `${baseUrl}/api/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ role: newRole }),
        }
      );
      if (response.ok) {
        setNotice(`Role updated to ${formatRoleLabel(newRole)}`);
        await loadTeamMembers();
      } else {
        setNotice("Failed to update user role");
      }
    } catch {
      setNotice("Failed to update user role");
    }
  }

  async function handleDeleteUser(userId: string, userName: string) {
    if (
      !window.confirm(
        `Remove ${userName} from the registry? This action cannot be undone.`
      )
    ) {
      return;
    }
    const baseUrl = registryUrl.replace(/\/$/, "");
    try {
      const response = await fetch(
        `${baseUrl}/api/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (response.ok) {
        setNotice(`${userName} has been removed`);
        await loadTeamMembers();
      } else {
        setNotice("Failed to remove user");
      }
    } catch {
      setNotice("Failed to remove user");
    }
  }

  // Load team roster when the team tab opens for any signed-in user.
  useEffect(() => {
    if (activeTab === "team" && session) {
      void loadTeamMembers();
    }
  }, [activeTab, session?.id]);

  return {
    session,
    sessionLoading,
    signingIn,
    teamMembers,
    teamLoading,
    handleLogout,
    handleSignIn,
    loadTeamMembers,
    handleRoleChange,
    handleDeleteUser,
  };
}
