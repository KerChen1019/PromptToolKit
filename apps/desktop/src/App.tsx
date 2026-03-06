import { useEffect, useState, type CSSProperties } from "react";
import { useUIStore } from "./store/uiStore";
import { LeftNav } from "./components/LeftNav";
import { CenterEditor } from "./components/CenterEditor";
import { RightActivityBar } from "./components/RightActivityBar";
import { RightPanel } from "./components/RightPanel";
import { ImageAnalyzerView } from "./components/center/ImageAnalyzerView";
import { MoodboardView } from "./components/center/MoodboardView";
import { AISettingsView } from "./components/center/AISettingsView";

const LEFT_NAV_WIDTH_KEY = "prompt-toolkit:left-nav-width";
const RIGHT_PANEL_WIDTH_KEY = "prompt-toolkit:right-panel-width";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function App() {
  const rightPanel = useUIStore((s) => s.rightPanel);
  const centerView = useUIStore((s) => s.centerView);
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const [leftNavWidth, setLeftNavWidth] = useState(() => {
    const stored = window.localStorage.getItem(LEFT_NAV_WIDTH_KEY);
    return clamp(stored ? Number(stored) : 224, 180, 360);
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const stored = window.localStorage.getItem(RIGHT_PANEL_WIDTH_KEY);
    return clamp(stored ? Number(stored) : 320, 240, 520);
  });
  const [draggingPanel, setDraggingPanel] = useState<"left" | "right" | null>(null);

  useEffect(() => {
    window.localStorage.setItem(LEFT_NAV_WIDTH_KEY, String(leftNavWidth));
  }, [leftNavWidth]);

  useEffect(() => {
    window.localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => {
    if (!draggingPanel) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      if (draggingPanel === "left") {
        setLeftNavWidth(clamp(event.clientX, 180, 360));
        return;
      }
      setRightPanelWidth(clamp(window.innerWidth - event.clientX, 240, 520));
    }

    function handleMouseUp() {
      setDraggingPanel(null);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingPanel]);

  const shellStyle = {
    "--left-nav-w": `${leftNavWidth}px`,
    "--right-panel-w": `${rightPanelWidth}px`,
  } as CSSProperties;

  function renderCenter() {
    switch (centerView) {
      case "image-analyzer": return <ImageAnalyzerView />;
      case "moodboard": return <MoodboardView />;
      case "ai-settings": return <AISettingsView />;
      default: return <CenterEditor />;
    }
  }

  return (
    <div className={`app-shell${rightPanel ? " panel-open" : ""}`} style={shellStyle}>
      <LeftNav />
      <div
        className={`panel-resizer panel-resizer--left${draggingPanel === "left" ? " active" : ""}`}
        onMouseDown={() => setDraggingPanel("left")}
      />
      {renderCenter()}
      <RightActivityBar />
      {rightPanel && (
        <>
          <div
            className={`panel-resizer panel-resizer--right${draggingPanel === "right" ? " active" : ""}`}
            onMouseDown={() => setDraggingPanel("right")}
          />
          <RightPanel />
        </>
      )}
    </div>
  );
}
