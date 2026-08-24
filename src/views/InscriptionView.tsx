import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileCheck, Upload } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { FORJADOS_MAIN_MESSAGE, MODULE_DNA, STATUS_LABELS } from '../constants';
import { getActiveRetreatEvent } from '../services/eventSettings';
import {
  formatReceiptStatus,
  listMyPaymentReceipts,
  uploadInscriptionReceipt,
} from '../services/payments';
import { getPrivateDocumentUrl } from '../services/privateStorage';
import { withTimeout } from '../services/safeAsync';
import type { PaymentReceipt, RetreatEventSettings } from '../types';

function formatCurrency(value?: number | null) {
  if (value == null) return 'A definir';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function InscriptionView() {
  const { profile } = useAuth();
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [activeEvent, setActiveEvent] = useState<RetreatEventSettings | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadInscription() {
    setLoadingReceipts(true);
    setError('');

    try {
      const [receiptData, eventData] = await Promise.all([
        withTimeout(listMyPaymentReceipts(), 10000, 'Não foi possível carregar seus comprovantes. Tente novamente.'),
        withTimeout(getActiveRetreatEvent(), 10000, 'Não foi possível carregar a edição atual.'),
      ]);
      setReceipts(receiptData);
      setActiveEvent(eventData);
    } catch (err) {
      console.error('Erro ao carregar inscrição:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar sua inscrição.');
    } finally {
      setLoadingReceipts(false);
    }
  }

  useEffect(() => {
    void loadInscription();
  }, []);

  const currentReceipts = useMemo(() => {
    if (!activeEvent) return [];
    return receipts.filter((receipt) => receipt.edition_id === activeEvent.id);
  }, [activeEvent, receipts]);

  const latestReceipt = currentReceipts[0];
  const paymentStatus = useMemo(() => {
    if (!activeEvent) return 'Nenhuma edição ativa';
    if (!latestReceipt) return 'Pagamento pendente';
    if (latestReceipt.status === 'approved') return 'Inscrição confirmada';
    if (latestReceipt.status === 'rejected') return 'Comprovante recusado';
    return 'Comprovante em análise';
  }, [activeEvent, latestReceipt]);

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setError('');
    setSuccess('');

    try {
      if (!activeEvent) throw new Error('Não existe uma edição ativa para receber inscrições.');
      if (activeEvent.registration_open === false) throw new Error('As inscrições desta edição estão fechadas.');
      if (!selectedFile) throw new Error('Selecione um comprovante antes de enviar.');

      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(selectedFile.type)) throw new Error('Envie apenas PNG, JPG, JPEG ou PDF.');
      if (selectedFile.size > 8 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 8MB.');

      setUploading(true);
      await uploadInscriptionReceipt({
        file: selectedFile,
        editionId: activeEvent.id,
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

  const canUpload = Boolean(activeEvent && activeEvent.registration_open !== false);

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

      <section className="inscription-grid">
        <div className="card inscription-card"><h3>Edição atual</h3><strong>{activeEvent?.title || 'A definir'}</strong><p className="muted">{activeEvent?.start_date ? new Date(activeEvent.start_date).toLocaleDateString('pt-BR') : 'Aguarde a publicação da próxima edição.'}</p></div>
        <div className="card inscription-card"><h3>Status de acesso</h3><strong>{STATUS_LABELS[profile.inscription_status]}</strong><p className="muted">Seu acesso ao aplicativo depende da aprovação da diretoria.</p></div>
        <div className="card inscription-card"><h3>Valor da inscrição</h3><strong>{formatCurrency(activeEvent?.registration_fee)}</strong><p className="muted">O valor é definido pela edição ativa, não pelo navegador.</p></div>
        <div className="card inscription-card"><h3>Status financeiro</h3><strong>{paymentStatus}</strong><p className="muted">{latestReceipt ? `Último envio: ${new Date(latestReceipt.uploaded_at).toLocaleString('pt-BR')}` : 'Nenhum comprovante para esta edição.'}</p></div>
      </section>

      <section className="panel wide receipt-upload-panel">
        <div><h3>Enviar comprovante</h3><p className="muted">PNG, JPG, JPEG ou PDF, até 8MB. O arquivo ficará privado.</p></div>
        <form onSubmit={handleUpload} className="receipt-upload-form">
          <input type="file" accept="image/png,image/jpeg,image/jpg,application/pdf" disabled={!canUpload} onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
          {selectedFile && <p className="muted">Arquivo selecionado: <strong>{selectedFile.name}</strong></p>}
          {!canUpload && <p className="muted">As inscrições não estão abertas neste momento.</p>}
          <button className="primary-button upload-button" disabled={uploading || !canUpload}><Upload size={16} />{uploading ? 'Enviando...' : 'Enviar comprovante'}</button>
        </form>
      </section>

      <section className="panel wide">
        <h3>Histórico de comprovantes</h3>
        {loadingReceipts ? <p className="muted">Carregando comprovantes...</p> : receipts.length === 0 ? <p className="muted">Você ainda não enviou nenhum comprovante.</p> : (
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
