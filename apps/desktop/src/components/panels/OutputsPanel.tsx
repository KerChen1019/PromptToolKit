import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { confirmAttribution, pasteImportAndAutoAttribution } from "../../lib/tauri";
import { useUIStore } from "../../store/uiStore";
import type { AttributionCandidate, OutputAttributionResponse } from "../../types/domain";
import { open } from "@tauri-apps/plugin-dialog";

export function OutputsPanel() {
  const projectId = useUIStore((s) => s.projectId);
  const queryClient = useQueryClient();
  const [result, setResult] = useState<OutputAttributionResponse | null>(null);

  const importMutation = useMutation({
    mutationFn: async () => {
      const selected = await open({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] });
      if (!selected || typeof selected !== "string") return null;
      return pasteImportAndAutoAttribution({
        projectId: projectId ?? "",
        sourceImagePath: selected,
        clipboardText: null,
        modelHint: null,
      });
    },
    onSuccess: (r) => { if (r) setResult(r); },
  });

  const confirmMutation = useMutation({
    mutationFn: ({ outputId, attributionId }: { outputId: string; attributionId: string }) =>
      confirmAttribution(outputId, attributionId),
    onSuccess: () => {
      setResult(null);
      queryClient.invalidateQueries({ queryKey: ["outputs"] });
    },
  });

  if (!projectId) {
    return <p style={{ fontSize: 12, color: "#9ca3af", padding: 8 }}>Select a project first.</p>;
  }

  return (
    <div>
      <button
        type="button"
        className="primary"
        style={{ width: "100%", fontSize: 12, marginBottom: 12 }}
        onClick={() => importMutation.mutate()}
        disabled={importMutation.isPending}
      >
        {importMutation.isPending ? "Importing…" : "Import Output Image"}
      </button>

      {result && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Attribution candidates</div>
          {result.candidates.map((c: AttributionCandidate) => (
            <div key={c.attributionId} className="compact-item">
              <div className="compact-item-title">Score: {c.score.toFixed(2)}</div>
              <div className="compact-item-meta">{c.reason}</div>
              <button
                type="button"
                className="primary"
                style={{ fontSize: 11, marginTop: 6 }}
                onClick={() => confirmMutation.mutate({ outputId: result.outputId, attributionId: c.attributionId })}
              >
                Confirm
              </button>
            </div>
          ))}
        </div>
      )}

      {!result && (
        <p style={{ fontSize: 12, color: "#9ca3af" }}>
          Import a generated image to auto-match it to the prompt you copied.
        </p>
      )}
    </div>
  );
}
