import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import BottomNav, { type NavView } from "../nav/BottomNav";
import { fixtures } from "./fixtures";
import { SMOKE_SCREENS, type SmokeScreen } from "./screen-names";
import "../styles.css";

const NAV_VIEW: Record<SmokeScreen, NavView> = {
  today: "today",
  "today-plan": "today",
  settings: "settings",
  workout: "today",
  complete: "today",
  history: "history",
  progress: "progress",
  coach: "coach",
  reports: "reports",
};

function MarkReady() {
  useEffect(() => {
    document.body.dataset.smokeReady = "1";
  });
  return null;
}

const params = new URLSearchParams(window.location.search);
const name = params.get("screen") ?? "today";
const screen: SmokeScreen = (SMOKE_SCREENS as readonly string[]).includes(name)
  ? (name as SmokeScreen)
  : "today";
const Screen = fixtures[screen];

// Dev-only harness (this file never ships): the app shell + one screen with
// fixture props so the layout smoke can measure real markup and CSS.
createRoot(document.getElementById("root")!).render(
  <main>
    <h1>Gym Progress AI</h1>
    <Screen />
    <BottomNav view={NAV_VIEW[screen]} onNavigate={() => undefined} />
    <MarkReady />
  </main>,
);
