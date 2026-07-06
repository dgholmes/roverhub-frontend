import { ChevronDown, Diamond } from 'lucide-react'

const NAV_ITEMS = ['Dashboard', 'Robots', 'Missions', 'Data', 'System'] as const
type NavItem = typeof NAV_ITEMS[number]

interface Props {
  active: NavItem
}

export default function TopBar({ active }: Props) {
  return (
    <header
      style={{
        height: 56,
        background: '#111115',
        borderBottom: '1px solid #252527',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 20,
        paddingRight: 20,
        gap: 0,
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
        <img src="/rover.png" alt="RoverHub" style={{ width: 34, height: 34, objectFit: 'contain' }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            RoverHub
          </div>
          <div style={{ fontSize: 10, color: '#55555A', fontWeight: 400, letterSpacing: '0.02em' }}>
            Quadruped Control System
          </div>
        </div>
      </div>

      {/* Center Nav */}
      <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item === active
          return (
            <button
              key={item}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: isActive ? '1px solid rgba(255,255,255,0.10)' : '1px solid transparent',
                background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: isActive ? '#FFFFFF' : '#6A6A70',
                fontFamily: 'Outfit, system-ui, sans-serif',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                letterSpacing: '-0.01em',
                transition: 'color 0.15s, background 0.15s',
              }}
            >
              {item}
            </button>
          )
        })}
      </nav>

      {/* Right cluster */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 280, justifyContent: 'flex-end' }}>
        {/* Edge Bridge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: '#AAFF00',
            boxShadow: '0 0 6px rgba(170,255,0,0.6)',
          }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.3 }}>Edge Bridge</div>
            <div style={{ fontSize: 10, color: '#55555A', lineHeight: 1.2 }}>Online</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: '#252527' }} />

        {/* Bell */}
        <button style={{
          position: 'relative', background: 'transparent', border: 'none',
          color: '#8B8B90', cursor: 'pointer', padding: 4, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Diamond size={16} strokeWidth={1.5} color="#8B8B90" />
          <span style={{
            position: 'absolute', top: -2, right: -2,
            width: 16, height: 16, borderRadius: '50%',
            background: '#AAFF00', color: '#000000',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>2</span>
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: '#252527' }} />

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: '#1C1C1F', border: '1.5px solid #2E2E32',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            fontSize: 11, fontWeight: 700, color: '#8B8B90',
            fontFamily: 'Outfit, system-ui, sans-serif',
            letterSpacing: '-0.02em',
          }}>
            MJ
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.3 }}>MinJae Joo</div>
            <div style={{ fontSize: 10, color: '#55555A', lineHeight: 1.2 }}>Operator</div>
          </div>
          <ChevronDown size={12} color="#55555A" strokeWidth={2} />
        </div>
      </div>
    </header>
  )
}
