const spdxOnly = /^\/\*\s*SPDX-License-Identifier:\s*Apache-2\.0\s*\*\/$/;

export function isPermittedLicenseHeader(fileText, commentStart, commentText) {
  const comment = commentText.replace(/\r\n/g, "\n").trim();
  if (!spdxOnly.test(comment)) {
    return false;
  }
  const before = fileText.slice(0, commentStart).replace(/\r\n/g, "\n");
  if (before.trim() === "") {
    return true;
  }
  return /^#![^\n]*\n[ \t\n]*$/.test(before);
}
