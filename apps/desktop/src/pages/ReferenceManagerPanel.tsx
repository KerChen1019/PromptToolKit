import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  importReference,
  listReferences,
  tagReference,
} from "../lib/tauri";
import { useUIStore } from "../store/uiStore";

export function ReferenceManagerPanel() {
  const queryClient = useQueryClient();
  const projectId = useUIStore((s) => s.projectId);
  const [sourcePath, setSourcePath] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [tagInputMap, setTagInputMap] = useState<Record<string, string>>({});

  const referencesQuery = useQuery({
    queryKey: ["references", projectId, tagFilter],
    queryFn: () => listReferences(projectId ?? "", tagFilter || null),
    enabled: Boolean(projectId),
  });

  const importMutation = useMutation({
    mutationFn: () => importReference(projectId ?? "", sourcePath),
    onSuccess: () => {
      setSourcePath("");
      queryClient.invalidateQueries({ queryKey: ["references", projectId] });
    },
  });

  const tagMutation = useMutation({
    mutationFn: ({ assetId, tags }: { assetId: string; tags: string[] }) =>
      tagReference(assetId, tags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["references", projectId] });
    },
  });

  return (
    <section className="panel">
      <h2>ReferenceManagerPanel</h2>
      <p>Import reference images into local assets and tag them for retrieval.</p>
      {!projectId && <p className="warn">Select a project in EditorWorkspace first.</p>}
      <div className="toolbar">
        <input
          style={{ minWidth: 420 }}
          placeholder="Absolute image path"
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
        />
        <button
          className="primary"
          type="button"
          onClick={() => importMutation.mutate()}
          disabled={!projectId || !sourcePath}
        >
          Import
        </button>
        <input
          placeholder="Filter by tag"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
      </div>
      <ul className="list">
        {referencesQuery.data?.map((asset) => (
          <li className="list-item" key={asset.id}>
            <div className="mono">{asset.storedPath}</div>
            <div className="mono">hash: {asset.fileHash}</div>
            <div>tags: {asset.tags.join(", ") || "(none)"}</div>
            <div className="toolbar">
              <input
                placeholder="tag1,tag2"
                value={tagInputMap[asset.id] ?? ""}
                onChange={(e) =>
                  setTagInputMap((prev) => ({ ...prev, [asset.id]: e.target.value }))
                }
              />
              <button
                type="button"
                onClick={() =>
                  tagMutation.mutate({
                    assetId: asset.id,
                    tags: (tagInputMap[asset.id] ?? "")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              >
                Save Tags
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
