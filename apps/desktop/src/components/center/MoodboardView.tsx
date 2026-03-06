import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { analyzeMoodboard, createSnippet, listAIProviders, updateProject } from "../../lib/tauri";
import { useUIStore } from "../../store/uiStore";

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

export function MoodboardView() {
  const setCenterView = useUIStore((s) => s.setCenterView);
  const projectId = useUIStore((s) => s.projectId);
  const queryClient = useQueryClient();

  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [providerOverride, setProviderOverride] = useState("");
  const [editedStyle, setEditedStyle] = useState("");

  const aiProvidersQuery = useQuery({ queryKey: ["aiProviders"], queryFn: listAIProviders });

  // Tauri native drag-drop for reliable file paths on all platforms
  useEffect(() => {
    const setup = async () => {
      const unlisten = await listen<{ paths: string[] }>("tauri://drag-drop", (e) => {
        const imgs = e.payload.paths.filter((p) => IMAGE_EXT.test(p));
        if (imgs.length > 0) {
          setImagePaths((prev) => [...new Set([...prev, ...imgs])]);
          setDragOver(false);
        }
      });
      return unlisten;
    };
    const unlistenPromise = setup();
    return () => { unlistenPromise.then((u) => u()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Visual feedback for drag enter/leave
  useEffect(() => {
    const setupEnter = listen("tauri://drag-enter", () => setDragOver(true));
    const setupLeave = listen("tauri://drag-leave", () => setDragOver(false));
    return () => {
      setupEnter.then((u) => u());
      setupLeave.then((u) => u());
    };
  }, []);

  const analyzeMutation = useMutation({
    mutationFn: () =>
      analyzeMoodboard({
        imagePaths,
        providerIdOverride: providerOverride || null,
      }),
    onSuccess: (result) => {
      setEditedStyle(result.commonStyle);
    },
  });

  const saveAsSnippetMutation = useMutation({
    mutationFn: () =>
      createSnippet(projectId ?? "", "Moodboard style", "suffix", editedStyle, ["moodboard"]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snippets", projectId] });
    },
  });

  const setAsGlobalSuffixMutation = useMutation({
    mutationFn: () => updateProject(projectId ?? "", "", editedStyle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  async function addImages() {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    setImagePaths((prev) => [...new Set([...prev, ...paths])]);
  }

  function removeImage(path: string) {
    setImagePaths((prev) => prev.filter((p) => p !== path));
  }

  return (
    <div className="center-tool-view">
      {/* Header */}
      <div className="tool-view-header">
        <button type="button" className="back-btn" onClick={() => setCenterView("editor")}>
          ← Back to Editor
        </button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Moodboard Analyzer</h2>
        <select
          style={{ fontSize: 12, marginLeft: "auto" }}
          value={providerOverride}
          onChange={(e) => setProviderOverride(e.target.value)}
        >
          <option value="">Default AI (VLM)</option>
          {aiProvidersQuery.data?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="tool-view-body">
        {/* Drop zone + thumbnails */}
        <div
          className={`moodboard-drop-zone${dragOver ? " drag-over" : ""}`}
        >
          {imagePaths.length === 0 ? (
            <div className="drop-zone-hint">
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎨</div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Drop images here</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                5–20 images recommended for best results
              </div>
            </div>
          ) : (
            <div className="thumb-grid">
              {imagePaths.map((p) => (
                <div key={p} className="thumb-item">
                  <img
                    src={convertFileSrc(p)}
                    alt={p.split(/[\\/]/).pop()}
                    className="thumb-img"
                  />
                  <button
                    type="button"
                    className="thumb-remove"
                    onClick={() => removeImage(p)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {/* Add more tile */}
              <div
                className="thumb-add"
                onClick={addImages}
                title="Add more images"
              >
                <span style={{ fontSize: 20 }}>+</span>
              </div>
            </div>
          )}
        </div>

        {/* Action bar */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          {imagePaths.length === 0 ? (
            <button type="button" onClick={addImages}>+ Add images</button>
          ) : (
            <button type="button" onClick={addImages} style={{ fontSize: 12 }}>+ Add more</button>
          )}
          <span style={{ fontSize: 12, color: "#9ca3af" }}>
            {imagePaths.length} image{imagePaths.length !== 1 ? "s" : ""} selected
          </span>
          <button
            type="button"
            className="primary"
            style={{ marginLeft: "auto" }}
            disabled={imagePaths.length < 2 || analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate()}
          >
            {analyzeMutation.isPending ? "Analyzing…" : "Analyze Moodboard →"}
          </button>
        </div>

        {analyzeMutation.isError && (
          <p className="warn" style={{ fontSize: 12 }}>{String(analyzeMutation.error)}</p>
        )}

        {/* Results */}
        {analyzeMutation.data && (
          <div className="moodboard-results">
            {analyzeMutation.data.variations && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                  Variations across images
                </div>
                <p style={{ fontSize: 13, color: "#374151", margin: 0 }}>
                  {analyzeMutation.data.variations}
                </p>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                Common style (editable)
              </div>
              <textarea
                style={{ width: "100%", minHeight: 100, fontSize: 13, boxSizing: "border-box" }}
                value={editedStyle}
                onChange={(e) => setEditedStyle(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="primary"
                disabled={!editedStyle.trim() || !projectId || saveAsSnippetMutation.isPending}
                onClick={() => saveAsSnippetMutation.mutate()}
              >
                {saveAsSnippetMutation.isPending ? "Saving…" : "Save as Suffix Snippet"}
              </button>
              <button
                type="button"
                disabled={
                  !editedStyle.trim() || !projectId || setAsGlobalSuffixMutation.isPending
                }
                onClick={() => setAsGlobalSuffixMutation.mutate()}
              >
                {setAsGlobalSuffixMutation.isPending ? "Saving…" : "Set as Project Global Suffix"}
              </button>
              {(saveAsSnippetMutation.isSuccess || setAsGlobalSuffixMutation.isSuccess) && (
                <span style={{ fontSize: 12, color: "#065f46", alignSelf: "center" }}>Saved ✓</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
