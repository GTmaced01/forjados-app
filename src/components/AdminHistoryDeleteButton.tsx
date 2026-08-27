import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, Trash2, X } from 'lucide-react';
import { softDeleteAdminHistory, type AdminHistoryEntity } from '../services/adminHistory';

type Props = {
  entityType: AdminHistoryEntity;
  entityId: string;
  itemLabel: string;
  onDeleted: () => void | Promise<void>;
  buttonLabel?: string;
  className?: string;
};

export function AdminHistoryDeleteButton({
  entityType,
  entityId,
  itemLabel,
  onDeleted,
  buttonLabel = 'Excluir histórico',
  className = 'reject-button',
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function close() {
    if (saving) return;
    setIsOpen(false);
    setReason('');
    setError('');
  }

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, saving]);

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);

    try {
      await softDeleteAdminHistory({ entityType, entityId, reason });
      await onDeleted();
      setIsOpen(false);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir o histórico.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setIsOpen(true)}>
        <Trash2 size={16} />
        {buttonLabel}
      </button>

      {isOpen && createPortal(
        <div className="admin-history-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <section
            className="admin-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <button type="button" className="admin-history-modal-close" aria-label="Fechar" onClick={close} disabled={saving}>
              <X size={20} />
            </button>

            <div className="admin-history-modal-icon"><ShieldAlert size={24} /></div>
            <p className="eyebrow">Ação administrativa auditada</p>
            <h3 id={titleId}>Excluir {itemLabel}?</h3>
            <p id={descriptionId} className="muted">
              O registro sairá das telas normais, mas continuará preservado para auditoria. Saldos, estoque ou participações relacionados serão recalculados quando necessário.
            </p>

            <form className="form" onSubmit={handleConfirm}>
              <div>
                <label htmlFor={`${titleId}-reason`}>Motivo da exclusão</label>
                <textarea
                  id={`${titleId}-reason`}
                  autoFocus
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ex.: registro criado durante teste de homologação"
                />
                <p className="field-hint">{reason.trim().length}/500 caracteres</p>
              </div>

              {error && <div className="alert error">{error}</div>}

              <div className="admin-history-modal-actions">
                <button type="button" className="secondary-button" onClick={close} disabled={saving}>Cancelar</button>
                <button type="submit" className="reject-button" disabled={saving || reason.trim().length < 3}>
                  <Trash2 size={16} />
                  {saving ? 'Excluindo...' : 'Confirmar exclusão'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )}
    </>
  );
}
