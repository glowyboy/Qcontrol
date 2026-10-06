"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, BarChart3, Check, ChevronRight, FileText, Globe2, History, LocateFixed, LockKeyhole, LogOut, Menu, Moon, ScanLine, ShieldCheck, UserRound, X } from "lucide-react"
import { supabase } from "@/lib/supabase"

const logoUrl = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/q-controle-logo-zE07zuJZaNApC9syFlYI4qGPNUgvW9.jpg"

function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [employeeId, setEmployeeId] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!employeeId || !pin) {
      setError("Veuillez remplir tous les champs")
      return
    }
    setLoading(true)
    setError("")
    try {
      const { data, error: loginError } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('pin_code', pin)
        .single()

      if (loginError || !data) {
        setError("Identifiant ou code PIN incorrect")
        return
      }

      // Update presence to online — log error but don't block login
      const { error: presenceError } = await supabase
        .from('employee_presence')
        .upsert({
          employee_id: data.id,
          account_id: data.account_id,
          status: 'online',
          last_seen: new Date().toISOString(),
        }, { onConflict: 'employee_id' })
      if (presenceError) console.error('Presence update error:', presenceError)

      localStorage.setItem('q_control_user', JSON.stringify(data))
      onLogin(data)
    } catch (err: any) {
      console.error('Login error:', err)
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <img src={logoUrl} alt="Q-Control" />
        </div>
        <p className="eyebrow">ESPACE SÉCURISÉ</p>
        <h1 id="login-title">Bienvenue sur Q-Control</h1>
        <p className="login-subtitle">Connectez-vous à votre espace de contrôle mobile.</p>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="employeeId">Identifiant</label>
          <div className="input-wrap">
            <UserRound size={18} />
            <input
              id="employeeId"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="Votre identifiant"
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <label htmlFor="pin">Code PIN</label>
          <div className="input-wrap">
            <LockKeyhole size={18} />
            <input
              id="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Votre code PIN"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'} <ChevronRight size={18} />
          </button>
        </form>
        <p className="login-help">Accès réservé aux agents autorisés</p>
      </section>
    </main>
  )
}

function Dashboard({ user, onLogout }: { user: any; onLogout: () => void }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("Q-Control")
  const [night, setNight] = useState(false)
  const [message, setMessage] = useState("")

  const notify = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(""), 2200)
  }

  const handleSOS = async () => {
    try {
      const sendSOS = async (lat: number | null, lng: number | null) => {
        const sosData = {
          employee_id: user.id,
          account_id: user.account_id || null,
          latitude: lat,
          longitude: lng,
          timestamp: new Date().toISOString(),
          status: 'Active',
          guard_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown Guard',
          guard_phone: user.phone_number || null,
        }
        console.log('🚨 Sending SOS:', sosData)
        const { error: sosError } = await supabase.from('sos_alerts').insert(sosData)
        if (sosError) {
          console.error('SOS insert error:', sosError)
          notify("❌ Erreur SOS — réessayez")
        } else {
          notify("🚨 Alerte SOS envoyée!")
        }
      }

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            await sendSOS(position.coords.latitude, position.coords.longitude)
          },
          async (err) => {
            // GPS unavailable — send SOS anyway without coordinates
            console.warn('Geolocation error:', err.message)
            notify("⚠️ SOS envoyé sans position GPS")
            await sendSOS(null, null)
          },
          { timeout: 8000, maximumAge: 30000 }
        )
      } else {
        await sendSOS(null, null)
      }
    } catch (error) {
      console.error('SOS error:', error)
      notify("❌ Erreur SOS")
    }
  }

  const handleCheckpoint = async () => {
    try {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const now = new Date().toISOString()
            const { error: cpError } = await supabase
              .from('employee_location_tracking')
              .upsert({
                employee_id: user.id,
                account_id: user.account_id,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                is_active: true,
                timestamp: now,
                last_updated: now,
              }, { onConflict: 'employee_id' })
            if (cpError) {
              console.error('Checkpoint error:', cpError)
              notify("❌ Erreur checkpoint")
            } else {
              notify("📍 Checkpoint enregistré")
            }
          },
          (err) => {
            console.error('Checkpoint geolocation error:', err)
            notify("⚠️ Position GPS non disponible")
          },
          { timeout: 8000 }
        )
      } else {
        notify("Géolocalisation non disponible")
      }
    } catch (error) {
      console.error('Checkpoint error:', error)
      notify("❌ Erreur checkpoint")
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.from('employee_presence').update({
        status: 'offline',
        last_seen: new Date().toISOString(),
      }).eq('employee_id', user.id)
      localStorage.removeItem('q_control_user')
      onLogout()
    } catch (error) {
      console.error('Logout error:', error)
      onLogout()
    }
  }

  const nav = [
    { label: "Q-Control", icon: ShieldCheck, action: () => {} },
    { label: "Q-Patrol", icon: BarChart3, action: () => router.push('/instructions') },
    { label: "Instructions", icon: FileText, action: () => router.push('/instructions') },
  ]

  const userName = user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Agent'
  const initials = userName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
  const profilePhoto = user?.photo || null

  return (
    <main className={`app-shell${night ? ' night' : ''}`}>
      <header className="topbar">
        <div className="profile">
          <div className="avatar">
            {profilePhoto ? (
              <img src={profilePhoto} alt={userName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            ) : (
              initials
            )}
          </div>
          <div>
            <strong>{userName}</strong>
            <span>Agent de sécurité</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="sos-button" onClick={handleSOS}>
            <AlertTriangle size={16} fill="currentColor" /> SOS
          </button>
          <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">
            <Menu size={22} />
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="brand-orbit">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="brand-logo">
            <img src={logoUrl} alt="Logo Q-Control" />
          </div>
        </div>
        <h1>Q-Control Mobile</h1>
        <p className="tagline">Stay Safe, Stay Connected</p>
        <div className="action-stack">
          <button className="action-button scan" onClick={() => router.push('/scan')}>
            <ScanLine size={22} />
            <span>SCAN</span>
          </button>
          <button className="action-button checkpoint" onClick={handleCheckpoint}>
            <LocateFixed size={22} fill="currentColor" />
            <span>CHECKPOINT</span>
          </button>
        </div>
      </section>

      <nav className="bottom-nav" aria-label="Navigation principale">
        {nav.map(({ label, icon: Icon, action }) => (
          <button
            key={label}
            className={activeTab === label ? "active" : ""}
            onClick={() => { setActiveTab(label); action() }}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {message && (
        <div className="toast" role="status">
          <Check size={16} />{message}
        </div>
      )}

      {menuOpen && (
        <>
          <button className="drawer-overlay" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />
          <aside className="drawer">
            <div className="drawer-head">
              <div className="profile">
                <div className="avatar">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt={userName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    initials
                  )}
                </div>
                <div>
                  <strong>{userName}</strong>
                  <span>Agent de sécurité</span>
                </div>
              </div>
              <button className="close-button" onClick={() => setMenuOpen(false)} aria-label="Fermer">
                <X />
              </button>
            </div>
            <div className="drawer-items">
              <button onClick={() => { setMenuOpen(false); router.push('/rapport') }}>
                <FileText />Rapport
              </button>
              <button onClick={() => { setMenuOpen(false); router.push('/scan') }}>
                <History />Historique des scans
              </button>
              <button onClick={() => { setMenuOpen(false); handleCheckpoint() }}>
                <LocateFixed />Checkpoint
              </button>
              <div className="drawer-row">
                <span><Moon />Mode Nuit</span>
                <button className={`switch ${night ? "on" : ""}`} onClick={() => setNight(!night)} aria-label="Activer le mode nuit">
                  <span />
                </button>
              </div>
              <button onClick={() => { setMenuOpen(false); router.push('/instructions') }}>
                <Globe2 />Instructions <ChevronRight />
              </button>
            </div>
            <button className="logout" onClick={handleLogout}>
              <LogOut />Déconnexion
            </button>
          </aside>
        </>
      )}
    </main>
  )
}

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('q_control_user')
      if (savedUser) {
        try { setUser(JSON.parse(savedUser)) } catch { localStorage.removeItem('q_control_user') }
      }
      setLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', color: '#062c4d' }}>Chargement...</div>
      </div>
    )
  }

  return user ? <Dashboard user={user} onLogout={() => setUser(null)} /> : <Login onLogin={setUser} />
}
