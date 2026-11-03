import { isPermittedLicenseHeader } from "./license-header.mjs";

const noCodeComments = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow comments in source except a leading Apache-2.0 SPDX block comment.",
    },
    schema: [],
    messages: {
      comment:
        "Comments are not allowed in source. The only exception is a leading /* SPDX-License-Identifier: Apache-2.0 */ header. Put the reason in a type, a test, or AGENTS.md.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      Program() {
        const text = sourceCode.getText();
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type === "Shebang") {
            continue;
          }
          const raw = text.slice(comment.range[0], comment.range[1]);
          if (isPermittedLicenseHeader(text, comment.range[0], raw)) {
            continue;
          }
          context.report({
            loc: comment.loc,
            messageId: "comment",
          });
        }
      },
    };
  },
};

export const ixPlugin = {
  meta: {
    name: "ix",
    version: "0.0.0",
  },
  rules: {
    "no-code-comments": noCodeComments,
  },
};
