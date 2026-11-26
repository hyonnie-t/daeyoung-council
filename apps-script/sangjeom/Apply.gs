/* ════════════════════════════════════════════════════════
 * 2027 학생회 집행부 임원 온라인 신청 (2026-11-14 효니 요청)
 * 상점 기록과 같은 앱스크립트 프로젝트(대영중_학생회_DB_2026 시트)에 «Apply» 파일로 넣는다. Code.gs의 json_·saHmac_·sjText_·
 * sjCount_·sjSheet_·sjConfig_·sjAdminGate_를 같이 쓴다. 공개 레포라 비밀번호를 넣지 않는다.
 *  - 학생 apply.html: 로그인 없이 학번·이름과 확인 번호(숫자 4자리)로 낸다. 마감 전에는 같은 학번+확인 번호로 다시 내면 고쳐진다.
 *    확인 번호는 HMAC으로만 저장하고, 같은 학번에서 틀리면 30분에 5번까지만 받는다(4자리라 마구 넣어 보기를 막는다).
 *  - 심사판 apply.html?teacher=1: 상점 관리 비밀번호(sjAdminGate_)로 연다(효니 결정 2026-11-14). 신청 열기·닫기,
 *    심사 상태·메모를 고친다(«2학년 신규 추가 모집»은 2026-11-24 새 지원서로 없어짐 — 2학년도 늘 신규로 낼 수 있다). 벌점은 시트에 넣지 않는다(심사 때 e알리미에서 성실성 참고로만 본다, 2026-11-11 결정).
 *  - 문항은 apply.html의 FORM이 정한다(효니 «나중에 다시 고칠 수 있게»). 서버는 공통 칸만 검사하고 답은 JSON으로 그대로 둔다.
 *  - 심사위원별 점수(2026-11-24): 심사위원마다 다른 입장 번호로 apply.html?judge=1에서 자기 점수만 매긴다(아래 «심사위원별 점수»).
 *  - 지원 구분(2026-11-24 종이 지원서 수정본에 맞춤): 신규 임원(지금 임원이 아닌 1·2학년, 자리는 부원 — 지금 2학년만 부장·차장도) /
 *    기존 임원(지금 임원, 부장·차장·부원). 자리는 여러 개 골라 roles 배열로 보내고 시트엔 «부장·차장·부원»처럼 적는다.
 *    옛 구분 «부장·차장»(lead)과 옛 자리 키(head·vice·any)는 이미 받은 신청·열어 둔 옛 화면 때문에 그대로 받는다.
 *  - «보관»(2026-11-25 효니 «잘못 신청한 애 … 보관이 나을 거 같아»): 잘못 낸 신청을 시트에 남긴 채 빼 둔다. «취소»처럼 숫자·심사위원판에서 빠지고,
 *    «취소»와 달리 그 학번을 비워 학생이 같은 학번으로 새로 낼 수 있다(apFind_가 보관 줄을 건너뜀). 같은 학번에 보관 아닌 줄이 있으면 보관을 되돌리지 못한다.
 *  - 기본은 닫힘. 효니가 심사판에서 열 때만 받는다. AP_DEADLINE이 지나면 열어 둬도 받지 않는다(고치기도 막힘).
 * 응답: {ok:true, ...} 또는 {ok:false, error}
 *   error = closed / bad_input / grade(학년이 지원 구분과 안 맞음) / pin(확인 번호 틀림) / busy(틀린 횟수 상한) / exists(이미 낸 학번, 고치기로)
 *           / not_found / no_auth / no_admin / server
 * ════════════════════════════════════════════════════════ */
const AP_SHEET = '임원_신청';
const AP_HEADERS = ['신청ID', '처음 낸 시각', '고친 시각', '학번', '이름', '성별', '지원 구분', '회장 후보', '1지망', '2지망', '부장·차장 희망', '답(읽기용)', '답(JSON)', '확인번호(암호)', '심사 상태', '심사 메모', '고친 횟수'];
const APC = { ID: 0, AT: 1, EDIT: 2, SID: 3, NAME: 4, GENDER: 5, TRACK: 6, CAND: 7, D1: 8, D2: 9, ROLE: 10, TEXT: 11, JSON: 12, PIN: 13, STATUS: 14, MEMO: 15, EDITS: 16 };
const AP_PROP = 'APPLY_2027_JSON';            // {open, g2New(2026-11-24부터 안 씀)}
const AP_DEADLINE = '2026-12-04T23:59:59+09:00'; // 접수 마감(공고와 같게). 바뀌면 여기와 apply.html DEADLINE을 같이 고친다
// 시트에 적히는 이름은 이미 받은 신청과 묶어 보려고 그대로 둔다(화면에서는 «기존 임원»으로 보임). lead는 옛 화면용
const AP_TRACKS = { new: '신규 임원', member: '기존 임원 계속', lead: '부장·차장' };
const AP_DEPTS = ['자율질서부', '알림부', '행사진행부', '홍보기획부'];
const AP_ROLES = { '': '', head: '부장', vice: '차장', any: '부장·차장 모두' }; // 옛 화면(lead)용 한 개 고르기
const AP_SEATS = ['부장', '차장', '부원']; // 2026-11-24 새 지원서: 여러 개 고르기(이 순서로 이어 적음)
const AP_GENDERS = ['남', '여'];
const AP_STATUSES = ['접수', '서류 통과', '보류', '불합격', '취소', '보관'];
const AP_ARCHIVED = '보관';
const AP_WRONG_SEC = 30 * 60;
const AP_WRONG_MAX = 5;
const AP_TEXT_MAX = 1500;
const AP_KEYS_MAX = 30;
const AP_CELL_MAX = 20000;

function apConfig_() {
  const raw = PropertiesService.getScriptProperties().getProperty(AP_PROP);
  if (raw) { try { const o = JSON.parse(raw); if (o && typeof o === 'object') return o; } catch (e) { /* 깨졌으면 닫힘 */ } }
  return { open: false, g2New: false };
}
function apSaveConfig_(c) { PropertiesService.getScriptProperties().setProperty(AP_PROP, JSON.stringify(c)); }
function apPastDeadline_() { return Date.now() > new Date(AP_DEADLINE).getTime(); }
function apAccepting_(cfg) { return !!cfg.open && !apPastDeadline_(); }
function apSid_(v) { const s = String(v == null ? '' : v).trim(); return /^[1-3](0[1-9]|1[0-5])(0[1-9]|[1-3]\d|40)$/.test(s) ? s : ''; }
function apPin_(v) { const s = String(v == null ? '' : v).trim(); return /^\d{4}$/.test(s) ? s : ''; }
function apPinHash_(sid, pin) { return saHmac_('ap:' + sid + ':' + pin); }
function apRows_() {
  const sh = sjSheet_(AP_SHEET, AP_HEADERS);
  const last = sh.getLastRow();
  return { sh: sh, rows: last < 2 ? [] : sh.getRange(2, 1, last - 1, AP_HEADERS.length).getValues() };
}
// 보관한 줄은 없는 것처럼 건너뛴다(학생이 같은 학번으로 새로 낼 수 있게). skip은 이 줄 번호를 빼고 찾을 때
function apFind_(rows, sid, skip) {
  for (let i = 0; i < rows.length; i++) if (i !== skip && String(rows[i][APC.SID]) === sid && String(rows[i][APC.STATUS]) !== AP_ARCHIVED) return i;
  return -1;
}
// 심사에서 빠지는 신청(취소·보관)
function apHidden_(r) { const s = String(r[APC.STATUS]); return s === '취소' || s === AP_ARCHIVED; }
function apParseAnswers_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length > AP_KEYS_MAX) return null;
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], v = raw[k];
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(k)) return null;
    if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.replace(/\r\n?/g, '\n').trim().slice(0, AP_TEXT_MAX);
    else return null;
  }
  return out;
}
// 시트에서 읽기 쉬운 한 칸. labels {키: 문항 이름}은 화면이 보낸 것이라 길이만 줄인다
function apReadable_(answers, labels) {
  const lb = labels && typeof labels === 'object' ? labels : {};
  return Object.keys(answers).map(function (k) {
    const v = answers[k];
    const name = String(lb[k] == null ? k : lb[k]).slice(0, 40);
    return '[' + name + '] ' + (v === true ? '예' : v === false ? '아니오' : v);
  }).join('\n');
}
function apView_(r, withPrivate) {
  let answers = {};
  try { answers = JSON.parse(r[APC.JSON] || '{}'); } catch (e) { answers = {}; }
  const o = {
    id: String(r[APC.ID]), at: sjTime_(r[APC.AT]), edit: sjTime_(r[APC.EDIT]), sid: String(r[APC.SID]), name: String(r[APC.NAME]),
    gender: String(r[APC.GENDER]), track: String(r[APC.TRACK]), cand: r[APC.CAND] === true || r[APC.CAND] === 'TRUE' || r[APC.CAND] === '예',
    d1: String(r[APC.D1]), d2: String(r[APC.D2]), role: String(r[APC.ROLE]), answers: answers, edits: Number(r[APC.EDITS]) || 0
  };
  if (withPrivate) { o.status = String(r[APC.STATUS] || '접수'); o.memo = String(r[APC.MEMO] || ''); o.pinless = !String(r[APC.PIN]); }
  return o;
}
// 학년과 지원 구분: 신규·기존 임원=현재 1·2학년, 옛 부장·차장=현재 2학년(2026-11-24부터 2학년 추가 모집 없이 2학년도 신규로 낸다)
function apGradeOk_(track, sid) {
  const g = sid.charAt(0);
  if (track === 'new' || track === 'member') return g === '1' || g === '2';
  if (track === 'lead') return g === '2';
  return false;
}
// 고른 자리 배열 → 정해진 순서의 배열. 이상하면 null
function apSeats_(v) {
  if (!Array.isArray(v) || !v.length || v.length > AP_SEATS.length) return null;
  for (let i = 0; i < v.length; i++) if (AP_SEATS.indexOf(v[i]) < 0) return null;
  return AP_SEATS.filter(function (x) { return v.indexOf(x) >= 0; });
}
// 시트의 자리 글 → 배열(고치기 화면에 채우려고). 옛 «부장·차장 모두»도 읽는다
function apSeatsOf_(text) {
  const t = String(text == null ? '' : text);
  if (t === AP_ROLES.any) return ['부장', '차장'];
  const parts = t.split('·');
  return AP_SEATS.filter(function (x) { return parts.indexOf(x) >= 0; });
}

/* action=apInfo → 받는 중인지, 마감(g2New는 옛 화면 호환으로만 남김) */
function apInfoPost_() {
  const cfg = apConfig_();
  return json_({ ok: true, open: apAccepting_(cfg), deadline: AP_DEADLINE, past: apPastDeadline_(), g2New: !!cfg.g2New });
}

/* action=apSubmit {sid, name, gender, track, cand, d1, d2, roles(새 화면: ['부장','차장','부원'] 중 여러 개) 또는 role(옛 화면 키), answers, labels, pin, edit} → 새로 내기·고치기
 * edit=false인데 이미 낸 학번이면 exists(남이 같은 학번으로 덮지 못하게). edit=true면 확인 번호가 맞아야 고친다. */
function apSubmitPost_(data) {
  const sid = apSid_(data.sid), pin = apPin_(data.pin);
  const name = sjText_(data.name, 20);
  const gender = AP_GENDERS.indexOf(data.gender) >= 0 ? data.gender : '';
  const track = Object.prototype.hasOwnProperty.call(AP_TRACKS, data.track) ? data.track : '';
  const d1 = AP_DEPTS.indexOf(data.d1) >= 0 ? data.d1 : '';
  const d2 = data.d2 === '' || data.d2 == null ? '' : (AP_DEPTS.indexOf(data.d2) >= 0 ? data.d2 : null);
  const answers = apParseAnswers_(data.answers);
  if (!sid || !pin || !name || name.length < 2 || !gender || !track || !d1 || d2 === null || d2 === d1 || !answers) return sjErr_('bad_input');
  // 자리: 새 화면은 roles 배열(신규·기존 임원은 꼭 하나 이상), 옛 화면은 role 키(부장·차장 구분만 꼭)
  let roleText;
  if (track === 'lead' || data.roles == null) {
    const role = Object.prototype.hasOwnProperty.call(AP_ROLES, data.role || '') ? (data.role || '') : null;
    if (role === null || (track === 'lead' && !role)) return sjErr_('bad_input');
    roleText = AP_ROLES[role];
  } else {
    const seats = apSeats_(data.roles);
    if (!seats) return sjErr_('bad_input');
    // 신규 임원 중 부장·차장은 지금 2학년만(종이 지원서 «지금 2학년만»). 고치기에서도 늘 본다
    if (track === 'new' && sid.charAt(0) !== '2' && seats.some(function (x) { return x !== '부원'; })) return sjErr_('grade');
    roleText = seats.join('·');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cfg = apConfig_();
    if (!apAccepting_(cfg)) return sjErr_('closed');
    const wrongKey = 'ap_wrong_' + sid;
    if ((Number(CacheService.getScriptCache().get(wrongKey)) || 0) >= AP_WRONG_MAX) return sjErr_('busy');
    const t = apRows_();
    const i = apFind_(t.rows, sid);
    // 학년 검사는 새로 낼 때와 구분을 바꿀 때만(이미 받은 옛 구분 신청은 그대로 고칠 수 있게)
    if (!(i >= 0 && data.edit === true && String(t.rows[i][APC.TRACK]) === AP_TRACKS[track]) && !apGradeOk_(track, sid)) return sjErr_('grade');
    const now = new Date();
    const text = apReadable_(answers, data.labels);
    const json = JSON.stringify(answers);
    if (json.length > AP_CELL_MAX || text.length > AP_CELL_MAX) return sjErr_('bad_input'); // 시트 한 칸 5만 자 한도보다 넉넉히 작게
    if (i < 0) {
      if (data.edit === true) return sjErr_('not_found');
      const id = Utilities.getUuid();
      t.sh.appendRow([id, now, '', sid, name, gender, AP_TRACKS[track], data.cand === true ? '예' : '아니오', d1, d2, roleText, text, json, apPinHash_(sid, pin), '접수', '', 0]);
      return json_({ ok: true, id: id, created: true });
    }
    if (data.edit !== true) return sjErr_('exists');
    const row = t.rows[i];
    // 확인 번호를 잊은 학생은 선생님이 심사판에서 «확인 번호 풀기»를 하면 새 번호로 고칠 수 있다(칸이 비어 있음)
    if (String(row[APC.PIN]) && String(row[APC.PIN]) !== apPinHash_(sid, pin)) { sjCount_(wrongKey, AP_WRONG_SEC); return sjErr_('pin'); }
    if (String(row[APC.STATUS]) === '취소') return sjErr_('closed');
    // 심사 상태·메모·처음 낸 시각은 그대로 두고 학생이 쓴 칸만 바꾼다
    t.sh.getRange(i + 2, APC.EDIT + 1, 1, APC.PIN - APC.EDIT + 1).setValues([[now, sid, name, gender, AP_TRACKS[track], data.cand === true ? '예' : '아니오', d1, d2, roleText, text, json, apPinHash_(sid, pin)]]);
    t.sh.getRange(i + 2, APC.EDITS + 1).setValue((Number(row[APC.EDITS]) || 0) + 1);
    return json_({ ok: true, id: String(row[APC.ID]), created: false });
  } finally { lock.releaseLock(); }
}

/* action=apMine {sid, pin} → 내가 낸 신청서(고치기 화면에 채우려고). 심사 상태·메모는 주지 않는다 */
function apMinePost_(data) {
  const sid = apSid_(data.sid), pin = apPin_(data.pin);
  if (!sid || !pin) return sjErr_('bad_input');
  const wrongKey = 'ap_wrong_' + sid;
  if ((Number(CacheService.getScriptCache().get(wrongKey)) || 0) >= AP_WRONG_MAX) return sjErr_('busy');
  const t = apRows_();
  const i = apFind_(t.rows, sid);
  if (i < 0) return sjErr_('not_found');
  if (String(t.rows[i][APC.PIN]) && String(t.rows[i][APC.PIN]) !== apPinHash_(sid, pin)) { sjCount_(wrongKey, AP_WRONG_SEC); return sjErr_('pin'); }
  const v = apView_(t.rows[i], false);
  v.track = Object.keys(AP_TRACKS).filter(function (k) { return AP_TRACKS[k] === v.track; })[0] || '';
  v.roles = apSeatsOf_(v.role); // 새 화면은 이것으로 자리를 채운다
  v.role = Object.keys(AP_ROLES).filter(function (k) { return k && AP_ROLES[k] === v.role; })[0] || '';
  const cfg = apConfig_();
  return json_({ ok: true, app: v, open: apAccepting_(cfg) });
}

/* action=apAdmin {key} → 심사판 전체 */
function apAdminPost_(data) {
  const blocked = sjAdminGate_(data, sjConfig_());
  if (blocked) return blocked;
  const cfg = apConfig_();
  const raw = apRows_().rows;
  const rows = raw.map(function (r) { return apView_(r, true); });
  // 선생님 기록(추천 확인·종이 지원서·선생님 의견)과 작년 이력은 학번으로 따로 준다(2026-11-26). past는 이미 «마감 지남»이라 history로
  const notes = apNotesMap_(), history = apPastMap_(raw);
  // 심사위원별 점수 모아 보기(2026-11-24): 심사위원 목록(번호 HMAC는 빼고)과 모든 점수
  const judges = apJudges_().map(apJudgePublic_);
  const scores = apScoreRows_().rows.map(apScoreView_);
  return json_({ ok: true, now: Date.now(), open: !!cfg.open, accepting: apAccepting_(cfg), past: apPastDeadline_(), deadline: AP_DEADLINE, g2New: !!cfg.g2New, rows: rows, statuses: AP_STATUSES, judges: judges, scores: scores, stages: AP_STAGES, notes: notes, history: history, tones: AP_TONES });
}

/* action=apAdminSet {key, open?, g2New?} → 신청 열기·닫기(g2New는 2026-11-24부터 효과 없음, 옛 화면이 보내도 오류 안 나게 둠) */
function apAdminSetPost_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const blocked = sjAdminGate_(data, sjConfig_());
    if (blocked) return blocked;
    const cfg = apConfig_();
    if (typeof data.open === 'boolean') cfg.open = data.open;
    if (typeof data.g2New === 'boolean') cfg.g2New = data.g2New;
    apSaveConfig_(cfg);
    return json_({ ok: true, open: !!cfg.open, accepting: apAccepting_(cfg), g2New: !!cfg.g2New });
  } finally { lock.releaseLock(); }
}

/* action=apAdminMark {key, id, status?, memo?, resetPin?} → 심사 상태·메모, 확인 번호 풀기(학생이 잊었을 때. 다음에 고칠 때 넣는 번호가 새 번호) */
function apAdminMarkPost_(data) {
  const status = data.status == null ? null : (AP_STATUSES.indexOf(data.status) >= 0 ? data.status : '');
  if (status === '' || (status === null && data.memo == null && data.resetPin !== true)) return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const blocked = sjAdminGate_(data, sjConfig_());
    if (blocked) return blocked;
    const t = apRows_();
    let i = -1;
    for (let j = 0; j < t.rows.length; j++) if (String(t.rows[j][APC.ID]) === String(data.id)) { i = j; break; }
    if (i < 0) return sjErr_('not_found');
    // 보관을 되돌리면 그 학번이 다시 차므로, 같은 학번으로 새로 낸 신청(보관 아닌 줄)이 있으면 막는다
    if (status !== null && status !== AP_ARCHIVED && String(t.rows[i][APC.STATUS]) === AP_ARCHIVED && apFind_(t.rows, String(t.rows[i][APC.SID]), i) >= 0) return sjErr_('exists');
    if (status !== null) t.sh.getRange(i + 2, APC.STATUS + 1).setValue(status);
    if (data.resetPin === true) { t.sh.getRange(i + 2, APC.PIN + 1).setValue(''); t.rows[i][APC.PIN] = ''; CacheService.getScriptCache().remove('ap_wrong_' + String(t.rows[i][APC.SID])); }
    if (data.memo != null) t.sh.getRange(i + 2, APC.MEMO + 1).setValue(sjText_(String(data.memo), 300));
    t.rows[i][APC.STATUS] = status !== null ? status : t.rows[i][APC.STATUS];
    if (data.memo != null) t.rows[i][APC.MEMO] = sjText_(String(data.memo), 300);
    return json_({ ok: true, row: apView_(t.rows[i], true) });
  } finally { lock.releaseLock(); }
}

/* ═════════════ 심사위원별 점수(2026-11-24 효니 «심사위원판 인원별로 나눠서, 비번은 다르게») ═════════════
 *  - 심사위원은 효니가 심사판에서 이름으로 더한다. 서버가 사람마다 다른 입장 번호를 만들어 한 번만 보여 주고 HMAC만 남긴다.
 *    잊으면 «번호 새로 만들기»(옛 번호는 바로 막힘). 빼려면 «끄기»(매긴 점수는 남는다).
 *  - 심사위원은 apply.html?judge=1에서 입장 번호로 들어와 자기 점수만 보고 매긴다. 다른 사람 점수·심사 상태·메모·교사 추천·확인 번호는 안 보인다.
 *  - 점수는 «임원_심사점수» 시트에 (신청ID, 심사위원ID, 단계)마다 한 줄. 효니 심사판이 사람별 합계·평균으로 모아 보여 준다.
 *  - 단계·항목·만점은 AP_STAGES가 정한다(화면은 서버가 준 대로 그린다). 항목을 바꾸면 이미 매긴 점수의 옛 항목은 합계에서 빠진다. */
const AP_JUDGE_PROP = 'APPLY_2027_JUDGES';   // [{id, name, hash, on}]
const AP_SCORE_SHEET = '임원_심사점수';
const AP_SCORE_HEADERS = ['신청ID', '심사위원ID', '심사위원', '단계', '점수(JSON)', '합계', '메모', '고친 시각', '학번', '이름'];
const APS = { APP: 0, JID: 1, JNAME: 2, STAGE: 3, JSON: 4, TOTAL: 5, MEMO: 6, AT: 7, SID: 8, NAME: 9 };
const AP_STAGES = [
  { id: 'doc', label: '1차 서류', items: [
    { id: 'motive', label: '지원 동기·포부', max: 5 },
    { id: 'plan', label: '행사 기획(우리 학교에 맞게)', max: 5 },
    { id: 'solve', label: '갈등 해소·문제 해결', max: 5 },
    { id: 'drive', label: '주도성·성실성 사례', max: 5 }] },
  { id: 'talk', label: '2차 면접', items: [
    { id: 'real', label: '서류 내용 확인(진정성)', max: 5 },
    { id: 'speak', label: '말하기·소통', max: 5 },
    { id: 'solve', label: '문제 해결', max: 5 },
    { id: 'duty', label: '책임감·태도', max: 5 }] },
  { id: 'dept', label: '3차 부서 면접', items: [
    { id: 'task', label: '부서 실습', max: 5 },
    { id: 'know', label: '부서 일 이해', max: 5 },
    { id: 'team', label: '협력', max: 5 }] }
];
const AP_JUDGE_MAX = 12;
const AP_JUDGE_WRONG_KEY = 'ap_judge_wrong';
const AP_JUDGE_WRONG_MAX = 30;                // 모든 심사위원 합쳐 30분에 30번 틀리면 잠시 막는다
const AP_CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // 헷갈리는 0·o·1·l·i 뺌

function apJudges_() {
  const raw = PropertiesService.getScriptProperties().getProperty(AP_JUDGE_PROP);
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) return a; } catch (e) { /* 깨졌으면 빈 목록 */ } }
  return [];
}
function apSaveJudges_(a) { PropertiesService.getScriptProperties().setProperty(AP_JUDGE_PROP, JSON.stringify(a)); }
function apJudgeHash_(code) { return saHmac_('apjudge:' + String(code == null ? '' : code).trim().toLowerCase().replace(/[\s-]/g, '')); }
function apNewCode_() {
  const b = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  let s = '';
  for (let i = 0; i < 8; i++) s += AP_CODE_CHARS.charAt(parseInt(b.substr(i * 4, 4), 16) % AP_CODE_CHARS.length);
  return s.slice(0, 4) + '-' + s.slice(4);
}
function apJudgePublic_(j) { return { id: j.id, name: j.name, on: j.on !== false }; }
/* 심사위원 관문: 켜진 심사위원 중 번호가 맞는 사람. 틀리면 공통 횟수를 센다 */
function apJudgeGate_(data) {
  if ((Number(CacheService.getScriptCache().get(AP_JUDGE_WRONG_KEY)) || 0) >= AP_JUDGE_WRONG_MAX) return { err: sjErr_('busy') };
  const code = String(data.jkey == null ? '' : data.jkey).trim();
  if (!code) return { err: sjErr_('no_auth') };
  const h = apJudgeHash_(code);
  const j = apJudges_().filter(function (x) { return x.on !== false && x.hash === h; })[0];
  if (!j) { sjCount_(AP_JUDGE_WRONG_KEY, AP_WRONG_SEC); return { err: sjErr_('no_auth') }; }
  return { judge: j };
}
function apStage_(id) { return AP_STAGES.filter(function (s) { return s.id === id; })[0] || null; }
function apScoreRows_() {
  const sh = sjSheet_(AP_SCORE_SHEET, AP_SCORE_HEADERS);
  const last = sh.getLastRow();
  return { sh: sh, rows: last < 2 ? [] : sh.getRange(2, 1, last - 1, AP_SCORE_HEADERS.length).getValues() };
}
function apScoreView_(r) {
  let sc = {};
  try { sc = JSON.parse(r[APS.JSON] || '{}'); } catch (e) { sc = {}; }
  const st = apStage_(String(r[APS.STAGE]));
  // 합계는 지금 항목 기준으로 다시 센다(항목을 바꾼 뒤에도 화면과 맞게)
  const total = st ? st.items.reduce(function (a, it) { const n = Number(sc[it.id]); return a + (Number.isInteger(n) ? n : 0); }, 0) : 0;
  const full = !!st && st.items.every(function (it) { return Number.isInteger(Number(sc[it.id])) && sc[it.id] !== '' && sc[it.id] != null; });
  return { app: String(r[APS.APP]), judge: String(r[APS.JID]), stage: String(r[APS.STAGE]), scores: sc, total: total, full: full, memo: String(r[APS.MEMO] || ''), at: sjTime_(r[APS.AT]) };
}
// 심사위원에게 보여 줄 신청서: 심사에 필요한 칸만(교사 추천·심사 상태·메모·확인 번호·답은 빼고), 취소·보관은 빼고
function apJudgeApp_(r) {
  return { id: String(r[APC.ID]), sid: String(r[APC.SID]), name: String(r[APC.NAME]), gender: String(r[APC.GENDER]), track: String(r[APC.TRACK]),
    cand: r[APC.CAND] === true || r[APC.CAND] === 'TRUE' || r[APC.CAND] === '예', d1: String(r[APC.D1]), d2: String(r[APC.D2]), role: String(r[APC.ROLE]) };
}

/* action=apJudge {jkey} → 내 이름, 단계·항목, 신청서(심사용 칸만), 내가 매긴 점수 */
function apJudgePost_(data) {
  const g = apJudgeGate_(data);
  if (g.err) return g.err;
  const apps = apRows_().rows.filter(function (r) { return !apHidden_(r); }).map(apJudgeApp_);
  const mine = apScoreRows_().rows.filter(function (r) { return String(r[APS.JID]) === g.judge.id; }).map(apScoreView_);
  return json_({ ok: true, now: Date.now(), judge: apJudgePublic_(g.judge), stages: AP_STAGES, rows: apps, mine: mine });
}

/* action=apJudgeScore {jkey, app, stage, scores:{항목:점수}, memo} → 내 점수 저장(같은 신청서·단계면 덮어씀). 항목은 모두 채워야 한다 */
function apJudgeScorePost_(data) {
  const st = apStage_(String(data.stage || ''));
  const raw = data.scores && typeof data.scores === 'object' && !Array.isArray(data.scores) ? data.scores : null;
  if (!st || !raw) return sjErr_('bad_input');
  const sc = {};
  for (let i = 0; i < st.items.length; i++) {
    const it = st.items[i], n = Number(raw[it.id]);
    if (!Number.isInteger(n) || n < 1 || n > it.max) return sjErr_('bad_input');
    sc[it.id] = n;
  }
  const memo = sjText_(data.memo == null ? '' : String(data.memo), 300);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const g = apJudgeGate_(data);
    if (g.err) return g.err;
    const a = apRows_().rows.filter(function (r) { return String(r[APC.ID]) === String(data.app); })[0];
    if (!a || apHidden_(a)) return sjErr_('not_found');
    const t = apScoreRows_();
    let i = -1;
    for (let j = 0; j < t.rows.length; j++) {
      const r = t.rows[j];
      if (String(r[APS.APP]) === String(data.app) && String(r[APS.JID]) === g.judge.id && String(r[APS.STAGE]) === st.id) { i = j; break; }
    }
    const total = st.items.reduce(function (s, it) { return s + sc[it.id]; }, 0);
    const row = [String(data.app), g.judge.id, sjText_(g.judge.name, 20), st.id, JSON.stringify(sc), total, memo, new Date(), String(a[APC.SID]), String(a[APC.NAME])];
    if (i < 0) t.sh.appendRow(row);
    else t.sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
    return json_({ ok: true, score: apScoreView_(row) });
  } finally { lock.releaseLock(); }
}

/* action=apAdminJudge {key, op:add|reissue|toggle, name?, id?, on?} → 심사위원 더하기·번호 새로 만들기·끄고 켜기.
 * add·reissue는 새 입장 번호를 이 응답에서만 돌려준다(시트·속성엔 HMAC만) */
function apAdminJudgePost_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const blocked = sjAdminGate_(data, sjConfig_());
    if (blocked) return blocked;
    const list = apJudges_();
    let code = null, j = null;
    if (data.op === 'add') {
      const name = sjText_(data.name, 20).replace(/^'/, '');
      if (name.length < 1) return sjErr_('bad_input');
      if (list.length >= AP_JUDGE_MAX) return sjErr_('bad_input');
      if (list.some(function (x) { return x.name === name; })) return sjErr_('exists');
      code = apNewCode_();
      j = { id: 'j' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), name: name, hash: apJudgeHash_(code), on: true };
      list.push(j);
    } else {
      j = list.filter(function (x) { return x.id === String(data.id); })[0];
      if (!j) return sjErr_('not_found');
      if (data.op === 'reissue') { code = apNewCode_(); j.hash = apJudgeHash_(code); } // 켜고 끄기는 따로(꺼진 사람 번호를 새로 만들어도 꺼진 채, 검토에서 짚음)
      else if (data.op === 'toggle' && typeof data.on === 'boolean') j.on = data.on;
      else return sjErr_('bad_input');
    }
    apSaveJudges_(list);
    return json_({ ok: true, judge: apJudgePublic_(j), code: code, judges: list.map(apJudgePublic_) });
  } finally { lock.releaseLock(); }
}

/* ═════════════ 선생님 기록·작년 이력(2026-11-26 효니 «교사 추천 아닌데 교사 추천으로 넣은 애들», «작년에 신청했다가 탈락한 애들»,
 *   «선생님 평판도 꽤 중요한 요소», «서류 신청한 애들도 체크») ═════════════
 *  - «임원_교사기록»: 학번마다 한 줄. 추천 확인(''=확인 안 함 / 확인 / 아님), 종이 지원서 받은 날, 선생님 의견 목록(JSON).
 *    학번으로 묶어서 «보관» 뒤 같은 학번으로 새로 내도 기록이 이어진다. 학생 화면(apMine)·심사위원판(apJudge)에는 주지 않는다.
 *  - 교사 추천은 학생이 고른 답(answers.rec)이 아니라 이 «추천 확인»만 믿는다(효니 2026-11-26: 올해 추천은 아직 아무도 안 함).
 *  - «임원_작년지원»: 지난 모집 지원자 명단(효니 엑셀에서 옮김, 공개 레포엔 안 넣음). 이름이 같고 학년이 해마다 하나씩 오른 사람을
 *    심사판에 «작년 이력»으로 붙인다. 동명이인일 수 있어 작년 학번을 같이 보여 준다. */
const AP_NOTE_SHEET = '임원_교사기록';
const AP_NOTE_HEADERS = ['학번', '이름', '추천 확인', '종이 지원서', '선생님 의견(JSON)', '고친 시각'];
const APN = { SID: 0, NAME: 1, REC: 2, PAPER: 3, OPS: 4, AT: 5 };
const AP_REC_VALUES = ['', '확인', '아님'];
const AP_TONES = ['좋음', '보통', '걱정'];
const AP_OPS_MAX = 20;
const AP_PAST_SHEET = '임원_작년지원';
const AP_PAST_HEADERS = ['모집 연도', '학번', '이름', '성별', '지원 부서', '결과', '교사 추천', '벌점', '비고'];
const AP_THIS_YEAR = 2026; // 이번 모집 연도(학번은 이 해 기준)

function apNoteRows_() {
  const sh = sjSheet_(AP_NOTE_SHEET, AP_NOTE_HEADERS);
  const last = sh.getLastRow();
  return { sh: sh, rows: last < 2 ? [] : sh.getRange(2, 1, last - 1, AP_NOTE_HEADERS.length).getValues() };
}
function apOps_(raw) {
  let a = [];
  try { a = JSON.parse(raw || '[]'); } catch (e) { a = []; }
  return Array.isArray(a) ? a.filter(function (x) { return x && typeof x === 'object'; }) : [];
}
function apNoteView_(r) {
  const paper = r[APN.PAPER];
  return { rec: AP_REC_VALUES.indexOf(String(r[APN.REC])) >= 0 ? String(r[APN.REC]) : '', paper: paper ? (paper instanceof Date ? Utilities.formatDate(paper, 'Asia/Seoul', 'yyyy-MM-dd') : String(paper)) : '', ops: apOps_(r[APN.OPS]), at: sjTime_(r[APN.AT]) };
}
// 학번 → 기록
function apNotesMap_() {
  const m = {};
  apNoteRows_().rows.forEach(function (r) { const s = String(r[APN.SID]); if (s) m[s] = apNoteView_(r); });
  return m;
}
// 지금 신청한 학번 → 지난 모집 기록 목록. 이름이 같고, 그때 학년 + 지난 햇수 = 지금 학년
function apPastMap_(apps) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AP_PAST_SHEET);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  const past = sh.getRange(2, 1, sh.getLastRow() - 1, AP_PAST_HEADERS.length).getValues();
  apps.forEach(function (a) {
    const name = String(a[APC.NAME]).trim(), sid = String(a[APC.SID]);
    if (!name || !sid || out[sid]) return;
    const hit = past.filter(function (p) {
      const y = Number(p[0]), ps = String(p[1]).trim();
      return String(p[2]).trim() === name && y && /^[1-3]\d{4}$/.test(ps) && Number(ps.charAt(0)) + (AP_THIS_YEAR - y) === Number(sid.charAt(0));
    }).map(function (p) {
      return { year: Number(p[0]), sid: String(p[1]), gender: String(p[3] || ''), dept: String(p[4] || ''), result: String(p[5] || ''), rec: String(p[6] || ''), demerit: String(p[7] || ''), note: String(p[8] || '') };
    });
    if (hit.length) out[sid] = hit;
  });
  return out;
}

/* action=apAdminNote {key, sid, rec?('', '확인', '아님'), paper?(true=오늘 받음 / false=지움), addOp?{who, tone, text}, delOp?(의견 id)}
 * → 그 학번 기록. 신청한 학번(취소·보관 포함)만 받는다 */
function apAdminNotePost_(data) {
  const sid = apSid_(data.sid);
  const rec = data.rec == null ? null : (AP_REC_VALUES.indexOf(data.rec) >= 0 ? data.rec : undefined);
  const paper = data.paper == null ? null : (typeof data.paper === 'boolean' ? data.paper : undefined);
  let add = null;
  if (data.addOp != null) {
    const o = data.addOp;
    if (typeof o !== 'object') return sjErr_('bad_input');
    add = { who: sjPlain_(o.who, 20), tone: AP_TONES.indexOf(o.tone) >= 0 ? o.tone : '', text: sjPlain_(o.text, 300) }; // JSON 안이라 수식 막기(')가 필요 없다
    if (!add.tone || (!add.text && !add.who)) return sjErr_('bad_input');
  }
  const del = data.delOp == null ? null : String(data.delOp);
  if (!sid || rec === undefined || paper === undefined || (rec === null && paper === null && !add && del === null)) return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const blocked = sjAdminGate_(data, sjConfig_());
    if (blocked) return blocked;
    const apps = apRows_().rows.filter(function (r) { return String(r[APC.SID]) === sid; });
    if (!apps.length) return sjErr_('not_found');
    const t = apNoteRows_();
    let i = -1;
    for (let j = 0; j < t.rows.length; j++) if (String(t.rows[j][APN.SID]) === sid) { i = j; break; }
    const row = i >= 0 ? t.rows[i].slice() : [sid, '', '', '', '[]', ''];
    row[APN.NAME] = String(apps[apps.length - 1][APC.NAME]);
    if (rec !== null) row[APN.REC] = rec;
    if (paper !== null) row[APN.PAPER] = paper ? Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd') : '';
    let ops = apOps_(row[APN.OPS]);
    if (del !== null) {
      const n = ops.length;
      ops = ops.filter(function (x) { return String(x.id) !== del; });
      if (ops.length === n) return sjErr_('not_found');
    }
    if (add) {
      if (ops.length >= AP_OPS_MAX) return sjErr_('bad_input');
      ops.push({ id: 'o' + Utilities.getUuid().replace(/-/g, '').slice(0, 8), who: add.who, tone: add.tone, text: add.text, at: Date.now() });
    }
    row[APN.OPS] = JSON.stringify(ops);
    row[APN.AT] = new Date();
    if (i >= 0) t.sh.getRange(i + 2, 1, 1, AP_NOTE_HEADERS.length).setValues([row]);
    else t.sh.appendRow(row);
    return json_({ ok: true, sid: sid, note: apNoteView_(row) });
  } finally { lock.releaseLock(); }
}

/* action=apAdminPaper {key, set:{학번: true|false}} → 종이 지원서 받음을 여러 명 한 번에(심사판 «종이 지원서 체크» 표).
 * 신청한 학번만, 한 번에 60명까지. 이미 같은 값이면 날짜를 바꾸지 않는다. → {notes: 전체 기록} */
function apAdminPaperPost_(data) {
  const set = data.set;
  if (!set || typeof set !== 'object' || Array.isArray(set)) return sjErr_('bad_input');
  const sids = Object.keys(set);
  if (!sids.length || sids.length > 60) return sjErr_('bad_input');
  for (let k = 0; k < sids.length; k++) if (!apSid_(sids[k]) || typeof set[sids[k]] !== 'boolean') return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const blocked = sjAdminGate_(data, sjConfig_());
    if (blocked) return blocked;
    const names = {};
    apRows_().rows.forEach(function (r) { names[String(r[APC.SID])] = String(r[APC.NAME]); });
    for (let k = 0; k < sids.length; k++) if (!(sids[k] in names)) return sjErr_('not_found');
    const t = apNoteRows_();
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    sids.forEach(function (sid) {
      let i = -1;
      for (let j = 0; j < t.rows.length; j++) if (String(t.rows[j][APN.SID]) === sid) { i = j; break; }
      const want = set[sid];
      if (i >= 0 && !!String(t.rows[i][APN.PAPER] || '') === want) return;
      if (i < 0 && !want) return;
      const row = i >= 0 ? t.rows[i].slice() : [sid, names[sid], '', '', '[]', ''];
      row[APN.NAME] = names[sid];
      row[APN.PAPER] = want ? today : '';
      row[APN.AT] = new Date();
      if (i >= 0) { t.sh.getRange(i + 2, 1, 1, AP_NOTE_HEADERS.length).setValues([row]); t.rows[i] = row; }
      else { t.sh.appendRow(row); t.rows.push(row); }
    });
    return json_({ ok: true, notes: apNotesMap_() });
  } finally { lock.releaseLock(); }
}

const AP_ROUTES = { apInfo: apInfoPost_, apSubmit: apSubmitPost_, apMine: apMinePost_, apAdmin: apAdminPost_, apAdminSet: apAdminSetPost_, apAdminMark: apAdminMarkPost_, apAdminNote: apAdminNotePost_, apAdminPaper: apAdminPaperPost_, apAdminJudge: apAdminJudgePost_, apJudge: apJudgePost_, apJudgeScore: apJudgeScorePost_ };
