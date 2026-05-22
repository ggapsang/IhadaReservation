/**
 * 50_Availability.gs - 가용성 + 임시 점유
 *
 * 260522 약관 기준 단일 공간(이오 아크로 _성수) 가정.
 * Room 분할/A+B 동시 대관 로직 제거. 시간대 겹침만 확인합니다.
 *
 *  - checkAvailability: 결제상태 PAID/PARTIAL_REFUNDED + 입금확인 Y/true + 임시주문 HOLDING(미만료) 모두 차단
 *  - getReservedSlotsByDate: 지정일 점유 시간대 목록 반환 (UI 그리드용)
 *
 * 시그니처는 기존 호환을 위해 유지하되 roomType 인자는 무시합니다(단일 공간).
 */

// 예약내역 시트의 컬럼 인덱스 (0-base) — 260522 약관 신규 32컬럼 양식
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
  optionsJson: 23,         // X
  optionsFee: 24,          // Y
  orderId: 25,             // Z
  paymentKey: 26,          // AA
  paymentMethod: 27,       // AB
  paymentStatus: 28,       // AC
  paymentCompletedAt: 29,  // AD
  refundAmount: 30,        // AE
  refundedAt: 31           // AF
};

// 임시주문 시트의 컬럼 인덱스 (0-base) — Room 컬럼 제거
var COL_HOLD = {
  orderId: 0,        // A
  createdAt: 1,      // B
  expiresAt: 2,      // C
  date: 3,           // D
  startTime: 4,      // E
  endTime: 5,        // F
  reservationData: 6,// G (JSON)
  amount: 7,         // H
  status: 8          // I
};

/**
 * 예약 가능 여부 확인. 클라이언트 호출.
 *
 * 차단 대상:
 *  - 예약내역: 결제상태 ∈ {PAID, PARTIAL_REFUNDED} OR 입금확인 Y/true (Phase 0 호환)
 *  - 임시주문: 상태='HOLDING' AND 만료일시 > now()
 *
 * 응답: { success:true, data:{available, conflictReservations}, available, conflictReservations }
 *
 * @param {string} date YYYY-MM-DD
 * @param {string} startTime HH:MM
 * @param {string} endTime HH:MM
 * @param {string} [roomType] (호환 인자) — 단일 공간이므로 사용하지 않습니다.
 * @return {Object}
 */
function checkAvailability(date, startTime, endTime, roomType) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var reservationSheet = ss.getSheetByName('예약내역') || getSheet('예약내역');
    var holdingSheet = ss.getSheetByName('임시주문');

    var requestStart = new Date(date + ' ' + startTime);
    var requestEnd = new Date(date + ' ' + endTime);
    var now = new Date();

    var conflicts = [];

    // 1. 확정 예약 검사
    var resData = reservationSheet.getDataRange().getValues();
    for (var i = 1; i < resData.length; i++) {
      var row = resData[i];
      if (!row[COL_RES.reservationNumber]) continue;
      var resDate = formatDate(row[COL_RES.date]);
      if (resDate !== date) continue;

      // 차단 조건: 결제상태 PAID/PARTIAL_REFUNDED OR 입금확인 Y/true
      var paymentStatus = row[COL_RES.paymentStatus];
      var deposit = row[COL_RES.depositConfirmed];
      var isPaid = (paymentStatus === 'PAID' || paymentStatus === 'PARTIAL_REFUNDED');
      var isDeposited = (deposit === 'Y' || deposit === true);
      if (!isPaid && !isDeposited) continue;

      var resStart = new Date(resDate + ' ' + row[COL_RES.startTime]);
      var resEnd = new Date(resDate + ' ' + row[COL_RES.endTime]);
      if (requestStart < resEnd && requestEnd > resStart) {
        conflicts.push({
          reservationNumber: row[COL_RES.reservationNumber],
          date: resDate,
          startTime: row[COL_RES.startTime],
          endTime: row[COL_RES.endTime],
          source: 'reservation'
        });
      }
    }

    // 2. 임시주문(HOLDING) 검사
    if (holdingSheet) {
      var holdData = holdingSheet.getDataRange().getValues();
      for (var j = 1; j < holdData.length; j++) {
        var hrow = holdData[j];
        if (!hrow[COL_HOLD.orderId]) continue;
        if (hrow[COL_HOLD.status] !== 'HOLDING') continue;

        var expiresAt = hrow[COL_HOLD.expiresAt];
        if (expiresAt && new Date(expiresAt) <= now) continue;

        var holdDate = formatDate(hrow[COL_HOLD.date]);
        if (holdDate !== date) continue;

        var holdStart = new Date(holdDate + ' ' + hrow[COL_HOLD.startTime]);
        var holdEnd = new Date(holdDate + ' ' + hrow[COL_HOLD.endTime]);
        if (requestStart < holdEnd && requestEnd > holdStart) {
          conflicts.push({
            reservationNumber: hrow[COL_HOLD.orderId],
            date: holdDate,
            startTime: hrow[COL_HOLD.startTime],
            endTime: hrow[COL_HOLD.endTime],
            source: 'holding'
          });
        }
      }
    }

    // 3. 예약현황로그 (기존 동작 유지) — Room 컬럼 자리에는 'single' 기록
    try {
      var logSheet = getSheet('예약현황로그');
      logSheet.appendRow([
        new Date(),
        'single',
        date,
        startTime,
        endTime,
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
 * 특정 날짜의 점유 시간대 조회. 클라이언트가 시간 그리드 UI 그릴 때 사용.
 *
 * @param {string} date YYYY-MM-DD
 * @return {{slots:Array<{start, end, status}>}}
 */
function getReservedSlotsByDate(date) {
  var slots = [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 확정 예약
    var resSheet = ss.getSheetByName('예약내역');
    if (resSheet) {
      var resData = resSheet.getDataRange().getValues();
      for (var i = 1; i < resData.length; i++) {
        var row = resData[i];
        if (!row[COL_RES.reservationNumber]) continue;
        if (formatDate(row[COL_RES.date]) !== date) continue;

        var status = row[COL_RES.paymentStatus];
        var deposit = row[COL_RES.depositConfirmed];
        var displayStatus;
        if (status === 'PAID' || status === 'PARTIAL_REFUNDED') displayStatus = status;
        else if (deposit === 'Y' || deposit === true) displayStatus = 'PAID';
        else continue;

        slots.push({
          start: _toTimeString(row[COL_RES.startTime]),
          end: _toTimeString(row[COL_RES.endTime]),
          status: displayStatus
        });
      }
    }

    // 임시 점유
    var holdSheet = ss.getSheetByName('임시주문');
    if (holdSheet) {
      var holdData = holdSheet.getDataRange().getValues();
      var now = new Date();
      for (var j = 1; j < holdData.length; j++) {
        var hrow = holdData[j];
        if (!hrow[COL_HOLD.orderId]) continue;
        if (hrow[COL_HOLD.status] !== 'HOLDING') continue;
        var expiresAt = hrow[COL_HOLD.expiresAt];
        if (expiresAt && new Date(expiresAt) <= now) continue;
        if (formatDate(hrow[COL_HOLD.date]) !== date) continue;

        slots.push({
          start: _toTimeString(hrow[COL_HOLD.startTime]),
          end: _toTimeString(hrow[COL_HOLD.endTime]),
          status: 'HOLDING'
        });
      }
    }

    return { slots: slots };
  } catch (error) {
    logError('getReservedSlotsByDate', error);
    return { slots: slots };
  }
}

/**
 * 시트의 시간 셀 값을 'HH:MM' 문자열로 정규화합니다.
 * @private
 */
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
