import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  confirmAttribution,
  deleteOutput,
  linkOutputToPrompt,
  listOutputsByProject,
  listPromptsByProject,
  pasteImportAndAutoAttribution,
} from "../../lib/tauri";
import { useUIStore } from "../../store/uiStore";
import type {
  AttributionCandidate,
  OutputAttributionResponse,
  OutputImage,
} from "../../types/domain";

const MEDIA_EXT = /\.(png|jpe?g|webp|gif|mp4|mov|webm|m4v)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

function isVideoPath(path: string) {
  return VIDEO_EXT.test(path);
}

function renderMediaPreview(path: string, style: React.CSSProperties, controls = false) {
  if (isVideoPath(path)) {
    return (
      <video
        src={convertFileSrc(path)}
        controls={controls}
        muted={!controls}
        playsInline
        preload="metadata"
        style={style}
      />
    );
  }

  return (
    <img
      src={convertFileSrc(path)}
      alt={path}
      style={style}
    />
  );
}

export function OutputsPanel() {
  const projectId = useUIStore((s) => s.projectId);
  const promptId = useUIStore((s) => s.promptId);
  const queryClient = useQueryClient();

  const [result, setResult] = useState<OutputAttributionResponse | null>(null);
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [linkTargets, setLinkTargets] = useState<Record<string, string>>({});

  const promptsQuery = useQuery({
    queryKey: ["prompts", projectId],
    queryFn: () => listPromptsByProject(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const outputsQuery = useQuery({
    queryKey: ["outputs", projectId],
    queryFn: () => listOutputsByProject(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    const setup = async () => {
      const unlistenDrop = await listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
        const media = event.payload.paths.find((path) => MEDIA_EXT.test(path));
        if (media) {
          setMediaPath(media);
          setDragOver(false);
          setStatusMessage(`Selected: ${media.split(/[\\/]/).pop()}`);
        }
      });
      const unlistenEnter = await listen("tauri://drag-enter", () => setDragOver(true));
      const unlistenLeave = await listen("tauri://drag-leave", () => setDragOver(false));
      return () => {
        unlistenDrop();
        unlistenEnter();
        unlistenLeave();
      };
    };

    const cleanup = setup();
    return () => {
      cleanup.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    const nextTargets: Record<string, string> = {};
    for (const output of outputsQuery.data ?? []) {
      nextTargets[output.id] = output.promptId ?? promptId ?? "";
    }
    setLinkTargets(nextTargets);
  }, [outputsQuery.data, promptId]);

  const importMutation = useMutation({
    mutationFn: async (selectedPath?: string | null) => {
      const sourceMediaPath = selectedPath ?? mediaPath;
      if (!sourceMediaPath) {
        throw new Error("Select or drop an image/video first.");
      }
      return pasteImportAndAutoAttribution({
        projectId: projectId ?? "",
        sourceImagePath: sourceMediaPath,
        clipboardText: null,
        modelHint: null,
      });
    },
    onMutate: () => {
      setResult(null);
      setStatusMessage("Importing output media...");
    },
    onSuccess: (response) => {
      setResult(response);
      setStatusMessage(
        response.candidates.length > 0
          ? `Imported. Found ${response.candidates.length} attribution candidate${response.candidates.length === 1 ? "" : "s"}.`
          : "Imported. No attribution candidates were found. You can still link this media manually.",
      );
      queryClient.invalidateQueries({ queryKey: ["outputs", projectId] });
    },
    onError: (error) => {
      setStatusMessage(String(error));
    },
  });

  const confirmMutation = useMutation({
    mutationFn: ({ outputId, attributionId }: { outputId: string; attributionId: string }) =>
      confirmAttribution(outputId, attributionId),
    onSuccess: () => {
      setResult(null);
      setStatusMessage("Attribution confirmed.");
      queryClient.invalidateQueries({ queryKey: ["outputs", projectId] });
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({ outputId, promptId: nextPromptId }: { outputId: string; promptId: string | null }) =>
      linkOutputToPrompt(outputId, nextPromptId),
    onSuccess: (_output, variables) => {
      setStatusMessage(variables.promptId ? "Output linked to prompt." : "Output unlinked.");
      queryClient.invalidateQueries({ queryKey: ["outputs", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (outputId: string) => deleteOutput(outputId),
    onSuccess: () => {
      setStatusMessage("Output media deleted.");
      queryClient.invalidateQueries({ queryKey: ["outputs", projectId] });
    },
  });

  const outputs = outputsQuery.data ?? [];
  const currentPromptOutputs = useMemo(
    () => (promptId ? outputs.filter((output) => output.promptId === promptId) : []),
    [outputs, promptId],
  );
  const unlinkedOutputs = useMemo(
    () => outputs.filter((output) => !output.promptId),
    [outputs],
  );

  async function pickMedia() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Media", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm", "m4v"] }],
    });
    if (!selected || typeof selected !== "string") {
      return;
    }
    setMediaPath(selected);
    setStatusMessage(`Selected: ${selected.split(/[\\/]/).pop()}`);
  }

  function renderOutputCard(output: OutputImage, options?: { allowManualLink?: boolean; allowUnlink?: boolean }) {
    const selectedTarget = linkTargets[output.id] ?? promptId ?? "";
    return (
      <div key={output.id} className="compact-item" style={{ cursor: "default" }}>
        {renderMediaPreview(
          output.storedPath,
          { width: "100%", height: 140, objectFit: "cover", borderRadius: 8, marginBottom: 8 },
          false,
        )}
        <div className="compact-item-title" style={{ marginBottom: 4 }}>
          {output.promptTitle ?? "Unlinked output"}
        </div>
        <div className="compact-item-meta" style={{ marginBottom: 8 }}>
          {output.sourcePath.split(/[\\/]/).pop()} · {new Date(output.createdAt).toLocaleString()}
        </div>

        {options?.allowManualLink && (promptsQuery.data?.length ?? 0) > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={selectedTarget}
              onChange={(event) =>
                setLinkTargets((current) => ({ ...current, [output.id]: event.target.value }))
              }
              style={{ flex: 1, minWidth: 0, fontSize: 12 }}
            >
              <option value="">Select prompt</option>
              {promptsQuery.data?.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="primary sm"
              style={{ whiteSpace: "nowrap" }}
              disabled={!selectedTarget || linkMutation.isPending}
              onClick={() => linkMutation.mutate({ outputId: output.id, promptId: selectedTarget })}
            >
              Link
            </button>
          </div>
        )}

        {options?.allowUnlink && (
          <button
            type="button"
            className="sm"
            style={{ marginTop: 6 }}
            disabled={linkMutation.isPending}
            onClick={() => linkMutation.mutate({ outputId: output.id, promptId: null })}
          >
            Unlink
          </button>
        )}

        <button
          type="button"
          className="sm danger"
          style={{ marginTop: 6 }}
          disabled={deleteMutation.isPending}
          onClick={() => {
            if (!window.confirm("Delete this output media?")) {
              return;
            }
            deleteMutation.mutate(output.id);
          }}
        >
          Delete
        </button>
      </div>
    );
  }

  if (!projectId) {
    return <p style={{ fontSize: 12, color: "#9ca3af", padding: 8 }}>Select a project first.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button
        type="button"
        onClick={pickMedia}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 12,
          background: dragOver ? "var(--accent-bg)" : "var(--bg-elevated)",
          padding: 0,
          minHeight: 180,
          overflow: "hidden",
        }}
      >
        {mediaPath ? (
          <div style={{ display: "grid", gap: 8, padding: 8 }}>
            {renderMediaPreview(
              mediaPath,
              { width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8 },
              true,
            )}
            <div style={{ fontSize: 12, color: "#64748b", textAlign: "left" }}>
              {mediaPath.split(/[\\/]/).pop()}
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop or click to add an output</div>
          </div>
        )}
      </button>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="primary"
          style={{ flex: 1, fontSize: 12 }}
          onClick={() => importMutation.mutate(null)}
          disabled={importMutation.isPending || !mediaPath}
        >
          {importMutation.isPending ? "Importing..." : "Import Output Media"}
        </button>
        <button type="button" style={{ fontSize: 12 }} onClick={pickMedia}>
          Change
        </button>
      </div>

      {statusMessage && (
        <p
          className={importMutation.isError ? "warn" : undefined}
          style={{ fontSize: 12, margin: 0, color: importMutation.isError ? undefined : "#64748b" }}
        >
          {statusMessage}
        </p>
      )}

      {result && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Latest import</div>
          {result.candidates.length === 0 && promptId && (
            <button
              type="button"
              className="primary"
              style={{ fontSize: 12, justifySelf: "start" }}
              onClick={() => linkMutation.mutate({ outputId: result.outputId, promptId })}
              disabled={linkMutation.isPending}
            >
              Link latest import to current prompt
            </button>
          )}
          {result.candidates.length === 0 && !promptId && (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              No attribution candidates found. Select a prompt and link it manually below.
            </div>
          )}
          {result.candidates.map((candidate: AttributionCandidate) => (
            <div key={candidate.attributionId} className="compact-item" style={{ cursor: "default" }}>
              <div className="compact-item-title">Score: {candidate.score.toFixed(2)}</div>
              <div className="compact-item-meta">{candidate.reason}</div>
              <button
                type="button"
                className="primary"
                style={{ fontSize: 11, marginTop: 6 }}
                onClick={() =>
                  confirmMutation.mutate({
                    outputId: result.outputId,
                    attributionId: candidate.attributionId,
                  })
                }
              >
                Confirm
              </button>
            </div>
          ))}
        </div>
      )}

      {promptId && (
        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Current prompt outputs</div>
          {currentPromptOutputs.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              No outputs linked to this prompt yet.
            </div>
          ) : (
            currentPromptOutputs.map((output) => renderOutputCard(output, { allowUnlink: true }))
          )}
        </section>
      )}

      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>Unlinked outputs</div>
        {unlinkedOutputs.length === 0 ? (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Every imported output in this project is currently linked.
          </div>
        ) : (
          unlinkedOutputs.map((output) => renderOutputCard(output, { allowManualLink: true }))
        )}
      </section>
    </div>
  );
}
