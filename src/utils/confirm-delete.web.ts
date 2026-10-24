// A dismissed/suppressed browser confirmation never authorizes deletion.
export async function confirmDelete(title: string, message: string, _confirmLabel: string, _cancelLabel: string): Promise<boolean> {
  return window.confirm(`${title}\n\n${message}`);
}
