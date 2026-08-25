import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { gameMeta, maxSymbolFor, sanitizeGame, validateCode } from '../src/game.js';

let mf;
let db;

before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'src/index.js',
    modulesRules: [{ type:'ESModule', include:['**/*.js'], fallthrough:true }],
    compatibilityDate: '2026-08-02',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB:'00000000-0000-0000-0000-000000000001' },
    bindings: { SESSION_TTL_HOURS:'168', ADMIN_PATH:'/admin', DEBUG_ERRORS:'1' },
  });
  db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql','0002_chat.sql','0003_private_threads.sql','0004_admin_insight.sql','0005_feedback.sql','0006_time_bank.sql','0007_d1_free_optimization.sql']) {
    const migration = await readFile(new URL('../migrations/'+file, import.meta.url), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
});

test('chat permissions keep lobby authenticated and game chat private to both players',async()=>{
  const unauth=await mf.dispatchFetch('http://localhost/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'chatList',roomType:'lobby'})});
  assert.equal(unauth.status,401);
  const a=await player('Chat-A'),b=await player('Chat-B'),spectator=await player('Chat-Spectator');
  const gameId=await createAndJoin(a,b,{digits:3,mode:'numbers',numColors:10,allowRepeats:false,maxAttempts:0,turnSeconds:0,revealSecrets:false,isPublic:true,secret:'123',secret2:'456'});
  const sent=await api('chatSend',{roomType:'game',gameId,body:'Bonne partie 😄'},a.token);
  assert.equal(sent.ok,true,sent.error);
  const list=await api('chatList',{roomType:'game',gameId},b.token);
  assert.equal(list.messages.some((message)=>message.body==='Bonne partie 😄'),true);
  const denied=await api('chatList',{roomType:'game',gameId},spectator.token);
  assert.equal(denied.ok,false);
  assert.match(denied.error,/privado/);
  const lobby=await api('chatSend',{roomType:'lobby',body:'Hola lobby'},spectator.token);
  assert.equal(lobby.ok,true,lobby.error);
});

test('finished-game review returns the full game only to its participants',async()=>{
  const a=await player('Review-A'),b=await player('Review-B'),outsider=await player('Review-Outsider');
  const gameId=await createAndJoin(a,b,{digits:3,mode:'numbers',numColors:10,allowRepeats:false,maxAttempts:0,turnSeconds:0,revealSecrets:true,isPublic:true,secret:'123',secret2:'456'});
  await db.prepare("UPDATE games SET status='finished',winner=?,guesses=?,updated_at=? WHERE game_id=?")
    .bind(a.username,JSON.stringify([{by:a.username,guess:'456',fijas:3,picas:0}]),new Date().toISOString(),gameId).run();

  const review=await api('historyGame',{gameId},a.token);
  assert.equal(review.ok,true,review.error);
  assert.equal(review.status,'finished');
  assert.equal(review.guesses.length,1);
  assert.equal(review.opponentSecret,'456');

  const denied=await api('historyGame',{gameId},outsider.token);
  assert.equal(denied.ok,false);
  assert.match(denied.error,/No eres jugador/);
});

test('history reports global performance, attempts and fair win highlights',async()=>{
  const playerA=await player('History-A');
  const rows=[
    ['HIST01','History-A','Rival-1','History-A',2,'','2026-01-01T00:00:00.000Z'],
    ['HIST02','Rival-2','History-A','History-A',4,'','2026-01-02T00:00:00.000Z'],
    ['HIST03','History-A','Rival-3','Rival-3',3,'','2026-01-03T00:00:00.000Z'],
    ['HIST04','Rival-4','History-A','',6,'','2026-01-04T00:00:00.000Z'],
    ['HIST05','History-A','Rival-5','History-A',0,'abandon','2026-01-05T00:00:00.000Z'],
  ];
  for(const [gameId,p1,p2,winner,attempts,reason,updatedAt] of rows){
    const guesses=Array.from({length:attempts},(_,index)=>({
      by:'History-A',guess:index===attempts-1&&winner==='History-A'?'456':'012',fijas:index===attempts-1&&winner==='History-A'?3:0,picas:0,
    }));
    await db.prepare(`INSERT INTO games
      (game_id,status,digits,p1,secret1,p2,secret2,turn,guesses,winner,created_at,updated_at,finish_reason)
      VALUES (?,'finished',3,?,'123',?,'456',0,?,?,?,?,?)`)
      .bind(gameId,p1,p2,JSON.stringify(guesses),winner,updatedAt,updatedAt,reason).run();
  }

  const result=await api('history',{},playerA.token);
  assert.equal(result.ok,true,result.error);
  assert.deepEqual(result.stats,{
    played:5,wins:3,losses:1,draws:1,winRate:60,averageWinningAttempts:3,
    currentStreak:1,bestStreak:2,bestGameId:'HIST01',hardestGameId:'HIST02',
  });
  assert.equal(result.history[0].gameId,'HIST05');
  assert.equal(result.history[0].myAttempts,0);
  assert.equal(result.history.find((game)=>game.gameId==='HIST04').myAttempts,6);
});

after(async () => { await mf?.dispose(); });

async function api(action, payload = {}, token = '') {
  const response = await mf.dispatchFetch('http://localhost/api', {
    method:'POST',
    headers:{ 'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {}) },
    body:JSON.stringify({ action, ...payload }),
  });
  assert.equal(response.status, 200, `${action} returned HTTP ${response.status}`);
  return response.json();
}

async function player(username) {
  const result = await api('loginUser', { username, pin:'2468' });
  assert.equal(result.ok, true, result.error);
  return { username:result.username, token:result.sessionToken };
}

async function createAndJoin(p1, p2, options) {
  const created = await api('createGame', { username:p1.username, country:'co', ...options }, p1.token);
  assert.equal(created.ok, true, created.error);
  const joined = await api('joinGame', { gameId:created.gameId, username:p2.username, secret:options.secret2, country:'fr' }, p2.token);
  assert.equal(joined.ok, true, joined.error);
  return created.gameId;
}

function codeFor({ digits, allowRepeats, mode, numColors }, offset = 0) {
  const symbols = maxSymbolFor(mode, numColors);
  return Array.from({ length:digits }, (_, index) => String(allowRepeats ? offset % symbols : (index + offset) % symbols)).join('');
}

test('all 1,440 valid rule combinations preserve their metadata and secrets', () => {
  let count = 0;
  for (const mode of ['numbers','colors']) {
    for (const numColors of mode === 'colors' ? [4,6,8] : [10]) {
      for (const digits of [3,4,5,6]) for (const allowRepeats of [false,true]) {
        if (!allowRepeats && digits > numColors) continue;
        for (const maxAttempts of [0,6,10]) for (const turnSeconds of [0,30,60,120]) {
          for (const isPublic of [false,true]) for (const revealSecrets of [false,true]) {
            const secret = codeFor({ mode,numColors,digits,allowRepeats });
            assert.equal(validateCode(secret,digits,allowRepeats,maxSymbolFor(mode,numColors)),null);
            const meta = gameMeta({ game_id:'TEST',p1:'A',p2:'B',digits,allow_repeats:allowRepeats?1:0,is_public:isPublic?1:0,
              mode,num_colors:numColors,max_attempts:maxAttempts,turn_seconds:turnSeconds,reveal_secrets:revealSecrets?1:0,country1:'co',country2:'fr',updated_at:'x' });
            assert.deepEqual({ digits:meta.digits,allowRepeats:meta.allowRepeats,isPublic:meta.isPublic,mode:meta.mode,numColors:meta.numColors,
              maxAttempts:meta.maxAttempts,turnSeconds:meta.turnSeconds,revealSecrets:meta.revealSecrets },
              { digits,allowRepeats,isPublic,mode,numColors,maxAttempts,turnSeconds,revealSecrets });
            count++;
          }
        }
      }
    }
  }
  assert.equal(count, 1440);
});

test('the 96 impossible four-color/no-repeat combinations are rejected clearly', async () => {
  const creator=await player('Impossible-A');
  for(const digits of [5,6]) for(const maxAttempts of [0,6,10]) for(const turnSeconds of [0,30,60,120]) {
    for(const isPublic of [false,true]) for(const revealSecrets of [false,true]) {
      const result=await api('createGame',{digits,mode:'colors',numColors:4,allowRepeats:false,isPublic,maxAttempts,turnSeconds,revealSecrets,secret:'01230'},creator.token);
      assert.equal(result.ok,false);
      assert.match(result.error,/suficientes colores/i);
    }
  }
});

test('two players complete numeric and color turns with authorization and idempotency enforced', async () => {
  const p1 = await player('Audit-A');
  const p2 = await player('Audit-B');
  const outsider = await player('Audit-X');
  for (const [index, options] of [
    { digits:5,mode:'numbers',numColors:10,allowRepeats:true,isPublic:true,maxAttempts:0,turnSeconds:0,revealSecrets:false,secret:'11223',secret2:'33445' },
    { digits:4,mode:'colors',numColors:8,allowRepeats:false,isPublic:false,maxAttempts:10,turnSeconds:30,revealSecrets:true,secret:'0123',secret2:'4567' },
  ].entries()) {
    const gameId = await createAndJoin(index ? await player('Audit-C') : p1, index ? await player('Audit-D') : p2, options);
    const a = index ? await player('Audit-C') : p1;
    const b = index ? await player('Audit-D') : p2;
    let stateA = await api('state',{ gameId },a.token);
    let stateB = await api('state',{ gameId },b.token);
    if (options.turnSeconds) {
      stateA = await api('state',{ gameId },a.token);
      stateB = await api('state',{ gameId },b.token);
    }
    assert.equal(JSON.stringify(stateA).includes(options.secret2), false);
    assert.equal(JSON.stringify(stateB).includes(options.secret), false);
    const denied = await api('state',{ gameId },outsider.token);
    assert.equal(denied.yourSecret, '');
    const current = stateA.yourTurn ? a : b;
    const waiting = stateA.yourTurn ? b : a;
    const wrongTurn = await api('guess',{ gameId,guess:codeFor(options,1),requestId:`wrong-${index}` },waiting.token);
    assert.equal(wrongTurn.ok,false);
    const first = await api('guess',{ gameId,guess:codeFor(options,1),requestId:`same-${index}` },current.token);
    const duplicate = await api('guess',{ gameId,guess:codeFor(options,1),requestId:`same-${index}` },current.token);
    assert.deepEqual(duplicate,first);
    const refreshed = await api('state',{ gameId },current.token);
    assert.equal(refreshed.guesses.length,1);
    await api('closeGame',{ gameId,intent:'abandon' },current.token);
  }
});

test('server advances an expired timed turn and rejects the late player', async () => {
  const p1 = await player('Timer-A');
  const p2 = await player('Timer-B');
  const options = { digits:5,mode:'numbers',numColors:10,allowRepeats:true,isPublic:true,maxAttempts:0,turnSeconds:30,revealSecrets:true,secret:'11122',secret2:'33344' };
  const gameId = await createAndJoin(p1,p2,options);
  await api('state',{ gameId },p1.token);
  await api('state',{ gameId },p2.token);
  const beforeExpiry = await api('state',{ gameId },p1.token);
  const late = beforeExpiry.yourTurn ? p1 : p2;
  const next = beforeExpiry.yourTurn ? p2 : p1;
  await db.prepare("UPDATE games SET turn_started_at=?,turn_remaining=30,timer_paused=0 WHERE game_id=?")
    .bind(new Date(Date.now()-31_000).toISOString(),gameId).run();
  const rejected = await api('guess',{ gameId,guess:'99999',requestId:'late-timer' },late.token);
  assert.equal(rejected.ok,false);
  assert.match(rejected.error,/tiempo/i);
  assert.equal(rejected.state.yourTurn,false);
  const nextState = await api('state',{ gameId },next.token);
  assert.equal(nextState.yourTurn,true);
  assert.ok(nextState.turnRemaining>=29);
});

test('simultaneous timeout requests advance the turn exactly once', async () => {
  const p1=await player('RaceTimer-A'),p2=await player('RaceTimer-B');
  const options={digits:4,mode:'numbers',numColors:10,allowRepeats:false,isPublic:true,maxAttempts:0,turnSeconds:30,revealSecrets:false,secret:'0123',secret2:'4567'};
  const gameId=await createAndJoin(p1,p2,options);
  await api('state',{gameId},p1.token);await api('state',{gameId},p2.token);
  const initial=await db.prepare('SELECT turn FROM games WHERE game_id=?').bind(gameId).first();
  await db.prepare('UPDATE games SET turn_started_at=?,turn_remaining=30,timer_paused=0 WHERE game_id=?')
    .bind(new Date(Date.now()-31_000).toISOString(),gameId).run();
  const results=await Promise.all([api('passTurn',{gameId},p1.token),api('passTurn',{gameId},p2.token)]);
  assert.equal(results.filter((result)=>result.ok).length,1);
  const final=await db.prepare('SELECT turn FROM games WHERE game_id=?').bind(gameId).first();
  assert.equal(final.turn,initial.turn===1?2:1);
});

test('simultaneous guesses cannot both consume the same turn', async () => {
  const p1=await player('RaceGuess-A'),p2=await player('RaceGuess-B');
  const options={digits:4,mode:'numbers',numColors:10,allowRepeats:false,isPublic:true,maxAttempts:0,turnSeconds:0,revealSecrets:false,secret:'0123',secret2:'4567'};
  const gameId=await createAndJoin(p1,p2,options);
  const state=await api('state',{gameId},p1.token);
  const current=state.yourTurn?p1:p2;
  const results=await Promise.all([
    api('guess',{gameId,guess:'6789',requestId:'race-guess-1'},current.token),
    api('guess',{gameId,guess:'7890',requestId:'race-guess-2'},current.token),
  ]);
  assert.equal(results.filter((result)=>result.ok).length,1);
  const final=await api('state',{gameId},p1.token);
  assert.equal(final.guesses.length,1);
});

test('reveal setting hides secrets during play and reveals only after finish', () => {
  const base = { game_id:'REVEAL',status:'active',digits:4,p1:'A',secret1:'0123',p2:'B',secret2:'4567',turn:1,guesses:'[]',winner:'',
    created_at:'x',updated_at:'x',allow_repeats:0,is_public:1,mode:'numbers',num_colors:10,max_attempts:0,turn_seconds:0,
    turn_started_at:'',rematch_id:'',pending_winner:'',country1:'co',country2:'fr',turn_remaining:0,timer_paused:0,
    manual_paused_by:'',manual_pause_until:'',lobby_paused_by:'',finish_reason:'',version:1 };
  assert.equal(sanitizeGame({ ...base,reveal_secrets:1 },'A').opponentSecret,'');
  assert.equal(sanitizeGame({ ...base,status:'finished',reveal_secrets:1 },'A').opponentSecret,'4567');
  assert.equal(sanitizeGame({ ...base,status:'finished',reveal_secrets:0 },'A').opponentSecret,'');
});

test('attempt limits end in a draw only after both players use the same allowance', async () => {
  const p1=await player('Limit-A'),p2=await player('Limit-B');
  const options={digits:3,mode:'numbers',numColors:10,allowRepeats:false,isPublic:true,maxAttempts:6,turnSeconds:0,revealSecrets:false,secret:'012',secret2:'345'};
  const gameId=await createAndJoin(p1,p2,options);
  for(let attempt=0;attempt<12;attempt++){
    const state=await api('state',{gameId},p1.token);
    const current=state.yourTurn?p1:p2;
    const result=await api('guess',{gameId,guess:'678',requestId:`limit-${attempt}`},current.token);
    assert.equal(result.ok,true,result.error);
    if(attempt<11)assert.equal(result.draw,false);
    else assert.equal(result.draw,true);
  }
  const finished=await api('state',{gameId},p1.token);
  assert.equal(finished.status,'finished');
  assert.equal(finished.isDraw,true);
  assert.equal(finished.attemptsP1,6);
  assert.equal(finished.attemptsP2,6);
});

test('equal-attempt solve becomes a tie and failed reply awards the pending winner', async () => {
  for(const [suffix,replySolves] of [['Tie',true],['Win',false]]){
    const p1=await player(`${suffix}-A`),p2=await player(`${suffix}-B`);
    const options={digits:3,mode:'numbers',numColors:10,allowRepeats:false,isPublic:true,maxAttempts:0,turnSeconds:0,revealSecrets:true,secret:'012',secret2:'345'};
    const gameId=await createAndJoin(p1,p2,options);
    const state=await api('state',{gameId},p1.token);
    const first=state.yourTurn?p1:p2,second=state.yourTurn?p2:p1;
    const firstSolution=first===p1?options.secret2:options.secret;
    const secondSolution=second===p1?options.secret2:options.secret;
    const solved=await api('guess',{gameId,guess:firstSolution,requestId:`${suffix}-first`},first.token);
    assert.equal(solved.pending,true);
    const reply=await api('guess',{gameId,guess:replySolves?secondSolution:'678',requestId:`${suffix}-reply`},second.token);
    assert.equal(replySolves?reply.tie:reply.win,replySolves?true:false);
    const finished=await api('state',{gameId},first.token);
    assert.equal(finished.status,'finished');
    assert.equal(replySolves?finished.isDraw:finished.winner===first.username,true);
    assert.ok(finished.opponentSecret);
  }
});

test('manual pause freezes the clock and only its owner can resume it', async () => {
  const p1=await player('Pause-A'),p2=await player('Pause-B');
  const options={digits:4,mode:'colors',numColors:6,allowRepeats:false,isPublic:true,maxAttempts:0,turnSeconds:60,revealSecrets:false,secret:'0123',secret2:'2345'};
  const gameId=await createAndJoin(p1,p2,options);
  await api('state',{gameId},p1.token);await api('state',{gameId},p2.token);
  const paused=await api('togglePause',{gameId,intent:'pause'},p1.token);
  assert.equal(paused.ok,true,paused.error);
  const state=await api('state',{gameId},p2.token);
  assert.equal(state.timerPaused,true);
  const blocked=await api('guess',{gameId,guess:'0123',requestId:'paused-guess'},state.yourTurn?p2.token:p1.token);
  assert.equal(blocked.ok,false);
  assert.match(blocked.error,/pausa/i);
  const denied=await api('togglePause',{gameId,intent:'resume'},p2.token);
  assert.equal(denied.ok,false);
  const resumed=await api('togglePause',{gameId,intent:'resume'},p1.token);
  assert.equal(resumed.ok,true,resumed.error);
});

test('public listing excludes private games and immediate rematch keeps the old rules', async () => {
  const publicA=await player('Public-A'),publicB=await player('Public-B');
  const privateA=await player('Private-A'),privateB=await player('Private-B');
  const common={digits:4,mode:'colors',numColors:8,allowRepeats:true,maxAttempts:10,turnSeconds:0,revealSecrets:true,secret:'0011',secret2:'2233'};
  const publicId=await createAndJoin(publicA,publicB,{...common,isPublic:true});
  const privateId=await createAndJoin(privateA,privateB,{...common,isPublic:false});
  const waitingPublic=await player('Waiting-P'),waitingPrivate=await player('Waiting-X');
  const publicWaitingResult=await api('createGame',{...common,isPublic:true,username:waitingPublic.username},waitingPublic.token);
  const privateWaitingResult=await api('createGame',{...common,isPublic:false,username:waitingPrivate.username},waitingPrivate.token);
  const listing=await api('listGames');
  assert.equal(listing.games.some((game)=>game.gameId===publicWaitingResult.gameId),true);
  assert.equal(listing.games.some((game)=>game.gameId===privateWaitingResult.gameId),false);
  const state=await api('state',{gameId:publicId},publicA.token);
  const first=state.yourTurn?publicA:publicB,second=state.yourTurn?publicB:publicA;
  const solution=first===publicA?common.secret2:common.secret;
  await api('guess',{gameId:publicId,guess:solution,requestId:'rematch-solve'},first.token);
  await api('guess',{gameId:publicId,guess:'4567',requestId:'rematch-reply'},second.token);
  const rematchSecret=first===publicA?'4455':'6677';
  const rematch=await api('rematch',{gameId:publicId,secret:rematchSecret,country:'co'},first.token);
  assert.equal(rematch.ok,true,rematch.error);
  const other=first===publicA?publicB:publicA;
  const otherSecret=other===publicA?'4455':'6677';
  const joinedRematch=await api('rematch',{gameId:publicId,secret:otherSecret,country:'fr'},other.token);
  assert.equal(joinedRematch.ok,true,joinedRematch.error);
  assert.equal(joinedRematch.gameId,rematch.gameId);
  const row=await db.prepare('SELECT * FROM games WHERE game_id=?').bind(rematch.gameId).first();
  assert.equal(row.status,'active');
  assert.deepEqual({digits:row.digits,mode:row.mode,numColors:row.num_colors,allowRepeats:Boolean(row.allow_repeats),maxAttempts:row.max_attempts,turnSeconds:row.turn_seconds,revealSecrets:Boolean(row.reveal_secrets)},
    {digits:4,mode:'colors',numColors:8,allowRepeats:true,maxAttempts:10,turnSeconds:0,revealSecrets:true});
  await api('closeGame',{gameId:privateId,intent:'abandon'},privateA.token);
  await api('closeGame',{gameId:publicWaitingResult.gameId,intent:'cancel'},waitingPublic.token);
  await api('closeGame',{gameId:privateWaitingResult.gameId,intent:'cancel'},waitingPrivate.token);
});
