import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type * as monaco from "monaco-editor";
import {
  commitPromptVersion,
  copyWithPayload,
  generatePromptFromBrief,
  getAppSetting,
  getDefaultAIProviderId,
  listAIProviders,
  listPromptsByProject,
  listSnippets,
  rewritePromptCandidates,
  savePromptDraft,
} from "../lib/tauri";
import {
  GENERATOR_DIMENSIONS,
  TAG_DRAG_MIME,
  buildDefaultTagTaxonomy,
  canonicalTagLabel,
  categoryId,
  type GeneratorDimensionKey,
  normalizeTagForStorage,
  normalizeTagTaxonomy,
} from "../lib/tagTaxonomy";
import { useUIStore } from "../store/uiStore";
import type { PromptGenerateResult, TagCategory } from "../types/domain";
import { setInsertSnippetToEditor, setInsertTagToEditor } from "./panels/SnippetsPanel";

type EditorDockMode = "idle" | "generate" | "rewrite-results";

interface RewriteBubbleState {
  visible: boolean;
  top: number;
  left: number;
}

const EMPTY_DIM_INPUTS: Record<GeneratorDimensionKey, string> = {
  subjectAction: "",
  cameraLens: "",
  lighting: "",
  colorPalette: "",
  materialTexture: "",
  composition: "",
  styleMood: "",
};

const GLOBAL_TAG_TAXONOMY_KEY = "global_tag_taxonomy";

function cloneRange(range: monaco.IRange): monaco.IRange {
  return {
    startLineNumber: range.startLineNumber,
    startColumn: range.startColumn,
    endLineNumber: range.endLineNumber,
    endColumn: range.endColumn,
  };
}

function parseStoredTaxonomy(raw: string | null | undefined): TagCategory[] | null {
  if (!raw) {
    return null;
  }
  try {
    return normalizeTagTaxonomy(JSON.parse(raw) as TagCategory[]);
  } catch {
    return null;
  }
}

export function CenterEditor() {
  const queryClient = useQueryClient();
  const projectId = useUIStore((s) => s.projectId);
  const promptId = useUIStore((s) => s.promptId);
  const editorText = useUIStore((s) => s.editorText);
  const setEditorText = useUIStore((s) => s.setEditorText);
  const theme = useUIStore((s) => s.theme);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const rewriteInputRef = useRef<HTMLInputElement | null>(null);
  const generatorSourceLineNumberRef = useRef<number | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [providerOverride, setProviderOverride] = useState("");
  const [currentLineBlank, setCurrentLineBlank] = useState(false);
  const [currentLineNumber, setCurrentLineNumber] = useState<number | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [rewriteBubble, setRewriteBubble] = useState<RewriteBubbleState>({
    visible: false,
    top: 0,
    left: 0,
  });
  const [liveSelectionRange, setLiveSelectionRange] = useState<monaco.IRange | null>(null);
  const [liveSelectionText, setLiveSelectionText] = useState<string | null>(null);
  const [rewriteTargetRange, setRewriteTargetRange] = useState<monaco.IRange | null>(null);
  const [rewriteTargetText, setRewriteTargetText] = useState<string | null>(null);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [preserveVoice, setPreserveVoice] = useState(true);
  const [rewriteResultsVisible, setRewriteResultsVisible] = useState(false);
  const [rewriteBubbleExpanded, setRewriteBubbleExpanded] = useState(false);
  const [rewriteBubbleArmed, setRewriteBubbleArmed] = useState(false);

  const [generatorExpanded, setGeneratorExpanded] = useState(false);
  const [generatorSourceLineNumber, setGeneratorSourceLineNumber] = useState<number | null>(null);
  const [generatorBrief, setGeneratorBrief] = useState("");
  const [generatorDimensions, setGeneratorDimensions] =
    useState<Record<GeneratorDimensionKey, string>>(EMPTY_DIM_INPUTS);
  const [generatorPreview, setGeneratorPreview] = useState<PromptGenerateResult | null>(null);
  const [generatorDragOverKey, setGeneratorDragOverKey] =
    useState<GeneratorDimensionKey | null>(null);

  const [snippetPicker, setSnippetPicker] = useState<{
    visible: boolean;
    top: number;
    left: number;
    query: string;
  }>({
    visible: false,
    top: 0,
    left: 0,
    query: "",
  });
  const [snippetPickerFocus, setSnippetPickerFocus] = useState(0);

  const promptsQuery = useQuery({
    queryKey: ["prompts", projectId],
    queryFn: () => listPromptsByProject(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const aiProvidersQuery = useQuery({
    queryKey: ["aiProviders"],
    queryFn: listAIProviders,
  });

  const defaultProviderQuery = useQuery({
    queryKey: ["defaultAIProviderId"],
    queryFn: getDefaultAIProviderId,
  });

  const snippetsQuery = useQuery({
    queryKey: ["snippets", projectId],
    queryFn: () => listSnippets(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const taxonomyQuery = useQuery({
    queryKey: ["appSetting", GLOBAL_TAG_TAXONOMY_KEY],
    queryFn: () => getAppSetting(GLOBAL_TAG_TAXONOMY_KEY),
  });

  useEffect(() => {
    generatorSourceLineNumberRef.current = generatorSourceLineNumber;
  }, [generatorSourceLineNumber]);

  useEffect(() => {
    if (defaultProviderQuery.data && !providerOverride) {
      setProviderOverride(defaultProviderQuery.data);
    }
  }, [defaultProviderQuery.data, providerOverride]);

  const selectedPrompt = useMemo(
    () => promptsQuery.data?.find((prompt) => prompt.id === promptId) ?? null,
    [promptId, promptsQuery.data],
  );

  const filteredSnippets = useMemo(() => {
    const query = snippetPicker.query.toLowerCase();
    return (snippetsQuery.data ?? [])
      .filter((snippet) => snippet.name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [snippetPicker.query, snippetsQuery.data]);

  const generatorTagSuggestions = useMemo(() => {
    const taxonomy = parseStoredTaxonomy(taxonomyQuery.data) ?? buildDefaultTagTaxonomy();
    const byDimension = new Map<string, string[]>();

    for (const category of taxonomy) {
      const key = category.dimensionKey ?? categoryId(category);
      const values = category.tags
        .map((tag) => canonicalTagLabel(tag.value))
        .map((value) => value.replace(/-/g, " "))
        .filter(Boolean);
      byDimension.set(key, Array.from(new Set(values)));
    }

    return byDimension;
  }, [taxonomyQuery.data]);

  const dockMode: EditorDockMode = useMemo(() => {
    if (rewriteResultsVisible) {
      return "rewrite-results";
    }
    if (
      !hasSelection &&
      Boolean(projectId) &&
      Boolean(promptId) &&
      (
        currentLineBlank ||
        (currentLineNumber !== null && generatorSourceLineNumber === currentLineNumber)
      )
    ) {
      return "generate";
    }
    return "idle";
  }, [
    currentLineBlank,
    currentLineNumber,
    generatorSourceLineNumber,
    hasSelection,
    projectId,
    promptId,
    rewriteResultsVisible,
  ]);

  const saveDraftMutation = useMutation({
    mutationFn: () => savePromptDraft(promptId ?? "", editorText),
    onSuccess: () => {
      setMessage("Draft saved");
      queryClient.invalidateQueries({ queryKey: ["prompts", projectId] });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const version = await commitPromptVersion(
        promptId ?? "",
        editorText,
        "Manual commit",
        "local-user",
      );
      await copyWithPayload({
        projectId: projectId ?? "",
        promptId: promptId ?? "",
        promptVersionId: version.id,
        promptText: editorText,
      });
      return version;
    },
    onSuccess: () => {
      setMessage("Committed and copied with metadata");
      queryClient.invalidateQueries({ queryKey: ["prompts", projectId] });
      queryClient.invalidateQueries({ queryKey: ["versions", promptId] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      const dimensions: Record<string, string | null> = {};
      for (const definition of GENERATOR_DIMENSIONS) {
        const value = generatorDimensions[definition.key].trim();
        dimensions[definition.tag] = value.length > 0 ? value : null;
      }
      return generatePromptFromBrief({
        projectId: projectId ?? "",
        brief: generatorBrief.trim(),
        dimensions,
        providerIdOverride: providerOverride || null,
        promptId,
      });
    },
    onSuccess: (result) => {
      setGeneratorPreview(result);
      queryClient.invalidateQueries({ queryKey: ["aiRunHistory", projectId] });
    },
  });

  const rewriteMutation = useMutation({
    mutationFn: (selection: { range: monaco.IRange; text: string }) =>
      rewritePromptCandidates({
        projectId: projectId ?? "",
        promptText: editorText,
        selectionText: selection.text,
        instruction: rewriteInstruction.trim(),
        preserveVoice,
        providerIdOverride: providerOverride || null,
        promptId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiRunHistory", projectId] });
    },
  });

  useEffect(() => {
    setMessage(null);
    setCurrentLineBlank(false);
    setCurrentLineNumber(null);
    setHasSelection(false);
    setRewriteBubble({ visible: false, top: 0, left: 0 });
    setLiveSelectionRange(null);
    setLiveSelectionText(null);
    setRewriteTargetRange(null);
    setRewriteTargetText(null);
    setRewriteInstruction("");
    setRewriteResultsVisible(false);
    setRewriteBubbleExpanded(false);
    setRewriteBubbleArmed(false);
    setGeneratorExpanded(false);
    setGeneratorSourceLineNumber(null);
    setGeneratorBrief("");
    setGeneratorDimensions(EMPTY_DIM_INPUTS);
    setGeneratorPreview(null);
    setGeneratorDragOverKey(null);
    setSnippetPicker({ visible: false, top: 0, left: 0, query: "" });
    generateMutation.reset();
    rewriteMutation.reset();
  }, [projectId, promptId]);

  useEffect(() => {
    if (!rewriteBubble.visible || !rewriteBubbleExpanded) {
      return;
    }
    const timer = window.setTimeout(() => {
      rewriteInputRef.current?.focus();
      rewriteInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rewriteBubble.visible, rewriteBubbleExpanded]);

  useEffect(() => {
    if (!rewriteBubble.visible || !hasSelection) {
      setRewriteBubbleArmed(false);
      return;
    }
    setRewriteBubbleArmed(false);
    const timer = window.setTimeout(() => {
      setRewriteBubbleArmed(true);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [
    rewriteBubble.visible,
    hasSelection,
    liveSelectionRange?.startLineNumber,
    liveSelectionRange?.startColumn,
    liveSelectionRange?.endLineNumber,
    liveSelectionRange?.endColumn,
  ]);

  function setGeneratorBinding(lineNumber: number | null) {
    generatorSourceLineNumberRef.current = lineNumber;
    setGeneratorSourceLineNumber(lineNumber);
  }

  function isCurrentLineBlank(editor: monaco.editor.IStandaloneCodeEditor): boolean {
    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) {
      return false;
    }
    return model.getLineContent(position.lineNumber).trim().length === 0;
  }

  function positionRewriteBubble(
    editor: monaco.editor.IStandaloneCodeEditor,
    selection: monaco.Selection,
  ) {
    const container = editorContainerRef.current;
    if (!container) {
      return;
    }
    const startPos = editor.getScrolledVisiblePosition(selection.getStartPosition());
    const endPos = editor.getScrolledVisiblePosition(selection.getEndPosition());
    if (!startPos || !endPos) {
      setRewriteBubble({ visible: false, top: 0, left: 0 });
      return;
    }

    const bubbleWidth = 360;
    const bubbleHeight = 88;
    let top = endPos.top + endPos.height + 10;
    if (top + bubbleHeight > container.clientHeight - 8) {
      top = Math.max(8, startPos.top - bubbleHeight - 10);
    }

    const maxLeft = Math.max(8, container.clientWidth - bubbleWidth - 8);
    const left = Math.max(8, Math.min(startPos.left, maxLeft));

    setRewriteBubble({
      visible: true,
      top,
      left,
    });
  }

  function deriveDockMode(editor: monaco.editor.IStandaloneCodeEditor, selection?: monaco.Selection) {
    const model = editor.getModel();
    const activeSelection = selection ?? editor.getSelection();
    const position = editor.getPosition() ?? activeSelection?.getEndPosition();

    if (model && position) {
      const lineText = model.getLineContent(position.lineNumber);
      const lineIsBlank = lineText.trim().length === 0;
      setCurrentLineNumber(position.lineNumber);
      setCurrentLineBlank(lineIsBlank);

      if (!activeSelection || activeSelection.isEmpty()) {
        if (lineIsBlank) {
          if (generatorSourceLineNumberRef.current !== position.lineNumber) {
            setGeneratorBinding(position.lineNumber);
            setGeneratorBrief("");
          }
        } else if (generatorSourceLineNumberRef.current === position.lineNumber) {
          setGeneratorBrief(lineText);
        } else if (generatorSourceLineNumberRef.current !== null) {
          setGeneratorBinding(null);
        }
      }
    } else {
      setCurrentLineNumber(null);
      setCurrentLineBlank(false);
    }

    if (!activeSelection || activeSelection.isEmpty() || !model) {
      setHasSelection(false);
      setLiveSelectionRange(null);
      setLiveSelectionText(null);
      setRewriteBubble({ visible: false, top: 0, left: 0 });
      setRewriteBubbleExpanded(false);
      setRewriteBubbleArmed(false);
      return;
    }

    setHasSelection(true);
    setLiveSelectionRange(cloneRange(activeSelection));
    setLiveSelectionText(model.getValueInRange(activeSelection));
    setRewriteBubbleExpanded(false);
    setRewriteBubbleArmed(false);
    positionRewriteBubble(editor, activeSelection);
  }

  function insertGeneratedAtCaret(text: string): boolean {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const position = editor?.getPosition();
    if (!editor || !model || !position) {
      return false;
    }

    const lineNumber = generatorSourceLineNumberRef.current ?? position.lineNumber;
    const lineContent = model.getLineContent(lineNumber);
    const normalizedText = text.trim();
    if (!normalizedText) {
      return false;
    }

    const lineIsBlank = lineContent.trim().length === 0;
    const range: monaco.IRange = lineIsBlank
      ? (
          lineNumber < model.getLineCount()
            ? {
                startLineNumber: lineNumber,
                startColumn: 1,
                endLineNumber: lineNumber + 1,
                endColumn: 1,
              }
            : {
                startLineNumber: lineNumber,
                startColumn: 1,
                endLineNumber: lineNumber,
                endColumn: lineContent.length + 1,
              }
        )
      : (
          lineNumber < model.getLineCount()
            ? {
                startLineNumber: lineNumber + 1,
                startColumn: 1,
                endLineNumber: lineNumber + 1,
                endColumn: 1,
              }
            : {
                startLineNumber: lineNumber,
                startColumn: lineContent.length + 1,
                endLineNumber: lineNumber,
                endColumn: lineContent.length + 1,
              }
        );
    const insertedText = lineIsBlank ? `${normalizedText}\n\n` : `\n${normalizedText}\n\n`;

    editor.executeEdits("generator-insert", [
      {
        range,
        text: insertedText,
      },
    ]);

    const generatedLineCount = normalizedText.split(/\r?\n/).length;
    const nextBlankLine = lineNumber + generatedLineCount + 1;
    editor.setPosition({
      lineNumber: Math.min(model.getLineCount(), nextBlankLine),
      column: 1,
    });
    editor.focus();
    setEditorText(editor.getValue());
    setGeneratorBinding(Math.min(model.getLineCount(), nextBlankLine));
    setGeneratorBrief("");
    setCurrentLineBlank(true);
    setCurrentLineNumber(Math.min(model.getLineCount(), nextBlankLine));
    setHasSelection(false);
    setLiveSelectionRange(null);
    setLiveSelectionText(null);
    setRewriteBubble({ visible: false, top: 0, left: 0 });
    return true;
  }

  function replaceCurrentSelection(text: string) {
    const editor = editorRef.current;
    const range = rewriteTargetRange;
    if (!editor || !range) {
      return;
    }

    editor.executeEdits("rewrite-apply", [
      {
        range,
        text,
      },
    ]);

    editor.setPosition({
      lineNumber: range.startLineNumber,
      column: range.startColumn,
    });
    editor.focus();
    setEditorText(editor.getValue());
    setMessage("Rewrite applied");
    setRewriteResultsVisible(false);
    setRewriteInstruction("");
    setRewriteTargetRange(null);
    setRewriteTargetText(null);
    setHasSelection(false);
    setLiveSelectionRange(null);
    setLiveSelectionText(null);
    setRewriteBubble({ visible: false, top: 0, left: 0 });
    setRewriteBubbleExpanded(false);
    setRewriteBubbleArmed(false);
    setCurrentLineBlank(isCurrentLineBlank(editor));
    rewriteMutation.reset();
  }

  const insertSnippetAtCursor = useCallback(
    (snippetText: string, positionOverride?: monaco.IPosition | null) => {
      const editor = editorRef.current;
      if (!editor) {
        setEditorText(editorText + "\n" + snippetText);
        return;
      }
      const position = positionOverride ?? editor.getPosition();
      if (!position) {
        setEditorText(editorText + "\n" + snippetText);
        return;
      }
      editor.executeEdits("snippet-insert", [
        {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: snippetText,
        },
      ]);
      const insertedLines = snippetText.split(/\r?\n/);
      const lastLine = insertedLines[insertedLines.length - 1] ?? "";
      editor.setPosition({
        lineNumber: position.lineNumber + insertedLines.length - 1,
        column: insertedLines.length === 1 ? position.column + lastLine.length : lastLine.length + 1,
      });
      editor.focus();
      setEditorText(editor.getValue());
      setCurrentLineBlank(isCurrentLineBlank(editor));
    },
    [editorText, setEditorText],
  );

  useEffect(() => {
    setInsertSnippetToEditor(insertSnippetAtCursor);
    return () => setInsertSnippetToEditor(null);
  }, [insertSnippetAtCursor]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    deriveDockMode(editor);

    editor.onDidChangeCursorSelection((event) => {
      deriveDockMode(editor, event.selection);
    });

    editor.onDidChangeModelContent(() => {
      deriveDockMode(editor);

      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) {
        return;
      }
      const lineContent = model.getLineContent(position.lineNumber);
      const charBefore = lineContent.slice(0, position.column - 1);
      const slashIndex = charBefore.lastIndexOf("/");
      if (slashIndex !== -1 && !charBefore.slice(slashIndex + 1).includes(" ")) {
        const query = charBefore.slice(slashIndex + 1);
        const pos = editor.getScrolledVisiblePosition(position);
        if (pos) {
          setSnippetPicker({
            visible: true,
            top: pos.top + 20,
            left: pos.left,
            query,
          });
          setSnippetPickerFocus(0);
        }
      } else {
        setSnippetPicker((prev) => ({ ...prev, visible: false }));
      }
    });
  };

  function insertSnippetFromPicker(snippetContent: string) {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const position = editor?.getPosition();
    if (!editor || !model || !position) {
      return;
    }

    const lineContent = model.getLineContent(position.lineNumber);
    const slashIndex = lineContent.lastIndexOf("/", position.column - 2);
    if (slashIndex === -1) {
      return;
    }

    editor.executeEdits("snippet-picker", [
      {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: slashIndex + 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        text: snippetContent,
      },
    ]);
    setEditorText(editor.getValue());
    setCurrentLineBlank(isCurrentLineBlank(editor));
    setSnippetPicker((prev) => ({ ...prev, visible: false }));
  }

  function extractDraggedTag(dataTransfer: DataTransfer | null | undefined): string {
    if (!dataTransfer) {
      return "";
    }
    return dataTransfer.getData(TAG_DRAG_MIME) || dataTransfer.getData("text/plain") || "";
  }

  const resolveTagAdditions = useCallback(
    (rawTag: string): string[] => {
      const tag = normalizeTagForStorage(rawTag);
      if (!tag) {
        return [];
      }

      const additions = (snippetsQuery.data ?? [])
        .filter((snippet) =>
          snippet.tags
            .map((snippetTag) => normalizeTagForStorage(snippetTag))
            .filter(Boolean)
            .includes(tag),
        )
        .map((snippet) => snippet.content.trim())
        .filter(Boolean);

      if (additions.length === 0) {
        additions.push(canonicalTagLabel(tag));
      }

      return Array.from(new Set(additions));
    },
    [snippetsQuery.data],
  );

  const insertTagAtCursor = useCallback(
    (rawTag: string) => {
      const additions = resolveTagAdditions(rawTag);
      if (additions.length === 0) {
        return;
      }
      insertSnippetAtCursor(additions.join(", "));
    },
    [resolveTagAdditions, insertSnippetAtCursor],
  );

  useEffect(() => {
    setInsertTagToEditor(insertTagAtCursor);
    return () => setInsertTagToEditor(null);
  }, [insertTagAtCursor]);

  function applyTagToDimension(targetKey: GeneratorDimensionKey, rawTag: string) {
    const additions = resolveTagAdditions(rawTag);
    if (additions.length === 0) {
      return;
    }

    setGeneratorDimensions((prev) => {
      const existing = prev[targetKey]
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      for (const addition of additions) {
        if (!existing.includes(addition)) {
          existing.push(addition);
        }
      }
      return {
        ...prev,
        [targetKey]: existing.join(", "),
      };
    });
  }

  useEffect(() => {
    const wrapper = editorContainerRef.current;
    if (!wrapper) {
      return;
    }

    function onDragOver(event: DragEvent) {
      const draggedTag = extractDraggedTag(event.dataTransfer);
      if (!draggedTag) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    }

    function onDrop(event: DragEvent) {
      const draggedTag = extractDraggedTag(event.dataTransfer);
      if (!draggedTag) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const editor = editorRef.current;
      const target = editor?.getTargetAtClientPoint(event.clientX, event.clientY);
      const position = target?.position ?? editor?.getPosition() ?? null;
      const additions = resolveTagAdditions(draggedTag);
      if (additions.length === 0) {
        return;
      }
      insertSnippetAtCursor(additions.join(", "), position);
    }

    wrapper.addEventListener("dragover", onDragOver, true);
    wrapper.addEventListener("drop", onDrop, true);

    return () => {
      wrapper.removeEventListener("dragover", onDragOver, true);
      wrapper.removeEventListener("drop", onDrop, true);
    };
  }, [insertSnippetAtCursor, resolveTagAdditions]);

  function handleDimensionDragOver(
    event: React.DragEvent<HTMLElement>,
    key: GeneratorDimensionKey,
  ) {
    const draggedTag = extractDraggedTag(event.dataTransfer);
    if (!draggedTag) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (generatorDragOverKey !== key) {
      setGeneratorDragOverKey(key);
    }
  }

  function handleDimensionDrop(
    event: React.DragEvent<HTMLElement>,
    key: GeneratorDimensionKey,
  ) {
    event.preventDefault();
    const draggedTag = extractDraggedTag(event.dataTransfer);
    setGeneratorDragOverKey(null);
    if (!draggedTag) {
      return;
    }
    applyTagToDimension(key, draggedTag);
  }

  function submitRewrite() {
    if (
      !projectId ||
      !promptId ||
      !liveSelectionRange ||
      !liveSelectionText ||
      !rewriteInstruction.trim()
    ) {
      return;
    }

    setRewriteTargetRange(cloneRange(liveSelectionRange));
    setRewriteTargetText(liveSelectionText);
    setRewriteResultsVisible(true);
    setRewriteBubbleExpanded(false);
    rewriteMutation.mutate({
      range: cloneRange(liveSelectionRange),
      text: liveSelectionText,
    });
  }

  function closeRewriteResults() {
    setRewriteResultsVisible(false);
    setRewriteTargetRange(null);
    setRewriteTargetText(null);
    rewriteMutation.reset();
    if (!hasSelection) {
      setRewriteInstruction("");
    }
    setRewriteBubbleExpanded(false);
  }

  const canGenerate =
    Boolean(projectId) &&
    Boolean(promptId) &&
    generatorBrief.trim().length > 0 &&
    !generateMutation.isPending;
  const canInsertGenerated =
    Boolean(generatorPreview) &&
    !hasSelection &&
    Boolean(projectId) &&
    Boolean(promptId) &&
    (
      currentLineBlank ||
      (currentLineNumber !== null && generatorSourceLineNumber === currentLineNumber)
    );

  return (
    <div className="center-editor">
      <div className="editor-toolbar">
        <div className="editor-toolbar-row">
          <span className="editor-breadcrumb" title={selectedPrompt?.title}>
            {selectedPrompt ? (
              <strong>{selectedPrompt.title}</strong>
            ) : (
              <span style={{ color: "#d1d5db" }}>No prompt selected</span>
            )}
          </span>
          <button
            type="button"
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => saveDraftMutation.mutate()}
            disabled={!promptId}
          >
            Save
          </button>
          <button
            type="button"
            className="primary"
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => commitMutation.mutate()}
            disabled={!promptId}
          >
            Commit + Copy
          </button>
          {message && <span className="ok" style={{ fontSize: 11 }}>{message}</span>}
        </div>
        <div className="editor-toolbar-row">
          <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>AI provider:</span>
          <select
            value={providerOverride}
            onChange={(event) => setProviderOverride(event.target.value)}
            style={{ fontSize: 12, padding: "2px 6px", flex: 1, minWidth: 0 }}
          >
            <option value="">Default</option>
            {aiProvidersQuery.data?.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="editor-wrap"
        ref={editorContainerRef}
      >
        <Editor
          height="100%"
          defaultLanguage="markdown"
          theme={theme === "dark" ? "vs-dark" : "light"}
          value={editorText}
          onChange={(value) => setEditorText(value ?? "")}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            wordWrap: "on",
            fontSize: 14,
            lineHeight: 22,
            scrollBeyondLastLine: false,
          }}
        />

        {rewriteBubble.visible && hasSelection && (
          <div
            className={`rewrite-bubble${rewriteBubbleExpanded ? "" : " rewrite-bubble--trigger"}`}
            style={{ top: rewriteBubble.top, left: rewriteBubble.left }}
          >
            {!rewriteBubbleExpanded ? (
              <button
                type="button"
                className="rewrite-bubble-trigger"
                disabled={!rewriteBubbleArmed}
                onMouseDown={(event) => {
                  if (!rewriteBubbleArmed) {
                    return;
                  }
                  event.preventDefault();
                  setRewriteBubbleExpanded(true);
                }}
              >
                Rewrite
              </button>
            ) : (
              <>
                <div className="rewrite-bubble-row">
                  <input
                    ref={rewriteInputRef}
                    value={rewriteInstruction}
                    onChange={(event) => setRewriteInstruction(event.target.value)}
                    placeholder="Rewrite instruction..."
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && rewriteInstruction.trim()) {
                        event.preventDefault();
                        submitRewrite();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setRewriteBubbleExpanded(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="primary"
                    onClick={submitRewrite}
                    disabled={!rewriteInstruction.trim() || rewriteMutation.isPending}
                  >
                    {rewriteMutation.isPending ? "..." : "Rewrite"}
                  </button>
                </div>
                <div className="rewrite-bubble-row" style={{ justifyContent: "space-between" }}>
                  <label className="rewrite-bubble-toggle">
                    <input
                      type="checkbox"
                      checked={preserveVoice}
                      onChange={(event) => setPreserveVoice(event.target.checked)}
                    />
                    <span>Preserve voice</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setRewriteBubbleExpanded(false)}
                    style={{ fontSize: 11, padding: "4px 8px" }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {snippetPicker.visible && filteredSnippets.length > 0 && (
          <div className="snippet-picker" style={{ top: snippetPicker.top, left: snippetPicker.left }}>
            {filteredSnippets.map((snippet, index) => (
              <div
                key={snippet.id}
                className={`snippet-picker-item${index === snippetPickerFocus ? " focused" : ""}`}
                onMouseEnter={() => setSnippetPickerFocus(index)}
                onClick={() => insertSnippetFromPicker(snippet.content)}
              >
                <span className={`scope-badge ${snippet.scope}`}>{snippet.scope}</span>
                <span>{snippet.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`editor-dock editor-dock--${dockMode}`}>
        <div className="editor-dock-inner">
          {dockMode === "idle" && (
            <div className="editor-dock-hint">
              {!projectId || !promptId
                ? "Select a prompt to start generating and rewriting."
                : hasSelection
                  ? "Use the rewrite bubble near the selected text."
                  : "Move the caret to an empty line to generate, or select text to rewrite."}
            </div>
          )}

          {dockMode === "generate" && (
            <>
              <div className="editor-dock-header">
                <div style={{ display: "grid", gap: 2 }}>
                  <span>Prompt Generator</span>
                  <span className="editor-dock-hint">
                    {generatorSourceLineNumber !== null
                      ? `Bound to line ${generatorSourceLineNumber}. Typing in that line syncs the brief here.`
                      : "Move to a blank line to bind the generator."}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setGeneratorExpanded((value) => !value)}
                >
                  {generatorExpanded ? "Hide dimensions" : "Show dimensions"}
                </button>
              </div>

              <div className="generate-compact-row">
                <input
                  value={generatorBrief}
                  onChange={(event) => setGeneratorBrief(event.target.value)}
                  placeholder="Describe the next prompt you want to create..."
                />
                <button
                  type="button"
                  className="primary"
                  onClick={() => generateMutation.mutate()}
                  disabled={!canGenerate}
                >
                  {generateMutation.isPending ? "Generating..." : "Generate"}
                </button>
              </div>

              {generatorExpanded && (
                <div className="generate-dimensions-grid">
                  {GENERATOR_DIMENSIONS.map((definition) => (
                    <div
                      key={definition.key}
                      className={`generate-dimension-row${generatorDragOverKey === definition.key ? " drag-over" : ""}`}
                      onDragOver={(event) => handleDimensionDragOver(event, definition.key)}
                      onDragLeave={() =>
                        setGeneratorDragOverKey((current) =>
                          current === definition.key ? null : current,
                        )
                      }
                      onDrop={(event) => handleDimensionDrop(event, definition.key)}
                    >
                      <label>{definition.label}</label>
                      <input
                        value={generatorDimensions[definition.key]}
                        onChange={(event) =>
                          setGeneratorDimensions((prev) => ({
                            ...prev,
                            [definition.key]: event.target.value,
                          }))
                        }
                        list={`generator-dimension-${definition.key}`}
                        onDragOver={(event) => handleDimensionDragOver(event, definition.key)}
                        onDragLeave={() =>
                          setGeneratorDragOverKey((current) =>
                            current === definition.key ? null : current,
                          )
                        }
                        onDrop={(event) => handleDimensionDrop(event, definition.key)}
                        placeholder={definition.placeholder}
                      />
                    </div>
                  ))}
                  {GENERATOR_DIMENSIONS.map((definition) => (
                    <datalist
                      key={`suggestions-${definition.key}`}
                      id={`generator-dimension-${definition.key}`}
                    >
                      {(generatorTagSuggestions.get(definition.tag) ?? []).map((suggestion) => (
                        <option key={`${definition.key}-${suggestion}`} value={suggestion} />
                      ))}
                    </datalist>
                  ))}
                </div>
              )}

              {generateMutation.isError && (
                <p className="warn mono" style={{ margin: 0 }}>
                  {String(generateMutation.error)}
                </p>
              )}

              {generatorPreview ? (
                <div className="generate-preview-card">
                  <div className="generate-preview-meta">
                    {generatorPreview.model} | {generatorPreview.latencyMs}ms
                  </div>
                  <textarea readOnly value={generatorPreview.generatedText} />
                  <div className="generate-preview-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        if (insertGeneratedAtCaret(generatorPreview.generatedText)) {
                          setGeneratorPreview(null);
                        }
                      }}
                      disabled={!canInsertGenerated}
                    >
                      Insert
                    </button>
                    <button
                      type="button"
                      onClick={() => generateMutation.mutate()}
                      disabled={!canGenerate}
                    >
                      Regenerate
                    </button>
                    <button type="button" onClick={() => setGeneratorPreview(null)}>
                      Clear
                    </button>
                  </div>
                  {!canInsertGenerated && (
                    <div className="editor-dock-hint">
                      Return to the bound line to insert the result.
                    </div>
                  )}
                </div>
              ) : (
                <div className="editor-dock-hint">
                  Inserts on the current blank line, or below if occupied.
                </div>
              )}
            </>
          )}

          {dockMode === "rewrite-results" && (
            <>
              <div className="editor-dock-header">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span>Rewrite Results</span>
                  {rewriteTargetText && <span className="scope-tag">selection only</span>}
                </div>
                <button type="button" onClick={closeRewriteResults}>
                  Close
                </button>
              </div>

              {rewriteMutation.isPending && (
                <div className="editor-dock-hint">Generating rewrite candidates...</div>
              )}

              {rewriteMutation.isError && (
                <p className="warn mono" style={{ margin: 0 }}>
                  {String(rewriteMutation.error)}
                </p>
              )}

              {rewriteMutation.data?.candidates ? (
                <div className="candidate-cards">
                  {rewriteMutation.data.candidates.map((candidate) => (
                    <div className="candidate-card" key={candidate.id}>
                      <div className={`candidate-card-label ${candidate.level}`}>
                        {candidate.level}
                      </div>
                      <div className="candidate-card-text">{candidate.text}</div>
                      <pre className="candidate-diff">{candidate.unifiedDiff}</pre>
                      <button
                        type="button"
                        style={{ width: "100%", fontSize: 12 }}
                        onClick={() => replaceCurrentSelection(candidate.text)}
                        disabled={!rewriteTargetRange}
                      >
                        Apply
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                !rewriteMutation.isPending && (
                  <div className="editor-dock-hint">
                    Select text to rewrite.
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
