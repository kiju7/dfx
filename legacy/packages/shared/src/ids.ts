const ULID_TIME_LEN = 10;
const ULID_RAND_LEN = 16;
const ULID_LEN = ULID_TIME_LEN + ULID_RAND_LEN;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(now: number, len: number): string {
  let out = '';
  let t = now;
  for (let i = len - 1; i >= 0; i--) {
    out = CROCKFORD[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function encodeRandom(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CROCKFORD[Math.floor(Math.random() * 32)];
  }
  return out;
}

export function ulid(now: number = Date.now()): string {
  return encodeTime(now, ULID_TIME_LEN) + encodeRandom(ULID_RAND_LEN);
}

export function isUlid(s: string): boolean {
  if (s.length !== ULID_LEN) return false;
  for (const c of s) if (!CROCKFORD.includes(c)) return false;
  return true;
}

export function nowMs(): number {
  return Date.now();
}
