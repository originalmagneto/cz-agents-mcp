import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { request } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const service = process.argv[2];
assert.ok(['ares', 'cnb', 'sanctions', 'isir', 'adis', 'dd', 'realestate', 'eu-registry', 'realestate-ingest'].includes(service));
assert.equal(process.version, 'v22.23.4');
const dir = await mkdtemp(join(tmpdir(), 'cz-runtime-smoke-'));
let child;
try {
  // Exercise native SQLite with disposable data; never run the ingestion CLI.
  const require = createRequire(resolve(`packages/${service}/package.json`));
  const Database = require('better-sqlite3');
  const db = new Database(join(dir, 'native.db'));
  assert.equal(db.prepare('SELECT 42 AS value').get().value, 42);
  if (service === 'realestate-ingest') {
    const { ensureSchema } = await import(pathToFileURL(resolve('packages/realestate-ingest/dist/schema.js')));
    const { seedDistricts, seedPriceIndex } = await import(pathToFileURL(resolve('packages/realestate-ingest/dist/seed.js')));
    ensureSchema(db); seedDistricts(db); seedPriceIndex(db);
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n > 0);
    db.close();
    console.log(JSON.stringify({ service, node: process.version, nativeSqlite: 'passed', syntheticSchema: 'passed', ingestionExecuted: false }));
  } else {
    db.close();
    child = spawn(process.execPath, [`packages/${service}/dist/http.js`], {
      env: { PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '', NODE_ENV: 'production',
        PORT: '3030', SANDBOX_HMAC_SECRET: 'synthetic-runtime-smoke-secret-not-a-real-key', TOKEN_DB: join(dir, 'tokens.db'), SANCTIONS_DB: join(dir, 'sanctions.db'),
        REALESTATE_DB_PATH: join(dir, 'realestate.db'), GLEIF_CACHE_PATH: join(dir, 'gleif.db') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stdout.on('data', c => { logs += c; }); child.stderr.on('data', c => { logs += c; });
    const call = (path, body, session) => new Promise((resolve, reject) => {
      const req = request({hostname:'127.0.0.1',port:3030,path,method:body ? 'POST' : 'GET',timeout:2000,
        headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...(session ? {'mcp-session-id':session} : {})}}, res => {
        let text=''; res.on('data', c => {text+=c;});res.on('end',()=>resolve({status:res.statusCode,body:text,session:res.headers['mcp-session-id']}));
      });req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('timeout')));req.end(body ? JSON.stringify(body) : undefined);
    });
    let health;
    for(let n=0;n<50;n++) {if(child.exitCode!==null)throw Error(logs);try{health=await call('/health');if(health.status===200)break;}catch{}await delay(100);}
    assert.equal(health?.status,200,logs);
    const init=await call('/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'synthetic-runtime-smoke',version:'1'}}});
    assert.equal(init.status,200,init.body);assert.match(init.body,/protocolVersion/);
    const listed=await call('/mcp',{jsonrpc:'2.0',id:2,method:'tools/list'},init.session);
    assert.equal(listed.status,200,listed.body);assert.match(listed.body,/"tools"/);
    console.log(JSON.stringify({service,node:process.version,nativeSqlite:'passed',health:health.status,initialize:init.status,toolsList:listed.status}));
  }
} finally {
  if(child && child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);await done;clearTimeout(timer);}
  await rm(dir,{recursive:true,force:true});
}
