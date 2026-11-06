import crypto from 'node:crypto';
import fs from 'node:fs';
import { WorkPool } from '../resourceSecurity.js';
import { portalPin } from './portalAccess.js';
import { ApiError } from './db.js';

const workers = new WorkPool(2, 8);
type Envelope = { version: 1; salt: string; nonce: string; tag: string; ciphertext: string };
const derive = (pin: string, salt: Buffer): Promise<Buffer> => workers.run(() => new Promise((resolve, reject) =>
  crypto.scrypt(portalPin(pin), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key))));
const aad = (enrollment: string, owner: string) => Buffer.from(`pinevela:resident-pin:v1:${enrollment}:${owner}`);

/** The random native Auth credential is recoverable only with the room PIN.
 * Neither the PIN nor the native password is persisted as plaintext. */
export async function wrapResidentPassword(password: string, pin: string, enrollment: string, owner: string): Promise<Envelope> {
  const salt = crypto.randomBytes(16), nonce = crypto.randomBytes(12), key = await derive(pin, salt);
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(aad(enrollment, owner));
    const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
    return { version: 1, salt: salt.toString('hex'), nonce: nonce.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('hex') };
  } finally { key.fill(0); }
}
export async function unwrapResidentPassword(value: unknown, pin: string, enrollment: string, owner: string): Promise<string> {
  const e = value as Envelope;
  if (!e || e.version !== 1 || !/^[a-f0-9]{32}$/.test(e.salt) || !/^[a-f0-9]{24}$/.test(e.nonce) ||
      !/^[a-f0-9]{32}$/.test(e.tag) || !/^[a-f0-9]{96,512}$/.test(e.ciphertext)) throw new Error('Resident credential is unavailable.');
  const key = await derive(pin, Buffer.from(e.salt, 'hex'));
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(e.nonce, 'hex'));
    decipher.setAAD(aad(enrollment, owner)); decipher.setAuthTag(Buffer.from(e.tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(e.ciphertext, 'hex')), decipher.final()]).toString('utf8');
  } finally { key.fill(0); }
}

function recoveryKey() {
  // Domain separation permits the already-required private delivery-PIN master
  // to be reused without sharing encryption keys or adding hosting setup.
  const file=process.env.MARKET_ORDER_PIN_KEY_FILE;
  let master:Buffer|undefined;
  try{
    if(!file)throw new Error();
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.mode&0o077||stat.size!==32)throw new Error();master=fs.readFileSync(fd);}
    finally{fs.closeSync(fd);}
    return Buffer.from(crypto.hkdfSync('sha256',master,Buffer.from('pinevela:resident-auth:v1'),Buffer.from('password-recovery'),32));
  }catch{throw new ApiError(503,'Room PIN security is temporarily unavailable. Ask an administrator to check the private PIN key.');}
  finally{master?.fill(0);}
}
type RecoveryEnvelope={version:1;keyId:string;nonce:string;tag:string;ciphertext:string};
export function recoverableResidentPassword(password:string,enrollment:string,owner:string):RecoveryEnvelope {
  const key=recoveryKey(),nonce=crypto.randomBytes(12);
  try{
    const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.concat([aad(enrollment,owner),Buffer.from(':recovery')]));
    const encrypted=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
    return {version:1,keyId:crypto.createHash('sha256').update(key).digest('hex').slice(0,16),nonce:nonce.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:encrypted.toString('hex')};
  }finally{key.fill(0);}
}
/** Used only after a live primary-owner authorization, never a public lookup. */
export function recoverResidentPassword(value:unknown,enrollment:string,owner:string):string {
  const key=recoveryKey(),e=value as RecoveryEnvelope;
  try{
    if(!e||e.version!==1||e.keyId!==crypto.createHash('sha256').update(key).digest('hex').slice(0,16)||
      !/^[a-f0-9]{24}$/.test(e.nonce)||!/^[a-f0-9]{32}$/.test(e.tag)||!/^[a-f0-9]{96,512}$/.test(e.ciphertext))throw new Error();
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(e.nonce,'hex'));
    decipher.setAAD(Buffer.concat([aad(enrollment,owner),Buffer.from(':recovery')]));decipher.setAuthTag(Buffer.from(e.tag,'hex'));
    return Buffer.concat([decipher.update(Buffer.from(e.ciphertext,'hex')),decipher.final()]).toString('utf8');
  }catch{throw new ApiError(503,'Room PIN recovery is temporarily unavailable. Ask an administrator to check the private PIN key.');}
  finally{key.fill(0);}
}
