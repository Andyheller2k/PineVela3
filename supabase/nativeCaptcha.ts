import crypto from 'node:crypto';
import type { Express } from 'express';
import { publicCaptchaConfig } from './authProtection.js';

export const nativeCaptchaPath = '/api/auth/mobile/captcha';
const parentOrigin = 'https://localhost';

/** Public, unprivileged widget document. The existing provider still verifies
 * every proof. Hosting this document on PineVela keeps Turnstile's configured
 * production hostname while the bundled app and its private API jar stay local. */
export function installNativeCaptcha(app: Express) {
  app.get(nativeCaptchaPath, (req, res, next) => {
    try {
      if (Object.keys(req.query).length) return res.status(400).json({ error: 'Open security verification from the app.' });
      const config = publicCaptchaConfig();
      const nonce = crypto.randomBytes(24).toString('base64');
      res.set({
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': [
          "default-src 'none'", `script-src 'nonce-${nonce}' https://challenges.cloudflare.com`,
          `style-src 'nonce-${nonce}'`, "style-src-attr 'unsafe-inline'", "frame-src https://challenges.cloudflare.com about:",
          "connect-src 'self' https://challenges.cloudflare.com", "img-src https://challenges.cloudflare.com data:",
          "base-uri 'none'", "form-action 'none'", `frame-ancestors ${parentOrigin}`,
        ].join('; '),
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      });
      // X-Frame-Options cannot express this exact cross-origin parent. This route
      // responds before the unrelated public-page DENY middleware is reached.
      res.removeHeader('X-Frame-Options');
      return res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Security verification</title><style nonce="${nonce}">html,body{margin:0;width:100%;background:transparent;overflow:hidden}#captcha{display:flex;justify-content:center;min-height:70px}</style></head><body><div id="captcha" aria-label="Security verification"></div><script nonce="${nonce}">
(()=>{'use strict';
const parentOrigin=${JSON.stringify(parentOrigin)},siteKey=${JSON.stringify(config.enabled ? config.siteKey : null)},nonce=${JSON.stringify(nonce)};
let initialized=false,alive=true,settled=false,channel='',widget,api;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const validToken=value=>typeof value==='string'&&value.length<=2048&&!/[\\u0000-\\u0020\\u007f]/.test(value);
const send=(type,token='')=>{if(!alive||settled||!channel)return;settled=true;parent.postMessage({type,channel,token},parentOrigin);};
const failure=()=>send('pinevela:captcha:error');
function initialize(event){
 if(initialized||event.source!==parent||event.origin!==parentOrigin)return;
 const value=event.data;
 if(!exact(value,['type','channel','action','theme'])||value.type!=='pinevela:captcha:init'
  ||typeof value.channel!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(value.channel)
  ||typeof value.action!=='string'||! /^[A-Za-z0-9_-]{1,32}$/.test(value.action)
  ||!['light','dark'].includes(value.theme))return;
 initialized=true;channel=value.channel;document.documentElement.style.colorScheme=value.theme;
 if(!siteKey){failure();return;}
 const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.nonce=nonce;
 script.onerror=failure;
 script.onload=()=>{
  if(!alive||settled)return;api=window.turnstile;if(!api){failure();return;}
  try{widget=api.render(document.getElementById('captcha'),{
   sitekey:siteKey,action:value.action,theme:value.theme,size:document.documentElement.clientWidth<300?'compact':'flexible',
   appearance:'interaction-only','response-field':false,retry:'never','refresh-expired':'manual','refresh-timeout':'manual',
   callback:token=>{if(validToken(token)&&token)send('pinevela:captcha:complete',token);else failure();},
   'expired-callback':()=>send('pinevela:captcha:complete'),
   'timeout-callback':()=>send('pinevela:captcha:complete'),
   'error-callback':()=>{failure();return true;}
  });}catch{failure();}
 };
 document.head.appendChild(script);
}
window.addEventListener('message',initialize);
window.addEventListener('pagehide',()=>{alive=false;window.removeEventListener('message',initialize);if(widget!==undefined){try{api.remove(widget);}catch{}}},{once:true});
})();
</script></body></html>`);
    } catch (error) { next(error); }
  });
}
