import { createClient } from 'npm:@supabase/supabase-js@2.110.2';
import webpush from 'npm:web-push@3.6.7';

type QueueRow = {
  id: string;
  user_id: string;
  payload: Record<string, unknown>;
  attempts: number;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:forjados.ofc@gmail.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function timingSafeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }

  return diff === 0;
}

async function authorizeCron(request: Request) {
  const suppliedSecret = request.headers.get('x-forjados-cron-secret') || '';
  if (!suppliedSecret) return false;

  const { data, error } = await supabase
    .from('internal_runtime_secrets')
    .select('secret_value')
    .eq('secret_name', 'push_cron')
    .maybeSingle();

  if (error) {
    console.error('Não foi possível carregar a credencial interna do cron:', error.message);
    throw new Error('Credencial interna indisponível.');
  }

  const expectedSecret = data?.secret_value || '';
  return Boolean(expectedSecret) && timingSafeEqual(suppliedSecret, expectedSecret);
}

async function markQueue(
  id: string,
  desiredStatus: 'sent' | 'failed' | 'skipped',
  attempts: number,
  lastError?: string
) {
  const nextAttempts = attempts + 1;
  const status = desiredStatus === 'failed' && nextAttempts < 5 ? 'queued' : desiredStatus;

  const { error } = await supabase
    .from('push_notification_queue')
    .update({
      status,
      attempts: nextAttempts,
      last_error: lastError?.slice(0, 1000) || null,
      sent_at: desiredStatus === 'sent' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error(`Falha ao atualizar item ${id} da fila:`, error.message);
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método não permitido.' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'Supabase não configurado na Edge Function.' }, 500);
  }

  try {
    if (!(await authorizeCron(request))) {
      return jsonResponse({ ok: false, error: 'Não autorizado.' }, 401);
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: 'Falha de autenticação interna.' }, 500);
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ ok: false, error: 'Chaves VAPID não configuradas.' }, 500);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const { data: queue, error: queueError } = await supabase.rpc(
    'forjados_claim_push_queue',
    { p_limit: 60 }
  );

  if (queueError) {
    console.error('Falha ao reservar fila de push:', queueError.message);
    return jsonResponse({ ok: false, error: 'Não foi possível reservar a fila.' }, 500);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of (queue || []) as QueueRow[]) {
    try {
      const { data: subscriptions, error: subError } = await supabase
        .from('web_push_subscriptions')
        .select('id,endpoint,p256dh,auth')
        .eq('user_id', item.user_id)
        .eq('is_active', true);

      if (subError) {
        failed += 1;
        await markQueue(item.id, 'failed', item.attempts, subError.message);
        continue;
      }

      if (!subscriptions || subscriptions.length === 0) {
        skipped += 1;
        await markQueue(
          item.id,
          'skipped',
          item.attempts,
          'Usuário sem inscrição push ativa.'
        );
        continue;
      }

      let successForItem = 0;
      const errors: string[] = [];

      for (const sub of subscriptions as SubscriptionRow[]) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(item.payload)
          );
          successForItem += 1;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          const message = error instanceof Error ? error.message : String(error);
          errors.push(message);

          if (statusCode === 404 || statusCode === 410) {
            const { error: disableError } = await supabase
              .from('web_push_subscriptions')
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq('id', sub.id);

            if (disableError) {
              console.warn('Não foi possível desativar assinatura inválida:', disableError.message);
            }
          }
        }
      }

      if (successForItem > 0) {
        sent += 1;
        await markQueue(item.id, 'sent', item.attempts);
      } else {
        failed += 1;
        await markQueue(
          item.id,
          'failed',
          item.attempts,
          errors.slice(0, 3).join(' | ') || 'Falha ao enviar push.'
        );
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Falha inesperada no item ${item.id}:`, message);
      await markQueue(item.id, 'failed', item.attempts, message);
    }
  }

  return jsonResponse({
    ok: true,
    processed: queue?.length || 0,
    sent,
    failed,
    skipped,
  });
});
