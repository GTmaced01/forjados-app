import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

type StorageObject = {
  bucket: string;
  path: string;
};

type PreparationResult = {
  receipt_id?: string;
  storage_objects?: StorageObject[];
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function safeFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 120) || 'unknown';
}

async function removeOwnedObjects(
  adminClient: ReturnType<typeof createClient>,
  objects: StorageObject[],
) {
  const byBucket = new Map<string, string[]>();

  for (const object of objects) {
    if (!object?.bucket || !object?.path) continue;
    const paths = byBucket.get(object.bucket) || [];
    paths.push(object.path);
    byBucket.set(object.bucket, paths);
  }

  for (const [bucket, paths] of byBucket.entries()) {
    const uniquePaths = [...new Set(paths)];

    for (let index = 0; index < uniquePaths.length; index += 1000) {
      const chunk = uniquePaths.slice(index, index + 1000);
      const { error } = await adminClient.storage.from(bucket).remove(chunk);
      if (error) throw new Error(`storage_${bucket}_${error.message}`);
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ error: 'Serviço de exclusão indisponível.' }, 503);
  }

  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Faça login novamente para excluir sua conta.' }, 401);
  }

  let receiptId = '';
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.confirmation !== 'EXCLUIR') {
      return jsonResponse({ error: 'Confirmação inválida.' }, 400);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    const user = userData.user;

    if (userError || !user) {
      return jsonResponse({ error: 'Sua sessão expirou. Entre novamente antes de excluir a conta.' }, 401);
    }

    const { data: preparedData, error: prepareError } = await adminClient.rpc(
      'forjados_prepare_account_deletion_v1',
      { p_user_id: user.id },
    );

    if (prepareError) throw new Error(`prepare_${prepareError.message}`);

    const prepared = (preparedData || {}) as PreparationResult;
    receiptId = prepared.receipt_id || '';

    if (!receiptId) throw new Error('prepare_missing_receipt');

    await removeOwnedObjects(adminClient, prepared.storage_objects || []);

    const { error: scrubError } = await adminClient.rpc(
      'forjados_scrub_account_references_v1',
      { p_user_id: user.id },
    );

    if (scrubError) throw new Error(`scrub_${scrubError.message}`);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw new Error(`auth_${deleteError.message}`);

    const { error: finishError } = await adminClient.rpc(
      'forjados_finish_account_deletion_v1',
      { p_receipt_id: receiptId, p_success: true, p_failure_code: null },
    );

    if (finishError) {
      console.error('Conta excluída, mas o comprovante técnico não foi finalizado.', finishError);
    }

    return jsonResponse({
      deleted: true,
      receiptId,
      message: 'Sua conta e seus dados pessoais foram excluídos.',
    });
  } catch (error) {
    const failureCode = safeFailureCode(error);
    console.error('Falha na exclusão de conta:', failureCode);

    if (receiptId) {
      await adminClient.rpc('forjados_finish_account_deletion_v1', {
        p_receipt_id: receiptId,
        p_success: false,
        p_failure_code: failureCode,
      });
    }

    return jsonResponse({
      error: 'Não foi possível concluir a exclusão agora. Nenhuma senha foi armazenada. Tente novamente ou contate o suporte.',
      receiptId: receiptId || undefined,
    }, 500);
  }
});
