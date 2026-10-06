"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { ArrowLeft, Camera, CheckCircle, XCircle, Shield } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Suspense } from "react"

type ScanState = 'idle' | 'requesting' | 'scanning' | 'processing' | 'result'
type ScanMode = 'access' | 'patrol'

type ScanResult =
  | { type: 'employee'; data: any }
  | { type: 'visitor'; data: any }
  | { type: 'vehicle'; data: any }
  | { type: 'patrol'; data: any }
  | { type: 'not_found'; code: string }

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

  const [state, setState] = useState<ScanState>('idle')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [actionDone, setActionDone] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const scanLoop = useCallback(async () => {
    if (!videoRef.current || !detectorRef.current) return
    const video = videoRef.current
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      try {
        const codes = await detectorRef.current.detect(video)
        if (codes.length > 0) {
          const code = codes[0].rawValue
          if (code && code !== lastCodeRef.current) {
            lastCodeRef.current = code
            stopCamera()
            setState('processing')
            const result = await lookupQRCode(code.trim())
            setScanResult(result)
            setState('result')
            return
          }
        }
      } catch (_) {}
    }
    rafRef.current = requestAnimationFrame(scanLoop)
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    lastCodeRef.current = null
    setState('requesting')

    // Check BarcodeDetector support
    if (typeof BarcodeDetector === 'undefined') {
      setCameraError("Scanner QR non supporté. Utilisez Chrome sur Android.")
      setState('idle')
      return
    }

    try {
      detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] })
    } catch {
      setCameraError("Impossible d'initialiser le scanner QR.")
      setState('idle')
      return
    }

    // Request camera permission explicitly — this triggers the browser permission popup
    try {
      const permResult = await navigator.permissions.query({ name: 'camera' as PermissionName })
      if (permResult.state === 'denied') {
        setCameraError("Caméra refusée. Allez dans les paramètres du navigateur pour l'autoriser.")
        setState('idle')
        return
      }
    } catch (_) {
      // permissions.query not supported on all browsers — continue anyway
    }

    try {
      // getUserMedia triggers the OS permission popup on first use
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      })
      streamRef.current = stream
      setState('scanning')
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        rafRef.current = requestAnimationFrame(scanLoop)
      }
    } catch (err: any) {
      console.error('Camera error:', err)
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCameraError("Accès à la caméra refusé. Appuyez sur 'Autoriser' quand le navigateur demande la permission.")
      } else if (err?.name === 'NotFoundError') {
        setCameraError("Aucune caméra détectée sur cet appareil.")
      } else {
        setCameraError("Impossible d'accéder à la caméra. Vérifiez les permissions.")
      }
      setState('idle')
    }
  }, [scanLoop])

  const lookupQRCode = async (code: string): Promise<ScanResult> => {
    try {
      if (mode === 'patrol') {
        // Patrol mode — only look up patrol points
        const { data: patrol, error: patrolErr } = await supabase
          .from('patrol_points').select('*').eq('qr_code', code).maybeSingle()
        if (patrolErr) console.error('Patrol lookup error:', patrolErr)
        if (patrol) return { type: 'patrol', data: patrol }
        return { type: 'not_found', code }
      }

      // Access mode — look up employees, visitors, vehicles
      const { data: emp, error: empErr } = await supabase.from('employees').select('*').eq('qr_code', code).maybeSingle()
      if (empErr) console.error('Employee lookup error:', empErr)
      if (emp) return { type: 'employee', data: emp }

      const { data: vis, error: visErr } = await supabase.from('visitors').select('*').eq('qr_code', code).maybeSingle()
      if (visErr) console.error('Visitor lookup error:', visErr)
      if (vis) return { type: 'visitor', data: vis }

      const { data: veh, error: vehErr } = await supabase.from('vehicles').select('*').eq('qr_code', code).maybeSingle()
      if (vehErr) console.error('Vehicle lookup error:', vehErr)
      if (veh) return { type: 'vehicle', data: veh }

      return { type: 'not_found', code }
    } catch (e) {
      console.error('QR lookup error:', e)
      return { type: 'not_found', code }
    }
  }

  const handleEntryExit = async (scanType: 'Entry' | 'Exit') => {
    if (!scanResult || scanResult.type === 'not_found' || scanResult.type === 'patrol') return
    setActionLoading(true)
    try {
      const user = JSON.parse(localStorage.getItem('q_control_user') || '{}')
      const d = scanResult.data
      let employeeId = null, employeeName = 'Unknown', vehicleId = null, vehicleQr = null, vehiclePlate = null
      const accountId = d.account_id || user.account_id || null

      if (scanResult.type === 'employee') {
        employeeId = d.id
        employeeName = d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Unknown'
      } else if (scanResult.type === 'visitor') {
        employeeId = d.id
        employeeName = d.full_name || 'Visiteur'
      } else if (scanResult.type === 'vehicle') {
        vehicleId = d.id; vehicleQr = d.qr_code; vehiclePlate = d.license_plate
      }

      const { error } = await supabase.from('access_logs').insert({
        account_id: accountId, employee_id: employeeId, employee_name: employeeName,
        vehicle_id: vehicleId, vehicle_qr: vehicleQr, vehicle_plate: vehiclePlate,
        scan_type: scanType, scan_timestamp: new Date().toISOString(),
        location_lat: null, location_lng: null,
      })

      if (error) { console.error('access_logs error:', error); setActionDone("❌ Erreur lors de l'enregistrement") }
      else { setActionDone(scanType === 'Entry' ? "✓ Entrée enregistrée!" : "✓ Sortie enregistrée!") }
    } catch (e) { console.error(e); setActionDone("❌ Erreur inattendue") }
    finally { setActionLoading(false) }
  }

  const handlePatrolRecord = async () => {
    if (!scanResult || scanResult.type !== 'patrol') return
    setActionLoading(true)
    try {
      const user = JSON.parse(localStorage.getItem('q_control_user') || '{}')
      const point = scanResult.data
      const now = new Date().toISOString()
      const accountId = point.account_id || user.account_id || null
      const guardName = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Agent'

      const { error: updateErr } = await supabase.from('patrol_points').update({
        last_scanned_at: now, last_checked_by: user.id, status: 'On Time', updated_at: now,
      }).eq('id', point.id)
      if (updateErr) console.error('patrol_points update error:', updateErr)

      const { error } = await supabase.from('patrol_scans').insert({
        patrol_point_id: point.id,
        scanned_by_id: user.id,
        scanned_by_name: guardName,
        scan_timestamp: now,
        account_id: accountId,
        notes: 'Scanné via Q-Control Mobile',
      })

      if (error) { console.error('patrol_scans error:', error); setActionDone("❌ Erreur lors de l'enregistrement") }
      else { setActionDone(`✓ Ronde enregistrée: "${point.point_name}"`) }
    } catch (e) { console.error(e); setActionDone("❌ Erreur inattendue") }
    finally { setActionLoading(false) }
  }

  const handleReset = () => {
    setScanResult(null); setActionDone(null); lastCodeRef.current = null; setState('idle')
  }

  const getResultLabel = () => {
    if (!scanResult) return ''
    if (scanResult.type === 'employee') { const d = scanResult.data; return `👤 Employé: ${d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim()}` }
    if (scanResult.type === 'visitor') return `👥 Visiteur: ${scanResult.data.full_name}`
    if (scanResult.type === 'vehicle') return `🚗 Véhicule: ${scanResult.data.license_plate}`
    if (scanResult.type === 'patrol') return `🛡️ Point: ${scanResult.data.point_name}`
    return `❌ QR non reconnu`
  }

  const isPatrol = mode === 'patrol'
  const pageTitle = isPatrol ? 'Q-Patrol — Scanner' : 'Q-Control — Scanner'
  const accentColor = isPatrol ? 'var(--navy)' : 'var(--green)'

  return (
    <div className="app-shell">
      <header className="topbar">
        <button onClick={() => { stopCamera(); router.push('/') }} className="icon-button">
          <ArrowLeft size={20} />
        </button>
        <strong style={{ color: 'var(--navy)', fontSize: '14px' }}>
          {isPatrol ? '🛡️ Q-Patrol' : '📷 Q-Control Scan'}
        </strong>
        <div style={{ width: '36px' }} />
      </header>

      <div style={{ padding: '20px', paddingBottom: '80px' }}>

        {/* IDLE */}
        {(state === 'idle' || state === 'requesting') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', paddingTop: '40px' }}>
            <div style={{
              display: 'grid', placeItems: 'center', width: '100px', height: '100px',
              borderRadius: '50%', background: isPatrol ? 'linear-gradient(135deg,#e6f4ff,#f0f0ff)' : 'linear-gradient(135deg,#f0faf5,#e6f4ff)',
              border: '2px solid var(--line)',
            }}>
              {isPatrol ? <Shield size={44} style={{ color: 'var(--navy)' }} /> : <Camera size={44} style={{ color: 'var(--green)' }} />}
            </div>

            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 6px', color: 'var(--navy)', fontSize: '18px' }}>
                {isPatrol ? 'Scanner Point de Patrouille' : 'Scanner QR Code'}
              </h2>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px', lineHeight: '1.6' }}>
                {isPatrol
                  ? 'Scannez le QR code du point de patrouille\npour enregistrer votre passage.'
                  : "Scannez le QR code d'un employé,\nvisiteur ou véhicule pour enregistrer l'entrée/sortie."
                }
              </p>
            </div>

            {cameraError && (
              <div style={{
                padding: '14px 16px', borderRadius: '12px',
                background: '#fce8e8', color: 'var(--red)',
                fontSize: '13px', textAlign: 'center', width: '100%',
                border: '1px solid #fdd', lineHeight: '1.5',
              }}>
                🚫 {cameraError}
                <br />
                <span style={{ fontSize: '11px', opacity: 0.8 }}>
                  Si le problème persiste, autorisez la caméra dans les paramètres de votre navigateur.
                </span>
              </div>
            )}

            {state === 'requesting' && (
              <div style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center' }}>
                ⏳ Demande d'accès à la caméra...
              </div>
            )}

            <button
              onClick={startCamera}
              disabled={state === 'requesting'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                width: '100%', maxWidth: '320px', height: '52px',
                border: '0', borderRadius: '12px',
                background: state === 'requesting' ? '#9ca3af' : accentColor,
                color: 'white', fontSize: '14px', fontWeight: '700',
                boxShadow: '0 8px 18px rgba(6,44,77,.2)',
                cursor: state === 'requesting' ? 'not-allowed' : 'pointer',
              }}
            >
              {isPatrol ? <Shield size={20} /> : <Camera size={20} />}
              {state === 'requesting' ? 'Demande en cours...' : 'Démarrer le scan'}
            </button>
          </div>
        )}

        {/* SCANNING */}
        {state === 'scanning' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
              <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'relative', width: '200px', height: '200px' }}>
                  {[
                    { top: 0, left: 0, borderTop: `3px solid ${accentColor}`, borderLeft: `3px solid ${accentColor}` },
                    { top: 0, right: 0, borderTop: `3px solid ${accentColor}`, borderRight: `3px solid ${accentColor}` },
                    { bottom: 0, left: 0, borderBottom: `3px solid ${accentColor}`, borderLeft: `3px solid ${accentColor}` },
                    { bottom: 0, right: 0, borderBottom: `3px solid ${accentColor}`, borderRight: `3px solid ${accentColor}` },
                  ].map((s, i) => <div key={i} style={{ position: 'absolute', width: '30px', height: '30px', ...s as any }} />)}
                </div>
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px', textAlign: 'center', background: 'linear-gradient(transparent,rgba(0,0,0,.65))' }}>
                <p style={{ margin: 0, color: 'white', fontSize: '12px', fontWeight: '600' }}>
                  {isPatrol ? 'Pointez vers le QR code du point de patrouille' : 'Pointez la caméra vers un QR code'}
                </p>
              </div>
            </div>
            <button onClick={() => { stopCamera(); setState('idle') }}
              style={{ height: '46px', border: '1px solid var(--line)', borderRadius: '10px', background: 'white', color: 'var(--ink)', fontSize: '13px', fontWeight: '600' }}>
              Annuler
            </button>
          </div>
        )}

        {/* PROCESSING */}
        {state === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', paddingTop: '60px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', border: '4px solid var(--line)', borderTopColor: accentColor, animation: 'spin .8s linear infinite' }} />
            <p style={{ color: 'var(--muted)', fontSize: '14px', margin: 0 }}>Recherche en cours...</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* RESULT */}
        {state === 'result' && scanResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              padding: '20px', borderRadius: '16px',
              background: scanResult.type === 'not_found' ? '#fce8e8' : 'white',
              border: `1px solid ${scanResult.type === 'not_found' ? '#fdd' : 'var(--line)'}`,
              boxShadow: '0 4px 16px rgba(6,44,77,.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {scanResult.type === 'not_found'
                  ? <XCircle size={28} style={{ color: 'var(--red)', flexShrink: 0 }} />
                  : <CheckCircle size={28} style={{ color: accentColor, flexShrink: 0 }} />
                }
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: '700', color: 'var(--ink)', fontSize: '14px' }}>{getResultLabel()}</p>
                  {scanResult.type === 'employee' && <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)' }}>ID: {scanResult.data.employee_id || scanResult.data.id}</p>}
                  {scanResult.type === 'visitor' && <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)' }}>Contact: {scanResult.data.contact_number || '—'}</p>}
                  {scanResult.type === 'vehicle' && <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)' }}>{[scanResult.data.make, scanResult.data.model, scanResult.data.color].filter(Boolean).join(' · ')}</p>}
                  {scanResult.type === 'patrol' && <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)' }}>{scanResult.data.description || 'Point de patrouille'}</p>}
                  {scanResult.type === 'not_found' && <p style={{ margin: 0, fontSize: '11px', color: 'var(--red)' }}>Ce QR code n'est pas enregistré.</p>}
                </div>
              </div>
              {actionDone && (
                <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', background: actionDone.includes('✓') ? '#e8f5f0' : '#fce8e8', color: actionDone.includes('✓') ? 'var(--green)' : 'var(--red)', fontSize: '13px', fontWeight: '700' }}>
                  {actionDone}
                </div>
              )}
            </div>

            {!actionDone && scanResult.type !== 'not_found' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(scanResult.type === 'employee' || scanResult.type === 'visitor' || scanResult.type === 'vehicle') && (
                  <>
                    <button onClick={() => handleEntryExit('Entry')} disabled={actionLoading}
                      style={{ height: '50px', border: '0', borderRadius: '12px', background: 'var(--green)', color: 'white', fontSize: '14px', fontWeight: '700', opacity: actionLoading ? 0.6 : 1 }}>
                      {actionLoading ? '⏳...' : '✅ Enregistrer Entrée'}
                    </button>
                    <button onClick={() => handleEntryExit('Exit')} disabled={actionLoading}
                      style={{ height: '50px', border: '1px solid var(--line)', borderRadius: '12px', background: 'white', color: 'var(--ink)', fontSize: '14px', fontWeight: '700', opacity: actionLoading ? 0.6 : 1 }}>
                      {actionLoading ? '⏳...' : '🚪 Enregistrer Sortie'}
                    </button>
                  </>
                )}
                {scanResult.type === 'patrol' && (
                  <button onClick={handlePatrolRecord} disabled={actionLoading}
                    style={{ height: '50px', border: '0', borderRadius: '12px', background: 'var(--navy)', color: 'white', fontSize: '14px', fontWeight: '700', opacity: actionLoading ? 0.6 : 1 }}>
                    {actionLoading ? '⏳ Enregistrement...' : '🛡️ Enregistrer la ronde'}
                  </button>
                )}
              </div>
            )}

            <button onClick={handleReset}
              style={{ height: '46px', border: '1px solid var(--line)', borderRadius: '10px', background: 'white', color: 'var(--muted)', fontSize: '13px', fontWeight: '600' }}>
              ↩ Scanner à nouveau
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Chargement...</div>}>
      <ScanPageInner />
    </Suspense>
  )
}
