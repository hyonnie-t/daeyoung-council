/* ════════════════════════════════════════════════════════
 * 학생회 행사 상점 사용 기록 (2026-11-05 효니 요청)
 * 대영중_학생회_DB_2026 시트에 연결된 앱스크립트. 소스 원본은 daeyoung-council apps-script/sangjeom/Code.gs (공개 레포라 비밀번호를 넣지 않는다).
 * 역사 수업 포털(history26_backend)과 별개다. 효니 결정: 포털은 역사 수업용이라 학생회 일을 넣지 않는다.
 *  - 학생회 앱 sangjeom.html이 부른다. 담당 학생은 비밀번호로만 쓰고, 효니가 열어 둘 때만 동작한다(기본 잠금).
 *  - e알리미에서 뽑은 상점 합계를 시트 `상점_잔액`에 넣고, 행사 중 사용은 `상점_사용기록`에 쌓는다. e알리미 차감은 행사 뒤
 *    효니 확인을 받아 클로드가 음수로 등록한다(클로드작업\도구\ealimi\상점행사.ps1).
 *  - 남은 상점 = 넣은 상점 − (취소 아닌 기록 중 «아직 반영 안 됐거나, 점수를 읽은 뒤에 반영된» 것).
 *    점수를 읽기 전에 이미 반영된 기록은 넣은 점수에 빠져 있으니 또 빼지 않는다. 그래서 snapAt은 받은 시각이 아니라 e알리미를 읽기 시작한 시각이다.
 *  - 이중 차감 방지: e알리미 등록 전에 sjClaim으로 «처리 시작»을 찍는다. 찍힌 기록은 다시 등록 대상이 되지 않고 취소도 안 된다.
 *    등록 뒤 무엇이 실패해도 재실행으로 또 빠지지 않는다. 정리는 효니가 e알리미를 보고 sjMark(들어갔음)나 sjRelease(안 들어갔음)로 한다.
 *    처리 중인 기록이 남아 있으면 점수를 다시 넣지 못한다(sjLoad). 잠겨 있을 때만 처리를 시작할 수 있다(도중 기록·취소를 막으려고).
 *  - 학생 쪽 응답에는 점수를 주지 않는다. 벌점·연락처는 시트에 넣지도 않는다. 다만 비밀번호를 가진 담당 학생은 1~10점을 차례로 물어 점수를
 *    추정할 수는 있다. 같은 학생 조회 상한으로 줄이기만 한다(담당자는 효니가 고른 학생이라 이 정도로 둔다).
 *  - 담당 비밀번호는 8글자 이상이고 틀려도 잠그지 않는다. 전체 합산으로 잠그면 비밀번호를 모르는 누구나 행사를 멈출 수 있어서다.
 *    틀린 횟수는 관리 화면에 보여 준다. 잠그면 담당 비밀번호도 지운다. 다음 행사에는 새로 정해야 한다.
 *  - 관리 비밀번호(10글자 이상)는 시트 메뉴 «상점 기록 > 관리 비밀번호 정하기»로 정한다. 시트를 열 수 있는 사람만 정하거나 바꿀 수 있다. 틀려도 잠그지 않는다(누구나 효니의 잠그기를 막을 수 있어서다).
 *  - 행사ID는 잠긴 상태에서 다른 이름으로 열 때만 바뀐다. 열어 둔 채 오타를 고쳐도 목록·취소가 끊기지 않는다.
 *  - 시트 공유를 넓히면 전교생 점수가 그대로 보인다. 이 시트는 효니만 볼 수 있게 둔다.
 * 응답: {ok:true, ...} 또는 {ok:false, error}
 *   error = locked / wrong_pw / busy(조회·틀린 횟수 상한) / no_data / not_found / short / bad_input / no_auth / no_admin(시트 메뉴에서 관리 비밀번호를 정하기 전) /
 *           no_record / already(처리 시작·반영된 기록) / cancelled / claimed(처리 중 기록 있음) / must_lock(먼저 잠그기) / server
 * ════════════════════════════════════════════════════════ */
const SJ_BALANCE_SHEET = '상점_잔액';
const SJ_BALANCE_HEADERS = ['학번', '이름', '상점'];
const SJ_LOG_SHEET = '상점_사용기록';
const SJ_LOG_HEADERS = ['기록ID', '시각', '행사', '학번', '이름', '점수', '기록자', '상태', '반영시각', '처리시작', '행사ID', '취소자'];
const SJC_ID = 0, SJC_AT = 1, SJC_EVENT = 2, SJC_SID = 3, SJC_NAME = 4, SJC_POINT = 5, SJC_BY = 6, SJC_STATUS = 7, SJC_DONE = 8, SJC_CLAIM = 9, SJC_EVENT_ID = 10, SJC_CANCEL_BY = 11;
const SJ_STATUS_OK = '정상';
const SJ_STATUS_CANCEL = '취소';
const SJ_PROP = 'SANGJEOM_EVENT_JSON';       // {open, hash, event, eventId, snapAt, adminHash}
const SJ_ADMIN_NAME = '선생님';
const SJ_SECRET_PROP = 'SANGJEOM_SECRET';
const SJ_MAX_POINT = 10;
const SJ_PW_MIN = 8;
const SJ_PW_MAX = 40;
const SJ_ADMIN_MIN = 10;
const SJ_ADMIN_WRONG_KEY = 'sj_admin_wrong';
const SJ_WRONG_KEY = 'sj_wrong_pw';
const SJ_WRONG_SEC = 6 * 60 * 60;
const SJ_CHECK_SEC = 10 * 60;
const SJ_CHECK_ALL_MAX = 200;
const SJ_CHECK_ONE_MAX = 12;
const SJ_READ_MAX_AGE_MS = 30 * 60 * 1000;
const SJ_RECENT = 30;

function sjConfig_() {
  const raw = PropertiesService.getScriptProperties().getProperty(SJ_PROP);
  if (raw) { try { const o = JSON.parse(raw); if (o && typeof o === 'object') return o; } catch (e) { /* 깨졌으면 잠긴 상태로 */ } }
  return { open: false, hash: '', event: '', eventId: '', snapAt: 0, adminHash: '' };
}
function sjSaveConfig_(c) { PropertiesService.getScriptProperties().setProperty(SJ_PROP, JSON.stringify(c)); }
function sjOut_(o) { return json_(o); }
function sjErr_(code, extra) { return json_(Object.assign({ ok: false, error: code }, extra || {})); }
// 예외를 라우터 공통 오류로 흘리지 않는다(잠금 초과를 «준비 중»으로 잘못 안내하게 된다)
function sjTry_(fn, arg) {
  try { return fn(arg); } catch (err) { console.error('sangjeom: ' + err); return sjErr_('server'); }
}

// 시트에 수식으로 들어가지 않게 앞머리를 막고 길이를 줄인다
function sjText_(v, max) {
  const s = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
// 시트에 텍스트 서식으로 넣는 값이라 앞머리를 막지 않는다(행사 이름이 '-봄 행사로 보였다)
function sjPlain_(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }
function sjPw_(v) { return String(v == null ? '' : v).trim(); }
function sjSid_(v) { const s = String(v == null ? '' : v).trim(); return /^[1-3]\d{4}$/.test(s) ? s : ''; }
function sjPoint_(v) { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= SJ_MAX_POINT ? n : 0; }
function sjTime_(v) { if (!v) return 0; const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
function sjIdSet_(v) { // 일반 객체는 constructor 같은 기록ID에 걸린다(첫 검토에서 재현)
  const ids = Object.create(null);
  (Array.isArray(v) ? v : []).forEach(function (x) { ids[String(x)] = true; });
  return ids;
}
function sjCount_(key, sec) {
  const cache = CacheService.getScriptCache();
  const n = (Number(cache.get(key)) || 0) + 1;
  cache.put(key, String(n), sec);
  return n;
}

function sjSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}
function sjBalanceMap_() {
  const sh = sjSheet_(SJ_BALANCE_SHEET, SJ_BALANCE_HEADERS);
  const last = sh.getLastRow();
  const map = Object.create(null);
  if (last < 2) return map;
  sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r) {
    const sid = String(r[0]).trim();
    if (sid) map[sid] = { name: String(r[1]), point: Number(r[2]) || 0 };
  });
  return map;
}
function sjLogRows_() {
  const sh = sjSheet_(SJ_LOG_SHEET, SJ_LOG_HEADERS);
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, SJ_LOG_HEADERS.length).getValues();
}
// 학번별로 넣은 점수에서 더 빼야 하는 합. 규칙은 맨 위 주석.
function sjSpentMap_(rows, snapAt) {
  const m = Object.create(null);
  rows.forEach(function (r) {
    if (String(r[SJC_STATUS]) !== SJ_STATUS_OK) return;
    const done = sjTime_(r[SJC_DONE]);
    if (done && done <= snapAt) return;
    const sid = String(r[SJC_SID]).trim();
    m[sid] = (m[sid] || 0) + (Number(r[SJC_POINT]) || 0);
  });
  return m;
}
function sjLogView_(r) {
  return {
    id: String(r[SJC_ID]), at: sjTime_(r[SJC_AT]), event: String(r[SJC_EVENT]), sid: String(r[SJC_SID]).trim(), name: String(r[SJC_NAME]),
    point: Number(r[SJC_POINT]) || 0, by: String(r[SJC_BY]), status: String(r[SJC_STATUS]), done: sjTime_(r[SJC_DONE]), claim: sjTime_(r[SJC_CLAIM]),
    cancelBy: String(r[SJC_CANCEL_BY] || '')
  };
}

/* 담당 학생 관문: 잠금 → 비밀번호. 통과하면 null, 막히면 응답. */
function sjGate_(data, cfg) {
  if (!cfg.open || !cfg.hash) return sjErr_('locked');
  if (saHmac_('sj:' + sjPw_(data.pw)) !== cfg.hash) {
    sjCount_(SJ_WRONG_KEY, SJ_WRONG_SEC);
    return sjErr_('wrong_pw');
  }
  return null;
}

/* action=sjAuth {pw} → {ok, event} */
function sjAuthPost_(data) {
  const cfg = sjConfig_();
  return sjGate_(data, cfg) || sjOut_({ ok: true, event: cfg.event || '' });
}

/* action=sjCheck {pw, sid, point} → {ok, name, enough}. 점수는 주지 않는다. */
function sjCheckPost_(data) {
  const cfg = sjConfig_();
  const blocked = sjGate_(data, cfg);
  if (blocked) return blocked;
  const sid = sjSid_(data.sid), point = sjPoint_(data.point);
  if (!sid || !point) return sjErr_('bad_input');
  if (sjCount_('sj_chk_all', SJ_CHECK_SEC) > SJ_CHECK_ALL_MAX || sjCount_('sj_chk_' + sid, SJ_CHECK_SEC) > SJ_CHECK_ONE_MAX) return sjErr_('busy');
  const bal = sjBalanceMap_();
  if (!Object.keys(bal).length) return sjErr_('no_data');
  const st = bal[sid];
  if (!st) return sjErr_('not_found');
  const spent = sjSpentMap_(sjLogRows_(), cfg.snapAt || 0)[sid] || 0;
  return sjOut_({ ok: true, sid: sid, name: st.name, enough: st.point - spent >= point });
}

/* action=sjSpend {pw, sid, point, by, reqId} → {ok, id, name}. 같은 reqId를 다시 보내면(더블탭·재전송) 새로 쓰지 않는다. */
function sjSpendPost_(data) {
  const first = sjGate_(data, sjConfig_());
  if (first) return first;
  const sid = sjSid_(data.sid), point = sjPoint_(data.point);
  const by = sjPlain_(data.by, 20);
  const reqId = String(data.reqId == null ? '' : data.reqId).replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  if (!sid || !point || !by || !reqId) return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cfg = sjConfig_(); // 잠금 안에서 다시 읽는다. 기다리는 사이에 잠겼으면 쓰지 않는다
    const again = sjGate_(data, cfg);
    if (again) return again;
    const rows = sjLogRows_();
    const dup = rows.filter(function (r) { return String(r[SJC_ID]) === reqId; })[0];
    if (dup) {
      if (String(dup[SJC_SID]).trim() !== sid || Number(dup[SJC_POINT]) !== point) return sjErr_('bad_input');
      if (String(dup[SJC_STATUS]) !== SJ_STATUS_OK) return sjErr_('cancelled');
      return sjOut_({ ok: true, id: reqId, name: String(dup[SJC_NAME]), repeated: true });
    }
    const bal = sjBalanceMap_();
    if (!Object.keys(bal).length) return sjErr_('no_data');
    const st = bal[sid];
    if (!st) return sjErr_('not_found');
    const spent = sjSpentMap_(rows, cfg.snapAt || 0)[sid] || 0;
    if (st.point - spent < point) return sjErr_('short', { name: st.name });
    const sh = sjSheet_(SJ_LOG_SHEET, SJ_LOG_HEADERS);
    sh.appendRow(['', new Date(), '', sid, sjText_(st.name, 20), point, '', SJ_STATUS_OK, '', '', cfg.eventId || '', '']);
    const row = sh.getLastRow();
    // «12/20» 행사 이름, «3-1» 기록자, 숫자 모양 기록ID가 시트에서 바뀌지 않게 텍스트 칸으로 쓴다
    sh.getRange(row, SJC_ID + 1).setNumberFormat('@').setValue(reqId);
    sh.getRange(row, SJC_EVENT + 1).setNumberFormat('@').setValue(sjPlain_(cfg.event, 40));
    sh.getRange(row, SJC_BY + 1).setNumberFormat('@').setValue(by);
    SpreadsheetApp.flush();
    return sjOut_({ ok: true, id: reqId, name: st.name });
  } finally { lock.releaseLock(); }
}

/* action=sjRecent {pw} → {ok, rows}. 지금 행사 기록만 최신순. */
function sjRecentPost_(data) {
  const cfg = sjConfig_();
  const blocked = sjGate_(data, cfg);
  if (blocked) return blocked;
  const rows = sjLogRows_().filter(function (r) { return String(r[SJC_EVENT_ID]) === String(cfg.eventId); }).map(sjLogView_).reverse().slice(0, SJ_RECENT)
    .map(function (x) { return { id: x.id, at: x.at, sid: x.sid, name: x.name, point: x.point, by: x.by, status: x.status, locked: !!(x.done || x.claim) }; });
  return sjOut_({ ok: true, rows: rows });
}

/* action=sjCancel {pw, id, by} → 잘못 쓴 기록 취소. 반영이 시작된 기록은 못 지운다(효니가 처리). */
function sjCancelPost_(data) {
  const first = sjGate_(data, sjConfig_());
  if (first) return first;
  const id = String(data.id == null ? '' : data.id);
  const by = sjPlain_(data.by, 20);
  if (!id || !by) return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cfg = sjConfig_();
    const again = sjGate_(data, cfg);
    if (again) return again;
    const rows = sjLogRows_();
    for (let i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][SJC_ID]) !== id) continue;
      if (String(rows[i][SJC_EVENT_ID]) !== String(cfg.eventId)) return sjErr_('no_record'); // 지난 행사 기록은 담당 학생이 못 건드린다
      if (sjTime_(rows[i][SJC_DONE]) || sjTime_(rows[i][SJC_CLAIM])) return sjErr_('already');
      sjMarkCancelled_(i, by);
      return sjOut_({ ok: true });
    }
    return sjErr_('no_record');
  } finally { lock.releaseLock(); }
}
function sjMarkCancelled_(i, by) {
  const sh = sjSheet_(SJ_LOG_SHEET, SJ_LOG_HEADERS);
  sh.getRange(i + 2, SJC_STATUS + 1).setValue(SJ_STATUS_CANCEL);
  sh.getRange(i + 2, SJC_CANCEL_BY + 1).setNumberFormat('@').setValue(by);
  SpreadsheetApp.flush();
}

/* ── 관리(효니) 전용 ── */
/* 관리 관문: 설정 전이면 no_admin, 관리 비밀번호. 통과하면 null. */
function sjAdminGate_(data, cfg) {
  if (!cfg.adminHash) return sjErr_('no_admin');
  if (saHmac_('sjadmin:' + sjPw_(data.key)) !== cfg.adminHash) {
    sjCount_(SJ_ADMIN_WRONG_KEY, SJ_WRONG_SEC);
    return sjErr_('no_auth');
  }
  return null;
}

/* 시트 메뉴: 관리 비밀번호 정하기·바꾸기. 시트를 열 수 있는 사람만 쓸 수 있다. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('상점 기록').addItem('관리 비밀번호 정하기', 'sjAdminMenu').addToUi();
}
function sjAdminMenu() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('관리 비밀번호 정하기', SJ_ADMIN_MIN + '글자 이상. 전교생 상점을 보는 비밀번호라 다른 곳에서 쓰지 않는 값으로 정해 주세요. 이미 있으면 바뀝니다.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  ui.alert(sjSetAdminKey_(res.getResponseText()) ? '정했습니다.' : SJ_ADMIN_MIN + '글자 이상으로 다시 정해 주세요.');
}
function sjSetAdminKey_(value) {
  const key = sjPw_(value);
  if (key.length < SJ_ADMIN_MIN || key.length > SJ_PW_MAX) return false;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cfg = sjConfig_();
    cfg.adminHash = saHmac_('sjadmin:' + key);
    sjSaveConfig_(cfg);
    return true;
  } finally { lock.releaseLock(); }
}

/* action=sjSetup {key, open, event?, password?} → 열기·잠그기. 열 때는 행사 이름과 담당 비밀번호가 있어야 한다. 잠그면 담당 비밀번호를 지운다. */
function sjSetupPost_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cfg = sjConfig_();
    const blocked = sjAdminGate_(data, cfg);
    if (blocked) return blocked;
    const pw = sjPw_(data.password);
    if (pw) {
      if (pw.length < SJ_PW_MIN || pw.length > SJ_PW_MAX) return sjErr_('bad_input');
      cfg.hash = saHmac_('sj:' + pw);
    }
    if (data.event != null) {
      const name = sjPlain_(data.event, 40);
      if (!cfg.eventId || (name !== cfg.event && !cfg.open)) cfg.eventId = Utilities.getUuid();
      cfg.event = name;
    }
    if (data.open != null) {
      cfg.open = data.open === true;
      if (!cfg.open) cfg.hash = '';
    }
    if (cfg.open && (!cfg.hash || !cfg.event)) return sjErr_('bad_input');
    sjSaveConfig_(cfg);
    return sjOut_({ ok: true, open: cfg.open, event: cfg.event, hasPw: !!cfg.hash });
  } finally { lock.releaseLock(); }
}

/* action=sjLoad {key, readAt, rows:[{sid,name,point}]} → 잔액 표를 통째로 바꾼다. readAt은 e알리미를 읽기 시작한 시각(ms)으로 남은 상점 계산의 기준이다. */
function sjLoadPost_(data) {
  const first = sjAdminGate_(data, sjConfig_());
  if (first) return first;
  const now = Date.now();
  const readAt = Number(data.readAt);
  if (!Number.isFinite(readAt) || readAt < now - SJ_READ_MAX_AGE_MS) return sjErr_('bad_input');
  const input = Array.isArray(data.rows) ? data.rows : [];
  const seen = Object.create(null);
  const values = [];
  for (let i = 0; i < input.length; i++) {
    const sid = sjSid_(input[i] && input[i].sid);
    const point = Number(input[i] && input[i].point);
    const name = sjText_(input[i] && input[i].name, 20);
    if (!sid || !name || !Number.isFinite(point) || seen[sid]) return sjErr_('bad_input', { at: i });
    seen[sid] = true;
    values.push([sid, name, point]);
  }
  if (!values.length) return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const pending = sjLogRows_().filter(function (r) { return String(r[SJC_STATUS]) === SJ_STATUS_OK && sjTime_(r[SJC_CLAIM]) && !sjTime_(r[SJC_DONE]); });
    if (pending.length) return sjErr_('claimed', { count: pending.length });
    const sh = sjSheet_(SJ_BALANCE_SHEET, SJ_BALANCE_HEADERS);
    const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, 3).clearContent();
    sh.getRange(2, 1, values.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, values.length, 3).setValues(values);
    SpreadsheetApp.flush();
    const cfg = sjConfig_();
    cfg.snapAt = Math.min(readAt, now);
    sjSaveConfig_(cfg);
    return sjOut_({ ok: true, count: values.length, snapAt: cfg.snapAt });
  } finally { lock.releaseLock(); }
}

/* 기록 표시를 한 번에 바꾸는 공통부. pick(행)이 true인 행의 열 col에 value를 쓴다. */
function sjStamp_(ids, pick, col, value) {
  const sh = sjSheet_(SJ_LOG_SHEET, SJ_LOG_HEADERS);
  let n = 0;
  sjLogRows_().forEach(function (r, i) {
    if (!ids[String(r[SJC_ID])] || !pick(r)) return;
    sh.getRange(i + 2, col + 1).setValue(value);
    n++;
  });
  SpreadsheetApp.flush();
  return n;
}

/* action=sjClaim {key, ids} → e알리미 등록 직전에 처리 시작을 찍는다. 잠겨 있어야 하고, 하나라도 찍을 수 없으면 아무것도 안 찍는다. */
function sjClaimPost_(data) {
  const ids = sjIdSet_(data.ids);
  const wanted = Object.keys(ids).length;
  if (!wanted) return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cfg = sjConfig_();
    const blocked = sjAdminGate_(data, cfg);
    if (blocked) return blocked;
    if (cfg.open) return sjErr_('must_lock');
    const free = function (r) { return String(r[SJC_STATUS]) === SJ_STATUS_OK && !sjTime_(r[SJC_DONE]) && !sjTime_(r[SJC_CLAIM]); };
    const ready = sjLogRows_().filter(function (r) { return ids[String(r[SJC_ID])] && free(r); }).length;
    if (ready !== wanted) return sjErr_('already', { ready: ready, wanted: wanted });
    return sjOut_({ ok: true, claimed: sjStamp_(ids, free, SJC_CLAIM, new Date()) });
  } finally { lock.releaseLock(); }
}

/* action=sjMark {key, ids} → 처리 시작을 찍은 기록이 e알리미에 들어갔다고 표시한다. */
function sjMarkPost_(data) {
  const ids = sjIdSet_(data.ids);
  if (!Object.keys(ids).length) return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const blocked = sjAdminGate_(data, sjConfig_());
    if (blocked) return blocked;
    const marked = sjStamp_(ids, function (r) { return String(r[SJC_STATUS]) === SJ_STATUS_OK && sjTime_(r[SJC_CLAIM]) && !sjTime_(r[SJC_DONE]); }, SJC_DONE, new Date());
    return sjOut_({ ok: true, marked: marked });
  } finally { lock.releaseLock(); }
}

/* action=sjRelease {key, ids} → e알리미에 안 들어간 것을 효니가 확인했을 때 처리 시작을 지운다. 다시 등록 대상이 된다. */
function sjReleasePost_(data) {
  const ids = sjIdSet_(data.ids);
  if (!Object.keys(ids).length) return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const blocked = sjAdminGate_(data, sjConfig_());
    if (blocked) return blocked;
    const released = sjStamp_(ids, function (r) { return sjTime_(r[SJC_CLAIM]) && !sjTime_(r[SJC_DONE]); }, SJC_CLAIM, '');
    return sjOut_({ ok: true, released: released });
  } finally { lock.releaseLock(); }
}

/* action=sjAdminCancel {key, id} → 반영 전 기록을 효니가 취소한다(전출 등으로 등록할 수 없거나 지난 행사 기록). 처리 시작·반영된 기록은 안 된다. */
function sjAdminCancelPost_(data) {
  const id = String(data.id == null ? '' : data.id);
  if (!id) return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const blocked = sjAdminGate_(data, sjConfig_());
    if (blocked) return blocked;
    const rows = sjLogRows_();
    for (let i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][SJC_ID]) !== id) continue;
      if (String(rows[i][SJC_STATUS]) !== SJ_STATUS_OK) return sjErr_('cancelled');
      if (sjTime_(rows[i][SJC_DONE]) || sjTime_(rows[i][SJC_CLAIM])) return sjErr_('already');
      sjMarkCancelled_(i, SJ_ADMIN_NAME);
      return sjOut_({ ok: true });
    }
    return sjErr_('no_record');
  } finally { lock.releaseLock(); }
}

/* action=sjAdmin {key} → 효니 폰 화면·반영 도구용. 넣은 점수·남은 상점·기록 전체. 비밀번호가 주소에 남지 않게 POST로 받는다. */
function sjAdminPost_(data) {
  const cfg = sjConfig_();
  const blocked = sjAdminGate_(data, cfg);
  if (blocked) return blocked;
  const bal = sjBalanceMap_();
  const log = sjLogRows_();
  const spent = sjSpentMap_(log, cfg.snapAt || 0);
  const rows = Object.keys(bal).sort().map(function (sid) {
    return { sid: sid, name: bal[sid].name, point: bal[sid].point, left: bal[sid].point - (spent[sid] || 0) };
  });
  return sjOut_({
    ok: true, now: Date.now(), open: !!cfg.open, event: cfg.event || '', hasPw: !!cfg.hash, snapAt: cfg.snapAt || 0, // now: PC 시계가 틀려도 읽기 시작 시각이 어긋나지 않게
    wrongPw: Number(CacheService.getScriptCache().get(SJ_WRONG_KEY)) || 0, rows: rows, log: log.map(sjLogView_).reverse()
  });
}

/* ── 공통 ── */
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function saHmac_(text) {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty(SJ_SECRET_PROP);
  if (!secret) { secret = Utilities.getUuid() + Utilities.getUuid(); props.setProperty(SJ_SECRET_PROP, secret); }
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(String(text), secret));
}
const SJ_ROUTES = {
  sjAuth: sjAuthPost_, sjCheck: sjCheckPost_, sjSpend: sjSpendPost_, sjRecent: sjRecentPost_, sjCancel: sjCancelPost_,
  sjAdmin: sjAdminPost_, sjAdminCancel: sjAdminCancelPost_, sjSetup: sjSetupPost_, sjLoad: sjLoadPost_, sjClaim: sjClaimPost_, sjMark: sjMarkPost_, sjRelease: sjReleasePost_
};
function doPost(e) {
  let data = null;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return sjErr_('bad_input'); }
  const fn = data && Object.prototype.hasOwnProperty.call(SJ_ROUTES, data.action) ? SJ_ROUTES[data.action] : null;
  return fn ? sjTry_(fn, data) : sjErr_('bad_input');
}
function doGet() { return json_({ ok: true, service: 'sangjeom' }); }
