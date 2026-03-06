import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type * as monaco from "monaco-editor";
import {
  commitPromptVersion,
  copyWithPayload,
  createProject,
  createPrompt,
  getDefaultAIProviderId,
  listAIProviders,
  listAiRunHistory,
  listProjects,
  listPromptsByProject,
  rewritePromptCandidates,
  savePromptDraft,
} from "../lib/tauri";
import { useUIStore } from "../store/uiStore";

export function EditorWorkspace() {
  const queryClient = useQueryClient();
  const projectId = useUIStore((s) => s.projectId);
  const promptId = useUIStore((s) => s.promptId);
  const editorText = useUIStore((s) => s.editorText);
  const setProjectId = useUIStore((s) => s.setProjectId);
  const setPromptId = useUIStore((s) => s.setPromptId);
  const setEditorText = useUIStore((s) => s.setEditorText);

  const [newProjectName, setNewProjectName] = useState("My Project");
  const [newPromptTitle, setNewPromptTitle] = useState("Untitled Prompt");
  const [message, setMessage] = useState<string | null>(null);

  const [instruction, setInstruction] = useState("");
  const [preserveVoice, setPreserveVoice] = useState(true);
  const [providerOverride, setProviderOverride] = useState("");
  const [toolMessage, setToolMessage] = useState<string | null>(null);

  // Monaco editor instance ref — used to read and replace the current selection.
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const projectQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const promptQuery = useQuery({
    queryKey: ["prompts", projectId],
    queryFn: () => listPromptsByProject(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const aiProvidersQuery = useQuery({
    queryKey: ["aiProviders"],
    queryFn: listAIProviders,
  });

  const defaultProviderQuery = useQuery({
    queryKey: ["defaultAIProviderId"],
    queryFn: getDefaultAIProviderId,
  });

  const aiHistoryQuery = useQuery({
    queryKey: ["aiRunHistory", projectId],
    queryFn: () => listAiRunHistory(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const selectedPrompt = useMemo(
    () => promptQuery.data?.find((p) => p.id === promptId) ?? null,
    [promptQuery.data, promptId],
  );

  useEffect(() => {
    if (!projectId && projectQuery.data && projectQuery.data.length > 0) {
      setProjectId(projectQuery.data[0].id);
    }
  }, [projectId, projectQuery.data, setProjectId]);

  useEffect(() => {
    if (!promptId && promptQuery.data && promptQuery.data.length > 0) {
      setPromptId(promptQuery.data[0].id);
    }
  }, [promptId, promptQuery.data, setPromptId]);

  useEffect(() => {
    if (selectedPrompt) {
      setEditorText(selectedPrompt.currentDraft);
    }
  }, [selectedPrompt, setEditorText]);

  useEffect(() => {
    if (!providerOverride && defaultProviderQuery.data) {
      setProviderOverride(defaultProviderQuery.data);
    }
  }, [defaultProviderQuery.data, providerOverride]);

  const createProjectMutation = useMutation({
    mutationFn: () => createProject(newProjectName.trim()),
    onSuccess: (project) => {
      setProjectId(project.id);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const createPromptMutation = useMutation({
    mutationFn: () =>
      createPrompt(projectId ?? "", newPromptTitle.trim(), "Write your prompt here..."),
    onSuccess: (prompt) => {
      setPromptId(prompt.id);
      setEditorText(prompt.currentDraft);
      queryClient.invalidateQueries({ queryKey: ["prompts", projectId] });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: () => savePromptDraft(promptId ?? "", editorText),
    onSuccess: () => {
      setMessage("Draft saved");
      queryClient.invalidateQueries({ queryKey: ["prompts", projectId] });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const version = await commitPromptVersion(
        promptId ?? "",
        editorText,
        "Manual commit",
        "local-user",
      );
      await copyWithPayload({
        projectId: projectId ?? "",
        promptId: promptId ?? "",
        promptVersionId: version.id,
        promptText: editorText,
      });
      return version;
    },
    onSuccess: () => {
      setMessage("Version committed and copied with metadata payload");
      queryClient.invalidateQueries({ queryKey: ["prompts", projectId] });
      queryClient.invalidateQueries({ queryKey: ["versions", promptId] });
    },
  });

  /** Reads the current selection from Monaco. Returns selectedText or null if nothing selected. */
  function getEditorSelection(): string | null {
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return null;
    const model = editor.getModel();
    if (!model) return null;
    return model.getValueInRange(selection);
  }

  /** Applies a rewrite candidate: replaces selection if one was active, else replaces full text. */
  function applyCandidate(candidateText: string, wasSelection: boolean) {
    const editor = editorRef.current;
    if (wasSelection && editor) {
      const selection = editor.getSelection();
      if (selection) {
        editor.executeEdits("rewrite", [{ range: selection, text: candidateText }]);
        setEditorText(editor.getValue());
        return;
      }
    }
    setEditorText(candidateText);
  }

  // Track whether rewrite was triggered on a selection so Apply works correctly.
  const [rewriteWasSelection, setRewriteWasSelection] = useState(false);

  const rewriteMutation = useMutation({
    mutationFn: () => {
      const selectionText = getEditorSelection();
      setRewriteWasSelection(selectionText !== null);
      return rewritePromptCandidates({
        projectId: projectId ?? "",
        promptText: editorText,
        selectionText: selectionText ?? undefined,
        instruction,
        preserveVoice,
        providerIdOverride: providerOverride || null,
        promptId,
      });
    },
    onSuccess: (result) => {
      const scope = rewriteWasSelection ? "selection" : "full prompt";
      setToolMessage(`Rewrite (${scope}) by ${result.model} — ${result.latencyMs}ms`);
      queryClient.invalidateQueries({ queryKey: ["aiRunHistory", projectId] });
    },
    onError: (error) => {
      setToolMessage(String(error));
    },
  });

  return (
    <section className="panel">
      <h2>EditorWorkspace</h2>
      <div className="toolbar">
        <input
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          placeholder="Project name"
        />
        <button
          className="primary"
          type="button"
          onClick={() => createProjectMutation.mutate()}
        >
          Create Project
        </button>
        <select
          value={projectId ?? ""}
          onChange={(e) => setProjectId(e.target.value || null)}
        >
          <option value="">Select project</option>
          {projectQuery.data?.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <input
          value={newPromptTitle}
          onChange={(e) => setNewPromptTitle(e.target.value)}
          placeholder="Prompt title"
        />
        <button
          type="button"
          onClick={() => createPromptMutation.mutate()}
          disabled={!projectId}
        >
          Create Prompt
        </button>
        <select
          value={promptId ?? ""}
          onChange={(e) => setPromptId(e.target.value || null)}
          disabled={!projectId}
        >
          <option value="">Select prompt</option>
          {promptQuery.data?.map((prompt) => (
            <option key={prompt.id} value={prompt.id}>
              {prompt.title}
            </option>
          ))}
        </select>
      </div>

      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden", marginTop: 12 }}>
        <Editor
          height="460px"
          defaultLanguage="markdown"
          theme="vs"
          value={editorText}
          onChange={(value) => setEditorText(value ?? "")}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            wordWrap: "on",
            fontSize: 15,
          }}
        />
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={() => saveDraftMutation.mutate()}
          disabled={!promptId}
        >
          Save Draft
        </button>
        <button
          className="primary"
          type="button"
          onClick={() => commitMutation.mutate()}
          disabled={!promptId}
        >
          Commit Version + Copy
        </button>
        {message && <span className="ok">{message}</span>}
      </div>

      <h3>Modifier</h3>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: "#64748b" }}>
        Select text in the editor to rewrite only that portion, or leave nothing selected to rewrite the full prompt.
      </p>
      <div className="toolbar">
        <select
          value={providerOverride}
          onChange={(e) => setProviderOverride(e.target.value)}
        >
          <option value="">Use default provider</option>
          {aiProvidersQuery.data?.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name} ({provider.model})
            </option>
          ))}
        </select>
        <input
          style={{ minWidth: 340 }}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Rewrite instruction (e.g. pull back to a wider angle)"
        />
        <label>
          <input
            type="checkbox"
            checked={preserveVoice}
            onChange={(e) => setPreserveVoice(e.target.checked)}
          />{" "}
          Preserve voice
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => rewriteMutation.mutate()}
          disabled={!projectId || !instruction.trim() || !editorText.trim()}
        >
          Rewrite (3 candidates)
        </button>
      </div>
      {toolMessage && <p className="mono">{toolMessage}</p>}

      {rewriteMutation.data?.candidates && rewriteMutation.data.candidates.length > 0 && (
        <div>
          <h3>
            Candidates{" "}
            {rewriteWasSelection && (
              <span style={{ fontWeight: 400, fontSize: 13, color: "#64748b" }}>
                (selection only)
              </span>
            )}
          </h3>
          <div className="grid-2">
            {rewriteMutation.data.candidates.map((candidate) => (
              <div className="list-item" key={candidate.id}>
                <strong>{candidate.level}</strong>
                <textarea
                  value={candidate.text}
                  readOnly
                  rows={6}
                  style={{ width: "100%", marginTop: 8 }}
                />
                <pre className="mono" style={{ maxHeight: 160, overflow: "auto" }}>
                  {candidate.unifiedDiff}
                </pre>
                <button
                  type="button"
                  onClick={() => applyCandidate(candidate.text, rewriteWasSelection)}
                >
                  Apply to Editor
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3>AI Run History</h3>
      <ul className="list">
        {aiHistoryQuery.data?.map((run) => (
          <li className="list-item" key={run.id}>
            <div>
              <strong>{run.runType}</strong> — {run.status}
            </div>
            <div className="mono">
              provider={run.providerId} model={run.model} latency={run.latencyMs}ms
            </div>
            <div className="mono">{run.createdAt}</div>
            {run.errorMessage && <div className="warn mono">{run.errorMessage}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
