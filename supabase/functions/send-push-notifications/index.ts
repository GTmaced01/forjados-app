import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
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
  auth: {
    persistSession: false,
  },
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function markQueue(
  id: string,
  status: 'sent' | 'failed' | 'skipped',
  attempts: number,
  lastError?: string
) {
  await supabase
    .from('push_notification_queue')
    .update({
      status,
      attempts: attempts + 1,
      last_error: lastError || null,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método não permitido.' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'Supabase não configurado na Edge Function.' }, 500);
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ ok: false, error: 'Chaves VAPID não configuradas.' }, 500);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const { data: queue, error: queueError } = await supabase
    .from('push_notification_queue')
    .select('id,user_id,payload,attempts')
    .eq('status', 'queued')
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(60);

  if (queueError) {
    return jsonResponse({ ok: false, error: queueError.message }, 500);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of (queue || []) as QueueRow[]) {
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
      await markQueue(item.id, 'skipped', item.attempts, 'Usuário sem inscrição push ativa.');
      continue;
    }

    let successForItem = 0;
    const errors: string[] = [];

    for (const sub of subscriptions as SubscriptionRow[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify(item.payload)
        );

        successForItem += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);

        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from('web_push_subscriptions')
            .update({
              is_active: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id);
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
  }

  return jsonResponse({
    ok: true,
    processed: queue?.length || 0,
    sent,
    failed,
    skipped,
  });
});
