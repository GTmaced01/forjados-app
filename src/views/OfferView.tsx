import { useEffect, useState } from 'react';
import { HeartHandshake, Upload } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { createOffer, formatOfferMethod, formatOfferStatus, listMyOffers } from '../services/offers';
import { getPrivateDocumentUrl } from '../services/privateStorage';
import type { Offer, OfferMethod } from '../types';

export function OfferView() {
  const { profile } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ amount: '', method: 'pix' as OfferMethod, objective: 'Retiro', notes: '' });

  async function loadOffers() {
    setLoading(true);
    setError('');
    try {
      const data = await listMyOffers();
      setOffers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar ofertas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOffers(); }, []);

  async function handleOpenProof(offer: Offer) {
    const proofWindow = window.open('about:blank', '_blank');
    if (proofWindow) proofWindow.opener = null;

    try {
      const url = await getPrivateDocumentUrl(offer.proof_path, offer.proof_url);
      if (proofWindow) proofWindow.location.replace(url);
      else window.location.assign(url);
    } catch (err) {
      proofWindow?.close();
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o comprovante.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const amount = Number(form.amount.replace(',', '.'));
      if (!amount || amount <= 0) throw new Error('Informe um valor válido.');
      await createOffer({
        amount,
        method: form.method,
        objective: form.objective,
        notes: form.notes,
        file,
        userName: profile.display_name,
        userEmail: profile.email,
      });
      setForm({ amount: '', method: 'pix', objective: 'Retiro', notes: '' });
      setFile(null);
      setSuccess('Oferta registrada com sucesso. Obrigado por semear no FORJADOS.');
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar oferta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="offer-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Generosidade e propósito</p>
          <h2>Fazer Oferta</h2>
          <p className="muted">Registre uma oferta para apoiar o FORJADOS, missões ou ações do projeto.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <section className="panel wide">
        <h3>Nova oferta</h3>
        <form className="grid two" onSubmit={handleSubmit}>
          <div>
            <label>Valor</label>
            <input value={form.amount} placeholder="Ex: 50,00" onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label>Forma</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as OfferMethod })}>
              <option value="pix">PIX</option>
              <option value="card">Cartão</option>
              <option value="cash">Dinheiro</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <div>
            <label>Objetivo</label>
            <select value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })}>
              <option>Retiro</option>
              <option>Missões</option>
              <option>Ação social</option>
              <option>Livre</option>
            </select>
          </div>
          <div>
            <label>Comprovante opcional</label>
            <input type="file" accept="image/png,image/jpeg,image/jpg,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="grid-full">
            <label>Observações</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex: oferta para ajudar alguém a participar..." />
          </div>
          <button className="primary-button" disabled={saving}>
            <HeartHandshake size={16} />
            {saving ? 'Registrando...' : 'Registrar oferta'}
          </button>
        </form>
      </section>

      <section className="panel wide">
        <h3>Minhas ofertas</h3>
        {loading ? <p className="muted">Carregando...</p> : offers.length === 0 ? <p className="muted">Nenhuma oferta registrada ainda.</p> : (
          <div className="treasury-list">
            {offers.map((offer) => (
              <div className="treasury-card" key={offer.id}>
                <div className="treasury-card-main">
                  <div>
                    <h3>R$ {Number(offer.amount).toFixed(2).replace('.', ',')}</h3>
                    <p className="muted">{offer.objective} · {formatOfferMethod(offer.method)}</p>
                    <p className="muted">{new Date(offer.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                  <div className={`receipt-status ${offer.status}`}>{formatOfferStatus(offer.status)}</div>
                </div>
                {(offer.proof_path || offer.proof_url) && <button type="button" className="secondary-button" onClick={() => void handleOpenProof(offer)}><Upload size={16} /> Abrir comprovante</button>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
