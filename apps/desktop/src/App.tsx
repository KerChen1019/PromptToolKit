import { useUIStore } from "./store/uiStore";
import { LeftNav } from "./components/LeftNav";
import { CenterEditor } from "./components/CenterEditor";
import { RightActivityBar } from "./components/RightActivityBar";
import { RightPanel } from "./components/RightPanel";
import { ImageAnalyzerView } from "./components/center/ImageAnalyzerView";
import { MoodboardView } from "./components/center/MoodboardView";
import { GeneratorView } from "./components/center/GeneratorView";
import { AISettingsView } from "./components/center/AISettingsView";

export default function App() {
  const rightPanel = useUIStore((s) => s.rightPanel);
  const centerView = useUIStore((s) => s.centerView);

  function renderCenter() {
    switch (centerView) {
      case "image-analyzer": return <ImageAnalyzerView />;
      case "moodboard": return <MoodboardView />;
      case "generator": return <GeneratorView />;
      case "ai-settings": return <AISettingsView />;
      default: return <CenterEditor />;
    }
  }

  return (
    <div className={`app-shell${rightPanel ? " panel-open" : ""}`}>
      <LeftNav />
      {renderCenter()}
      <RightActivityBar />
      {rightPanel && <RightPanel />}
    </div>
  );
}
