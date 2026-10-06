"use client"

import { useState } from "react"
import { ArrowLeft, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function RapportPage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const user = JSON.parse(localStorage.getItem('q_control_user') || '{}')
      
      const { error } = await supabase.from('incident_reports').insert({
        employee_id: user.id,
        account_id: user.account_id || null,
        title,
        description,
        status: 'pending',
        created_at: new Date().toISOString(),
      })

      if (error) {
        setMessage("❌ Erreur lors de l'envoi")
        console.error(error)
      } else {
        setMessage("✓ Rapport envoyé avec succès!")
        setTitle("")
        setDescription("")
        setTimeout(() => router.push('/'), 2000)
      }
    } catch (error) {
      setMessage("❌ Erreur lors de l'envoi")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button onClick={() => router.push('/')} className="icon-button">
          <ArrowLeft size={20} />
        </button>
        <strong style={{ color: 'var(--navy)', fontSize: '14px' }}>Rapport d'incident</strong>
        <div style={{ width: '36px' }}></div>
      </header>

      <div style={{ padding: '24px', paddingBottom: '80px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label htmlFor="title" style={{ display: 'block', marginBottom: '8px', color: 'var(--ink)', fontSize: '13px', fontWeight: '700' }}>
              Titre
            </label>
            <div className="input-wrap">
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Titre du rapport"
                style={{ width: '100%', border: 0, outline: 0, background: 'transparent' }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" style={{ display: 'block', marginBottom: '8px', color: 'var(--ink)', fontSize: '13px', fontWeight: '700' }}>
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={8}
              style={{
                width: '100%',
                padding: '14px',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                fontSize: '14px',
                resize: 'vertical',
                background: '#fcfefe',
                color: 'var(--ink)'
              }}
              placeholder="Décrivez l'incident en détail..."
            />
          </div>

          {message && (
            <div style={{ 
              padding: '12px 14px', 
              borderRadius: '10px', 
              backgroundColor: message.includes('✓') ? '#e8f5f0' : '#fce8e8',
              color: message.includes('✓') ? 'var(--green)' : 'var(--red)',
              fontSize: '12px',
              fontWeight: '700'
            }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="primary-button"
            style={{ marginTop: '8px' }}
          >
            {loading ? '⏳ Envoi...' : '📤 Envoyer le rapport'}
          </button>
        </form>
      </div>
    </div>
  )
}
