/**
 * 30_Reservation.gs - 예약 등록/검증/번호 발급
 *
 * 명세서 Task 0-6 (에러 포맷)에 맞게 응답 표준화.
 * 기존 클라이언트가 root에서 reservationNumber/totalAmount/error를 직접 읽으므로 root shim 적용.
 */

/**
 * 예약 등록 메인 함수. 클라이언트 호출.
 *
 * 응답: { success:true, data:{reservationNumber, totalAmount, message}, reservationNumber, totalAmount, message }
 * 실패: { success:false, errorCode, errorMessage, error }
 *
 * @param {Object} formData
 * @return {Object}
 */
function submitReservation(formData) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    // 1. 유효성 검증
    var validation = validateFormData(formData);
    if (!validation.valid) {
      return fail(
        validation.errorCode || ERROR_CODES.INVALID_INPUT,
        validation.errors.join('\n')
      );
    }

    // 2. 예약 가능 여부 재확인
    var availability = checkAvailability(
      formData.date,
      formData.startTime,
      formData.endTime,
      formData.roomType
    );
    if (!availability.available) {
      return fail(
        ERROR_CODES.TIME_BLOCKED,
        '선택하신 시간에 이미 예약이 있습니다. 다른 시간을 선택해주세요.'
      );
    }

    // 3. 예약번호 생성
    var reservationNumber = generateReservationNumber();

    // 4. 가격 계산 (옵션 없음 - 기존 동작 유지)
    var hours = calculateHours(formData.startTime, formData.endTime);
    var priceResp = calculatePrice(parseInt(formData.persons, 10), hours, formData.roomType);
    // priceResp는 표준 포맷 + root에 basePrice 등 노출
    var price = {
      basePrice: priceResp.basePrice,
      extraPersonFee: priceResp.extraPersonFee,
      subtotal: priceResp.subtotal,
      vat: priceResp.vat,
      total: priceResp.total
    };

    // 5. 사업자등록증 업로드
    var fileUrl = '';
    if (formData.taxBill === 'Y' && formData.businessFileData) {
      var fileBlob = base64ToBlob(
        formData.businessFileData,
        formData.businessFileType,
        formData.businessFileName
      );
      fileUrl = uploadFile(fileBlob, reservationNumber);
    }

    // 6. 예약내역 시트에 저장 (기존 27개 컬럼 유지 — AB~AJ는 자동으로 빈 셀)
    var sheet = getSheet('예약내역');
    var now = new Date();
    sheet.appendRow([
      reservationNumber,            // A
      now,                          // B
      formData.date,                // C
      formData.startTime,           // D
      formData.endTime,             // E
      hours,                        // F
      formData.roomType,            // G
      formData.companyName,         // H
      formData.instagram || '',     // I
      formData.name,                // J
      formData.phone,               // K
      formData.persons,             // L
      formData.cars,                // M
      formData.taxBill,             // N
      formData.source,              // O
      formData.shootingType,        // P
      price.basePrice,              // Q
      price.extraPersonFee,         // R
      price.subtotal,               // S
      price.vat,                    // T
      price.total,                  // U
      'N',                          // V: 입금확인
      '',                           // W: 입금확인일시
      fileUrl,                      // X
      '',                           // Y: Calendar이벤트ID
      '대기',                       // Z: 알림톡발송상태
      ''                            // AA: 비고
      // AB~AJ는 Phase 1의 verifyPayment에서 setValue로 정확한 컬럼에 기록
    ]);

    log(LOG_LEVEL.INFO, 'reservation.submitted', {
      reservationNumber: reservationNumber,
      name: formData.name,
      date: formData.date,
      roomType: formData.roomType
    });

    var data = {
      reservationNumber: reservationNumber,
      totalAmount: price.total,
      message: '예약 신청이 완료되었습니다. 입금 확인 후 예약이 확정됩니다.'
    };
    return ok(data, data);

  } catch (error) {
    logError('submitReservation', error);
    return fail(
      error.errorCode || ERROR_CODES.UNKNOWN_ERROR,
      '예약 처리 중 오류가 발생했습니다. 다시 시도해주세요.'
    );
  } finally {
    lock.releaseLock();
  }
}

/**
 * 예약번호 생성 (RES{YYYYMMDD}-{NNN}).
 * @return {string}
 */
function generateReservationNumber() {
  var sheet = getSheet('예약내역');
  var today = new Date();
  var dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyyMMdd');
  var prefix = 'RES' + dateStr + '-';

  var data = sheet.getDataRange().getValues();
  var maxNum = 0;
  for (var i = 1; i < data.length; i++) {
    var resNum = data[i][0];
    if (resNum && String(resNum).indexOf(prefix) === 0) {
      var n = parseInt(String(resNum).split('-')[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  var newNum = String(maxNum + 1);
  while (newNum.length < 3) newNum = '0' + newNum;
  return prefix + newNum;
}

/**
 * 폼 데이터 유효성 검증.
 * @param {Object} data
 * @return {{valid:boolean, errors:Array<string>, errorCode?:string}}
 */
function validateFormData(data) {
  var errors = [];
  var firstErrorCode = null;
  function addError(msg, code) {
    errors.push(msg);
    if (!firstErrorCode) firstErrorCode = code;
  }

  // 필수 필드
  if (!data.companyName) addError('업체명을 입력해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.name) addError('이름을 입력해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.phone) addError('연락처를 입력해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.date) addError('예약 날짜를 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.startTime) addError('시작 시간을 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.endTime) addError('종료 시간을 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.roomType) addError('Room을 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.persons) addError('인원을 입력해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.cars) addError('차량 대수를 입력해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.taxBill) addError('세금계산서 발행 여부를 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.source) addError('유입 경로를 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.shootingType) addError('촬영 내용을 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.agreeTerms || data.agreeTerms !== 'true') addError('약관에 동의해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);

  // 형식 검증
  if (data.phone && !/^010-\d{4}-\d{4}$/.test(data.phone)) {
    addError('연락처는 010-0000-0000 형식으로 입력해주세요.', ERROR_CODES.INVALID_INPUT);
  }

  if (data.date) {
    var reservationDate = new Date(data.date);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (reservationDate < today) {
      addError('과거 날짜는 예약할 수 없습니다.', ERROR_CODES.INVALID_INPUT);
    }
  }

  if (data.startTime && data.endTime) {
    var start = timeToMinutes(data.startTime);
    var end = timeToMinutes(data.endTime);
    if (end <= start) {
      addError('종료 시간은 시작 시간보다 늦어야 합니다.', ERROR_CODES.INVALID_INPUT);
    } else {
      var hours = (end - start) / 60;
      var settings = _getSettingsRaw();
      var minHours = settings['최소이용시간'] || 2;
      if (hours < minHours) {
        addError('최소 이용 시간은 ' + minHours + '시간입니다.', ERROR_CODES.INVALID_INPUT);
      }
    }
  }

  if (data.persons) {
    var persons = parseInt(data.persons, 10);
    if (persons <= 0) {
      addError('인원은 1명 이상이어야 합니다.', ERROR_CODES.INVALID_INPUT);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    errorCode: firstErrorCode || null
  };
}
