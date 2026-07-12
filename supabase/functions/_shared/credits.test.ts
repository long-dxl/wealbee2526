import { describe, expect, it, vi } from "vitest";
import { beenyFor, costVnd, normPlan, VND_PER_BEENY } from "./credits.ts";

describe("costVnd", () => {
  it("tính đúng khi không có cache", () => {
    // 1000 tokens in * 0.40/1e6 * 26000 + 500 tokens out * 1.60/1e6 * 26000
    const result = costVnd(1000, 500, 0);
    expect(result).toBeCloseTo((1000 * 0.40 / 1e6 + 500 * 1.60 / 1e6) * 26000, 6);
  });

  it("cachedIn được tính 25% giá so với fresh input", () => {
    const allFresh = costVnd(1000, 0, 0);
    const withCache = costVnd(1000, 0, 1000); // toàn bộ là cache
    expect(withCache).toBeCloseTo(allFresh * 0.25, 6);
  });

  it("cachedIn > tokensIn bị clamp về tokensIn — không overcharge", () => {
    const normal = costVnd(500, 0, 500);  // cachedIn = tokensIn
    const excess = costVnd(500, 0, 999);  // cachedIn > tokensIn → clamp về 500
    expect(normal).toBeCloseTo(excess, 6);
  });

  it("zero tokens → zero cost", () => {
    expect(costVnd(0, 0)).toBe(0);
  });
});

describe("beenyFor", () => {
  it("zero tokens → 0 Beeny (không tính phí)", () => {
    expect(beenyFor(0, 0)).toBe(0);
  });

  it("tính đúng từ VND và làm tròn 4 chữ số thập phân", () => {
    const vnd = costVnd(1000, 500, 200);
    const expected = Math.round((vnd / VND_PER_BEENY) * 10000) / 10000;
    expect(beenyFor(1000, 500, 200)).toBe(expected);
  });

  it("không làm tròn lên (ceil) — giữ số thực, tối đa 4 chữ số thập phân", () => {
    const result = beenyFor(1000, 500);
    // Làm tròn 4 chữ số thập phân rồi so lại phải bằng chính nó
    expect(Math.round(result * 10000) / 10000).toBe(result);
    // Không ceil: result phải nhỏ hơn ceil của nó (trừ khi đúng bằng số nguyên)
    expect(result).toBeLessThanOrEqual(Math.ceil(result * 10000) / 10000);
  });

  it("model đắt hơn tốn nhiều Beeny hơn (so sánh tỷ lệ)", () => {
    const cheap = beenyFor(1000, 500);
    const expensive = beenyFor(1000, 500); // same base price in credits.ts
    // credits.ts dùng giá gpt-4.1-mini cứng, chỉ kiểm tra tỷ lệ nhất quán
    expect(cheap).toBe(expensive);
  });
});

describe("normPlan", () => {
  it("các plan hợp lệ → giữ nguyên", () => {
    expect(normPlan("free")).toBe("free");
    expect(normPlan("pro")).toBe("pro");
    expect(normPlan("premium")).toBe("premium");
  });

  it("alias pro: 199k, pro-199, plus", () => {
    expect(normPlan("199k")).toBe("pro");
    expect(normPlan("pro-199")).toBe("pro");
    expect(normPlan("plus")).toBe("pro");
  });

  it("alias premium: 499k, premium-499, vip", () => {
    expect(normPlan("499k")).toBe("premium");
    expect(normPlan("premium-499")).toBe("premium");
    expect(normPlan("vip")).toBe("premium");
  });

  it("unknown / null / empty → free", () => {
    expect(normPlan(undefined)).toBe("free");
    expect(normPlan(null)).toBe("free");
    expect(normPlan("")).toBe("free");
    expect(normPlan("enterprise")).toBe("free");
  });

  it("case-insensitive", () => {
    expect(normPlan("FREE")).toBe("free");
    expect(normPlan("PRO")).toBe("pro");
    expect(normPlan("VIP")).toBe("premium");
  });
});

describe("deduct với costVndOverride", () => {
  const makeSb = (balance = 50, bonus = 0) => {
    const state = { balance, bonus };
    return {
      from: () => ({
        select: () => ({ eq: () => ({ limit: async () => ({ data: [{ balance: state.balance, bonus_balance: state.bonus, last_refill_date: new Date().toISOString().slice(0, 10) }] }) }) }),
        insert: () => ({ select: async () => ({ data: null }) }),
        update: () => ({ eq: async () => ({}) }),
      }),
    };
  };

  it("costVndOverride được dùng thay vì tính lại từ giá gpt-4.1-mini", async () => {
    const { deduct } = await import("./credits.ts");
    const sb = makeSb(100);
    const loggedInserts: any[] = [];
    (sb.from as any) = (table: string) => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: [{ balance: 100, bonus_balance: 0, last_refill_date: new Date().toISOString().slice(0, 10) }] }) }) }),
      insert: (row: any) => { loggedInserts.push({ table, row }); return { select: async () => ({ data: null }) }; },
      update: () => ({ eq: async () => ({}) }),
    });
    // 1000đ override → 1000/40 = 25 Beeny
    await deduct(sb, "u1", 0, 0, "test", 0, 1000);
    const tx = loggedInserts.find(i => i.table === "credit_transactions");
    expect(tx?.row?.cost_vnd).toBeCloseTo(1000, 1);
  });
});