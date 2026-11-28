import http from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createUnit,validateUnit,priceQuote,quoteEstimate,artworkPricing} from '../public/photo-booth-quote/model.js';
const root=resolve(process.env.STATIC_ROOT || 'public/photo-booth-quote');
const data=process.env.DATA_DIR || '/data';
await mkdir(data,{recursive:true});
const db=new DatabaseSync(resolve(data,'quotes.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, draft_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, payload TEXT NOT NULL);
`);
const digest=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a), y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);};
const limits=new Map();
function throttle(key,max,window=600000){
 const now=Date.now(),old=limits.get(key);if(!old||now>old.until){limits.set(key,{count:1,until:now+window});return false;}
 return ++old.count>max;
}
setInterval(()=>{const now=Date.now();for(const [key,value] of limits)if(now>value.until)limits.delete(key);db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);},60000).unref();
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value));}
async function body(req){let value='';for await(const part of req){value+=part;if(Buffer.byteLength(value)>131072)throw new Error('Request too large');}return JSON.parse(value);}
function authorized(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('b3quote_session='))?.slice(16);return token && db.prepare('SELECT hash FROM sessions WHERE hash=? AND expires>?').get(digest(token),Date.now());}
function ownerExists(){return Boolean(db.prepare('SELECT id FROM owner WHERE id=1').get());}
const secure=process.env.NODE_ENV!=='test';
const cookie=token=>'b3quote_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'+(secure?'; Secure':'');
function login(res){const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES (?,?)').run(digest(token),Date.now()+43200000);json(res,200,{ok:true},{'Set-Cookie':cookie(token)});}
function snapshot(input){
 if(!Array.isArray(input.units)||!input.units.length||input.units.length>30)throw new Error('Choose between 1 and 30 booths');
 const units=input.units.map((raw,index)=>{
  const unit=createUnit(raw.type,'booth-'+(index+1));
  for(const key of Object.keys(unit))if(key!=='id' && Object.hasOwn(raw,key)){
   const val=raw[key];
   if(key==='addons')unit[key]=Array.isArray(val)?[...new Set(val.filter(x=>typeof x==='string'))]:[];
   else if(['string','number','boolean'].includes(typeof val))unit[key]=typeof val==='string'?val.slice(0,600):val;
  }
  if(Object.keys(validateUnit(unit)).length)throw new Error('Complete your booth details before saving');
  return unit;
 });
 const artworkCount=artworkPricing(input.artworkCount).count;
 const quote=priceQuote(units,undefined,artworkCount),estimate=quoteEstimate(units,undefined,artworkCount);
 const name=typeof input.name==='string'?input.name.trim().slice(0,160):'';
 const email=typeof input.email==='string'?input.email.trim().slice(0,200):'';
 return {units,artworkCount,quote,estimate,name,email};
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 const url=new URL(req.url,'http://localhost');
 const path=url.pathname;
 try{
  if(path.startsWith('/api/')){
   if(req.method!=='GET' && req.headers.origin && req.headers.origin!==(process.env.PUBLIC_ORIGIN||'https://b3yond-quote-studio.up.railway.app'))return json(res,403,{error:'Access denied'});
   const ip=req.headers['x-forwarded-for']?.split(',')[0]?.trim()||req.socket.remoteAddress;
   if(req.method==='GET'&&path==='/api/owner')return json(res,200,{authenticated:Boolean(authorized(req)),setupRequired:!ownerExists()});
   if(req.method==='POST'&&['/api/setup','/api/login'].includes(path)){
    if(throttle('login:'+ip,10))return json(res,429,{error:'Please try again in ten minutes'});
    const input=await body(req);
    if(path==='/api/setup'){
     if(ownerExists())return json(res,403,{error:'Owner account already configured'});
     if(!process.env.OWNER_SETUP_TOKEN||!equal(String(input.token||''),process.env.OWNER_SETUP_TOKEN))return json(res,403,{error:'Invalid setup link'});
     if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)return json(res,400,{error:'Use a password of 12 to 128 characters'});
     const salt=randomBytes(32).toString('hex'),hash=scryptSync(input.password,salt,64).toString('hex');
     db.prepare('INSERT INTO owner VALUES (1,?,?)').run(salt,hash);login(res);return;
    }
    const owner=db.prepare('SELECT salt,hash FROM owner WHERE id=1').get();
    if(!owner||typeof input.password!=='string'||input.password.length>128||!equal(scryptSync(input.password,owner.salt,64).toString('hex'),owner.hash))return json(res,401,{error:'Incorrect password'});
    login(res);return;
   }
   if(req.method==='POST'&&path==='/api/quotes'){
    if(throttle('write:'+ip,60))return json(res,429,{error:'Too many saves. Please try again shortly'});
    const input=await body(req);
    if(typeof input.draftKey!=='string'||! /^[a-f0-9-]{36,128}$/i.test(input.draftKey))return json(res,400,{error:'Invalid draft'});
    const saved=snapshot(input),key=digest(input.draftKey),now=new Date().toISOString();
    const previous=db.prepare('SELECT id,created_at FROM quotes WHERE draft_hash=?').get(key);
    const id=previous?.id||randomBytes(12).toString('hex');
    db.prepare(`INSERT INTO quotes VALUES(?,?,?,?,?,?,?) ON CONFLICT(draft_hash) DO UPDATE SET updated_at=excluded.updated_at,name=excluded.name,email=excluded.email,payload=excluded.payload`).run(id,key,previous?.created_at||now,now,saved.name,saved.email,JSON.stringify(saved));
    return json(res,200,{id,savedAt:now});
   }
   if(!authorized(req))return json(res,401,{error:'Owner sign-in required'});
   if(req.method==='POST'&&path==='/api/logout'){
    const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('b3quote_session='))?.slice(16);
    if(token)db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token));
    return json(res,200,{ok:true},{'Set-Cookie':cookie('')+'; Max-Age=0'});
   }
   if(req.method==='GET'&&path==='/api/quotes'){
    const before=url.searchParams.get('before')||'9999';
    const records=db.prepare('SELECT id,created_at,updated_at,name,email,payload FROM quotes WHERE created_at < ? ORDER BY created_at DESC LIMIT 51').all(before);
    const more=records.length>50,rows=records.slice(0,50);
    return json(res,200,{quotes:rows.map(row=>{const p=JSON.parse(row.payload);return {id:row.id,createdAt:row.created_at,updatedAt:row.updated_at,name:row.name,email:row.email,total:p.quote.total??p.estimate.amount,pending:p.quote.total===null,venue:p.units.map(u=>u.venue).join(' · '),date:p.units[0]?.startDate,booths:p.units.length};}),next:more?rows.at(-1).created_at:null});
   }
   if(req.method==='GET'&& /^\/api\/quotes\/[a-f0-9]{24}$/.test(path)){
    const row=db.prepare('SELECT id,created_at,updated_at,payload FROM quotes WHERE id=?').get(path.split('/').at(-1));
    return row?json(res,200,{id:row.id,createdAt:row.created_at,updatedAt:row.updated_at,...JSON.parse(row.payload)}):json(res,404,{error:'Quotation not found'});
   }
   return json(res,404,{error:'Not found'});
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  let file=path==='/admin'||path==='/admin/'?'admin.html':path==='/'?'index.html':decodeURIComponent(path).replace(/^\/+/, '');
  const target=resolve(root,file);
  if(!target.startsWith(root+'/')){res.writeHead(404);res.end();return;}
  const bytes=await readFile(target);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':file==='admin.html'||file.endsWith('.js')||file.endsWith('.html')?'no-store':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){json(res,error.code==='ENOENT'?404:400,{error:error.code==='ENOENT'?'Not found':path.startsWith('/api/')?error.message:'Unable to load page'});}
});
server.listen(Number(process.env.PORT)||8080,'0.0.0.0');
