import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { analyzeImage, createSnippet, listAIProviders } from "../../lib/tauri";
import { canonicalTagLabel, normalizeTagForStorage } from "../../lib/tagTaxonomy";
import { useUIStore } from "../../store/uiStore";
import type { ImageDimensionResult } from "../../types/domain";
import { insertSnippetToEditor } from "../panels/SnippetsPanel";

const JUNK_WORDS = /\b(masterpiece|best quality|highly detailed|ultra realistic|award winning|4k|8k|hdr)\b/gi;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

function cleanCoreText(input: string): string {
  return input.replace(JUNK_WORDS, "").replace(/\s+/g, " ").trim();
}

export function ImageAnalyzerView() {
  const setCenterView = useUIStore((s) => s.setCenterView);
  const setRightPanel = useUIStore((s) => s.setRightPanel);
  const projectId = useUIStore((s) => s.projectId);
  const queryClient = useQueryClient();

  const [imagePath, setImagePath] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [providerOverride, setProviderOverride] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [savedDimensions, setSavedDimensions] = useState<Set<string>>(new Set());

  const aiProvidersQuery = useQuery({ queryKey: ["aiProviders"], queryFn: listAIProviders });

  useEffect(() => {
    const setup = async () => {
      const unlisten = await listen<{ paths: string[] }>("tauri://drag-drop", (e) => {
        const img = e.payload.paths.find((p) => IMAGE_EXT.test(p));
        if (img) {
          setImagePath(img);
          setDragOver(false);
          analyzeMutation.reset();
          setChecked(new Set());
          setSavedDimensions(new Set());
        }
      });
      return unlisten;
    };
    const unlistenPromise = setup();
    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      analyzeImage({
        imagePath: imagePath!,
        providerIdOverride: providerOverride || null,
      }),
    onSuccess: (results) => {
      const autoChecked = new Set(
        results.filter((r) => r.confidence !== "low").map((r) => r.dimension),
      );
      setChecked(autoChecked);
      setSavedDimensions(new Set());
      setExpandedDetails(new Set());
    },
  });

  const saveSnippetsMutation = useMutation({
    mutationFn: async (items: ImageDimensionResult[]) => {
      const pid = projectId ?? "";
      if (!pid) {
        throw new Error("Select a project first.");
      }
      const saved: string[] = [];
      for (const item of items) {
        const content = cleanCoreText(item.core);
        if (!content) {
          continue;
        }
        const normalizedTag = normalizeTagForStorage(item.dimension);
        await createSnippet(
          pid,
          `Image - ${canonicalTagLabel(normalizedTag)}`,
          "free",
          content,
          [normalizedTag].filter(Boolean),
        );
        saved.push(item.dimension);
      }
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["snippets", projectId] });
      setSavedDimensions((prev) => {
        const next = new Set(prev);
        for (const dim of saved) {
          next.add(dim);
        }
        return next;
      });
      setRightPanel("snippets");
    },
  });

  async function pickImage() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (selected && typeof selected === "string") {
      setImagePath(selected);
      analyzeMutation.reset();
      setChecked(new Set());
      setSavedDimensions(new Set());
      setExpandedDetails(new Set());
    }
  }

  function toggleCheck(dim: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) {
        next.delete(dim);
      } else {
        next.add(dim);
      }
      return next;
    });
  }

  function toggleDetail(dim: string) {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) {
        next.delete(dim);
      } else {
        next.add(dim);
      }
      return next;
    });
  }

  function buildSelectedText(results: ImageDimensionResult[]): string {
    return results
      .filter((r) => checked.has(r.dimension))
      .map((r) => cleanCoreText(r.core))
      .filter((t) => t.length > 0)
      .join(", ");
  }

  function saveItemsAsSnippets(items: ImageDimensionResult[]) {
    if (!projectId || items.length === 0 || saveSnippetsMutation.isPending) {
      return;
    }
    saveSnippetsMutation.mutate(items);
  }

  const results: ImageDimensionResult[] = analyzeMutation.data ?? [];
  const imageUrl = imagePath ? convertFileSrc(imagePath) : null;

  return (
    <div className="center-tool-view">
      <div className="tool-view-header">
        <button type="button" className="back-btn" onClick={() => setCenterView("editor")}>
          Back to Editor
        </button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Image Analyzer</h2>
        <select
          style={{ fontSize: 12, marginLeft: "auto" }}
          value={providerOverride}
          onChange={(e) => setProviderOverride(e.target.value)}
        >
          <option value="">Default AI (VLM)</option>
          {aiProvidersQuery.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="tool-view-body">
        <div
          className={`image-drop-zone${dragOver ? " drag-over" : ""}${imagePath ? " has-image" : ""}`}
          onClick={!imagePath ? pickImage : undefined}
          style={{ cursor: imagePath ? "default" : "pointer" }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Selected"
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6 }}
            />
          ) : (
            <div className="drop-zone-hint">
              <div style={{ fontSize: 32, marginBottom: 8 }}>[IMG]</div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Drop image here</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>or click to select a file</div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          {imagePath && (
            <button type="button" onClick={pickImage} style={{ fontSize: 12 }}>
              Change image
            </button>
          )}
          <span
            style={{
              fontSize: 12,
              color: "#9ca3af",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {imagePath ? imagePath.split(/[\\/]/).pop() : "No image selected"}
          </span>
          <button
            type="button"
            className="primary"
            disabled={!imagePath || analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate()}
          >
            {analyzeMutation.isPending ? "Analyzing..." : "Analyze Image ->"}
          </button>
        </div>

        {analyzeMutation.isError && (
          <p className="warn" style={{ fontSize: 12 }}>
            {String(analyzeMutation.error)}
          </p>
        )}

        {results.length > 0 && (
          <div className="analyzer-results">
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              Select dimensions to insert into the editor, or send each one separately to snippets.
            </div>
            <div className="dim-list">
              {results.map((r) => (
                <div key={r.dimension} className="dim-row">
                  <input
                    type="checkbox"
                    className="dim-check"
                    checked={checked.has(r.dimension)}
                    onChange={() => toggleCheck(r.dimension)}
                  />
                  <div className="dim-body">
                    <div className="dim-label">{r.dimension}</div>
                    <div className="dim-core">{cleanCoreText(r.core)}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className={`dim-confidence ${r.confidence}`}>
                        {r.confidence} confidence
                      </span>
                      {r.detail && (
                        <button
                          type="button"
                          className="dim-detail-toggle"
                          onClick={() => toggleDetail(r.dimension)}
                        >
                          {expandedDetails.has(r.dimension) ? "Hide detail" : "Show detail"}
                        </button>
                      )}
                    </div>
                    {expandedDetails.has(r.dimension) && r.detail && (
                      <div className="dim-detail">{r.detail}</div>
                    )}
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        style={{ fontSize: 11, padding: "3px 8px" }}
                        disabled={!projectId || saveSnippetsMutation.isPending}
                        onClick={() => saveItemsAsSnippets([r])}
                      >
                        Send to Snippets
                      </button>
                      {savedDimensions.has(r.dimension) && (
                        <span style={{ fontSize: 11, color: "#065f46" }}>Sent</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="primary"
                disabled={checked.size === 0}
                onClick={() => {
                  insertSnippetToEditor?.(buildSelectedText(results));
                  setCenterView("editor");
                }}
              >
                Insert to Editor ({checked.size})
              </button>
              <button
                type="button"
                disabled={checked.size === 0 || !projectId || saveSnippetsMutation.isPending}
                onClick={() =>
                  saveItemsAsSnippets(results.filter((item) => checked.has(item.dimension)))
                }
              >
                {saveSnippetsMutation.isPending
                  ? "Saving..."
                  : `Save selected to Snippets (${checked.size})`}
              </button>
              {saveSnippetsMutation.isSuccess && (
                <span style={{ fontSize: 12, color: "#065f46", alignSelf: "center" }}>
                  Saved
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
