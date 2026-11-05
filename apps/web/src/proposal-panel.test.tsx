import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkillVersion } from "@skill-library/domain";
import { LOCALE_STORAGE_KEY, LocaleProvider } from "./i18n/locale.js";
import { ProposalPanel } from "./components/proposal-panel.js";
import { latestApproved, skill } from "./ui-test-fixtures.js";
import type { CatalogSkill } from "./types.js";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const proposal: SkillVersion = {
  ...latestApproved,
  id: "proposal-1",
  version: "1.0.1",
  lifecycleState: "draft",
  createdAt: "2026-11-05T09:00:00.000Z",
  provenance: {
    ...latestApproved.provenance,
    actorId: "christoffer",
    actorName: "Christoffer",
  },
};

const withProposal = {
  ...skill,
  owner: { id: "ossian", name: "Ossian" },
  proposal,
} as unknown as CatalogSkill;

function renderPanel(viewerId: string, handleLifecycle = vi.fn()) {
  render(
    <LocaleProvider>
      <ProposalPanel
        selected={withProposal}
        registryUrl="https://skills.example"
        viewerId={viewerId}
        isMaintainer={false}
        loading={false}
        handleLifecycle={handleLifecycle}
      />
    </LocaleProvider>
  );
  return handleLifecycle;
}

describe("ProposalPanel", () => {
  it("lets the owner approve or reject the proposed version", () => {
    const decide = renderPanel("ossian");

    expect(
      screen.getByText(/Christoffer proposed version 1\.0\.1/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve change" }));
    expect(decide).toHaveBeenCalledWith("approved", "proposal-1");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(decide).toHaveBeenCalledWith("hidden", "proposal-1");
  });

  it("tells the proposer it waits for the owner", () => {
    renderPanel("christoffer");

    expect(screen.getByText(/Waiting for Ossian to approve it\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve change" })).toBeNull();
  });

  it("speaks Swedish", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "sv");
    renderPanel("ossian");

    expect(screen.getByText("Föreslagen ändring")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Godkänn ändringen" })
    ).toBeTruthy();
  });
});
