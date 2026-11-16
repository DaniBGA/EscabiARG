import { colorFor, initials } from '../lib/avatarStyle'
import './Avatar.css'

type Props = { id: string; name: string; size?: number }

export default function Avatar({ id, name, size = 40 }: Props) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: colorFor(id) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
