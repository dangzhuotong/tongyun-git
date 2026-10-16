import { describe, it, expect } from "vitest";
import { relativeTime } from "./relativeTime";

const NOW_SEC = 1_700_000_000;
const NOW_MS = NOW_SEC * 1000;
const at = (secondsAgo: number) => relativeTime(NOW_SEC - secondsAgo, NOW_MS);

describe("relativeTime", () => {
  it("shows 刚刚 for anything under a minute", () => {
    expect(at(0)).toBe("刚刚");
    expect(at(59)).toBe("刚刚");
  });

  it("clamps future timestamps to 刚刚", () => {
    expect(relativeTime(NOW_SEC + 500, NOW_MS)).toBe("刚刚");
  });

  it("rounds down to minutes under an hour", () => {
    expect(at(60)).toBe("1 分钟前");
    expect(at(119)).toBe("1 分钟前");
    expect(at(59 * 60)).toBe("59 分钟前");
    expect(at(3599)).toBe("59 分钟前");
  });

  it("rounds down to hours under a day", () => {
    expect(at(3600)).toBe("1 小时前");
    expect(at(2 * 3600 + 59)).toBe("2 小时前");
    expect(at(86399)).toBe("23 小时前");
  });

  it("rounds down to days under a month", () => {
    expect(at(86400)).toBe("1 天前");
    expect(at(29 * 86400)).toBe("29 天前");
  });

  it("falls back to a locale date at a month or older", () => {
    const ts = NOW_SEC - 30 * 86400;
    expect(relativeTime(ts, NOW_MS)).toBe(new Date(ts * 1000).toLocaleDateString());
  });
});
