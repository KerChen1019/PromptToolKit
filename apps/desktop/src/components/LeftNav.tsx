import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProject,
  createPrompt,
  listPromptsByProject,
  listProjects,
  togglePromptStar,
} from "../lib/tauri";
import { useUIStore } from "../store/uiStore";
import type { CenterView } from "../store/uiStore";

export function LeftNav() {
  const queryClient = useQueryClient();
  const projectId = useUIStore((s) => s.projectId);
  const promptId = useUIStore((s) => s.promptId);
  const setProjectId = useUIStore((s) => s.setProjectId);
  const setPromptId = useUIStore((s) => s.setPromptId);
  const setEditorText = useUIStore((s) => s.setEditorText);
  const setCenterView = useUIStore((s) => s.setCenterView);
  const centerView = useUIStore((s) => s.centerView);

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [addingPromptForProject, setAddingPromptForProject] = useState<string | null>(null);
  const [newPromptTitle, setNewPromptTitle] = useState("");
  const [showStarredOnly, setShowStarredOnly] = useState(false);

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const createProjectMutation = useMutation({
    mutationFn: () => createProject(newProjectName.trim()),
    onSuccess: (p) => {
      setProjectId(p.id);
      setNewProjectName("");
      setAddingProject(false);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const createPromptMutation = useMutation({
    mutationFn: (pid: string) => createPrompt(pid, newPromptTitle.trim(), ""),
    onSuccess: (prompt) => {
      setPromptId(prompt.id);
      setEditorText(prompt.currentDraft);
      setNewPromptTitle("");
      setAddingPromptForProject(null);
      setCenterView("editor");
      queryClient.invalidateQueries({ queryKey: ["prompts", prompt.projectId] });
    },
  });

  const toggleStarMutation = useMutation({
    mutationFn: (pid: string) => togglePromptStar(pid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });

  function toggleProject(pid: string) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        next.add(pid);
      }
      return next;
    });
  }

  function toggleCenterView(key: CenterView) {
    setCenterView(centerView === key ? "editor" : key);
  }

  const centerTools: { key: CenterView; icon: string; label: string }[] = [
    { key: "generator", icon: "G", label: "Prompt Generator" },
    { key: "image-analyzer", icon: "I", label: "Image Analyzer" },
    { key: "moodboard", icon: "M", label: "Moodboard" },
    { key: "ai-settings", icon: "A", label: "AI Settings" },
  ];

  return (
    <nav className="left-nav">
      <div className="left-nav-header">
        <h1>Prompt Toolkit</h1>
        <span className="version-tag">alpha</span>
      </div>

      <div className="nav-tree">
        <div className="nav-filter-row">
          <button
            type="button"
            className={`nav-filter-btn${showStarredOnly ? " active" : ""}`}
            onClick={() => setShowStarredOnly((v) => !v)}
          >
            {showStarredOnly ? "Starred only: On" : "Starred only: Off"}
          </button>
        </div>

        {projectsQuery.data?.map((project) => (
          <ProjectNode
            key={project.id}
            projectId={project.id}
            projectName={project.name}
            collapsed={collapsedProjects.has(project.id)}
            onToggle={() => toggleProject(project.id)}
            selectedProjectId={projectId}
            selectedPromptId={promptId}
            showStarredOnly={showStarredOnly}
            onTogglePromptStar={(pid) => toggleStarMutation.mutate(pid)}
            onSelectPrompt={(pid, text) => {
              setProjectId(project.id);
              setPromptId(pid);
              setEditorText(text);
              setCenterView("editor");
            }}
            addingPrompt={addingPromptForProject === project.id}
            onStartAddPrompt={() => setAddingPromptForProject(project.id)}
            newPromptTitle={newPromptTitle}
            onPromptTitleChange={setNewPromptTitle}
            onConfirmAddPrompt={() => createPromptMutation.mutate(project.id)}
            onCancelAddPrompt={() => setAddingPromptForProject(null)}
          />
        ))}

        {addingProject ? (
          <div className="nav-new-input" style={{ paddingLeft: 12, marginTop: 4 }}>
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  createProjectMutation.mutate();
                }
                if (e.key === "Escape") {
                  setAddingProject(false);
                }
              }}
            />
            <button
              className="nav-new-btn"
              type="button"
              onClick={() => createProjectMutation.mutate()}
            >
              Add
            </button>
            <button className="nav-new-btn" type="button" onClick={() => setAddingProject(false)}>
              x
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="nav-tool-btn"
            style={{ fontSize: 12, color: "#475569" }}
            onClick={() => setAddingProject(true)}
          >
            + New Project
          </button>
        )}
      </div>

      <div className="left-nav-footer">
        {centerTools.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`nav-tool-btn${centerView === t.key ? " active" : ""}`}
            onClick={() => toggleCenterView(t.key)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

interface ProjectNodeProps {
  projectId: string;
  projectName: string;
  collapsed: boolean;
  onToggle: () => void;
  selectedProjectId: string | null;
  selectedPromptId: string | null;
  showStarredOnly: boolean;
  onTogglePromptStar: (promptId: string) => void;
  onSelectPrompt: (promptId: string, currentDraft: string) => void;
  addingPrompt: boolean;
  onStartAddPrompt: () => void;
  newPromptTitle: string;
  onPromptTitleChange: (v: string) => void;
  onConfirmAddPrompt: () => void;
  onCancelAddPrompt: () => void;
}

function ProjectNode({
  projectId,
  projectName,
  collapsed,
  onToggle,
  selectedProjectId,
  selectedPromptId,
  showStarredOnly,
  onTogglePromptStar,
  onSelectPrompt,
  addingPrompt,
  onStartAddPrompt,
  newPromptTitle,
  onPromptTitleChange,
  onConfirmAddPrompt,
  onCancelAddPrompt,
}: ProjectNodeProps) {
  const promptsQuery = useQuery({
    queryKey: ["prompts", projectId],
    queryFn: () => listPromptsByProject(projectId),
  });

  const visiblePrompts = (promptsQuery.data ?? []).filter((prompt) => {
    if (!showStarredOnly) {
      return true;
    }
    return prompt.starred;
  });

  const isActiveProject = selectedProjectId === projectId;

  return (
    <div className="tree-project">
      <div className={`tree-project-header${collapsed ? " collapsed" : ""}`} onClick={onToggle}>
        <span className="chevron">v</span>
        <span className="tree-project-name">{projectName}</span>
        {isActiveProject && (
          <button
            type="button"
            className="nav-new-btn"
            style={{ fontSize: 10, padding: "1px 4px" }}
            onClick={(e) => {
              e.stopPropagation();
              onStartAddPrompt();
            }}
          >
            +
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {visiblePrompts.map((prompt) => (
            <div
              key={prompt.id}
              className={`tree-prompt${selectedPromptId === prompt.id ? " active" : ""}`}
              onClick={() => onSelectPrompt(prompt.id, prompt.currentDraft)}
            >
              <span className="tree-prompt-title">{prompt.title}</span>
              <button
                type="button"
                className={`prompt-star-btn${prompt.starred ? " on" : ""}`}
                title={prompt.starred ? "Unstar prompt" : "Star prompt"}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePromptStar(prompt.id);
                }}
              >
                {prompt.starred ? "*" : "o"}
              </button>
            </div>
          ))}

          {promptsQuery.isSuccess && visiblePrompts.length === 0 && (
            <div className="tree-empty">
              {showStarredOnly ? "No starred prompts" : "No prompts yet"}
            </div>
          )}

          {addingPrompt && (
            <div className="nav-new-input">
              <input
                autoFocus
                value={newPromptTitle}
                onChange={(e) => onPromptTitleChange(e.target.value)}
                placeholder="Prompt title"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onConfirmAddPrompt();
                  }
                  if (e.key === "Escape") {
                    onCancelAddPrompt();
                  }
                }}
              />
              <button className="nav-new-btn" type="button" onClick={onConfirmAddPrompt}>
                Add
              </button>
              <button className="nav-new-btn" type="button" onClick={onCancelAddPrompt}>
                x
              </button>
            </div>
          )}

          {!addingPrompt && (
            <button
              type="button"
              className="nav-add-row"
              onClick={(e) => {
                e.stopPropagation();
                onStartAddPrompt();
              }}
            >
              + prompt
            </button>
          )}
        </>
      )}
    </div>
  );
}
