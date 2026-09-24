import type { IosBrowser } from "./iosBrowser";
import type { StepSlices } from "./i18n";

/**
 * Illustrated step-by-step install diagram: one numbered panel per action with
 * a label-free SVG mockup (the exact iOS labels live ONLY in the captions, so
 * the copy-lock tests see each phrase exactly once). Each caption is a
 * verbatim slice of the locked wording (i18n.ts `slices`), and the figures are
 * decorative — the captions alone carry the accessible text.
 */
export default function InstallStepsDiagram({
  slices,
  browser,
  tail,
}: {
  slices: StepSlices;
  browser: IosBrowser;
  tail: string;
}) {
  const note = slices.note[browser];
  return (
    <>
      <ol className="installSteps" dir="auto" role="list">
        <li className="installStep">
          <span className="stepBadge" aria-hidden="true">
            1
          </span>
          <span className="stepFigure" aria-hidden="true">
            <ShareFigure />
          </span>
          <span className="stepCaption">{slices.share[browser]}</span>
        </li>
        <li className="installStep">
          <span className="stepBadge" aria-hidden="true">
            2
          </span>
          <span className="stepFigure" aria-hidden="true">
            <HomeRowFigure />
          </span>
          <span className="stepCaption">{slices.home[browser]}</span>
        </li>
        <li className="installStep">
          <span className="stepBadge" aria-hidden="true">
            3
          </span>
          <span className="stepFigure" aria-hidden="true">
            <AddFigure />
          </span>
          <span className="stepCaption">{slices.add[browser]}</span>
        </li>
        {note && (
          <li className="installStep installStepNote">
            <span className="stepCaption">{note}</span>
          </li>
        )}
      </ol>
      <p className="installTail" dir="auto">
        {tail}
      </p>
    </>
  );
}

/** Step 1: the browser toolbar with the Share button being tapped. */
function ShareFigure() {
  return (
    <svg viewBox="0 0 96 64">
      <rect
        x="8"
        y="6"
        width="80"
        height="30"
        rx="6"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="3"
      />
      <rect
        x="8"
        y="44"
        width="80"
        height="14"
        rx="6"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="3"
      />
      <rect
        x="56"
        y="34"
        width="20"
        height="18"
        rx="5"
        style={{ fill: "var(--green)" }}
      />
      <path
        d="M66 47 v-9 M62 42 l4 -4 4 4"
        stroke="#ffffff"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="66"
        cy="43"
        r="15"
        fill="none"
        style={{ stroke: "var(--green)" }}
        strokeWidth="3"
        opacity="0.45"
      />
    </svg>
  );
}

/** Step 2: the share sheet with the Add-to-Home-Screen row being tapped. */
function HomeRowFigure() {
  return (
    <svg viewBox="0 0 96 64">
      <rect
        x="16"
        y="4"
        width="64"
        height="56"
        rx="8"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="3"
      />
      <rect
        x="24"
        y="12"
        width="48"
        height="10"
        rx="3"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="2.5"
      />
      <rect
        x="24"
        y="27"
        width="48"
        height="10"
        rx="3"
        style={{ fill: "var(--green)" }}
      />
      <rect
        x="24"
        y="42"
        width="48"
        height="10"
        rx="3"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="2.5"
      />
      <circle
        cx="48"
        cy="32"
        r="13"
        fill="none"
        style={{ stroke: "var(--green)" }}
        strokeWidth="3"
        opacity="0.45"
      />
    </svg>
  );
}

/** Step 3: the install dialog with the Add button being tapped. */
function AddFigure() {
  return (
    <svg viewBox="0 0 96 64">
      <rect
        x="10"
        y="6"
        width="76"
        height="52"
        rx="8"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="3"
      />
      <rect
        x="18"
        y="14"
        width="60"
        height="12"
        rx="4"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="2.5"
      />
      <circle cx="26" cy="20" r="3.5" style={{ fill: "var(--green)" }} />
      <rect
        x="18"
        y="36"
        width="26"
        height="13"
        rx="5"
        fill="#ffffff"
        stroke="#111111"
        strokeWidth="2.5"
      />
      <rect
        x="52"
        y="36"
        width="26"
        height="13"
        rx="5"
        style={{ fill: "var(--green)" }}
      />
      <circle
        cx="65"
        cy="42.5"
        r="13"
        fill="none"
        style={{ stroke: "var(--green)" }}
        strokeWidth="3"
        opacity="0.45"
      />
    </svg>
  );
}
