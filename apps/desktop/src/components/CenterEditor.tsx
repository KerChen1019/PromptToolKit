import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type * as monaco from "monaco-editor";
import {
  commitPromptVersion,
  copyWithPayload,
  getDefaultAIProviderId,
  listAIProviders,
  listPromptsByProject,
  rewritePromptCandidates,
  savePromptDraft,
} from "../lib/tauri";
import { useUIStore } from "../store/uiStore";
import { setInsertSnippetToEditor } from "./panels/SnippetsPanel";

interface BubbleState {
  visible: boolean;
  top: number;
  left: number;
}

export function CenterEditor() {
  const queryClient = useQueryClient();
  const projectId = useUIStore((s) => s.projectId);
  const promptId = useUIStore((s) => s.promptId);
  const editorText = useUIStore((s) => s.editorText);
  const setEditorText = useUIStore((s) => s.setEditorText);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const [bubble, setBubble] = useState<BubbleState>({ visible: false, top: 0, left: 0 });
  const [preserveVoice, setPreserveVoice] = useState(true);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [rewriteWasSelection, setRewriteWasSelection] = useState(false);
  const [providerOverride, setProviderOverride] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // Snippet picker state (slash command)
  const [snippetPicker, setSnippetPicker] = useState<{ visible: boolean; top: number; left: number; query: string }>({
    visible: false, top: 0, left: 0, query: "",
  });
  const [snippetPickerFocus, setSnippetPickerFocus] = useState(0);

  const promptsQuery = useQuery({
    queryKey: ["prompts", projectId],
    queryFn: () => listPromptsByProject(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const aiProvidersQuery = useQuery({ queryKey: ["aiProviders"], queryFn: listAIProviders });
  const defaultProviderQuery = useQuery({ queryKey: ["defaultAIProviderId"], queryFn: getDefaultAIProviderId });

  useEffect(() => {
    if (defaultProviderQuery.data && !providerOverride) {
      setProviderOverride(defaultProviderQuery.data);
    }
  }, [defaultProviderQuery.data, providerOverride]);

  const selectedPrompt = useMemo(
    () => promptsQuery.data?.find((p) => p.id === promptId) ?? null,
    [promptsQuery.data, promptId],
  );

  const saveDraftMutation = useMutation({
    mutationFn: () => savePromptDraft(promptId ?? "", editorText),
    onSuccess: () => {
      setMessage("Draft saved");
      queryClient.invalidateQueries({ queryKey: ["prompts", projectId] });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const version = await commitPromptVersion(promptId ?? "", editorText, "Manual commit", "local-user");
      await copyWithPayload({ projectId: projectId ?? "", promptId: promptId ?? "", promptVersionId: version.id, promptText: editorText });
      return version;
    },
    onSuccess: () => {
      setMessage("Committed and copied with metadata");
      queryClient.invalidateQueries({ queryKey: ["prompts", projectId] });
      queryClient.invalidateQueries({ queryKey: ["versions", promptId] });
    },
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiRunHistory", projectId] });
    },
  });

  function getEditorSelection(): string | null {
    const editor = editorRef.current;
    if (!editor) return null;
    const sel = editor.getSelection();
    if (!sel || sel.isEmpty()) return null;
    return editor.getModel()?.getValueInRange(sel) ?? null;
  }

  function applyCandidate(text: string) {
    const editor = editorRef.current;
    if (rewriteWasSelection && editor) {
      const sel = editor.getSelection();
      if (sel) {
        editor.executeEdits("rewrite", [{ range: sel, text }]);
        setEditorText(editor.getValue());
        setCandidateOpen(false);
        return;
      }
    }
    setEditorText(text);
    setCandidateOpen(false);
  }

  // Insert snippet at cursor
  const insertAtCursor = useCallback((snippetText: string) => {
    const editor = editorRef.current;
    if (!editor) { setEditorText(editorText + "\n" + snippetText); return; }
    const position = editor.getPosition();
    if (!position) { setEditorText(editorText + "\n" + snippetText); return; }
    editor.executeEdits("snippet-insert", [{
      range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column },
      text: snippetText,
    }]);
    setEditorText(editor.getValue());
  }, [editorText, setEditorText]);

  // Register the insert function so SnippetsPanel can call it
  useEffect(() => {
    setInsertSnippetToEditor(insertAtCursor);
    return () => setInsertSnippetToEditor(null);
  }, [insertAtCursor]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;

    // Modifier bubble: show on non-empty selection
    editor.onDidChangeCursorSelection((e) => {
      const sel = e.selection;
      if (sel.isEmpty()) {
        setBubble((prev) => ({ ...prev, visible: false }));
        return;
      }
      const container = editorContainerRef.current;
      if (!container) return;
      const pos = editor.getScrolledVisiblePosition(sel.getStartPosition());
      if (!pos) return;
      // pos is relative to editor DOM top-left
      const bubbleTop = pos.top - 40; // show above selection
      const bubbleLeft = pos.left;
      setBubble({ visible: true, top: Math.max(0, bubbleTop), left: Math.max(0, bubbleLeft) });
    });

    // Slash command for snippets: detect "/" at start of word
    editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) return;
      const lineContent = model.getLineContent(position.lineNumber);
      const charBefore = lineContent.slice(0, position.column - 1);
      const slashIdx = charBefore.lastIndexOf("/");
      if (slashIdx !== -1 && !charBefore.slice(slashIdx + 1).includes(" ")) {
        const query = charBefore.slice(slashIdx + 1);
        const pos = editor.getScrolledVisiblePosition(position);
        if (pos) {
          setSnippetPicker({ visible: true, top: pos.top + 20, left: pos.left, query });
          setSnippetPickerFocus(0);
        }
      } else {
        setSnippetPicker((prev) => ({ ...prev, visible: false }));
      }
    });
  };

  const snippetsQuery = useQuery({
    queryKey: ["snippets", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { listSnippets } = await import("../lib/tauri");
      return listSnippets(projectId);
    },
    enabled: Boolean(projectId),
  });

  const filteredSnippets = useMemo(() => {
    const q = snippetPicker.query.toLowerCase();
    return (snippetsQuery.data ?? []).filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [snippetsQuery.data, snippetPicker.query]);

  function insertSnippetFromPicker(snippetContent: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const pos = editor.getPosition();
    if (!pos) return;
    const model = editor.getModel();
    if (!model) return;
    const lineContent = model.getLineContent(pos.lineNumber);
    const slashIdx = lineContent.lastIndexOf("/", pos.column - 2);
    if (slashIdx === -1) return;
    editor.executeEdits("snippet-picker", [{
      range: { startLineNumber: pos.lineNumber, startColumn: slashIdx + 1, endLineNumber: pos.lineNumber, endColumn: pos.column },
      text: snippetContent,
    }]);
    setEditorText(editor.getValue());
    setSnippetPicker((prev) => ({ ...prev, visible: false }));
  }

  return (
    <div className="center-editor">
      {/* Toolbar */}
      <div className="editor-toolbar">
        <span className="editor-breadcrumb">
          {selectedPrompt
            ? <><strong>{selectedPrompt.title}</strong></>
            : <span style={{ color: "#d1d5db" }}>No prompt selected</span>
          }
        </span>

        <select
          value={providerOverride}
          onChange={(e) => setProviderOverride(e.target.value)}
          style={{ fontSize: 12, padding: "4px 8px" }}
        >
          <option value="">Default AI provider</option>
          {aiProvidersQuery.data?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <button type="button" style={{ fontSize: 12 }} onClick={() => saveDraftMutation.mutate()} disabled={!promptId}>
          Save
        </button>
        <button type="button" className="primary" style={{ fontSize: 12 }} onClick={() => commitMutation.mutate()} disabled={!promptId}>
          Commit + Copy
        </button>
        {message && <span className="ok" style={{ fontSize: 12 }}>{message}</span>}
      </div>

      {/* Monaco editor with selection bubble */}
      <div className="editor-wrap" ref={editorContainerRef}>
        <Editor
          height="100%"
          defaultLanguage="markdown"
          theme="vs"
          value={editorText}
          onChange={(v) => setEditorText(v ?? "")}
          onMount={handleEditorMount}
          options={{ minimap: { enabled: false }, wordWrap: "on", fontSize: 14, lineHeight: 22, scrollBeyondLastLine: false }}
        />

        {/* Modifier bubble */}
        {bubble.visible && (
          <div
            className="modifier-bubble"
            style={{ top: bubble.top, left: bubble.left }}
          >
            <button
              type="button"
              onClick={() => {
                setBubble((prev) => ({ ...prev, visible: false }));
                setCandidateOpen(true);
              }}
            >
              ✏ Rewrite
            </button>
            <span className="divider" />
            <label style={{ fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
              <input
                type="checkbox"
                checked={preserveVoice}
                onChange={(e) => setPreserveVoice(e.target.checked)}
                style={{ width: 12, height: 12 }}
              />
              Preserve voice
            </label>
          </div>
        )}

        {/* Snippet picker */}
        {snippetPicker.visible && filteredSnippets.length > 0 && (
          <div
            className="snippet-picker"
            style={{ top: snippetPicker.top, left: snippetPicker.left }}
          >
            {filteredSnippets.map((s, i) => (
              <div
                key={s.id}
                className={`snippet-picker-item${i === snippetPickerFocus ? " focused" : ""}`}
                onMouseEnter={() => setSnippetPickerFocus(i)}
                onClick={() => insertSnippetFromPicker(s.content)}
              >
                <span className={`scope-badge ${s.scope}`}>{s.scope}</span>
                <span>{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Candidate area */}
      <div className={`candidate-area${candidateOpen ? " open" : ""}`}>
        <div className="candidate-area-header">
          <span>Rewrite candidates</span>
          {rewriteWasSelection && <span className="scope-tag">selection only</span>}
          <button type="button" onClick={() => setCandidateOpen(false)}>✕</button>
        </div>
        <div className="candidate-instruction">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Rewrite instruction (e.g. pull back to a wider angle)…"
            onKeyDown={(e) => { if (e.key === "Enter" && instruction.trim()) rewriteMutation.mutate(); }}
          />
          <button
            type="button"
            className="primary"
            style={{ fontSize: 12, flexShrink: 0 }}
            onClick={() => rewriteMutation.mutate()}
            disabled={!instruction.trim() || rewriteMutation.isPending}
          >
            {rewriteMutation.isPending ? "…" : "Rewrite"}
          </button>
        </div>
        {rewriteMutation.isError && (
          <p className="warn mono" style={{ padding: "4px 12px", fontSize: 11 }}>
            {String(rewriteMutation.error)}
          </p>
        )}
        {rewriteMutation.data?.candidates && (
          <div className="candidate-cards">
            {rewriteMutation.data.candidates.map((c) => (
              <div className="candidate-card" key={c.id}>
                <div className={`candidate-card-label ${c.level}`}>{c.level}</div>
                <div className="candidate-card-text">{c.text}</div>
                <pre className="candidate-diff">{c.unifiedDiff}</pre>
                <button type="button" style={{ width: "100%", fontSize: 12 }} onClick={() => applyCandidate(c.text)}>
                  Apply
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
