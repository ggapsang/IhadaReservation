/**
 * 50_Availability.gs - 가용성 (단일 공간)
 *
 * 요구사항 명세서_260522 기준 단일 공간(이오 아크로 _성수).
 * 시간대 겹침만 확인합니다.
 */

// 예약내역 시트의 컬럼 인덱스 (0-base) — 25컬럼 양식
var COL_RES = {
  reservationNumber: 0,    // A
  appliedAt: 1,            // B
  date: 2,                 // C
  startTime: 3,            // D
  endTime: 4,              // E
  hours: 5,                // F
  name: 6,                 // G
  phone: 7,                // H
  email: 8,                // I
  persons: 9,              // J
  taxBill: 10,             // K
  basePrice: 11,           // L
  extraHoursFee: 12,       // M
  extraPersonFee: 13,      // N
  subtotal: 14,            // O
  vat: 15,                 // P
  deposit: 16,             // Q
  total: 17,               // R
  depositConfirmed: 18,    // S
  depositConfirmedAt: 19,  // T
  businessFile: 20,        // U
  calendarEventId: 21,     // V
  notifyStatus: 22,        // W
  refundAmount: 23,        // X
  refundedAt: 24           // Y
};

/**
 * 예약 가능 여부 확인. 클라이언트 호출.
 * 차단 대상: 예약내역에 신청된 모든 예약(입금확인 여부 무관)과 시간이 겹치는 경우.
 * 입금 확인 전 신청도 시간대를 점유합니다.
 *
 * @param {string} date YYYY-MM-DD
 * @param {string} startTime HH:MM
 * @param {string} endTime HH:MM
 * @param {string} [roomType] (호환 인자, 사용 안 함)
 * @return {Object}
 */
function checkAvailability(date, startTime, endTime, roomType) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var reservationSheet = ss.getSheetByName('예약내역') || getSheet('예약내역');

    var requestStart = new Date(date + ' ' + startTime);
    var requestEnd = new Date(date + ' ' + endTime);

    var conflicts = [];
    var resData = reservationSheet.getDataRange().getValues();
    for (var i = 1; i < resData.length; i++) {
      var row = resData[i];
      if (!row[COL_RES.reservationNumber]) continue;
      if (formatDate(row[COL_RES.date]) !== date) continue;

      var resStart = new Date(formatDate(row[COL_RES.date]) + ' ' + row[COL_RES.startTime]);
      var resEnd = new Date(formatDate(row[COL_RES.date]) + ' ' + row[COL_RES.endTime]);
      if (requestStart < resEnd && requestEnd > resStart) {
        conflicts.push({
          reservationNumber: row[COL_RES.reservationNumber],
          date: formatDate(row[COL_RES.date]),
          startTime: row[COL_RES.startTime],
          endTime: row[COL_RES.endTime]
        });
      }
    }

    // 예약현황로그
    try {
      var logSheet = getSheet('예약현황로그');
      logSheet.appendRow([
        new Date(), 'single', date, startTime, endTime,
        conflicts.length === 0 ? '가능' : '불가'
      ]);
    } catch (logErr) {
      console.log('예약현황로그 저장 실패:', logErr);
    }

    var available = conflicts.length === 0;
    return ok(
      { available: available, conflictReservations: conflicts },
      { available: available, conflictReservations: conflicts }
    );
  } catch (error) {
    logError('checkAvailability', error);
    var resp = fail(ERROR_CODES.STORAGE_ERROR, '예약 확인 중 오류가 발생했습니다.');
    resp.available = false;
    resp.conflictReservations = [];
    return resp;
  }
}

/**
 * 특정 날짜의 점유 시간대 조회. UI 그리드용.
 * 입금 확인 여부 무관, 모든 신청된 예약을 점유로 반환합니다.
 * @param {string} date YYYY-MM-DD
 * @return {{slots:Array<{start, end, status}>}}
 */
function getReservedSlotsByDate(date) {
  var slots = [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var resSheet = ss.getSheetByName('예약내역');
    if (!resSheet) return { slots: slots };
    var resData = resSheet.getDataRange().getValues();
    for (var i = 1; i < resData.length; i++) {
      var row = resData[i];
      if (!row[COL_RES.reservationNumber]) continue;
      if (formatDate(row[COL_RES.date]) !== date) continue;
      var deposit = row[COL_RES.depositConfirmed];
      var status = (deposit === 'Y' || deposit === true) ? 'PAID' : 'PENDING';
      slots.push({
        start: _toTimeString(row[COL_RES.startTime]),
        end: _toTimeString(row[COL_RES.endTime]),
        status: status
      });
    }
    return { slots: slots };
  } catch (error) {
    logError('getReservedSlotsByDate', error);
    return { slots: slots };
  }
}

function _toTimeString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) {
    var h = value.getHours();
    var m = value.getMinutes();
    return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
  }
  return String(value);
}
