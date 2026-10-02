import { describe, expect, it } from "vitest";
import { createFormatters } from "@/i18n/format";

describe("formatters", () => {
  it("formats total study time in words and keeps timers clock-style", () => {
    const en = createFormatters("en");
    expect(en.studyTime(1613)).toBe("27 min");
    expect(en.studyTime(3900)).toBe("1 hr 5 min");
    expect(en.studyTime(7200)).toBe("2 hr");
    expect(en.studyTime(-5)).toBe("0 min");
    expect(en.duration(1613)).toBe("26:53");
    expect(createFormatters("tr").studyTime(3900)).toBe("1 sa. 5 dk.");
  });
});
