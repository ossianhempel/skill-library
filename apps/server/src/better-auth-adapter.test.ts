import { describe, expect, it } from "vitest";
import { authColumnToField, authFieldToColumn } from "./better-auth-adapter.js";

describe("Better Auth adapter field mapping", () => {
  it("maps Better Auth camelCase fields to database snake_case columns", () => {
    expect(authFieldToColumn("createdAt")).toBe("created_at");
    expect(authFieldToColumn("updatedAt")).toBe("updated_at");
    expect(authFieldToColumn("ipAddress")).toBe("ip_address");
    expect(authFieldToColumn("userAgent")).toBe("user_agent");
    expect(authFieldToColumn("userId")).toBe("userId");
  });

  it("maps database columns back to Better Auth field names", () => {
    expect(authColumnToField("created_at")).toBe("createdAt");
    expect(authColumnToField("updated_at")).toBe("updatedAt");
    expect(authColumnToField("ip_address")).toBe("ipAddress");
    expect(authColumnToField("user_agent")).toBe("userAgent");
    expect(authColumnToField("userId")).toBe("userId");
  });
});
