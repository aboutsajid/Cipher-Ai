function messageRolePriority(role: string): number {
  if (role === "user") return 0;
  if (role === "assistant") return 1;
  return 2;
}

function compareMessagesForRender(a: Message, b: Message): number {
  const tsA = Date.parse(a.createdAt ?? "");
  const tsB = Date.parse(b.createdAt ?? "");

  const aHasTime = Number.isFinite(tsA);
  const bHasTime = Number.isFinite(tsB);
  if (aHasTime && bHasTime && tsA !== tsB) return tsA - tsB;

  if ((a.createdAt ?? "") !== (b.createdAt ?? "")) {
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  }

  const roleDelta = messageRolePriority(a.role) - messageRolePriority(b.role);
  if (roleDelta !== 0) return roleDelta;

  return (a.id ?? "").localeCompare(b.id ?? "");
}

function normalizeRenderedMessageOrder(): void {
  renderedMessages.sort(compareMessagesForRender);
}
