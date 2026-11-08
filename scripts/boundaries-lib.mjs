import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { isPermittedLicenseHeader } from "./license-header.mjs";

const layers = {
  core: new Set(["core"]),
  app: new Set(["core"]),
  adapter: new Set(["core", "app"]),
  suite: new Set(["core", "app"]),
};

const bannedExact = new Set([
  "crypto",
  "node:crypto",
  "jose",
  "elliptic",
  "tweetnacl",
  "secp256k1",
  "ethers",
  "web3",
  "openpgp",
  "libsodium-wrappers",
  "did-jwt",
  "did-resolver",
  "jsonld-signatures",
  "jsonwebtoken",
  "jws",
]);

const bannedPrefixes = ["@noble/", "@stablelib/", "@transmute/"];

const bannedSigningNames = new Set([
  "sign",
  "generateKey",
  "generateKeyPair",
  "generateKeyPairSync",
  "importKey",
  "exportKey",
  "deriveKey",
  "deriveBits",
  "wrapKey",
  "unwrapKey",
  "createSign",
  "createVerify",
  "createPrivateKey",
  "createPublicKey",
  "createSecretKey",
  "privateEncrypt",
  "privateDecrypt",
  "publicEncrypt",
  "publicDecrypt",
]);

const pemLabels = [
  "PRIVATE KEY",
  "RSA PRIVATE KEY",
  "OPENSSH PRIVATE KEY",
  "EC PRIVATE KEY",
  "PGP PRIVATE KEY BLOCK",
];

const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".md",
  ".txt",
  ".tsv",
]);

export function layerAllows(importerLayer, dependencyLayer) {
  const allowed = layers[importerLayer];
  return allowed?.has(dependencyLayer) ?? false;
}

export function isBannedModule(specifier) {
  if (bannedExact.has(specifier)) {
    return true;
  }
  return bannedPrefixes.some(
    (prefix) => specifier === prefix.slice(0, -1) || specifier.startsWith(prefix),
  );
}

export function hasPrivateKeyBlock(text) {
  return pemLabels.some((label) => text.includes(`-----BEGIN ${label}-----`));
}

function normalize(fileName) {
  return fileName.split(path.sep).join("/");
}

export function isJcsImplementation(fileName) {
  return normalize(fileName).includes("/packages/jcs/src/");
}

export function isProtocolHashSource(fileName) {
  return normalize(fileName).includes("/packages/protocol-core/src/");
}

export function isIdentityKeySource(fileName) {
  return normalize(fileName).includes("/packages/identity/src/");
}

function isStringArgument(node, text) {
  return node !== undefined && ts.isStringLiteral(node) && node.text === text;
}

function isVerifyOnlyUsage(node) {
  return (
    node !== undefined &&
    ts.isArrayLiteralExpression(node) &&
    node.elements.length === 1 &&
    isStringArgument(node.elements[0], "verify")
  );
}

function subtleMethodCall(subtleNode) {
  const member = subtleNode.parent;
  if (member === undefined || propertyName(member) === undefined || member.expression !== subtleNode) {
    return undefined;
  }
  const call = member.parent;
  if (call === undefined || !ts.isCallExpression(call) || call.expression !== member) {
    return undefined;
  }
  return { method: propertyName(member), call };
}

function checkSubtleAccess(violations, node, fileName, location) {
  const used = subtleMethodCall(node);
  if (used === undefined || !["digest", "importKey", "verify"].includes(used.method)) {
    add(
      violations,
      "subtle-site",
      `${location}: crypto.subtle may only be called directly as digest, importKey, or verify.`,
    );
    return;
  }
  if (used.method === "digest") {
    return;
  }
  if (!isIdentityKeySource(fileName)) {
    add(
      violations,
      "key-site",
      `${location}: Ed25519 public-key verification is only allowed in packages/identity/src.`,
    );
    return;
  }
  const args = used.call.arguments;
  if (used.method === "importKey") {
    if (
      args.length !== 5 ||
      !isStringArgument(args[0], "raw") ||
      !isStringArgument(args[2], "Ed25519") ||
      args[3]?.kind !== ts.SyntaxKind.FalseKeyword ||
      !isVerifyOnlyUsage(args[4])
    ) {
      add(
        violations,
        "key-import",
        `${location}: importKey may only import a raw Ed25519 public key, not extractable, for verify only.`,
      );
    }
    return;
  }
  if (args.length !== 4 || !isStringArgument(args[0], "Ed25519")) {
    add(
      violations,
      "verify-algorithm",
      `${location}: subtle.verify may only use the string literal "Ed25519".`,
    );
  }
}

function isAllowedImportKey(node, fileName) {
  const object = node.expression;
  return isIdentityKeySource(fileName) && object !== undefined && propertyName(object) === "subtle" && subtleMethodCall(object) !== undefined;
}

function propertyName(node) {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression !== undefined &&
    (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
  ) {
    return node.argumentExpression.text;
  }
  return undefined;
}

const globalObjectNames = new Set(["globalThis", "self", "window", "global"]);

function isCryptoReference(node) {
  if (ts.isIdentifier(node) && node.text === "crypto") {
    const parent = node.parent;
    if (parent === undefined) {
      return false;
    }
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
      return false;
    }
    if ((ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodSignature(parent) || ts.isMethodDeclaration(parent) || ts.isParameter(parent) || ts.isImportSpecifier(parent) || ts.isBindingElement(parent)) && parent.name === node) {
      return false;
    }
    return true;
  }
  return propertyName(node) === "crypto";
}

const reflectionNames = new Set(["getOwnPropertyDescriptor", "getOwnPropertyDescriptors", "getPrototypeOf", "setPrototypeOf", "defineProperty", "defineProperties"]);
const alwaysBannedMembers = new Set(["constructor", "__proto__", "__lookupGetter__", "__lookupSetter__", "__defineGetter__", "__defineSetter__", "call", "apply", "bind"]);
const globalNames = new Set(["globalThis", "global"]);

function isDeclarationName(node) {
  const parent = node.parent;
  if (parent === undefined) {
    return false;
  }
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return true;
  }
  return (
    (ts.isVariableDeclaration(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent)) &&
    parent.name === node
  );
}

export function isReflectionSource(fileName) {
  const normal = normalize(fileName);
  return ["/packages/jcs/src/", "/packages/jcs/test/", "/packages/a2a-ext-negotiation/src/", "/packages/a2a-ext-negotiation/test/"].some((dir) => normal.includes(dir));
}

function checkReflection(violations, node, fileName, location) {
  const member = propertyName(node);
  if (member !== undefined && alwaysBannedMembers.has(member)) {
    add(violations, "reflection-api", `${location}: ".${member}" can reach code or objects by an indirect path.`);
  }
  if (member !== undefined && reflectionNames.has(member) && !isReflectionSource(fileName)) {
    add(violations, "reflection-api", `${location}: Object.${member} is only allowed in @ix/jcs and @ix/a2a-ext-negotiation (source and tests), where it checks plain data.`);
  }
  if (ts.isIdentifier(node) && node.text === "Function" && !isDeclarationName(node)) {
    add(violations, "dynamic-code", `${location}: Function builds code from text.`);
  }
  if (ts.isIdentifier(node) && globalNames.has(node.text) && !isDeclarationName(node)) {
    const parent = node.parent;
    const leadsToCrypto = parent !== undefined && propertyName(parent) === "crypto" && parent.expression === node;
    if (!leadsToCrypto) {
      add(violations, "global-object", `${location}: ${node.text} may only be used as ${node.text}.crypto.subtle followed by an allowed call.`);
    }
  }
}

function checkDynamicEscapes(violations, node, location) {
  if (isCryptoReference(node)) {
    const parent = node.parent;
    const followedBySubtle = parent !== undefined && propertyName(parent) === "subtle" && parent.expression === node;
    if (!followedBySubtle) {
      add(violations, "subtle-site", `${location}: crypto may only be used as crypto.subtle followed by an allowed call.`);
    }
  }
  if (
    ts.isElementAccessExpression(node) &&
    propertyName(node) === undefined &&
    (isCryptoReference(unwrap(node.expression)) || (ts.isIdentifier(unwrap(node.expression)) && globalObjectNames.has(unwrap(node.expression).text)))
  ) {
    add(violations, "subtle-site", `${location}: computed access on a global object or crypto needs a literal key.`);
  }
  if (ts.isIdentifier(node) && node.text === "Reflect" && !(node.parent !== undefined && ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
    add(violations, "reflect-api", `${location}: Reflect can reach any property by a computed name. Use plain property access.`);
  }
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    const callee = unwrap(node.expression);
    if (ts.isIdentifier(callee) && (callee.text === "eval" || callee.text === "Function")) {
      add(violations, "dynamic-code", `${location}: ${callee.text} runs code built from text.`);
    }
    if (ts.isCallExpression(node)) {
      const isImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      const first = node.arguments[0];
      if ((isImport || isRequire) && (first === undefined || !ts.isStringLiteral(first))) {
        add(violations, "dynamic-import", `${location}: import() and require() need a string literal module name.`);
      }
    }
  }
}

export function isTestFile(fileName) {
  return normalize(fileName).split("/").includes("test");
}

function lineOf(source, node) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  return position.line + 1;
}

function unwrap(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function add(violations, reason, message) {
  violations.push({ reason, message });
}

function definedName(node) {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node)) &&
    node.name !== undefined &&
    ts.isIdentifier(node.name)
  ) {
    return node.name.text;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (
    (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) &&
    ts.isIdentifier(node.name)
  ) {
    return node.name.text;
  }
  return undefined;
}

function isEmptyFunctionBody(node) {
  return ts.isBlock(node) && node.statements.length === 0;
}

function isJsonStringifyCallee(expression) {
  const callee = unwrap(expression);
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(unwrap(callee.expression)) &&
    unwrap(callee.expression).text === "JSON" &&
    callee.name.text === "stringify"
  ) {
    return true;
  }
  if (
    ts.isElementAccessExpression(callee) &&
    ts.isIdentifier(unwrap(callee.expression)) &&
    unwrap(callee.expression).text === "JSON" &&
    callee.argumentExpression !== undefined &&
    ts.isStringLiteral(callee.argumentExpression) &&
    callee.argumentExpression.text === "stringify"
  ) {
    return true;
  }
  return false;
}

function moduleSpecifierText(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  return undefined;
}

function isRequireCall(node) {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  const callee = unwrap(node.expression);
  const isImport = callee.kind === ts.SyntaxKind.ImportKeyword;
  const isRequire = ts.isIdentifier(callee) && callee.text === "require";
  if (!isImport && !isRequire) {
    return undefined;
  }
  const first = node.arguments[0];
  if (first !== undefined && ts.isStringLiteral(first)) {
    return first.text;
  }
  return undefined;
}

function checkSpecifier(violations, specifier, location, context) {
  if (isBannedModule(specifier)) {
    add(
      violations,
      "banned-module",
      `${location}: import "${specifier}" is banned. Key handling and signing need a human security reviewer. Do not add a crypto library.`,
    );
    return;
  }
  if (specifier.startsWith(".")) {
    const resolved = path.resolve(path.dirname(context.fileName), specifier);
    const packageDir = path.resolve(context.packageDir);
    const inside =
      resolved === packageDir || resolved.startsWith(packageDir + path.sep);
    if (!inside) {
      add(
        violations,
        "escaped-relative-import",
        `${location}: relative import "${specifier}" leaves ${context.packageName}. Depend on a package instead.`,
      );
    }
    return;
  }
  if (specifier.startsWith("@ix/")) {
    const dependency = context.policy.packages[specifier];
    const importer = context.policy.packages[context.packageName];
    if (dependency === undefined || importer === undefined) {
      add(
        violations,
        "unknown-package",
        `${location}: ${specifier} is not in policy/boundaries.json.`,
      );
      return;
    }
    if (!context.declaredNames.has(specifier) || !importer.dependsOn.includes(specifier)) {
      add(
        violations,
        "undeclared",
        `${location}: ${context.packageName} imports ${specifier}, but that edge is not declared in both package.json and policy/boundaries.json.`,
      );
    }
    if (!layerAllows(importer.layer, dependency.layer)) {
      add(
        violations,
        "layer",
        `${location}: ${importer.layer} package ${context.packageName} cannot depend on ${dependency.layer} package ${specifier}.`,
      );
    }
    return;
  }
  if (specifier === "node:util" && isJcsImplementation(context.fileName)) {
    return;
  }
  const externalOk = context.isTest && specifier === "vitest";
  if (!externalOk) {
    add(
      violations,
      "external-import",
      `${location}: "${specifier}" is not allowed in ${context.packageName}. Packages import @ix/* packages only. Test files may import vitest.`,
    );
  }
}

function isProxyProbeImport(node) {
  if (!ts.isImportDeclaration(node)) {
    return false;
  }
  const clause = node.importClause;
  if (
    clause === undefined ||
    clause.name !== undefined ||
    clause.namedBindings === undefined ||
    !ts.isNamedImports(clause.namedBindings)
  ) {
    return false;
  }
  const names = clause.namedBindings.elements;
  return names.length === 1 && names[0].name.text === "types" && names[0].propertyName === undefined;
}

export function evaluateSource(input) {
  const violations = [];
  const source = ts.createSourceFile(
    input.fileName,
    input.text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const context = {
    fileName: input.fileName,
    packageDir: input.packageDir,
    packageName: input.packageName,
    policy: input.policy,
    declaredNames: input.declaredNames,
    isTest: isTestFile(input.fileName),
  };
  const jcsImplementation = isJcsImplementation(input.fileName);

  function visit(node) {
    const specifier = moduleSpecifierText(node) ?? isRequireCall(node);
    if (specifier !== undefined) {
      checkSpecifier(
        violations,
        specifier,
        `${normalize(input.fileName)}:${String(lineOf(source, node))}`,
        context,
      );
      if (specifier === "node:util" && jcsImplementation && !isProxyProbeImport(node)) {
        add(
          violations,
          "util-import",
          `${normalize(input.fileName)}:${String(lineOf(source, node))}: node:util in @ix/jcs may only be a static import { types }.`,
        );
      }
    }
    if (
      jcsImplementation &&
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "types" &&
      node.name.text !== "isProxy"
    ) {
      add(
        violations,
        "util-api",
        `${normalize(input.fileName)}:${String(lineOf(source, node))}: node:util types may only be used as types.isProxy.`,
      );
    }
    if (
      jcsImplementation &&
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "types"
    ) {
      const key = node.argumentExpression;
      if (key === undefined || !ts.isStringLiteral(key) || key.text !== "isProxy") {
        add(
          violations,
          "util-api",
          `${normalize(input.fileName)}:${String(lineOf(source, node))}: node:util types may only be used as types.isProxy.`,
        );
      }
    }
    if (ts.isCallExpression(node) && isJsonStringifyCallee(node.expression)) {
      if (!jcsImplementation) {
        add(
          violations,
          "json-stringify",
          `${normalize(input.fileName)}:${String(lineOf(source, node))}: JSON.stringify cannot canonicalize. Use canonicalize from @ix/jcs.`,
        );
      }
    }
    checkDynamicEscapes(violations, node, `${normalize(input.fileName)}:${String(lineOf(source, node))}`);
    checkReflection(violations, node, input.fileName, `${normalize(input.fileName)}:${String(lineOf(source, node))}`);
    const accessed = propertyName(node);
    if (accessed === "subtle") {
      checkSubtleAccess(violations, node, input.fileName, `${normalize(input.fileName)}:${String(lineOf(source, node))}`);
    }
    if (accessed !== undefined && bannedSigningNames.has(accessed) && !(accessed === "importKey" && isAllowedImportKey(node, input.fileName))) {
      add(
        violations,
        "signing-api",
        `${normalize(input.fileName)}:${String(lineOf(source, node))}: ".${accessed}" is a signing or key operation. Those stay refused.`,
      );
    }
    if (ts.isCallExpression(node)) {
      const called = propertyName(unwrap(node.expression));
      if (called === "digest") {
        const location = `${normalize(input.fileName)}:${String(lineOf(source, node))}`;
        if (!isProtocolHashSource(input.fileName)) {
          add(
            violations,
            "digest-site",
            `${location}: SHA-256 digest is only allowed in packages/protocol-core/src.`,
          );
        }
        const algorithm = node.arguments[0];
        if (
          algorithm === undefined ||
          !ts.isStringLiteral(algorithm) ||
          algorithm.text !== "SHA-256"
        ) {
          add(
            violations,
            "digest-algorithm",
            `${location}: digest algorithm must be the string literal "SHA-256".`,
          );
        }
      }
    }
    if (
      (ts.isWhileStatement(node) || ts.isDoStatement(node)) &&
      node.expression.kind === ts.SyntaxKind.TrueKeyword
    ) {
      add(
        violations,
        "unbounded-loop",
        `${normalize(input.fileName)}:${String(lineOf(source, node))}: unbounded loop. Retries need a limit.`,
      );
    }
    if (ts.isForStatement(node) && node.condition === undefined) {
      add(
        violations,
        "unbounded-loop",
        `${normalize(input.fileName)}:${String(lineOf(source, node))}: for loop without a condition. Retries need a limit.`,
      );
    }
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      add(
        violations,
        "swallowed-error",
        `${normalize(input.fileName)}:${String(lineOf(source, node))}: empty catch. Handle the error or let it fail.`,
      );
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(unwrap(node.expression))) {
      const access = unwrap(node.expression);
      if (ts.isIdentifier(access.name) && access.name.text === "catch") {
        const callback = node.arguments[0];
        if (
          callback !== undefined &&
          (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
          isEmptyFunctionBody(callback.body)
        ) {
          add(
            violations,
            "swallowed-error",
            `${normalize(input.fileName)}:${String(lineOf(source, node))}: empty .catch swallows the rejection.`,
          );
        }
      }
    }
    const name = definedName(node);
    if (name === "canonicalize" && !jcsImplementation) {
      add(
        violations,
        "canonicalize-defined",
        `${normalize(input.fileName)}:${String(lineOf(source, node))}: canonicalize is defined only in @ix/jcs. Import it from there.`,
      );
    }
    ts.forEachChild(node, visit);
  }

  visit(source);

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    input.text,
  );
  let kind = scanner.scan();
  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      const tokenPos = scanner.getTokenPos();
      const tokenText = scanner.getTokenText();
      if (!isPermittedLicenseHeader(input.text, tokenPos, tokenText)) {
        const position = source.getLineAndCharacterOfPosition(tokenPos);
        add(
          violations,
          "comment",
          `${normalize(input.fileName)}:${String(position.line + 1)}: package source cannot contain comments. The only exception is a leading /* SPDX-License-Identifier: Apache-2.0 */ header. Encode any other constraint in a type, a lint rule, or AGENTS.md.`,
        );
      }
    }
    kind = scanner.scan();
  }

  if (hasPrivateKeyBlock(input.text)) {
    add(
      violations,
      "private-key",
      `${normalize(input.fileName)}: private key material is not allowed in the tree.`,
    );
  }

  return violations;
}

function dependencySections(packageJson) {
  const sections = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  const found = [];
  for (const section of sections) {
    const block = packageJson[section];
    if (block === undefined || block === null || typeof block !== "object") {
      continue;
    }
    for (const [name, version] of Object.entries(block)) {
      found.push({ section, name, version });
    }
  }
  return found;
}

export function evaluatePackageManifest(packageName, packageJson, policy) {
  const violations = [];
  const entry = policy.packages[packageName];
  if (entry === undefined) {
    add(violations, "unknown-package", `${packageName} is not in policy/boundaries.json.`);
    return violations;
  }
  if (packageJson.imports !== undefined) {
    add(
      violations,
      "external-import",
      `${packageName}: package.json imports field is not allowed.`,
    );
  }
  const declared = dependencySections(packageJson);
  const declaredIx = [];
  for (const dependency of declared) {
    if (isBannedModule(dependency.name)) {
      add(
        violations,
        "banned-module",
        `${packageName}: dependency ${dependency.name} is banned until a human security reviewer accepts key handling.`,
      );
      continue;
    }
    if (!dependency.name.startsWith("@ix/")) {
      add(
        violations,
        "external-import",
        `${packageName}: external dependency ${dependency.name} is not allowed in T01. Add it only with a boundary change.`,
      );
      continue;
    }
    if (dependency.version !== "workspace:*") {
      add(
        violations,
        "undeclared",
        `${packageName}: ${dependency.name} must use version workspace:*.`,
      );
    }
    declaredIx.push(dependency.name);
    const dependencyEntry = policy.packages[dependency.name];
    if (dependencyEntry === undefined) {
      add(violations, "unknown-package", `${packageName} depends on unknown ${dependency.name}.`);
      continue;
    }
    if (!entry.dependsOn.includes(dependency.name)) {
      add(
        violations,
        "undeclared",
        `${packageName}: ${dependency.name} is not in dependsOn. Update policy/boundaries.json in the same change.`,
      );
    }
    if (!layerAllows(entry.layer, dependencyEntry.layer)) {
      add(
        violations,
        "layer",
        `${packageName}: ${entry.layer} cannot depend on ${dependencyEntry.layer} package ${dependency.name}.`,
      );
    }
  }
  for (const allowed of entry.dependsOn) {
    if (!declaredIx.includes(allowed)) {
      add(
        violations,
        "policy-drift",
        `${packageName}: policy allows ${allowed} but package.json does not depend on it.`,
      );
    }
  }
  return violations;
}

export function validatePolicy(policy) {
  const violations = [];
  const names = Object.keys(policy.packages);
  for (const name of names) {
    const entry = policy.packages[name];
    if (!Object.hasOwn(layers, entry.layer)) {
      add(violations, "layer", `${name}: unknown layer ${String(entry.layer)}.`);
    }
    const seen = new Set();
    for (const dependency of entry.dependsOn) {
      if (dependency === name) {
        add(violations, "layer", `${name} cannot depend on itself.`);
      }
      if (seen.has(dependency)) {
        add(violations, "policy-drift", `${name}: duplicate dependsOn entry ${dependency}.`);
      }
      seen.add(dependency);
      const target = policy.packages[dependency];
      if (target === undefined) {
        add(violations, "unknown-package", `${name} depends on unknown ${dependency}.`);
        continue;
      }
      if (!layerAllows(entry.layer, target.layer)) {
        add(
          violations,
          "layer",
          `${name}: policy edge ${entry.layer} -> ${target.layer} (${dependency}) is illegal.`,
        );
      }
    }
  }
  return violations;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walkFiles(directory) {
  const found = [];
  if (!fs.existsSync(directory)) {
    return found;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "artifacts" ||
      entry.name === ".git"
    ) {
      continue;
    }
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkFiles(full));
      continue;
    }
    if (textExtensions.has(path.extname(entry.name))) {
      found.push(full);
    }
  }
  return found;
}

function checkExampleConfigs(root) {
  const violations = [];
  const expected = [
    ["deploy/node/config.open.example.json", "open"],
    ["deploy/node/config.closed.example.json", "closed"],
  ];
  for (const [relativePath, mode] of expected) {
    const full = path.join(root, relativePath);
    if (!fs.existsSync(full)) {
      add(violations, "policy-drift", `${relativePath} is missing.`);
      continue;
    }
    let parsed;
    try {
      parsed = readJson(full);
    } catch {
      add(violations, "policy-drift", `${relativePath} is not valid JSON.`);
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      add(violations, "policy-drift", `${relativePath} must be a JSON object.`);
      continue;
    }
    const keys = Object.keys(parsed);
    if (keys.length !== 1 || keys[0] !== "mode" || parsed.mode !== mode) {
      add(
        violations,
        "policy-drift",
        `${relativePath} must be exactly { "mode": "${mode}" }.`,
      );
    }
  }
  return violations;
}

export function checkRepository(root) {
  const policy = readJson(path.join(root, "policy/boundaries.json"));
  const violations = validatePolicy(policy);
  const packagesDir = path.join(root, "packages");
  const onDisk = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const inPolicy = Object.values(policy.packages)
    .map((entry) => entry.dir.replace(/^packages\//, ""))
    .sort();
  if (onDisk.join("\n") !== inPolicy.join("\n")) {
    add(
      violations,
      "policy-drift",
      `packages on disk [${onDisk.join(", ")}] do not match policy [${inPolicy.join(", ")}].`,
    );
  }
  for (const [packageName, entry] of Object.entries(policy.packages)) {
    const packageDir = path.join(root, entry.dir);
    const manifestPath = path.join(packageDir, "package.json");
    if (!fs.existsSync(manifestPath)) {
      add(violations, "policy-drift", `${packageName}: missing ${entry.dir}/package.json.`);
      continue;
    }
    const manifest = readJson(manifestPath);
    if (manifest.name !== packageName) {
      add(
        violations,
        "policy-drift",
        `${entry.dir}/package.json name is ${String(manifest.name)}, expected ${packageName}.`,
      );
    }
    violations.push(...evaluatePackageManifest(packageName, manifest, policy));
    const declaredNames = new Set(
      dependencySections(manifest)
        .map((dependency) => dependency.name)
        .filter((name) => name.startsWith("@ix/")),
    );
    const sourceDir = path.join(packageDir, "src");
    const testDir = path.join(packageDir, "test");
    const files = [...walkFiles(sourceDir), ...walkFiles(testDir)];
    for (const fileName of files) {
      if (!fileName.endsWith(".ts")) {
        continue;
      }
      const text = fs.readFileSync(fileName, "utf8");
      violations.push(
        ...evaluateSource({
          text,
          fileName,
          packageDir,
          packageName,
          policy,
          declaredNames,
        }),
      );
    }
  }
  for (const fileName of walkFiles(root)) {
    if (normalize(fileName).includes("/packages/") && fileName.endsWith(".ts")) {
      continue;
    }
    const text = fs.readFileSync(fileName, "utf8");
    if (hasPrivateKeyBlock(text)) {
      add(
        violations,
        "private-key",
        `${path.relative(root, fileName)}: private key material is not allowed in the tree.`,
      );
    }
  }
  const rootManifest = readJson(path.join(root, "package.json"));
  for (const dependency of dependencySections(rootManifest)) {
    if (isBannedModule(dependency.name)) {
      add(
        violations,
        "banned-module",
        `root package.json dependency ${dependency.name} is banned until a human security reviewer accepts key handling.`,
      );
    }
  }
  violations.push(...checkExampleConfigs(root));
  return violations;
}

function fixturePolicy() {
  return {
    packages: {
      "@ix/jcs": { dir: "packages/jcs", layer: "core", dependsOn: [] },
      "@ix/protocol-core": {
        dir: "packages/protocol-core",
        layer: "core",
        dependsOn: ["@ix/jcs"],
      },
      "@ix/config": { dir: "packages/config", layer: "core", dependsOn: [] },
      "@ix/log": { dir: "packages/log", layer: "core", dependsOn: [] },
      "@ix/node": { dir: "packages/node", layer: "app", dependsOn: ["@ix/config"] },
      "@ix/ledger": { dir: "packages/ledger", layer: "app", dependsOn: [] },
      "@ix/adapters": { dir: "packages/adapters", layer: "adapter", dependsOn: ["@ix/config"] },
      "@ix/conformance": {
        dir: "packages/conformance",
        layer: "suite",
        dependsOn: [],
      },
    },
  };
}

function sourceCase(fileName, text, packageName, declared) {
  const policy = fixturePolicy();
  return evaluateSource({
    text,
    fileName,
    packageDir: path.posix.join("/virtual", policy.packages[packageName].dir),
    packageName,
    policy,
    declaredNames: new Set(declared),
  });
}

function assertReason(failures, label, violations, reason) {
  if (!violations.some((violation) => violation.reason === reason)) {
    failures.push(`${label}: expected ${reason}, got ${JSON.stringify(violations)}`);
  }
}

function assertClean(failures, label, violations) {
  if (violations.length > 0) {
    failures.push(`${label}: expected no violations, got ${JSON.stringify(violations)}`);
  }
}

export function runSelfTest() {
  const failures = [];
  const policy = fixturePolicy();
  let cases = 0;

  cases += 1;
  assertReason(
    failures,
    "core cannot import adapter",
    sourceCase(
      "/virtual/packages/jcs/src/index.ts",
      'import "@ix/adapters";\nexport const status = "stub" as const;\n',
      "@ix/jcs",
      ["@ix/adapters"],
    ),
    "layer",
  );

  cases += 1;
  const illegalPolicy = structuredClone(policy);
  illegalPolicy.packages["@ix/jcs"].dependsOn = ["@ix/node"];
  const policyViolations = validatePolicy(illegalPolicy);
  assertReason(failures, "policy rejects core to app", policyViolations, "layer");

  cases += 1;
  assertClean(
    failures,
    "adapter may import config",
    sourceCase(
      "/virtual/packages/adapters/src/index.ts",
      'import { isNodeMode } from "@ix/config";\nexport const ok = isNodeMode("open");\n',
      "@ix/adapters",
      ["@ix/config"],
    ),
  );

  cases += 1;
  assertReason(
    failures,
    "app cannot import app",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      'import "@ix/ledger";\nexport const status = "stub" as const;\n',
      "@ix/node",
      ["@ix/ledger"],
    ),
    "layer",
  );

  cases += 1;
  assertReason(
    failures,
    "suite cannot import adapter",
    sourceCase(
      "/virtual/packages/conformance/src/index.ts",
      'import "@ix/adapters";\nexport const status = "stub" as const;\n',
      "@ix/conformance",
      ["@ix/adapters"],
    ),
    "layer",
  );

  cases += 1;
  assertReason(
    failures,
    "crypto import is banned",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      'import { createHash } from "node:crypto";\nexport const hash = createHash;\n',
      "@ix/node",
      [],
    ),
    "banned-module",
  );

  cases += 1;
  assertReason(
    failures,
    "JSON.stringify outside jcs",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      'export const encoded = JSON.stringify({ b: 1, a: 2 });\n',
      "@ix/node",
      [],
    ),
    "json-stringify",
  );

  cases += 1;
  assertClean(
    failures,
    "JSON.stringify inside jcs src",
    sourceCase(
      "/virtual/packages/jcs/src/index.ts",
      'export const encoded = JSON.stringify({ b: 1, a: 2 });\n',
      "@ix/jcs",
      [],
    ),
  );

  cases += 1;
  assertReason(
    failures,
    "JSON.stringify in jcs tests",
    sourceCase(
      "/virtual/packages/jcs/test/canonicalize.test.ts",
      'import { expect, it } from "vitest";\nit("no", () => { expect(JSON.stringify(1)).toBe("1"); });\n',
      "@ix/jcs",
      [],
    ),
    "json-stringify",
  );

  cases += 1;
  assertReason(
    failures,
    "comment is rejected",
    sourceCase(
      "/virtual/packages/config/src/index.ts",
      'export const mode = "open";\n// hidden rule\n',
      "@ix/config",
      [],
    ),
    "comment",
  );

  cases += 1;
  assertClean(
    failures,
    "url and comment-like string are allowed",
    sourceCase(
      "/virtual/packages/config/src/index.ts",
      'export const spec = "https://w3id.org/a2a-job";\nexport const note = "not // a comment";\n',
      "@ix/config",
      [],
    ),
  );

  cases += 1;
  assertReason(
    failures,
    "while true is rejected",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      "export function spin(): void {\n  while (true) {\n    break;\n  }\n}\n",
      "@ix/node",
      [],
    ),
    "unbounded-loop",
  );

  cases += 1;
  assertReason(
    failures,
    "for(;;) is rejected",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      "export function spin(): void {\n  for (;;) {\n    break;\n  }\n}\n",
      "@ix/node",
      [],
    ),
    "unbounded-loop",
  );

  cases += 1;
  assertReason(
    failures,
    "relative import cannot escape the package",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      'import { mode } from "../../config/src/index";\nexport const value = mode;\n',
      "@ix/node",
      [],
    ),
    "escaped-relative-import",
  );

  cases += 1;
  assertClean(
    failures,
    "test may import its own src",
    sourceCase(
      "/virtual/packages/node/test/node.test.ts",
      'import { describe, expect, it } from "vitest";\nimport { nodeStatus } from "../src/index.js";\ndescribe("node", () => { it("stub", () => { expect(nodeStatus).toBe("stub"); }); });\n',
      "@ix/node",
      [],
    ),
  );

  cases += 1;
  assertReason(
    failures,
    "empty catch is rejected",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      'export function hide(): void {\n  try {\n    throw new Error("x");\n  } catch {\n  }\n}\n',
      "@ix/node",
      [],
    ),
    "swallowed-error",
  );

  cases += 1;
  assertReason(
    failures,
    "empty catch callback is rejected",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      "export function hide(task: Promise<unknown>): void {\n  task.catch(() => {});\n}\n",
      "@ix/node",
      [],
    ),
    "swallowed-error",
  );

  cases += 1;
  assertReason(
    failures,
    "second canonicalize is rejected",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      "export function canonicalize(value: unknown): string {\n  return typeof value;\n}\n",
      "@ix/node",
      [],
    ),
    "canonicalize-defined",
  );

  cases += 1;
  assertClean(
    failures,
    "protocol-core may digest SHA-256",
    sourceCase(
      "/virtual/packages/protocol-core/src/hash.ts",
      'export const digest = crypto.subtle.digest("SHA-256", new Uint8Array());\n',
      "@ix/protocol-core",
      [],
    ),
  );

  cases += 1;
  assertReason(
    failures,
    "SHA-1 digest is rejected",
    sourceCase(
      "/virtual/packages/protocol-core/src/hash.ts",
      'export const digest = crypto.subtle.digest("SHA-1", new Uint8Array());\n',
      "@ix/protocol-core",
      [],
    ),
    "digest-algorithm",
  );

  cases += 1;
  assertReason(
    failures,
    "digest outside protocol-core is rejected",
    sourceCase(
      "/virtual/packages/jcs/src/index.ts",
      'export const digest = crypto.subtle.digest("SHA-256", new Uint8Array());\n',
      "@ix/jcs",
      [],
    ),
    "digest-site",
  );

  cases += 1;
  assertReason(
    failures,
    "digest in a test is rejected",
    sourceCase(
      "/virtual/packages/protocol-core/test/hash.test.ts",
      'import { expect, it } from "vitest";\nit("no", () => { crypto.subtle.digest("SHA-256", new Uint8Array()); });\n',
      "@ix/protocol-core",
      [],
    ),
    "digest-site",
  );

  cases += 1;
  assertReason(
    failures,
    "subtle.sign is rejected",
    sourceCase(
      "/virtual/packages/protocol-core/src/hash.ts",
      'export const signed = crypto.subtle.sign("x", new Uint8Array());\n',
      "@ix/protocol-core",
      [],
    ),
    "signing-api",
  );

  cases += 1;
  assertReason(
    failures,
    "string-keyed exportKey is rejected",
    sourceCase(
      "/virtual/packages/identity/src/index.ts",
      'export const exported = crypto.subtle["exportKey"]("raw");\n',
      "@ix/config",
      [],
    ),
    "signing-api",
  );

  cases += 1;
  assertClean(
    failures,
    "identity may import a raw Ed25519 public key for verify and verify with it",
    sourceCase(
      "/virtual/packages/identity/src/signature.ts",
      'export const key = await crypto.subtle.importKey("raw", new Uint8Array(32), "Ed25519", false, ["verify"]);\nexport const ok = await crypto.subtle.verify("Ed25519", key, new Uint8Array(64), new Uint8Array());\n',
      "@ix/config",
      [],
    ),
  );

  for (const [label, code, reason] of [
    ["importKey for signing is rejected", 'await crypto.subtle.importKey("raw", new Uint8Array(32), "Ed25519", false, ["sign"]);', "key-import"],
    ["importKey of a private key format is rejected", 'await crypto.subtle.importKey("pkcs8", new Uint8Array(32), "Ed25519", false, ["verify"]);', "key-import"],
    ["extractable importKey is rejected", 'await crypto.subtle.importKey("raw", new Uint8Array(32), "Ed25519", true, ["verify"]);', "key-import"],
    ["importKey of another algorithm is rejected", 'await crypto.subtle.importKey("raw", new Uint8Array(32), "ECDSA", false, ["verify"]);', "key-import"],
    ["verify with another algorithm is rejected", 'await crypto.subtle.verify("ECDSA", key, sig, data);', "verify-algorithm"],
    ["an alias of crypto.subtle is rejected", "const subtle = crypto.subtle;", "subtle-site"],
    ["destructuring crypto.subtle is rejected", "const { verify } = crypto.subtle;", "subtle-site"],
    ["subtle.sign in identity is rejected", 'await crypto.subtle.sign("Ed25519", key, data);', "signing-api"],
    ["subtle.generateKey in identity is rejected", 'await crypto.subtle.generateKey("Ed25519", false, ["sign"]);', "signing-api"],
  ]) {
    cases += 1;
    assertReason(
      failures,
      label,
      sourceCase("/virtual/packages/identity/src/signature.ts", `${code}\n`, "@ix/config", []),
      reason,
    );
  }

  for (const [label, code, reason] of [
    ["Reflect.get on crypto is rejected", 'const subtle: unknown = Reflect.get(crypto, "subtle");', "reflect-api"],
    ["Reflect.apply is rejected", "Reflect.apply(make, subtle, []);", "reflect-api"],
    ["an alias of Reflect is rejected", "const r = Reflect;", "reflect-api"],
    ["eval is rejected", 'eval("x");', "dynamic-code"],
    ["the Function constructor is rejected", 'const f = new Function("return 1");', "dynamic-code"],
    ["a built import name is rejected", 'await import("node:" + "crypto");', "dynamic-import"],
    ["a template-literal key on crypto is rejected", "const k = crypto[`subtle`][`exportKey`];", "signing-api"],
    ["a built key on globalThis is rejected", 'const c = globalThis["cry" + "pto"];', "subtle-site"],
    ["passing crypto around is rejected", "const values = Object.values(crypto);", "subtle-site"],
    ["an alias of crypto is rejected", "const c = crypto;", "subtle-site"],
    ["globalThis.crypto without subtle is rejected", "const c = globalThis.crypto;", "subtle-site"],
  ]) {
    cases += 1;
    assertReason(
      failures,
      label,
      sourceCase("/virtual/packages/identity/src/signature.ts", `${code}\n`, "@ix/config", []),
      reason,
    );
  }

  for (const [label, code, reason] of [
    ["a crypto getter read through a property descriptor is rejected", 'const holder: unknown = Object.getOwnPropertyDescriptor(globalThis, "crypto")?.get?.call(globalThis);', "reflection-api"],
    ["getPrototypeOf outside the data checkers is rejected", "const proto: unknown = Object.getPrototypeOf(value);", "reflection-api"],
    ["an alias of globalThis is rejected", "const g = globalThis;", "global-object"],
    ["globalThis.Function is rejected", 'const f = new globalThis.Function("x");', "global-object"],
    ["a function constructor reached through .constructor is rejected", 'const f = (() => 1).constructor("x");', "reflection-api"],
    ["the async function constructor is rejected", "const f = Object.getPrototypeOf(async function () { return 1; }).constructor;", "reflection-api"],
    ["Function as a value is rejected", "const f = Function;", "dynamic-code"],
    [".call is rejected", "const r = make.call(inner, 1);", "reflection-api"],
    [".bind is rejected", "const r = make.bind(inner);", "reflection-api"],
    ["__proto__ access is rejected", "const p: unknown = value.__proto__;", "reflection-api"],
    ["the Node global object is rejected", "const g = global;", "global-object"],
  ]) {
    cases += 1;
    assertReason(
      failures,
      label,
      sourceCase("/virtual/packages/identity/src/signature.ts", `${code}\n`, "@ix/config", []),
      reason,
    );
  }

  cases += 1;
  assertClean(
    failures,
    "jcs may check plain data with getPrototypeOf and getOwnPropertyDescriptor",
    sourceCase(
      "/virtual/packages/jcs/src/canonicalize.ts",
      "export const plain = (value: object): boolean => Object.getPrototypeOf(value) === Object.prototype && Object.getOwnPropertyDescriptor(value, \"a\") !== undefined;\n",
      "@ix/jcs",
      [],
    ),
  );

  cases += 1;
  assertClean(
    failures,
    "globalThis.crypto.subtle.verify in identity is allowed",
    sourceCase(
      "/virtual/packages/identity/src/signature.ts",
      'export const ok = await globalThis.crypto.subtle.verify("Ed25519", key, sig, data);\n',
      "@ix/config",
      [],
    ),
  );

  for (const [label, file, pkg] of [
    ["subtle.verify outside identity is rejected", "/virtual/packages/node/src/index.ts", "@ix/node"],
    ["subtle.verify in an identity test is rejected", "/virtual/packages/identity/test/identity.test.ts", "@ix/config"],
  ]) {
    cases += 1;
    assertReason(
      failures,
      label,
      sourceCase(file, 'export const ok = await crypto.subtle.verify("Ed25519", key, sig, data);\n', pkg, []),
      "key-site",
    );
  }

  cases += 1;
  assertReason(
    failures,
    "importKey outside identity is rejected",
    sourceCase(
      "/virtual/packages/protocol-core/src/hash.ts",
      'export const key = await crypto.subtle.importKey("raw", new Uint8Array(32), "Ed25519", false, ["verify"]);\n',
      "@ix/protocol-core",
      [],
    ),
    "signing-api",
  );

  cases += 1;
  assertClean(
    failures,
    "jcs may define canonicalize",
    sourceCase(
      "/virtual/packages/jcs/src/index.ts",
      "export function canonicalize(value: unknown): string {\n  return typeof value;\n}\n",
      "@ix/jcs",
      [],
    ),
  );

  cases += 1;
  const marker = `-----BEGIN ${"PRIVATE KEY"}-----`;
  assertReason(
    failures,
    "private key block is rejected",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      `export const leaked = ${JSON.stringify(marker)};\n`,
      "@ix/node",
      [],
    ),
    "private-key",
  );

  cases += 1;
  assertReason(
    failures,
    "undeclared workspace import is rejected",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      'import { recordKinds } from "@ix/log";\nexport const kinds = recordKinds;\n',
      "@ix/node",
      [],
    ),
    "undeclared",
  );

  cases += 1;
  assertClean(
    failures,
    "jcs may import node:util types for isProxy",
    sourceCase(
      "/virtual/packages/jcs/src/canonicalize.ts",
      'import { types } from "node:util";\nexport const proxy = types.isProxy;\n',
      "@ix/jcs",
      [],
    ),
  );

  cases += 1;
  assertReason(
    failures,
    "node:util outside jcs is rejected",
    sourceCase(
      "/virtual/packages/protocol-core/src/hash.ts",
      'import { types } from "node:util";\nexport const proxy = types.isProxy;\n',
      "@ix/protocol-core",
      [],
    ),
    "external-import",
  );

  cases += 1;
  assertReason(
    failures,
    "node:util import other than types is rejected",
    sourceCase(
      "/virtual/packages/jcs/src/canonicalize.ts",
      'import { promisify } from "node:util";\nexport const wait = promisify;\n',
      "@ix/jcs",
      [],
    ),
    "util-import",
  );

  cases += 1;
  assertReason(
    failures,
    "node:util types.isMap is rejected",
    sourceCase(
      "/virtual/packages/jcs/src/canonicalize.ts",
      'import { types } from "node:util";\nexport const map = types.isMap({});\n',
      "@ix/jcs",
      [],
    ),
    "util-api",
  );

  cases += 1;
  assertReason(
    failures,
    "node builtin in src is rejected",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      'import fs from "node:fs";\nexport const read = fs.readFileSync;\n',
      "@ix/node",
      [],
    ),
    "external-import",
  );

  cases += 1;
  assertClean(
    failures,
    "leading spdx header is allowed",
    sourceCase(
      "/virtual/packages/config/src/index.ts",
      '/* SPDX-License-Identifier: Apache-2.0 */\nexport const mode = "open" as const;\n',
      "@ix/config",
      [],
    ),
  );

  cases += 1;
  assertClean(
    failures,
    "shebang plus spdx header is allowed",
    sourceCase(
      "/virtual/packages/config/src/index.ts",
      '#!/usr/bin/env node\n/* SPDX-License-Identifier: Apache-2.0 */\nexport const mode = "open" as const;\n',
      "@ix/config",
      [],
    ),
  );

  cases += 1;
  assertReason(
    failures,
    "spdx line comment is rejected",
    sourceCase(
      "/virtual/packages/config/src/index.ts",
      '// SPDX-License-Identifier: Apache-2.0\nexport const mode = "open" as const;\n',
      "@ix/config",
      [],
    ),
    "comment",
  );

  cases += 1;
  assertReason(
    failures,
    "spdx header after code is rejected",
    sourceCase(
      "/virtual/packages/config/src/index.ts",
      'export const mode = "open" as const;\n/* SPDX-License-Identifier: Apache-2.0 */\n',
      "@ix/config",
      [],
    ),
    "comment",
  );

  cases += 1;
  assertReason(
    failures,
    "spdx header with extra prose is rejected",
    sourceCase(
      "/virtual/packages/config/src/index.ts",
      "/* SPDX-License-Identifier: Apache-2.0\n   extra note\n*/\nexport const mode = \"open\" as const;\n",
      "@ix/config",
      [],
    ),
    "comment",
  );

  cases += 1;
  assertReason(
    failures,
    "starred spdx header is rejected",
    sourceCase(
      "/virtual/packages/config/src/index.ts",
      "/*\n * SPDX-License-Identifier: Apache-2.0\n */\nexport const mode = \"open\" as const;\n",
      "@ix/config",
      [],
    ),
    "comment",
  );

  cases += 1;
  assertReason(
    failures,
    "other spdx identifier is rejected",
    sourceCase(
      "/virtual/packages/config/src/index.ts",
      '/* SPDX-License-Identifier: MIT */\nexport const mode = "open" as const;\n',
      "@ix/config",
      [],
    ),
    "comment",
  );

  cases += 1;
  assertReason(
    failures,
    "comment after a valid header is rejected",
    sourceCase(
      "/virtual/packages/config/src/index.ts",
      '/* SPDX-License-Identifier: Apache-2.0 */\nexport const mode = "open" as const;\n// tail\n',
      "@ix/config",
      [],
    ),
    "comment",
  );

  cases += 1;
  assertClean(
    failures,
    "word signature is not a key",
    sourceCase(
      "/virtual/packages/node/src/index.ts",
      'export const topic = "signature";\n',
      "@ix/node",
      [],
    ),
  );

  cases += 1;
  const manifestViolations = evaluatePackageManifest(
    "@ix/node",
    {
      dependencies: {
        "@ix/config": "workspace:*",
        jose: "^5.0.0",
      },
    },
    policy,
  );
  assertReason(failures, "manifest crypto dependency is banned", manifestViolations, "banned-module");

  return { ok: failures.length === 0, failures, cases };
}
