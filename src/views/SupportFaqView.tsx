import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  KeyRound,
  LifeBuoy,
  Mail,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
} from 'lucide-react';
import {
  SUPPORT_FAQ_CATEGORIES,
  SUPPORT_FAQ_ITEMS,
  filterSupportFaq,
  type SupportFaqCategory,
  type SupportFaqFilter,
} from '../content/supportFaq';

const CATEGORY_ICONS = {
  access: KeyRound,
  registration: ClipboardCheck,
  events: CalendarCheck,
  profile: UserCog,
  notifications: BellRing,
  privacy: ShieldCheck,
} satisfies Record<SupportFaqCategory, typeof CircleHelp>;

export function SupportFaqView() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SupportFaqFilter>('all');
  const filteredItems = useMemo(
    () => filterSupportFaq(SUPPORT_FAQ_ITEMS, query, category),
    [category, query],
  );

  return (
    <>
      <section className="faq-intro panel wide" aria-labelledby="faq-title">
        <div className="faq-intro-copy">
          <span className="faq-intro-icon" aria-hidden="true"><CircleHelp size={28} /></span>
          <div>
            <p className="eyebrow">Central de ajuda</p>
            <h1 id="faq-title">Como podemos ajudar?</h1>
            <p className="muted">Encontre orientações rápidas para acessar e usar o FORJADOS com segurança.</p>
          </div>
        </div>
        <label className="faq-search">
          <span>Buscar uma dúvida</span>
          <div>
            <Search size={19} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex.: senha, inscrição ou notificações"
            />
          </div>
        </label>
      </section>

      <nav className="faq-categories" aria-label="Categorias das perguntas frequentes">
        {SUPPORT_FAQ_CATEGORIES.map((option) => (
          <button
            className={category === option.id ? 'active' : ''}
            type="button"
            key={option.id}
            aria-pressed={category === option.id}
            onClick={() => setCategory(option.id)}
          >
            {option.label}
          </button>
        ))}
      </nav>

      <section className="faq-results" aria-labelledby="faq-results-title">
        <div className="faq-results-heading">
          <div>
            <p className="eyebrow">Perguntas frequentes</p>
            <h2 id="faq-results-title">Orientações passo a passo</h2>
          </div>
          <span aria-live="polite">{filteredItems.length} {filteredItems.length === 1 ? 'resposta' : 'respostas'}</span>
        </div>

        {filteredItems.length > 0 ? (
          <div className="faq-list">
            {filteredItems.map((item) => {
              const Icon = CATEGORY_ICONS[item.category];
              return (
                <details className="faq-item" key={item.id}>
                  <summary>
                    <span className={`faq-category-icon ${item.category}`} aria-hidden="true"><Icon size={20} /></span>
                    <span>
                      <strong>{item.question}</strong>
                      <small>{item.summary}</small>
                    </span>
                    <ChevronDown className="faq-chevron" size={20} aria-hidden="true" />
                  </summary>
                  <div className="faq-answer">
                    <div className="faq-answer-copy">
                      <h3>O que fazer</h3>
                      <ol>
                        {item.steps.map((step) => <li key={step}>{step}</li>)}
                      </ol>
                    </div>
                    <figure className="faq-visual-guide">
                      <figcaption>{item.visualTitle}</figcaption>
                      <div className="faq-visual-flow">
                        {item.visualSteps.map((step, index) => (
                          <div className="faq-visual-stage" key={step.label}>
                            <span>{index + 1}</span>
                            <strong>{step.label}</strong>
                            <small>{step.detail}</small>
                            {index < item.visualSteps.length - 1 && <ArrowRight className="faq-visual-arrow" size={18} aria-hidden="true" />}
                          </div>
                        ))}
                      </div>
                    </figure>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="faq-empty panel">
            <CircleHelp size={34} aria-hidden="true" />
            <h3>Nenhuma resposta encontrada</h3>
            <p>Tente outra palavra ou selecione a categoria “Todas”.</p>
            <button className="secondary-button" type="button" onClick={() => { setQuery(''); setCategory('all'); }}>
              Limpar busca
            </button>
          </div>
        )}
      </section>

      <section className="faq-contact panel wide">
        <div>
          <span className="faq-contact-icon" aria-hidden="true"><LifeBuoy size={24} /></span>
          <div>
            <p className="eyebrow">Ainda precisa de ajuda?</p>
            <h2>Fale com a equipe do FORJADOS</h2>
            <p>Informe seu nome e descreva o problema. Nunca envie senha ou código de verificação.</p>
          </div>
        </div>
        <div className="public-resource-actions">
          <a className="primary-button public-resource-link" href="mailto:forjados.ofc@gmail.com?subject=Suporte%20FORJADOS">
            <Mail size={16} />Enviar e-mail ao suporte
          </a>
          <a className="secondary-button public-resource-link" href="/excluir-conta">
            <Trash2 size={16} />Excluir conta
          </a>
        </div>
      </section>
    </>
  );
}
