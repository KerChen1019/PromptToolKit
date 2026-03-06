import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  deleteReference,
  importReference,
  linkReferenceToPrompt,
  listPromptsByProject,
  listReferences,
  tagReference,
} from "../../lib/tauri";
import { useUIStore } from "../../store/uiStore";

type PromptFilterMode = "all" | "current-prompt";

const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;
const REFERENCE_BUILTIN_TAGS = [
  "Structure Reference",
  "Character Reference",
  "Motion Reference",
  "Style Reference",
  "Lighting Reference",
  "Color Reference",
  "Camera Reference",
  "Composition Reference",
];

function isVideoPath(path: string) {
  return VIDEO_EXT.test(path);
}

function parseTagDraft(input: string) {
  return input
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function ReferencesPanel() {
  const projectId = useUIStore((s) => s.projectId);
  const promptId = useUIStore((s) => s.promptId);
  const queryClient = useQueryClient();

  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [promptFilterMode, setPromptFilterMode] = useState<PromptFilterMode>("all");
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [lightboxAssetId, setLightboxAssetId] = useState<string | null>(null);

  const promptsQuery = useQuery({
    queryKey: ["prompts", projectId],
    queryFn: () => listPromptsByProject(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const refsQuery = useQuery({
    queryKey: ["references", projectId, tagFilter, promptFilterMode, promptId],
    queryFn: () =>
      listReferences(
        projectId ?? "",
        tagFilter,
        promptFilterMode === "current-prompt" ? promptId : null,
      ),
    enabled: Boolean(projectId),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Media",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm", "m4v"],
          },
        ],
      });
      if (!selected || typeof selected !== "string") {
        return null;
      }
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

  const deleteMutation = useMutation({
    mutationFn: (assetId: string) => deleteReference(assetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["references", projectId] });
      setLightboxAssetId(null);
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({ assetId, nextPromptId }: { assetId: string; nextPromptId: string | null }) =>
      linkReferenceToPrompt(assetId, nextPromptId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["references", projectId] }),
  });

  const currentPrompt = useMemo(
    () => promptsQuery.data?.find((prompt) => prompt.id === promptId) ?? null,
    [promptId, promptsQuery.data],
  );
  const lightboxAsset = refsQuery.data?.find((asset) => asset.id === lightboxAssetId) ?? null;

  if (!projectId) {
    return <p style={{ fontSize: 12, color: "#9ca3af", padding: 8 }}>Select a project first.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          style={{ flex: 1, fontSize: 12 }}
          placeholder="Filter by tag..."
          value={tagFilter ?? ""}
          onChange={(event) => setTagFilter(event.target.value || null)}
        />
        <button type="button" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => importMutation.mutate()}>
          + Import
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          className={promptFilterMode === "all" ? "primary sm" : "sm"}
          onClick={() => setPromptFilterMode("all")}
        >
          All
        </button>
        <button
          type="button"
          className={promptFilterMode === "current-prompt" ? "primary sm" : "sm"}
          onClick={() => setPromptFilterMode("current-prompt")}
          disabled={!promptId}
          title={promptId ? undefined : "Select a prompt first"}
        >
          {currentPrompt ? `Current Prompt: ${currentPrompt.title}` : "Current Prompt"}
        </button>
      </div>

      {importMutation.isError && (
        <p className="warn" style={{ fontSize: 12 }}>
          {String(importMutation.error)}
        </p>
      )}

      {refsQuery.data?.length === 0 && (
        <p style={{ fontSize: 12, color: "#9ca3af" }}>No references yet. Import an image or video.</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {refsQuery.data?.map((asset) => {
          const fileName = asset.storedPath.split(/[\\/]/).pop() ?? asset.storedPath;
          const isLinkedToCurrentPrompt = Boolean(promptId) && asset.promptId === promptId;
          const isVideo = isVideoPath(asset.storedPath);
          const parsedDraftTags = parseTagDraft(tagInput);

          return (
            <div
              key={asset.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 8,
                background: "var(--bg-surface)",
                display: "grid",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setLightboxAssetId(asset.id)}
                style={{
                  padding: 0,
                  overflow: "hidden",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                  aspectRatio: "1 / 1",
                }}
              >
                {isVideo ? (
                  <video
                    src={convertFileSrc(asset.storedPath)}
                    muted
                    playsInline
                    preload="metadata"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <img
                    src={convertFileSrc(asset.storedPath)}
                    alt={fileName}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                )}
              </button>

              <div style={{ minWidth: 0 }}>
                <div className="compact-item-title" style={{ marginBottom: 4, wordBreak: "break-word" }}>
                  {fileName}
                </div>
                <div className="compact-item-meta">
                  {asset.width && asset.height
                    ? `${asset.width} x ${asset.height}`
                    : isVideo
                      ? "Video reference"
                      : "Image reference"}
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {asset.tags.length > 0 ? (
                  asset.tags.map((tag) => (
                    <span key={`${asset.id}-${tag}`} className="scope-badge free">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 11, color: "#cbd5e1" }}>no tags</span>
                )}
              </div>

              {editingTagsFor === asset.id ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input
                      autoFocus
                      style={{ flex: 1, fontSize: 11 }}
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      placeholder="tag1, tag2..."
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          tagMutation.mutate({
                            id: asset.id,
                            tags: parseTagDraft(tagInput),
                          });
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="sm"
                      onClick={() =>
                        tagMutation.mutate({
                          id: asset.id,
                          tags: parseTagDraft(tagInput),
                        })
                      }
                    >
                      Save
                    </button>
                    <button type="button" className="xs" onClick={() => setEditingTagsFor(null)}>
                      x
                    </button>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {REFERENCE_BUILTIN_TAGS.map((tag) => {
                      const selected = parsedDraftTags.includes(tag);
                      return (
                        <button
                          key={`${asset.id}-${tag}`}
                          type="button"
                          className="xs"
                          style={{
                            borderRadius: 999,
                            borderColor: selected ? "var(--accent)" : "var(--border)",
                            background: selected ? "var(--accent-bg)" : "var(--bg-surface)",
                            color: selected ? "var(--accent)" : "var(--text-muted)",
                          }}
                          onClick={() => {
                            const next = new Set(parsedDraftTags);
                            if (next.has(tag)) {
                              next.delete(tag);
                            } else {
                              next.add(tag);
                            }
                            setTagInput(Array.from(next).join(", "));
                          }}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="sm"
                    onClick={() => {
                      setEditingTagsFor(asset.id);
                      setTagInput(asset.tags.join(", "));
                    }}
                  >
                    Edit tags
                  </button>
                  <button
                    type="button"
                    className="sm"
                    style={isLinkedToCurrentPrompt ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}
                    onClick={() =>
                      linkMutation.mutate({
                        assetId: asset.id,
                        nextPromptId: isLinkedToCurrentPrompt ? null : promptId,
                      })
                    }
                    disabled={!promptId}
                    title={promptId ? undefined : "Select a prompt first"}
                  >
                    {isLinkedToCurrentPrompt ? "Unlink" : "Link"}
                  </button>
                  <button
                    type="button"
                    className="sm danger"
                    onClick={() => {
                      if (!window.confirm(`Delete reference "${fileName}"?`)) {
                        return;
                      }
                      deleteMutation.mutate(asset.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lightboxAsset && (
        <div
          className="overlay-backdrop"
          onClick={() => setLightboxAssetId(null)}
          style={{ alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(960px, 92vw)",
              maxHeight: "88vh",
              background: "#fff",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              display: "grid",
              gridTemplateRows: "auto 1fr",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-word" }}>
                  {lightboxAsset.storedPath.split(/[\\/]/).pop()}
                </div>
                <div className="compact-item-meta">
                  {lightboxAsset.tags.length > 0 ? lightboxAsset.tags.join(", ") : "No tags"}
                </div>
              </div>
              <button type="button" onClick={() => setLightboxAssetId(null)}>
                Close
              </button>
            </div>
            <div style={{ padding: 16, overflow: "auto", background: "#f8fafc" }}>
              {isVideoPath(lightboxAsset.storedPath) ? (
                <video
                  src={convertFileSrc(lightboxAsset.storedPath)}
                  controls
                  style={{ width: "100%", height: "auto", display: "block", borderRadius: 10 }}
                />
              ) : (
                <img
                  src={convertFileSrc(lightboxAsset.storedPath)}
                  alt={lightboxAsset.storedPath}
                  style={{ width: "100%", height: "auto", display: "block", borderRadius: 10 }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
