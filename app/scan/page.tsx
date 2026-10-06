"use client"

import { useState, useRef, useCallback, useEffect, Suspense } from "react"
import { ArrowLeft, Camera, Shield, X } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

type AppState = 'scanning' | 'found' | 'destination'
type ScanMode = 'access' | 'patrol'
type ActionType = 'enter' | 'exit'

interface FoundResult {
  kind: 'employee' | 'visitor' | 'vehicle' | 'patrol' | 'not_found'
  data: any
}

declare const BarcodeDetector: any

function ScanPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode: ScanMode = (searchParams.get('mode') as ScanMode) || 'access'

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<any>(null)
  const lastCodeRef = useRef<string | null>(null)
  const processingRef = useRef(false)

  const [appState, setAppState] = useState<AppState>('scanning')
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [found, setFound] = useState<FoundResult | null>(null)
  const [actionType, setActionType] = useState<ActionType>('enter')
  const [destination, setDestination] = useState('')
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const scanLoop = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current || processingRef.current) return
    const video = videoRef.current
    if (video.readyState >= 2) {
      try {
        const codes = await detectorRef.current.detect(video)
        if (codes.length > 0) {
          const code = codes[0].rawValue
          if (code && code !== lastCodeRef.current) {
            lastCodeRef.current = code
            processingRef.current = true
            setProcessing(true)
            const result = await lookupQRCode(code.trim())
            stopCamera()
            setFound(result)
            setAppState('found')
            setProcessing(false)
            return
          }
        }
      } catch (_) {}
    }
    rafRef.current = requestAnimationFrame(scanLoop)
  }, [stopCamera])

  // Start camera on mount
  useEffect(() => {
    startCamera()
  }, [])

  const startCamera = async () => {
    setCameraError(null)
    processingRef.current = false
    lastCodeRef.current = null
    setCameraReady(false)

    if (typeof BarcodeDetector === 'undefined') {
      setCameraError("Scanner QR non supporté. Utilisez Chrome sur Android.")
      return
    }

    try {
      detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] })
    } catch {
      setCameraError("Impossible d'initialiser le scanner.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setCameraReady(true)
            rafRef.current = requestAnimationFrame(scanLoop)
          })
        }
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setCameraError("Permission caméra refusée. Autorisez la caméra dans les paramètres.")
      } else {
        setCameraError("Impossible d'accéder à la caméra.")
      }
    }
  }

  const lookupQRCode = async (code: string): Promise<FoundResult> => {
    try {
      if (mode === 'patrol') {
        const { data } = await supabase.from('patrol_points').select('*').eq('qr_code', code).maybeSingle()
        if (data) return { kind: 'patrol', data }
        return { kind: 'not_found', data: { code } }
      }

      // Employees
      const { data: emp } = await supabase.from('employees').select('id, full_name, first_name, last_name, photo, account_id, employee_id, qr_code, phone_number').eq('qr_code', code).maybeSingle()
      if (emp) {
        // Load linked vehicles
        const { data: vehs } = await supabase.from('vehicles').select('id, license_plate, make, model, color, assignments').not('assignments', 'eq', '[]')
        const linked = (vehs || []).filter((v: any) => Array.isArray(v.assignments) && v.assignments.some((a: any) => a.type === 'Employee' && a.id === emp.id))
        return { kind: 'employee', data: { ...emp, name: emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim(), vehicles: linked } }
      }

      // Visitors
      const { data: vis } = await supabase.from('visitors').select('id, full_name, contact_number, email, photo, account_id, qr_code').eq('qr_code', code).maybeSingle()
      if (vis) {
        const { data: vehs } = await supabase.from('vehicles').select('id, license_plate, make, model, color, assignments').not('assignments', 'eq', '[]')
        const linked = (vehs || []).filter((v: any) => Array.isArray(v.assignments) && v.assignments.some((a: any) => a.type === 'Visitor' && a.id === vis.id))
        return { kind: 'visitor', data: { ...vis, name: vis.full_name, vehicles: linked } }
      }

      // Vehicles
      const { data: veh } = await supabase.from('vehicles').select('id, license_plate, make, model, color, photo, account_id, qr_code, assignments').eq('qr_code', code).maybeSingle()
      if (veh) {
        // Resolve linked people
        const staff: any[] = []
        if (Array.isArray(veh.assignments)) {
          for (const a of veh.assignments) {
            if (a.type === 'Employee') {
              const { data: e } = await supabase.from('employees').select('id, full_name, first_name, last_name, photo, account_id').eq('id', a.id).maybeSingle()
              if (e) staff.push({ kind: 'employee', id: e.id, name: e.full_name || `${e.first_name || ''} ${e.last_name || ''}`.trim(), photo: e.photo, account_id: e.account_id })
            } else if (a.type === 'Visitor') {
              const { data: v } = await supabase.from('visitors').select('id, full_name, photo, account_id').eq('id', a.id).maybeSingle()
              if (v) staff.push({ kind: 'visitor', id: v.id, name: v.full_name, photo: v.photo, account_id: v.account_id })
            }
          }
        }
        return { kind: 'vehicle', data: { ...veh, staff } }
      }

      return { kind: 'not_found', data: { code } }
    } catch (e) {
      console.error('QR lookup error:', e)
      return { kind: 'not_found', data: { code } }
    }
  }

  const handleAction = (type: ActionType) => {
    setActionType(type)
    setDestination('')
    setSuccessMsg(null)
    setAppState('destination')
  }

  const handleSave = async (dest: string) => {
    if (!found) return
    setSaving(true)
    try {
      const user = JSON.parse(localStorage.getItem('q_control_user') || '{}')
      const scanType = actionType === 'enter' ? 'Entry' : 'Exit'
      const d = found.data

      if (found.kind === 'patrol') {
        const now = new Date().toISOString()
        await supabase.from('patrol_points').update({ last_scanned_at: now, last_checked_by: user.id, status: 'On Time', updated_at: now }).eq('id', d.id)
        const { error } = await supabase.from('patrol_scans').insert({
          patrol_point_id: d.id,
          scanned_by_id: user.id,
          scanned_by_name: user.full_name || 'Agent',
          scan_timestamp: now,
          account_id: d.account_id || user.account_id || null,
          notes: dest || 'Scanné via Q-Control Mobile',
        })
        if (error) { console.error(error); setSuccessMsg('❌ Erreur enregistrement') }
        else setSuccessMsg(`✓ Ronde enregistrée: "${d.point_name}"`)
        return
      }

      let employeeId = null, employeeName = 'Unknown', vehicleId = null, vehicleQr = null, vehiclePlate = null
      let accountId = d.account_id || user.account_id || null

      if (found.kind === 'employee') {
        employeeId = d.id; employeeName = d.name
      } else if (found.kind === 'visitor') {
        employeeId = d.id; employeeName = d.name
      } else if (found.kind === 'vehicle') {
        vehicleId = d.id; vehicleQr = d.qr_code; vehiclePlate = d.license_plate
      }

      const logData: any = {
        account_id: accountId,
        employee_id: employeeId,
        employee_name: employeeName,
        vehicle_id: vehicleId,
        vehicle_qr: vehicleQr,
        vehicle_plate: vehiclePlate,
        scan_type: scanType,
        scan_timestamp: new Date().toISOString(),
        location_lat: null,
        location_lng: null,
        destination: dest || null,
      }

      const { error } = await supabase.from('access_logs').insert(logData)
      if (error) {
        if (error.code === '42703') {
          // destination column doesn't exist — retry without it
          delete logData.destination
          const { error: e2 } = await supabase.from('access_logs').insert(logData)
          if (e2) { console.error(e2); setSuccessMsg('❌ Erreur enregistrement'); return }
        } else {
          console.error(error); setSuccessMsg('❌ Erreur enregistrement'); return
        }
      }
      setSuccessMsg(actionType === 'enter' ? '✓ Entrée enregistrée!' : '✓ Sortie enregistrée!')
    } finally {
      setSaving(false)
    }
  }

  const handleScanAgain = () => {
    setFound(null); setSuccessMsg(null); setDestination(''); setAppState('scanning')
    processingRef.current = false; lastCodeRef.current = null; setCameraReady(false)
    startCamera()
  }

  const isPatrol = mode === 'patrol'
  const accent = isPatrol ? 'var(--navy)' : 'var(--green)'
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('q_control_user') || '{}') : {}

  // ── SCANNING STATE ────────────────────────────────────────────────────────
  if (appState === 'scanning') return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'rgba(0,0,0,0.6)', zIndex: 2 }}>
        <button onClick={() => { stopCamera(); router.push('/') }}
          style={{ display: 'grid', placeItems: 'center', width: '36px', height: '36px', borderRadius: '50%', border: '0', background: 'rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer' }}>
          <ArrowLeft size={18} />
        </button>
        <span style={{ color: 'white', fontSize: '15px', fontWeight: '700' }}>
          {isPatrol ? '🛡️ Q-Patrol' : '📷 Scanner QR'}
        </span>
      </div>

      {/* Camera */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />

        {/* Loading overlay */}
        {!cameraReady && !cameraError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: accent, animation: 'spin .7s linear infinite' }} />
            <p style={{ color: 'white', fontSize: '13px', margin: 0 }}>Démarrage de la caméra...</p>
          </div>
        )}

        {/* Error overlay */}
        {cameraError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', padding: '24px', gap: '16px', textAlign: 'center' }}>
            <Camera size={48} style={{ color: '#ef4444' }} />
            <p style={{ color: 'white', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>{cameraError}</p>
            <button onClick={startCamera}
              style={{ padding: '12px 28px', background: accent, color: 'white', border: '0', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
              Réessayer
            </button>
          </div>
        )}

        {/* Processing overlay */}
        {processing && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: accent, animation: 'spin .7s linear infinite' }} />
            <p style={{ color: 'white', fontSize: '13px', margin: 0 }}>Recherche en cours...</p>
          </div>
        )}

        {/* Scan frame — only shown when camera is ready */}
        {cameraReady && !processing && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: '220px', height: '220px' }}>
              {[
                { top: 0, left: 0, borderTop: `3px solid ${accent}`, borderLeft: `3px solid ${accent}`, borderRadius: '4px 0 0 0' },
                { top: 0, right: 0, borderTop: `3px solid ${accent}`, borderRight: `3px solid ${accent}`, borderRadius: '0 4px 0 0' },
                { bottom: 0, left: 0, borderBottom: `3px solid ${accent}`, borderLeft: `3px solid ${accent}`, borderRadius: '0 0 0 4px' },
                { bottom: 0, right: 0, borderBottom: `3px solid ${accent}`, borderRight: `3px solid ${accent}`, borderRadius: '0 0 4px 0' },
              ].map((s, i) => <div key={i} style={{ position: 'absolute', width: '32px', height: '32px', ...s as any }} />)}
              <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom hint */}
      <div style={{ padding: '20px', background: 'rgba(0,0,0,0.6)', textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', margin: 0 }}>
          {isPatrol ? 'Pointez vers le QR code du point de patrouille' : "Pointez vers le QR code d'un employé, visiteur ou véhicule"}
        </p>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── FOUND STATE ────────────────────────────────────────────────────────────
  if (appState === 'found' && found) {
    const d = found.data
    const notFound = found.kind === 'not_found'

    return (
      <div className="app-shell">
        <header className="topbar">
          <button onClick={() => { stopCamera(); router.push('/') }} className="icon-button"><ArrowLeft size={20} /></button>
          <strong style={{ color: 'var(--navy)', fontSize: '14px' }}>{isPatrol ? '🛡️ Q-Patrol' : '📷 Résultat'}</strong>
          <div style={{ width: '36px' }} />
        </header>

        <div style={{ padding: '20px', paddingBottom: '80px' }}>

          {/* Not found */}
          {notFound && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
              <h3 style={{ color: 'var(--ink)', margin: '0 0 8px' }}>QR Code non reconnu</h3>
              <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Ce QR code n'est pas enregistré dans le système.</p>
              <button onClick={handleScanAgain} style={{ marginTop: '24px', padding: '14px 32px', background: 'var(--navy)', color: 'white', border: '0', borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                Scanner à nouveau
              </button>
            </div>
          )}

          {/* Employee / Visitor */}
          {(found.kind === 'employee' || found.kind === 'visitor') && (
            <>
              {/* Profile card */}
              <div style={{ background: 'white', borderRadius: '16px', border: '1px solid var(--line)', padding: '24px', textAlign: 'center', marginBottom: '16px', boxShadow: '0 4px 16px rgba(6,44,77,.06)' }}>
                {d.photo
                  ? <img src={d.photo} alt={d.name} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', marginBottom: '12px' }} />
                  : <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: found.kind === 'employee' ? 'var(--navy)' : 'var(--green)', display: 'grid', placeItems: 'center', margin: '0 auto 12px', fontSize: '28px', fontWeight: '800', color: 'white' }}>
                      {d.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                }
                <h2 style={{ margin: '0 0 6px', color: 'var(--ink)', fontSize: '20px' }}>{d.name}</h2>
                <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: '20px', background: found.kind === 'employee' ? '#e0f0ff' : '#e0fff0', color: found.kind === 'employee' ? 'var(--navy)' : 'var(--green)', fontSize: '11px', fontWeight: '700' }}>
                  {found.kind === 'employee' ? 'EMPLOYÉ' : 'VISITEUR'}
                </span>
                {d.phone_number && <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: '13px' }}>📞 {d.phone_number}</p>}
                {d.contact_number && <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: '13px' }}>📞 {d.contact_number}</p>}
              </div>

              {/* Vehicles linked */}
              {d.vehicles?.length > 0 && (
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--line)', padding: '16px', marginBottom: '16px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase' }}>Véhicule lié</p>
                  {d.vehicles.map((v: any) => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
                      <span style={{ fontSize: '20px' }}>🚗</span>
                      <span style={{ fontWeight: '700', color: 'var(--ink)', fontSize: '14px' }}>{v.license_plate}</span>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>{[v.make, v.model, v.color].filter(Boolean).join(' ')}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Success message */}
              {successMsg && (
                <div style={{ padding: '14px', borderRadius: '12px', background: successMsg.includes('✓') ? '#e8f5f0' : '#fce8e8', color: successMsg.includes('✓') ? 'var(--green)' : 'var(--red)', fontWeight: '700', fontSize: '14px', textAlign: 'center', marginBottom: '16px' }}>
                  {successMsg}
                </div>
              )}

              {/* Actions */}
              {!successMsg && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <button onClick={() => handleAction('enter')} style={{ flex: 1, height: '52px', border: '0', borderRadius: '12px', background: 'var(--green)', color: 'white', fontSize: '15px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,155,103,.3)' }}>
                    ✅ Entrée
                  </button>
                  <button onClick={() => handleAction('exit')} style={{ flex: 1, height: '52px', border: '1px solid var(--line)', borderRadius: '12px', background: 'white', color: 'var(--ink)', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
                    🚪 Sortie
                  </button>
                </div>
              )}
              <button onClick={handleScanAgain} style={{ width: '100%', height: '46px', border: '1px solid var(--line)', borderRadius: '10px', background: 'white', color: 'var(--muted)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                ↩ Scanner à nouveau
              </button>
            </>
          )}

          {/* Vehicle */}
          {found.kind === 'vehicle' && (
            <>
              <div style={{ background: 'white', borderRadius: '16px', border: '1px solid var(--line)', padding: '24px', textAlign: 'center', marginBottom: '16px', boxShadow: '0 4px 16px rgba(6,44,77,.06)' }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>🚗</div>
                <h2 style={{ margin: '0 0 4px', color: 'var(--ink)', fontSize: '22px', fontWeight: '800' }}>{d.license_plate}</h2>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>{[d.make, d.model, d.color].filter(Boolean).join(' · ')}</p>
              </div>

              {d.staff?.length > 0 && (
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--line)', padding: '16px', marginBottom: '16px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase' }}>Personnel lié</p>
                  {d.staff.map((p: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: i < d.staff.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      {p.photo
                        ? <img src={p.photo} alt={p.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                        : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--navy)', display: 'grid', placeItems: 'center', color: 'white', fontSize: '16px', fontWeight: '800', flexShrink: 0 }}>
                            {p.name?.charAt(0)?.toUpperCase()}
                          </div>
                      }
                      <div>
                        <p style={{ margin: 0, fontWeight: '700', color: 'var(--ink)', fontSize: '14px' }}>{p.name}</p>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: p.kind === 'employee' ? 'var(--navy)' : 'var(--green)' }}>{p.kind === 'employee' ? 'EMPLOYÉ' : 'VISITEUR'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {successMsg && (
                <div style={{ padding: '14px', borderRadius: '12px', background: successMsg.includes('✓') ? '#e8f5f0' : '#fce8e8', color: successMsg.includes('✓') ? 'var(--green)' : 'var(--red)', fontWeight: '700', fontSize: '14px', textAlign: 'center', marginBottom: '16px' }}>
                  {successMsg}
                </div>
              )}

              {!successMsg && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <button onClick={() => handleAction('enter')} style={{ flex: 1, height: '52px', border: '0', borderRadius: '12px', background: 'var(--green)', color: 'white', fontSize: '15px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,155,103,.3)' }}>
                    ✅ Entrée
                  </button>
                  <button onClick={() => handleAction('exit')} style={{ flex: 1, height: '52px', border: '1px solid var(--line)', borderRadius: '12px', background: 'white', color: 'var(--ink)', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
                    🚪 Sortie
                  </button>
                </div>
              )}
              <button onClick={handleScanAgain} style={{ width: '100%', height: '46px', border: '1px solid var(--line)', borderRadius: '10px', background: 'white', color: 'var(--muted)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                ↩ Scanner à nouveau
              </button>
            </>
          )}

          {/* Patrol */}
          {found.kind === 'patrol' && (
            <>
              <div style={{ background: 'white', borderRadius: '16px', border: '1px solid var(--line)', padding: '24px', textAlign: 'center', marginBottom: '16px', boxShadow: '0 4px 16px rgba(6,44,77,.06)' }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>🛡️</div>
                <h2 style={{ margin: '0 0 4px', color: 'var(--ink)', fontSize: '20px' }}>{d.point_name}</h2>
                {d.description && <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>{d.description}</p>}
                {d.specific_location && <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '12px' }}>📍 {d.specific_location}</p>}
              </div>

              {successMsg && (
                <div style={{ padding: '14px', borderRadius: '12px', background: successMsg.includes('✓') ? '#e8f5f0' : '#fce8e8', color: successMsg.includes('✓') ? 'var(--green)' : 'var(--red)', fontWeight: '700', fontSize: '14px', textAlign: 'center', marginBottom: '16px' }}>
                  {successMsg}
                </div>
              )}

              {!successMsg && (
                <button onClick={() => { setSaving(true); handleSave('').finally(() => setSaving(false)) }} disabled={saving}
                  style={{ width: '100%', height: '52px', border: '0', borderRadius: '12px', background: 'var(--navy)', color: 'white', fontSize: '15px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, marginBottom: '12px', boxShadow: '0 4px 12px rgba(6,44,77,.25)' }}>
                  {saving ? '⏳ Enregistrement...' : '🛡️ Enregistrer la ronde'}
                </button>
              )}

              <button onClick={handleScanAgain} style={{ width: '100%', height: '46px', border: '1px solid var(--line)', borderRadius: '10px', background: 'white', color: 'var(--muted)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                ↩ Scanner à nouveau
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── DESTINATION STATE ──────────────────────────────────────────────────────
  if (appState === 'destination') return (
    <div className="app-shell">
      <header className="topbar">
        <button onClick={() => setAppState('found')} className="icon-button"><ArrowLeft size={20} /></button>
        <strong style={{ color: 'var(--navy)', fontSize: '14px' }}>
          {actionType === 'enter' ? 'Destination' : 'Provenance'}
        </strong>
        <div style={{ width: '36px' }} />
      </header>

      <div style={{ padding: '24px', paddingBottom: '80px' }}>
        <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
          {actionType === 'enter' ? 'Où allez-vous ?' : "D'où venez-vous ?"}
        </p>

        {/* Quick buttons */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {['🏠 Domicile', '🏢 Bureau', '🏪 Magasin', '🏥 Hôpital'].map(label => (
            <button key={label} onClick={() => { setDestination(label.split(' ').slice(1).join(' ')) }}
              style={{ padding: '8px 14px', border: `1px solid ${destination.includes(label.split(' ')[1]) ? 'var(--green)' : 'var(--line)'}`, borderRadius: '20px', background: destination.includes(label.split(' ')[1]) ? '#e8f5f0' : 'white', color: 'var(--ink)', fontSize: '13px', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Text input */}
        <div className="input-wrap" style={{ marginBottom: '20px' }}>
          <input
            type="text"
            value={destination}
            onChange={e => setDestination(e.target.value)}
            placeholder={actionType === 'enter' ? 'Entrez la destination...' : 'Entrez la provenance...'}
            autoFocus
            style={{ width: '100%', border: 0, outline: 0, background: 'transparent', fontSize: '15px', color: 'var(--ink)' }}
          />
        </div>

        {/* Submit */}
        <button
          onClick={() => handleSave(destination).then(() => setAppState('found'))}
          disabled={saving || !destination.trim()}
          style={{ width: '100%', height: '52px', border: '0', borderRadius: '12px', background: destination.trim() ? (actionType === 'enter' ? 'var(--green)' : 'var(--navy)') : '#d1d5db', color: 'white', fontSize: '15px', fontWeight: '700', cursor: destination.trim() ? 'pointer' : 'not-allowed', marginBottom: '12px', boxShadow: destination.trim() ? '0 4px 12px rgba(6,44,77,.2)' : 'none' }}>
          {saving ? '⏳ Enregistrement...' : actionType === 'enter' ? '✅ Confirmer Entrée' : '🚪 Confirmer Sortie'}
        </button>

        <button onClick={() => setAppState('found')}
          style={{ width: '100%', height: '46px', border: '1px solid var(--line)', borderRadius: '10px', background: 'white', color: 'var(--muted)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          Annuler
        </button>
      </div>
    </div>
  )

  return null
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#000' }}><div style={{ color: 'white' }}>Chargement...</div></div>}>
      <ScanPageInner />
    </Suspense>
  )
}
