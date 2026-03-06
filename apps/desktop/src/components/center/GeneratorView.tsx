import { useUIStore } from "../../store/uiStore";
import { PromptGeneratorPanel } from "../../pages/PromptGeneratorPanel";

export function GeneratorView() {
  const setCenterView = useUIStore((s) => s.setCenterView);

  return (
    <div className="center-tool-view">
      <div className="tool-view-header">
        <button type="button" className="back-btn" onClick={() => setCenterView("editor")}>
          ← Back to Editor
        </button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Prompt Generator</h2>
      </div>
      <div className="tool-view-body">
        <PromptGeneratorPanel />
      </div>
    </div>
  );
}
