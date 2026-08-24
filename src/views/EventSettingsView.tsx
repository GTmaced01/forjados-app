import { useEffect, useState } from 'react';
import { getActiveRetreatEvent, upsertActiveRetreatEvent } from '../services/eventSettings';

export function EventSettingsView() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ title: 'FORJADOS', start_date: '', end_date: '', location: '', registration_fee: '80', registration_open: true });

  async function load() {
    setLoading(true);
    try {
      const event = await getActiveRetreatEvent();
      if (event) setForm({ title: event.title, start_date: event.start_date?.slice(0, 16) || '', end_date: event.end_date?.slice(0, 16) || '', location: event.location || '', registration_fee: String(event.registration_fee ?? ''), registration_open: event.registration_open !== false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar evento.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const registrationFee = Number(form.registration_fee.replace(',', '.'));
      if (!Number.isFinite(registrationFee) || registrationFee < 0) throw new Error('Informe um valor de inscrição válido.');
      await upsertActiveRetreatEvent({ ...form, registration_fee: registrationFee });
      setSuccess('Próximo FORJADOS atualizado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar evento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="event-settings-page">
      <div className="admin-header"><div><p className="eyebrow">Próximo encontro</p><h2>Configurar FORJADOS</h2><p className="muted">Defina a data usada na contagem regressiva, aniversariantes e relatórios.</p></div></div>
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}
      <section className="panel wide">
        <h3>Evento ativo</h3>
        {loading ? <p className="muted">Carregando...</p> : (
          <form className="grid two" onSubmit={submit}>
            <div><label>Nome</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><label>Local</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div><label>Início</label><input type="datetime-local" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label>Fim</label><input type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            <div><label>Valor da inscrição</label><input inputMode="decimal" value={form.registration_fee} onChange={(e) => setForm({ ...form, registration_fee: e.target.value })} /></div>
            <label className="auth-terms-consent"><input type="checkbox" checked={form.registration_open} onChange={(e) => setForm({ ...form, registration_open: e.target.checked })} /><span>Inscrições abertas para esta edição</span></label>
            <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar edição'}</button>
          </form>
        )}
      </section>
    </div>
  );
}
