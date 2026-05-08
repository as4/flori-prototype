// Client for the password-gated key vending endpoint
// (`functions/api/keys.ts`). Caller passes the *scrambled* access code (see
// `./scramble.ts`) — never plaintext — and gets back the InWorld + Gemini
// keys on success or an error string on failure.

////////////////////////////////////////////////////////////////////////////////

export type UnlockResponse =
  | {ok: true; ttsKey: string; llmKey: string}
  | {ok: false; error: string};

////////////////////////////////////////////////////////////////////////////////

export const unlockKeys = async (scrambled: string): Promise<UnlockResponse> => {
  try {
    const response = await fetch(
      '/api/keys',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password: scrambled}),
      }
    );

    if (response.ok) {
      const {ttsKey, llmKey} = await response.json() as {ttsKey: string; llmKey: string};
      return {ok: true, ttsKey, llmKey};
    }

    const data = await response.json().catch(() => null) as {error?: string} | null;
    return {ok: false, error: data?.error ?? `${response.status} ${response.statusText}`};
  } catch {
    return {ok: false, error: 'Network error'};
  }
};
