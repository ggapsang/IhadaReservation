/**
 * 50_Availability.gs - 가용성 + 임시 점유
 *
 * 명세서 Task 0-4:
 *  - checkAvailability: 결제상태(AG열) PAID/PARTIAL_REFUNDED + 임시주문 HOLDING(미만료) 모두 차단
 *  - 신규 getReservedSlotsByDate: 룸별 점유 시간대 조회 (UI 그리드용)
 *
 * 시그니처/응답 키(available, conflictReservations)는 유지하여 index.html 호환.
 */

// 예약내역 시트의 컬럼 인덱스 (0-base)
var COL_RES = {
  reservationNumber: 0,   // A
  appliedAt: 1,           // B
  date: 2,                // C
  startTime: 3,           // D
  endTime: 4,             // E
  hours: 5,               // F
  roomType: 6,            // G
  depositConfirmed: 21,   // V: 입금확인 (Y/N 또는 boolean)
  depositConfirmedAt: 22, // W
  // Phase 0에서 추가되는 컬럼:
  paymentStatus: 32       // AG: 결제상태 (PENDING/PAID/FAILED/REFUNDED/PARTIAL_REFUNDED/CANCELLED)
};

// 임시주문 시트의 컬럼 인덱스 (0-base)
var COL_HOLD = {
  orderId: 0,        // A
  createdAt: 1,      // B
  expiresAt: 2,      // C
  date: 3,           // D
  startTime: 4,      // E
  endTime: 5,        // F
  roomType: 6,       // G
  status: 9          // J
};

/**
 * 예약 가능 여부 확인. 클라이언트 호출.
 *
 * 차단 대상:
 *  - 예약내역: 결제상태 ∈ {PAID, PARTIAL_REFUNDED} OR 입금확인='Y'/true (Phase 0 호환)
 *  - 임시주문: 상태='HOLDING' AND 만료일시 > now()
 *
 * 응답: { success:true, data:{available, conflictReservations}, available, conflictReservations }
 * root 노출은 index.html L985 availability.available 호환용.
 *
 * @param {string} date YYYY-MM-DD
 * @param {string} startTime HH:MM
 * @param {string} endTime HH:MM
 * @param {string} roomType
 * @return {Object}
 */
function checkAvailability(date, startTime, endTime, roomType) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var reservationSheet = ss.getSheetByName('예약내역') || getSheet('예약내역');
    var holdingSheet = ss.getSheetByName('임시주문');  // 없으면 임시점유 검사 스킵

    var requestStart = new Date(date + ' ' + startTime);
    var requestEnd = new Date(date + ' ' + endTime);
    var now = new Date();

    var conflicts = [];

    // 1. 확정 예약 검사
    var resData = reservationSheet.getDataRange().getValues();
    for (var i = 1; i < resData.length; i++) {
      var row = resData[i];
      var resDate = formatDate(row[COL_RES.date]);
      if (resDate !== date) continue;

      var resRoom = row[COL_RES.roomType];
      if (!_roomsCollide(resRoom, roomType)) continue;

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
          roomType: resRoom,
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
        if (expiresAt && new Date(expiresAt) <= now) continue;  // 만료된 점유는 무시

        var holdDate = formatDate(hrow[COL_HOLD.date]);
        if (holdDate !== date) continue;

        var holdRoom = hrow[COL_HOLD.roomType];
        if (!_roomsCollide(holdRoom, roomType)) continue;

        var holdStart = new Date(holdDate + ' ' + hrow[COL_HOLD.startTime]);
        var holdEnd = new Date(holdDate + ' ' + hrow[COL_HOLD.endTime]);
        if (requestStart < holdEnd && requestEnd > holdStart) {
          conflicts.push({
            reservationNumber: hrow[COL_HOLD.orderId],
            date: holdDate,
            startTime: hrow[COL_HOLD.startTime],
            endTime: hrow[COL_HOLD.endTime],
            roomType: holdRoom,
            source: 'holding'
          });
        }
      }
    }

    // 3. 예약현황로그 (기존 동작 유지)
    try {
      var logSheet = getSheet('예약현황로그');
      logSheet.appendRow([
        new Date(),
        roomType,
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
 * 두 Room이 충돌하는지 판정.
 * A+B는 A/B/A+B 모두와 충돌, A↔B는 충돌하지 않음.
 * @private
 */
function _roomsCollide(existingRoom, newRoom) {
  if (existingRoom === 'A+B') return true;
  if (newRoom === 'A+B') return existingRoom === 'A' || existingRoom === 'B' || existingRoom === 'A+B';
  return existingRoom === newRoom;
}

/**
 * 특정 날짜의 룸별 점유 시간대 조회. 클라이언트가 시간 그리드 UI 그릴 때 사용.
 *
 * @param {string} date YYYY-MM-DD
 * @return {Object} { A:[{start,end,status}], B:[...], C:[...], D:[...], 'A+B':[...] }
 */
function getReservedSlotsByDate(date) {
  var result = { 'A': [], 'B': [], 'C': [], 'D': [], 'A+B': [] };
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
        else continue;  // PENDING 등은 슬롯 표시 제외

        var roomType = row[COL_RES.roomType];
        if (!result.hasOwnProperty(roomType)) result[roomType] = [];
        result[roomType].push({
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

        var hRoom = hrow[COL_HOLD.roomType];
        if (!result.hasOwnProperty(hRoom)) result[hRoom] = [];
        result[hRoom].push({
          start: _toTimeString(hrow[COL_HOLD.startTime]),
          end: _toTimeString(hrow[COL_HOLD.endTime]),
          status: 'HOLDING'
        });
      }
    }

    return result;
  } catch (error) {
    logError('getReservedSlotsByDate', error);
    return result;
  }
}

/**
 * 시트의 시간 셀 값을 'HH:MM' 문자열로 정규화.
 * Sheets는 시간을 Date(1899-12-30 ...) 또는 문자열로 저장할 수 있음.
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
