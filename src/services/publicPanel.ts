import { supabase } from './supabase';
import { withTimeout } from './safeAsync';
import type { PublicPanelItem, UserProfile } from '../types';

const TIMEOUT = 10000;
const CACHE_KEY = 'forjados_public_panel_items_v1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeRequest<T = any>(request: PromiseLike<T>, errorMessage: string): Promise<T> {
  return withTimeout(Promise.resolve(request), TIMEOUT, errorMessage);
}

function cacheItems(items: PublicPanelItem[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), items }));
  } catch (error) {
    console.warn('Não foi possível salvar painel offline:', error);
  }
}

function getCachedPublicPanelItems(): PublicPanelItem[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: PublicPanelItem[] };
    return parsed.items || [];
  } catch {
    return [];
  }
}

export async function listPublishedPublicPanelItems(): Promise<PublicPanelItem[]> {
  try {
    const { data, error } = await safeRequest(
      supabase
        .from('public_panel_items')
        .select('*')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('is_pinned', { ascending: false })
        .order('publish_at', { ascending: false }),
      'Não foi possível carregar o painel público.'
    );

    if (error) throw error;

    const items = (data || []) as PublicPanelItem[];
    cacheItems(items);
    return items;
  } catch (error) {
    const cached = getCachedPublicPanelItems();
    if (cached.length > 0) return cached;
    throw error;
  }
}

export async function listAllPublicPanelItems(): Promise<PublicPanelItem[]> {
  const { data, error } = await safeRequest(
    supabase
      .from('public_panel_items')
      .select('*')
      .is('deleted_at', null)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false }),
    'Não foi possível carregar os avisos.'
  );

  if (error) throw error;
  return (data || []) as PublicPanelItem[];
}

export async function createPublicPanelItem(params: {
  title: string;
  content: string;
  category: PublicPanelItem['category'];
  image_url?: string;
  is_active: boolean;
  is_pinned: boolean;
}) {
  const { data: userData } = await supabase.auth.getUser();

  const { error } = await safeRequest(
    supabase.from('public_panel_items').insert({
      title: params.title,
      content: params.content,
      category: params.category,
      image_url: params.image_url || '',
      is_active: params.is_active,
      is_pinned: params.is_pinned,
      created_by: userData.user?.id || null,
    }),
    'Não foi possível criar o aviso.'
  );

  if (error) throw error;
}

export async function updatePublicPanelItem(params: {
  id: string;
  title: string;
  content: string;
  category: PublicPanelItem['category'];
  image_url?: string;
  is_active: boolean;
  is_pinned: boolean;
}) {
  const { error } = await safeRequest(
    supabase
      .from('public_panel_items')
      .update({
        title: params.title,
        content: params.content,
        category: params.category,
        image_url: params.image_url || '',
        is_active: params.is_active,
        is_pinned: params.is_pinned,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id),
    'Não foi possível atualizar o aviso.'
  );

  if (error) throw error;
}

export function formatPanelCategory(category: PublicPanelItem['category']) {
  if (category === 'notice') return 'Aviso';
  if (category === 'scale') return 'Escala';
  if (category === 'info') return 'Informação';
  if (category === 'urgent') return 'Urgente';
  return category;
}


export async function listRetreatBirthdays(): Promise<UserProfile[]> {
  const { data, error } = await supabase.rpc('forjados_list_retreat_birthdays_v1');
  if (error) return [];
  return (data || []) as UserProfile[];
}
