import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkRepository, runSelfTest } from "./boundaries-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const selfTest = runSelfTest();
if (!selfTest.ok) {
  console.error(`boundary self-test failed (${String(selfTest.cases)} cases)`);
  for (const failure of selfTest.failures) {
    console.error(failure);
  }
  process.exit(1);
}

const violations = checkRepository(root);
if (violations.length > 0) {
  console.error(`boundary check failed (${String(violations.length)} violation(s))`);
  for (const violation of violations) {
    console.error(`${violation.reason}: ${violation.message}`);
  }
  process.exit(1);
}

console.log(`boundaries: ok (self-test ${String(selfTest.cases)} cases)`);
