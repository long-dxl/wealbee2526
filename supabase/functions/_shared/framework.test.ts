import { describe, expect, it } from "vitest";
import { applyToolPolicy, buildFrameworkPrompt, frameworkKey, type FrameworkArtifact } from "./framework.ts";

const artifact: FrameworkArtifact = {
  frameworkId: "f", versionId: "v", key: "deep_research.default", version: 3,
  label: "deep_research.default@v3", systemRules: "Chỉ dùng dữ liệu có nguồn",
  toolPolicy: { required: ["financials"], optional: ["financials", "news_feed"], denied: ["web_search"] },
  outputContract: { format: "markdown" }, checksum: "x",
};

describe("frameworkKey", () => {
  it("tạo key ổn định", () => expect(frameworkKey("deep_research", "bank")).toBe("deep_research.bank"));
  it("task null/undefined → default", () => {
    expect(frameworkKey(null, "bank")).toBe("default.bank");
    expect(frameworkKey(undefined, "bank")).toBe("default.bank");
    expect(frameworkKey("", "bank")).toBe("default.bank");
  });
  it("companyType mặc định là default", () => expect(frameworkKey("deep_research")).toBe("deep_research.default"));
});

describe("applyToolPolicy", () => {
  it("ép required, giới hạn optional và loại denied", () => {
    expect(applyToolPolicy(["news_feed", "web_search", "macro"], artifact))
      .toEqual(["financials", "news_feed"]);
  });

  it("required luôn được thêm dù agent không bật", () => {
    expect(applyToolPolicy([], artifact)).toContain("financials");
  });

  it("denied luôn bị loại dù agent bật", () => {
    expect(applyToolPolicy(["web_search"], artifact)).not.toContain("web_search");
  });

  it("khi optional rỗng → tất cả tool không-denied đều được phép", () => {
    const openArtifact: FrameworkArtifact = { ...artifact,
      toolPolicy: { required: [], optional: [], denied: ["web_search"] } };
    const result = applyToolPolicy(["financials", "news_feed", "macro", "web_search"], openArtifact);
    expect(result).toContain("financials");
    expect(result).toContain("news_feed");
    expect(result).toContain("macro");
    expect(result).not.toContain("web_search");
  });

  it("khi không có denied → chỉ lọc theo optional", () => {
    const restrictedArtifact: FrameworkArtifact = { ...artifact,
      toolPolicy: { required: ["financials"], optional: ["financials", "news_feed"] } };
    const result = applyToolPolicy(["financials", "news_feed", "macro", "web_search"], restrictedArtifact);
    expect(result).toEqual(["financials", "news_feed"]);
  });

  it("không trùng lặp tool dù required trùng với enabled", () => {
    const result = applyToolPolicy(["financials", "financials"], artifact);
    expect(result.filter(t => t === "financials")).toHaveLength(1);
  });
});

describe("buildFrameworkPrompt", () => {
  it("gắn version vào prompt", () => {
    expect(buildFrameworkPrompt(artifact, "base")).toContain("deep_research.default@v3");
  });

  it("gắn systemRules vào prompt", () => {
    expect(buildFrameworkPrompt(artifact, "base")).toContain("Chỉ dùng dữ liệu có nguồn");
  });

  it("format markdown → yêu cầu Markdown thuần", () => {
    expect(buildFrameworkPrompt(artifact, "base")).toContain("Markdown thuần");
  });

  it("format khác markdown → cho phép HTML inline", () => {
    const colorArtifact: FrameworkArtifact = { ...artifact, outputContract: { format: "markdown_color" } };
    expect(buildFrameworkPrompt(colorArtifact, "base")).toContain("HTML inline");
  });

  it("citation_required → yêu cầu [ref:N]", () => {
    const cited: FrameworkArtifact = { ...artifact, outputContract: { ...artifact.outputContract, citation_required: true } };
    expect(buildFrameworkPrompt(cited, "base")).toContain("[ref:N]");
  });

  it("legal_disclaimer → thêm disclaimer Luật Chứng khoán", () => {
    const disc: FrameworkArtifact = { ...artifact, outputContract: { ...artifact.outputContract, legal_disclaimer: true } };
    expect(buildFrameworkPrompt(disc, "base")).toContain("Luật Chứng khoán 2019");
  });

  it("base prompt rỗng → không crash", () => {
    expect(() => buildFrameworkPrompt(artifact, "")).not.toThrow();
  });
});