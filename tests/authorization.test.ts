import { describe, expect, it } from "vitest";
import { hasPermission, permissionsFor, PERMISSIONS, visibleAdminSections } from "@/modules/auth/permissions";
import { availableActions, evaluateTransition, isLearnerVisible } from "@/modules/content/workflow";

describe("role permissions", () => {
  it("learners can only learn", () => {
    expect([...permissionsFor(["LEARNER"])]).toEqual(["learn:use"]);
    expect(hasPermission(["LEARNER"], "content:edit")).toBe(false);
    expect(hasPermission(["LEARNER"], "audit:view")).toBe(false);
  });

  it("instructors manage content but not audit, settings or the catalog", () => {
    for (const p of ["content:edit", "content:review", "content:publish", "questions:edit", "labs:edit", "analytics:view_anonymous", "ai:generate_drafts"] as const) {
      expect(hasPermission(["INSTRUCTOR"], p)).toBe(true);
    }
    for (const p of ["audit:view", "settings:manage", "ai:configure", "catalog:manage", "jobs:manage"] as const) {
      expect(hasPermission(["INSTRUCTOR"], p)).toBe(false);
    }
  });

  it("administrators have every permission", () => {
    for (const p of PERMISSIONS) expect(hasPermission(["ADMIN"], p)).toBe(true);
  });

  it("ignores unknown roles and combines multiple roles", () => {
    expect(permissionsFor(["SUPERUSER", "root"]).size).toBe(0);
    expect(hasPermission(["LEARNER", "INSTRUCTOR"], "content:publish")).toBe(true);
  });

  it("shows admin sections according to permissions", () => {
    const instructor = visibleAdminSections(["INSTRUCTOR"]).map((s) => s.key);
    expect(instructor).toContain("content");
    expect(instructor).toContain("reviews");
    expect(instructor).not.toContain("audit");
    expect(instructor).not.toContain("certifications");
    expect(visibleAdminSections(["LEARNER"])).toHaveLength(0);
    expect(visibleAdminSections(["ADMIN"]).map((s) => s.key)).toContain("settings");
  });
});

describe("content workflow authorization", () => {
  it("offers actions by status and role", () => {
    expect(availableActions("DRAFT", ["LEARNER"])).toEqual([]);
    expect(availableActions("DRAFT", ["INSTRUCTOR"])).toEqual(expect.arrayContaining(["submit_for_review", "archive"]));
    expect(availableActions("TECHNICAL_REVIEW", ["INSTRUCTOR"])).toEqual(expect.arrayContaining(["approve_technical", "request_changes"]));
    expect(availableActions("APPROVED", ["INSTRUCTOR"])).toEqual(expect.arrayContaining(["publish", "schedule"]));
    expect(availableActions("PUBLISHED", ["INSTRUCTOR"])).toEqual(expect.arrayContaining(["unpublish", "mark_outdated", "revise"]));
  });

  it("follows Draft -> Technical -> Editorial -> Approved -> Published -> Outdated -> Archived", () => {
    const roles = ["INSTRUCTOR"];
    expect(evaluateTransition({ action: "submit_for_review", from: "DRAFT", roles })).toEqual({ ok: true, to: "TECHNICAL_REVIEW" });
    expect(evaluateTransition({ action: "approve_technical", from: "TECHNICAL_REVIEW", roles })).toEqual({ ok: true, to: "EDITORIAL_REVIEW" });
    expect(evaluateTransition({ action: "approve_editorial", from: "EDITORIAL_REVIEW", roles })).toEqual({ ok: true, to: "APPROVED" });
    expect(evaluateTransition({ action: "publish", from: "APPROVED", roles })).toEqual({ ok: true, to: "PUBLISHED" });
    expect(evaluateTransition({ action: "mark_outdated", from: "PUBLISHED", roles, comment: "Outline changed" })).toEqual({ ok: true, to: "OUTDATED" });
    expect(evaluateTransition({ action: "archive", from: "OUTDATED", roles })).toEqual({ ok: true, to: "ARCHIVED" });
  });

  it("blocks invalid transitions, missing comments and unauthorized roles", () => {
    expect(evaluateTransition({ action: "publish", from: "DRAFT", roles: ["ADMIN"] })).toEqual({ ok: false, reason: "invalid_transition" });
    expect(evaluateTransition({ action: "publish", from: "APPROVED", roles: ["LEARNER"] })).toEqual({ ok: false, reason: "forbidden" });
    expect(evaluateTransition({ action: "request_changes", from: "TECHNICAL_REVIEW", roles: ["INSTRUCTOR"] })).toEqual({ ok: false, reason: "comment_required" });
    const now = new Date("2026-09-30T10:00:00Z");
    expect(evaluateTransition({ action: "schedule", from: "APPROVED", roles: ["INSTRUCTOR"], publishAt: new Date("2026-09-29T00:00:00Z"), now })).toEqual({
      ok: false,
      reason: "publish_date_required",
    });
    expect(evaluateTransition({ action: "schedule", from: "APPROVED", roles: ["INSTRUCTOR"], publishAt: new Date("2026-10-01T00:00:00Z"), now })).toEqual({
      ok: true,
      to: "APPROVED",
    });
  });

  it("controls learner visibility", () => {
    const now = new Date("2026-09-30T10:00:00Z");
    expect(isLearnerVisible("PUBLISHED", null, now)).toBe(true);
    expect(isLearnerVisible("OUTDATED", null, now)).toBe(true);
    expect(isLearnerVisible("DRAFT", null, now)).toBe(false);
    expect(isLearnerVisible("APPROVED", new Date("2026-09-30T09:00:00Z"), now)).toBe(true);
    expect(isLearnerVisible("APPROVED", new Date("2026-10-30T09:00:00Z"), now)).toBe(false);
    expect(isLearnerVisible("ARCHIVED", null, now)).toBe(false);
  });
});
