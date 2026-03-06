import { useUIStore } from "../store/uiStore";
import { VersionsPanel } from "./panels/VersionsPanel";
import { SnippetsPanel } from "./panels/SnippetsPanel";
import { ReferencesPanel } from "./panels/ReferencesPanel";
import { OutputsPanel } from "./panels/OutputsPanel";

const TITLES: Record<string, string> = {
  versions: "Version History",
  snippets: "Snippets",
  references: "References",
  outputs: "Outputs",
};

export function RightPanel() {
  const rightPanel = useUIStore((s) => s.rightPanel);
  const setRightPanel = useUIStore((s) => s.setRightPanel);

  if (!rightPanel) return null;

  return (
    <div className="right-panel">
      <div className="right-panel-header">
        <span>{TITLES[rightPanel]}</span>
        <button
          type="button"
          style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 16 }}
          onClick={() => setRightPanel(null)}
        >
          ✕
        </button>
      </div>
      <div className="right-panel-body">
        {rightPanel === "versions" && <VersionsPanel />}
        {rightPanel === "snippets" && <SnippetsPanel />}
        {rightPanel === "references" && <ReferencesPanel />}
        {rightPanel === "outputs" && <OutputsPanel />}
      </div>
    </div>
  );
}
