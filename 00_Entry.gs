/**
 * 00_Entry.gs - WebApp 진입점 & POST 라우팅
 *
 * doGet은 index.html 렌더링.
 * doPost는 액션 dispatch — 클라이언트 호출 함수가 이미 표준 응답 포맷이므로
 * doPost는 결과를 그대로 직렬화한다 (이중 래핑 금지).
 */

/**
 * WebApp 진입점 - HTML 페이지 렌더링.
 * @param {Object} e
 * @return {HtmlOutput}
 */
function doGet(e) {
  try {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('예약 관리 시스템')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    logError('doGet', error);
    return HtmlService.createHtmlOutput('<h1>시스템 오류가 발생했습니다.</h1><p>관리자에게 문의해주세요.</p>');
  }
}

/**
 * POST 요청 처리. 액션별로 dispatch한 결과를 그대로 JSON 직렬화.
 * 호출 대상 함수는 이미 ok/fail 표준 포맷을 반환하므로 wrapper 적용하지 않음.
 *
 * @param {Object} e
 * @return {ContentService}
 */
function doPost(e) {
  try {
    var action = e.parameter.action;
    var result;

    switch (action) {
      case 'submit':
        result = submitReservation(e.parameter);
        break;
      case 'checkAvailability':
        result = checkAvailability(
          e.parameter.date,
          e.parameter.startTime,
          e.parameter.endTime,
          e.parameter.roomType
        );
        break;
      case 'getReservedSlots':
        result = getReservedSlotsByDate(e.parameter.date);
        break;
      default:
        result = fail(ERROR_CODES.INVALID_INPUT, '알 수 없는 요청입니다.');
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    logError('doPost', error);
    return ContentService.createTextOutput(JSON.stringify(
      fail(ERROR_CODES.UNKNOWN_ERROR, '요청 처리 중 오류가 발생했습니다.')
    )).setMimeType(ContentService.MimeType.JSON);
  }
}
