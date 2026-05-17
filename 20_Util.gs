/**
 * 20_Util.gs - 공통 유틸리티
 *
 * 헬퍼 함수, 표준 응답 빌더, 로깅, UUID 등 전 영역이 의존하는 함수 모음.
 * 다른 모든 .gs 파일이 이 파일의 함수를 호출하므로 가장 먼저 작성된다.
 */

// ==========================================
// 표준 errorCode (명세서 6-2)
// ==========================================
var ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  RESERVATION_NOT_FOUND: 'RESERVATION_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_EXPIRED: 'ORDER_EXPIRED',
  TIME_BLOCKED: 'TIME_BLOCKED',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  PG_API_ERROR: 'PG_API_ERROR',
  PG_DECLINED: 'PG_DECLINED',
  INVALID_OPTION: 'INVALID_OPTION',
  STORAGE_ERROR: 'STORAGE_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RATE_LIMITED: 'RATE_LIMITED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  // Phase 0 한정 (결제 stub용, Phase 1에서 자연 소멸)
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED'
};

// ==========================================
// 표준 응답 빌더 (명세서 6-1)
// ==========================================

/**
 * 성공 응답 빌더.
 * @param {Object} data - 응답 본문 (data 필드로 래핑됨)
 * @param {Object} [rootShim] - 하위 호환을 위해 root에 노출할 필드 (예: { reservationNumber, totalAmount })
 * @return {Object} { success: true, data, ...rootShim }
 */
function ok(data, rootShim) {
  var resp = { success: true, data: data || {} };
  if (rootShim && typeof rootShim === 'object') {
    Object.keys(rootShim).forEach(function (k) { resp[k] = rootShim[k]; });
  }
  return resp;
}

/**
 * 실패 응답 빌더. `error` 필드는 기존 result.error 호환용.
 * @param {string} errorCode - ERROR_CODES 중 하나
 * @param {string} errorMessage - 사용자에게 표시할 한글 메시지
 * @param {Object} [details] - 디버그용 (선택)
 * @return {Object} { success: false, errorCode, errorMessage, error, details? }
 */
function fail(errorCode, errorMessage, details) {
  var resp = {
    success: false,
    errorCode: errorCode || ERROR_CODES.UNKNOWN_ERROR,
    errorMessage: errorMessage || '알 수 없는 오류가 발생했습니다.',
    error: errorMessage || '알 수 없는 오류가 발생했습니다.'
  };
  if (details) resp.details = details;
  return resp;
}

// ==========================================
// 시트 헬퍼
// ==========================================

/**
 * 시트를 가져옴. 없으면 생성.
 * @param {string} sheetName
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  return sheet;
}

// ==========================================
// 날짜·시간 헬퍼
// ==========================================

/**
 * Date 또는 문자열을 'yyyy-MM-dd' 문자열로 정규화.
 * @param {Date|string} date
 * @return {string}
 */
function formatDate(date) {
  if (typeof date === 'string') return date;
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * 'HH:MM' 문자열을 분 단위 정수로 변환.
 * @param {string} time
 * @return {number}
 */
function timeToMinutes(time) {
  var parts = String(time).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * 'HH:MM' 두 개의 차이를 시간 단위로 반환.
 * @param {string} startTime
 * @param {string} endTime
 * @return {number}
 */
function calculateHours(startTime, endTime) {
  return (timeToMinutes(endTime) - timeToMinutes(startTime)) / 60;
}

// ==========================================
// UUID
// ==========================================

/**
 * UUID v4 생성. 토스페이먼츠 orderId 등에 사용.
 * @return {string}
 */
function generateUUID() {
  return Utilities.getUuid();
}

// ==========================================
// HTML 이스케이프
// ==========================================

/**
 * HTML 이스케이프.
 * @param {string} text
 * @return {string}
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

// ==========================================
// Base64 -> Blob
// ==========================================

/**
 * Base64 문자열을 Blob으로 변환.
 * @param {string} base64Data
 * @param {string} mimeType
 * @param {string} fileName
 * @return {Blob}
 */
function base64ToBlob(base64Data, mimeType, fileName) {
  try {
    var bytes = Utilities.base64Decode(base64Data);
    return Utilities.newBlob(bytes, mimeType, fileName);
  } catch (error) {
    logError('base64ToBlob', error);
    throw new Error('파일 변환 중 오류가 발생했습니다.');
  }
}

// ==========================================
// 민감정보 마스킹
// ==========================================

/**
 * 카드번호, 시크릿 키, JWT 등을 자동 마스킹.
 * @param {*} obj
 * @return {*}
 */
function maskSensitive(obj) {
  try {
    var json = JSON.stringify(obj || {});
    // 카드번호 4-4-4-4 (구분자 무관)
    json = json.replace(/(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})/g, '$1-****-****-$4');
    // 시크릿 키 JSON 값
    json = json.replace(
      /("(?:PAYMENT_SECRET_KEY|PAYMENT_WEBHOOK_SECRET|KAKAO_API_KEY|KAKAO_SENDER_KEY|PAYMENT_CLIENT_KEY)"\s*:\s*)"[^"]*"/gi,
      '$1"***"'
    );
    // JWT 패턴
    json = json.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '***JWT***');
    return JSON.parse(json);
  } catch (e) {
    return obj;
  }
}

// ==========================================
// 표준 로깅 (명세서 7)
// ==========================================

var LOG_LEVEL = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };

/**
 * 표준 로깅 함수.
 * - INFO/WARN: 콘솔만
 * - ERROR: 콘솔 + 결제로그 시트 영구 기록 (이벤트유형='ERROR')
 * 민감정보는 maskSensitive로 자동 마스킹.
 *
 * @param {string} level - INFO | WARN | ERROR
 * @param {string} event - 이벤트 식별자 (예: 'reservation.submitted')
 * @param {Object} data - 자유 형식
 */
function log(level, event, data) {
  var masked = maskSensitive(data);
  var payload;
  try { payload = JSON.stringify(masked); } catch (e) { payload = String(masked); }
  var line = '[' + level + '] ' + event + ' ' + payload;

  if (level === LOG_LEVEL.ERROR) {
    console.error(line);
    try { _appendErrorToPaymentLog(event, masked); } catch (e) { console.error('결제로그 기록 실패:', e); }
  } else if (level === LOG_LEVEL.WARN) {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * ERROR 레벨을 결제로그 시트에 영구 기록.
 * 결제 컨텍스트가 없는 일반 에러도 동일 시트에 기록 (이벤트유형='ERROR').
 * 시트가 없으면 조용히 스킵 (initializePaymentSchema 이전 환경 호환).
 * @private
 */
function _appendErrorToPaymentLog(event, data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('결제로그');
  if (!sheet) return;
  var orderId = (data && data.orderId) ? data.orderId : '';
  var paymentKey = (data && data.paymentKey) ? data.paymentKey : '';
  var amount = (data && typeof data.amount === 'number') ? data.amount : '';
  var detailJson;
  try { detailJson = JSON.stringify(data || {}); } catch (e) { detailJson = String(data); }
  sheet.appendRow([
    generateUUID(),          // A: 로그ID
    new Date(),              // B: 일시
    orderId,                 // C: 주문번호
    'ERROR',                 // D: 이벤트유형
    paymentKey,              // E: 결제ID
    amount,                  // F: 금액
    '',                      // G: 응답코드
    event || '',             // H: 응답메시지 (간단 식별)
    detailJson               // I: 상세 JSON
  ]);
}

// ==========================================
// 기존 로깅 함수 (Wrapper, 점진 마이그레이션)
// ==========================================

/**
 * @deprecated log('INFO', action, data) 사용 권장. 호환을 위해 유지.
 */
function logActivity(action, data) {
  log(LOG_LEVEL.INFO, action, data);
}

/**
 * @deprecated log('ERROR', functionName, ...) 사용 권장. 호환을 위해 유지.
 */
function logError(functionName, error) {
  var payload = {
    message: (error && error.message) ? error.message : String(error),
    stack: (error && error.stack) ? error.stack : ''
  };
  log(LOG_LEVEL.ERROR, functionName, payload);
}
