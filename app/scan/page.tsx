"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ArrowLeft, Camera, CheckCircle, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type ScanState = 'idle' | 'scanning' | 'processing' | 'result'

type ScanResult =
  | { type: 'employee'; data: any }
  | { type: 'visitor'; data: any }
  | { type: 'vehicle'; data: any }
  | { type: 'patrol'; data: any }
  | { type: 'not_found'; code: string }

declare const BarcodeDetector: any

export default function ScanPage() {
  const router = useRouter()
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
  const [hasDetector, setHasDetector] = useState<boolean | null>(null)

  useEffect(() => {
    setHasDetector(typeof BarcodeDetector !== 'undefined')
  }, [])

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

    if (!hasDetector) {
      setCameraError("Votre navigateur ne supporte pas le scan QR natif. Utilisez Chrome sur Android.")
      return
    }

    try {
      detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] })
    } catch {
      setCameraError("Impossible d'initialiser le scanner QR.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
      })
      streamRef.current = stream
      setState('scanning')
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        rafRef.current = requestAnimationFrame(scanLoop)
      }
    } catch {
      setCameraError("Impossible d'accéder à la caméra. Vérifiez les permissions.")
    }
  }, [hasDetector, scanLoop])

  const lookupQRCode = async (code: string): Promise<ScanResult> => {
    try {
      const { data: emp } = await supabase.from('employees').select('*').eq('qr_code', code).maybeSingle()
      if (emp) return { type: 'employee', data: emp }

      const { data: vis } = await supabase.from('visitors').select('*').eq('qr_code', code).maybeSingle()
      if (vis) return { type: 'visitor', data: vis }

      const { data: veh } = await supabase.from('vehicles').select('*').eq('qr_code', code).maybeSingle()
      if (veh) return { type: 'vehicle', data: veh }

      const { data: patrol } = await supabase.from('patrol_points').select('*').eq('qr_code', code).maybeSingle()
      if (patrol) return { type: 'patrol', data: patrol }

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

      let employeeId = null
      let employeeName = 'Unknown'
      let vehicleId = null
      let vehicleQr = null
      let vehiclePlate = null
      const accountId = d.account_id || user.account_id || null

      if (scanResult.type === 'employee') {
        employeeId = d.id
        employeeName = d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim()
      } else if (scanResult.type === 'visitor') {
        employeeId = d.id
        employeeName = d.full_name || 'Visiteur'
      } else if (scanResult.type === 'vehicle') {
        vehicleId = d.id
        vehicleQr = d.qr_code
        vehiclePlate = d.license_plate
      }

      const { error } = await supabase.from('access_logs').insert({
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
      })

      if (error) {
        console.error('access_logs error:', error)
        setActionDone("❌ Erreur lors de l'enregistrement")
      } else {
        setActionDone(scanType === 'Entry' ? "✓ Entrée enregistrée!" : "✓ Sortie enregistrée!")
      }
    } catch (e) {
      console.error(e)
      setActionDone("❌ Erreur inattendue")
    } finally {
      setActionLoading(false)
    }
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

      await supabase.from('patrol_points').update({
        last_scanned_at: now,
        last_checked_by: user.id,
        status: 'On Time',
        updated_at: now,
      }).eq('id', point.id)

      const { error } = await supabase.from('patrol_scans').insert({
        patrol_point_id: point.id,
        patrol_point_name: point.point_name,
        scanned_by_id: user.id,
        scanned_by_name: guardName,
        scan_timestamp: now,
        account_id: accountId,
        notes: 'Scanné via Q-Control Mobile',
      })

      if (error) {
        console.error('patrol_scans error:', error)
        setActionDone("❌ Erreur lors de l'enregistrement")
      } else {
        setActionDone(`✓ Ronde enregistrée: "${point.point_name}"`)
      }
    } catch (e) {
      console.error(e)
      setActionDone("❌ Erreur inattendue")
    } finally {
      setActionLoading(false)
    }
  }

  const handleReset = () => {
    setScanResult(null)
    setActionDone(null)
    lastCodeRef.current = null
    setState('idle')
  }

  const getResultLabel = () => {
    if (!scanResult) return ''
    if (scanResult.type === 'employee') {
      const d = scanResult.data
      return `👤 Employé: ${d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim()}`
    }
    if (scanResult.type === 'visitor') return `👥 Visiteur: ${scanResult.data.full_name}`
    if (scanResult.type === 'vehicle') return `🚗 Véhicule: ${scanResult.data.license_plate}`
    if (scanResult.type === 'patrol') return `🛡️ Point: ${scanResult.data.point_name}`
    if (scanResult.type === 'not_found') return `❌ QR non reconnu`
    return ''
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button onClick={() => { stopCamera(); router.push('/') }} className="icon-button">
          <ArrowLeft size={20} />
        </button>
        <strong style={{ color: 'var(--navy)', fontSize: '14px' }}>Scanner QR Code</strong>
        <div style={{ width: '36px' }} />
      </header>

      <div style={{ padding: '20px', paddingBottom: '80px' }}>

        {/* IDLE */}
        {state === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', paddingTop: '40px' }}>
            <div style={{
              display: 'grid', placeItems: 'center',
              width: '100px', height: '100px', borderRadius: '50%',
              background: 'linear-gradient(135deg,#f0faf5,#e6f4ff)',
              border: '2px solid var(--line)',
            }}>
              <Camera size={44} style={{ color: 'var(--green)' }} />
            </div>

            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 6px', color: 'var(--navy)', fontSize: '18px' }}>Scanner QR Code</h2>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px', lineHeight: '1.5' }}>
                Pointez la caméra vers un QR code d'employé,<br />visiteur, véhicule ou point de patrouille.
              </p>
            </div>

            {cameraError && (
              <div style={{
                padding: '12px 16px', borderRadius: '10px',
                background: '#fce8e8', color: 'var(--red)',
                fontSize: '13px', textAlign: 'center', width: '100%',
                border: '1px solid #fdd',
              }}>
                {cameraError}
              </div>
            )}

            {hasDetector === false && (
              <div style={{
                padding: '12px 16px', borderRadius: '10px',
                background: '#fff8e1', color: '#856404',
                fontSize: '12px', textAlign: 'center', width: '100%',
                border: '1px solid #ffe69c',
              }}>
                ⚠️ Utilisez Chrome sur Android pour le scan QR natif.
              </div>
            )}

            <button
              onClick={startCamera}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                width: '100%', maxWidth: '320px', height: '52px',
                border: '0', borderRadius: '12px',
                background: 'var(--navy)', color: 'white',
                fontSize: '14px', fontWeight: '700',
                boxShadow: '0 8px 18px rgba(6,44,77,.2)',
              }}
            >
              <Camera size={20} />
              Démarrer le scan
            </button>
          </div>
        )}

        {/* SCANNING */}
        {state === 'scanning' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
              <video
                ref={videoRef}
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {/* Scan overlay corners */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'relative', width: '200px', height: '200px' }}>
                  {[
                    { top: 0, left: 0, borderTop: '3px solid var(--green)', borderLeft: '3px solid var(--green)', borderRadius: '4px 0 0 0' },
                    { top: 0, right: 0, borderTop: '3px solid var(--green)', borderRight: '3px solid var(--green)', borderRadius: '0 4px 0 0' },
                    { bottom: 0, left: 0, borderBottom: '3px solid var(--green)', borderLeft: '3px solid var(--green)', borderRadius: '0 0 0 4px' },
                    { bottom: 0, right: 0, borderBottom: '3px solid var(--green)', borderRight: '3px solid var(--green)', borderRadius: '0 0 4px 0' },
                  ].map((s, i) => (
                    <div key={i} style={{ position: 'absolute', width: '30px', height: '30px', ...s as any }} />
                  ))}
                </div>
              </div>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '16px', textAlign: 'center',
                background: 'linear-gradient(transparent,rgba(0,0,0,.65))',
              }}>
                <p style={{ margin: 0, color: 'white', fontSize: '12px', fontWeight: '600' }}>
                  Pointez la caméra vers un QR code
                </p>
              </div>
            </div>

            <button
              onClick={() => { stopCamera(); setState('idle') }}
              style={{
                height: '46px', border: '1px solid var(--line)', borderRadius: '10px',
                background: 'white', color: 'var(--ink)', fontSize: '13px', fontWeight: '600',
              }}
            >
              Annuler
            </button>
          </div>
        )}

        {/* PROCESSING */}
        {state === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', paddingTop: '60px' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              border: '4px solid var(--line)', borderTopColor: 'var(--green)',
              animation: 'spin .8s linear infinite',
            }} />
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
                  : <CheckCircle size={28} style={{ color: 'var(--green)', flexShrink: 0 }} />
                }
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: '700', color: 'var(--ink)', fontSize: '14px' }}>
                    {getResultLabel()}
                  </p>
                  {scanResult.type === 'employee' && (
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)' }}>
                      ID: {scanResult.data.employee_id || scanResult.data.id}
                    </p>
                  )}
                  {scanResult.type === 'visitor' && (
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)' }}>
                      Contact: {scanResult.data.contact_number || '—'}
                    </p>
                  )}
                  {scanResult.type === 'vehicle' && (
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)' }}>
                      {[scanResult.data.make, scanResult.data.model, scanResult.data.color].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {scanResult.type === 'patrol' && (
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)' }}>
                      {scanResult.data.description || 'Point de patrouille'}
                    </p>
                  )}
                  {scanResult.type === 'not_found' && (
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--red)' }}>
                      Ce QR code n'est pas enregistré dans le système.
                    </p>
                  )}
                </div>
              </div>

              {actionDone && (
                <div style={{
                  marginTop: '14px', padding: '10px 14px', borderRadius: '8px',
                  background: actionDone.includes('✓') ? '#e8f5f0' : '#fce8e8',
                  color: actionDone.includes('✓') ? 'var(--green)' : 'var(--red)',
                  fontSize: '13px', fontWeight: '700',
                }}>
                  {actionDone}
                </div>
              )}
            </div>

            {/* Action buttons — only show before action is done */}
            {!actionDone && scanResult.type !== 'not_found' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(scanResult.type === 'employee' || scanResult.type === 'visitor' || scanResult.type === 'vehicle') && (
                  <>
                    <button
                      onClick={() => handleEntryExit('Entry')}
                      disabled={actionLoading}
                      style={{
                        height: '50px', border: '0', borderRadius: '12px',
                        background: 'var(--green)', color: 'white',
                        fontSize: '14px', fontWeight: '700',
                        boxShadow: '0 6px 14px rgba(16,155,103,.25)',
                        opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {actionLoading ? '⏳...' : '✅ Enregistrer Entrée'}
                    </button>
                    <button
                      onClick={() => handleEntryExit('Exit')}
                      disabled={actionLoading}
                      style={{
                        height: '50px', border: '1px solid var(--line)', borderRadius: '12px',
                        background: 'white', color: 'var(--ink)',
                        fontSize: '14px', fontWeight: '700',
                        opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {actionLoading ? '⏳...' : '🚪 Enregistrer Sortie'}
                    </button>
                  </>
                )}

                {scanResult.type === 'patrol' && (
                  <button
                    onClick={handlePatrolRecord}
                    disabled={actionLoading}
                    style={{
                      height: '50px', border: '0', borderRadius: '12px',
                      background: 'var(--navy)', color: 'white',
                      fontSize: '14px', fontWeight: '700',
                      boxShadow: '0 6px 14px rgba(6,44,77,.2)',
                      opacity: actionLoading ? 0.6 : 1, cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {actionLoading ? '⏳ Enregistrement...' : '🛡️ Enregistrer la ronde'}
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleReset}
              style={{
                height: '46px', border: '1px solid var(--line)', borderRadius: '10px',
                background: 'white', color: 'var(--muted)', fontSize: '13px', fontWeight: '600',
              }}
            >
              ↩ Scanner à nouveau
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
