/** SourceRegistry — numbered [ref:N] citation tracker dùng chung cho mọi agent function */
export class SourceRegistry {
  private list: Array<{ label: string; url: string }> = [];

  add(label: string, url: string): string {
    const existing = this.list.findIndex(s => s.url === url);
    if (existing !== -1) return `[ref:${existing + 1}]`;
    this.list.push({ label, url });
    return `[ref:${this.list.length}]`;
  }

  toArray() { return this.list.map((s, i) => ({ index: i + 1, ...s })); }
}
