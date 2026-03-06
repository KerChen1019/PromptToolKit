import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPromptVersions,
  restorePromptVersion,
} from "../lib/tauri";
import { useUIStore } from "../store/uiStore";

export function VersionHistoryPanel() {
  const queryClient = useQueryClient();
  const promptId = useUIStore((s) => s.promptId);
  const setEditorText = useUIStore((s) => s.setEditorText);
  const setDiffSelection = useUIStore((s) => s.setDiffSelection);

  const versionsQuery = useQuery({
    queryKey: ["versions", promptId],
    queryFn: () => listPromptVersions(promptId ?? ""),
    enabled: Boolean(promptId),
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) =>
      restorePromptVersion(promptId ?? "", versionId),
    onSuccess: (prompt) => {
      setEditorText(prompt.currentDraft);
      queryClient.invalidateQueries({ queryKey: ["prompts", prompt.projectId] });
    },
  });

  return (
    <section className="panel">
      <h2>VersionHistoryPanel</h2>
      <p>Every commit is stored as a version. Restore any historical text safely.</p>
      {!promptId && <p className="warn">Select a prompt in EditorWorkspace first.</p>}
      <ul className="list">
        {versionsQuery.data?.map((v, index) => (
          <li className="list-item" key={v.id}>
            <div>
              <strong>{v.commitMessage ?? "No message"}</strong>
            </div>
            <div className="mono">{v.createdAt}</div>
            <div className="mono">operator: {v.operator}</div>
            <div className="toolbar">
              <button type="button" onClick={() => restoreMutation.mutate(v.id)}>
                Restore
              </button>
              <button
                type="button"
                onClick={() =>
                  setDiffSelection(
                    v.id,
                    versionsQuery.data?.[Math.max(0, index - 1)]?.id ?? null,
                  )
                }
              >
                Compare Prev
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
