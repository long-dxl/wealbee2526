export interface EvalAssertions {
  required_strings?: string[];
  forbidden_strings?: string[];
  citation_required?: boolean;
  min_length?: number;
  legal_disclaimer?: boolean;
}

export interface EvalResult { passed: boolean; score: number; details: Record<string, boolean | number | string[]>; }

export function evaluateFrameworkOutput(output: string, assertions: EvalAssertions): EvalResult {
  const required = assertions.required_strings ?? [];
  const forbidden = assertions.forbidden_strings ?? [];
  const missing = required.filter(value => !output.toLocaleLowerCase("vi").includes(value.toLocaleLowerCase("vi")));
  const presentForbidden = forbidden.filter(value => output.toLocaleLowerCase("vi").includes(value.toLocaleLowerCase("vi")));
  const lengthOk = output.trim().length >= (assertions.min_length ?? 1);
  const citationOk = !assertions.citation_required || numbersHaveNearbyRefs(output);
  const disclaimerOk = !assertions.legal_disclaimer || /không phải tư vấn đầu tư/i.test(output);
  const checks = [missing.length === 0, presentForbidden.length === 0, lengthOk, citationOk, disclaimerOk];
  const score = checks.filter(Boolean).length / checks.length;
  return { passed: checks.every(Boolean), score, details: { missing, presentForbidden, lengthOk, citationOk, disclaimerOk } };
}

function numbersHaveNearbyRefs(output: string): boolean {
  const cleaned = output.replace(/\[ref:\d+\]/g, token => token.replace(/\d/g, "x"));
  const matches = [...cleaned.matchAll(/\b\d+(?:[.,]\d+)?%?/g)];
  if (!matches.length) return true;
  return matches.every(match => {
    // 4-digit years (1900–2100) trong văn bản pháp lý / tên luật không cần ref
    if (/^\d{4}$/.test(match[0])) {
      const v = Number(match[0]);
      if (v >= 1900 && v <= 2100) return true;
    }
    const end = (match.index ?? 0) + match[0].length;
    // Cho phép tối đa 15 ký tự đơn vị (x, tỷ, triệu...) trước [ref:N]
    return /^[^\[]{0,15}\[ref:\d+\]/.test(output.slice(end, end + 30));
  });
}
