import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSnippet,
  deleteSnippet,
  insertSnippetPreview,
  listSnippets,
} from "../lib/tauri";
import { useUIStore } from "../store/uiStore";
import type { Scope } from "../types/domain";

export function SnippetLibraryPanel() {
  const queryClient = useQueryClient();
  const projectId = useUIStore((s) => s.projectId);
  const editorText = useUIStore((s) => s.editorText);
  const setEditorText = useUIStore((s) => s.setEditorText);
  const [name, setName] = useState("snippet_name");
  const [scope, setScope] = useState<Scope>("prefix");
  const [content, setContent] = useState("cinematic lighting");
  const [tagsText, setTagsText] = useState("style");
  const [previewText, setPreviewText] = useState("");

  const snippetsQuery = useQuery({
    queryKey: ["snippets", projectId],
    queryFn: () => listSnippets(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createSnippet(
        projectId ?? "",
        name.trim(),
        scope,
        content,
        tagsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snippets", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSnippet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snippets", projectId] });
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => insertSnippetPreview(projectId ?? "", editorText, []),
    onSuccess: (text) => setPreviewText(text),
  });

  return (
    <section className="panel">
      <h2>SnippetLibraryPanel</h2>
      <p>
        Snippet scope rule: <code>prefix -&gt; free -&gt; suffix</code>.
      </p>
      {!projectId && <p className="warn">Select a project in EditorWorkspace first.</p>}
      <div className="grid-2">
        <div>
          <h3>Create Snippet</h3>
          <div className="toolbar">
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="prefix">prefix</option>
              <option value="free">free</option>
              <option value="suffix">suffix</option>
            </select>
          </div>
          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{ width: "100%" }}
          />
          <div className="toolbar">
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="comma tags"
            />
            <button
              className="primary"
              type="button"
              disabled={!projectId}
              onClick={() => createMutation.mutate()}
            >
              Create
            </button>
          </div>
        </div>
        <div>
          <h3>Snippet Preview</h3>
          <p className="mono">
            Preview applies all project snippets with fixed scope ordering.
          </p>
          <button
            type="button"
            onClick={() => previewMutation.mutate()}
            disabled={!projectId}
          >
            Insert Preview
          </button>
          {previewText && (
            <>
              <textarea
                rows={8}
                value={previewText}
                readOnly
                style={{ width: "100%", marginTop: 8 }}
              />
              <button type="button" onClick={() => setEditorText(previewText)}>
                Apply to Editor
              </button>
            </>
          )}
        </div>
      </div>
      <h3>Snippet List</h3>
      <ul className="list">
        {snippetsQuery.data?.map((snippet) => (
          <li className="list-item" key={snippet.id}>
            <div>
              <strong>{snippet.name}</strong> ({snippet.scope})
            </div>
            <div>{snippet.content}</div>
            <div className="mono">{snippet.tags.join(", ")}</div>
            <button type="button" onClick={() => deleteMutation.mutate(snippet.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
