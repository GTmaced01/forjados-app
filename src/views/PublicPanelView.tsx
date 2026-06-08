import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { FORJADOS_MAIN_MESSAGE, MODULE_DNA } from '../constants';
import { formatPanelCategory, listPublishedPublicPanelItems } from '../services/publicPanel';
import { getErrorMessage } from '../services/safeAsync';
import type { PublicPanelItem } from '../types';

export function PublicPanelView() {
  const [items, setItems] = useState<PublicPanelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);

  async function loadData() {
    setLoading(true);
    setError('');
    setOfflineMode(false);
    try {
      const data = await listPublishedPublicPanelItems();
      setItems(data);
      setOfflineMode(!navigator.onLine);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Não foi possível carregar o mural.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  return (
    <div className="public-panel-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">{MODULE_DNA.publicPanel.eyebrow}</p>
          <h2>{MODULE_DNA.publicPanel.title}</h2>
          <p className="muted">{MODULE_DNA.publicPanel.description}</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadData}><RefreshCw size={16} />Atualizar</button>
      </div>

      <div className="card public-panel-highlight-card"><h3>Centro da mensagem</h3><p>{FORJADOS_MAIN_MESSAGE}</p></div>

      {offlineMode && <div className="alert success">Você está vendo informações salvas no dispositivo. Novos avisos aparecem quando houver internet.</div>}
      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <section className="panel center"><div className="loader" /><p className="muted">Carregando mural...</p></section>
      ) : items.length === 0 ? (
        <section className="panel center"><p className="muted">Nenhuma direção publicada no momento.</p></section>
      ) : (
        <section className="public-panel-list">
          {items.map((item) => (
            <article className={`public-panel-card ${item.category}`} key={item.id}>
              {item.image_url && <img src={item.image_url} alt={item.title} loading="lazy" decoding="async" />}
              <div className="public-panel-card-content">
                <div className="public-panel-meta"><span>{formatPanelCategory(item.category)}</span>{item.is_pinned && <strong>Fixado</strong>}</div>
                <h3>{item.title}</h3>
                <p>{item.content}</p>
                <small>{new Date(item.publish_at || item.created_at).toLocaleString('pt-BR')}</small>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
