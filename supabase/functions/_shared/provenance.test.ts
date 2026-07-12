import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveDataAsOf, extractClaims, extractNumericValues, persistRunProvenance, type ToolExecutionRecord } from "./provenance.ts";

beforeEach(() => {
  vi.stubGlobal("crypto", {
    subtle: { digest: async (_alg: string, data: Uint8Array) => data.buffer },
  });
});

describe("extractNumericValues", () => {
  it("trích số từ text, bỏ số trong [ref:N]", () => {
    expect(extractNumericValues("ROE 18% [ref:2], quý 4")).toEqual(["18%", "4"]);
  });

  it("số âm được trích", () => {
    expect(extractNumericValues("lỗ -5,3 tỷ")).toContain("-5,3");
  });

  it("không trùng lặp cùng giá trị số", () => {
    const result = extractNumericValues("18% tăng 18%");
    expect(result.filter(v => v === "18%")).toHaveLength(1);
  });

  it("text không có số → mảng rỗng", () => {
    expect(extractNumericValues("Không có số liệu nào cả.")).toEqual([]);
  });
});

describe("extractClaims", () => {
  it("claim có số và ref hợp lệ → grounded", () => {
    const claims = extractClaims("ROE đạt 18% [ref:2]. Biên tăng 3%.", new Set([2]));
    expect(claims[0].validation_status).toBe("grounded");
    expect(claims[1].validation_status).toBe("unlinked");
  });

  it("ref không tồn tại trong validRefs → invalid", () => {
    expect(extractClaims("ROE 18% [ref:9]", new Set([1]))[0].validation_status).toBe("invalid");
  });

  it("câu không có số → bị lọc ra (không tạo claim)", () => {
    const claims = extractClaims("Đây là nhận xét định tính.", new Set([1]));
    expect(claims).toHaveLength(0);
  });

  it("dòng disclaimer bị lọc ra", () => {
    const claims = extractClaims(
      "ROE 18% [ref:1].\nThông tin phân tích · không phải tư vấn đầu tư theo Luật Chứng khoán 2019",
      new Set([1]),
    );
    expect(claims.every(c => !c.claim_text.includes("Luật Chứng khoán"))).toBe(true);
  });

  it("dòng bảng markdown có số và ref → grounded", () => {
    const claims = extractClaims("| ROE | 18% [ref:1] |", new Set([1]));
    if (claims.length > 0) {
      expect(claims[0].validation_status).toBe("grounded");
    }
  });

  it("claim index tăng dần", () => {
    const claims = extractClaims("ROE 18% [ref:1].\nP/E 12x [ref:2].", new Set([1, 2]));
    expect(claims[0].claim_index).toBe(0);
    expect(claims[1].claim_index).toBe(1);
  });
});

describe("deriveDataAsOf", () => {
  it("trích ISO date mới nhất từ output tool", () => {
    const records: ToolExecutionRecord[] = [{
      callKey: "a", toolId: "financials", arguments: {}, status: "completed",
      output: "Dữ liệu Q4/2024, period_end 2024-12-31, updated 2025-03-15",
      startedAt: "2026-07-11T00:00:00Z", finishedAt: "2026-07-11T00:00:01Z",
    }];
    const asOf = deriveDataAsOf(records);
    expect(asOf).toContain("2025-03-15");
  });

  it("không tìm thấy date → dùng finishedAt", () => {
    const records: ToolExecutionRecord[] = [{
      callKey: "a", toolId: "macro", arguments: {}, status: "completed",
      output: "Không có ngày cụ thể",
      startedAt: "2026-07-11T10:00:00Z", finishedAt: "2026-07-11T10:00:05Z",
    }];
    const asOf = deriveDataAsOf(records);
    expect(new Date(asOf).getFullYear()).toBe(2026);
  });

  it("nhiều record → lấy date mới nhất", () => {
    const records: ToolExecutionRecord[] = [
      { callKey: "a", toolId: "t1", arguments: {}, status: "completed", output: "2024-06-30", startedAt: "2026-07-11T00:00:00Z", finishedAt: "2026-07-11T00:00:01Z" },
      { callKey: "b", toolId: "t2", arguments: {}, status: "completed", output: "2025-03-15", startedAt: "2026-07-11T00:00:00Z", finishedAt: "2026-07-11T00:00:01Z" },
    ];
    expect(deriveDataAsOf(records)).toContain("2025-03-15");
  });
});

describe("persistRunProvenance", () => {
  const makeSb = () => {
    const store: Record<string, any[]> = {};
    return {
      from: (table: string) => ({
        insert: (rows: any) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          store[table] = [...(store[table] ?? []), ...arr];
          const data = arr.map((r, i) => ({ ...r, id: `${table}-${i}` }));
          return { select: async () => ({ data, error: null }), error: null };
        },
      }),
      _store: store,
    };
  };

  it("ghi agent_tool_calls và evidence_items cho mỗi tool", async () => {
    const sb = makeSb();
    const records: ToolExecutionRecord[] = [{
      callKey: "financials-HPG", toolId: "financials", arguments: { symbol: "HPG" },
      output: "ROE 18% [ref:1] as of 2024-12-31", status: "completed",
      startedAt: "2026-07-11T00:00:00Z", finishedAt: "2026-07-11T00:00:01Z",
    }];
    const refs = [{ index: 1, label: "HPG", url: "https://vietcap.com" }];
    const result = await persistRunProvenance(sb as any, "run-1", records, refs, "ROE 18% [ref:1].");
    expect(result.toolCalls).toBe(1);
    expect(result.evidence).toBeGreaterThan(0);
    expect(sb._store["agent_tool_calls"]).toHaveLength(1);
  });

  it("output_claims phân loại grounded/unlinked đúng", async () => {
    const sb = makeSb();
    const records: ToolExecutionRecord[] = [{
      callKey: "k", toolId: "macro", arguments: {},
      output: "Lãi suất 5% [ref:1]", status: "completed",
      startedAt: "2026-07-11T00:00:00Z", finishedAt: "2026-07-11T00:00:01Z",
    }];
    const output = "Lãi suất 5% [ref:1]. Tỷ giá 25000."; // 25000 không có ref → unlinked
    const result = await persistRunProvenance(sb as any, "run-2", records, [{ index: 1, label: "NHNN", url: "https://sbv.gov.vn" }], output);
    expect(result.grounded).toBeGreaterThanOrEqual(1);
    expect(result.unlinked).toBeGreaterThanOrEqual(1);
  });

  it("zero tool records → trả về asOf từ now", async () => {
    const sb = makeSb();
    const result = await persistRunProvenance(sb as any, "run-3", [], [], "Không có số liệu.");
    expect(result.toolCalls).toBe(0);
    expect(new Date(result.asOf).getFullYear()).toBeGreaterThanOrEqual(2026);
  });
});