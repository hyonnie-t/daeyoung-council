/* 행사 상점 앱스크립트 시험. Apps Script 서비스를 메모리로 흉내 내 Code.gs를 돌린다. 실제 시트에 쓰지 않는다.
 * 사용: node apps-script/sangjeom/test.js   한계: 수식·동시 실행·권한·시트 자동 변환은 흉내 내지 않는다. */
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getLastRow() { return this.rows.length; }
  appendRow(a) { this.rows.push(a.slice()); return this; }
  setFrozenRows() {}
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    const ensure = (rr, cc) => { while (sh.rows.length < rr) sh.rows.push([]); const x = sh.rows[rr - 1]; while (x.length < cc) x.push(''); return x; };
    return {
      getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = sh.rows[r - 1 + i]; row.push(v && v[c - 1 + j] !== undefined ? v[c - 1 + j] : ''); } o.push(row); } return o; },
      setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { ensure(r + i, c + j)[c - 1 + j] = x; })); return this; },
      getValue() { const v = sh.rows[r - 1]; return v && v[c - 1] !== undefined ? v[c - 1] : ''; },
      setValue(x) { ensure(r, c)[c - 1] = x; return this; },
      setNumberFormat() { return this; },
      clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) ensure(r + i, c + j)[c - 1 + j] = ''; return this; }
    };
  }
}
const sheets = {};
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)) };
const cacheStore = {};
const props = {};
const ctx = {
  console: { log() {}, error() {} }, Date, JSON, Math, Number, String, Object, Array, Buffer,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
  CacheService: { getScriptCache: () => ({ get: k => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; }, remove: k => { delete cacheStore[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType() { return this; }, getContent: () => t }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    computeHmacSha256Signature: (t, k) => [...crypto.createHmac('sha256', k).update(t).digest()],
    base64Encode: b => Buffer.from(b).toString('base64'),
    formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').join('')
  }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8') + '\nthis.sjSetAdminKey_=sjSetAdminKey_;', ctx);
const results = [];
const ok = (name, cond) => results.push((cond ? 'PASS ' : 'FAIL ') + name);
const GET = () => JSON.parse(ctx.doGet().getContent());
const POST = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).getContent());
ok('doGet', GET().ok === true);
ok('깨진 본문 거부', JSON.parse(ctx.doPost({ postData: { contents: '{' } }).getContent()).error === 'bad_input');
// v148 학생회 행사 상점
{
  const PW = 'event-pass-1', KEY = 'admin-key-1234';
  const S = b => POST(b);
  const A = b => POST(Object.assign({ key: KEY }, b));
  const Rows = () => sheets['상점_사용기록'].rows;
  const left = sid => A({ action: 'sjAdmin' }).rows.find(x => x.sid === sid).left;
  const load = (rows, readAt) => A({ action: 'sjLoad', readAt: readAt == null ? Date.now() : readAt, rows });
  const wait = () => { const t = Date.now() + 3; while (Date.now() < t) {} };
  ok('sj 기본은 잠김', S({ action: 'sjAuth', pw: PW }).error === 'locked');
  ok('관리 비밀번호 전 no_admin', A({ action: 'sjAdmin' }).error === 'no_admin');
  ok('짧은 관리 비밀번호 거부', ctx.sjSetAdminKey_('1234') === false);
  ok('관리 비밀번호 정하기', ctx.sjSetAdminKey_(KEY) === true);
  ok('틀린 관리 비밀번호 거부', POST({ action: 'sjAdmin', key: 'wrong-key-999' }).error === 'no_auth');
  ok('없는 action 거부', POST({ action: 'constructor' }).error === 'bad_input' && POST({ action: 'sjAdminInit', key: KEY }).error === 'bad_input');
  ok('sjSetup 키 없으면 거부', S({ action: 'sjSetup', open: true, event: 'a', password: PW }).error === 'no_auth');
  ok('비밀번호·행사 없이 못 엶', A({ action: 'sjSetup', open: true }).error === 'bad_input');
  ok('7글자 비밀번호 거부', A({ action: 'sjSetup', password: '1234567' }).error === 'bad_input');
  let r = A({ action: 'sjSetup', open: true, event: '12/20', password: PW });
  ok('열기', r.ok && r.open && r.hasPw && r.event === '12/20');
  ok('비밀번호 원문 저장 안 됨', !props.SANGJEOM_EVENT_JSON.includes(PW) && !props.SANGJEOM_EVENT_JSON.includes(KEY));
  ok('틀린 비밀번호 거부', S({ action: 'sjAuth', pw: 'nope' }).error === 'wrong_pw');
  ok('앞뒤 공백은 무시', S({ action: 'sjAuth', pw: ' ' + PW + ' ' }).event === '12/20');
  ok('점수 넣기 전 no_data', S({ action: 'sjCheck', pw: PW, sid: '30901', point: 1 }).error === 'no_data');
  ok('sjLoad 키 없으면 거부', S({ action: 'sjLoad', readAt: Date.now(), rows: [] }).error === 'no_auth');
  ok('readAt 없거나 오래되면 거부', A({ action: 'sjLoad', rows: [{ sid: '30901', name: 'a', point: 1 }] }).error === 'bad_input' && load([{ sid: '30901', name: 'a', point: 1 }], Date.now() - 3600000).error === 'bad_input');
  ok('잘못된 학번 거부', load([{ sid: 'x', name: 'a', point: 1 }]).error === 'bad_input');
  ok('중복 학번 거부', load([{ sid: '30901', name: 'a', point: 1 }, { sid: '30901', name: 'a', point: 1 }]).error === 'bad_input');
  r = load([{ sid: '30901', name: '가나', point: 3 }, { sid: '10101', name: '=SUM(A1)', point: 0 }, { sid: '20202', name: '다라', point: -2 }]);
  ok('sjLoad 3명', r.ok && r.count === 3);
  ok('이름 수식 막음', String(sheets['상점_잔액'].rows[2][1]).startsWith("'="));
  wait();
  ok('비밀번호 없이 조회 안 됨', S({ action: 'sjCheck', sid: '30901', point: 1 }).error === 'wrong_pw');
  r = S({ action: 'sjCheck', pw: PW, sid: '30901', point: 3 });
  ok('가능, 이름만 주고 점수 안 줌', r.ok && r.enough === true && r.name === '가나' && r.point === undefined && r.left === undefined);
  ok('부족', S({ action: 'sjCheck', pw: PW, sid: '30901', point: 4 }).enough === false);
  ok('음수 잔액은 부족', S({ action: 'sjCheck', pw: PW, sid: '20202', point: 1 }).enough === false);
  ok('없는 학번', S({ action: 'sjCheck', pw: PW, sid: '39999', point: 1 }).error === 'not_found');
  ok('점수 0·11·소수 거부', [0, 11, 1.5, -1].every(p => S({ action: 'sjCheck', pw: PW, sid: '30901', point: p }).error === 'bad_input'));
  let last; for (let i = 0; i < 14; i++) last = S({ action: 'sjCheck', pw: PW, sid: '10101', point: 1 });
  ok('같은 학생 조회 상한', last.error === 'busy');
  ok('기록자 없으면 거부', S({ action: 'sjSpend', pw: PW, sid: '30901', point: 1, reqId: 'r1' }).error === 'bad_input');
  r = S({ action: 'sjSpend', pw: PW, sid: '30901', point: 2, by: '임원', reqId: 'r1' });
  ok('기록', r.ok && r.id === 'r1' && r.name === '가나');
  r = S({ action: 'sjSpend', pw: PW, sid: '30901', point: 2, by: '임원', reqId: 'r1' });
  ok('같은 요청 다시 보내도 한 번만', r.ok && r.repeated === true && Rows().length === 2);
  ok('같은 reqId 다른 학번 거부', S({ action: 'sjSpend', pw: PW, sid: '10101', point: 2, by: '임원', reqId: 'r1' }).error === 'bad_input');
  ok('행사 이름 열은 텍스트로 그대로', Rows()[1][2] === '12/20');
  ok('-로 시작하는 기록자도 그대로', S({ action: 'sjSetup', key: KEY, event: '-봄' }).event === '-봄' && S({ action: 'sjSetup', key: KEY, event: '12/20' }).ok);
  ok('열어 둔 채 이름을 고쳐도 목록 유지', S({ action: 'sjRecent', pw: PW }).rows.length === 1);
  r = S({ action: 'sjSpend', pw: PW, sid: '30901', point: 2, by: '임원', reqId: 'r2' });
  ok('남은 점수 넘으면 거부', r.error === 'short' && Rows().length === 2);
  r = S({ action: 'sjRecent', pw: PW });
  ok('최근 기록(행사 이름이 날짜 모양이어도)', r.ok && r.rows.length === 1 && r.rows[0].sid === '30901' && r.rows[0].left === undefined);
  ok('sjAdmin 남은 상점', left('30901') === 1);
  ok('취소 없는 기록', S({ action: 'sjCancel', pw: PW, id: 'zz', by: '임원' }).error === 'no_record');
  ok('취소에 이름 필요', S({ action: 'sjCancel', pw: PW, id: 'r1' }).error === 'bad_input');
  ok('취소', S({ action: 'sjCancel', pw: PW, id: 'r1', by: '서기' }).ok === true);
  ok('취소한 사람 남음', Rows()[1][11] === '서기');
  ok('취소하면 복구', left('30901') === 3);
  ok('취소된 reqId 재전송은 성공으로 안 줌', S({ action: 'sjSpend', pw: PW, sid: '30901', point: 2, by: '임원', reqId: 'r1' }).error === 'cancelled');
  // constructor 기록ID로 표시 끼워 넣기 방지
  S({ action: 'sjSpend', pw: PW, sid: '20202', point: 1, by: '임원', reqId: 'constructor' }); // 잔액 부족이라 기록 안 됨
  load([{ sid: '30901', name: '가나', point: 5 }, { sid: '20202', name: '다라', point: 5 }]); wait();
  S({ action: 'sjSpend', pw: PW, sid: '20202', point: 1, by: '임원', reqId: 'constructor' });
  S({ action: 'sjSpend', pw: PW, sid: '30901', point: 1, by: '임원', reqId: 'r3' });
  ok('열려 있으면 처리 시작 거부', A({ action: 'sjClaim', ids: ['r3'] }).error === 'must_lock');
  r = A({ action: 'sjSetup', open: false });
  ok('잠그면 담당 비밀번호도 지움', r.ok && r.open === false && r.hasPw === false);
  ok('잠그면 맞는 비밀번호도 거부', S({ action: 'sjSpend', pw: PW, sid: '30901', point: 1, by: 'a', reqId: 'r5' }).error === 'locked');
  ok('다시 열려면 새 비밀번호', A({ action: 'sjSetup', open: true }).error === 'bad_input');
  ok('처리 시작 전 반영 표시 안 됨', A({ action: 'sjMark', ids: ['r3'] }).marked === 0);
  ok('없는 기록 섞이면 하나도 안 찍음', A({ action: 'sjClaim', ids: ['r3', 'nope'] }).error === 'already' && !Rows().find(x => x[0] === 'r3')[9]);
  ok('취소된 기록 처리 시작 안 됨', A({ action: 'sjClaim', ids: ['r1'] }).error === 'already');
  ok('처리 시작 키 없으면 거부', S({ action: 'sjClaim', ids: ['r3'] }).error === 'no_auth');
  ok('처리 시작', A({ action: 'sjClaim', ids: ['r3'] }).claimed === 1);
  ok('처리 중 두 번 시작 안 됨(재실행 이중 차감 방지)', A({ action: 'sjClaim', ids: ['r3'] }).error === 'already');
  ok('constructor 기록은 다른 표시에 안 끼어듦', !Rows().find(x => x[0] === 'constructor')[9]);
  ok('처리 중에도 잔액에서 뺌', left('30901') === 4);
  ok('처리 중이면 점수 다시 못 넣음', load([{ sid: '30901', name: '가나', point: 5 }]).error === 'claimed');
  A({ action: 'sjSetup', open: true, password: PW });
  ok('처리 중 기록 취소 불가', S({ action: 'sjCancel', pw: PW, id: 'r3', by: 'a' }).error === 'already');
  ok('sjRecent도 잠금 표시', S({ action: 'sjRecent', pw: PW }).rows.find(x => x.id === 'r3').locked === true);
  ok('되돌리기 키 없으면 거부', S({ action: 'sjRelease', ids: ['r3'] }).error === 'no_auth');
  ok('되돌리면 다시 대상', A({ action: 'sjRelease', ids: ['r3'] }).released === 1 && !Rows().find(x => x[0] === 'r3')[9]);
  A({ action: 'sjSetup', open: false });
  A({ action: 'sjClaim', ids: ['r3'] }); wait();
  ok('반영 표시', A({ action: 'sjMark', ids: ['r3'] }).marked === 1);
  ok('반영 뒤에도 옛 점수에선 계속 뺌', left('30901') === 4);
  ok('두 번 반영 안 됨', A({ action: 'sjMark', ids: ['r3'] }).marked === 0);
  ok('반영한 기록 되돌리기 안 됨', A({ action: 'sjRelease', ids: ['r3'] }).released === 0);
  wait();
  load([{ sid: '30901', name: '가나', point: 4 }]);
  ok('새 점수에는 반영된 기록 안 빼서 이중 차감 없음', left('30901') === 4);
  // 읽은 뒤에 반영된 기록은 새 점수에 안 들어 있으니 뺀다
  A({ action: 'sjSetup', open: true, password: PW });
  load([{ sid: '30901', name: '가나', point: 4 }, { sid: '20202', name: '다라', point: 5 }]); wait();
  S({ action: 'sjSpend', pw: PW, sid: '30901', point: 1, by: '임원', reqId: 'r4' });
  A({ action: 'sjSetup', open: false }); A({ action: 'sjClaim', ids: ['r4'] });
  const readBefore = Date.now(); wait();
  A({ action: 'sjMark', ids: ['r4'] }); wait();
  ok('읽은 시각 뒤 반영분은 뺌', load([{ sid: '30901', name: '가나', point: 4 }], readBefore).ok && left('30901') === 3);
  A({ action: 'sjSetup', open: true, password: PW, event: '봄 행사' });
  ok('행사가 바뀌면 지난 기록 안 보임', S({ action: 'sjRecent', pw: PW }).rows.length === 0);
  ok('지난 행사 기록 취소 불가', S({ action: 'sjCancel', pw: PW, id: 'constructor', by: 'a' }).error === 'no_record');
  // 틀려도 맞는 비밀번호는 안 막힌다
  for (let i = 0; i < 30; i++) S({ action: 'sjAuth', pw: 'bad' + i });
  ok('틀린 시도가 많아도 담당자는 안 막힘', S({ action: 'sjAuth', pw: PW }).ok === true);
  ok('틀린 횟수는 관리 화면에', A({ action: 'sjAdmin' }).wrongPw >= 30);
  // 관리 비밀번호를 틀려도 효니는 안 막힌다
  for (let i = 0; i < 30; i++) POST({ action: 'sjAdmin', key: 'bad' + i });
  ok('틀린 관리 비밀번호가 많아도 안 막힘', A({ action: 'sjAdmin' }).ok === true && typeof A({ action: 'sjAdmin' }).now === 'number');
  // 효니 취소
  S({ action: 'sjSpend', pw: PW, sid: '30901', point: 1, by: '임원', reqId: 'r7' });
  ok('sjAdminCancel 키 없으면 거부', S({ action: 'sjAdminCancel', id: 'r7' }).error === 'no_auth');
  ok('효니가 지난 행사 기록도 취소', A({ action: 'sjAdminCancel', id: 'constructor' }).ok === true);
  ok('효니 취소', A({ action: 'sjAdminCancel', id: 'r7' }).ok === true && Rows().find(x => x[0] === 'r7')[11] === '선생님');
  ok('두 번 취소 안 됨', A({ action: 'sjAdminCancel', id: 'r7' }).error === 'cancelled');
  ok('반영된 기록은 취소 안 됨', A({ action: 'sjAdminCancel', id: 'r3' }).error === 'already');
  // 교환소 메뉴(2026-11-13)
  load([{ sid: '30901', name: '가나', point: 20 }, { sid: '20202', name: '다라', point: 2 }]); wait();
  r = S({ action: 'sjCheck', pw: PW, sid: '30901', items: { jelly: 2, jjb: 1 } });
  ok('물품으로 조회', r.ok && r.enough === true && r.ice === false && r.left === undefined);
  ok('모르는 물품·0개·소수 거부', [{ x: 1 }, { jelly: 0 }, { jelly: 1.5 }, [], {}].every(it => S({ action: 'sjCheck', pw: PW, sid: '30901', items: it }).error === 'bad_input'));
  ok('10점 넘는 한 번 계산 거부', S({ action: 'sjCheck', pw: PW, sid: '30901', items: { d10: 1, jelly: 1 } }).error === 'bad_input');
  ok('아이스크림 한 번에 2개 거부', S({ action: 'sjCheck', pw: PW, sid: '30901', items: { jjb: 1, sr: 1 } }).error === 'ice_today');
  ok('점수와 물품이 다르면 거부', S({ action: 'sjSpend', pw: PW, sid: '30901', items: { jelly: 1 }, point: 3, by: '임원', reqId: 'm0' }).error === 'bad_input');
  r = S({ action: 'sjSpend', pw: PW, sid: '30901', items: { jelly: 2, jjb: 1 }, by: '임원', reqId: 'm1' });
  ok('물품 기록, 점수는 서버 계산', r.ok && r.point === 5 && r.left === undefined && Rows().find(x => x[0] === 'm1')[5] === 5);
  ok('물품 칸에 이름', Rows().find(x => x[0] === 'm1')[12] === '마이쮸·젤리스트로우×2, 쭈쭈바×1 [아이스크림]' && sheets['상점_사용기록'].rows[0][12] === '물품');
  ok('최근 기록에 물품', S({ action: 'sjRecent', pw: PW }).rows.find(x => x.id === 'm1').items.includes('쭈쭈바'));
  ok('오늘 아이스크림 바꾼 학생 조회 표시', S({ action: 'sjCheck', pw: PW, sid: '30901', items: { sr: 1 } }).ice === true);
  ok('같은 날 아이스크림 두 번째 거부', S({ action: 'sjSpend', pw: PW, sid: '30901', items: { sr: 1 }, by: '임원', reqId: 'm2' }).error === 'ice_today');
  ok('같은 요청 재전송은 하루 1개에 안 걸림', S({ action: 'sjSpend', pw: PW, sid: '30901', items: { jelly: 2, jjb: 1 }, by: '임원', reqId: 'm1' }).repeated === true);
  ok('간식은 계속 됨', S({ action: 'sjSpend', pw: PW, sid: '30901', items: { jelly: 1 }, by: '임원', reqId: 'm3' }).ok === true);
  S({ action: 'sjCancel', pw: PW, id: 'm1', by: '임원' });
  ok('취소하면 아이스크림 다시 가능', S({ action: 'sjCheck', pw: PW, sid: '30901', items: { sr: 1 } }).ice === false);
  ok('품절 키 없으면 거부', S({ action: 'sjSoldOut', soldOut: ['d10'] }).error === 'no_auth');
  ok('모르는 품절 키 거부', A({ action: 'sjSoldOut', soldOut: ['nope'] }).error === 'bad_input');
  ok('품절 정하기', A({ action: 'sjSoldOut', soldOut: ['d10', 'sr'] }).soldOut.join() === 'd10,sr' && S({ action: 'sjAuth', pw: PW }).soldOut.length === 2);
  r = S({ action: 'sjSpend', pw: PW, sid: '30901', items: { sr: 1 }, by: '임원', reqId: 'm4' });
  ok('품절 물품 거부', r.error === 'sold_out' && r.item === '설레임');
  ok('관리 화면에 품절', A({ action: 'sjAdmin' }).soldOut.length === 2);
  A({ action: 'sjSoldOut', soldOut: [] });
  // 선생님 계산대
  ok('계산대 조회 키 없으면 거부', S({ action: 'sjAdminCheck', sid: '30901' }).error === 'no_auth');
  r = A({ action: 'sjAdminCheck', sid: '30901' });
  ok('계산대 조회는 남은 점수', r.ok && r.name === '가나' && r.left === 19 && r.ice === false);
  ok('계산대 없는 학번', A({ action: 'sjAdminCheck', sid: '39998' }).error === 'not_found');
  r = A({ action: 'sjAdminSpend', sid: '30901', items: { d8: 1 }, reqId: 't1' });
  ok('계산대 기록', r.ok && r.point === 8 && r.left === 11 && Rows().find(x => x[0] === 't1')[6] === '선생님');
  ok('계산대 키 없으면 기록 안 됨', S({ action: 'sjAdminSpend', sid: '30901', items: { jelly: 1 }, reqId: 't2', by: '선생님' }).error === 'no_auth');
  ok('계산대 잔액 부족', A({ action: 'sjAdminSpend', sid: '20202', items: { jjb: 1 }, reqId: 't3' }).error === 'short');
  A({ action: 'sjSetup', open: false });
  ok('잠겨 있어도 계산대는 됨', A({ action: 'sjAdminSpend', sid: '30901', items: { jelly: 1 }, reqId: 't4' }).ok === true);
  ok('잠겨 있으면 담당은 안 됨', S({ action: 'sjSpend', pw: PW, sid: '30901', items: { jelly: 1 }, by: '임원', reqId: 't5' }).error === 'locked');
  ok('예전 점수 방식도 그대로', A({ action: 'sjSetup', open: true, password: PW }).ok && S({ action: 'sjSpend', pw: PW, sid: '30901', point: 2, by: '임원', reqId: 't6' }).ok === true && Rows().find(x => x[0] === 't6')[12] === '');
  ok('담당이 선생님 이름으로 기록 못 함', S({ action: 'sjSpend', pw: PW, sid: '30901', items: { jelly: 1 }, by: '선생님', reqId: 'x1' }).error === 'bad_input');
  ok('담당 기록 응답에 남은 점수 없음', S({ action: 'sjSpend', pw: PW, sid: '30901', items: { jelly: 1 }, by: '임원', reqId: 'x2' }).left === undefined);
  // 메뉴 고치기(2026-11-13)
  ok('기본 메뉴가 응답에', S({ action: 'sjAuth', pw: PW }).menu.length === 6 && A({ action: 'sjAdmin' }).menu.find(x => x.k === 'sr').ice === true);
  ok('메뉴 키 없으면 거부', S({ action: 'sjMenu', menu: [{ k: 'a', name: 'a', point: 1 }] }).error === 'no_auth');
  ok('잘못된 메뉴 거부', [[], [{ k: 'A!', name: '가', point: 1 }], [{ k: 'a', name: '', point: 1 }], [{ k: 'a', name: '가', point: 11 }], [{ k: 'a', name: '가', point: 1 }, { k: 'a', name: '나', point: 1 }], [{ k: 'a', name: '가', point: 1 }, { k: 'b', name: '가', point: 2 }]].every(m => A({ action: 'sjMenu', menu: m }).error === 'bad_input'));
  A({ action: 'sjSoldOut', soldOut: ['d10', 'jelly'] });
  const base = A({ action: 'sjAdmin' }).menu.filter(x => x.k !== 'd10');
  r = A({ action: 'sjMenu', menu: base.concat([{ k: 'pen', name: '볼펜', point: 2, ic: '🖊️' }, { k: 'pop', name: '메로나', point: 3, ice: true }]) });
  ok('메뉴 추가·삭제', r.ok && r.menu.length === 7 && r.menu.find(x => x.k === 'pen').point === 2 && !r.menu.find(x => x.k === 'd10'));
  ok('지운 메뉴의 품절 표시는 버림', r.soldOut.join() === 'jelly');
  A({ action: 'sjSoldOut', soldOut: [] });
  ok('지운 메뉴로 기록 거부', A({ action: 'sjAdminSpend', sid: '30901', items: { d10: 1 }, reqId: 'n1' }).error === 'bad_input');
  r = A({ action: 'sjAdminSpend', sid: '30901', items: { pen: 2 }, reqId: 'n2' });
  ok('새 메뉴로 기록', r.ok && r.point === 4 && Rows().find(x => x[0] === 'n2')[12] === '볼펜×2');
  load([{ sid: '10101', name: '라마', point: 20 }]); wait();
  A({ action: 'sjAdminSpend', sid: '10101', items: { pop: 1 }, reqId: 'n3' });
  ok('새 아이스크림도 하루 1개', A({ action: 'sjAdminSpend', sid: '10101', items: { jjb: 1 }, reqId: 'n4' }).error === 'ice_today');
  ok('없는 메뉴 품절 거부', A({ action: 'sjSoldOut', soldOut: ['d10'] }).error === 'bad_input');
  // 검토 지적(2026-11-13)
  let menuNow = A({ action: 'sjAdmin' }).menu;
  A({ action: 'sjMenu', menu: menuNow.map(x => x.k === 'pop' ? Object.assign({}, x, { name: '메로나2' }) : x) });
  ok('아이스크림 이름을 바꿔도 하루 1개', A({ action: 'sjAdminCheck', sid: '10101' }).ice === true);
  menuNow = A({ action: 'sjAdmin' }).menu;
  A({ action: 'sjMenu', menu: menuNow.concat([{ k: 'cone', name: '콘', point: 1, ice: true }, { k: 'jc', name: '젤리콘', point: 1 }]) });
  load([{ sid: '20202', name: '마바', point: 20 }]); wait();
  A({ action: 'sjAdminSpend', sid: '20202', items: { jc: 1 }, reqId: 'n5' });
  ok('이름 일부가 같아도 아이스크림으로 안 셈', A({ action: 'sjAdminCheck', sid: '20202' }).ice === false);
  menuNow = A({ action: 'sjAdmin' }).menu;
  A({ action: 'sjMenu', menu: menuNow.map(x => x.k === 'pen' ? Object.assign({}, x, { point: 5 }) : x) });
  ok('화면 점수와 서버 메뉴 점수가 다르면 거부', A({ action: 'sjAdminSpend', sid: '20202', items: { pen: 1 }, point: 2, reqId: 'n6' }).error === 'bad_input');
  ok('이름에 ×·쉼표·[ ] 거부', ['볼×펜', '볼,펜', '[펜]'].every(n => A({ action: 'sjMenu', menu: [{ k: 'a', name: n, point: 1 }] }).error === 'bad_input'));
  A({ action: 'sjMenu', menu: [{ k: 'eq', name: '=1+1', point: 1 }] });
  A({ action: 'sjAdminSpend', sid: '20202', items: { eq: 1 }, reqId: 'n7' });
  ok('물품 칸 수식 막음', String(Rows().find(x => x[0] === 'n7')[12]).startsWith("'"));
  // 잠금 초과는 서버 오류로
  const oldLock = ctx.LockService;
  ctx.LockService = { getScriptLock: () => ({ waitLock() { throw new Error('timeout'); }, releaseLock() {} }) };
  ok('잠금 초과는 server', S({ action: 'sjSpend', pw: PW, sid: '30901', point: 1, by: 'a', reqId: 'r9' }).error === 'server');
  ctx.LockService = oldLock;
}

console.log(results.filter(x => x.startsWith('FAIL')).join('\n'));
const fails = results.filter(x => x.startsWith('FAIL')).length;
console.log((results.length - fails) + '/' + results.length + ' 통과');
process.exit(fails ? 1 : 0);
