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
