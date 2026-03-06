import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { importReference, listReferences, tagReference } from "../../lib/tauri";
import { useUIStore } from "../../store/uiStore";
import { open } from "@tauri-apps/plugin-dialog";

export function ReferencesPanel() {
  const projectId = useUIStore((s) => s.projectId);
  const queryClient = useQueryClient();
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  const refsQuery = useQuery({
    queryKey: ["references", projectId, tagFilter],
    queryFn: () => listReferences(projectId ?? "", tagFilter),
    enabled: Boolean(projectId),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const selected = await open({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }] });
      if (!selected || typeof selected !== "string") return null;
      return importReference(projectId ?? "", selected);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["references", projectId] }),
  });

  const tagMutation = useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) => tagReference(id, tags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["references", projectId] });
      setEditingTagsFor(null);
    },
  });

  if (!projectId) {
    return <p style={{ fontSize: 12, color: "#9ca3af", padding: 8 }}>Select a project first.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          style={{ flex: 1, fontSize: 12 }}
          placeholder="Filter by tag…"
          value={tagFilter ?? ""}
          onChange={(e) => setTagFilter(e.target.value || null)}
        />
        <button
          type="button"
          style={{ fontSize: 12, flexShrink: 0 }}
          onClick={() => importMutation.mutate()}
        >
          + Import
        </button>
      </div>

      {refsQuery.data?.length === 0 && (
        <p style={{ fontSize: 12, color: "#9ca3af" }}>No references yet. Import an image.</p>
      )}

      {refsQuery.data?.map((ref) => (
        <div key={ref.id} className="compact-item">
          <div className="compact-item-title" style={{ wordBreak: "break-all" }}>
            {ref.storedPath.split(/[\\/]/).pop()}
          </div>
          <div className="compact-item-meta" style={{ marginTop: 3 }}>
            {ref.tags.length > 0
              ? ref.tags.map((t) => <span key={t} className="scope-badge free" style={{ marginRight: 3 }}>{t}</span>)
              : <span style={{ color: "#d1d5db" }}>no tags</span>
            }
          </div>
          {editingTagsFor === ref.id ? (
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <input
                autoFocus
                style={{ flex: 1, fontSize: 11 }}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="tag1, tag2…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") tagMutation.mutate({ id: ref.id, tags: tagInput.split(",").map((t) => t.trim()).filter(Boolean) });
                }}
              />
              <button type="button" style={{ fontSize: 11 }} onClick={() => tagMutation.mutate({ id: ref.id, tags: tagInput.split(",").map((t) => t.trim()).filter(Boolean) })}>Save</button>
              <button type="button" style={{ fontSize: 11 }} onClick={() => setEditingTagsFor(null)}>✕</button>
            </div>
          ) : (
            <button
              type="button"
              style={{ fontSize: 11, marginTop: 4, padding: "2px 8px" }}
              onClick={() => { setEditingTagsFor(ref.id); setTagInput(ref.tags.join(", ")); }}
            >
              Edit tags
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
