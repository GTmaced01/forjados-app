import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, ExternalLink, FileCheck, MapPin, TicketCheck, Upload } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { FORJADOS_MAIN_MESSAGE, MODULE_DNA, STATUS_LABELS } from '../constants';
import {
  formatReceiptStatus,
  getMyInscriptionOverview,
  listMyPaymentReceipts,
  setActiveEditionParticipation,
  uploadInscriptionReceipt,
} from '../services/payments';
import { getPrivateDocumentUrl } from '../services/privateStorage';
import { withTimeout } from '../services/safeAsync';
import type { InscriptionOverview, PaymentReceipt } from '../types';

function formatCurrency(value?: number | null) {
  if (value == null) return 'A definir';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatEditionDate(value?: string | null) {
  if (!value) return 'data a definir';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function InscriptionView() {
  const { profile } = useAuth();
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [overview, setOverview] = useState<InscriptionOverview | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingParticipation, setSavingParticipation] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadInscription() {
    setLoading(true);
    setError('');

    try {
      const [receiptData, overviewData] = await Promise.all([
        withTimeout(listMyPaymentReceipts(), 10000, 'Não foi possível carregar seus comprovantes. Tente novamente.'),
        withTimeout(getMyInscriptionOverview(), 10000, 'Não foi possível carregar a edição atual.'),
      ]);
      setReceipts(receiptData);
      setOverview(overviewData);
    } catch (err) {
      console.error('Erro ao carregar inscrição:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar sua inscrição.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInscription();
  }, []);

  const activeEdition = overview?.edition || null;
  const currentReceipts = useMemo(() => {
    if (!activeEdition) return [];
    return receipts.filter((receipt) => receipt.edition_id === activeEdition.id);
  }, [activeEdition, receipts]);

  const latestReceipt = currentReceipts[0];
  const hasLockedReceipt = currentReceipts.some((receipt) => (
    receipt.status === 'pending' || receipt.status === 'approved'
  ));
  const willParticipate = overview?.enrollment?.will_participate ?? null;
  const paymentStatus = useMemo(() => {
    if (!activeEdition) return 'Nenhuma edição ativa';
    if (overview?.enrollment?.payment_status === 'approved' || latestReceipt?.status === 'approved') return 'Inscrição confirmada';
    if (latestReceipt?.status === 'rejected') return 'Comprovante recusado';
    if (latestReceipt?.status === 'pending') return 'Comprovante em análise';
    return 'Pagamento pendente';
  }, [activeEdition, latestReceipt, overview?.enrollment?.payment_status]);

  async function handleParticipationAnswer(answer: boolean) {
    setError('');
    setSuccess('');
    try {
      setSavingParticipation(true);
      await setActiveEditionParticipation(answer);
      setSuccess(answer
        ? 'Participação confirmada. Agora você pode concluir o pagamento desta edição.'
        : 'Resposta registrada. Você poderá mudar para “Sim” enquanto não houver comprovante em análise.');
      await loadInscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar sua resposta.');
    } finally {
      setSavingParticipation(false);
    }
  }

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setError('');
    setSuccess('');

    try {
      if (!activeEdition) throw new Error('Não existe uma edição ativa para receber inscrições.');
      if (willParticipate !== true) throw new Error('Confirme sua participação antes de enviar o comprovante.');
      if (activeEdition.status !== 'open') throw new Error('As inscrições desta edição estão fechadas.');
      if (hasLockedReceipt) throw new Error('Já existe um comprovante válido ou em análise para esta edição.');
      if (!selectedFile) throw new Error('Selecione um comprovante antes de enviar.');

      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(selectedFile.type)) throw new Error('Envie apenas PNG, JPG, JPEG ou PDF.');
      if (selectedFile.size > 8 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 8MB.');

      setUploading(true);
      await uploadInscriptionReceipt({
        file: selectedFile,
        editionId: activeEdition.id,
        userName: profile.display_name,
        userEmail: profile.email,
        userWhatsapp: profile.phone || '',
      });
      setSelectedFile(null);
      setSuccess('Comprovante enviado com sucesso. Aguarde a análise da tesouraria.');
      await loadInscription();
    } catch (err) {
      console.error('Erro ao enviar comprovante:', err);
      setError(err instanceof Error ? err.message : 'Erro ao enviar comprovante.');
    } finally {
      setUploading(false);
    }
  }

  async function handleOpenReceipt(receipt: PaymentReceipt) {
    const receiptWindow = window.open('about:blank', '_blank');
    if (receiptWindow) receiptWindow.opener = null;

    try {
      const url = await getPrivateDocumentUrl(receipt.file_path, receipt.file_url);
      if (receiptWindow) receiptWindow.location.replace(url);
      else window.location.assign(url);
    } catch (err) {
      receiptWindow?.close();
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o comprovante.');
    }
  }

  if (!profile) {
    return <div className="panel wide"><h1>{MODULE_DNA.inscription.title}</h1><p className="muted">Perfil não encontrado.</p></div>;
  }

  const canUpload = Boolean(
    activeEdition
    && activeEdition.status === 'open'
    && willParticipate === true
    && !hasLockedReceipt
  );

  return (
    <div className="inscription-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">{MODULE_DNA.inscription.eyebrow}</p>
          <h2>{MODULE_DNA.inscription.title}</h2>
          <p className="muted">{MODULE_DNA.inscription.description}</p>
        </div>
      </div>

      <div className="card inscription-message-card"><h3>Mensagem central</h3><p>{FORJADOS_MAIN_MESSAGE}</p></div>
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <section className="inscription-grid inscription-overview-grid">
        <div className="card inscription-card">
          <CalendarCheck2 size={22} aria-hidden="true" />
          <h3>Próxima edição</h3>
          <strong>{activeEdition?.title || 'A definir'}</strong>
          <p className="muted">{activeEdition ? formatEditionDate(activeEdition.starts_at) : 'Aguarde a publicação da próxima edição.'}</p>
          {activeEdition?.location && <p className="muted inscription-location"><MapPin size={14} />{activeEdition.location}</p>}
        </div>
        <div className="card inscription-card participation-count-card">
          <TicketCheck size={22} aria-hidden="true" />
          <h3>Edições já participadas</h3>
          <strong>{overview?.participation_count ?? 0}</strong>
          <p className="muted">
            {overview?.participation_count_is_manual
              ? 'Quantidade ajustada pela administração.'
              : 'Contagem baseada em pagamentos de inscrição aprovados.'}
          </p>
        </div>
        <div className="card inscription-card">
          <h3>Status de acesso</h3>
          <strong>{STATUS_LABELS[profile.inscription_status]}</strong>
          <p className="muted">Seu acesso ao aplicativo depende da aprovação da diretoria.</p>
        </div>
      </section>

      {loading && !overview ? (
        <section className="panel wide center"><div className="loader"></div><p className="muted">Carregando sua inscrição...</p></section>
      ) : !activeEdition ? (
        <section className="panel wide"><h3>Próxima edição ainda não publicada</h3><p className="muted">Quando a administração cadastrar uma nova edição, a confirmação de participação aparecerá aqui.</p></section>
      ) : (
        <section className={`panel wide participation-question ${willParticipate === true ? 'confirmed' : ''}`}>
          <div>
            <p className="eyebrow">Confirmação por edição</p>
            <h3>Você irá participar da próxima edição do FORJADOS {formatEditionDate(activeEdition.starts_at)}?</h3>
            <p className="muted">O pagamento desta edição só é liberado depois da sua confirmação.</p>
          </div>

          {willParticipate === true ? (
            <div className="participation-answer">
              <span className="pill success">Sim, vou participar</span>
              {!hasLockedReceipt && (
                <button type="button" className="secondary-button" disabled={savingParticipation} onClick={() => void handleParticipationAnswer(false)}>
                  Alterar resposta
                </button>
              )}
            </div>
          ) : willParticipate === false ? (
            <div className="participation-answer">
              <span className="pill muted-pill">Não participarei desta edição</span>
              <button type="button" className="primary-button" disabled={savingParticipation} onClick={() => void handleParticipationAnswer(true)}>
                {savingParticipation ? 'Salvando...' : 'Quero participar'}
              </button>
            </div>
          ) : (
            <div className="participation-answer">
              <button type="button" className="primary-button" disabled={savingParticipation} onClick={() => void handleParticipationAnswer(true)}>
                {savingParticipation ? 'Salvando...' : 'Sim, vou participar'}
              </button>
              <button type="button" className="secondary-button" disabled={savingParticipation} onClick={() => void handleParticipationAnswer(false)}>
                Não nesta edição
              </button>
            </div>
          )}
        </section>
      )}

      {activeEdition && willParticipate === true && (
        <>
          <section className="inscription-grid inscription-payment-grid">
            <div className="card inscription-card"><h3>Valor da inscrição</h3><strong>{formatCurrency(activeEdition.amount)}</strong><p className="muted">Valor protegido e definido no banco para esta edição.</p></div>
            <div className="card inscription-card"><h3>Status financeiro</h3><strong>{paymentStatus}</strong><p className="muted">{latestReceipt ? `Último envio: ${new Date(latestReceipt.uploaded_at).toLocaleString('pt-BR')}` : 'Nenhum comprovante para esta edição.'}</p></div>
          </section>

          <section className="panel wide receipt-upload-panel">
            <div><h3>Enviar comprovante</h3><p className="muted">PNG, JPG, JPEG ou PDF, até 8MB. O arquivo ficará privado.</p></div>
            <form onSubmit={handleUpload} className="receipt-upload-form">
              <input type="file" accept="image/png,image/jpeg,image/jpg,application/pdf" disabled={!canUpload} onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
              {selectedFile && <p className="muted">Arquivo selecionado: <strong>{selectedFile.name}</strong></p>}
              {activeEdition.status !== 'open' && <p className="muted">As inscrições não estão abertas neste momento.</p>}
              {hasLockedReceipt && <p className="muted">Esta edição já possui comprovante em análise ou aprovado.</p>}
              <button className="primary-button upload-button" disabled={uploading || !canUpload}><Upload size={16} />{uploading ? 'Enviando...' : 'Enviar comprovante'}</button>
            </form>
          </section>
        </>
      )}

      <section className="panel wide">
        <h3>Histórico de comprovantes</h3>
        {loading ? <p className="muted">Carregando comprovantes...</p> : receipts.length === 0 ? <p className="muted">Você ainda não enviou nenhum comprovante.</p> : (
          <div className="receipt-list">
            {receipts.map((receipt) => (
              <div className="receipt-item" key={receipt.id}>
                <div className="receipt-icon"><FileCheck size={20} /></div>
                <div>
                  <h4>{receipt.file_name}</h4>
                  <p className="muted">Valor: {formatCurrency(Number(receipt.amount))} · {new Date(receipt.uploaded_at).toLocaleString('pt-BR')}</p>
                  {receipt.observations && <p className="muted">Observação: {receipt.observations}</p>}
                </div>
                <div className={`receipt-status ${receipt.status}`}>{formatReceiptStatus(receipt.status)}</div>
                {(receipt.file_path || receipt.file_url) && <button type="button" onClick={() => void handleOpenReceipt(receipt)} className="secondary-button receipt-link"><ExternalLink size={16} />Abrir</button>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
