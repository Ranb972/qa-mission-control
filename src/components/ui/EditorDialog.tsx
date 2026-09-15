import { useLayoutEffect, useRef, type ReactNode } from 'react'

/** Native modal containment, Escape dismissal and focus return for record editors. */
export function EditorDialog({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const previousFocus = document.activeElement
    const element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])
  return <dialog ref={dialog} className="modal-dialog editor-dialog" aria-modal="true" aria-labelledby={labelledBy} onCancel={(event) => { event.preventDefault(); onClose() }}>{children}</dialog>
}
