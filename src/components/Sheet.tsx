import { useEffect, useRef, type ReactNode } from 'react'
import { CloseIcon } from './icons'
import './Sheet.css'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Panel modal: hoja inferior en celular, diálogo centrado en pantallas grandes */
export default function Sheet({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      // Los eventos de un diálogo anidado (ej: la cámara) suben por el árbol de React:
      // solo reaccionamos a los de este diálogo
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        // Click en el fondo oscuro (fuera del contenido) cierra
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="sheet-body">
          <header className="sheet-header">
            <h2 className="sheet-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <CloseIcon />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}
