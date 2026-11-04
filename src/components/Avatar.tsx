import './Avatar.css'

const COLORS = ['#f7b52c', '#e8920f', '#ffd56b', '#f28c38', '#d9a441', '#ffb347']

function colorFor(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]
  return letters.toUpperCase()
}

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
