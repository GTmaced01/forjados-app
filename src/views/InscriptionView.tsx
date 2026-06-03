import { useEffect, useMemo, useState } from 'react';
import { FileCheck, Upload } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { STATUS_LABELS } from '../constants';
import {
  formatReceiptStatus,
  listMyPaymentReceipts,
  uploadInscriptionReceipt,
} from '../services/payments';
import { withTimeout } from '../services/safeAsync';
import type { PaymentReceipt } from '../types';

const INSCRIPTION_AMOUNT = 80;

export function InscriptionView() {
  const { profile } = useAuth();

  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadReceipts() {
    setLoadingReceipts(true);
    setError('');

    try {
      const data = await withTimeout(
        listMyPaymentReceipts(),
        10000,
        'Não foi possível carregar seus comprovantes. Tente novamente.'
      );

      setReceipts(data);
    } catch (err) {
      console.error('Erro ao carregar comprovantes:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar comprovantes.'
      );
    } finally {
      setLoadingReceipts(false);
    }
  }

  useEffect(() => {
    loadReceipts();
  }, []);

  const latestReceipt = receipts[0];

  const paymentStatus = useMemo(() => {
    if (!latestReceipt) return 'Nenhum comprovante enviado';
    if (latestReceipt.status === 'approved') return 'Pagamento aprovado';
    if (latestReceipt.status === 'rejected') return 'Pagamento recusado';
    return 'Comprovante em análise';
  }, [latestReceipt]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();

    if (!profile) return;

    setError('');
    setSuccess('');

    try {
      if (!selectedFile) {
        throw new Error('Selecione um comprovante antes de enviar.');
      }

      const allowedTypes = [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'application/pdf',
      ];

      if (!allowedTypes.includes(selectedFile.type)) {
        throw new Error('Envie apenas PNG, JPG, JPEG ou PDF.');
      }

      const maxSizeInMb = 8;
      const maxSizeInBytes = maxSizeInMb * 1024 * 1024;

      if (selectedFile.size > maxSizeInBytes) {
        throw new Error(`O arquivo deve ter no máximo ${maxSizeInMb}MB.`);
      }

      setUploading(true);

      await uploadInscriptionReceipt({
        file: selectedFile,
        userName: profile.display_name,
        userEmail: profile.email,
        userWhatsapp: profile.phone || '',
      });

      setSelectedFile(null);
      setSuccess('Comprovante enviado com sucesso. Aguarde análise da tesouraria.');
      await loadReceipts();
    } catch (err) {
      console.error('Erro ao enviar comprovante:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao enviar comprovante.'
      );
    } finally {
      setUploading(false);
    }
  }

  if (!profile) {
    return (
      <div className="panel wide">
        <h1>Minha Inscrição</h1>
        <p className="muted">Perfil não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="inscription-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Ficha e pagamento</p>
          <h2>Minha Inscrição</h2>
          <p className="muted">
            Acompanhe sua inscrição e envie o comprovante da taxa.
          </p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <section className="inscription-grid">
        <div className="card inscription-card">
          <h3>Status da inscrição</h3>
          <strong>{STATUS_LABELS[profile.inscription_status]}</strong>
          <p className="muted">
            Sua participação depende da aprovação da diretoria.
          </p>
        </div>

        <div className="card inscription-card">
          <h3>Taxa de inscrição</h3>
          <strong>R$ {INSCRIPTION_AMOUNT.toFixed(2).replace('.', ',')}</strong>
          <p className="muted">
            Envie o comprovante para conferência da tesouraria.
          </p>
        </div>

        <div className="card inscription-card">
          <h3>Status do pagamento</h3>
          <strong>{paymentStatus}</strong>
          <p className="muted">
            {latestReceipt
              ? `Último envio: ${new Date(latestReceipt.uploaded_at).toLocaleString('pt-BR')}`
              : 'Nenhum comprovante recebido ainda.'}
          </p>
        </div>
      </section>

      <section className="panel wide receipt-upload-panel">
        <div>
          <h3>Enviar comprovante</h3>
          <p className="muted">
            Formatos aceitos: PNG, JPG, JPEG ou PDF. Tamanho máximo: 8MB.
          </p>
        </div>

        <form onSubmit={handleUpload} className="receipt-upload-form">
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,application/pdf"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          />

          {selectedFile && (
            <p className="muted">
              Arquivo selecionado: <strong>{selectedFile.name}</strong>
            </p>
          )}

          <button className="primary-button upload-button" disabled={uploading}>
            <Upload size={16} />
            {uploading ? 'Enviando...' : 'Enviar comprovante'}
          </button>
        </form>
      </section>

      <section className="panel wide">
        <h3>Comprovantes enviados</h3>

        {loadingReceipts ? (
          <p className="muted">Carregando comprovantes...</p>
        ) : receipts.length === 0 ? (
          <p className="muted">Você ainda não enviou nenhum comprovante.</p>
        ) : (
          <div className="receipt-list">
            {receipts.map((receipt) => (
              <div className="receipt-item" key={receipt.id}>
                <div className="receipt-icon">
                  <FileCheck size={20} />
                </div>

                <div>
                  <h4>{receipt.file_name}</h4>
                  <p className="muted">
                    Valor: R$ {Number(receipt.amount).toFixed(2).replace('.', ',')} ·{' '}
                    {new Date(receipt.uploaded_at).toLocaleString('pt-BR')}
                  </p>

                  {receipt.observations && (
                    <p className="muted">Observação: {receipt.observations}</p>
                  )}
                </div>

                <div className={`receipt-status ${receipt.status}`}>
                  {formatReceiptStatus(receipt.status)}
                </div>

                {receipt.file_url && (
                  <a
                    href={receipt.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button receipt-link"
                  >
                    Abrir
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}