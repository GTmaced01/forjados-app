export async function withTimeout<T>(
  promise: Promise<T>,
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
    return await Promise.race([promise, timeoutPromise]);
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
