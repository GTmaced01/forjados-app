import { useEffect, useState } from 'react';
import { getActiveRetreatEvent, upsertActiveRetreatEvent } from '../services/eventSettings';

export function EventSettingsView() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mode, setMode] = useState<'edit' | 'new'>('edit');
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

  function prepareNextEdition() {
    setMode('new');
    setError('');
    setSuccess('');
    setForm((current) => ({ ...current, start_date: '', end_date: '', registration_open: true }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const registrationFee = Number(form.registration_fee.replace(',', '.'));
      if (!Number.isFinite(registrationFee) || registrationFee < 0) throw new Error('Informe um valor de inscrição válido.');
      if (mode === 'new') {
        const confirmed = window.confirm('Criar uma nova edição? A edição atual será encerrada e seu histórico de pagamentos será preservado.');
        if (!confirmed) return;
      }
      await upsertActiveRetreatEvent(
        { ...form, registration_fee: registrationFee },
        { createNew: mode === 'new' }
      );
      setSuccess(mode === 'new'
        ? 'Nova edição criada. A confirmação e o pagamento serão novos para cada participante.'
        : 'Edição atualizada sem gerar uma nova cobrança.');
      setMode('edit');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar evento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="event-settings-page">
      <div className="admin-header">
        <div><p className="eyebrow">Próximo encontro</p><h2>Configurar FORJADOS</h2><p className="muted">Edite a edição atual ou crie uma nova para iniciar um novo ciclo de confirmação e pagamento.</p></div>
        {mode === 'edit' ? (
          <button type="button" className="secondary-button" onClick={prepareNextEdition}>Preparar próxima edição</button>
        ) : (
          <button type="button" className="secondary-button" onClick={() => { setMode('edit'); void load(); }}>Cancelar nova edição</button>
        )}
      </div>
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}
      <section className="panel wide">
        <h3>{mode === 'new' ? 'Criar próxima edição' : 'Editar edição ativa'}</h3>
        <p className="muted">
          {mode === 'new'
            ? 'Ao criar, a edição atual será encerrada sem apagar inscrições, comprovantes ou histórico.'
            : 'Alterações aqui corrigem a mesma edição e não cobram novamente quem já pagou.'}
        </p>
        {loading ? <p className="muted">Carregando...</p> : (
          <form className="grid two" onSubmit={submit}>
            <div><label>Nome</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><label>Local</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div><label>Início</label><input type="datetime-local" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label>Fim</label><input type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            <div><label>Valor da inscrição</label><input inputMode="decimal" value={form.registration_fee} onChange={(e) => setForm({ ...form, registration_fee: e.target.value })} /></div>
            <label className="auth-terms-consent"><input type="checkbox" checked={form.registration_open} onChange={(e) => setForm({ ...form, registration_open: e.target.checked })} /><span>Inscrições abertas para esta edição</span></label>
            <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : mode === 'new' ? 'Criar nova edição' : 'Salvar edição atual'}</button>
          </form>
        )}
      </section>
    </div>
  );
}
