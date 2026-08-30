export function workspaceResetState() {
  return {
    selectedDocumentId: null,
    page: 0,
    isSidebarOpen: false,
    isWorkspaceCleared: true,
  } as const;
}
