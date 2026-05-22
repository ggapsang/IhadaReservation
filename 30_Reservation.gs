/**
 * 30_Reservation.gs - 예약 등록/검증/번호 발급
 *
 * 260522 약관 기준 단일 공간(이오 아크로 _성수) 예약.
 *
 * 폼 필수 항목 (약관 + 운영 필수):
 *   - 이름, 연락처, 이메일, 예약 날짜·시간, 인원, 세금계산서 발행 여부, 약관 동의
 *   - 세금계산서='Y'인 경우 사업자등록증 파일
 *
 * 제거된 항목 (약관에 없는 마케팅·운영 데이터):
 *   - 업체 및 브랜드명, 인스타그램 ID, 차량 대수, 유입 경로, 촬영 내용, Room 타입
 */

/**
 * 예약 등록 메인 함수. 클라이언트 호출.
 *
 * 응답:
 *   성공 — { success:true, data:{reservationNumber, totalAmount, deposit, message}, reservationNumber, totalAmount, deposit, message }
 *   실패 — { success:false, errorCode, errorMessage, error }
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

    // 2. 예약 가능 여부 재확인 (단일 공간이므로 roomType 인자는 무시됨)
    var availability = checkAvailability(formData.date, formData.startTime, formData.endTime);
    if (!availability.available) {
      return fail(
        ERROR_CODES.TIME_BLOCKED,
        '선택하신 시간에 이미 예약이 있습니다. 다른 시간을 선택해주세요.'
      );
    }

    // 3. 예약번호 생성
    var reservationNumber = generateReservationNumber();

    // 4. 가격 계산 (260522 약관: 평일/주말 차등 + 보증금 포함)
    var hours = calculateHours(formData.startTime, formData.endTime);
    var priceResp = calculatePrice(
      parseInt(formData.persons, 10),
      hours,
      null,           // roomType — 단일 공간이므로 무시
      formData.date
    );
    var price = {
      basePrice: priceResp.basePrice || 0,
      extraHoursFee: priceResp.extraHoursFee || 0,
      extraPersonFee: priceResp.extraPersonOnlyFee || 0,
      subtotal: priceResp.subtotal || 0,
      vat: priceResp.vat || 0,
      deposit: priceResp.deposit || 0,
      total: priceResp.total || 0
    };

    // 5. 사업자등록증 업로드 (세금계산서='Y'인 경우만)
    var fileUrl = '';
    if (formData.taxBill === 'Y' && formData.businessFileData) {
      var fileBlob = base64ToBlob(
        formData.businessFileData,
        formData.businessFileType,
        formData.businessFileName
      );
      fileUrl = uploadFile(fileBlob, reservationNumber);
    }

    // 6. 예약내역 시트에 저장 — 신규 32컬럼 양식, 결제·옵션 9개는 빈 셀로 자동 채워짐
    var sheet = getSheet('예약내역');
    var now = new Date();
    sheet.appendRow([
      reservationNumber,        // A 예약번호
      now,                      // B 신청일시
      formData.date,            // C 예약날짜
      formData.startTime,       // D 시작시간
      formData.endTime,         // E 종료시간
      hours,                    // F 이용시간
      formData.name,            // G 이름
      formData.phone,           // H 연락처
      formData.email,           // I 이메일
      formData.persons,         // J 전체인원
      formData.taxBill,         // K 세금계산서
      price.basePrice,          // L 기본요금
      price.extraHoursFee,      // M 시간추가요금
      price.extraPersonFee,     // N 인원추가요금
      price.subtotal,           // O 소계
      price.vat,                // P VAT
      price.deposit,            // Q 보증금
      price.total,              // R 총금액
      'N',                      // S 입금확인
      '',                       // T 입금확인일시
      fileUrl,                  // U 사업자등록증
      '',                       // V Calendar이벤트ID
      '대기'                    // W 알림톡발송상태
      // X~AF: 옵션·결제 9개 — Phase 1에서 setValue로 기록
    ]);

    log(LOG_LEVEL.INFO, 'reservation.submitted', {
      reservationNumber: reservationNumber,
      name: formData.name,
      date: formData.date
    });

    var depositMsg = price.deposit > 0
      ? '\n(이용대금 ' + (price.total - price.deposit).toLocaleString() + '원 + 보증금 ' +
        price.deposit.toLocaleString() + '원 포함, 보증금은 퇴실 점검 후 환불됩니다.)'
      : '';
    var data = {
      reservationNumber: reservationNumber,
      totalAmount: price.total,
      deposit: price.deposit,
      message: '예약 신청이 완료되었습니다. 이용대금 + 보증금 입금 확인 후 예약이 확정됩니다.' + depositMsg
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
 * 폼 데이터 유효성 검증 (260522 약관 기준).
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
  if (!data.name) addError('이름을 입력해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.phone) addError('연락처를 입력해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.email) addError('이메일을 입력해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.date) addError('예약 날짜를 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.startTime) addError('시작 시간을 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.endTime) addError('종료 시간을 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.persons) addError('인원을 입력해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.taxBill) addError('세금계산서 발행 여부를 선택해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  if (!data.agreeTerms || data.agreeTerms !== 'true') addError('약관에 동의해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);

  // 형식 검증
  if (data.phone && !/^010-\d{4}-\d{4}$/.test(data.phone)) {
    addError('연락처는 010-0000-0000 형식으로 입력해주세요.', ERROR_CODES.INVALID_INPUT);
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    addError('이메일 형식이 올바르지 않습니다.', ERROR_CODES.INVALID_INPUT);
  }

  if (data.date) {
    var reservationDate = new Date(data.date);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (reservationDate < today) {
      addError('과거 날짜는 예약할 수 없습니다.', ERROR_CODES.INVALID_INPUT);
    }
  }

  // 시간 + 최소 이용시간
  if (data.startTime && data.endTime) {
    var start = timeToMinutes(data.startTime);
    var end = timeToMinutes(data.endTime);
    if (end <= start) {
      addError('종료 시간은 시작 시간보다 늦어야 합니다.', ERROR_CODES.INVALID_INPUT);
    } else {
      var hours = (end - start) / 60;
      var settings = _getSettingsRaw();
      var minHours = Number(settings['최소이용시간']) || 3;
      if (hours < minHours) {
        addError('최소 이용 시간은 ' + minHours + '시간입니다.', ERROR_CODES.INVALID_INPUT);
      }
    }
  }

  // 인원 범위 (260522 약관: 기준 4명, 최대 8명)
  if (data.persons) {
    var persons = parseInt(data.persons, 10);
    if (persons <= 0) {
      addError('인원은 1명 이상이어야 합니다.', ERROR_CODES.INVALID_INPUT);
    } else {
      var settingsForPersons = _getSettingsRaw();
      var maxPersons = Number(settingsForPersons['최대인원']) || 0;
      if (maxPersons > 0 && persons > maxPersons) {
        addError('최대 입실 가능 인원은 ' + maxPersons + '명입니다.', ERROR_CODES.INVALID_INPUT);
      }
    }
  }

  // 세금계산서='Y'인 경우 사업자등록증 필수
  if (data.taxBill === 'Y' && !data.businessFileData) {
    addError('세금계산서 발행을 위해 사업자등록증을 첨부해주세요.', ERROR_CODES.MISSING_REQUIRED_FIELD);
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    errorCode: firstErrorCode || null
  };
}
