import { describe, expect, it } from "vitest";
import { evaluateFrameworkOutput } from "./framework-eval.ts";

describe("evaluateFrameworkOutput", () => {
  it("pass output đủ citation, disclaimer và assertion", () => {
    const result = evaluateFrameworkOutput(
      "ROE đạt 18% [ref:1]. Không phải tư vấn đầu tư theo Luật Chứng khoán 2019",
      { required_strings: ["ROE"], forbidden_strings: ["chắc chắn tăng"], citation_required: true, legal_disclaimer: true, min_length: 20 },
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fail khi có số không gắn nguồn", () => {
    expect(evaluateFrameworkOutput("ROE 18%", { citation_required: true }).passed).toBe(false);
  });

  it("fail khi thiếu required_string", () => {
    const result = evaluateFrameworkOutput("P/E là 12x [ref:1]", { required_strings: ["ROE"] });
    expect(result.passed).toBe(false);
    expect(result.details.missing).toContain("ROE");
  });

  it("fail khi có forbidden_string", () => {
    const result = evaluateFrameworkOutput("HPG chắc chắn tăng mạnh", { forbidden_strings: ["chắc chắn tăng"] });
    expect(result.passed).toBe(false);
    expect(result.details.presentForbidden).toContain("chắc chắn tăng");
  });

  it("fail khi output quá ngắn", () => {
    const result = evaluateFrameworkOutput("OK", { min_length: 100 });
    expect(result.passed).toBe(false);
    expect(result.details.lengthOk).toBe(false);
  });

  it("fail khi thiếu legal disclaimer", () => {
    const result = evaluateFrameworkOutput("ROE đạt 18% [ref:1].", { legal_disclaimer: true });
    expect(result.passed).toBe(false);
    expect(result.details.disclaimerOk).toBe(false);
  });

  it("score là tỷ lệ check pass / tổng check", () => {
    // 5 checks: required_strings ✓, forbidden ✓, length ✓, citation ✓, disclaimer ✗
    const result = evaluateFrameworkOutput(
      "ROE đạt 18% [ref:1].",
      { required_strings: ["ROE"], citation_required: true, legal_disclaimer: true, min_length: 5 },
    );
    expect(result.score).toBe(4 / 5);
    expect(result.passed).toBe(false);
  });

  it("số dạng Vietnamese 18,5% ngay sau [ref:N] → citation OK", () => {
    const result = evaluateFrameworkOutput(
      "Biên lợi nhuận 18,5% [ref:1]. Không phải tư vấn đầu tư theo Luật Chứng khoán 2019",
      { citation_required: true, legal_disclaimer: true },
    );
    expect(result.details.citationOk).toBe(true);
  });

  it("số trong bảng markdown có ref → citation OK", () => {
    const output = "| ROE | 18% [ref:1] |\n| P/E | 12x [ref:2] |\nKhông phải tư vấn đầu tư theo Luật Chứng khoán 2019";
    const result = evaluateFrameworkOutput(output, { citation_required: true, legal_disclaimer: true });
    expect(result.details.citationOk).toBe(true);
  });

  it("không có số trong output → citation luôn OK", () => {
    const result = evaluateFrameworkOutput("Đây là nhận xét định tính thuần túy không có số.", { citation_required: true });
    expect(result.details.citationOk).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("no assertions → pass mặc định", () => {
    expect(evaluateFrameworkOutput("bất kỳ text nào", {}).passed).toBe(true);
  });
});