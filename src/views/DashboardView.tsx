import { useEffect, useState } from "react";
import {
  CheckCircle,
  Home,
  Menu,
  MoreHorizontal,
  Megaphone,
  RefreshCw,
  Shirt,
  Star,
  X,
  XCircle,
} from "lucide-react";
import { signOut } from "../services/auth";
import { useAuth } from "../components/AuthProvider";
import { STATUS_LABELS, ROLE_LABELS } from "../constants";
import { AdminPanelView } from "./AdminPanelView";
import { ProfileView } from "./ProfileView";
import { InscriptionView } from "./InscriptionView";
import { TreasuryView } from "./TreasuryView";
import { ShirtsView } from "./ShirtsView";
import { ManageShirtsView } from "./ManageShirtsView";
import { RidesView } from "./RidesView";
import { PointsView } from "./PointsView";
import { ManagePointsView } from "./ManagePointsView";
import { PointsStoreView } from "./PointsStoreView";
import { ManagePointsStoreView } from "./ManagePointsStoreView";
import { ServiceScaleView } from "./ServiceScaleView";
import { LeaderTeamView } from "./LeaderTeamView";
import { PublicPanelView } from "./PublicPanelView";
import { ManagePublicPanelView } from "./ManagePublicPanelView";
import { LegalDocumentsView } from "./LegalDocumentsView";
import {
  listPendingAccessRequests,
  updateAccessRequestStatus,
} from "../services/accessRequests";
import { getErrorMessage } from "../services/safeAsync";
import {
  getAdminDashboardSummary,
  type AdminDashboardSummary,
} from "../services/adminDashboard";
import type { UserProfile } from "../types";

type Tab =
  | "home"
  | "profile"
  | "inscription"
  | "public-panel"
  | "points"
  | "points-store"
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
  | "privacy"
  | "terms"
  | "more";

export function DashboardView() {
  const { profile, isAdmin, isTreasury, isDirector, isLeader } = useAuth();
  const [tab, setTab] = useState<Tab>(() => {
    const savedTab = localStorage.getItem("forjados-active-tab") as Tab | null;
    return savedTab || "home";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [pendingRequests, setPendingRequests] = useState<UserProfile[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [homeError, setHomeError] = useState("");
  const [homeSuccess, setHomeSuccess] = useState("");
  const [dashboardSummary, setDashboardSummary] =
    useState<AdminDashboardSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const canManageShirts = isAdmin || isDirector;
  const canManagePoints = isAdmin || isDirector || isLeader;
  const canManagePointsStore = isAdmin || isDirector;
  const canManagePublicPanel = isAdmin || isDirector;
  const canManageServiceScale = isAdmin || isDirector;
  const canManageTreasury = isAdmin || isTreasury;
  const canSeeAdminPanel = isAdmin;
  const canSeeAccessRequests = isAdmin || isDirector;
  const canSeeLeaderTeam = isLeader || isDirector || isAdmin;

  const canSeeManagement =
    canManagePoints ||
    canManageShirts ||
    canManagePointsStore ||
    canManagePublicPanel ||
    canManageServiceScale ||
    canManageTreasury ||
    canSeeAdminPanel;

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
    localStorage.setItem("forjados-active-tab", tab);
  }, [tab]);

  useEffect(() => {
    const canAccessTab =
      tab === "home" ||
      tab === "profile" ||
      tab === "inscription" ||
      tab === "public-panel" ||
      tab === "points" ||
      tab === "points-store" ||
      tab === "rides" ||
      tab === "shirts" ||
      tab === "privacy" ||
      tab === "terms" ||
      tab === "more" ||
      (tab === "leader-team" && canSeeLeaderTeam) ||
      (tab === "manage-points" && canManagePoints) ||
      (tab === "manage-shirts" && canManageShirts) ||
      (tab === "manage-points-store" && canManagePointsStore) ||
      (tab === "manage-public-panel" && canManagePublicPanel) ||
      (tab === "service-scale" && canManageServiceScale) ||
      (tab === "treasury" && canManageTreasury) ||
      (tab === "admin" && canSeeAdminPanel);

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
  ]);

  if (!profile) return null;

  const currentProfile = profile;

  function selectTab(nextTab: Tab) {
    localStorage.setItem("forjados-active-tab", nextTab);
    setTab(nextTab);
    setMobileMenuOpen(false);
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
      localStorage.removeItem("forjados-active-tab");
      window.location.href = "/";
    }
  }

  function renderHome() {
    return (
      <>
        <header className="hero">
          <div>
            <p className="eyebrow">Bem-vindo</p>
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

        {canSeeAccessRequests && (
          <section className="admin-home-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Centro de comando</p>
                <h3>Resumo rápido</h3>
                <p className="muted">
                  Atalhos e pendências principais para admin e diretoria.
                </p>
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
                Atualizar resumo
              </button>
            </div>

            <div className="admin-quick-grid">
              <button
                type="button"
                className="quick-card"
                onClick={() => selectTab("home")}
              >
                <span>Solicitações</span>
                <strong>
                  {pendingRequests.length ||
                    dashboardSummary?.pending_access_requests ||
                    0}
                </strong>
                <small>Pendentes</small>
              </button>
              <button
                type="button"
                className="quick-card"
                onClick={() => selectTab("treasury")}
                disabled={!canManageTreasury}
              >
                <span>Comprovantes</span>
                <strong>
                  {dashboardSummary?.pending_payment_receipts || 0}
                </strong>
                <small>Aguardando análise</small>
              </button>
              <button
                type="button"
                className="quick-card"
                onClick={() => selectTab("manage-shirts")}
                disabled={!canManageShirts}
              >
                <span>Camisas</span>
                <strong>{dashboardSummary?.pending_shirt_orders || 0}</strong>
                <small>Pedidos pendentes</small>
              </button>
              <button
                type="button"
                className="quick-card"
                onClick={() => selectTab("manage-points-store")}
                disabled={!canManagePointsStore}
              >
                <span>Resgates</span>
                <strong>
                  {dashboardSummary?.pending_points_redemptions || 0}
                </strong>
                <small>Loja de pontos</small>
              </button>
            </div>

            <div className="admin-action-row">
              {canManagePublicPanel && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => selectTab("manage-public-panel")}
                >
                  Criar aviso
                </button>
              )}
              {canManagePoints && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => selectTab("manage-points")}
                >
                  Lançar pontos
                </button>
              )}
              {canManageServiceScale && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => selectTab("service-scale")}
                >
                  Ver escala
                </button>
              )}
              {canSeeAdminPanel && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => selectTab("admin")}
                >
                  Painel Admin
                </button>
              )}
            </div>
          </section>
        )}

        {canSeeAccessRequests && (
          <section className="panel wide access-requests-panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Moderação</p>
                <h3>Solicitações de acesso</h3>
                <p className="muted">
                  Novos membros que solicitaram entrada no aplicativo aparecem
                  aqui.
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
      { label: "Meu Perfil", tab: "profile" },
      { label: "Minha Inscrição", tab: "inscription" },
      { label: "Loja de Pontos", tab: "points-store" },
      {
        label: "Meus Liderados",
        tab: "leader-team",
        visible: canSeeLeaderTeam,
      },
      { label: "Caronas", tab: "rides" },
      { label: "Privacidade", tab: "privacy" },
      { label: "Termo de Responsabilidade", tab: "terms" },
    ];

    const managementItems: Array<{
      label: string;
      tab: Tab;
      visible?: boolean;
    }> = [
      {
        label: "Lançar Pontos",
        tab: "manage-points",
        visible: canManagePoints,
      },
      {
        label: "Gerenciar Camisas",
        tab: "manage-shirts",
        visible: canManageShirts,
      },
      {
        label: "Gerenciar Loja de Pontos",
        tab: "manage-points-store",
        visible: canManagePointsStore,
      },
      {
        label: "Gerenciar Painel Público",
        tab: "manage-public-panel",
        visible: canManagePublicPanel,
      },
      {
        label: "Escala de Serviço",
        tab: "service-scale",
        visible: canManageServiceScale,
      },
      { label: "Tesouraria", tab: "treasury", visible: canManageTreasury },
      { label: "Painel Admin", tab: "admin", visible: canSeeAdminPanel },
    ];

    return (
      <section className="mobile-more-page">
        <div className="admin-header mobile-more-header">
          <div>
            <p className="eyebrow">Navegação</p>
            <h2>Mais opções</h2>
            <p className="muted">
              Acesse ferramentas, perfil e áreas de gerenciamento.
            </p>
          </div>
        </div>

        <div className="mobile-more-section">
          <h3>Área do membro</h3>
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
            <h3>Gerenciamento</h3>
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
    if (tab === "profile") return <ProfileView />;
    if (tab === "inscription") return <InscriptionView />;
    if (tab === "points") return <PointsView />;
    if (tab === "points-store") return <PointsStoreView />;
    if (tab === "rides") return <RidesView />;
    if (tab === "shirts") return <ShirtsView />;
    if (tab === "privacy") return <LegalDocumentsView initialTab="privacy" />;
    if (tab === "terms") return <LegalDocumentsView initialTab="terms" />;
    if (tab === "more") return renderMore();

    return renderHome();
  }

  return (
    <div className="layout">
      <aside className={mobileMenuOpen ? "sidebar mobile-open" : "sidebar"}>
        <div className="sidebar-top">
          <div className="logo">
            <h1>FORJADOS</h1>
            <span>Equipe 2026</span>
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
              Painel Público
            </button>
            <button
              type="button"
              className={tab === "profile" ? "active" : ""}
              onClick={() => selectTab("profile")}
            >
              Meu Perfil
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
              Pontos
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
              Loja de Pontos
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
                  Lançar Pontos
                </button>
              )}
              {canManageShirts && (
                <button
                  type="button"
                  className={tab === "manage-shirts" ? "active" : ""}
                  onClick={() => selectTab("manage-shirts")}
                >
                  Gerenciar Camisas
                </button>
              )}
              {canManagePointsStore && (
                <button
                  type="button"
                  className={tab === "manage-points-store" ? "active" : ""}
                  onClick={() => selectTab("manage-points-store")}
                >
                  Gerenciar Loja de Pontos
                </button>
              )}
              {canManagePublicPanel && (
                <button
                  type="button"
                  className={tab === "manage-public-panel" ? "active" : ""}
                  onClick={() => selectTab("manage-public-panel")}
                >
                  Gerenciar Painel Público
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
          <div>
            <strong>FORJADOS</strong>
            <span>{currentProfile.primary_team || currentProfile.role}</span>
          </div>
          <button type="button" onClick={() => selectTab("more")}>
            <Menu size={18} />
            Menu
          </button>
        </div>
        {renderContent()}
      </main>

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
          <span>Pontos</span>
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
