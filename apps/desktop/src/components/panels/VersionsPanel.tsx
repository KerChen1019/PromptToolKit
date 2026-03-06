import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { diffPromptVersions, listPromptVersions, restorePromptVersion } from "../../lib/tauri";
import { useUIStore } from "../../store/uiStore";

export function VersionsPanel() {
  const promptId = useUIStore((s) => s.promptId);
  const setEditorText = useUIStore((s) => s.setEditorText);
  const queryClient = useQueryClient();
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string>("");

  const versionsQuery = useQuery({
    queryKey: ["versions", promptId],
    queryFn: () => listPromptVersions(promptId ?? ""),
    enabled: Boolean(promptId),
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => restorePromptVersion(promptId ?? "", versionId),
    onSuccess: (prompt) => {
      setEditorText(prompt.currentDraft);
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });

  async function showDiff(versionId: string, idx: number) {
    if (expandedDiff === versionId) {
      setExpandedDiff(null);
      return;
    }
    const versions = versionsQuery.data ?? [];
    const prevVersionId = versions[idx + 1]?.id;
    if (!prevVersionId) {
      setDiffText("(first version — no previous to compare)");
      setExpandedDiff(versionId);
      return;
    }
    const result = await diffPromptVersions(prevVersionId, versionId);
    setDiffText(result.unified || "(no changes)");
    setExpandedDiff(versionId);
  }

  if (!promptId) {
    return <p style={{ fontSize: 12, color: "#9ca3af", padding: 8 }}>Select a prompt to see its versions.</p>;
  }

  return (
    <div>
      {versionsQuery.data?.length === 0 && (
        <p style={{ fontSize: 12, color: "#9ca3af" }}>No committed versions yet.</p>
      )}
      {versionsQuery.data?.map((version, idx) => (
        <div key={version.id} className="compact-item">
          <div className="compact-item-title">
            v{(versionsQuery.data.length - idx)}
            {version.commitMessage && ` — ${version.commitMessage}`}
          </div>
          <div className="compact-item-meta">{version.createdAt.slice(0, 16).replace("T", " ")}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button
              type="button"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => showDiff(version.id, idx)}
            >
              {expandedDiff === version.id ? "Hide diff" : "Diff"}
            </button>
            <button
              type="button"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => restoreMutation.mutate(version.id)}
            >
              Restore
            </button>
          </div>
          {expandedDiff === version.id && (
            <pre className="mono" style={{ marginTop: 8, maxHeight: 200, overflow: "auto", fontSize: 10, background: "#f9fafb", padding: 6, borderRadius: 4, whiteSpace: "pre-wrap" }}>
              {diffText}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
