import { describe, expect, it } from "vitest";
import { filterPersonallyClearedNotifications } from "./personal-clear";

const all = [
  { id: "old", created_at: "2026-10-05T10:00:00Z" },
  { id: "boundary", created_at: "2026-10-06T10:00:00Z" },
  { id: "new", created_at: "2026-10-06T10:00:01Z" },
];

describe("personal inbox cleanup", () => {
  it("hides only notices created at or before the cutoff", () => {
    expect(
      filterPersonallyClearedNotifications(all, "2026-10-06T10:00:00Z").map(
        (item) => item.id,
      ),
    ).toEqual(["new"]);
  });

  it("keeps all notices when a cutoff is missing or malformed", () => {
    expect(filterPersonallyClearedNotifications(all, undefined)).toEqual(all);
    expect(filterPersonallyClearedNotifications(all, "invalid")).toEqual(all);
  });

  it("does not mutate the input list", () => {
    const original = [...all];
    filterPersonallyClearedNotifications(all, "2026-10-06T10:00:00Z");
    expect(all).toEqual(original);
  });
});
