import { useState } from 'react'
import { CheckIcon, CopyIcon, ShareIcon } from './icons'
import './FriendCode.css'

export default function FriendCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Sin permiso de portapapeles: el código igual queda visible para copiarlo a mano
    }
  }

  const share = async () => {
    try {
      await navigator.share({
        title: 'EscabiARG',
        text: `Sumame en EscabiARG 🍺 Mi código es ${code}`,
        url: window.location.origin,
      })
    } catch {
      // El usuario canceló
    }
  }

  return (
    <div className="friend-code">
      <span className="friend-code-label">Tu código</span>
      <span className="friend-code-value">{code}</span>
      <div className="friend-code-actions">
        <button type="button" className="btn btn--ghost" onClick={copy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        {canShare && (
          <button type="button" className="btn btn--ghost" onClick={share}>
            <ShareIcon />
            Compartir
          </button>
        )}
      </div>
    </div>
  )
}
