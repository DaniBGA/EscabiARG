type IconProps = { size?: number }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export const FriendsIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
    <circle cx="17" cy="9" r="2.8" />
    <path d="M16.5 13.6c2.9.2 5 2.6 5 5.9" />
  </svg>
)

export const PlusIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.6}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const CloseIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const CalendarIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

export const PinIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
)

export const CopyIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
)

export const ShareIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 3v13M7 8l5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
)

export const CheckIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} strokeWidth={3}>
    <path d="m5 12 5 5 9-10" />
  </svg>
)

export const CameraIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </svg>
)

export const BackIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.4}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

export const EditIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
)

export const TrashIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
)

export const MoonIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
)

export const MugIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M5 8h10v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z" />
    <path d="M15 11h2.5a2.5 2.5 0 0 1 0 5H15" />
    <path d="M5 8c0-2 1.5-3 3-3 .5-1.5 2-2 3.2-1.5C12.5 2.5 15 3.5 15 6v2" />
    <path d="M8.5 12v5M11.5 12v5" />
  </svg>
)

export const DizzyIcon = ({ size = 24 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M7.5 8.5l2 2m0-2l-2 2M14.5 8.5l2 2m0-2l-2 2" />
    <path d="M9 16.5c1.8-1.2 4.2-1.2 6 0" />
  </svg>
)

export const BellIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
)
