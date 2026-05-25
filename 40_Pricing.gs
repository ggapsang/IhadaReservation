/**
 * 40_Pricing.gs - 가격 계산
 *
 * 요구사항 명세서_260522 기준:
 *   - 평일/주말 차등 3시간 패키지 요금
 *   - 시간 추가: 3시간 초과 1시간당 50,000원
 *   - 인원 추가: 1인당 / 총 이용시간 기준 → 1인당 × 총 이용시간(시간) 비례
 *   - 모든 가격은 부가세 포함, VAT는 역산하여 표시
 *   - 보증금 100,000원 별도 합산
 */

/**
 * 주어진 날짜가 주말(토·일) 또는 공휴일(설정 '공휴일목록')인지 판정.
 * @param {string|Date} date
 * @return {boolean}
 */
function isWeekendOrHoliday(date) {
  if (!date) return false;
  var d = (date instanceof Date) ? date : new Date(date);
  var day = d.getDay(); // 0=일, 6=토
  if (day === 0 || day === 6) return true;
  try {
    var settings = _getSettingsRaw();
    var holidaysStr = settings['공휴일목록'];
    if (!holidaysStr) return false;
    var dateStr = (typeof date === 'string') ? date : formatDate(d);
    return String(holidaysStr).split(',').map(function (s) { return s.trim(); }).indexOf(dateStr) >= 0;
  } catch (e) {
    return false;
  }
}

/**
 * 통합 가격 계산 (명세서 표 그대로).
 *
 * subtotal = packageRate + (시간추가요금 × 추가시간) + (인원추가요금 × 추가인원 × 총이용시간)
 * total    = subtotal + 보증금
 * vat      = subtotal × 10 / 110   (역산)
 *
 * @param {{persons:number, hours:number, date?:string}} reservationParams
 * @return {Object}
 */
function calculateTotalPrice(reservationParams) {
  var settings = _getSettingsRaw();

  var basePersons = Number(settings['기준인원']) || 4;
  var minHours = Number(settings['최소이용시간']) || 3;
  var weekdayRate = Number(settings['기본요금_평일_3시간']) || 300000;
  var weekendRate = Number(settings['기본요금_주말_3시간']) || 400000;
  var extraHourRate = Number(settings['시간추가요금']) || 50000;
  var extraPersonRate = Number(settings['인원추가요금']) || 10000;
  var deposit = Number(settings['보증금']) || 100000;
  var vatRate = Number(settings['VAT요율']) || 10;

  var persons = parseInt(reservationParams.persons, 10);
  var hours = Number(reservationParams.hours);
  var date = reservationParams.date;

  var isWeekend = date ? isWeekendOrHoliday(date) : false;
  var packageRate = isWeekend ? weekendRate : weekdayRate;

  // 시간 추가: 3시간 초과분
  var extraHours = Math.max(0, hours - minHours);
  var extraHoursFee = extraHours * extraHourRate;

  // 인원 추가: 명세표 "(1인당 / 총 이용시간 기준)" → 인원 × 시간 비례
  var extraPersons = Math.max(0, persons - basePersons);
  var extraPersonFee = extraPersons * extraPersonRate * hours;

  var subtotal = packageRate + extraHoursFee + extraPersonFee;
  // VAT 포함 가격에서 역산
  var vat = Math.round(subtotal * vatRate / (100 + vatRate));
  var total = subtotal + deposit;

  return {
    subtotal: subtotal,
    vat: vat,
    deposit: deposit,
    total: total,
    isWeekend: isWeekend,
    breakdown: {
      packageRate: packageRate,
      extraHours: extraHours,
      extraHoursFee: extraHoursFee,
      extraPersons: extraPersons,
      extraPersonFee: extraPersonFee
    }
  };
}

/**
 * 클라이언트용 가격 계산. root에 표시 필드 노출.
 * @param {number} persons
 * @param {number} hours
 * @param {string} [roomType] - 호환 인자 (사용 안 함)
 * @param {string} [date] - YYYY-MM-DD
 */
function calculatePrice(persons, hours, roomType, date) {
  try {
    var result = calculateTotalPrice({ persons: persons, hours: hours, date: date });
    var view = {
      basePrice: result.breakdown.packageRate,
      extraHoursFee: result.breakdown.extraHoursFee,
      extraPersonOnlyFee: result.breakdown.extraPersonFee,
      subtotal: result.subtotal,
      vat: result.vat,
      deposit: result.deposit,
      total: result.total,
      isWeekend: result.isWeekend,
      // 하위 호환: 시간 추가 + 인원 추가 합산
      extraPersonFee: result.breakdown.extraHoursFee + result.breakdown.extraPersonFee,
      packageRate: result.breakdown.packageRate
    };
    return ok(view, view);
  } catch (error) {
    logError('calculatePrice', error);
    var zero = {
      basePrice: 0, extraHoursFee: 0, extraPersonOnlyFee: 0,
      subtotal: 0, vat: 0, deposit: 0, total: 0,
      isWeekend: false, extraPersonFee: 0, packageRate: 0
    };
    var resp = fail(ERROR_CODES.UNKNOWN_ERROR, '가격 계산 중 오류가 발생했습니다.');
    Object.keys(zero).forEach(function (k) { resp[k] = zero[k]; });
    return resp;
  }
}

/**
 * 환불 금액 계산 (요구사항 명세서_260522 4조).
 * 일 단위 정책: 8일 이상 100% / 5–7일 50% / 3–4일 30% / 2일 이내 0%.
 * 보증금은 별도 처리되므로 본 함수 결과에 포함하지 않습니다.
 *
 * @param {{amount:number, reservationDate:string}} payment
 * @param {Date|string} cancelledAt
 * @return {{refundRate, refundAmount, policy, daysBefore}}
 */
function calculateRefundAmount(payment, cancelledAt) {
  var settings = _getSettingsRaw();
  function n(key, fallback) {
    var v = Number(settings[key]);
    return isNaN(v) ? fallback : v;
  }
  var p8 = n('환불정책_8일이상', 100);
  var p57 = n('환불정책_5_7일', 50);
  var p34 = n('환불정책_3_4일', 30);
  var p2 = n('환불정책_2일이내', 0);

  var reservationDt = new Date(payment.reservationDate + 'T00:00:00');
  var cancelDt = (cancelledAt instanceof Date) ? cancelledAt : new Date(cancelledAt || new Date());
  var cancelMidnight = new Date(cancelDt.getFullYear(), cancelDt.getMonth(), cancelDt.getDate());
  var daysBefore = Math.floor((reservationDt.getTime() - cancelMidnight.getTime()) / (1000 * 60 * 60 * 24));

  var rate, policy;
  if (daysBefore >= 8) { rate = p8; policy = '8일이상'; }
  else if (daysBefore >= 5) { rate = p57; policy = '5_7일'; }
  else if (daysBefore >= 3) { rate = p34; policy = '3_4일'; }
  else { rate = p2; policy = '2일이내'; }

  return {
    refundRate: rate,
    refundAmount: Math.round((payment.amount || 0) * rate / 100),
    policy: policy,
    daysBefore: daysBefore
  };
}
