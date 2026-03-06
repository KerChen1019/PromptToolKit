import { create } from "zustand";

export type RightPanelKey = "versions" | "snippets" | "references" | "outputs";
export type CenterView = "editor" | "image-analyzer" | "moodboard" | "ai-settings";
export type Theme = "light" | "dark";

interface UIState {
  projectId: string | null;
  promptId: string | null;
  editorText: string;
  rightPanel: RightPanelKey | null;
  centerView: CenterView;
  selectedLeftVersionId: string | null;
  selectedRightVersionId: string | null;
  theme: Theme;

  setProjectId: (id: string | null) => void;
  setPromptId: (id: string | null) => void;
  setEditorText: (text: string) => void;
  setRightPanel: (panel: RightPanelKey | null) => void;
  toggleRightPanel: (panel: RightPanelKey) => void;
  setCenterView: (view: CenterView) => void;
  setDiffSelection: (left: string | null, right: string | null) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const THEME_KEY = "ptk:theme";

function loadTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // ignore
  }
  return "light";
}

export const useUIStore = create<UIState>((set, get) => ({
  projectId: null,
  promptId: null,
  editorText: "",
  rightPanel: null,
  centerView: "editor",
  selectedLeftVersionId: null,
  selectedRightVersionId: null,
  theme: loadTheme(),

  setProjectId: (projectId) => set({ projectId }),
  setPromptId: (promptId) => set({ promptId }),
  setEditorText: (editorText) => set({ editorText }),
  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) =>
    set({ rightPanel: get().rightPanel === panel ? null : panel }),
  setCenterView: (centerView) => set({ centerView }),
  setDiffSelection: (selectedLeftVersionId, selectedRightVersionId) =>
    set({ selectedLeftVersionId, selectedRightVersionId }),
  setTheme: (theme) => {
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    set({ theme });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === "light" ? "dark" : "light";
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
    set({ theme: next });
  },
}));
