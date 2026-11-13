/* ════════════════════════════════════════════════════════
 * 2027 학생회 집행부 임원 온라인 신청 (2026-11-14 효니 요청)
 * 상점 기록과 같은 앱스크립트 프로젝트(대영중_학생회_DB_2026 시트)에 «Apply» 파일로 넣는다. Code.gs의 json_·saHmac_·sjText_·
 * sjCount_·sjSheet_·sjConfig_·sjAdminGate_를 같이 쓴다. 공개 레포라 비밀번호를 넣지 않는다.
 *  - 학생 apply.html: 로그인 없이 학번·이름과 확인 번호(숫자 4자리)로 낸다. 마감 전에는 같은 학번+확인 번호로 다시 내면 고쳐진다.
 *    확인 번호는 HMAC으로만 저장하고, 같은 학번에서 틀리면 30분에 5번까지만 받는다(4자리라 마구 넣어 보기를 막는다).
 *  - 심사판 apply.html?teacher=1: 상점 관리 비밀번호(sjAdminGate_)로 연다(효니 결정 2026-11-14). 신청 열기·닫기, 2학년 신규 추가 모집,
 *    심사 상태·메모를 고친다. 벌점은 시트에 넣지 않는다(심사 때 e알리미에서 성실성 참고로만 본다, 2026-11-11 결정).
 *  - 문항은 apply.html의 FORM이 정한다(효니 «나중에 다시 고칠 수 있게»). 서버는 공통 칸만 검사하고 답은 JSON으로 그대로 둔다.
 *  - 기본은 닫힘. 효니가 심사판에서 열 때만 받는다. AP_DEADLINE이 지나면 열어 둬도 받지 않는다(고치기도 막힘).
 * 응답: {ok:true, ...} 또는 {ok:false, error}
 *   error = closed / bad_input / grade(학년이 지원 구분과 안 맞음) / pin(확인 번호 틀림) / busy(틀린 횟수 상한) / exists(이미 낸 학번, 고치기로)
 *           / not_found / no_auth / no_admin / server
 * ════════════════════════════════════════════════════════ */
const AP_SHEET = '임원_신청';
const AP_HEADERS = ['신청ID', '처음 낸 시각', '고친 시각', '학번', '이름', '성별', '지원 구분', '회장 후보', '1지망', '2지망', '부장·차장 희망', '답(읽기용)', '답(JSON)', '확인번호(암호)', '심사 상태', '심사 메모', '고친 횟수'];
const APC = { ID: 0, AT: 1, EDIT: 2, SID: 3, NAME: 4, GENDER: 5, TRACK: 6, CAND: 7, D1: 8, D2: 9, ROLE: 10, TEXT: 11, JSON: 12, PIN: 13, STATUS: 14, MEMO: 15, EDITS: 16 };
const AP_PROP = 'APPLY_2027_JSON';            // {open, g2New}
const AP_DEADLINE = '2026-12-04T23:59:59+09:00'; // 접수 마감(공고와 같게). 바뀌면 여기와 apply.html DEADLINE을 같이 고친다
const AP_TRACKS = { new: '신규 임원', member: '기존 임원 계속', lead: '부장·차장' };
const AP_DEPTS = ['자율질서부', '알림부', '행사진행부', '홍보기획부'];
const AP_ROLES = { '': '', head: '부장', vice: '차장', any: '부장·차장 모두' };
const AP_GENDERS = ['남', '여'];
const AP_STATUSES = ['접수', '서류 통과', '보류', '불합격', '취소'];
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
function apFind_(rows, sid) {
  for (let i = 0; i < rows.length; i++) if (String(rows[i][APC.SID]) === sid) return i;
  return -1;
}
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
// 학년과 지원 구분: 신규=현재 1학년(2학년은 추가 모집을 열었을 때만), 부장·차장=현재 2학년, 기존 임원 계속=현재 1·2학년
function apGradeOk_(track, sid, cfg) {
  const g = sid.charAt(0);
  if (track === 'new') return g === '1' || (g === '2' && !!cfg.g2New);
  if (track === 'lead') return g === '2';
  if (track === 'member') return g === '1' || g === '2';
  return false;
}

/* action=apInfo → 받는 중인지, 마감, 2학년 신규 추가 모집 여부 */
function apInfoPost_() {
  const cfg = apConfig_();
  return json_({ ok: true, open: apAccepting_(cfg), deadline: AP_DEADLINE, past: apPastDeadline_(), g2New: !!cfg.g2New });
}

/* action=apSubmit {sid, name, gender, track, cand, d1, d2, role, answers, labels, pin, edit} → 새로 내기·고치기
 * edit=false인데 이미 낸 학번이면 exists(남이 같은 학번으로 덮지 못하게). edit=true면 확인 번호가 맞아야 고친다. */
function apSubmitPost_(data) {
  const sid = apSid_(data.sid), pin = apPin_(data.pin);
  const name = sjText_(data.name, 20);
  const gender = AP_GENDERS.indexOf(data.gender) >= 0 ? data.gender : '';
  const track = Object.prototype.hasOwnProperty.call(AP_TRACKS, data.track) ? data.track : '';
  const d1 = AP_DEPTS.indexOf(data.d1) >= 0 ? data.d1 : '';
  const d2 = data.d2 === '' || data.d2 == null ? '' : (AP_DEPTS.indexOf(data.d2) >= 0 ? data.d2 : null);
  const role = Object.prototype.hasOwnProperty.call(AP_ROLES, data.role || '') ? (data.role || '') : null;
  const answers = apParseAnswers_(data.answers);
  if (!sid || !pin || !name || name.length < 2 || !gender || !track || !d1 || d2 === null || d2 === d1 || role === null || !answers) return sjErr_('bad_input');
  if (track === 'lead' && !role) return sjErr_('bad_input');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cfg = apConfig_();
    if (!apAccepting_(cfg)) return sjErr_('closed');
    const wrongKey = 'ap_wrong_' + sid;
    if ((Number(CacheService.getScriptCache().get(wrongKey)) || 0) >= AP_WRONG_MAX) return sjErr_('busy');
    const t = apRows_();
    const i = apFind_(t.rows, sid);
    // 학년 검사는 새로 낼 때와 구분을 바꿀 때만. 2학년 추가 모집 때 낸 신청은 모집을 끈 뒤에도 고칠 수 있게(검토에서 재현)
    if (!(i >= 0 && data.edit === true && String(t.rows[i][APC.TRACK]) === AP_TRACKS[track]) && !apGradeOk_(track, sid, cfg)) return sjErr_('grade');
    const now = new Date();
    const text = apReadable_(answers, data.labels);
    const json = JSON.stringify(answers);
    if (json.length > AP_CELL_MAX || text.length > AP_CELL_MAX) return sjErr_('bad_input'); // 시트 한 칸 5만 자 한도보다 넉넉히 작게
    if (i < 0) {
      if (data.edit === true) return sjErr_('not_found');
      const id = Utilities.getUuid();
      t.sh.appendRow([id, now, '', sid, name, gender, AP_TRACKS[track], data.cand === true ? '예' : '아니오', d1, d2, AP_ROLES[role], text, json, apPinHash_(sid, pin), '접수', '', 0]);
      return json_({ ok: true, id: id, created: true });
    }
    if (data.edit !== true) return sjErr_('exists');
    const row = t.rows[i];
    // 확인 번호를 잊은 학생은 선생님이 심사판에서 «확인 번호 풀기»를 하면 새 번호로 고칠 수 있다(칸이 비어 있음)
    if (String(row[APC.PIN]) && String(row[APC.PIN]) !== apPinHash_(sid, pin)) { sjCount_(wrongKey, AP_WRONG_SEC); return sjErr_('pin'); }
    if (String(row[APC.STATUS]) === '취소') return sjErr_('closed');
    // 심사 상태·메모·처음 낸 시각은 그대로 두고 학생이 쓴 칸만 바꾼다
    t.sh.getRange(i + 2, APC.EDIT + 1, 1, APC.PIN - APC.EDIT + 1).setValues([[now, sid, name, gender, AP_TRACKS[track], data.cand === true ? '예' : '아니오', d1, d2, AP_ROLES[role], text, json, apPinHash_(sid, pin)]]);
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
  v.role = Object.keys(AP_ROLES).filter(function (k) { return k && AP_ROLES[k] === v.role; })[0] || '';
  const cfg = apConfig_();
  return json_({ ok: true, app: v, open: apAccepting_(cfg) });
}

/* action=apAdmin {key} → 심사판 전체 */
function apAdminPost_(data) {
  const blocked = sjAdminGate_(data, sjConfig_());
  if (blocked) return blocked;
  const cfg = apConfig_();
  const rows = apRows_().rows.map(function (r) { return apView_(r, true); });
  return json_({ ok: true, now: Date.now(), open: !!cfg.open, accepting: apAccepting_(cfg), past: apPastDeadline_(), deadline: AP_DEADLINE, g2New: !!cfg.g2New, rows: rows, statuses: AP_STATUSES });
}

/* action=apAdminSet {key, open?, g2New?} → 신청 열기·닫기, 2학년 신규 추가 모집 */
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
    if (status !== null) t.sh.getRange(i + 2, APC.STATUS + 1).setValue(status);
    if (data.resetPin === true) { t.sh.getRange(i + 2, APC.PIN + 1).setValue(''); t.rows[i][APC.PIN] = ''; CacheService.getScriptCache().remove('ap_wrong_' + String(t.rows[i][APC.SID])); }
    if (data.memo != null) t.sh.getRange(i + 2, APC.MEMO + 1).setValue(sjText_(String(data.memo), 300));
    t.rows[i][APC.STATUS] = status !== null ? status : t.rows[i][APC.STATUS];
    if (data.memo != null) t.rows[i][APC.MEMO] = sjText_(String(data.memo), 300);
    return json_({ ok: true, row: apView_(t.rows[i], true) });
  } finally { lock.releaseLock(); }
}

const AP_ROUTES = { apInfo: apInfoPost_, apSubmit: apSubmitPost_, apMine: apMinePost_, apAdmin: apAdminPost_, apAdminSet: apAdminSetPost_, apAdminMark: apAdminMarkPost_ };
