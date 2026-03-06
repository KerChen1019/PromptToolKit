import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSnippet,
  getAppSetting,
  listProjects,
  listSnippets,
  setAppSetting,
} from "../../lib/tauri";
import {
  TAG_DRAG_MIME,
  buildDefaultTagTaxonomy,
  canonicalTagLabel,
  categoryId,
  mergeLegacyProjectCustomTags,
  normalizeTagForStorage,
  normalizeTagTaxonomy,
  serializeTagTaxonomy,
} from "../../lib/tagTaxonomy";
import { useUIStore } from "../../store/uiStore";
import type { Scope, TagCategory } from "../../types/domain";

const GLOBAL_TAG_TAXONOMY_KEY = "global_tag_taxonomy";
const SCOPES: Scope[] = ["prefix", "free", "suffix"];

type LibraryFilter = "all" | "current-project";

export let insertSnippetToEditor: ((text: string) => void) | null = null;

export function setInsertSnippetToEditor(fn: ((text: string) => void) | null) {
  insertSnippetToEditor = fn;
}

export let insertTagToEditor: ((tag: string) => void) | null = null;

export function setInsertTagToEditor(fn: ((tag: string) => void) | null) {
  insertTagToEditor = fn;
}

function setDragTagPayload(dataTransfer: DataTransfer, tag: string) {
  const normalized = normalizeTagForStorage(tag);
  if (!normalized) {
    return;
  }
  dataTransfer.setData(TAG_DRAG_MIME, normalized);
  dataTransfer.setData("text/plain", normalized);
  dataTransfer.effectAllowed = "copy";
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

export function SnippetsPanel() {
  const projectId = useUIStore((s) => s.projectId);
  const queryClient = useQueryClient();
  const hasSeededDefaultTaxonomy = useRef(false);
  const knownCategoryIdsRef = useRef<Set<string>>(new Set());

  const [searchText, setSearchText] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [addingTagCategoryId, setAddingTagCategoryId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const snippetsQuery = useQuery({
    queryKey: ["snippets", projectId],
    queryFn: () => listSnippets(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const taxonomyQuery = useQuery({
    queryKey: ["appSetting", GLOBAL_TAG_TAXONOMY_KEY],
    queryFn: () => getAppSetting(GLOBAL_TAG_TAXONOMY_KEY),
  });

  const defaultTaxonomy = useMemo(
    () => mergeLegacyProjectCustomTags(buildDefaultTagTaxonomy(), projectsQuery.data ?? []),
    [projectsQuery.data],
  );

  const taxonomy = useMemo(() => parseStoredTaxonomy(taxonomyQuery.data) ?? defaultTaxonomy, [defaultTaxonomy, taxonomyQuery.data]);

  const currentProject = projectsQuery.data?.find((project) => project.id === projectId) ?? null;

  const saveTaxonomyMutation = useMutation({
    mutationFn: (nextTaxonomy: TagCategory[]) =>
      setAppSetting(GLOBAL_TAG_TAXONOMY_KEY, serializeTagTaxonomy(nextTaxonomy)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appSetting", GLOBAL_TAG_TAXONOMY_KEY] }),
  });

  useEffect(() => {
    if (!taxonomyQuery.isSuccess || taxonomyQuery.data !== null || hasSeededDefaultTaxonomy.current) {
      return;
    }
    hasSeededDefaultTaxonomy.current = true;
    saveTaxonomyMutation.mutate(defaultTaxonomy);
  }, [defaultTaxonomy, saveTaxonomyMutation, taxonomyQuery.data, taxonomyQuery.isSuccess]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSnippet(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["snippets", projectId] }),
  });

  const snippets = snippetsQuery.data ?? [];
  const search = searchText.trim().toLowerCase();

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const snippet of snippets) {
      for (const rawTag of snippet.tags) {
        const tag = normalizeTagForStorage(rawTag);
        if (!tag) {
          continue;
        }
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [snippets]);

  const filteredSnippets = useMemo(() => {
    return snippets.filter((snippet) => {
      if (activeTag !== "all") {
        const hasTag = snippet.tags.some((tag) => normalizeTagForStorage(tag) === activeTag);
        if (!hasTag) {
          return false;
        }
      }
      if (!search) {
        return true;
      }
      const haystack = `${snippet.name} ${snippet.content} ${snippet.tags.join(" ")}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [activeTag, search, snippets]);

  const taxonomyForDisplay = useMemo(() => {
    return taxonomy.map((category) => {
      if (libraryFilter !== "current-project" || !projectId) {
        return category;
      }
      return {
        ...category,
        tags: category.tags.filter((tag) => tag.projectIds.includes(projectId)),
      };
    });
  }, [libraryFilter, projectId, taxonomy]);

  useEffect(() => {
    const ids = taxonomy.map((category) => categoryId(category));
    setCollapsedCategories((previous) => {
      const next = new Set<string>();
      let changed = false;

      for (const id of previous) {
        if (ids.includes(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }

      for (const id of ids) {
        if (!knownCategoryIdsRef.current.has(id)) {
          next.add(id);
          changed = true;
        }
      }

      knownCategoryIdsRef.current = new Set(ids);

      if (!changed && next.size === previous.size) {
        let same = true;
        for (const id of next) {
          if (!previous.has(id)) {
            same = false;
            break;
          }
        }
        if (same) {
          return previous;
        }
      }

      return next;
    });
  }, [taxonomy]);

  function updateTaxonomy(transform: (current: TagCategory[]) => TagCategory[]) {
    const nextTaxonomy = normalizeTagTaxonomy(transform(taxonomy));
    saveTaxonomyMutation.mutate(nextTaxonomy);
  }

  function toggleCategory(category: TagCategory) {
    const key = categoryId(category);
    setCollapsedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function addTagToCategory(category: TagCategory) {
    const rawTag = newTagInput.trim();
    if (!rawTag) {
      setAddingTagCategoryId(null);
      setNewTagInput("");
      return;
    }

    updateTaxonomy((current) => {
      const key = categoryId(category);
      return current.map((item) => {
        if (categoryId(item) !== key) {
          return item;
        }
        const value = normalizeTagForStorage(rawTag);
        if (!value || item.tags.some((tag) => tag.value === value)) {
          return item;
        }
        return {
          ...item,
          tags: [...item.tags, { value, projectIds: [] }],
        };
      });
    });

    setAddingTagCategoryId(null);
    setNewTagInput("");
  }

  function removeTagFromCategory(category: TagCategory, tagValue: string) {
    updateTaxonomy((current) =>
      current.map((item) => {
        if (categoryId(item) !== categoryId(category)) {
          return item;
        }
        return {
          ...item,
          tags: item.tags.filter((tag) => tag.value !== tagValue),
        };
      }),
    );
    if (activeTag === tagValue) {
      setActiveTag("all");
    }
  }

  function toggleProjectAssociation(category: TagCategory, tagValue: string) {
    if (!projectId) {
      return;
    }
    updateTaxonomy((current) =>
      current.map((item) => {
        if (categoryId(item) !== categoryId(category)) {
          return item;
        }
        return {
          ...item,
          tags: item.tags.map((tag) => {
            if (tag.value !== tagValue) {
              return tag;
            }
            const isLinked = tag.projectIds.includes(projectId);
            return {
              ...tag,
              projectIds: isLinked
                ? tag.projectIds.filter((id) => id !== projectId)
                : [...tag.projectIds, projectId],
            };
          }),
        };
      }),
    );
  }

  function addCustomCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      setCreatingCategory(false);
      setNewCategoryName("");
      return;
    }
    updateTaxonomy((current) => {
      const exists = current.some(
        (category) => category.dimensionKey === null && category.name.toLowerCase() === name.toLowerCase(),
      );
      if (exists) {
        return current;
      }
      return [...current, { name, dimensionKey: null, tags: [] }];
    });
    setCreatingCategory(false);
    setNewCategoryName("");
  }

  function deleteCustomCategory(category: TagCategory) {
    updateTaxonomy((current) => current.filter((item) => categoryId(item) !== categoryId(category)));
  }

  function toggleActiveTag(tagValue: string) {
    setActiveTag((current) => (current === tagValue ? "all" : tagValue));
  }

  const flatVisibleTags = useMemo(
    () => {
      const unique = new Map<string, { category: TagCategory; tag: TagCategory["tags"][number] }>();
      for (const category of taxonomyForDisplay) {
        for (const tag of category.tags) {
          if (!unique.has(tag.value)) {
            unique.set(tag.value, { category, tag });
          }
        }
      }
      return Array.from(unique.values());
    },
    [taxonomyForDisplay],
  );

  const snippetsByScope = (scope: Scope) =>
    filteredSnippets.filter((snippet) => snippet.scope === scope);

  if (!projectId) {
    return <p style={{ fontSize: 12, color: "#9ca3af", padding: 8 }}>Select a project first.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0, overflowX: "hidden" }}>
      <section style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Tag Library</div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
              {taxonomyForDisplay.length} categories · {flatVisibleTags.length} tags
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              className={libraryFilter === "all" ? "primary sm" : "sm"}
              onClick={() => setLibraryFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={libraryFilter === "current-project" ? "primary sm" : "sm"}
              onClick={() => setLibraryFilter("current-project")}
            >
              Current Project
            </button>
            {creatingCategory ? (
              <input
                autoFocus
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Custom category name"
                style={{ fontSize: 11, width: 160 }}
                onBlur={addCustomCategory}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    addCustomCategory();
                  }
                  if (event.key === "Escape") {
                    setCreatingCategory(false);
                    setNewCategoryName("");
                  }
                }}
              />
            ) : (
              <button type="button" className="sm" onClick={() => setCreatingCategory(true)}>
                + Category
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {taxonomyForDisplay.map((category) => {
            const key = categoryId(category);
            const isCollapsed = collapsedCategories.has(key);
            const isCustomCategory = category.dimensionKey === null;
            const visibleTags = category.tags;

            return (
              <div key={key} style={{ borderBottom: "1px solid var(--border-muted)", paddingBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="xs ghost"
                    onClick={() => toggleCategory(category)}
                  >
                    {isCollapsed ? "▸" : "▾"}
                  </button>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{category.name}</span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 5px",
                      borderRadius: 999,
                      background: "var(--bg-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {visibleTags.length}
                  </span>
                  <button
                    type="button"
                    className="xs"
                    onClick={() => {
                      setAddingTagCategoryId(key);
                      setNewTagInput("");
                    }}
                  >
                    + Tag
                  </button>
                  {isCustomCategory && (
                    <button
                      type="button"
                      className="xs danger"
                      onClick={() => deleteCustomCategory(category)}
                    >
                      Delete
                    </button>
                  )}
                </div>

                {addingTagCategoryId === key && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      autoFocus
                      value={newTagInput}
                      onChange={(event) => setNewTagInput(event.target.value)}
                      placeholder="tag name"
                      style={{ fontSize: 11, width: "100%" }}
                      onBlur={() => addTagToCategory(category)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          addTagToCategory(category);
                        }
                        if (event.key === "Escape") {
                          setAddingTagCategoryId(null);
                          setNewTagInput("");
                        }
                      }}
                    />
                  </div>
                )}

                {!isCollapsed && (
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {visibleTags.length === 0 && (
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {libraryFilter === "current-project"
                          ? "No tags linked to this project yet."
                          : "No tags in this category yet."}
                      </div>
                    )}

                    {visibleTags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {visibleTags.map((tagEntry) => {
                          const isPinned = projectId ? tagEntry.projectIds.includes(projectId) : false;
                          const count = tagCounts.get(tagEntry.value) ?? 0;
                          return (
                            <div
                              key={`${key}-${tagEntry.value}`}
                              role="button"
                              tabIndex={0}
                              draggable
                              onDragStart={(event) => setDragTagPayload(event.dataTransfer, tagEntry.value)}
                              onClick={() => {
                                if (insertTagToEditor) {
                                  insertTagToEditor(tagEntry.value);
                                } else {
                                  toggleActiveTag(tagEntry.value);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  if (insertTagToEditor) {
                                    insertTagToEditor(tagEntry.value);
                                  } else {
                                    toggleActiveTag(tagEntry.value);
                                  }
                                }
                              }}
                              title="Click to insert · Drag to editor or Generator"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: 4,
                                borderRadius: 999,
                                background: activeTag === tagEntry.value ? "var(--accent-bg)" : "var(--bg-subtle)",
                                border: `1px solid ${activeTag === tagEntry.value ? "var(--accent)" : "var(--border)"}`,
                                maxWidth: "100%",
                                cursor: "grab",
                              }}
                            >
                              <span style={{ fontSize: 11, padding: "1px 4px" }}>
                                {canonicalTagLabel(tagEntry.value)} ({count})
                              </span>
                              <button
                                type="button"
                                className="xs"
                                style={isPinned ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleProjectAssociation(category, tagEntry.value);
                                }}
                                disabled={!projectId}
                                draggable={false}
                                title={isPinned ? `Unlink from ${currentProject?.name ?? "project"}` : `Link to ${currentProject?.name ?? "project"}`}
                              >
                                {isPinned ? "Pinned" : "Pin"}
                              </button>
                              <button
                                type="button"
                                className="xs danger"
                                draggable={false}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeTagFromCategory(category, tagEntry.value);
                                }}
                              >
                                x
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search snippets or tags..."
            style={{ fontSize: 12, flex: 1, minWidth: 0 }}
          />
        </div>
      </section>

      {SCOPES.map((scope) => {
        const items = snippetsByScope(scope);
        if (items.length === 0) {
          return null;
        }

        return (
          <div key={scope} style={{ marginBottom: 4 }}>
            <div
              className="panel-section-title"
            >
              {scope}
            </div>
            {items.map((snippet) => (
              <div key={snippet.id} className="compact-item">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`scope-badge ${snippet.scope}`}>{snippet.scope}</span>
                  <span className="compact-item-title" style={{ flex: 1 }}>
                    {snippet.name}
                  </span>
                  <button
                    type="button"
                    className="sm"
                    onClick={() => insertSnippetToEditor?.(snippet.content)}
                  >
                    Insert
                  </button>
                  <button
                    type="button"
                    className="xs danger"
                    onClick={() => deleteMutation.mutate(snippet.id)}
                  >
                    x
                  </button>
                </div>
                <div
                  className="compact-item-meta mono"
                  style={{ marginTop: 4, maxHeight: 40, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {snippet.content.slice(0, 80)}
                  {snippet.content.length > 80 ? "..." : ""}
                </div>
                {snippet.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {snippet.tags.map((tag) => {
                      const normalized = normalizeTagForStorage(tag);
                      if (!normalized) {
                        return null;
                      }
                      return (
                        <span
                          key={`${snippet.id}-${normalized}`}
                          role="button"
                          tabIndex={0}
                          style={{
                            display: "inline-flex",
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: activeTag === normalized ? "var(--accent-bg)" : "var(--bg-subtle)",
                            border: `1px solid ${activeTag === normalized ? "var(--accent)" : "var(--border)"}`,
                            cursor: "grab",
                          }}
                          onClick={() => {
                            if (insertTagToEditor) {
                              insertTagToEditor(normalized);
                            } else {
                              toggleActiveTag(normalized);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              if (insertTagToEditor) {
                                insertTagToEditor(normalized);
                              } else {
                                toggleActiveTag(normalized);
                              }
                            }
                          }}
                          draggable
                          onDragStart={(event) => setDragTagPayload(event.dataTransfer, normalized)}
                          title="Click to insert · Drag to editor or Generator"
                        >
                          {canonicalTagLabel(normalized)}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {filteredSnippets.length === 0 && (
        <p style={{ fontSize: 12, color: "#9ca3af" }}>
          {snippets.length === 0 ? "No snippets yet." : "No snippets match this tag/search."}
        </p>
      )}
    </div>
  );
}
