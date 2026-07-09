// Cổng chống crash: chạy tsc --noEmit rồi CHỈ chặn các lỗi "crash-class" —
// identifier/module không tồn tại (đúng loại đã gây ReferenceError: MessageCircle, navigate…).
// KHÔNG chặn 300+ lỗi type strictness khác (không gây crash runtime).
//   TS2304 Cannot find name          → ReferenceError chắc chắn
//   TS2552 Cannot find name (did you mean) → như trên
//   TS2307 Cannot find module        → import module không tồn tại → crash
//   TS2305 Module has no exported member (value import) → import sai
import { execSync } from "node:child_process";

const CRASH = /error TS(2304|2552|2307|2305)\b/;
let out = "";
try {
  out = execSync("node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json",
                 { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  out = (e.stdout || "") + (e.stderr || "");   // tsc thoát != 0 khi có lỗi → gom output
}

const hits = out.split(/\r?\n/).filter((l) => CRASH.test(l));
if (hits.length) {
  console.error("\n❌ LỖI CRASH-CLASS (tên/biến/module không tồn tại) — sẽ crash runtime:\n");
  hits.forEach((l) => console.error("   " + l.trim()));
  console.error(`\n→ ${hits.length} lỗi. Sửa hết (thường là thiếu import) rồi build lại.\n`);
  process.exit(1);
}
console.log("✅ check-refs: không có lỗi crash-class (undefined name/import).");
