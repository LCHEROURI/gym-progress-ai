/**
 * Unit tests for the className → CSS rule lint (scripts/lint-classnames.ts).
 *
 * The fixtures below are the red-green evidence for the checker itself:
 * each "flags" case feeds markup with a known orphan class and asserts the
 * lint names it. The final test wires the lint to the real repo against the
 * committed debt baseline, so any NEW orphan className fails `npm test`
 * (and `npm run lint`) with the file, line, and class named.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cssClasses,
  findViolations,
  lintRepo,
  loadBaseline,
  violationKey,
} from "../scripts/lint-classnames";

const css = (rules: string) => rules;

describe("cssClasses", () => {
  it("collects class selectors from compounds, descendants, and media queries", () => {
    const defined = cssClasses(css(`
      /* comment with .fake { } */
      .a, .b > .c { color: red; }
      .d:hover .e { color: blue; }
      @media (max-width: 400px) { .f .g { display: none; } }
    `));
    expect([...defined].sort()).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
});

describe("findViolations", () => {
  it("flags a literal className with no CSS rule (red fixture)", () => {
    const violations = findViolations(
      [{ file: "src/x.tsx", text: `export const A = () => <div className="ghost" />;` }],
      css(`.kept { color: red; }`),
      new Set(),
    );
    expect(violations).toEqual([
      { file: "src/x.tsx", className: "ghost", line: 1, character: 39 },
    ]);
  });

  it("passes when every token has a rule and splits multi-token strings", () => {
    const text = `export const A = () => <div className="cardTop prTag" />;`;
    expect(findViolations([{ file: "src/x.tsx", text }], css(`.cardTop {} .prTag {}`))).toEqual([]);
    const violations = findViolations([{ file: "src/x.tsx", text }], css(`.cardTop {}`), new Set());
    expect(violations.map((v) => v.className)).toEqual(["prTag"]);
  });

  it("checks both ternary branches but not the compared literal", () => {
    const text = `export const A = ({ m }: { m: { role: string } }) => (
      <div className={m.role === "user" ? "chatUser" : "chatCoach"} />
    );`;
    const all = css(`.chatUser {} .chatCoach {}`);
    expect(findViolations([{ file: "src/x.tsx", text }], all)).toEqual([]);
    const violations = findViolations([{ file: "src/x.tsx", text }], css(`.chatUser {}`), new Set());
    expect(violations.map((v) => v.className)).toEqual(["chatCoach"]);
  });

  it("skips template tokens glued to an interpolation edge", () => {
    const text = `export const A = ({ s, p }: { s: string; p: string }) => (
      <>
        <span className={\`syncBadge sync-\${s}\`} />
        <span className={\`\${p}Card\`} />
      </>
    );`;
    // "sync-" and "Card" are dynamic prefixes; only syncBadge is checkable.
    expect(findViolations([{ file: "src/x.tsx", text }], css(`.syncBadge {}`))).toEqual([]);
    const violations = findViolations([{ file: "src/x.tsx", text }], css(``), new Set());
    expect(violations.map((v) => v.className)).toEqual(["syncBadge"]);
  });

  it("checks interpolated result branches inside template literals", () => {
    const text = `export const A = ({ on }: { on: boolean }) => (
      <span className={\`base \${on ? "lit" : "dim"}\`} />
    );`;
    const violations = findViolations([{ file: "src/x.tsx", text }], css(`.base {} .lit {}`), new Set());
    expect(violations.map((v) => v.className)).toEqual(["dim"]);
  });

  it("resolves className={ident} to a local const initializer", () => {
    const text = `export function A({ large }: { large: boolean }) {
      const cls = large ? "largeText" : "smallText";
      return <div className={cls} />;
    }`;
    const violations = findViolations([{ file: "src/x.tsx", text }], css(`.largeText {}`), new Set());
    expect(violations.map((v) => v.className)).toEqual(["smallText"]);
  });

  it("skips unresolvable dynamic expressions instead of flagging them", () => {
    const text = `export const A = ({ cls }: { cls: string }) => <div className={cls} />;`;
    expect(findViolations([{ file: "src/x.tsx", text }], css(``))).toEqual([]);
  });

  it("honors the exemption list", () => {
    const text = `export const A = () => <div className="thirdPartyHook" />;`;
    const violations = findViolations(
      [{ file: "src/x.tsx", text }],
      css(``),
      new Set(["thirdPartyHook"]),
    );
    expect(violations).toEqual([]);
  });
});

describe("repo wiring (className → src/styles.css)", () => {
  it("has no className tokens outside the committed debt baseline", () => {
    const root = path.resolve(path.dirname(import.meta.dirname));
    const violations = lintRepo(root);
    const baseline = loadBaseline(root);
    const actual = [...new Set(violations.map(violationKey))].sort();
    const known = [...baseline].sort();

    const newDebt = actual.filter((key) => !baseline.has(key));
    const staleDebt = known.filter((key) => !actual.includes(key));
    expect(
      newDebt,
      `new className tokens with no CSS rule — style them or (with rationale) run: npm run lint:classnames -- --update-baseline`,
    ).toEqual([]);
    expect(
      staleDebt,
      `baseline entries that are no longer orphaned — shrink the ledger with: npm run lint:classnames -- --update-baseline`,
    ).toEqual([]);
  });
});
