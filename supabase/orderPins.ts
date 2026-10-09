import crypto from 'node:crypto';
import fs from 'node:fs';
import {ApiError} from './db.js';

/** Delivery challenges must be recoverable by their exact buyer. The encryption
 * key stays outside PostgreSQL and is backed up separately in encrypted form. */
export class OrderPins {
  readonly keyId:string;
  constructor(private key:Buffer){if(key.length!==32)throw new Error('A 32-byte delivery PIN key is required.');this.keyId=crypto.createHash('sha256').update(key).digest('hex');}
  seal(orderId:string,pin:string,version:number){const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',this.key,nonce);cipher.setAAD(Buffer.from(`${orderId}:${version}`));return {nonce,encrypted:Buffer.concat([cipher.update(pin,'utf8'),cipher.final(),cipher.getAuthTag()]),keyId:this.keyId};}
  open(orderId:string,row:any){try{if(row.key_id!==this.keyId)throw new Error();const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,row.nonce);decipher.setAAD(Buffer.from(`${orderId}:${row.version}`));decipher.setAuthTag(row.encrypted_pin.subarray(-16));const pin=Buffer.concat([decipher.update(row.encrypted_pin.subarray(0,-16)),decipher.final()]).toString('utf8');if(!/^\d{6}$/.test(pin))throw new Error();return pin;}catch{throw new ApiError(503,'Delivery PIN access is temporarily unavailable.','order_pin_unavailable');}}
}
export function loadOrderPins(){const file=process.env.MARKET_ORDER_PIN_KEY_FILE;try{if(!file)throw new Error();const stat=fs.lstatSync(file);if(!stat.isFile() || stat.mode&0o077 || stat.size!==32)throw new Error();const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{return new OrderPins(fs.readFileSync(fd));}finally{fs.closeSync(fd);}}catch{throw new ApiError(503,'Delivery PIN access is temporarily unavailable.','order_pin_unavailable');}}
