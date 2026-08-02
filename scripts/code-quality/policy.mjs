import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import ts from "typescript";

export const DEFAULT_POLICY = Object.freeze({
  sourceRoots: ["app", "components", "features", "hooks", "lib"],
  rootFiles: [
    "instrumentation.ts",
    "instrumentation-client.ts",
    "middleware.ts",
    "proxy.ts",
  ],
  thresholds: Object.freeze({
    typescriptLines: 400,
    tsxLines: 250,
    functionLines: 60,
    complexity: 15,
    nestingDepth: 4,
  }),
  excludedExactPaths: new Set([
    "features/cabinetry/presetData.ts",
    "lib/catalog/data.ts",
    "lib/catalog-presets/index.ts",
    "lib/fixture-lighting-defaults.ts",
    "lib/nippon-paint-colours.ts",
  ]),
});

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const GENERATED_FILE_PATTERN = /(?:^|[./-])generated(?:[./-]|$)/i;
const FIXTURE_FILE_PATTERN = /(?:^|[./-])fixtures?(?:[./-]|$)/i;
const SNAPSHOT_ARTIFACT_PATTERN = /(?:^|\/)__snapshots__(?:\/|$)|\.snap$/i;
const LINT_SUPPRESSION_PATTERN = /^\/(?:\/|\*)\s*eslint-disable(?:-next-line|-line)?\b(?:\s+([^\r\n*]*))?/;
const INLINE_ESLINT_CONFIG_PATTERN = /^\/\*\s*eslint\s+([^\r\n*]+)/;
const TYPESCRIPT_SUPPRESSION_PATTERN = /^\/(?:\/|\*)\s*@ts-(?:ignore|expect-error|nocheck)\b/;

function projectPath(root, absolutePath) {
  return relative(root, absolutePath).split(sep).join("/");
}

function isExcluded(relativePath, policy) {
  if (policy.excludedExactPaths.has(relativePath)) return true;
  if (relativePath.includes("/generated/")) return true;
  if (relativePath.includes("/__fixtures__/")) return true;
  return GENERATED_FILE_PATTERN.test(relativePath) ||
    FIXTURE_FILE_PATTERN.test(relativePath) ||
    SNAPSHOT_ARTIFACT_PATTERN.test(relativePath);
}

export function isMeasuredProductionPath(relativePath, policy = DEFAULT_POLICY) {
  const extension = extname(relativePath);
  if (!SOURCE_EXTENSIONS.has(extension) || relativePath.endsWith(".d.ts")) return false;
  const belongsToRoot = policy.sourceRoots.some((root) => relativePath.startsWith(`${root}/`)) ||
    policy.rootFiles.includes(relativePath);
  return belongsToRoot && !isExcluded(relativePath, policy);
}

function walk(directory, result) {
  for (const entry of readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, result);
    } else if (
      SOURCE_EXTENSIONS.has(extname(entry.name)) &&
      !entry.name.endsWith(".d.ts")
    ) {
      result.push(absolutePath);
    }
  }
}

function discoverSourceFiles(root, policy) {
  const files = [];
  for (const sourceRoot of policy.sourceRoots) {
    const absoluteRoot = join(root, sourceRoot);
    if (existsSync(absoluteRoot)) walk(absoluteRoot, files);
  }
  for (const rootFile of policy.rootFiles) {
    const absolutePath = join(root, rootFile);
    if (existsSync(absolutePath)) files.push(absolutePath);
  }
  return [...new Set(files.map((file) => resolve(file)))]
    .sort((left, right) => projectPath(root, left).localeCompare(projectPath(root, right)));
}

export function physicalLineCount(source) {
  if (source.length === 0) return 0;
  const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const newlineCount = normalized.match(/\n/g)?.length ?? 0;
  return normalized.endsWith("\n") ? newlineCount : newlineCount + 1;
}

function lineLimit(relativePath, policy) {
  return relativePath.endsWith(".tsx")
    ? policy.thresholds.tsxLines
    : policy.thresholds.typescriptLines;
}

function isFunctionNode(node) {
  return ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node);
}

function addsComplexity(node) {
  if (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node) ||
    ts.isCaseClause(node)
  ) return true;
  return ts.isBinaryExpression(node) && [
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
  ].includes(node.operatorToken.kind);
}

function addsNesting(node) {
  return ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isCatchClause(node);
}

function measureFunction(node, sourceFile) {
  const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
  const endPosition = Math.max(node.getStart(sourceFile), node.getEnd() - 1);
  const endLine = sourceFile.getLineAndCharacterOfPosition(endPosition).line;
  let complexity = 1;
  let maximumNesting = 0;

  function visit(child, nesting) {
    if (child !== node && isFunctionNode(child)) return;
    if (addsComplexity(child)) complexity += 1;
    const nextNesting = nesting + (addsNesting(child) ? 1 : 0);
    maximumNesting = Math.max(maximumNesting, nextNesting);
    ts.forEachChild(child, (descendant) => visit(descendant, nextNesting));
  }

  if (node.body) visit(node.body, 0);
  return {
    lines: endLine - startLine + 1,
    complexity,
    nestingDepth: maximumNesting,
  };
}

function metricSummary(values, threshold) {
  const violations = values.filter((value) => value > threshold);
  if (violations.length === 0) return null;
  return {
    count: violations.length,
    maximum: Math.max(...violations),
  };
}

function sourceComments(source, sourceFile) {
  const comments = new Map();
  const addRanges = (ranges) => {
    for (const range of ranges ?? []) {
      comments.set(`${range.pos}:${range.end}`, {
        start: range.pos,
        end: range.end,
        text: source.slice(range.pos, range.end),
      });
    }
  };

  function visit(node) {
    addRanges(ts.getLeadingCommentRanges(source, node.pos));
    addRanges(ts.getLeadingCommentRanges(source, node.getFullStart()));
    addRanges(ts.getTrailingCommentRanges(source, node.end));
    if (ts.isJsxExpression(node) && !node.expression) {
      const nodeSource = source.slice(node.getStart(sourceFile), node.getEnd());
      for (const match of nodeSource.matchAll(/\/\*[\s\S]*?\*\//g)) {
        const start = node.getStart(sourceFile) + match.index;
        comments.set(`${start}:${start + match[0].length}`, {
          start,
          end: start + match[0].length,
          text: match[0],
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...comments.values()].sort((left, right) => left.start - right.start);
}

function lintSuppressions(comments) {
  const rules = new Map();
  const addRule = (rule) => rules.set(rule, (rules.get(rule) ?? 0) + 1);
  for (const comment of comments) {
    const match = comment.text.match(LINT_SUPPRESSION_PATTERN);
    if (!match) continue;
    const payload = (match[1] ?? "")
      .split(/(?:^|\s+)--(?:\s+|$)/)[0]
      .trim();
    const disabledRules = payload
      ? payload.split(/[\s,]+/).filter(Boolean)
      : ["*"];
    for (const rule of disabledRules) addRule(rule);
  }

  for (const comment of comments) {
    const match = comment.text.match(INLINE_ESLINT_CONFIG_PATTERN);
    if (!match) continue;
    const payload = match[1] ?? "";
    const disabledRulePattern = /["']?([@\w/-]+)["']?\s*:\s*(?:\[\s*)?(?:0|off|["']off["'])(?![\w])/g;
    for (const ruleMatch of payload.matchAll(disabledRulePattern)) {
      addRule(ruleMatch[1]);
    }
  }
  return sortedObject(rules.entries());
}

function inspectSource(source, relativePath, policy) {
  const scriptKind = relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  const comments = sourceComments(source, sourceFile);
  const functions = [];
  let explicitAnyCount = 0;

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) explicitAnyCount += 1;
    if (isFunctionNode(node) && node.body) functions.push(measureFunction(node, sourceFile));
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  const suppressionRules = lintSuppressions(comments);

  const functionMetrics = {};
  const overlong = metricSummary(
    functions.map((entry) => entry.lines),
    policy.thresholds.functionLines
  );
  const complex = metricSummary(
    functions.map((entry) => entry.complexity),
    policy.thresholds.complexity
  );
  const nested = metricSummary(
    functions.map((entry) => entry.nestingDepth),
    policy.thresholds.nestingDepth
  );
  if (overlong) functionMetrics.overlongFunctions = overlong;
  if (complex) functionMetrics.complexFunctions = complex;
  if (nested) functionMetrics.deeplyNestedFunctions = nested;

  return {
    explicitAnyCount,
    functionMetrics,
    lintSuppressions: suppressionRules,
    lintSuppressionCount: Object.values(suppressionRules)
      .reduce((total, count) => total + count, 0),
    typescriptSuppressionCount: comments
      .filter((comment) => TYPESCRIPT_SUPPRESSION_PATTERN.test(comment.text)).length,
  };
}

function runtimeSpecifiers(source, relativePath) {
  const emittedSource = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      verbatimModuleSyntax: false,
    },
    fileName: relativePath,
  }).outputText;
  const emittedPath = relativePath
    .replace(/\.tsx$/, ".jsx")
    .replace(/\.ts$/, ".js");
  const sourceFile = ts.createSourceFile(
    emittedPath,
    emittedSource,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS
  );
  const specifiers = new Set();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const isRuntime = !clause || (!clause.isTypeOnly && (
        Boolean(clause.name) ||
        !clause.namedBindings ||
        ts.isNamespaceImport(clause.namedBindings) ||
        clause.namedBindings.elements.some((element) => !element.isTypeOnly)
      ));
      if (isRuntime && ts.isStringLiteral(statement.moduleSpecifier)) {
        specifiers.add(statement.moduleSpecifier.text);
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const hasRuntimeExport = !statement.isTypeOnly && (
        !statement.exportClause ||
        ts.isNamespaceExport(statement.exportClause) ||
        statement.exportClause.elements.some((element) => !element.isTypeOnly)
      );
      if (hasRuntimeExport) specifiers.add(statement.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression &&
      ts.isStringLiteral(statement.moduleReference.expression)
    ) {
      specifiers.add(statement.moduleReference.expression.text);
    }
  }

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...specifiers];
}

function resolveLocalImport(root, importer, specifier, fileSet) {
  let base;
  if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(importer), specifier);
  else return null;

  const withoutJsExtension = /\.[cm]?jsx?$/.test(base)
    ? base.replace(/\.[cm]?jsx?$/, "")
    : base;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${withoutJsExtension}.ts`,
    `${withoutJsExtension}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    const resolved = resolve(candidate);
    if (fileSet.has(resolved)) return resolved;
  }
  return null;
}

function findCycles(root, files, sources) {
  const fileSet = new Set(files);
  const graph = new Map(files.map((file) => [
    file,
    runtimeSpecifiers(sources.get(file), projectPath(root, file))
      .map((specifier) => resolveLocalImport(root, file, specifier, fileSet))
      .filter(Boolean),
  ]));
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(file, path) {
    if (visiting.has(file)) {
      const start = path.indexOf(file);
      cycles.push([...path.slice(start), file].map((entry) => projectPath(root, entry)));
      return;
    }
    if (visited.has(file)) return;
    visiting.add(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency, [...path, file]);
    visiting.delete(file);
    visited.add(file);
  }
  for (const file of files) visit(file, []);
  return cycles;
}

export function scanRepository(root, policy = DEFAULT_POLICY) {
  const absoluteRoot = resolve(root);
  const allFiles = discoverSourceFiles(absoluteRoot, policy);
  const sources = new Map(allFiles.map((file) => [file, readFileSync(file, "utf8")]));
  const files = [];
  const measuredFiles = [];

  for (const absolutePath of allFiles) {
    const relativePath = projectPath(absoluteRoot, absolutePath);
    if (!isMeasuredProductionPath(relativePath, policy)) continue;
    measuredFiles.push(absolutePath);
    const source = sources.get(absolutePath);
    files.push({
      path: relativePath,
      lines: physicalLineCount(source),
      lineLimit: lineLimit(relativePath, policy),
      ...inspectSource(source, relativePath, policy),
    });
  }

  return {
    files,
    runtimeCycles: findCycles(absoluteRoot, measuredFiles, sources),
    thresholds: { ...policy.thresholds },
  };
}

function sortedObject(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

export function createBaseline(scan) {
  return {
    schemaVersion: 1,
    thresholds: scan.thresholds,
    oversizedFiles: sortedObject(scan.files
      .filter((file) => file.lines > file.lineLimit)
      .map((file) => [file.path, { lines: file.lines, limit: file.lineLimit }])),
    functionMetrics: sortedObject(scan.files
      .filter((file) => Object.keys(file.functionMetrics).length > 0)
      .map((file) => [file.path, file.functionMetrics])),
    lintSuppressions: sortedObject(scan.files
      .filter((file) => file.lintSuppressionCount > 0)
      .map((file) => [file.path, file.lintSuppressions])),
  };
}

export function compareBaselineMonotonicity(previous, current) {
  if (!previous) return [];
  const failures = [];
  if (
    previous.schemaVersion !== current.schemaVersion ||
    !sameThresholds(previous.thresholds, current.thresholds) ||
    !sameThresholds(current.thresholds, previous.thresholds)
  ) {
    failures.push({
      code: "BASELINE_POLICY_CHANGED",
      message: "baseline schema or thresholds changed; use a separately reviewed policy migration, not a debt update.",
    });
  }

  for (const [path, accepted] of Object.entries(current.oversizedFiles ?? {})) {
    const prior = previous.oversizedFiles?.[path];
    if (!prior) {
      failures.push({
        code: "BASELINE_RAISED",
        path,
        message: "a new oversized-file baseline was added; use a dated exception instead.",
      });
    } else if (accepted.lines > prior.lines || accepted.limit !== prior.limit) {
      failures.push({
        code: "BASELINE_RAISED",
        path,
        message: `oversized-file baseline changed from ${prior.lines}/${prior.limit} to ${accepted.lines}/${accepted.limit}; baselines may only decrease.`,
      });
    }
  }

  for (const [path, metrics] of Object.entries(current.functionMetrics ?? {})) {
    for (const [name, accepted] of Object.entries(metrics)) {
      const prior = previous.functionMetrics?.[path]?.[name];
      if (!prior) {
        failures.push({
          code: "BASELINE_RAISED",
          path,
          message: `a new ${name} baseline was added; use a dated exception instead.`,
        });
      } else if (accepted.count > prior.count || accepted.maximum > prior.maximum) {
        failures.push({
          code: "BASELINE_RAISED",
          path,
          message: `${name} baseline changed from count ${prior.count}, max ${prior.maximum} to count ${accepted.count}, max ${accepted.maximum}; baselines may only decrease.`,
        });
      }
    }
  }

  for (const [path, acceptedRules] of Object.entries(current.lintSuppressions ?? {})) {
    for (const [rule, accepted] of Object.entries(acceptedRules)) {
      const prior = previous.lintSuppressions?.[path]?.[rule];
      if (prior === undefined || accepted > prior) {
        failures.push({
          code: "BASELINE_RAISED",
          path,
          message: `${rule} lint-suppression baseline changed from ${prior ?? 0} to ${accepted}; baselines may only decrease.`,
        });
      }
    }
  }
  return failures;
}

export function validateExceptions(exceptions, today = new Date()) {
  const failures = [];
  if (
    !exceptions ||
    exceptions.schemaVersion !== 1 ||
    !exceptions.files ||
    typeof exceptions.files !== "object" ||
    Array.isArray(exceptions.files)
  ) {
    return [{ code: "INVALID_EXCEPTIONS", message: "exceptions.json must use schemaVersion 1 and a files object." }];
  }
  const currentDate = today.toISOString().slice(0, 10);
  for (const [path, exception] of Object.entries(exceptions.files)) {
    if (!exception || typeof exception !== "object" || Array.isArray(exception)) {
      failures.push({ code: "INVALID_EXCEPTION", path, message: "exception must be an object." });
      continue;
    }
    for (const field of ["reason", "owner", "review", "expiresOn"]) {
      if (typeof exception[field] !== "string" || exception[field].trim().length === 0) {
        failures.push({
          code: "INVALID_EXCEPTION",
          path,
          message: `exception field ${field} must be a non-empty string.`,
        });
      }
    }
    const expiry = exception.expiresOn ?? "";
    const parsedExpiry = new Date(`${expiry}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expiry) ||
      Number.isNaN(parsedExpiry.valueOf()) ||
      parsedExpiry.toISOString().slice(0, 10) !== expiry
    ) {
      failures.push({ code: "INVALID_EXCEPTION", path, message: "expiresOn must use YYYY-MM-DD." });
    } else if (expiry < currentDate) {
      failures.push({ code: "EXPIRED_EXCEPTION", path, message: `exception expired on ${expiry}.` });
    }
    if (!exception.allow || typeof exception.allow !== "object" || Array.isArray(exception.allow)) {
      failures.push({ code: "INVALID_EXCEPTION", path, message: "exception must define an allow object." });
      continue;
    }
    const allowedKeys = new Set([
      "lines",
      "overlongFunctions",
      "complexFunctions",
      "deeplyNestedFunctions",
    ]);
    const allowEntries = Object.entries(exception.allow);
    if (allowEntries.length === 0) {
      failures.push({ code: "INVALID_EXCEPTION", path, message: "exception allow object must not be empty." });
    }
    for (const [name, allowance] of allowEntries) {
      if (!allowedKeys.has(name)) {
        failures.push({ code: "INVALID_EXCEPTION", path, message: `unknown allowance ${name}.` });
      } else if (name === "lines") {
        if (!Number.isSafeInteger(allowance) || allowance < 1) {
          failures.push({ code: "INVALID_EXCEPTION", path, message: "lines allowance must be a positive integer." });
        }
      } else if (
        !allowance ||
        !Number.isSafeInteger(allowance.count) ||
        allowance.count < 1 ||
        !Number.isSafeInteger(allowance.maximum) ||
        allowance.maximum < 1
      ) {
        failures.push({
          code: "INVALID_EXCEPTION",
          path,
          message: `${name} allowance must define positive integer count and maximum values.`,
        });
      }
    }
  }
  return failures;
}

function sameThresholds(left, right) {
  return Boolean(right && typeof right === "object") &&
    Object.keys(right).every((key) => left?.[key] === right[key]);
}

function metricState(metrics, name, threshold) {
  return metrics?.[name] ?? { count: 0, maximum: threshold };
}

function isWithinMetric(current, allowed) {
  return current.count <= allowed.count && current.maximum <= allowed.maximum;
}

function allowedByException(exception, name, current) {
  const allowed = exception?.allow?.[name];
  return Boolean(allowed && isWithinMetric(current, allowed));
}

export function evaluateScan(scan, baseline, exceptions, today) {
  const failures = [...validateExceptions(exceptions, today)];
  if (
    !baseline ||
    baseline.schemaVersion !== 1 ||
    !sameThresholds(baseline.thresholds, scan.thresholds) ||
    !baseline.oversizedFiles ||
    !baseline.functionMetrics ||
    !baseline.lintSuppressions
  ) {
    failures.push({
      code: "INVALID_BASELINE",
      message: "baseline schema or thresholds do not match the active code-quality policy.",
    });
    return failures;
  }

  const files = new Map(scan.files.map((file) => [file.path, file]));
  const exceptionFiles = exceptions?.files && !Array.isArray(exceptions.files)
    ? exceptions.files
    : {};

  for (const file of scan.files) {
    const accepted = baseline.oversizedFiles[file.path];
    const exception = exceptionFiles[file.path];
    if (file.lines > file.lineLimit) {
      if (!accepted) {
        if (!(exception?.allow?.lines >= file.lines)) {
          failures.push({
            code: "NEW_OVERSIZED_FILE",
            path: file.path,
            message: `${file.lines} lines exceeds the ${file.lineLimit}-line limit and has no accepted baseline.`,
          });
        }
      } else if (file.lines > accepted.lines && !(exception?.allow?.lines >= file.lines)) {
        failures.push({
          code: "OVERSIZED_FILE_GROWTH",
          path: file.path,
          message: `${file.lines} lines exceeds the accepted ${accepted.lines}-line baseline (normal limit ${file.lineLimit}).`,
        });
      } else if (file.lines < accepted.lines) {
        failures.push({
          code: "BASELINE_CAN_DECREASE",
          path: file.path,
          message: `${file.lines} lines is below the accepted ${accepted.lines}; run npm run check:code-quality:baseline.`,
        });
      }
    } else if (accepted) {
      failures.push({
        code: "BASELINE_CAN_DECREASE",
        path: file.path,
        message: `${file.lines} lines is now within the ${file.lineLimit}-line limit; remove its accepted baseline.`,
      });
    }

    for (const [name, threshold] of [
      ["overlongFunctions", scan.thresholds.functionLines],
      ["complexFunctions", scan.thresholds.complexity],
      ["deeplyNestedFunctions", scan.thresholds.nestingDepth],
    ]) {
      const current = metricState(file.functionMetrics, name, threshold);
      const acceptedMetric = metricState(baseline.functionMetrics[file.path], name, threshold);
      if (!isWithinMetric(current, acceptedMetric) && !allowedByException(exception, name, current)) {
        failures.push({
          code: "FUNCTION_METRIC_GROWTH",
          path: file.path,
          message: `${name} grew to count ${current.count}, max ${current.maximum}; accepted count ${acceptedMetric.count}, max ${acceptedMetric.maximum}.`,
        });
      } else if (
        baseline.functionMetrics[file.path]?.[name] &&
        (current.count < acceptedMetric.count || current.maximum < acceptedMetric.maximum)
      ) {
        failures.push({
          code: "BASELINE_CAN_DECREASE",
          path: file.path,
          message: `${name} improved to count ${current.count}, max ${current.maximum}; lower the accepted baseline.`,
        });
      }
    }

    const acceptedSuppressions = baseline.lintSuppressions[file.path] ?? {};
    for (const rule of new Set([
      ...Object.keys(acceptedSuppressions),
      ...Object.keys(file.lintSuppressions),
    ])) {
      const acceptedCount = acceptedSuppressions[rule] ?? 0;
      const currentCount = file.lintSuppressions[rule] ?? 0;
      if (currentCount > acceptedCount) {
        failures.push({
          code: "NEW_LINT_SUPPRESSION",
          path: file.path,
          message: `${rule} lint suppressions grew from ${acceptedCount} to ${currentCount}.`,
        });
      } else if (currentCount < acceptedCount) {
        failures.push({
          code: "BASELINE_CAN_DECREASE",
          path: file.path,
          message: `${rule} lint suppressions fell from ${acceptedCount} to ${currentCount}; lower the accepted baseline.`,
        });
      }
    }
    if (file.explicitAnyCount > 0) {
      failures.push({
        code: "EXPLICIT_ANY",
        path: file.path,
        message: `found ${file.explicitAnyCount} explicit any type${file.explicitAnyCount === 1 ? "" : "s"}.`,
      });
    }
    if (file.typescriptSuppressionCount > 0) {
      failures.push({
        code: "TYPESCRIPT_SUPPRESSION",
        path: file.path,
        message: "@ts-ignore, @ts-expect-error, and @ts-nocheck are not allowed in production source.",
      });
    }
  }

  for (const path of new Set([
    ...Object.keys(baseline.oversizedFiles),
    ...Object.keys(baseline.functionMetrics),
    ...Object.keys(baseline.lintSuppressions),
  ])) {
    if (!files.has(path)) {
      failures.push({
        code: "BASELINE_CAN_DECREASE",
        path,
        message: "accepted baseline entry no longer maps to a measured production source file.",
      });
    }
  }

  for (const cycle of scan.runtimeCycles) {
    failures.push({
      code: "RUNTIME_CYCLE",
      path: cycle[0],
      message: cycle.join(" -> "),
    });
  }

  for (const path of Object.keys(exceptionFiles)) {
    const file = files.get(path);
    if (!file) {
      failures.push({
        code: "UNMAPPED_EXCEPTION",
        path,
        message: "exception does not map to a measured production source file.",
      });
      continue;
    }
    const exception = exceptionFiles[path];
    for (const name of Object.keys(exception?.allow ?? {})) {
      let isUsed = false;
      if (name === "lines") {
        const acceptedLines = baseline.oversizedFiles[path]?.lines ?? file.lineLimit;
        isUsed = file.lines > acceptedLines && exception.allow.lines >= file.lines;
      } else {
        const threshold = name === "overlongFunctions"
          ? scan.thresholds.functionLines
          : name === "complexFunctions"
            ? scan.thresholds.complexity
            : scan.thresholds.nestingDepth;
        const current = metricState(file.functionMetrics, name, threshold);
        const accepted = metricState(baseline.functionMetrics[path], name, threshold);
        isUsed = !isWithinMetric(current, accepted) &&
          allowedByException(exception, name, current);
      }
      if (!isUsed) {
        failures.push({
          code: "UNUSED_EXCEPTION_ALLOWANCE",
          path,
          message: `${name} allowance does not cover a current regression; remove it.`,
        });
      }
    }
  }

  return failures;
}

function lowerMetricBaseline(currentMetrics, acceptedMetrics) {
  const result = {};
  for (const name of [
    "overlongFunctions",
    "complexFunctions",
    "deeplyNestedFunctions",
  ]) {
    const current = currentMetrics?.[name];
    const accepted = acceptedMetrics?.[name];
    if (!current || !accepted) continue;
    result[name] = {
      count: Math.min(current.count, accepted.count),
      maximum: Math.min(current.maximum, accepted.maximum),
    };
  }
  return result;
}

export function updateBaseline(scan, baseline) {
  const updated = {
    schemaVersion: 1,
    thresholds: scan.thresholds,
    oversizedFiles: {},
    functionMetrics: {},
    lintSuppressions: {},
  };
  for (const file of scan.files) {
    const acceptedFile = baseline.oversizedFiles[file.path];
    if (acceptedFile && file.lines > file.lineLimit) {
      updated.oversizedFiles[file.path] = {
        lines: Math.min(file.lines, acceptedFile.lines),
        limit: file.lineLimit,
      };
    }
    const loweredMetrics = lowerMetricBaseline(
      file.functionMetrics,
      baseline.functionMetrics[file.path]
    );
    if (Object.keys(loweredMetrics).length > 0) {
      updated.functionMetrics[file.path] = loweredMetrics;
    }
    const acceptedSuppressions = baseline.lintSuppressions[file.path];
    if (acceptedSuppressions && file.lintSuppressionCount > 0) {
      const loweredSuppressions = {};
      for (const [rule, acceptedCount] of Object.entries(acceptedSuppressions)) {
        const currentCount = file.lintSuppressions[rule] ?? 0;
        if (currentCount > 0) {
          loweredSuppressions[rule] = Math.min(currentCount, acceptedCount);
        }
      }
      if (Object.keys(loweredSuppressions).length > 0) {
        updated.lintSuppressions[file.path] = loweredSuppressions;
      }
    }
  }
  updated.oversizedFiles = sortedObject(Object.entries(updated.oversizedFiles));
  updated.functionMetrics = sortedObject(Object.entries(updated.functionMetrics));
  updated.lintSuppressions = sortedObject(Object.entries(updated.lintSuppressions));
  return updated;
}

export function summarizeScan(scan, baseline) {
  const functionFiles = Object.keys(baseline.functionMetrics).length;
  const suppressionCount = Object.values(baseline.lintSuppressions)
    .flatMap((rules) => Object.values(rules))
    .reduce((total, count) => total + count, 0);
  return `${scan.files.length} production files; ` +
    `${Object.keys(baseline.oversizedFiles).length} oversized files baselined; ` +
    `${functionFiles} files with function-metric debt baselined; ` +
    `${suppressionCount} lint suppressions baselined; no static runtime cycles or unsafe TypeScript suppressions.`;
}
