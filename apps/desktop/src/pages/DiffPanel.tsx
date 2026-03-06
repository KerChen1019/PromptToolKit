import { useEffect, useMemo, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { useQuery } from "@tanstack/react-query";
import { diffPromptVersions, listPromptVersions } from "../lib/tauri";
import { useUIStore } from "../store/uiStore";

export function DiffPanel() {
  const promptId = useUIStore((s) => s.promptId);
  const leftVersionId = useUIStore((s) => s.selectedLeftVersionId);
  const rightVersionId = useUIStore((s) => s.selectedRightVersionId);
  const setDiffSelection = useUIStore((s) => s.setDiffSelection);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");

  const versionsQuery = useQuery({
    queryKey: ["versions", promptId],
    queryFn: () => listPromptVersions(promptId ?? ""),
    enabled: Boolean(promptId),
  });

  useEffect(() => {
    if (!leftVersionId && versionsQuery.data && versionsQuery.data.length > 1) {
      setDiffSelection(versionsQuery.data[0].id, versionsQuery.data[1].id);
    }
  }, [leftVersionId, setDiffSelection, versionsQuery.data]);

  const diffQuery = useQuery({
    queryKey: ["diff", leftVersionId, rightVersionId],
    queryFn: () =>
      diffPromptVersions(leftVersionId ?? "", rightVersionId ?? ""),
    enabled: Boolean(leftVersionId && rightVersionId),
  });

  const versionMap = useMemo(() => {
    const map = new Map<string, string>();
    versionsQuery.data?.forEach((v) => map.set(v.id, v.rawText));
    return map;
  }, [versionsQuery.data]);

  useEffect(() => {
    setLeft(versionMap.get(leftVersionId ?? "") ?? "");
    setRight(versionMap.get(rightVersionId ?? "") ?? "");
  }, [leftVersionId, rightVersionId, versionMap]);

  return (
    <section className="panel">
      <h2>DiffPanel</h2>
      <p>Visual diff for any two prompt versions.</p>
      {!promptId && <p className="warn">Select a prompt in EditorWorkspace first.</p>}
      <div className="toolbar">
        <select
          value={leftVersionId ?? ""}
          onChange={(e) => setDiffSelection(e.target.value, rightVersionId)}
          disabled={!versionsQuery.data}
        >
          <option value="">Left version</option>
          {versionsQuery.data?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.createdAt}
            </option>
          ))}
        </select>
        <select
          value={rightVersionId ?? ""}
          onChange={(e) => setDiffSelection(leftVersionId, e.target.value)}
          disabled={!versionsQuery.data}
        >
          <option value="">Right version</option>
          {versionsQuery.data?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.createdAt}
            </option>
          ))}
        </select>
        {diffQuery.data && (
          <span className="mono">
            +{diffQuery.data.added} / -{diffQuery.data.removed}
          </span>
        )}
      </div>
      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" }}>
        <DiffEditor
          height="500px"
          language="markdown"
          original={left}
          modified={right}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
          }}
        />
      </div>
      {diffQuery.data && (
        <>
          <h4>Unified Diff</h4>
          <pre className="mono">{diffQuery.data.unified}</pre>
        </>
      )}
    </section>
  );
}
