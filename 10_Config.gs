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
    // 260522 약관 기준 폴백 (단일 공간, 3시간 패키지 모델)
    var fallback = {
      기준인원: 4,
      최대인원: 8,
      최소이용시간: 3,
      기본요금_평일_3시간: 300000,
      기본요금_주말_3시간: 400000,
      시간추가요금: 50000,
      인원추가요금: 10000,
      보증금: 100000,
      VAT요율: 10,
      VAT포함여부: 'Y',
      운영시작시간: '00:00',
      운영종료시간: '24:00',
      예약시간단위: 30,
      환불정책_8일이상: 100,
      환불정책_5_7일: 50,
      환불정책_3_4일: 30,
      환불정책_2일이내: 0
    };
    return ok(fallback, fallback);
  }
}

/**
 * 260522 약관 기준으로 설정 시트를 마이그레이션합니다.
 * Apps Script 에디터에서 1회 수동 실행하십시오.
 * idempotent — 이미 적용된 항목은 건너뛰며, 기존 값을 덮어쓰지 않습니다.
 *
 * 변경 요약:
 *  - 기존 키 값 수정: 기준인원 3→4, 최소이용시간 2→3, 추가인원단가 5000→10000 (인원추가요금으로 이름 변경)
 *  - 신규 키 추가: 최대인원, 기본요금_평일_3시간, 기본요금_주말_3시간, 시간추가요금,
 *                  인원추가요금, 보증금, VAT포함여부, 환불정책_8일이상 등
 *  - 기존 호환을 위해 시간 기반 환불정책 키(_24시간이상 등)는 그대로 둡니다.
 *  - "시간당기본요금" 키는 더 이상 사용하지 않으나 삭제하지는 않습니다(다른 외부 참조 가능성).
 *
 * @return {{updated:Array, added:Array, skipped:Array}}
 */
function migrateSettings_260522() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('설정') || getSheet('설정');
  var data = sheet.getDataRange().getValues();

  // 키-행번호 인덱스
  var keyToRow = {};
  for (var i = 1; i < data.length; i++) {
    var k = data[i][0];
    if (k) keyToRow[String(k)] = i + 1; // 1-based row
  }

  var updated = [];
  var added = [];
  var skipped = [];

  // 1) 기존 키 값 갱신 (값이 다를 때만)
  var valueUpdates = [
    { key: '기준인원', value: 4 },
    { key: '최소이용시간', value: 3 }
  ];
  valueUpdates.forEach(function (u) {
    var row = keyToRow[u.key];
    if (!row) return; // 키가 없으면 아래 신규 추가 단계에서 처리
    var current = data[row - 1][1];
    if (current === u.value) {
      skipped.push(u.key + '(이미 ' + u.value + ')');
    } else {
      sheet.getRange(row, 2).setValue(u.value);
      updated.push(u.key + ': ' + current + ' → ' + u.value);
    }
  });

  // 2) 신규 키 일괄 추가 (이미 있으면 건너뜀)
  var newRows = [
    ['기준인원', 4, '명', '기본 이용 인원 (4명 초과 시 인원 추가 요금 발생)'],
    ['최대인원', 8, '명', '입실 가능 최대 인원 (초과 시 즉시 퇴실 조치)'],
    ['최소이용시간', 3, '시간', '최소 대여 시간 (3시간 패키지 기본)'],
    ['기본요금_평일_3시간', 300000, '원', '평일 월~금, 3시간 기준 (VAT 포함)'],
    ['기본요금_주말_3시간', 400000, '원', '주말 및 공휴일, 3시간 기준 (VAT 포함)'],
    ['시간추가요금', 50000, '원/시간', '3시간 초과 1시간당 추가 (VAT 포함)'],
    ['인원추가요금', 10000, '원/인/시간', '기준 인원 초과 1인당, 총 이용시간 비례 (VAT 포함)'],
    ['보증금', 100000, '원', '예약금과 함께 수령, 퇴실 점검 후 환불'],
    ['VAT포함여부', 'Y', '', '가격 표시가 VAT 포함이면 Y'],
    ['환불정책_8일이상', 100, '%', '이용일 8일 전까지 취소 시 환불율'],
    ['환불정책_5_7일', 50, '%', '이용일 7~5일 전 취소 시'],
    ['환불정책_3_4일', 30, '%', '이용일 4~3일 전 취소 시'],
    ['환불정책_2일이내', 0, '%', '이용일 2일 전 ~ 당일 취소 시 (위약금 100%)']
  ];
  newRows.forEach(function (row) {
    if (keyToRow.hasOwnProperty(row[0])) {
      // 기준인원/최소이용시간은 위에서 이미 처리했으므로 중복 추가 방지
      if (row[0] !== '기준인원' && row[0] !== '최소이용시간') {
        skipped.push(row[0] + '(이미 존재)');
      }
      return;
    }
    sheet.appendRow(row);
    added.push(row[0]);
  });

  log(LOG_LEVEL.INFO, 'settings.migrated.260522', {
    updated: updated, added: added, skipped: skipped
  });

  // 캐시 무효화는 Settings용으로 별도 캐시가 없으나 명시
  return { updated: updated, added: added, skipped: skipped };
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
// (Deprecated) getRoomInfo
// ==========================================

/**
 * @deprecated 260522 약관 기준 단일 공간 운영으로 Room 시스템이 제거되었습니다.
 *             호환을 위해 빈 배열을 반환합니다. 신규 클라이언트는 이 함수를 호출하지 마십시오.
 * @return {Array}
 */
function getRoomInfo() {
  return [];
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
