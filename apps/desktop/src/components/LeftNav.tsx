import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearAllProjects,
  createProject,
  createPrompt,
  deleteProject,
  deletePrompt,
  exportProjectBundle,
  listPromptsByProject,
  listProjects,
  togglePromptStar,
  updateProject,
  updatePromptTitle,
} from "../lib/tauri";
import { useUIStore } from "../store/uiStore";
import type { CenterView } from "../store/uiStore";
import type { Prompt } from "../types/domain";

export function LeftNav() {
  const queryClient = useQueryClient();
  const projectId = useUIStore((s) => s.projectId);
  const promptId = useUIStore((s) => s.promptId);
  const setProjectId = useUIStore((s) => s.setProjectId);
  const setPromptId = useUIStore((s) => s.setPromptId);
  const setEditorText = useUIStore((s) => s.setEditorText);
  const setCenterView = useUIStore((s) => s.setCenterView);
  const setRightPanel = useUIStore((s) => s.setRightPanel);
  const centerView = useUIStore((s) => s.centerView);
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [addingPromptForProject, setAddingPromptForProject] = useState<string | null>(null);
  const [newPromptTitle, setNewPromptTitle] = useState("");
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameProjectValue, setRenameProjectValue] = useState("");
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedExportPromptIds, setSelectedExportPromptIds] = useState<Record<string, boolean>>({});
  const [workspaceStatus, setWorkspaceStatus] = useState<string | null>(null);

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const exportPromptsQuery = useQuery({
    queryKey: ["prompts", projectId],
    queryFn: () => listPromptsByProject(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const currentProject = projectsQuery.data?.find((project) => project.id === projectId) ?? null;

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

  const deleteProjectMutation = useMutation({
    mutationFn: (pid: string) => deleteProject(pid),
    onSuccess: (_data, pid) => {
      if (projectId === pid) {
        setProjectId(null);
        setPromptId(null);
        setEditorText("");
      }
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: clearAllProjects,
    onSuccess: (summary) => {
      setProjectId(null);
      setPromptId(null);
      setEditorText("");
      setRightPanel(null);
      setCenterView("editor");
      setShowExportDialog(false);
      setSelectedExportPromptIds({});
      setWorkspaceStatus(
        `Cleared ${summary.deletedProjectCount} projects, ${summary.deletedPromptCount} prompts, ${summary.deletedReferenceCount} references, and ${summary.deletedOutputCount} outputs.`,
      );
      queryClient.invalidateQueries();
    },
    onError: (error) => setWorkspaceStatus(String(error)),
  });

  const renameProjectMutation = useMutation({
    mutationFn: ({ id, name, globalSuffix }: { id: string; name: string; globalSuffix: string }) =>
      updateProject(id, name, globalSuffix),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  const toggleStarMutation = useMutation({
    mutationFn: (pid: string) => togglePromptStar(pid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });

  const exportProjectMutation = useMutation({
    mutationFn: ({
      destinationDir,
      promptIds,
    }: {
      destinationDir: string;
      promptIds: string[] | null;
    }) => exportProjectBundle(projectId ?? "", destinationDir, promptIds),
    onSuccess: (result) => {
      setShowExportDialog(false);
      setWorkspaceStatus(
        `Exported ${result.promptCount} prompt(s), ${result.referenceCount} references, and ${result.outputCount} outputs to ${result.bundlePath}`,
      );
    },
    onError: (error) => setWorkspaceStatus(String(error)),
  });

  useEffect(() => {
    if (!showExportDialog || !exportPromptsQuery.data) {
      return;
    }
    setSelectedExportPromptIds((current) => {
      const nextEntries = exportPromptsQuery.data.map((prompt) => [prompt.id, true] as const);
      const currentKeys = Object.keys(current);
      const isSameShape =
        currentKeys.length === nextEntries.length &&
        nextEntries.every(([id]) => Object.prototype.hasOwnProperty.call(current, id));
      return isSameShape ? current : Object.fromEntries(nextEntries);
    });
  }, [showExportDialog, exportPromptsQuery.data]);

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

  function setAllExportPrompts(enabled: boolean) {
    const prompts = exportPromptsQuery.data ?? [];
    setSelectedExportPromptIds(
      Object.fromEntries(prompts.map((prompt) => [prompt.id, enabled])),
    );
  }

  async function handleExportProject() {
    const prompts = exportPromptsQuery.data ?? [];
    const selectedPromptIds = prompts
      .filter((prompt) => selectedExportPromptIds[prompt.id])
      .map((prompt) => prompt.id);

    if (selectedPromptIds.length === 0) {
      setWorkspaceStatus("Select at least one prompt to export.");
      return;
    }

    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose export destination",
    });
    if (!selected || typeof selected !== "string") {
      return;
    }

    setWorkspaceStatus(null);
    exportProjectMutation.mutate({
      destinationDir: selected,
      promptIds: selectedPromptIds.length === prompts.length ? null : selectedPromptIds,
    });
  }

  const centerTools: { key: CenterView; icon: string; label: string }[] = [
    { key: "image-analyzer", icon: "🔍", label: "Image Analyzer" },
    { key: "moodboard", icon: "🎨", label: "Moodboard" },
    { key: "ai-settings", icon: "⚙", label: "AI Settings" },
  ];

  return (
    <>
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
            {showStarredOnly ? "★ Starred only" : "☆ All prompts"}
          </button>
        </div>

        {projectsQuery.data?.map((project) => (
          <ProjectNode
            key={project.id}
            projectId={project.id}
            projectName={project.name}
            projectGlobalSuffix={project.globalSuffix}
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
            onDeletePrompt={(pid) => {
              if (!window.confirm("Delete this prompt? This cannot be undone.")) return;
              if (promptId === pid) {
                setPromptId(null);
                setEditorText("");
              }
              deletePrompt(pid).then(() =>
                queryClient.invalidateQueries({ queryKey: ["prompts", project.id] })
              );
            }}
            onDeleteProject={() => {
              if (!window.confirm(`Delete project "${project.name}" and all its prompts? This cannot be undone.`)) return;
              deleteProjectMutation.mutate(project.id);
            }}
            onRenameProject={(newName) => {
              renameProjectMutation.mutate({ id: project.id, name: newName, globalSuffix: project.globalSuffix });
            }}
            renamingProjectId={renamingProjectId}
            renameProjectValue={renameProjectValue}
            onStartRenameProject={() => {
              setRenamingProjectId(project.id);
              setRenameProjectValue(project.name);
            }}
            onRenameProjectValueChange={setRenameProjectValue}
            onCancelRenameProject={() => setRenamingProjectId(null)}
            onConfirmRenameProject={(newName) => {
              renameProjectMutation.mutate({ id: project.id, name: newName, globalSuffix: project.globalSuffix });
              setRenamingProjectId(null);
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
          <div className="nav-new-input nav-new-input--root">
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              onKeyDown={(e) => {
                if (e.key === "Enter") createProjectMutation.mutate();
                if (e.key === "Escape") setAddingProject(false);
              }}
            />
            <button className="nav-new-btn" type="button" onClick={() => createProjectMutation.mutate()}>Add</button>
            <button className="nav-new-btn" type="button" onClick={() => setAddingProject(false)}>✕</button>
          </div>
        ) : (
          <button type="button" className="nav-add-row nav-add-row--root" onClick={() => setAddingProject(true)}>
            + New Project
          </button>
        )}

        <div className="nav-workspace-actions">
          <div className="nav-workspace-title">Workspace</div>
          <button
            type="button"
            className="nav-secondary-btn"
            onClick={() => {
              if (!projectId) {
                setWorkspaceStatus("Select a project first.");
                return;
              }
              setWorkspaceStatus(null);
              setShowExportDialog(true);
            }}
            disabled={!projectId || exportProjectMutation.isPending}
          >
            Export current project
          </button>
          <button
            type="button"
            className="nav-secondary-btn nav-secondary-btn--danger"
            onClick={() => {
              if (!window.confirm("Clear every project, prompt, reference, output, and snippet in this workspace?")) {
                return;
              }
              setWorkspaceStatus(null);
              clearAllMutation.mutate();
            }}
            disabled={clearAllMutation.isPending || (projectsQuery.data?.length ?? 0) === 0}
          >
            {clearAllMutation.isPending ? "Clearing..." : "Clear all projects"}
          </button>
          {workspaceStatus && <div className="nav-workspace-status">{workspaceStatus}</div>}
        </div>
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
        <button
          type="button"
          className="nav-tool-btn"
          onClick={toggleTheme}
          title="Toggle light/dark mode"
        >
          <span>{theme === "dark" ? "☀" : "☾"}</span>
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>
      </nav>

      {showExportDialog && (
        <div className="overlay-backdrop" onClick={() => setShowExportDialog(false)}>
          <div className="overlay-panel" onClick={(event) => event.stopPropagation()}>
            <div className="overlay-header">
              <h2>Export Project Bundle</h2>
              <button
                type="button"
                className="overlay-close"
                onClick={() => setShowExportDialog(false)}
              >
                ×
              </button>
            </div>
            <div className="overlay-body" style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 13, color: "#475569" }}>
                Export <strong>{currentProject?.name ?? "current project"}</strong> as a folder bundle
                with prompt TXT files, linked references, and linked outputs.
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={{ fontSize: 12 }} onClick={() => setAllExportPrompts(true)}>
                  Select all
                </button>
                <button type="button" style={{ fontSize: 12 }} onClick={() => setAllExportPrompts(false)}>
                  Clear selection
                </button>
                <button
                  type="button"
                  style={{ fontSize: 12 }}
                  disabled={!promptId}
                  onClick={() =>
                    setSelectedExportPromptIds(
                      Object.fromEntries(
                        (exportPromptsQuery.data ?? []).map((prompt) => [prompt.id, prompt.id === promptId]),
                      ),
                    )
                  }
                >
                  Current prompt only
                </button>
              </div>

              <div style={{ display: "grid", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                {(exportPromptsQuery.data ?? []).map((prompt: Prompt) => (
                  <label
                    key={prompt.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      background: "#fff",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(selectedExportPromptIds[prompt.id])}
                      onChange={(event) =>
                        setSelectedExportPromptIds((current) => ({
                          ...current,
                          [prompt.id]: event.target.checked,
                        }))
                      }
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>
                        {prompt.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {prompt.id === promptId ? "Current prompt" : "Prompt"}
                        {prompt.tags.length > 0 ? ` · ${prompt.tags.join(", ")}` : ""}
                      </div>
                    </div>
                  </label>
                ))}
                {(exportPromptsQuery.data?.length ?? 0) === 0 && (
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>This project has no prompts to export.</div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {(exportPromptsQuery.data ?? []).filter((prompt) => selectedExportPromptIds[prompt.id]).length} selected
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => setShowExportDialog(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      exportProjectMutation.isPending ||
                      (exportPromptsQuery.data ?? []).every((prompt) => !selectedExportPromptIds[prompt.id])
                    }
                    onClick={handleExportProject}
                  >
                    {exportProjectMutation.isPending ? "Exporting..." : "Choose folder and export"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface ProjectNodeProps {
  projectId: string;
  projectName: string;
  projectGlobalSuffix: string;
  collapsed: boolean;
  onToggle: () => void;
  selectedProjectId: string | null;
  selectedPromptId: string | null;
  showStarredOnly: boolean;
  onTogglePromptStar: (promptId: string) => void;
  onSelectPrompt: (promptId: string, currentDraft: string) => void;
  onDeletePrompt: (promptId: string) => void;
  onDeleteProject: () => void;
  onRenameProject: (newName: string) => void;
  renamingProjectId: string | null;
  renameProjectValue: string;
  onStartRenameProject: () => void;
  onRenameProjectValueChange: (v: string) => void;
  onCancelRenameProject: () => void;
  onConfirmRenameProject: (newName: string) => void;
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
  selectedProjectId: _selectedProjectId,
  selectedPromptId,
  showStarredOnly,
  onTogglePromptStar,
  onSelectPrompt,
  onDeletePrompt,
  onDeleteProject,
  renamingProjectId,
  renameProjectValue,
  onStartRenameProject,
  onRenameProjectValueChange,
  onCancelRenameProject,
  onConfirmRenameProject,
  addingPrompt,
  onStartAddPrompt,
  newPromptTitle,
  onPromptTitleChange,
  onConfirmAddPrompt,
  onCancelAddPrompt,
}: ProjectNodeProps) {
  const queryClient = useQueryClient();
  const promptsQuery = useQuery({
    queryKey: ["prompts", projectId],
    queryFn: () => listPromptsByProject(projectId),
  });

  const [renamingPromptId, setRenamingPromptId] = useState<string | null>(null);
  const [renamePromptValue, setRenamePromptValue] = useState("");

  const renamePromptMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => updatePromptTitle(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prompts", projectId] }),
  });

  const visiblePrompts = (promptsQuery.data ?? []).filter((prompt) => {
    if (!showStarredOnly) return true;
    return prompt.starred;
  });

  const isRenamingThisProject = renamingProjectId === projectId;

  return (
    <div className="tree-project">
      <div className={`tree-project-header${collapsed ? " collapsed" : ""}`} onClick={onToggle}>
        <span className="chevron">▾</span>
        {isRenamingThisProject ? (
          <input
            className="nav-rename-input"
            autoFocus
            value={renameProjectValue}
            onChange={(e) => onRenameProjectValueChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              if (renameProjectValue.trim()) onConfirmRenameProject(renameProjectValue.trim());
              else onCancelRenameProject();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                if (renameProjectValue.trim()) onConfirmRenameProject(renameProjectValue.trim());
                else onCancelRenameProject();
              }
              if (e.key === "Escape") onCancelRenameProject();
            }}
          />
        ) : (
          <span
            className="tree-project-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartRenameProject();
            }}
            title="Double-click to rename"
          >
            {projectName}
          </span>
        )}
        <button
          type="button"
          className="nav-icon-btn"
          title="Add prompt"
          onClick={(e) => {
            e.stopPropagation();
            onStartAddPrompt();
          }}
        >
          +
        </button>
        <button
          type="button"
          className="nav-icon-btn nav-icon-btn--danger"
          title="Delete project"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteProject();
          }}
        >
          ✕
        </button>
      </div>

      {!collapsed && (
        <>
          {visiblePrompts.map((prompt) => (
            <div key={prompt.id}>
              <div
                className={`tree-prompt${selectedPromptId === prompt.id ? " active" : ""}`}
                onClick={() => {
                  if (renamingPromptId !== prompt.id) {
                    onSelectPrompt(prompt.id, prompt.currentDraft);
                  }
                }}
              >
                {renamingPromptId === prompt.id ? (
                  <input
                    className="nav-rename-input nav-rename-input--prompt"
                    autoFocus
                    value={renamePromptValue}
                    onChange={(e) => setRenamePromptValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => {
                      if (renamePromptValue.trim()) {
                        renamePromptMutation.mutate({ id: prompt.id, title: renamePromptValue.trim() });
                      }
                      setRenamingPromptId(null);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        if (renamePromptValue.trim()) {
                          renamePromptMutation.mutate({ id: prompt.id, title: renamePromptValue.trim() });
                        }
                        setRenamingPromptId(null);
                      }
                      if (e.key === "Escape") setRenamingPromptId(null);
                    }}
                  />
                ) : (
                  <span
                    className="tree-prompt-title"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenamingPromptId(prompt.id);
                      setRenamePromptValue(prompt.title);
                    }}
                    title="Double-click to rename"
                  >
                    {prompt.title}
                  </span>
                )}
                <button
                  type="button"
                  className={`prompt-star-btn${prompt.starred ? " on" : ""}`}
                  title={prompt.starred ? "Unstar prompt" : "Star prompt"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePromptStar(prompt.id);
                  }}
                >
                  {prompt.starred ? "★" : "☆"}
                </button>
                <button
                  type="button"
                  className="prompt-action-btn prompt-action-btn--danger"
                  title="Delete prompt"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePrompt(prompt.id);
                  }}
                >
                  ✕
                </button>
              </div>
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
                  if (e.key === "Enter") onConfirmAddPrompt();
                  if (e.key === "Escape") onCancelAddPrompt();
                }}
              />
              <button className="nav-new-btn" type="button" onClick={onConfirmAddPrompt}>
                Add
              </button>
              <button className="nav-new-btn" type="button" onClick={onCancelAddPrompt}>✕</button>
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
