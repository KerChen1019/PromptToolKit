import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSnippet, deleteSnippet, listSnippets } from "../../lib/tauri";
import {
  CANONICAL_TAG_PRESETS,
  CANONICAL_TAGS,
  TAG_DRAG_MIME,
  canonicalTagLabel,
  normalizeTagForStorage,
} from "../../lib/tagTaxonomy";
import { useUIStore } from "../../store/uiStore";
import type { Scope } from "../../types/domain";

export let insertSnippetToEditor: ((text: string) => void) | null = null;
export function setInsertSnippetToEditor(fn: ((text: string) => void) | null) {
  insertSnippetToEditor = fn;
}

const SCOPES: Scope[] = ["prefix", "free", "suffix"];

function normalizeTag(value: string): string {
  return normalizeTagForStorage(value);
}

function parseTagsInput(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of input.split(",")) {
    const normalized = normalizeTag(part);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function setDragTagPayload(dataTransfer: DataTransfer, tag: string) {
  const normalized = normalizeTag(tag);
  if (!normalized) {
    return;
  }
  dataTransfer.setData(TAG_DRAG_MIME, normalized);
  dataTransfer.setData("text/plain", normalized);
  dataTransfer.effectAllowed = "copy";
}

export function SnippetsPanel() {
  const projectId = useUIStore((s) => s.projectId);
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<Scope>("free");
  const [newContent, setNewContent] = useState("");
  const [newTagsText, setNewTagsText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");

  const snippetsQuery = useQuery({
    queryKey: ["snippets", projectId],
    queryFn: () => listSnippets(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createSnippet(
        projectId ?? "",
        newName.trim(),
        newScope,
        newContent.trim(),
        parseTagsInput(newTagsText),
      ),
    onSuccess: () => {
      setNewName("");
      setNewScope("free");
      setNewContent("");
      setNewTagsText("");
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["snippets", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSnippet(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["snippets", projectId] }),
  });

  const snippets = snippetsQuery.data ?? [];
  const search = searchText.trim().toLowerCase();

  const tagSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const snippet of snippets) {
      for (const tag of snippet.tags) {
        const key = normalizeTag(tag);
        if (!key) {
          continue;
        }
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const allTags = Array.from(counts.keys()).sort();
    for (const preset of CANONICAL_TAG_PRESETS) {
      if (!allTags.includes(preset)) {
        allTags.unshift(preset);
      }
    }
    return { counts, allTags: Array.from(new Set(allTags)) };
  }, [snippets]);

  const filteredSnippets = useMemo(() => {
    return snippets.filter((snippet) => {
      if (activeTag !== "all") {
        const hasTag = snippet.tags.some((tag) => normalizeTag(tag) === activeTag);
        if (!hasTag) {
          return false;
        }
      }
      if (!search) {
        return true;
      }
      const haystack = `${snippet.name} ${snippet.content} ${snippet.tags.join(" ")}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [snippets, activeTag, search]);

  const snippetsByScope = (scope: Scope) =>
    filteredSnippets.filter((snippet) => snippet.scope === scope);

  function appendPresetTag(tag: string) {
    const tags = parseTagsInput(newTagsText);
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
    setNewTagsText(tags.join(", "));
  }

  if (!projectId) {
    return <p style={{ fontSize: 12, color: "#9ca3af", padding: 8 }}>Select a project first.</p>;
  }

  return (
    <div>
      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
          Drag tags from here into Prompt Generator dimension fields.
        </p>
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search snippets or tags..."
          style={{ fontSize: 12 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button
            type="button"
            className={activeTag === "all" ? "primary" : ""}
            style={{ fontSize: 11, padding: "3px 8px" }}
            onClick={() => setActiveTag("all")}
          >
            all ({snippets.length})
          </button>
          {tagSummary.allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={activeTag === tag ? "primary" : ""}
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => setActiveTag(tag)}
              draggable
              onDragStart={(e) => setDragTagPayload(e.dataTransfer, tag)}
              title="Drag this tag to Prompt Generator"
            >
              {canonicalTagLabel(tag)} ({tagSummary.counts.get(tag) ?? 0})
            </button>
          ))}
        </div>
      </div>

      {SCOPES.map((scope) => {
        const items = snippetsByScope(scope);
        if (items.length === 0) {
          return null;
        }
        return (
          <div key={scope} style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#9ca3af",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              {scope}
            </div>
            {items.map((snippet) => (
              <div key={snippet.id} className="compact-item">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`scope-badge ${snippet.scope}`}>{snippet.scope}</span>
                  <span className="compact-item-title" style={{ flex: 1 }}>
                    {snippet.name}
                  </span>
                  <button
                    type="button"
                    style={{ fontSize: 11, padding: "2px 8px" }}
                    onClick={() => insertSnippetToEditor?.(snippet.content)}
                  >
                    Insert
                  </button>
                  <button
                    type="button"
                    style={{ fontSize: 11, padding: "2px 6px", color: "#ef4444", borderColor: "#fca5a5" }}
                    onClick={() => deleteMutation.mutate(snippet.id)}
                  >
                    x
                  </button>
                </div>
                <div
                  className="compact-item-meta mono"
                  style={{ marginTop: 4, maxHeight: 40, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {snippet.content.slice(0, 80)}
                  {snippet.content.length > 80 ? "..." : ""}
                </div>
                {snippet.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {snippet.tags.map((tag) => {
                      const key = normalizeTag(tag);
                      if (!key) {
                        return null;
                      }
                      return (
                        <button
                          key={`${snippet.id}-${key}`}
                          type="button"
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: activeTag === key ? "#dbeafe" : "#f1f5f9",
                            borderColor: activeTag === key ? "#93c5fd" : "#e2e8f0",
                          }}
                          onClick={() => setActiveTag(key)}
                          draggable
                          onDragStart={(e) => setDragTagPayload(e.dataTransfer, key)}
                          title="Drag this tag to Prompt Generator"
                        >
                          {canonicalTagLabel(key)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {filteredSnippets.length === 0 && !showCreate && (
        <p style={{ fontSize: 12, color: "#9ca3af" }}>
          {snippets.length === 0 ? "No snippets yet." : "No snippets match this tag/search."}
        </p>
      )}

      {showCreate ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Snippet name"
              style={{ fontSize: 12 }}
            />
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as Scope)}
              style={{ fontSize: 12 }}
            >
              {SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Snippet content..."
              rows={4}
              style={{ fontSize: 12, resize: "vertical" }}
            />
            <input
              value={newTagsText}
              onChange={(e) => setNewTagsText(e.target.value)}
              placeholder="tags: subject-action, camera-lens, lighting..."
              style={{ fontSize: 12 }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CANONICAL_TAGS.map((def) => (
                <button
                  key={def.key}
                  type="button"
                  style={{ fontSize: 11, padding: "2px 8px" }}
                  onClick={() => appendPresetTag(def.key)}
                >
                  + {def.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="primary"
                style={{ fontSize: 12 }}
                onClick={() => createMutation.mutate()}
                disabled={!newName.trim() || !newContent.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Saving..." : "Save"}
              </button>
              <button type="button" style={{ fontSize: 12 }} onClick={() => setShowCreate(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          style={{ width: "100%", marginTop: 8, fontSize: 12, textAlign: "center" }}
          onClick={() => setShowCreate(true)}
        >
          + New Snippet
        </button>
      )}
    </div>
  );
}
