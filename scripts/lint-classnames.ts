/**
 * className → CSS rule lint.
 *
 * Every class token applied through a JSX `className` must have a matching
 * class selector in the declared CSS files. Rationale (docs/PRINCIPLES.md):
 * a class name in markup is not evidence of styling — the 320px Playwright
 * smoke caught `li.exerciseCard` rendering with a max-content grid track,
 * and this lint closes the same gap statically: a `className` that no CSS
 * rule ever styles is a silent layout trap.
 *
 * Coverage:
 *  - `className="a b"`, `className={"a"}`, `className={`a ${x}`}`;
 *    in template literals a token glued to an interpolation edge
 *    (`syncBadge sync-${state}`) is a dynamic prefix and is skipped
 *  - ternaries and `+` concatenation recurse into result branches only, so
 *    `role === "user" ? "chatUser" : "chatCoach"` never flags `"user"`
 *  - clsx/cx/cn() call arguments
 *  - `className={ident}` resolves local `const ident = ...` initializers
 *
 * Not covered (skipped rather than flagged): fully dynamic names such as
 * `sync-${state}`, unresolvable expressions, and spread props.
 *
 * Run: npm run lint:classnames (wired into npm run lint).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export const CSS_FILES = ["src/styles.css"];

export const EXEMPT_CLASSES = new Set<string>([
  // (none yet) — add a token here only with a written rationale on the line
  // above it, e.g. a class consumed by a third-party script.
]);

export const BASELINE_FILE = "scripts/classname-lint-baseline.json";

/**
 * Pre-existing debt: classNames already in the app with no CSS rule. The
 * lint fails on anything NOT in this baseline; fixing (styling) a class
 * must shrink the baseline (`npm run lint:classnames -- --update-baseline`
 * rewrites it — run only when intentionally burning down debt).
 */
export function loadBaseline(root: string): Set<string> {
  const raw = JSON.parse(fs.readFileSync(path.join(root, BASELINE_FILE), "utf8")) as string[];
  return new Set(raw);
}

export function violationKey(v: { file: string; className: string }): string {
  return `${v.file}:${v.className}`;
}

export interface ClassUse {
  className: string;
  line: number;
  character: number;
}

export interface Violation extends ClassUse {
  file: string;
}

interface TokenPos {
  token: string;
  pos: number;
}

const CLASS_HELPERS = new Set(["clsx", "cx", "cn", "classNames"]);
const MAX_RESOLVE_DEPTH = 5;

/** All class selectors defined anywhere in the CSS (including descendants). */
export function cssClasses(css: string): Set<string> {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const defined = new Set<string>();
  for (const match of noComments.matchAll(/\.(-?[_a-zA-Z][A-Za-z0-9_-]*)/g)) {
    defined.add(match[1]);
  }
  return defined;
}

function wordTokens(text: string): string[] {
  return text.split(/\s+/).filter((token) => token.length > 0);
}

/**
 * Tokens of one static template chunk. A token touching an interpolation
 * edge may be a prefix (`sync-` in `sync-${state}`, `Card` in `${p}Card`),
 * so drop it unless whitespace marks the boundary.
 */
function templateChunkTokens(text: string, edge: { left: boolean; right: boolean }): string[] {
  const tokens = wordTokens(text);
  if (tokens.length === 0) return tokens;
  if (edge.left && text.length > 0 && !/^\s/.test(text)) tokens.shift();
  if (edge.right && text.length > 0 && !/\s$/.test(text)) tokens.pop();
  return tokens;
}

type Resolve = (name: string) => ts.Expression | undefined;

function tokensFromExpr(
  expr: ts.Expression | undefined,
  resolve: Resolve,
  depth: number,
): TokenPos[] {
  if (!expr || depth > MAX_RESOLVE_DEPTH) return [];
  const at = expr.getStart();
  const tag = (tokens: string[]): TokenPos[] => tokens.map((token) => ({ token, pos: at }));

  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return tag(wordTokens(expr.text));
  }
  if (ts.isTemplateExpression(expr)) {
    const out = tag(
      templateChunkTokens(expr.head.text, {
        left: false,
        right: expr.templateSpans.length > 0,
      }),
    );
    expr.templateSpans.forEach((span, index) => {
      out.push(...tokensFromExpr(span.expression, resolve, depth + 1));
      const isLast = index === expr.templateSpans.length - 1;
      out.push(
        ...tag(
          templateChunkTokens(span.literal.text, {
            left: true,
            right: !isLast,
          }),
        ),
      );
    });
    return out;
  }
  if (ts.isConditionalExpression(expr)) {
    return [
      ...tokensFromExpr(expr.whenTrue, resolve, depth + 1),
      ...tokensFromExpr(expr.whenFalse, resolve, depth + 1),
    ];
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [
      ...tokensFromExpr(expr.left, resolve, depth + 1),
      ...tokensFromExpr(expr.right, resolve, depth + 1),
    ];
  }
  if (ts.isParenthesizedExpression(expr)) {
    return tokensFromExpr(expr.expression, resolve, depth + 1);
  }
  if (ts.isAsExpression(expr)) {
    return tokensFromExpr(expr.expression, resolve, depth + 1);
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
    if (CLASS_HELPERS.has(expr.expression.text)) {
      return expr.arguments.flatMap((arg) => tokensFromExpr(arg, resolve, depth + 1));
    }
    return [];
  }
  if (ts.isIdentifier(expr)) {
    const initializer = resolve(expr.text);
    return initializer ? tokensFromExpr(initializer, resolve, depth + 1) : [];
  }
  return [];
}

function makeResolver(source: ts.SourceFile): Resolve {
  return (name: string) => {
    let found: ts.Expression | undefined;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
        found = node.initializer;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  };
}

/** Every statically knowable className token used in one source text. */
export function classTokensFromSource(text: string, fileName = "component.tsx"): ClassUse[] {
  const scriptKind = fileName.endsWith(".ts") && !fileName.endsWith(".tsx")
    ? ts.ScriptKind.TS
    : ts.ScriptKind.TSX;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind);
  const resolve = makeResolver(source);
  const uses: ClassUse[] = [];

  const record = (tokens: TokenPos[]): void => {
    for (const { token, pos } of tokens) {
      const { line, character } = source.getLineAndCharacterOfPosition(pos);
      uses.push({ className: token, line: line + 1, character: character + 1 });
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "className"
    ) {
      const init = node.initializer;
      if (init && ts.isStringLiteral(init)) {
        record(wordTokens(init.text).map((token) => ({ token, pos: init.getStart() })));
      } else if (init && ts.isJsxExpression(init)) {
        record(tokensFromExpr(init.expression, resolve, 0));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return uses;
}

export interface SourceInput {
  file: string;
  text: string;
}

export function findViolations(
  sources: SourceInput[],
  cssText: string,
  exempt: Set<string> = EXEMPT_CLASSES,
): Violation[] {
  const defined = cssClasses(cssText);
  const violations: Violation[] = [];
  for (const { file, text } of sources) {
    for (const use of classTokensFromSource(text, file)) {
      if (!defined.has(use.className) && !exempt.has(use.className)) {
        violations.push({ file, ...use });
      }
    }
  }
  return violations;
}

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFilesUnder(full));
    } else if (
      /\.(tsx|ts)$/.test(entry.name) &&
      !/\.(test|spec|d)\.tsx?$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out.sort();
}

/** Lint every className in src/ against the CSS files. */
export function lintRepo(root: string): Violation[] {
  const sources: SourceInput[] = sourceFilesUnder(path.join(root, "src")).map((file) => ({
    file: path.relative(root, file),
    text: fs.readFileSync(file, "utf8"),
  }));
  const cssText = CSS_FILES.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  return findViolations(sources, cssText);
}

function main(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = new Set(process.argv.slice(2));
  const violations = lintRepo(root);

  if (args.has("--update-baseline")) {
    // Rewrite the debt ledger to exactly the current violations. This is
    // only for intentional burn-down or adding documented legacy code —
    // never run it just to make a failing lint green.
    const keys = [...new Set(violations.map(violationKey))].sort();
    fs.writeFileSync(
      path.join(root, BASELINE_FILE),
      `${JSON.stringify(keys, null, 2)}\n`,
    );
    console.log(`Wrote ${keys.length} baseline entr(ies) to ${BASELINE_FILE}`);
    return;
  }

  const baseline = loadBaseline(root);
  const strict = args.has("--strict");
  const fresh = violations.filter((v) => !baseline.has(violationKey(v)));
  const failing = strict ? violations : fresh;

  for (const v of failing) {
    console.error(
      `  ${v.file}:${v.line}:${v.character}  className "${v.className}" has no rule in ${CSS_FILES.join(", ")}`,
    );
  }
  if (failing.length > 0) {
    console.error(`FAIL: ${failing.length} className token(s) with no CSS rule`);
    process.exit(1);
  }
  const debt = violations.length - fresh.length;
  if (debt > 0) {
    console.log(
      `PASS (with ${debt} baseline debt use(s) tracked in ${BASELINE_FILE} — burn them down by styling those classes)`,
    );
  } else {
    console.log("PASS: every className token has a matching CSS rule");
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) main();
