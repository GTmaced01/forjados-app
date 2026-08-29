import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, CheckCircle, Eye, Pin, PinOff, RefreshCw, Smartphone, Trash2, UsersRound, XCircle } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import {
  listMyNotifications,
  listNotificationReceipts,
  clearMyNotificationHistory,
  clearNotificationReceiptHistory,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  sendMyPushTest,
  toggleNotificationPin,
} from '../services/notifications';
import { getErrorMessage } from '../services/safeAsync';
import {
  formatPushStatus,
  getPushSubscriptionStatus,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  type PushSubscriptionStatus,
} from '../services/pushNotifications';
import type { AppNotification, NotificationReceipt } from '../types';

export function NotificationsView() {
  const { isAdmin, isDirector } = useAuth();
  const canSeeReadReceipts = isAdmin || isDirector;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readReceipts, setReadReceipts] = useState<NotificationReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pushStatus, setPushStatus] = useState<PushSubscriptionStatus | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSuccess, setPushSuccess] = useState('');

  async function loadPushStatus() {
    try {
      const status = await getPushSubscriptionStatus();
      setPushStatus(status);
    } catch (err) {
      console.warn('Status de push indisponível:', err);
    }
  }

  async function loadNotifications() {
    setLoading(true);
    setError('');

    try {
      const [data, receiptData] = await Promise.all([
        listMyNotifications(),
        canSeeReadReceipts ? listNotificationReceipts() : Promise.resolve([]),
      ]);
      setNotifications(data);
      setReadReceipts(receiptData);
      await loadPushStatus();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao carregar notificações.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, [canSeeReadReceipts]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  async function handleMarkOne(notificationId: string) {
    setSaving(true);
    setError('');

    try {
      await markNotificationAsRead(notificationId);
      setNotifications((items) =>
        items.map((item) =>
          item.id === notificationId ? { ...item, is_read: true, read_at: new Date().toISOString() } : item
        )
      );
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao marcar notificação.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkAll() {
    setSaving(true);
    setError('');

    try {
      await markAllNotificationsAsRead();
      const readAt = new Date().toISOString();
      setNotifications((items) => items.map((item) => ({ ...item, is_read: true, read_at: item.read_at || readAt })));
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao limpar notificações.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePin(notification: AppNotification) {
    setSaving(true);
    setError('');
    try {
      await toggleNotificationPin(notification.id, !notification.is_pinned);
      await loadNotifications();
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao fixar notificação.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleClearHistory() {
    if (!window.confirm('Arquivar notificações já lidas? Avisos não lidos e fixados serão preservados.')) return;
    setSaving(true);
    setError('');
    try {
      const count = await clearMyNotificationHistory();
      setPushSuccess(`${count} notificação(ões) arquivada(s).`);
      await loadNotifications();
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao limpar histórico.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleClearReceipts() {
    if (!window.confirm('Arquivar as confirmações já lidas? Registros ainda não lidos e fixados serão preservados.')) return;
    setSaving(true);
    setError('');
    try {
      const count = await clearNotificationReceiptHistory();
      setPushSuccess(`${count} confirmação(ões) arquivada(s).`);
      await loadNotifications();
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao limpar confirmações.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleEnablePush() {
    setPushLoading(true);
    setError('');
    setPushSuccess('');

    try {
      await subscribeToPushNotifications();
      await loadPushStatus();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao ativar notificações push.'));
    } finally {
      setPushLoading(false);
    }
  }

  async function handleDisablePush() {
    setPushLoading(true);
    setError('');
    setPushSuccess('');

    try {
      await unsubscribeFromPushNotifications();
      await loadPushStatus();
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao desativar notificações push.'));
    } finally {
      setPushLoading(false);
    }
  }

  async function handleTestPush() {
    setPushLoading(true);
    setError('');
    setPushSuccess('');

    try {
      await sendMyPushTest();
      setPushSuccess('Teste agendado. A notificação deve chegar em até 1 minuto.');
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Erro ao testar notificações push.'));
    } finally {
      setPushLoading(false);
    }
  }

  return (
    <div className="notifications-page">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Chamados e atualizações</p>
          <h2>Notificações</h2>
          <p className="muted">
            Acompanhe aprovações, honra, avisos, escala e atualizações importantes.
          </p>
        </div>

        <div className="header-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={loadNotifications}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Atualizar
          </button>

          <button
            className="primary-button"
            type="button"
            onClick={handleMarkAll}
            disabled={saving || unreadCount === 0}
          >
            <CheckCircle size={16} />
            Marcar lidas
          </button>

          <button className="secondary-button" type="button" onClick={handleClearHistory} disabled={saving}>
            <Trash2 size={16} /> Limpar histórico
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {pushSuccess && <div className="alert success" role="status">{pushSuccess}</div>}

      <section className="panel wide notifications-summary">
        <div className="notification-big-icon">
          <Bell size={26} />
        </div>
        <div>
          <h3>{unreadCount} não lida{unreadCount === 1 ? '' : 's'}</h3>
          <p className="muted">
            As notificações ajudam a equipe a não perder alterações importantes.
          </p>
        </div>
      </section>

      <section className="panel wide push-panel">
        <div className="notification-big-icon">
          <Smartphone size={26} />
        </div>
        <div className="push-panel-content">
          <h3>Notificação push no celular</h3>
          <p className="muted">
            Receba avisos fora do app, inclusive com o celular bloqueado, quando houver internet.
          </p>
          <p className="muted push-status-text">
            {pushStatus ? formatPushStatus(pushStatus) : 'Verificando compatibilidade...'}
          </p>
        </div>
        <div className="push-panel-actions">
          {pushStatus?.state === 'subscribed' ? (
            <>
              <button
                type="button"
                className="primary-button"
                onClick={handleTestPush}
                disabled={pushLoading}
              >
                <BellRing size={16} />
                {pushLoading ? 'Enviando...' : 'Enviar teste'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleDisablePush}
                disabled={pushLoading}
              >
                <XCircle size={16} />
                Desativar
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={handleEnablePush}
              disabled={pushLoading || pushStatus?.state === 'unsupported' || pushStatus?.state === 'missing-public-key' || pushStatus?.state === 'invalid-public-key' || pushStatus?.permission === 'denied'}
            >
              <Bell size={16} />
              {pushLoading ? 'Ativando...' : 'Ativar push'}
            </button>
          )}
        </div>
      </section>


      <section className="panel wide">
        {loading ? (
          <p className="muted">Carregando notificações...</p>
        ) : notifications.length === 0 ? (
          <div className="empty-access-requests">
            <h4>Nenhuma notificação por enquanto</h4>
            <p className="muted">Quando uma direção, aprovação, honra ou atualização importante acontecer, aparecerá aqui.</p>
          </div>
        ) : (
          <div className="notifications-list">
            {notifications.map((notification) => (
              <article
                className={`notification-card${notification.is_read ? '' : ' unread'}${notification.is_pinned ? ' pinned' : ''}`}
                key={notification.id}
              >
                <div className="notification-status-dot" />
                <div>
                  <h4>{notification.title}</h4>
                  {notification.message && <p>{notification.message}</p>}
                  <span className="muted">
                    {new Date(notification.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className="notification-card-actions">
                  <button
                    className="icon-button notification-pin-button"
                    type="button"
                    disabled={saving}
                    aria-label={notification.is_pinned ? 'Desafixar notificação' : 'Fixar notificação'}
                    title={notification.is_pinned ? 'Desafixar' : 'Fixar no topo'}
                    onClick={() => handleTogglePin(notification)}
                  >
                    {notification.is_pinned ? <PinOff size={17} /> : <Pin size={17} />}
                  </button>
                  {!notification.is_read && (
                    <button className="secondary-button" type="button" disabled={saving} onClick={() => handleMarkOne(notification.id)}>
                      Marcar lida
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {canSeeReadReceipts && (
        <section className="panel wide notification-receipts-panel">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Confirmação de leitura</p>
              <h3>Quem recebeu e leu os avisos</h3>
              <p className="muted">O horário é registrado quando o usuário marca a notificação como lida.</p>
            </div>
            <div className="notification-receipts-actions">
              <span className="notification-receipts-count"><UsersRound size={16} />{readReceipts.length} registros</span>
              <button type="button" className="secondary-button" onClick={handleClearReceipts} disabled={saving}>
                <Trash2 size={15} /> Limpar histórico
              </button>
            </div>
          </div>

          {readReceipts.length === 0 ? (
            <p className="muted">Ainda não há confirmações registradas.</p>
          ) : (
            <div className="notification-receipts-list">
              {readReceipts.map((receipt) => (
                <article className="notification-receipt-card" key={receipt.id}>
                  <div className={receipt.is_read ? 'receipt-read-state read' : 'receipt-read-state'}>
                    {receipt.is_read ? <Eye size={16} /> : <Bell size={16} />}
                  </div>
                  <div>
                    <strong>{receipt.recipient_name}</strong>
                    <span>{receipt.recipient_email}</span>
                  </div>
                  <div>
                    <strong>{receipt.title}</strong>
                    <span>{new Date(receipt.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  <div className={receipt.is_read ? 'read-receipt-badge read' : 'read-receipt-badge'}>
                    {receipt.is_read
                      ? `Lida${receipt.read_at ? ` em ${new Date(receipt.read_at).toLocaleString('pt-BR')}` : ''}`
                      : 'Ainda não lida'}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
