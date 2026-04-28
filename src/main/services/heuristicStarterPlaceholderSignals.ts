interface StarterPlaceholderMarker {
  label: string;
  pattern: RegExp;
}

const STARTER_PLACEHOLDER_MARKERS: StarterPlaceholderMarker[] = [
  { label: "open primary action", pattern: /open primary action/ },
  { label: "focused desktop shell", pattern: /focused desktop shell/ },
  { label: "shell guidance", pattern: /shell guidance/ },
  { label: "desktop starter app", pattern: /desktop starter app/ },
  { label: "react starter", pattern: /react starter/ },
  { label: "replace this starter shell", pattern: /replace this starter shell/ },
  { label: "replace starter content", pattern: /replace starter content/ },
  { label: "replace this with the product workflow", pattern: /replace this with the product workflow/ },
  { label: "ready for domain-specific screens", pattern: /ready for domain-specific screens/ },
  { label: "inspect sections", pattern: /inspect sections/ }
];

export function detectStarterPlaceholderSignals(content: string): string[] {
  const normalized = (content ?? "").toLowerCase();
  return STARTER_PLACEHOLDER_MARKERS
    .filter((marker) => marker.pattern.test(normalized))
    .map((marker) => marker.label);
}
