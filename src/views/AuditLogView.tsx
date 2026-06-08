import { useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, Search } from 'lucide-react';
import { formatAuditAction, listAuditLogs } from '../services/audit';
import { getErrorMessage } from '../services/safeAsync';
import type { AuditLog } from '../types';

export function AuditLogView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  async function loadLogs() {
    setLoading(true);
    setError('');

    try {
      const data = await listAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao carregar histórico do sistema.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return logs;

    return logs.filter((log) => {
      const text = `${log.action} ${log.actor_name || ''} ${log.actor_email || ''} ${
        log.entity_type || ''
      } ${log.description || ''}`.toLowerCase();
      return text.includes(query);
    });
  }, [logs, search]);

  return (
    <div className="audit-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Memorial de decisões</p>
          <h2>Memorial do Sistema</h2>
          <p className="muted">
            Veja ações importantes realizadas por administradores, diretores e pelo sistema.
          </p>
        </div>

        <button className="secondary-button" type="button" onClick={loadLogs} disabled={loading}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="panel wide audit-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ação, pessoa ou descrição..."
          />
        </div>
      </section>

      <section className="panel wide">
        {loading ? (
          <p className="muted">Carregando histórico...</p>
        ) : filteredLogs.length === 0 ? (
          <div className="empty-access-requests">
            <h4>Nenhum registro encontrado</h4>
            <p className="muted">Quando decisões importantes forem registradas, aparecerão aqui.</p>
          </div>
        ) : (
          <div className="audit-list">
            {filteredLogs.map((log) => (
              <article className="audit-card" key={log.id}>
                <div className="audit-icon">
                  <History size={18} />
                </div>
                <div>
                  <h4>{formatAuditAction(log.action)}</h4>
                  <p className="muted">
                    {log.actor_name || log.actor_email || 'Sistema'} ·{' '}
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </p>
                  {log.description && <p>{log.description}</p>}
                  {log.entity_type && (
                    <span className="audit-entity">{log.entity_type}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
