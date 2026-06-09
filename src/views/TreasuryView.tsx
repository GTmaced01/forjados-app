import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Download, ExternalLink, Search, XCircle } from 'lucide-react';
import {
  formatReceiptStatus,
  listAllPaymentReceipts,
  updatePaymentReceiptStatus,
} from '../services/payments';
import { exportTreasuryWorkbook } from '../services/exporters';
import { formatOfferMethod, formatOfferStatus, listAllOffers, updateOfferStatus } from '../services/offers';
import type { Offer, PaymentReceipt } from '../types';

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected';

const TREASURY_CACHE_KEY = 'forjados_treasury_receipts_cache';

function getCachedReceipts(): PaymentReceipt[] {
  try {
    const cached = localStorage.getItem(TREASURY_CACHE_KEY);
    if (!cached) return [];
    return JSON.parse(cached) as PaymentReceipt[];
  } catch {
    return [];
  }
}

function setCachedReceipts(receipts: PaymentReceipt[]) {
  try {
    localStorage.setItem(TREASURY_CACHE_KEY, JSON.stringify(receipts));
  } catch {
    // ignora erro de cache
  }
}

export function TreasuryView() {
  const mountedRef = useRef(true);

  const [receipts, setReceipts] = useState<PaymentReceipt[]>(() => getCachedReceipts());
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [observations, setObservations] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function safeSetLoading(value: boolean) {
    if (mountedRef.current) setLoading(value);
  }

  function handleOpenReceipt(url: string) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function loadReceipts() {
    safeSetLoading(true);
    setError('');

    let timeoutId: number | undefined;

    try {
      const timeoutPromise = new Promise<PaymentReceipt[]>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(
            new Error(
              'Tempo limite ao carregar comprovantes. Clique em Atualizar para tentar novamente.'
            )
          );
        }, 8000);
      });

      const data = await Promise.race([
        listAllPaymentReceipts(),
        timeoutPromise,
      ]);

      if (!mountedRef.current) return;

      setReceipts(data);
      setCachedReceipts(data);
      const offerData = await listAllOffers().catch(() => [] as Offer[]);
      if (mountedRef.current) setOffers(offerData);
    } catch (err) {
      console.error('Erro ao carregar comprovantes:', err);

      if (!mountedRef.current) return;

      const cached = getCachedReceipts();

      if (cached.length > 0) {
        setReceipts(cached);
        setError(
          'Não consegui atualizar agora, então mantive os últimos comprovantes carregados.'
        );
      } else {
        setReceipts([]);
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar comprovantes.'
        );
      }
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      safeSetLoading(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    loadReceipts();

    return () => {
      mountedRef.current = false;
      setLoading(false);
    };
  }, []);

  const filteredReceipts = useMemo(() => {
    return receipts.filter((receipt) => {
      const text = `${receipt.user_name} ${receipt.user_email} ${
        receipt.user_whatsapp || ''
      } ${receipt.file_name}`.toLowerCase();

      const matchesSearch = text.includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' || receipt.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [receipts, search, statusFilter]);

  async function handleUpdateStatus(
    receipt: PaymentReceipt,
    status: 'approved' | 'rejected'
  ) {
    setSavingId(receipt.id);
    setError('');
    setSuccess('');

    try {
      await updatePaymentReceiptStatus({
        receiptId: receipt.id,
        status,
        observations: observations[receipt.id] || receipt.observations || '',
      });

      setSuccess(
        status === 'approved'
          ? 'Comprovante aprovado com sucesso.'
          : 'Comprovante recusado com sucesso.'
      );

      await loadReceipts();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar comprovante.'
      );
    } finally {
      setSavingId(null);
    }
  }

  async function handleUpdateOfferStatus(offer: Offer, status: 'approved' | 'rejected') {
    setSavingId(offer.id);
    setError('');
    setSuccess('');

    try {
      await updateOfferStatus({ offerId: offer.id, status });
      setSuccess(status === 'approved' ? 'Oferta aprovada.' : 'Oferta recusada.');
      await loadReceipts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar oferta.');
    } finally {
      setSavingId(null);
    }
  }

  const pendingCount = receipts.filter((item) => item.status === 'pending').length;
  const approvedCount = receipts.filter((item) => item.status === 'approved').length;
  const rejectedCount = receipts.filter((item) => item.status === 'rejected').length;
  const totalInscriptionApproved = receipts.filter((item) => item.status === 'approved' && item.type === 'inscription').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalOrdersApproved = receipts.filter((item) => item.status === 'approved' && item.type === 'order').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalOffersApproved = offers.filter((item) => item.status === 'approved').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalApproved = totalInscriptionApproved + totalOrdersApproved + totalOffersApproved;

  return (
    <div className="treasury-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Mordomia e transparência</p>
          <h2>Tesouraria</h2>
          <p className="muted">
            Analise os comprovantes de inscrição enviados pelos membros.
          </p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={() => exportTreasuryWorkbook({ receipts, offers })}>
            <Download size={16} />
            Exportar planilha
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={loadReceipts}
            disabled={loading}
          >
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <section className="admin-stats">
        <div className="card">
          <h3>Pendentes</h3>
          <strong>{pendingCount}</strong>
        </div>

        <div className="card">
          <h3>Aprovados</h3>
          <strong>{approvedCount}</strong>
        </div>

        <div className="card">
          <h3>Recusados</h3>
          <strong>{rejectedCount}</strong>
        </div>

        <div className="card">
          <h3>Total comprovantes</h3>
          <strong>{receipts.length}</strong>
        </div>
        <div className="card">
          <h3>Total arrecadado</h3>
          <strong>R$ {totalApproved.toFixed(2).replace('.', ',')}</strong>
          <p className="muted">Inscrições: R$ {totalInscriptionApproved.toFixed(2).replace('.', ',')} · Camisas: R$ {totalOrdersApproved.toFixed(2).replace('.', ',')} · Ofertas: R$ {totalOffersApproved.toFixed(2).replace('.', ',')}</p>
        </div>
      </section>

      <section className="admin-filters">
        <div className="search-box">
          <Search size={18} />
          <input
            placeholder="Buscar por nome, e-mail, WhatsApp ou arquivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
        >
          <option value="all">Todos</option>
          <option value="pending">Pendentes</option>
          <option value="approved">Aprovados</option>
          <option value="rejected">Recusados</option>
        </select>
      </section>

      {loading && receipts.length > 0 && (
        <p className="muted">Atualizando comprovantes...</p>
      )}

      <div className="treasury-list">
        {filteredReceipts.map((receipt) => {
          const isSaving = savingId === receipt.id;

          return (
            <div className="treasury-card" key={receipt.id}>
              <div className="treasury-card-main">
                <div>
                  <h3>{receipt.user_name || 'Usuário sem nome'}</h3>
                  <p className="muted">{receipt.user_email}</p>
                  <p className="muted">
                    WhatsApp: {receipt.user_whatsapp || 'Não informado'}
                  </p>
                </div>

                <div className={`receipt-status ${receipt.status}`}>
                  {formatReceiptStatus(receipt.status)}
                </div>
              </div>

              <div className="treasury-info-grid">
                <div>
                  <label>Valor</label>
                  <p>R$ {Number(receipt.amount).toFixed(2).replace('.', ',')}</p>
                </div>

                <div>
                  <label>Tipo</label>
                  <p>{receipt.type === 'inscription' ? 'Inscrição' : 'Pedido'}</p>
                </div>

                <div>
                  <label>Enviado em</label>
                  <p>{new Date(receipt.uploaded_at).toLocaleString('pt-BR')}</p>
                </div>

                <div>
                  <label>Arquivo</label>
                  <p>{receipt.file_name}</p>
                </div>
              </div>

              <div>
                <label>Observação da tesouraria</label>
                <textarea
                  value={observations[receipt.id] ?? receipt.observations ?? ''}
                  onChange={(e) =>
                    setObservations((prev) => ({
                      ...prev,
                      [receipt.id]: e.target.value,
                    }))
                  }
                  placeholder="Ex: comprovante validado, valor divergente, imagem ilegível..."
                />
              </div>

              <div className="treasury-actions">
                {receipt.file_url && (
                  <button
                    type="button"
                    className="secondary-button treasury-link"
                    onClick={() => handleOpenReceipt(receipt.file_url)}
                  >
                    <ExternalLink size={16} />
                    Abrir comprovante
                  </button>
                )}

{receipt.status !== 'approved' && (
  <button
    type="button"
    className="approve-button"
    disabled={isSaving}
    onClick={() => handleUpdateStatus(receipt, 'approved')}
  >
    <CheckCircle size={16} />
    Aprovar
  </button>
)}

{receipt.status !== 'rejected' && (
  <button
    type="button"
    className="reject-button"
    disabled={isSaving}
    onClick={() => handleUpdateStatus(receipt, 'rejected')}
  >
    <XCircle size={16} />
    Recusar
  </button>
)}

{receipt.status === 'approved' && (
  <span className="payment-approved-label">
    <CheckCircle size={16} />
    Pagamento confirmado
  </span>
)}

{receipt.status === 'rejected' && (
  <span className="payment-rejected-label">
    <XCircle size={16} />
    Pagamento recusado
  </span>
)}
              </div>
            </div>
          );
        })}

        {filteredReceipts.length === 0 && (
          <div className="panel center">
            <p className="muted">
              {loading
                ? 'Atualizando comprovantes...'
                : 'Nenhum comprovante encontrado.'}
            </p>
          </div>
        )}
      </div>

      <section className="panel wide">
        <h3>Ofertas recebidas</h3>
        {offers.length === 0 ? (
          <p className="muted">Nenhuma oferta registrada.</p>
        ) : (
          <div className="treasury-list">
            {offers.map((offer) => {
              const isSaving = savingId === offer.id;
              return (
                <div className="treasury-card" key={offer.id}>
                  <div className="treasury-card-main">
                    <div>
                      <h3>{offer.user_name || 'Usuário sem nome'}</h3>
                      <p className="muted">{offer.user_email || 'Sem e-mail'} · {offer.objective}</p>
                    </div>
                    <div className={`receipt-status ${offer.status}`}>{formatOfferStatus(offer.status)}</div>
                  </div>
                  <div className="treasury-info-grid">
                    <div><label>Valor</label><p>R$ {Number(offer.amount).toFixed(2).replace('.', ',')}</p></div>
                    <div><label>Forma</label><p>{formatOfferMethod(offer.method)}</p></div>
                    <div><label>Data</label><p>{new Date(offer.created_at).toLocaleString('pt-BR')}</p></div>
                    <div><label>Observações</label><p>{offer.notes || 'Sem observação'}</p></div>
                  </div>
                  <div className="treasury-actions">
                    {offer.proof_url && <button type="button" className="secondary-button" onClick={() => handleOpenReceipt(offer.proof_url || '')}>Abrir comprovante</button>}
                    {offer.status !== 'approved' && <button className="approve-button" disabled={isSaving} onClick={() => handleUpdateOfferStatus(offer, 'approved')}>Aprovar</button>}
                    {offer.status !== 'rejected' && <button className="reject-button" disabled={isSaving} onClick={() => handleUpdateOfferStatus(offer, 'rejected')}>Recusar</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}