import { create } from "zustand";

export type RightPanelKey = "versions" | "snippets" | "references" | "outputs";
export type CenterView = "editor" | "generator" | "image-analyzer" | "moodboard" | "ai-settings";

interface UIState {
  projectId: string | null;
  promptId: string | null;
  editorText: string;
  rightPanel: RightPanelKey | null;
  centerView: CenterView;
  selectedLeftVersionId: string | null;
  selectedRightVersionId: string | null;

  setProjectId: (id: string | null) => void;
  setPromptId: (id: string | null) => void;
  setEditorText: (text: string) => void;
  setRightPanel: (panel: RightPanelKey | null) => void;
  toggleRightPanel: (panel: RightPanelKey) => void;
  setCenterView: (view: CenterView) => void;
  setDiffSelection: (left: string | null, right: string | null) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  projectId: null,
  promptId: null,
  editorText: "",
  rightPanel: null,
  centerView: "editor",
  selectedLeftVersionId: null,
  selectedRightVersionId: null,

  setProjectId: (projectId) => set({ projectId }),
  setPromptId: (promptId) => set({ promptId }),
  setEditorText: (editorText) => set({ editorText }),
  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) =>
    set({ rightPanel: get().rightPanel === panel ? null : panel }),
  setCenterView: (centerView) => set({ centerView }),
  setDiffSelection: (selectedLeftVersionId, selectedRightVersionId) =>
    set({ selectedLeftVersionId, selectedRightVersionId }),
}));
