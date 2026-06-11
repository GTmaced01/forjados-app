import { useEffect, useState } from 'react';
import { CalendarClock, RefreshCw, Send, XCircle } from 'lucide-react';
import { PRIMARY_TEAMS } from '../constants';
import { cancelAutomatedMessage, createAutomatedMessage, getAutomatedMessagesCronStatus, listAutomatedMessages, processDueAutomatedMessages } from '../services/automatedMessages';
import type { AutomatedMessage, AutomatedMessageTarget } from '../types';

export function AutomatedMessagesView() {
  const [items, setItems] = useState<AutomatedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cronStatus, setCronStatus] = useState<{ job_exists?: boolean; active?: boolean; frequency?: string; checked_at?: string } | null>(null);
  const [form, setForm] = useState({
    title: '',
    message: '',
    target: 'all' as AutomatedMessageTarget,
    target_team: '',
    scheduled_at: '',
  });

  async function load() {
    setLoading(true);
    setError('');
    try {
      await processDueAutomatedMessages().catch(() => undefined);
      const [data, status] = await Promise.all([
        listAutomatedMessages(),
        getAutomatedMessagesCronStatus().catch(() => null),
      ]);
      setItems(data);
      setCronStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mensagens.');
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
      if (!form.title.trim() || !form.message.trim() || !form.scheduled_at) throw new Error('Preencha título, mensagem e data.');
      await createAutomatedMessage(form);
      setForm({ title: '', message: '', target: 'all', target_team: '', scheduled_at: '' });
      setSuccess('Mensagem programada com sucesso.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao programar mensagem.');
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    setSaving(true);
    try {
      await cancelAutomatedMessage(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar mensagem.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="automated-messages-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Comunicação automática</p>
          <h2>Mensagens Automáticas</h2>
          <p className="muted">Programe notificações internas para membros, líderes ou equipes específicas. O horário selecionado é salvo corretamente a partir do fuso do seu aparelho.</p>
        </div>
        <button className="secondary-button" onClick={load} disabled={loading}><RefreshCw size={16} />Atualizar</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <section className="panel wide">
        <h3>Automação 100% automática</h3>
        <p className="muted">
          O Supabase verifica mensagens vencidas automaticamente a cada minuto e entrega como notificações internas.
        </p>
        <div className="cards">
          <div className="card">
            <h3>Status do agendamento</h3>
            <p>{cronStatus?.job_exists && cronStatus?.active ? 'Ativo' : 'Aguardando SQL/Configuração'}</p>
          </div>
          <div className="card">
            <h3>Frequência</h3>
            <p>{cronStatus?.frequency || 'A cada 1 minuto'}</p>
          </div>
          <div className="card">
            <h3>Última conferência</h3>
            <p>{cronStatus?.checked_at ? new Date(cronStatus.checked_at).toLocaleString('pt-BR') : 'Não informado'}</p>
          </div>
        </div>
      </section>

      <section className="panel wide">
        <h3>Programar mensagem</h3>
        <form className="grid two" onSubmit={submit}>
          <div>
            <label>Título</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label>Enviar em <span className="muted">(horário de Brasília/local)</span></label>
            <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>
          <div>
            <label>Público</label>
            <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value as AutomatedMessageTarget })}>
              <option value="all">Todos</option>
              <option value="approved">Aprovados</option>
              <option value="pending">Pendentes</option>
              <option value="leaders">Líderes</option>
              <option value="team">Equipe específica</option>
            </select>
          </div>
          <div>
            <label>Equipe específica</label>
            <select value={form.target_team} disabled={form.target !== 'team'} onChange={(e) => setForm({ ...form, target_team: e.target.value })}>
              <option value="">Selecione</option>
              {PRIMARY_TEAMS.map((team) => <option key={team}>{team}</option>)}
            </select>
          </div>
          <div className="grid-full">
            <label>Mensagem</label>
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
          <button className="primary-button" disabled={saving}><Send size={16} />Programar</button>
        </form>
      </section>

      <section className="panel wide">
        <h3>Mensagens programadas</h3>
        <div className="treasury-list">
          {items.map((item) => (
            <div className="treasury-card" key={item.id}>
              <div className="treasury-card-main">
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.message}</p>
                  <p className="muted"><CalendarClock size={14} /> {new Date(item.scheduled_at).toLocaleString('pt-BR')} · {item.target}{item.target_team ? ` · ${item.target_team}` : ''}</p>
                </div>
                <div className={`receipt-status ${item.status === 'sent' ? 'approved' : item.status === 'cancelled' || item.status === 'failed' ? 'rejected' : 'pending'}`}>{item.status}</div>
              </div>
              {item.status === 'scheduled' && <button className="reject-button" disabled={saving} onClick={() => cancel(item.id)}><XCircle size={16} />Cancelar</button>}
            </div>
          ))}
          {!loading && items.length === 0 && <p className="muted">Nenhuma mensagem programada.</p>}
        </div>
      </section>
    </div>
  );
}
