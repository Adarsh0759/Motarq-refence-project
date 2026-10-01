// VIN validation (ISO 3779 / NA check digit). O(17) time, O(1) space.
const TRANS = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
const WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/; // no I, O, Q
const val = (c) => (c >= '0' && c <= '9' ? Number(c) : TRANS[c]);

export function checkDigit(vin) {
  let s = 0;
  for (let i = 0; i < 17; i++) s += val(vin[i]) * WEIGHTS[i];
  const r = s % 11;
  return r === 10 ? 'X' : String(r);
}

export function isValidVin(v) {
  if (typeof v !== 'string') return false;
  const u = v.toUpperCase();
  return VIN_RE.test(u) && u[8] === checkDigit(u);
}

const ALPHA = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'; // 33 VIN-legal symbols
const WMIS = ['1HG', 'JHM', 'WVW', 'SAL', '5YJ', 'MA1', 'KMH', 'TMB'];

// Deterministic, unique (n < 33^5 ~ 39M) synthetic VIN with a valid check digit.
export function makeVin(n) {
  let x = n, vds = '';
  for (let i = 0; i < 5; i++) { vds = ALPHA[x % 33] + vds; x = Math.floor(x / 33); }
  const serial = String(n % 1000000).padStart(6, '0');
  const body = WMIS[n % WMIS.length] + vds + '0' + 'N' + 'A' + serial;
  return body.slice(0, 8) + checkDigit(body) + body.slice(9);
}
