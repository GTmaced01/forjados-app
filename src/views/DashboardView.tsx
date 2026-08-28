import { lazy, Suspense, useEffect, useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Gauge,
  Home,
  Menu,
  MoreHorizontal,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Star,
  Store,
  TrendingUp,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { signOut } from "../services/auth";
import { useAuth } from "../components/AuthProvider";
import {
  FORJADOS_DNA_PHRASES,
  FORJADOS_MAIN_MESSAGE,
  MODULE_DNA,
  STATUS_LABELS,
  ROLE_LABELS,
} from "../constants";
import {
  listPendingAccessRequests,
  updateAccessRequestStatus,
} from "../services/accessRequests";
import { getErrorMessage } from "../services/safeAsync";
import { countUnreadNotifications, listMyNotifications, markNotificationAsRead } from "../services/notifications";
import {
  getAdminDashboardSummary,
  type AdminDashboardSummary,
} from "../services/adminDashboard";
import { getActiveRetreatEvent, getCountdownParts } from "../services/eventSettings";
import { processDueAutomatedMessages } from "../services/automatedMessages";
import { getMyInscriptionOverview, listMyPaymentReceipts } from "../services/payments";
import { exitNativeApp, registerNativeBackHandler } from "../services/platform";
import type { AppNotification, PaymentReceipt, RetreatEventSettings, UserProfile } from "../types";
import { LegalDocumentsView } from "./LegalDocumentsView";

const AdminPanelView = lazy(() => import("./AdminPanelView").then(({ AdminPanelView }) => ({ default: AdminPanelView })));
const ProfileView = lazy(() => import("./ProfileView").then(({ ProfileView }) => ({ default: ProfileView })));
const InscriptionView = lazy(() => import("./InscriptionView").then(({ InscriptionView }) => ({ default: InscriptionView })));
const TreasuryView = lazy(() => import("./TreasuryView").then(({ TreasuryView }) => ({ default: TreasuryView })));
const ShirtsView = lazy(() => import("./ShirtsView").then(({ ShirtsView }) => ({ default: ShirtsView })));
const ManageShirtsView = lazy(() => import("./ManageShirtsView").then(({ ManageShirtsView }) => ({ default: ManageShirtsView })));
const RidesView = lazy(() => import("./RidesView").then(({ RidesView }) => ({ default: RidesView })));
const PointsView = lazy(() => import("./PointsView").then(({ PointsView }) => ({ default: PointsView })));
const ManagePointsView = lazy(() => import("./ManagePointsView").then(({ ManagePointsView }) => ({ default: ManagePointsView })));
const PointsStoreView = lazy(() => import("./PointsStoreView").then(({ PointsStoreView }) => ({ default: PointsStoreView })));
const ManagePointsStoreView = lazy(() => import("./ManagePointsStoreView").then(({ ManagePointsStoreView }) => ({ default: ManagePointsStoreView })));
const ServiceScaleView = lazy(() => import("./ServiceScaleView").then(({ ServiceScaleView }) => ({ default: ServiceScaleView })));
const LeaderTeamView = lazy(() => import("./LeaderTeamView").then(({ LeaderTeamView }) => ({ default: LeaderTeamView })));
const PublicPanelView = lazy(() => import("./PublicPanelView").then(({ PublicPanelView }) => ({ default: PublicPanelView })));
const ManagePublicPanelView = lazy(() => import("./ManagePublicPanelView").then(({ ManagePublicPanelView }) => ({ default: ManagePublicPanelView })));
const NotificationsView = lazy(() => import("./NotificationsView").then(({ NotificationsView }) => ({ default: NotificationsView })));
const AuditLogView = lazy(() => import("./AuditLogView").then(({ AuditLogView }) => ({ default: AuditLogView })));
const OfferView = lazy(() => import("./OfferView").then(({ OfferView }) => ({ default: OfferView })));
const AutomatedMessagesView = lazy(() => import("./AutomatedMessagesView").then(({ AutomatedMessagesView }) => ({ default: AutomatedMessagesView })));
const EventSettingsView = lazy(() => import("./EventSettingsView").then(({ EventSettingsView }) => ({ default: EventSettingsView })));
const EventScheduleView = lazy(() => import("./EventScheduleView").then(({ EventScheduleView }) => ({ default: EventScheduleView })));

function ModuleLoading() {
  return (
    <div className="panel wide center" role="status" aria-live="polite">
      <div className="loader"></div>
      <p className="muted">Carregando módulo...</p>
    </div>
  );
}

type Tab =
  | "home"
  | "profile"
  | "inscription"
  | "public-panel"
  | "points"
  | "notifications"
  | "points-store"
  | "offer"
  | "leader-team"
  | "rides"
  | "shirts"
  | "manage-points"
  | "manage-shirts"
  | "manage-points-store"
  | "manage-public-panel"
  | "service-scale"
  | "treasury"
  | "admin"
  | "audit-log"
  | "automated-messages"
  | "event-settings"
  | "schedule"
  | "privacy"
  | "terms"
  | "rules"
  | "more";

const VALID_TABS: Tab[] = [
  "home",
  "profile",
  "inscription",
  "public-panel",
  "points",
  "notifications",
  "points-store",
  "offer",
  "leader-team",
  "rides",
  "shirts",
  "manage-points",
  "manage-shirts",
  "manage-points-store",
  "manage-public-panel",
  "service-scale",
  "treasury",
  "admin",
  "audit-log",
  "automated-messages",
  "event-settings",
  "schedule",
  "privacy",
  "terms",
  "rules",
  "more",
];

function isValidTab(value: string | null): value is Tab {
  return Boolean(value && VALID_TABS.includes(value as Tab));
}

function formatDashboardNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.round(value || 0)));
}

function formatDashboardCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function getPercent(part: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}

function getInitialTab(): Tab {
  const urlTab = new URLSearchParams(window.location.search).get("tab");
  if (isValidTab(urlTab)) return urlTab;

  const savedTab = localStorage.getItem("forjados-active-tab");
  if (isValidTab(savedTab)) return savedTab;

  return "home";
}

export function DashboardView() {
  const { profile, isAdmin, isTreasury, isDirector, isLeader } = useAuth();
  const [tab, setTab] = useState<Tab>(getInitialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [pendingRequests, setPendingRequests] = useState<UserProfile[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [homeError, setHomeError] = useState("");
  const [homeSuccess, setHomeSuccess] = useState("");
  const [dashboardSummary, setDashboardSummary] =
    useState<AdminDashboardSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [activeEvent, setActiveEvent] = useState<RetreatEventSettings | null>(null);
  const [currentEventReceipts, setCurrentEventReceipts] = useState<PaymentReceipt[]>([]);
  const [willParticipateInActiveEdition, setWillParticipateInActiveEdition] = useState<boolean | null>(null);
  const [popupNotification, setPopupNotification] = useState<AppNotification | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const countdown = getCountdownParts(activeEvent?.start_date, nowTick);

  const canManageShirts = isAdmin || isDirector;
  const canManagePoints = isAdmin || isDirector || isLeader;
  const canManagePointsStore = isAdmin || isDirector;
  const canManagePublicPanel = isAdmin || isDirector;
  const canManageServiceScale = isAdmin || isDirector;
  const canManageTreasury = isAdmin || isTreasury;
  const canSeeAdminPanel = isAdmin;
  const canSeeAuditLog = isAdmin || isDirector;
  const canSeeAccessRequests = isAdmin || isDirector;
  const canSeeLeaderTeam = isLeader || isDirector || isAdmin;

  const canSeeManagement =
    canManagePoints ||
    canManageShirts ||
    canManagePointsStore ||
    canManagePublicPanel ||
    canManageServiceScale ||
    canManageTreasury ||
    canSeeAdminPanel ||
    canSeeAuditLog;

  async function loadPendingRequests() {
    if (!canSeeAccessRequests) return;

    setLoadingRequests(true);
    setHomeError("");

    try {
      const data = await listPendingAccessRequests();
      setPendingRequests(data);
    } catch (err) {
      console.error(err);
      setHomeError(
        getErrorMessage(err, "Erro ao carregar solicitações de acesso."),
      );
    } finally {
      setLoadingRequests(false);
    }
  }

  async function loadDashboardSummary() {
    if (!canSeeAccessRequests) return;

    setLoadingSummary(true);

    try {
      const summary = await getAdminDashboardSummary();
      setDashboardSummary(summary);
    } catch (err) {
      console.warn("Resumo do painel não carregou:", err);
    } finally {
      setLoadingSummary(false);
    }
  }

  useEffect(() => {
    if (canSeeAccessRequests) {
      loadPendingRequests();
      loadDashboardSummary();
    } else {
      setPendingRequests([]);
      setDashboardSummary(null);
    }
  }, [canSeeAccessRequests]);

  useEffect(() => {
    let active = true;

    countUnreadNotifications().then((count) => {
      if (active) setUnreadNotifications(count);
    });

    listMyNotifications()
      .then((items) => {
        if (!active) return;
        const firstUnread = items.find((item) => !item.is_read);
        if (firstUnread) setPopupNotification(firstUnread);
      })
      .catch(() => undefined);

    const interval = window.setInterval(() => {
      countUnreadNotifications().then((count) => {
        if (active) setUnreadNotifications(count);
      });
    }, 60000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [profile?.id]);

  useEffect(() => {
    getActiveRetreatEvent()
      .then(setActiveEvent)
      .catch((err) => console.warn("Evento ativo não carregou:", err));

    processDueAutomatedMessages().catch((err) =>
      console.warn("Mensagens automáticas não processadas:", err)
    );

    const interval = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    if (isAdmin || !activeEvent?.id) {
      setCurrentEventReceipts([]);
      setWillParticipateInActiveEdition(null);
      return () => { active = false; };
    }

    Promise.all([listMyPaymentReceipts(), getMyInscriptionOverview()])
      .then(([items, overview]) => {
        if (active) {
          setCurrentEventReceipts(items.filter((item) => item.edition_id === activeEvent.id));
          setWillParticipateInActiveEdition(overview.enrollment?.will_participate ?? null);
        }
      })
      .catch((err) => console.warn("Status financeiro não carregou:", err));

    return () => { active = false; };
  }, [activeEvent?.id, profile?.id, isAdmin]);

  useEffect(() => {
    void nowTick;
  }, [nowTick]);

  useEffect(() => {
    localStorage.setItem("forjados-active-tab", tab);
  }, [tab]);

  useEffect(() => {
    let disposed = false;
    let removeListener: () => void | Promise<void> = () => undefined;

    registerNativeBackHandler(() => {
      if (mobileMenuOpen) {
        setMobileMenuOpen(false);
      } else if (tab !== "home") {
        selectTab("home");
      } else {
        void exitNativeApp();
      }
    }).then((remove) => {
      if (disposed) remove();
      else removeListener = remove;
    });

    return () => {
      disposed = true;
      void removeListener();
    };
  }, [mobileMenuOpen, tab]);

  useEffect(() => {
    const canAccessTab =
      tab === "home" ||
      tab === "profile" ||
      tab === "inscription" ||
      tab === "public-panel" ||
      tab === "points" ||
      tab === "notifications" ||
      tab === "points-store" ||
      tab === "schedule" ||
      tab === "offer" ||
      tab === "rides" ||
      tab === "shirts" ||
      tab === "privacy" ||
      tab === "terms" ||
      tab === "rules" ||
      tab === "more" ||
      (tab === "leader-team" && canSeeLeaderTeam) ||
      (tab === "manage-points" && canManagePoints) ||
      (tab === "manage-shirts" && canManageShirts) ||
      (tab === "manage-points-store" && canManagePointsStore) ||
      (tab === "manage-public-panel" && canManagePublicPanel) ||
      (tab === "service-scale" && canManageServiceScale) ||
      (tab === "treasury" && canManageTreasury) ||
      (tab === "admin" && canSeeAdminPanel) ||
      (tab === "audit-log" && canSeeAuditLog) ||
      (tab === "automated-messages" && canManagePublicPanel) ||
      (tab === "event-settings" && canManagePublicPanel);

    if (!canAccessTab) {
      setTab("home");
      localStorage.setItem("forjados-active-tab", "home");
    }
  }, [
    tab,
    canSeeLeaderTeam,
    canManagePoints,
    canManageShirts,
    canManagePointsStore,
    canManagePublicPanel,
    canManageServiceScale,
    canManageTreasury,
    canSeeAdminPanel,
    canSeeAuditLog,
  ]);

  if (!profile) return null;

  const currentProfile = profile;

  function selectTab(nextTab: Tab) {
    localStorage.setItem("forjados-active-tab", nextTab);
    setTab(nextTab);
    setMobileMenuOpen(false);

    const url = new URL(window.location.href);
    if (nextTab === "home") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", nextTab);
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleAccessRequest(
    userId: string,
    status: "approved" | "rejected",
  ) {
    setRequestActionId(userId);
    setHomeError("");
    setHomeSuccess("");

    try {
      await updateAccessRequestStatus({ userId, status });
      setHomeSuccess(
        status === "approved"
          ? "Solicitação aprovada com sucesso."
          : "Solicitação recusada com sucesso.",
      );
      await loadPendingRequests();
    } catch (err) {
      console.error(err);
      setHomeError(getErrorMessage(err, "Erro ao atualizar solicitação."));
    } finally {
      setRequestActionId(null);
    }
  }

  async function handleLogout() {
    try {
      await Promise.race([
        signOut(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch (error) {
      console.error("Erro ao sair:", error);
    } finally {
      window.location.href = "/";
    }
  }

  function renderAdminDashboard() {
    const summary = dashboardSummary;
    const totalMembers =
      summary?.total_members ||
      (summary?.approved_members || 0) +
        (summary?.pending_members || 0) +
        (summary?.rejected_members || 0);
    const approvedMembers = summary?.approved_members || 0;
    const pendingAccess = pendingRequests.length || summary?.pending_access_requests || 0;
    const pendingPayments = summary?.pending_payment_receipts || 0;
    const pendingShirts = summary?.pending_shirt_orders || 0;
    const pendingRedemptions = summary?.pending_points_redemptions || 0;
    const pendingOffers = summary?.pending_offers || 0;
    const pendingCare = pendingAccess + pendingPayments + pendingShirts + pendingRedemptions + pendingOffers;
    const approvalPercent = getPercent(approvedMembers, totalMembers);
    const ministryCore =
      (summary?.leaders_count || 0) +
      (summary?.directors_count || 0) +
      (summary?.treasury_count || 0);
    const commerceReady =
      (summary?.active_shirts || 0) + (summary?.active_points_products || 0);
    const communicationPower =
      (summary?.active_public_panel_items || 0) +
      (summary?.active_automated_messages || 0);

    const kpiCards = [
      {
        label: "Participantes aprovados",
        value: formatDashboardNumber(approvedMembers),
        detail: `${approvalPercent}% da base analisada`,
        icon: <Users size={20} />,
        tab: "admin" as Tab,
        disabled: !canSeeAdminPanel,
      },
      {
        label: "Pendências críticas",
        value: formatDashboardNumber(pendingCare),
        detail: "Acessos, pagamentos, ofertas e lojas",
        icon: <Activity size={20} />,
        tab: "home" as Tab,
      },
      {
        label: "Saldo de ofertas aprovadas",
        value: formatDashboardCurrency(summary?.approved_offers_amount || 0),
        detail: `${formatDashboardNumber(summary?.approved_offers || 0)} oferta(s) aprovadas`,
        icon: <CreditCard size={20} />,
        tab: "treasury" as Tab,
        disabled: !canManageTreasury,
      },
      {
        label: "Lojas ativas",
        value: formatDashboardNumber(commerceReady),
        detail: "Camisas e produtos de honra disponíveis",
        icon: <Store size={20} />,
        tab: "manage-shirts" as Tab,
        disabled: !canManageShirts,
      },
    ];

    const actionCards = [
      {
        label: "Aprovar acessos",
        value: pendingAccess,
        description: "Novas pessoas aguardando entrada no app.",
        tab: "admin" as Tab,
        disabled: false,
      },
      {
        label: "Analisar comprovantes",
        value: pendingPayments,
        description: "Pagamentos de inscrição/camisa para validar.",
        tab: "treasury" as Tab,
        disabled: !canManageTreasury,
      },
      {
        label: "Pedidos de camisas",
        value: pendingShirts,
        description: "Pedidos aguardando produção, pagamento ou entrega.",
        tab: "manage-shirts" as Tab,
        disabled: !canManageShirts,
      },
      {
        label: "Resgates de honra",
        value: pendingRedemptions,
        description: "Itens da Loja de Honra esperando conclusão.",
        tab: "manage-points-store" as Tab,
        disabled: !canManagePointsStore,
      },
      {
        label: "Ofertas pendentes",
        value: pendingOffers,
        description: "Ofertas esperando conferência da tesouraria.",
        tab: "treasury" as Tab,
        disabled: !canManageTreasury,
      },
    ];

    const healthRows = [
      {
        label: "Base ministerial",
        value: approvedMembers,
        max: Math.max(totalMembers, approvedMembers),
        detail: `${formatDashboardNumber(totalMembers)} cadastro(s) no total`,
      },
      {
        label: "Liderança ativa",
        value: ministryCore,
        max: Math.max(approvedMembers, ministryCore, 1),
        detail: `${formatDashboardNumber(summary?.leaders_count || 0)} líder(es), ${formatDashboardNumber(summary?.directors_count || 0)} diretor(es)`,
      },
      {
        label: "Comunicação pronta",
        value: communicationPower,
        max: Math.max(communicationPower + 2, 5),
        detail: "Mural e mensagens automáticas configurados",
      },
      {
        label: "Operação em movimento",
        value: (summary?.open_rides || 0) + (summary?.published_service_schedules || 0),
        max: Math.max((summary?.open_rides || 0) + (summary?.published_service_schedules || 0) + 2, 5),
        detail: "Caronas abertas e escalas publicadas",
      },
    ];

    return (
      <section className="admin-v2-shell">
        <div className="admin-v2-hero">
          <div>
            <p className="eyebrow">FORJADOS ADMIN 2.0</p>
            <h3>Dashboard inteligente</h3>
            <p className="muted">
              Uma visão executiva do retiro para decidir rápido, cuidar melhor e manter a forja organizada.
            </p>
          </div>
          <div className="admin-v2-hero-status">
            <Gauge size={22} />
            <span>Saúde operacional</span>
            <strong>{pendingCare === 0 ? "Em ordem" : `${pendingCare} ponto(s) de atenção`}</strong>
          </div>
        </div>

        <div className="admin-v2-kpi-grid">
          {kpiCards.map((card) => (
            <button
              type="button"
              key={card.label}
              className="admin-v2-kpi-card"
              onClick={() => selectTab(card.tab)}
              disabled={card.disabled}
            >
              <span className="admin-v2-kpi-icon">{card.icon}</span>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </button>
          ))}
        </div>

        <div className="admin-v2-grid">
          <div className="admin-v2-panel admin-v2-panel-large">
            <div className="section-header compact-section-header">
              <div>
                <p className="eyebrow">Cuidado imediato</p>
                <h3>Fila de decisões</h3>
                <p className="muted">Prioridades que precisam de análise da direção.</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  loadPendingRequests();
                  loadDashboardSummary();
                }}
                disabled={loadingSummary || loadingRequests}
              >
                <RefreshCw size={16} />
                Atualizar
              </button>
            </div>

            <div className="admin-v2-action-list">
              {actionCards.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className="admin-v2-action-item"
                  onClick={() => selectTab(item.tab)}
                  disabled={item.disabled}
                >
                  <span className={item.value > 0 ? "admin-v2-dot alert" : "admin-v2-dot"} />
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </div>
                  <b>{formatDashboardNumber(item.value)}</b>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          </div>

          <div className="admin-v2-panel">
            <div className="section-header compact-section-header">
              <div>
                <p className="eyebrow">Próximo retiro</p>
                <h3>{activeEvent?.title || "FORJADOS"}</h3>
                <p className="muted">{activeEvent?.location || "Configure data e local no painel."}</p>
              </div>
            </div>
            {countdown ? (
              <div className="admin-v2-countdown-mini">
                <strong>{countdown.days}<span>dias</span></strong>
                <strong>{countdown.hours}<span>horas</span></strong>
                <strong>{countdown.minutes}<span>min</span></strong>
              </div>
            ) : (
              <div className="admin-v2-empty-state">
                <ClipboardList size={22} />
                <p>Sem contagem regressiva ativa.</p>
              </div>
            )}
            {canManagePublicPanel && (
              <button
                type="button"
                className="primary-button admin-v2-full-button"
                onClick={() => selectTab("event-settings")}
              >
                Configurar FORJADOS
              </button>
            )}
          </div>
        </div>

        <div className="admin-v2-grid admin-v2-grid-secondary">
          <div className="admin-v2-panel">
            <div className="section-header compact-section-header">
              <div>
                <p className="eyebrow">Indicadores</p>
                <h3>Mapa operacional</h3>
              </div>
              <TrendingUp size={20} />
            </div>
            <div className="admin-v2-health-list">
              {healthRows.map((row) => {
                const percent = getPercent(row.value, row.max);
                return (
                  <div className="admin-v2-health-row" key={row.label}>
                    <div>
                      <strong>{row.label}</strong>
                      <small>{row.detail}</small>
                    </div>
                    <span>{formatDashboardNumber(row.value)}</span>
                    <div className="admin-v2-progress" aria-label={`${row.label}: ${percent}%`}>
                      <i style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="admin-v2-panel">
            <div className="section-header compact-section-header">
              <div>
                <p className="eyebrow">Atalhos rápidos</p>
                <h3>Administração</h3>
              </div>
              <ShieldCheck size={20} />
            </div>
            <div className="admin-v2-shortcuts">
              {canManagePublicPanel && <button type="button" onClick={() => selectTab("manage-public-panel")}>Gerenciar Mural</button>}
              {canManagePoints && <button type="button" onClick={() => selectTab("manage-points")}>Lançar Honra</button>}
              {canManageShirts && <button type="button" onClick={() => selectTab("manage-shirts")}>Loja de Camisas</button>}
              {canManagePointsStore && <button type="button" onClick={() => selectTab("manage-points-store")}>Loja de Honra</button>}
              {canManageTreasury && <button type="button" onClick={() => selectTab("treasury")}>Tesouraria</button>}
              {canManageServiceScale && <button type="button" onClick={() => selectTab("service-scale")}>Escalas</button>}
              {canManagePublicPanel && <button type="button" onClick={() => selectTab("automated-messages")}>Mensagens</button>}
              {canSeeAuditLog && <button type="button" onClick={() => selectTab("audit-log")}>Memorial</button>}
              {canSeeAdminPanel && <button type="button" onClick={() => selectTab("admin")}>Painel Admin</button>}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderHome() {
    const currentPaymentApproved = currentEventReceipts.some((receipt) => receipt.status === "approved");

    return (
      <>
        <header className="hero">
          <div>
            <p className="eyebrow">{MODULE_DNA.home.eyebrow}</p>
            <h2>Saudações, {currentProfile.display_name}</h2>
            <p className="muted">
              Cargo: {ROLE_LABELS[currentProfile.role]} · Status:{" "}
              {STATUS_LABELS[currentProfile.inscription_status]}
            </p>
          </div>

          <div className="points-card">
            <span>Saldo de honra</span>
            <strong>{currentProfile.points} pts</strong>
          </div>
        </header>

        {!isAdmin && (
          <section className="card forjados-quote-card">
            <p className="eyebrow">Mensagem central</p>
            <h3>{FORJADOS_MAIN_MESSAGE}</h3>
            <p className="muted">
              O FORJADOS não é sobre pessoas fortes. É sobre pessoas que foram quebradas e encontraram cura em Deus.
            </p>
          </section>
        )}

        {!isAdmin && activeEvent && countdown && (
          <section className="card countdown-card">
            <div>
              <p className="eyebrow">Próximo FORJADOS</p>
              <h3>{activeEvent.title}</h3>
              <p className="muted">{activeEvent.location || 'Local a definir'}</p>
            </div>
            <div className="countdown-grid">
              <strong>{countdown.days}<span>dias</span></strong>
              <strong>{countdown.hours}<span>horas</span></strong>
              <strong>{countdown.minutes}<span>min</span></strong>
            </div>
          </section>
        )}

        {!isAdmin && activeEvent && willParticipateInActiveEdition === null && (
          <section className="card payment-pending-banner" role="status">
            <div>
              <p className="eyebrow">Confirme sua participação</p>
              <h3>Você irá participar de {activeEvent.title}?</h3>
              <p className="muted">Responda em Minha Inscrição para liberar o pagamento desta edição.</p>
            </div>
            <button type="button" className="primary-button" onClick={() => selectTab("inscription")}>Responder agora</button>
          </section>
        )}

        {!isAdmin && activeEvent && willParticipateInActiveEdition === true && !currentPaymentApproved && (
          <section className="card payment-pending-banner" role="status">
            <div>
              <p className="eyebrow">Inscrição pendente</p>
              <h3>Sua inscrição para {activeEvent.title} ainda não foi confirmada.</h3>
              <p className="muted">Envie o comprovante ou acompanhe a análise da tesouraria em Minha Inscrição.</p>
            </div>
            <button type="button" className="primary-button" onClick={() => selectTab("inscription")}>Ir para Minha Inscrição</button>
          </section>
        )}

        {!isAdmin && (
          <>
            <section className="cards">
              <div className="card">
                <h3>Status da inscrição</h3>
                <p>{STATUS_LABELS[currentProfile.inscription_status]}</p>
              </div>
              <div className="card">
                <h3>Equipe principal</h3>
                <p>
                  {currentProfile.primary_team ||
                    currentProfile.sectors?.[0] ||
                    "Não informado"}
                </p>
              </div>
              <div className="card">
                <h3>Setores</h3>
                <p>{currentProfile.sectors?.join(", ") || "Não informado"}</p>
              </div>
            </section>

            <section className="panel wide forjados-identity-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Frases que definem o movimento</p>
                  <h3>Forjados pelo fogo. Guiados pelo Espírito.</h3>
                  <p className="muted">
                    Uma pessoa forjada não é prisioneira do passado. Ela se torna testemunho da graça de Deus.
                  </p>
                </div>
              </div>
              <div className="forjados-phrase-grid">
                {FORJADOS_DNA_PHRASES.map((phrase) => (
                  <div key={phrase} className="forjados-phrase-item">
                    {phrase}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {canSeeAccessRequests && renderAdminDashboard()}

        {canSeeAccessRequests && (
          <section className="panel wide access-requests-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Entrada na jornada</p>
                <h3>Solicitações de acesso</h3>
                <p className="muted">
                  Pessoas que pediram acesso ao aplicativo aparecem aqui para análise.
                </p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={loadPendingRequests}
                disabled={loadingRequests}
              >
                <RefreshCw size={16} />
                Atualizar
              </button>
            </div>

            {homeError && <div className="alert error">{homeError}</div>}
            {homeSuccess && <div className="alert success">{homeSuccess}</div>}

            {loadingRequests ? (
              <p className="muted">Carregando solicitações...</p>
            ) : pendingRequests.length === 0 ? (
              <div className="empty-access-requests">
                <h4>Nenhuma solicitação pendente</h4>
                <p className="muted">
                  Quando alguém pedir acesso ao aplicativo, aparecerá aqui.
                </p>
              </div>
            ) : (
              <div className="access-requests-list">
                {pendingRequests.map((request) => {
                  const isSaving = requestActionId === request.id;
                  return (
                    <div className="access-request-card" key={request.id}>
                      <div className="avatar">
                        {request.display_name?.charAt(0)?.toUpperCase() || "F"}
                      </div>
                      <div className="access-request-info">
                        <h4>{request.display_name || "Sem nome informado"}</h4>
                        <p className="muted">
                          {request.email || "E-mail não informado"}
                        </p>
                        <p className="muted">
                          Cargo solicitado:{" "}
                          {ROLE_LABELS[
                            request.requested_role || request.role
                          ] || request.role}
                        </p>
                        {request.sectors && request.sectors.length > 0 && (
                          <p className="muted">
                            Setores: {request.sectors.join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="access-request-actions">
                        <button
                          className="approve-button"
                          type="button"
                          disabled={isSaving}
                          onClick={() =>
                            handleAccessRequest(request.id, "approved")
                          }
                        >
                          <CheckCircle size={16} />
                          Aprovar
                        </button>
                        <button
                          className="reject-button"
                          type="button"
                          disabled={isSaving}
                          onClick={() =>
                            handleAccessRequest(request.id, "rejected")
                          }
                        >
                          <XCircle size={16} />
                          Recusar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </>
    );
  }

  function renderMore() {
    const memberItems: Array<{ label: string; tab: Tab; visible?: boolean }> = [
      { label: "Minha Identidade", tab: "profile" },
      { label: "Minha Inscrição", tab: "inscription" },
      { label: "Cronograma", tab: "schedule" },
      { label: `Notificações${unreadNotifications > 0 ? ` (${unreadNotifications})` : ""}`, tab: "notifications" },
      { label: "Loja de Honra", tab: "points-store" },
      { label: "Fazer Oferta", tab: "offer" },
      {
        label: "Meus Liderados",
        tab: "leader-team",
        visible: canSeeLeaderTeam,
      },
      { label: "Caronas", tab: "rides" },
      { label: "Regras do Retiro", tab: "rules" },
      { label: "Privacidade", tab: "privacy" },
      { label: "Termo de Responsabilidade", tab: "terms" },
    ];

    const managementItems: Array<{
      label: string;
      tab: Tab;
      visible?: boolean;
    }> = [
      {
        label: "Lançar Honra",
        tab: "manage-points",
        visible: canManagePoints,
      },
      {
        label: "Gerenciar Loja de Camisas",
        tab: "manage-shirts",
        visible: canManageShirts,
      },
      {
        label: "Gerenciar Loja de Honra",
        tab: "manage-points-store",
        visible: canManagePointsStore,
      },
      {
        label: "Gerenciar Mural",
        tab: "manage-public-panel",
        visible: canManagePublicPanel,
      },
      {
        label: "Escala de Serviço",
        tab: "service-scale",
        visible: canManageServiceScale,
      },
      { label: "Tesouraria", tab: "treasury", visible: canManageTreasury },
      { label: "Mensagens Automáticas", tab: "automated-messages", visible: canManagePublicPanel },
      { label: "Configurar FORJADOS", tab: "event-settings", visible: canManagePublicPanel },
      { label: "Memorial do Sistema", tab: "audit-log", visible: canSeeAuditLog },
      { label: "Painel Admin", tab: "admin", visible: canSeeAdminPanel },
    ];

    return (
      <section className="mobile-more-page">
        <div className="admin-header mobile-more-header">
          <div>
            <p className="eyebrow">Mapa da jornada</p>
            <h2>Mais opções</h2>
            <p className="muted">
              Acesse sua identidade, jornada, serviço e ferramentas de liderança.
            </p>
          </div>
        </div>

        <div className="mobile-more-section">
          <h3>Jornada pessoal</h3>
          <div className="mobile-more-grid">
            {memberItems
              .filter((item) => item.visible !== false)
              .map((item) => (
                <button
                  type="button"
                  key={item.tab}
                  onClick={() => selectTab(item.tab)}
                >
                  {item.label}
                </button>
              ))}
          </div>
        </div>

        {canSeeManagement && (
          <div className="mobile-more-section">
            <h3>Direção e gerenciamento</h3>
            <div className="mobile-more-grid">
              {managementItems
                .filter((item) => item.visible !== false)
                .map((item) => (
                  <button
                    type="button"
                    key={item.tab}
                    onClick={() => selectTab(item.tab)}
                  >
                    {item.label}
                  </button>
                ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="logout mobile-more-logout"
          onClick={handleLogout}
        >
          Sair da conta
        </button>
      </section>
    );
  }

  function renderContent() {
    if (tab === "admin" && canSeeAdminPanel) return <AdminPanelView />;
    if (tab === "audit-log" && canSeeAuditLog) return <AuditLogView />;
    if (tab === "automated-messages" && canManagePublicPanel) return <AutomatedMessagesView />;
    if (tab === "event-settings" && canManagePublicPanel) return <EventSettingsView />;
    if (tab === "schedule") return <EventScheduleView />;
    if (tab === "treasury" && canManageTreasury) return <TreasuryView />;
    if (tab === "manage-points" && canManagePoints) return <ManagePointsView />;
    if (tab === "manage-shirts" && canManageShirts) return <ManageShirtsView />;
    if (tab === "manage-points-store" && canManagePointsStore)
      return <ManagePointsStoreView />;
    if (tab === "manage-public-panel" && canManagePublicPanel)
      return <ManagePublicPanelView />;
    if (tab === "service-scale" && canManageServiceScale)
      return <ServiceScaleView />;
    if (tab === "leader-team" && canSeeLeaderTeam) return <LeaderTeamView />;
    if (tab === "public-panel") return <PublicPanelView />;
    if (tab === "notifications") return <NotificationsView />;
    if (tab === "profile") return <ProfileView />;
    if (tab === "inscription") return <InscriptionView />;
    if (tab === "points") return <PointsView onOpenStore={() => selectTab("points-store")} />;
    if (tab === "points-store") return <PointsStoreView />;
    if (tab === "offer") return <OfferView />;
    if (tab === "rides") return <RidesView />;
    if (tab === "shirts") return <ShirtsView />;
    if (tab === "privacy") return <LegalDocumentsView initialTab="privacy" onBack={() => selectTab("home")} />;
    if (tab === "terms") return <LegalDocumentsView initialTab="terms" onBack={() => selectTab("home")} />;
    if (tab === "rules") return <LegalDocumentsView initialTab="rules" onBack={() => selectTab("home")} />;
    if (tab === "more") return renderMore();

    return renderHome();
  }

  return (
    <div className="layout">
      <aside className={mobileMenuOpen ? "sidebar mobile-open" : "sidebar"}>
        <div className="sidebar-top">
          <div className="logo" role="button" tabIndex={0} onClick={() => selectTab("profile")} onKeyDown={(e) => e.key === "Enter" && selectTab("profile")}>
            <img src="/logo-forjados.png" alt="FORJADOS" className="sidebar-logo-mark" />
            <div>
              <h1>FORJADOS</h1>
              <span>Equipe 2026</span>
            </div>
          </div>
          <button
            type="button"
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            <span>{mobileMenuOpen ? "Fechar" : "Menu"}</span>
          </button>
        </div>

        <nav className="sidebar-menu">
          <div className="nav-section">
            <span className="nav-section-title">Área do membro</span>
            <button
              type="button"
              className={tab === "home" ? "active" : ""}
              onClick={() => selectTab("home")}
            >
              Início
            </button>
            <button
              type="button"
              className={tab === "public-panel" ? "active" : ""}
              onClick={() => selectTab("public-panel")}
            >
              Mural da Forja
            </button>
            <button
              type="button"
              className={tab === "schedule" ? "active" : ""}
              onClick={() => selectTab("schedule")}
            >
              Cronograma
            </button>
            <button
              type="button"
              className={tab === "notifications" ? "active" : ""}
              onClick={() => selectTab("notifications")}
            >
              Notificações{unreadNotifications > 0 ? ` (${unreadNotifications})` : ""}
            </button>
            <button
              type="button"
              className={tab === "profile" ? "active" : ""}
              onClick={() => selectTab("profile")}
            >
              Minha Identidade
            </button>
            <button
              type="button"
              className={tab === "inscription" ? "active" : ""}
              onClick={() => selectTab("inscription")}
            >
              Minha Inscrição
            </button>
            <button
              type="button"
              className={tab === "points" ? "active" : ""}
              onClick={() => selectTab("points")}
            >
              Honra
            </button>
            <button
              type="button"
              className={tab === "shirts" ? "active" : ""}
              onClick={() => selectTab("shirts")}
            >
              Loja de Camisas
            </button>
            <button
              type="button"
              className={tab === "points-store" ? "active" : ""}
              onClick={() => selectTab("points-store")}
            >
              Loja de Honra
            </button>
            <button
              type="button"
              className={tab === "offer" ? "active" : ""}
              onClick={() => selectTab("offer")}
            >
              Fazer Oferta
            </button>
            {canSeeLeaderTeam && (
              <button
                type="button"
                className={tab === "leader-team" ? "active" : ""}
                onClick={() => selectTab("leader-team")}
              >
                Meus Liderados
              </button>
            )}
            <button
              type="button"
              className={tab === "rides" ? "active" : ""}
              onClick={() => selectTab("rides")}
            >
              Caronas
            </button>
            <button
              type="button"
              className={tab === "rules" ? "active" : ""}
              onClick={() => selectTab("rules")}
            >
              Regras do Retiro
            </button>
            <button
              type="button"
              className={tab === "privacy" ? "active" : ""}
              onClick={() => selectTab("privacy")}
            >
              Privacidade
            </button>
            <button
              type="button"
              className={tab === "terms" ? "active" : ""}
              onClick={() => selectTab("terms")}
            >
              Termo
            </button>
          </div>

          {canSeeManagement && (
            <div className="nav-section nav-management">
              <span className="nav-section-title">Gerenciamento</span>
              {canManagePoints && (
                <button
                  type="button"
                  className={tab === "manage-points" ? "active" : ""}
                  onClick={() => selectTab("manage-points")}
                >
                  Lançar Honra
                </button>
              )}
              {canManageShirts && (
                <button
                  type="button"
                  className={tab === "manage-shirts" ? "active" : ""}
                  onClick={() => selectTab("manage-shirts")}
                >
                  Gerenciar Loja de Camisas
                </button>
              )}
              {canManagePointsStore && (
                <button
                  type="button"
                  className={tab === "manage-points-store" ? "active" : ""}
                  onClick={() => selectTab("manage-points-store")}
                >
                  Gerenciar Loja de Honra
                </button>
              )}
              {canManagePublicPanel && (
                <button
                  type="button"
                  className={tab === "manage-public-panel" ? "active" : ""}
                  onClick={() => selectTab("manage-public-panel")}
                >
                  Gerenciar Mural da Forja
                </button>
              )}
              {canManagePublicPanel && (
                <button
                  type="button"
                  className={`secondary-button ${tab === "automated-messages" ? "active" : ""}`.trim()}
                  onClick={() => selectTab("automated-messages")}
                >
                  Mensagens Automáticas
                </button>
              )}
              {canManagePublicPanel && (
                <button
                  type="button"
                  className={`secondary-button ${tab === "event-settings" ? "active" : ""}`.trim()}
                  onClick={() => selectTab("event-settings")}
                >
                  Configurar FORJADOS
                </button>
              )}
              {canManageServiceScale && (
                <button
                  type="button"
                  className={tab === "service-scale" ? "active" : ""}
                  onClick={() => selectTab("service-scale")}
                >
                  Escala de Serviço
                </button>
              )}
              {canManageTreasury && (
                <button
                  type="button"
                  className={tab === "treasury" ? "active" : ""}
                  onClick={() => selectTab("treasury")}
                >
                  Tesouraria
                </button>
              )}
              {canSeeAuditLog && (
                <button
                  type="button"
                  className={tab === "audit-log" ? "active" : ""}
                  onClick={() => selectTab("audit-log")}
                >
                  Memorial do Sistema
                </button>
              )}
              {canSeeAdminPanel && (
                <button
                  type="button"
                  className={tab === "admin" ? "active" : ""}
                  onClick={() => selectTab("admin")}
                >
                  Painel Admin
                </button>
              )}
            </div>
          )}

          <button type="button" className="logout" onClick={handleLogout}>
            Sair
          </button>
        </nav>
      </aside>

      <main className="content">
        <div className="mobile-app-topbar">
          <div className="mobile-topbar-brand">
            <img src="/logo-forjados.png" alt="FORJADOS" className="mobile-topbar-logo" onClick={() => selectTab("profile")} />
            <div>
              <strong>FORJADOS</strong>
              <span>{currentProfile.primary_team || currentProfile.role}</span>
            </div>
          </div>
          <div className="mobile-topbar-actions">
            <button
              type="button"
              className="mobile-notification-button"
              onClick={() => selectTab("notifications")}
              aria-label="Abrir notificações"
            >
              <Bell size={18} />
              {unreadNotifications > 0 && <span>{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}
            </button>
            <button type="button" onClick={() => selectTab("more")}>
              <Menu size={18} />
              Menu
            </button>
          </div>
        </div>
        <Suspense fallback={<ModuleLoading />}>
          {renderContent()}
        </Suspense>
      </main>

      {popupNotification && (
        <div className="notification-popup">
          <strong>{popupNotification.title}</strong>
          {popupNotification.message && <p>{popupNotification.message}</p>}
          <div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                markNotificationAsRead(popupNotification.id).catch(() => undefined);
                setPopupNotification(null);
                selectTab("notifications");
              }}
            >
              Ver
            </button>
            <button className="secondary-button" type="button" onClick={() => setPopupNotification(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav" aria-label="Navegação principal">
        <button
          type="button"
          className={tab === "home" ? "active" : ""}
          onClick={() => selectTab("home")}
        >
          <Home size={19} />
          <span>Início</span>
        </button>
        <button
          type="button"
          className={tab === "public-panel" ? "active" : ""}
          onClick={() => selectTab("public-panel")}
        >
          <Megaphone size={19} />
          <span>Painel</span>
        </button>
        <button
          type="button"
          className={tab === "shirts" ? "active" : ""}
          onClick={() => selectTab("shirts")}
        >
          <Shirt size={19} />
          <span>Camisas</span>
        </button>
        <button
          type="button"
          className={tab === "points" ? "active" : ""}
          onClick={() => selectTab("points")}
        >
          <Star size={19} />
          <span>Honra</span>
        </button>
        <button
          type="button"
          className={
            ["home", "public-panel", "shirts", "points"].includes(tab)
              ? ""
              : "active"
          }
          onClick={() => selectTab("more")}
        >
          <MoreHorizontal size={19} />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  );
}
