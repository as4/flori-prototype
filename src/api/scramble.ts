// Light obfuscation for the access code: XOR with a fixed byte then
// base64. Goal is to keep the value from being plaintext in localStorage
// / the Network tab. Not security — anyone with this source can reverse
// it. The Pages Function (`functions/api/keys.ts`) inlines the matching
// unscramble step.

////////////////////////////////////////////////////////////////////////////////

const KEY = 0x42;

////////////////////////////////////////////////////////////////////////////////

const xor = (text: string): string => {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ KEY);
  }
  return out;
};

////////////////////////////////////////////////////////////////////////////////

export const scramble = (plain: string): string => btoa(xor(plain));
