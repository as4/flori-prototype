// Cloudflare Pages Function — vends the project's InWorld + Gemini keys to
// the home page after a shared-password unlock. Streamed audio / LLM calls
// still go browser → upstream directly, so this endpoint only runs once
// per browser per unlock and never sees per-turn traffic.
//
// The incoming `password` field is XOR+base64 scrambled (matches
// `src/api/scramble.ts`) so it isn't plaintext on the wire — light
// obfuscation only, not security.

////////////////////////////////////////////////////////////////////////////////

const SCRAMBLE_KEY = 0x42;

////////////////////////////////////////////////////////////////////////////////

type Env = {
  FLORI_PASSWORD: string;
  INWORLD_API_KEY: string;
  GOOGLE_AI_KEY: string;
};

type Context = {
  request: Request;
  env: Env;
};

////////////////////////////////////////////////////////////////////////////////

const unscramble = (encoded: string): string => {
  const xored = atob(encoded);
  let out = '';
  for (let i = 0; i < xored.length; i++) {
    out += String.fromCharCode(xored.charCodeAt(i) ^ SCRAMBLE_KEY);
  }
  return out;
};

////////////////////////////////////////////////////////////////////////////////

export const onRequestPost = async ({request, env}: Context) => {
  let body: {password?: string};

  try {
    body = await request.json();
  } catch {
    return Response.json({error: 'Invalid request body'}, {status: 400});
  }

  if (!body.password) {
    return Response.json({error: 'Wrong access code'}, {status: 401});
  }

  let plain: string;
  try {
    plain = unscramble(body.password);
  } catch {
    return Response.json({error: 'Wrong access code'}, {status: 401});
  }

  if (plain !== env.FLORI_PASSWORD) {
    return Response.json({error: 'Wrong access code'}, {status: 401});
  }

  return Response.json({
    ttsKey: env.INWORLD_API_KEY,
    llmKey: env.GOOGLE_AI_KEY,
  });
};
