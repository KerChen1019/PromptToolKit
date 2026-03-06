import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  generatePromptFromBrief,
  getDefaultAIProviderId,
  listAIProviders,
  listSnippets,
} from "../lib/tauri";
import {
  GENERATOR_DIMENSIONS,
  TAG_DRAG_MIME,
  canonicalTagLabel,
  type GeneratorDimensionKey,
  normalizeTagForStorage,
} from "../lib/tagTaxonomy";
import { useUIStore } from "../store/uiStore";

type Step = "brief" | "dimensions" | "result";

const EMPTY_DIM_INPUTS: Record<GeneratorDimensionKey, string> = {
  subjectAction: "",
  cameraLens: "",
  lighting: "",
  colorPalette: "",
  materialTexture: "",
  composition: "",
  styleMood: "",
};

export function PromptGeneratorPanel() {
  const projectId = useUIStore((s) => s.projectId);
  const promptId = useUIStore((s) => s.promptId);
  const setEditorText = useUIStore((s) => s.setEditorText);
  const setCenterView = useUIStore((s) => s.setCenterView);

  const [step, setStep] = useState<Step>("brief");
  const [brief, setBrief] = useState("");
  const [providerOverride, setProviderOverride] = useState("");
  const [dimInputs, setDimInputs] = useState<Record<GeneratorDimensionKey, string>>(EMPTY_DIM_INPUTS);
  const [dragOverKey, setDragOverKey] = useState<GeneratorDimensionKey | null>(null);

  const aiProvidersQuery = useQuery({
    queryKey: ["aiProviders"],
    queryFn: listAIProviders,
  });

  const snippetsQuery = useQuery({
    queryKey: ["snippets", projectId],
    queryFn: () => listSnippets(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const defaultProviderQuery = useQuery({
    queryKey: ["defaultAIProviderId"],
    queryFn: getDefaultAIProviderId,
  });

  useEffect(() => {
    if (defaultProviderQuery.data && !providerOverride) {
      setProviderOverride(defaultProviderQuery.data);
    }
  }, [defaultProviderQuery.data, providerOverride]);

  const generateMutation = useMutation({
    mutationFn: () => {
      const dimensionsMap: Record<string, string | null> = {};
      for (const d of GENERATOR_DIMENSIONS) {
        const raw = dimInputs[d.key].trim();
        dimensionsMap[d.tag] = raw.length > 0 ? raw : null;
      }
      return generatePromptFromBrief({
        projectId: projectId ?? "",
        brief,
        dimensions: dimensionsMap,
        providerIdOverride: providerOverride || null,
        promptId,
      });
    },
    onSuccess: () => {
      setStep("result");
    },
  });

  function handleBriefNext() {
    if (!brief.trim()) {
      return;
    }
    setStep("dimensions");
  }

  function handleSkipAllDimensions() {
    setDimInputs(EMPTY_DIM_INPUTS);
    generateMutation.mutate();
  }

  function handleGenerate() {
    generateMutation.mutate();
  }

  function handleSendToEditor() {
    if (generateMutation.data?.generatedText) {
      setEditorText(generateMutation.data.generatedText);
      setCenterView("editor");
    }
  }

  function handleReset() {
    setStep("brief");
    setBrief("");
    setDimInputs(EMPTY_DIM_INPUTS);
    generateMutation.reset();
  }

  function extractDraggedTag(dataTransfer: DataTransfer): string {
    return (
      dataTransfer.getData(TAG_DRAG_MIME) ||
      dataTransfer.getData("text/plain") ||
      ""
    );
  }

  function applyTagToDimension(targetKey: GeneratorDimensionKey, rawTag: string) {
    const tag = normalizeTagForStorage(rawTag);
    if (!tag) {
      return;
    }
    const matched = (snippetsQuery.data ?? []).filter((snippet) =>
      snippet.tags
        .map((t) => normalizeTagForStorage(t))
        .filter(Boolean)
        .includes(tag),
    );

    const additions = matched
      .map((snippet) => snippet.content.trim())
      .filter(Boolean);

    if (additions.length === 0) {
      additions.push(canonicalTagLabel(tag));
    }

    setDimInputs((prev) => {
      const existingParts = prev[targetKey]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      for (const add of additions) {
        if (!existingParts.includes(add)) {
          existingParts.push(add);
        }
      }
      return {
        ...prev,
        [targetKey]: existingParts.join(", "),
      };
    });
  }

  function handleDimensionDragOver(e: React.DragEvent<HTMLDivElement>, key: GeneratorDimensionKey) {
    const draggedTag = extractDraggedTag(e.dataTransfer);
    if (!draggedTag) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (dragOverKey !== key) {
      setDragOverKey(key);
    }
  }

  function handleDimensionDrop(e: React.DragEvent<HTMLDivElement>, key: GeneratorDimensionKey) {
    e.preventDefault();
    const draggedTag = extractDraggedTag(e.dataTransfer);
    setDragOverKey(null);
    if (!draggedTag) {
      return;
    }
    applyTagToDimension(key, draggedTag);
  }

  const filledCount = GENERATOR_DIMENSIONS.filter((d) => dimInputs[d.key].trim().length > 0).length;

  return (
    <section className="panel">
      <h2>Prompt Generator</h2>
      <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>
        Extended tool: describe your scene in plain language, optionally specify dimensions, then
        send the result to the editor.
      </p>

      {step === "brief" && (
        <div>
          <h3>Step 1 - What do you want to create?</h3>
          <textarea
            style={{ width: "100%", minHeight: 100, fontSize: 14, padding: 8, marginBottom: 12 }}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. a warrior standing in fog at dusk, looking at a ruined city in the distance"
          />
          <div className="toolbar">
            <select value={providerOverride} onChange={(e) => setProviderOverride(e.target.value)}>
              <option value="">Use default provider</option>
              {aiProvidersQuery.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.model})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="primary"
              onClick={handleBriefNext}
              disabled={!brief.trim() || !projectId}
            >
              Next: Specify Dimensions
            </button>
            <button
              type="button"
              onClick={() => {
                if (brief.trim() && projectId) {
                  setStep("dimensions");
                  handleSkipAllDimensions();
                }
              }}
              disabled={!brief.trim() || !projectId}
            >
              Skip dimensions and Generate
            </button>
          </div>
          {!projectId && (
            <p style={{ color: "#ef4444", fontSize: 13 }}>Select a project in the Editor first.</p>
          )}
        </div>
      )}

      {step === "dimensions" && (
        <div>
          <h3>Step 2 - Specify dimensions (optional)</h3>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>
            Prompt Generator and Image Analyzer now share the same canonical tags.
            Open the right Snippets panel and drag tags into each dimension field.
          </p>
          <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
            {GENERATOR_DIMENSIONS.map((d) => (
              <div
                key={d.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 1fr",
                  gap: 8,
                  alignItems: "start",
                }}
              >
                <label style={{ fontSize: 13, fontWeight: 500, paddingTop: 7 }}>{d.label}</label>
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    border: dragOverKey === d.key ? "1px dashed #0ea5e9" : "1px dashed transparent",
                    borderRadius: 8,
                    padding: 6,
                    background: dragOverKey === d.key ? "#f0f9ff" : "transparent",
                  }}
                  onDragOver={(e) => handleDimensionDragOver(e, d.key)}
                  onDragLeave={() => setDragOverKey((prev) => (prev === d.key ? null : prev))}
                  onDrop={(e) => handleDimensionDrop(e, d.key)}
                >
                  <input
                    value={dimInputs[d.key]}
                    onChange={(e) =>
                      setDimInputs((prev) => ({ ...prev, [d.key]: e.target.value }))
                    }
                    placeholder={d.placeholder}
                    style={{ fontSize: 13 }}
                  />
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    Drop tag here: <code>{d.tag}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {filledCount === 0 && (
            <p style={{ fontSize: 13, color: "#f59e0b", marginBottom: 8 }}>
              No dimensions specified - AI will decide freely. This is fine for a quick draft.
            </p>
          )}
          <div className="toolbar">
            <button type="button" onClick={() => setStep("brief")}>
              Back
            </button>
            <button
              type="button"
              className="primary"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending
                ? "Generating..."
                : `Generate (${filledCount} dimension${filledCount !== 1 ? "s" : ""} specified)`}
            </button>
          </div>
          {generateMutation.isError && (
            <p className="warn mono" style={{ marginTop: 8 }}>
              {String(generateMutation.error)}
            </p>
          )}
        </div>
      )}

      {step === "result" && generateMutation.data && (
        <div>
          <h3>Generated Prompt</h3>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>
            {generateMutation.data.model} - {generateMutation.data.latencyMs}ms
          </p>
          <textarea
            style={{ width: "100%", minHeight: 140, fontSize: 14, padding: 8, marginBottom: 12 }}
            value={generateMutation.data.generatedText}
            readOnly
          />
          <div className="toolbar">
            <button type="button" className="primary" onClick={handleSendToEditor}>
              Send to Editor
            </button>
            <button type="button" onClick={() => setStep("dimensions")}>
              Adjust dimensions
            </button>
            <button type="button" onClick={handleReset}>
              Start over
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
