// Tipagem intencionalmente leve: muitas respostas vêm de RPCs/queries do Supabase sem schema gerado.
// Isso evita travamentos do TypeScript e mantém os retornos tipados manualmente nas funções de serviço.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withTimeout<T = any>(
  promise: Promise<T> | PromiseLike<T>,
  timeoutMs = 10000,
  errorMessage = 'Tempo limite excedido. Tente atualizar a página.'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise]);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(errorMessage, { cause: error });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function getErrorMessage(
  error: unknown,
  fallback = 'Não foi possível carregar os dados. Tente novamente.'
) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return fallback;
}
