import { describe, expect, it } from "vitest";
import type { RegistryStore } from "@skill-library/storage";
import { publishingAuthor } from "./publishing-author.js";

const store = {} as RegistryStore;
const someoneElse = {
  actorId: "ossian",
  actorName: "Ossian",
  actorEmail: "ossian@example.com",
};

describe("publishingAuthor", () => {
  it("records a colleague as themselves, whoever the request names", async () => {
    await expect(
      publishingAuthor(store, { id: "christoffer", role: "user" }, someoneElse)
    ).resolves.toEqual({
      actorId: "christoffer",
      actorName: undefined,
      actorEmail: undefined,
    });
  });

  it("lets a maintainer publish on someone else's behalf", async () => {
    await expect(
      publishingAuthor(store, { id: "max", role: "maintainer" }, someoneElse)
    ).resolves.toEqual(someoneElse);
  });
});
