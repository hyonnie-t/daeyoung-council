/* 임원 신청(Apply.gs) 시험. test.js와 같은 흉내 서비스로 Code.gs+Apply.gs를 함께 돌린다. 실제 시트에 쓰지 않는다.
 * 사용: node apps-script/sangjeom/apply.test.js */
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
      setValue(x) { ensure(r, c)[c - 1] = x; return this; }
    };
  }
}
const sheets = {};
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)) };
const cacheStore = {};
const props = {};
const ctx = {
  console: { log() {}, error(e) { process.stderr.write(String(e) + '\n'); } }, Date, JSON, Math, Number, String, Object, Array, Buffer,
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
const src = ['Code.gs', 'Apply.gs'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
// 마감 전 날짜로 시험하려고 AP_DEADLINE만 바꾼다(실제 파일은 그대로)
vm.runInContext(src.replace(/const AP_DEADLINE = '[^']+'/, "const AP_DEADLINE = '2999-01-01T00:00:00+09:00'") + '\nthis.sjSetAdminKey_=sjSetAdminKey_;', ctx);

const results = [];
const ok = (name, cond) => results.push((cond ? 'PASS ' : 'FAIL ') + name);
const POST = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).getContent());
const KEY = 'admin-key-1234';
const A = b => POST(Object.assign({ key: KEY }, b));
const base = o => Object.assign({ action: 'apSubmit', sid: '10305', name: '김가나', gender: '여', track: 'new', cand: false, d1: '알림부', d2: '홍보기획부', role: '', answers: { motive: '하고 싶어요', agree: true }, labels: { motive: '지원 동기', agree: '약속' }, pin: '1234' }, o);
const rows = () => sheets['임원_신청'].rows;

ok('기존 상점 경로 그대로', POST({ action: 'sjAdmin', key: 'x' }).error === 'no_admin');
ok('없는 action 거부', POST({ action: 'toString' }).error === 'bad_input');
ok('apInfo 기본 닫힘', POST({ action: 'apInfo' }).open === false);
ok('닫혀 있으면 closed', POST(base()).error === 'closed');
ctx.sjSetAdminKey_(KEY);
ok('키 없이 열기 거부', POST({ action: 'apAdminSet', open: true, key: 'nope1' }).error === 'no_auth');
ok('열기', A({ action: 'apAdminSet', open: true }).accepting === true);
ok('apInfo 열림', POST({ action: 'apInfo' }).open === true);
ok('잘못된 학번', POST(base({ sid: '19999' })).error === 'bad_input');
ok('확인 번호 3자리 거부', POST(base({ pin: '123' })).error === 'bad_input');
ok('1·2지망 같으면 거부', POST(base({ d2: '알림부' })).error === 'bad_input');
ok('없는 부서 거부', POST(base({ d1: '체육부' })).error === 'bad_input');
ok('2학년 신규는 추가 모집 전 거부', POST(base({ sid: '20305' })).error === 'grade');
ok('부장·차장은 2학년만', POST(base({ track: 'lead', role: 'head' })).error === 'grade');
ok('부장·차장은 희망 역할 필수', POST(base({ sid: '20101', track: 'lead' })).error === 'bad_input');
ok('이상한 답 키 거부', POST(base({ answers: { 'constructor ': 'x' } })).error === 'bad_input');
let r = POST(base({ name: '=김가나' }));
ok('새 신청', r.ok && r.created);
ok('이름 수식 막음', String(rows()[1][4]).startsWith("'="));
ok('확인 번호 원문 저장 안 됨', !JSON.stringify(rows()).includes('1234'));
ok('읽기용 답 칸', String(rows()[1][11]).includes('[지원 동기] 하고 싶어요') && String(rows()[1][11]).includes('[약속] 예'));
ok('같은 학번 새로 내기 막음', POST(base()).error === 'exists');
ok('틀린 번호로 고치기 거부', POST(base({ edit: true, pin: '9999' })).error === 'pin');
ok('apMine 틀린 번호', POST({ action: 'apMine', sid: '10305', pin: '0000' }).error === 'pin');
r = POST({ action: 'apMine', sid: '10305', pin: '1234' });
ok('apMine(심사 상태는 안 줌)', r.ok && r.app.track === 'new' && r.app.answers.motive === '하고 싶어요' && r.app.status === undefined);
r = POST(base({ edit: true, answers: { motive: '고쳤어요' }, cand: true }));
ok('고치기', r.ok && r.created === false && rows().length === 2 && rows()[1][2] !== '' && rows()[1][16] === 1 && rows()[1][7] === '예');
POST(base({ edit: true, pin: '1111' })); POST(base({ edit: true, pin: '1112' }));
ok('5번째 틀림까지는 pin', POST(base({ edit: true, pin: '1113' })).error === 'pin');
ok('5번 틀린 뒤엔 맞는 번호도 busy', POST(base({ edit: true })).error === 'busy' && POST({ action: 'apMine', sid: '10305', pin: '1234' }).error === 'busy');
r = A({ action: 'apAdmin' });
ok('심사판 목록', r.ok && r.rows.length === 1 && r.rows[0].status === '접수' && r.rows[0].cand === true && r.rows[0].answers.motive === '고쳤어요');
ok('심사판 키 없으면 거부', POST({ action: 'apAdmin' }).error === 'no_auth');
const id = r.rows[0].id;
ok('상태 잘못 거부', A({ action: 'apAdminMark', id, status: '합격!' }).error === 'bad_input');
r = A({ action: 'apAdminMark', id, status: '서류 통과', memo: '+성실' });
ok('상태·메모', r.ok && r.row.status === '서류 통과' && r.row.memo === "'+성실");
r = A({ action: 'apAdminMark', id, resetPin: true });
ok('확인 번호 풀기', r.ok && r.row.pinless === true);
r = POST(base({ edit: true, pin: '5678', answers: { motive: '새 번호' } }));
ok('풀린 뒤 새 번호로 고치기(틀린 횟수도 지워짐)', r.ok);
ok('새 번호만 맞음', POST(base({ edit: true, pin: '1234' })).error === 'pin' && POST({ action: 'apMine', sid: '10305', pin: '5678' }).ok);
ok('고쳐도 심사 상태 그대로', A({ action: 'apAdmin' }).rows[0].status === '서류 통과');
ok('2학년 추가 모집 열기', A({ action: 'apAdminSet', g2New: true }).g2New === true && POST(base({ sid: '20305', pin: '4321' })).ok);
A({ action: 'apAdminSet', g2New: false });
ok('추가 모집을 꺼도 2학년 신규 신청은 고칠 수 있음', POST(base({ sid: '20305', pin: '4321', edit: true, answers: { motive: '고침' } })).ok);
ok('추가 모집 끈 뒤 2학년 새 신규는 막힘', POST(base({ sid: '20306', pin: '4321' })).error === 'grade');
const big = {}; for (let k = 0; k < 30; k++) big['q' + k] = '"'.repeat(1500);
ok('시트 칸 한도 넘는 답 거부', POST(base({ sid: '10901', answers: big })).error === 'bad_input');
ok('부장·차장 2학년(2지망 없음)', POST(base({ sid: '20101', track: 'lead', role: 'any', d2: '' })).ok);
A({ action: 'apAdminMark', id, status: '취소' });
ok('취소된 신청은 못 고침', POST(base({ edit: true, pin: '5678' })).error === 'closed');
ok('닫기', A({ action: 'apAdminSet', open: false }).accepting === false && POST(base({ sid: '10101' })).error === 'closed');

const fail = results.filter(x => x.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(fail.length ? fail.length + ' FAIL' : 'ALL PASS ' + results.length);
process.exit(fail.length ? 1 : 0);
