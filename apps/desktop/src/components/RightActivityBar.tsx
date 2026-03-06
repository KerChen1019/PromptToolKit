import { useUIStore } from "../store/uiStore";
import type { RightPanelKey } from "../store/uiStore";

const PANELS: { key: RightPanelKey; icon: string; title: string }[] = [
  { key: "versions", icon: "⏱", title: "Versions" },
  { key: "snippets", icon: "⊞", title: "Snippets" },
  { key: "references", icon: "🖼", title: "References" },
  { key: "outputs", icon: "📤", title: "Outputs" },
];

export function RightActivityBar() {
  const rightPanel = useUIStore((s) => s.rightPanel);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);

  return (
    <div className="right-activity-bar">
      {PANELS.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`activity-icon${rightPanel === p.key ? " active" : ""}`}
          title={p.title}
          onClick={() => toggleRightPanel(p.key)}
        >
          {p.icon}
        </button>
      ))}
    </div>
  );
}
