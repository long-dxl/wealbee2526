import { describe, expect, it } from "vitest";
import { SourceRegistry } from "./source-registry.ts";

describe("SourceRegistry", () => {
  it("gán [ref:1] cho URL đầu tiên", () => {
    const r = new SourceRegistry();
    expect(r.add("HPG", "https://hpg.com")).toBe("[ref:1]");
  });

  it("URL khác nhau → số tăng dần", () => {
    const r = new SourceRegistry();
    r.add("HPG", "https://hpg.com");
    expect(r.add("VIC", "https://vic.com")).toBe("[ref:2]");
    expect(r.add("MBB", "https://mbb.com")).toBe("[ref:3]");
  });

  it("URL trùng → trả lại ref số cũ, không tạo mới", () => {
    const r = new SourceRegistry();
    r.add("HPG", "https://hpg.com");
    r.add("VIC", "https://vic.com");
    expect(r.add("HPG lần 2", "https://hpg.com")).toBe("[ref:1]");
    expect(r.toArray()).toHaveLength(2); // không tạo bản ghi mới
  });

  it("label khác nhau nhưng URL giống → vẫn trả ref cũ", () => {
    const r = new SourceRegistry();
    r.add("Nhãn A", "https://same.com");
    expect(r.add("Nhãn B khác", "https://same.com")).toBe("[ref:1]");
  });

  it("toArray trả về đúng format có index, label, url", () => {
    const r = new SourceRegistry();
    r.add("HPG", "https://hpg.com");
    r.add("VIC", "https://vic.com");
    expect(r.toArray()).toEqual([
      { index: 1, label: "HPG", url: "https://hpg.com" },
      { index: 2, label: "VIC", url: "https://vic.com" },
    ]);
  });

  it("toArray rỗng khi chưa add", () => {
    expect(new SourceRegistry().toArray()).toEqual([]);
  });
});