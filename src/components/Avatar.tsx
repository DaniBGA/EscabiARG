import { useState } from 'react'
import { useAvatarUrl } from '../lib/avatars'
import { colorFor, initials } from '../lib/avatarStyle'
import './Avatar.css'

type Props = {
  id: string
  name: string
  size?: number
  /** Foto a mostrar en lugar de la guardada (ej: la vista previa al cambiarla) */
  photo?: string | null
}

export default function Avatar({ id, name, size = 40, photo }: Props) {
  const saved = useAvatarUrl(id)
  const url = photo === undefined ? saved : photo
  // Si la foto no carga (sin internet, borrada), quedan las iniciales
  const [failed, setFailed] = useState<string | null>(null)
  const showPhoto = url && failed !== url

  return (
    <span
      className={showPhoto ? 'avatar avatar--photo' : 'avatar'}
      style={{ width: size, height: size, fontSize: size * 0.4, background: colorFor(id) }}
      aria-hidden="true"
    >
      {showPhoto ? (
        <img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(url)} />
      ) : (
        initials(name)
      )}
    </span>
  )
}
