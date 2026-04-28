export type PreviewBootstrapMode = "static" | "react";

export function hasPreviewBootstrapSignals(source: string, mode: PreviewBootstrapMode): boolean {
  const normalized = (source ?? "").toLowerCase();
  if (!normalized.trim()) return false;

  if (mode === "react") {
    return /createroot|root\.render|reactdom\.createroot/.test(normalized);
  }

  return /document\.queryselector|document\.getelementbyid|addeventlistener\("domcontentloaded"|addeventlistener\('domcontentloaded'|replacechildren|appendchild|insertadjacenthtml|innerhtml|classlist\./.test(normalized);
}
