/**
 * 10_Config.gs - 설정 & Properties 접근
 *
 * Script Properties (시크릿/환경 식별자) 단일 진입점 + 설정/Room 시트 조회.
 * 명세서 Task 0-5 (Properties 표준화), 클라이언트 호출 함수 getSettings/getRoomInfo 포함.
 */

// ==========================================
// Properties 표준 키 목록 (명세서 0-5 + TERMS_DOC_ID)
// ==========================================
var PROPERTY_KEYS = [
  'PAYMENT_PROVIDER',
  'PAYMENT_CLIENT_KEY',
  'PAYMENT_SECRET_KEY',
  'PAYMENT_WEBHOOK_SECRET',
  'KAKAO_API_KEY',
  'KAKAO_SENDER_KEY',
  'ADMIN_EMAIL',
  'ADMIN_PHONE',
  'CALENDAR_ID_CONFIRMED',
  'CALENDAR_ID_PENDING',
  'UPLOAD_FOLDER_ID',
  'TERMS_DOC_ID'  // 12번째 — 명세 11개 외 보조 키 (약관 Docs ID 하드코딩 정리용)
];

var _PROPERTY_DEFAULTS = {
  PAYMENT_PROVIDER: 'tosspayments'
};

// 단일 invocation 내 캐싱
var _configCache = {};

/**
 * Script Property 단일 조회 진입점.
 * @param {string} key
 * @return {string|null}
 */
function getConfig(key) {
  if (_configCache.hasOwnProperty(key)) return _configCache[key];
  var v = PropertiesService.getScriptProperties().getProperty(key);
  _configCache[key] = v;
  return v;
}

/**
 * 표준 11+1개 Property 키를 빈 값으로 일괄 등록.
 * 이미 존재하는 키는 건드리지 않음 (운영 환경 보호).
 * Apps Script 에디터에서 1회 수동 실행.
 *
 * @return {Object} { added: [...], already: [...] }
 */
function initializeProperties() {
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperties();
  var added = [];
  var already = [];
  PROPERTY_KEYS.forEach(function (k) {
    if (k in existing) {
      already.push(k);
    } else {
      props.setProperty(k, _PROPERTY_DEFAULTS[k] || '');
      added.push(k);
    }
  });
  // 캐시 무효화
  _configCache = {};
  log(LOG_LEVEL.INFO, 'properties.initialized', { added: added, already: already });
  return { added: added, already: already };
}

// ==========================================
// 설정 시트 조회 (클라이언트 호출)
// ==========================================

/**
 * 설정 시트 전체를 키-값 객체로 반환. 클라이언트 호출.
 * 명세서 6-1 표준 포맷이지만 기존 클라이언트가 root 키(`기준인원` 등)를 직접 읽으므로
 * data 래핑과 root spread를 함께 수행 (하위 호환).
 *
 * @return {Object} { success: true, data: settings, ...settings }
 */
function getSettings() {
  try {
    var sheet = getSheet('설정');
    var data = sheet.getDataRange().getValues();
    var settings = {};
    for (var i = 1; i < data.length; i++) {
      var key = data[i][0];
      var value = data[i][1];
      if (!key) continue;
      var camelKey = String(key).replace(/\s+/g, '');
      settings[camelKey] = value;
    }
    return ok(settings, settings);
  } catch (error) {
    logError('getSettings', error);
    // 기존 폴백 유지 (settings 자체는 root에 spread, 호환)
    var fallback = {
      기준인원: 3,
      시간당기본요금: 44000,
      최소이용시간: 2,
      추가인원단가: 5000,
      AB동시대관기준: 10,
      VAT요율: 10,
      운영시작시간: '09:00',
      운영종료시간: '22:00',
      예약시간단위: 30
    };
    return ok(fallback, fallback);
  }
}

/**
 * 내부 호출용 — 표준 응답 래핑 없이 설정 객체만 반환.
 * 다른 .gs 파일이 settings.기준인원 등을 직접 읽을 때 사용.
 * @return {Object}
 */
function _getSettingsRaw() {
  var resp = getSettings();
  // ok()는 data와 root에 모두 settings를 노출하므로 data 사용
  return (resp && resp.data) ? resp.data : {};
}

// ==========================================
// Room 정보 (클라이언트 호출)
// ==========================================

/**
 * 활성화된 Room 목록 반환. 클라이언트 호출.
 * 명세서 6-1 표준 포맷 예외 — 기존 클라이언트(index.html L772 rooms.forEach)가
 * 배열을 그대로 사용하므로 의도적으로 배열을 반환한다.
 *
 * @return {Array<{type, capacity, rate, description, active}>}
 */
function getRoomInfo() {
  try {
    var sheet = getSheet('Room정보');
    var data = sheet.getDataRange().getValues();
    var rooms = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i][4] === 'Y') {
        rooms.push({
          type: data[i][0],
          capacity: data[i][1],
          rate: data[i][2],
          description: data[i][3],
          active: true
        });
      }
    }
    return rooms;
  } catch (error) {
    logError('getRoomInfo', error);
    return [];
  }
}

// ==========================================
// Drive 업로드 폴더 ID
// ==========================================

/**
 * 업로드 폴더 ID 조회. Property 우선, 없으면 폴더명 검색 + 생성 + Property 저장.
 * @return {string}
 */
function getUploadFolderId() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('UPLOAD_FOLDER_ID');
  if (folderId) return folderId;

  var folderName = '예약_사업자등록증';
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  folderId = folder.getId();
  props.setProperty('UPLOAD_FOLDER_ID', folderId);
  _configCache['UPLOAD_FOLDER_ID'] = folderId;
  return folderId;
}
