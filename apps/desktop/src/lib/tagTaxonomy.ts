import type { Project, TagCategory } from "../types/domain";

export type CanonicalTagKey =
  | "subject-action"
  | "camera-lens"
  | "lighting"
  | "color-palette"
  | "material-texture"
  | "composition"
  | "style-mood";

export const TAG_DRAG_MIME = "application/x-prompt-toolkit-tag";

type CanonicalTagDef = {
  key: CanonicalTagKey;
  label: string;
  aliases: string[];
};

type PresetTagCategorySeed = {
  name: string;
  dimensionKey: CanonicalTagKey;
  tags: string[];
};

export const CANONICAL_TAGS: readonly CanonicalTagDef[] = [
  {
    key: "subject-action",
    label: "Subject / Action",
    aliases: [
      "subject action",
      "subject",
      "action",
      "person",
      "character",
      "portrait",
      "people",
    ],
  },
  {
    key: "camera-lens",
    label: "Camera / Lens",
    aliases: ["camera lens", "camera", "lens", "shot", "framing", "angle", "focal length"],
  },
  {
    key: "lighting",
    label: "Lighting",
    aliases: ["light", "illumination"],
  },
  {
    key: "color-palette",
    label: "Color Palette",
    aliases: ["color", "palette", "colour palette"],
  },
  {
    key: "material-texture",
    label: "Material / Texture",
    aliases: ["material", "texture", "fabric", "surface"],
  },
  {
    key: "composition",
    label: "Composition",
    aliases: ["layout", "framing composition"],
  },
  {
    key: "style-mood",
    label: "Style / Mood",
    aliases: ["style", "mood", "look", "aesthetic", "tone"],
  },
] as const;

export const CANONICAL_TAG_PRESETS: readonly CanonicalTagKey[] = CANONICAL_TAGS.map((t) => t.key);

const PRESET_TAG_CATEGORY_SEEDS: readonly PresetTagCategorySeed[] = [
  {
    name: "Subject / Action",
    dimensionKey: "subject-action",
    tags: ["portrait", "standing", "dynamic pose", "silhouette"],
  },
  {
    name: "Camera / Lens",
    dimensionKey: "camera-lens",
    tags: ["35mm", "85mm", "wide angle", "shallow dof", "bokeh"],
  },
  {
    name: "Lighting",
    dimensionKey: "lighting",
    tags: ["golden hour", "soft light", "rim light", "backlit", "dramatic shadows"],
  },
  {
    name: "Color Palette",
    dimensionKey: "color-palette",
    tags: ["warm tones", "cool tones", "monochrome", "vivid", "muted"],
  },
  {
    name: "Material / Texture",
    dimensionKey: "material-texture",
    tags: ["matte", "glossy", "worn leather", "fabric", "metallic"],
  },
  {
    name: "Composition",
    dimensionKey: "composition",
    tags: ["rule of thirds", "centered", "symmetrical", "leading lines"],
  },
  {
    name: "Style / Mood",
    dimensionKey: "style-mood",
    tags: ["cinematic", "moody", "dreamy", "gritty", "ethereal"],
  },
] as const;

export const GENERATOR_DIMENSIONS = [
  {
    key: "subjectAction",
    tag: "subject-action",
    label: "Subject / Action",
    placeholder: "e.g. astronaut holding a lantern, running through neon rain",
  },
  {
    key: "cameraLens",
    tag: "camera-lens",
    label: "Camera / Lens",
    placeholder: "e.g. 50mm, low angle, shallow depth of field",
  },
  {
    key: "lighting",
    tag: "lighting",
    label: "Lighting",
    placeholder: "e.g. soft side light, backlit rim glow",
  },
  {
    key: "colorPalette",
    tag: "color-palette",
    label: "Color Palette",
    placeholder: "e.g. teal-orange with muted shadows",
  },
  {
    key: "materialTexture",
    tag: "material-texture",
    label: "Material / Texture",
    placeholder: "e.g. rough concrete, glossy chrome, soft velvet",
  },
  {
    key: "composition",
    tag: "composition",
    label: "Composition",
    placeholder: "e.g. centered subject, wide negative space",
  },
  {
    key: "styleMood",
    tag: "style-mood",
    label: "Style / Mood",
    placeholder: "e.g. editorial, dreamy, cinematic realism",
  },
] as const;

export type GeneratorDimensionKey = (typeof GENERATOR_DIMENSIONS)[number]["key"];

function simplify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\/_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const aliasToCanonical = (() => {
  const map = new Map<string, CanonicalTagKey>();
  for (const def of CANONICAL_TAGS) {
    map.set(simplify(def.key), def.key);
    map.set(simplify(def.label), def.key);
    for (const alias of def.aliases) {
      map.set(simplify(alias), def.key);
    }
  }
  return map;
})();

export function canonicalizeTag(raw: string): CanonicalTagKey | null {
  const key = aliasToCanonical.get(simplify(raw));
  return key ?? null;
}

export function normalizeTagForStorage(raw: string): string {
  const canonical = canonicalizeTag(raw);
  if (canonical) {
    return canonical;
  }
  const normalized = simplify(raw);
  if (normalized === "image analysis" || normalized === "image analyzer") {
    return "";
  }
  return normalized ? normalized.replace(/\s+/g, "-") : "";
}

export function canonicalTagLabel(tag: string): string {
  const canonical = canonicalizeTag(tag);
  if (!canonical) {
    return tag;
  }
  return CANONICAL_TAGS.find((d) => d.key === canonical)?.label ?? canonical;
}

export function buildDefaultTagTaxonomy(): TagCategory[] {
  return PRESET_TAG_CATEGORY_SEEDS.map((seed) => ({
    name: seed.name,
    dimensionKey: seed.dimensionKey,
    tags: seed.tags
      .map((tag) => normalizeTagForStorage(tag))
      .filter(Boolean)
      .map((value) => ({ value, projectIds: [] })),
  }));
}

export function categoryId(category: TagCategory): string {
  return category.dimensionKey ?? `custom:${normalizeTagForStorage(category.name)}`;
}

export function normalizeTagTaxonomy(input: TagCategory[] | null | undefined): TagCategory[] {
  const base = input ?? [];
  const categories = base.map((category) => {
    const seen = new Set<string>();
    const tags = category.tags
      .map((tag) => ({
        value: normalizeTagForStorage(tag.value),
        projectIds: Array.from(
          new Set((tag.projectIds ?? []).map((projectId) => projectId.trim()).filter(Boolean)),
        ),
      }))
      .filter((tag) => {
        if (!tag.value || seen.has(tag.value)) {
          return false;
        }
        seen.add(tag.value);
        return true;
      });

    return {
      name: category.name.trim() || "Untitled",
      dimensionKey: category.dimensionKey ?? null,
      tags,
    };
  });

  const byDimension = new Map(categories.map((category) => [category.dimensionKey ?? categoryId(category), category]));
  const normalized: TagCategory[] = [];

  for (const seed of PRESET_TAG_CATEGORY_SEEDS) {
    const existing = byDimension.get(seed.dimensionKey);
    const seedTags = seed.tags
      .map((tag) => ({ value: normalizeTagForStorage(tag), projectIds: [] as string[] }))
      .filter((tag) => tag.value);
    const mergedTags = new Map(seedTags.map((tag) => [tag.value, tag]));
    for (const tag of existing?.tags ?? []) {
      mergedTags.set(tag.value, {
        value: tag.value,
        projectIds: Array.from(new Set([...(mergedTags.get(tag.value)?.projectIds ?? []), ...tag.projectIds])),
      });
    }
    const merged: TagCategory = {
      name: seed.name,
      dimensionKey: seed.dimensionKey,
      tags: Array.from(mergedTags.values()).sort((left, right) => left.value.localeCompare(right.value)),
    };
    normalized.push(merged);
    byDimension.delete(seed.dimensionKey);
  }

  const custom = Array.from(byDimension.values())
    .map((category) => ({
      name: category.name,
      dimensionKey: null,
      tags: category.tags,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return [...normalized, ...custom];
}

export function mergeLegacyProjectCustomTags(
  taxonomy: TagCategory[],
  projects: Project[],
): TagCategory[] {
  let next = normalizeTagTaxonomy(taxonomy);
  for (const project of projects) {
    for (const rawTag of project.customTags ?? []) {
      const tag = normalizeTagForStorage(rawTag);
      if (!tag) {
        continue;
      }
      next = upsertTagIntoTaxonomy(next, "Custom", tag, project.id);
    }
  }
  return next;
}

export function upsertTagIntoTaxonomy(
  taxonomy: TagCategory[],
  categoryName: string,
  rawTag: string,
  projectId?: string | null,
): TagCategory[] {
  const tag = normalizeTagForStorage(rawTag);
  if (!tag) {
    return normalizeTagTaxonomy(taxonomy);
  }

  const canonical = canonicalizeTag(tag);
  const dimensionKey = canonical ?? null;
  const desiredCategoryName = canonical ? canonicalTagLabel(canonical) : categoryName.trim() || "Custom";
  let found = false;

  const updated = taxonomy.map((category) => {
    const matchesCategory = canonical
      ? category.dimensionKey === canonical
      : category.dimensionKey === null && category.name === desiredCategoryName;

    if (!matchesCategory) {
      return category;
    }

    found = true;
    const existing = category.tags.find((item) => item.value === tag);
    if (existing) {
      const projectIds = projectId
        ? Array.from(new Set([...existing.projectIds, projectId]))
        : existing.projectIds;
      return {
        ...category,
        tags: category.tags.map((item) => (item.value === tag ? { ...item, projectIds } : item)),
      };
    }

    return {
      ...category,
      tags: [
        ...category.tags,
        {
          value: tag,
          projectIds: projectId ? [projectId] : [],
        },
      ],
    };
  });

  if (found) {
    return normalizeTagTaxonomy(updated);
  }

  return normalizeTagTaxonomy([
    ...updated,
    {
      name: desiredCategoryName,
      dimensionKey,
      tags: [
        {
          value: tag,
          projectIds: projectId ? [projectId] : [],
        },
      ],
    },
  ]);
}

export function taxonomyContainsTag(taxonomy: TagCategory[], rawTag: string): boolean {
  const tag = normalizeTagForStorage(rawTag);
  return taxonomy.some((category) => category.tags.some((entry) => entry.value === tag));
}

export function serializeTagTaxonomy(taxonomy: TagCategory[]): string {
  return JSON.stringify(normalizeTagTaxonomy(taxonomy));
}
