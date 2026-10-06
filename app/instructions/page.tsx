"use client"

import { ArrowLeft, Shield, AlertTriangle, MapPin, FileText, Camera, Navigation } from "lucide-react"
import { useRouter } from "next/navigation"

export default function InstructionsPage() {
  const router = useRouter()

  return (
    <div className="app-shell">
      <header className="topbar">
        <button onClick={() => router.push('/')} className="icon-button">
          <ArrowLeft size={20} />
        </button>
        <strong style={{ color: 'var(--navy)', fontSize: '14px' }}>Instructions Q-Control</strong>
        <div style={{ width: '36px' }}></div>
      </header>

      <div style={{ padding: '20px', paddingBottom: '80px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* SCAN Section */}
          <div style={{ 
            padding: '18px', 
            backgroundColor: 'white', 
            borderRadius: '12px',
            border: '1px solid var(--line)',
            boxShadow: '0 4px 12px rgba(6,44,77,.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <Camera size={22} style={{ color: 'var(--green)' }} />
              <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '14px', fontWeight: '700' }}>Scanner QR Code</h3>
            </div>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12px', lineHeight: '1.6' }}>
              Utilisez le bouton <strong>SCAN</strong> pour scanner les QR codes des véhicules, 
              employés, visiteurs ou points de patrouille. Le scanner enregistrera automatiquement 
              dans le système.
            </p>
          </div>

          {/* CHECKPOINT Section */}
          <div style={{ 
            padding: '18px', 
            backgroundColor: 'white', 
            borderRadius: '12px',
            border: '1px solid var(--line)',
            boxShadow: '0 4px 12px rgba(6,44,77,.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <Navigation size={22} style={{ color: 'var(--green)' }} />
              <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '14px', fontWeight: '700' }}>Checkpoint GPS</h3>
            </div>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12px', lineHeight: '1.6' }}>
              Le bouton <strong>CHECKPOINT</strong> enregistre votre position GPS actuelle 
              et l'heure. Utilisez-le lors de vos rondes pour prouver votre présence 
              aux points stratégiques.
            </p>
          </div>

          {/* SOS Section */}
          <div style={{ 
            padding: '18px', 
            backgroundColor: '#fef5f5', 
            borderRadius: '12px',
            border: '1px solid #fdd',
            boxShadow: '0 4px 12px rgba(215,25,32,.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <AlertTriangle size={22} style={{ color: 'var(--red)' }} />
              <h3 style={{ margin: 0, color: 'var(--red)', fontSize: '14px', fontWeight: '700' }}>Alerte SOS d'Urgence</h3>
            </div>
            <p style={{ margin: 0, color: '#721c24', fontSize: '12px', lineHeight: '1.6' }}>
              En cas d'urgence, appuyez sur le bouton <strong style={{ color: 'var(--red)' }}>SOS</strong> 
              dans le coin supérieur droit. Cela enverra immédiatement votre position GPS 
              au centre de contrôle. <strong>À utiliser uniquement en cas d'urgence réelle.</strong>
            </p>
          </div>

          {/* Rapport Section */}
          <div style={{ 
            padding: '18px', 
            backgroundColor: 'white', 
            borderRadius: '12px',
            border: '1px solid var(--line)',
            boxShadow: '0 4px 12px rgba(6,44,77,.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <FileText size={22} style={{ color: 'var(--green)' }} />
              <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '14px', fontWeight: '700' }}>Rapport d'Incident</h3>
            </div>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12px', lineHeight: '1.6' }}>
              Pour signaler un incident, ouvrez le menu (☰) et sélectionnez <strong>Rapport</strong>. 
              Décrivez l'incident en détail: heure, lieu, personnes impliquées, et nature de l'incident.
            </p>
          </div>

          {/* General Tips */}
          <div style={{ 
            padding: '18px', 
            backgroundColor: '#f0f9ff', 
            borderRadius: '12px',
            border: '1px solid #bfe3ff',
            boxShadow: '0 4px 12px rgba(6,44,77,.05)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: 'var(--navy)', fontSize: '14px', fontWeight: '700' }}>
              💡 Conseils Généraux
            </h3>
            <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: '1.8', fontSize: '12px', color: 'var(--muted)' }}>
              <li>Gardez votre téléphone chargé et la localisation activée</li>
              <li>Effectuez des checkpoints réguliers durant votre ronde</li>
              <li>Scannez tous les véhicules et visiteurs à l'entrée/sortie</li>
              <li>Signalez tout comportement suspect immédiatement</li>
              <li>En cas de doute, contactez votre superviseur</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
