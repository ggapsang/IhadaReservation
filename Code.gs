/**
 * 예약 관리 시스템 - 메인 파일
 * Google Apps Script WebApp
 *
 * @author Claude Code
 * @version 1.0
 * @date 2025-12-04
 */

// ==========================================
// 1. WebApp 진입점
// ==========================================

/**
 * WebApp 진입점 - HTML 페이지 렌더링
 * @param {Object} e - 요청 파라미터 객체
 * @return {HtmlOutput} HTML 페이지
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
 * POST 요청 처리
 * @param {Object} e - 요청 파라미터 객체
 * @return {ContentService} JSON 응답
 */
function doPost(e) {
  try {
    const action = e.parameter.action;
    let result;

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
      default:
        result = { success: false, error: '알 수 없는 요청입니다.' };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    logError('doPost', error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: '요청 처리 중 오류가 발생했습니다.'
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 2. 클라이언트 호출 가능 함수들
// ==========================================

/**
 * 설정 정보 조회 (클라이언트에서 호출)
 * @return {Object} 설정 객체
 */
function getSettings() {
  try {
    const sheet = getSheet('설정');
    const data = sheet.getDataRange().getValues();

    const settings = {};
    for (let i = 1; i < data.length; i++) {
      const key = data[i][0];
      const value = data[i][1];

      // 키를 camelCase로 변환
      const camelKey = key.replace(/\s+/g, '');
      settings[camelKey] = value;
    }

    return settings;
  } catch (error) {
    logError('getSettings', error);
    // 기본값 반환
    return {
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
  }
}

/**
 * Room 정보 조회 (클라이언트에서 호출)
 * @return {Array} Room 객체 배열
 */
function getRoomInfo() {
  try {
    const sheet = getSheet('Room정보');
    const data = sheet.getDataRange().getValues();
    const rooms = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][4] === 'Y') {  // 활성화된 룸만
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

/**
 * 실시간 가격 계산 (클라이언트에서 호출)
 * @param {number} persons - 전체 인원
 * @param {number} hours - 이용 시간
 * @param {string} roomType - Room 타입
 * @return {Object} 가격 상세 객체
 */
function calculatePrice(persons, hours, roomType) {
  try {
    const settings = getSettings();
    const basePersons = settings['기준인원'] || 3;
    const baseRate = settings['시간당기본요금'] || 44000;
    const extraPersonRate = settings['추가인원단가'] || 5000;
    const vatRate = settings['VAT요율'] || 10;

    // A+B 룸인 경우 요금 2배
    const roomMultiplier = roomType === 'A+B' ? 2 : 1;

    // 기본요금 계산
    const basePrice = baseRate * roomMultiplier * hours;

    // 추가 인원 계산
    const extraPersons = Math.max(0, persons - basePersons);
    const extraPersonFee = extraPersons * extraPersonRate * hours;

    // 소계
    const subtotal = basePrice + extraPersonFee;

    // VAT
    const vat = Math.round(subtotal * vatRate / 100);

    // 총액
    const total = subtotal + vat;

    return {
      basePrice: basePrice,
      extraPersonFee: extraPersonFee,
      subtotal: subtotal,
      vat: vat,
      total: total
    };
  } catch (error) {
    logError('calculatePrice', error);
    return {
      basePrice: 0,
      extraPersonFee: 0,
      subtotal: 0,
      vat: 0,
      total: 0,
      error: '가격 계산 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 인원에 따른 Room 타입 자동 추천 (클라이언트에서 호출)
 * @param {number} persons - 전체 인원
 * @return {string} 추천 Room 타입
 */
function suggestRoomType(persons) {
  try {
    const settings = getSettings();
    const abThreshold = settings['AB동시대관기준'] || 10;

    if (persons >= abThreshold) {
      return 'A+B';
    }

    return 'A';  // 기본값
  } catch (error) {
    logError('suggestRoomType', error);
    return 'A';
  }
}

/**
 * 예약 가능 여부 확인 (클라이언트에서 호출)
 * @param {string} date - 예약 날짜 (YYYY-MM-DD)
 * @param {string} startTime - 시작 시간 (HH:MM)
 * @param {string} endTime - 종료 시간 (HH:MM)
 * @param {string} roomType - Room 타입
 * @return {Object} { available: true/false, conflictReservations: [] }
 */
function checkAvailability(date, startTime, endTime, roomType) {
  try {
    const sheet = getSheet('예약내역');
    const data = sheet.getDataRange().getValues();

    const requestStart = new Date(date + ' ' + startTime);
    const requestEnd = new Date(date + ' ' + endTime);

    // 확인할 Room 목록
    let roomsToCheck = [roomType];
    if (roomType === 'A+B') {
      roomsToCheck = ['A', 'B', 'A+B'];
    }

    const conflicts = [];

    // 예약 내역 검사 (헤더 제외)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const reservationDate = formatDate(row[2]);  // C열: 예약날짜
      const reservationStart = new Date(reservationDate + ' ' + row[3]);  // D열: 시작시간
      const reservationEnd = new Date(reservationDate + ' ' + row[4]);  // E열: 종료시간
      const reservationRoom = row[6];  // G열: Room타입
      const paymentConfirmed = row[21];  // V열: 입금확인

      // 입금 확인된 예약만 체크
      if (paymentConfirmed !== 'Y') continue;

      // 같은 날짜인지 확인
      if (reservationDate !== date) continue;

      // Room 겹침 확인
      let roomConflict = false;
      if (reservationRoom === 'A+B') {
        // 기존 예약이 A+B면 모든 룸과 충돌
        roomConflict = true;
      } else if (roomType === 'A+B') {
        // 새 예약이 A+B면 A, B와 충돌
        roomConflict = (reservationRoom === 'A' || reservationRoom === 'B');
      } else {
        // 같은 룸인지 확인
        roomConflict = (reservationRoom === roomType);
      }

      if (!roomConflict) continue;

      // 시간 겹침 확인
      if (requestStart < reservationEnd && requestEnd > reservationStart) {
        conflicts.push({
          reservationNumber: row[0],  // A열: 예약번호
          date: reservationDate,
          startTime: row[3],
          endTime: row[4],
          roomType: reservationRoom
        });
      }
    }

    // 예약현황로그 시트에 조회 기록 저장
    try {
      const logSheet = getSheet('예약현황로그');
      logSheet.appendRow([
        new Date(),                         // 조회일시
        roomType,                           // Room타입
        date,                               // 예약날짜
        startTime,                          // 시작시간
        endTime,                            // 종료시간
        conflicts.length === 0 ? '가능' : '불가'  // 가능여부
      ]);
    } catch (logError) {
      // 로그 실패는 무시 (주 기능에 영향 없음)
      console.log('예약현황로그 저장 실패:', logError);
    }

    return {
      available: conflicts.length === 0,
      conflictReservations: conflicts
    };
  } catch (error) {
    logError('checkAvailability', error);
    return {
      available: false,
      error: '예약 확인 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 예약 등록 메인 함수
 * @param {Object} formData - 폼 데이터 객체
 * @return {Object} { success: true/false, reservationNumber: '...', message: '...' }
 */
function submitReservation(formData) {
  const lock = LockService.getScriptLock();

  try {
    // Lock 획득 (최대 30초 대기)
    lock.waitLock(30000);

    // 1. 데이터 유효성 검증
    const validation = validateFormData(formData);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join('\n')
      };
    }

    // 2. 예약 가능 여부 재확인
    const availability = checkAvailability(
      formData.date,
      formData.startTime,
      formData.endTime,
      formData.roomType
    );

    if (!availability.available) {
      return {
        success: false,
        error: '선택하신 시간에 이미 예약이 있습니다. 다른 시간을 선택해주세요.'
      };
    }

    // 3. 예약번호 생성
    const reservationNumber = generateReservationNumber();

    // 4. 가격 계산
    const hours = calculateHours(formData.startTime, formData.endTime);
    const price = calculatePrice(
      parseInt(formData.persons),
      hours,
      formData.roomType
    );

    // 5. 사업자등록증 업로드 처리 (있는 경우)
    let fileUrl = '';
    if (formData.taxBill === 'Y' && formData.businessFileData) {
      // Base64 데이터를 Blob으로 변환
      const fileBlob = base64ToBlob(
        formData.businessFileData,
        formData.businessFileType,
        formData.businessFileName
      );
      fileUrl = uploadFile(fileBlob, reservationNumber);
    }

    // 6. 스프레드시트에 저장
    const sheet = getSheet('예약내역');
    const now = new Date();

    sheet.appendRow([
      reservationNumber,                    // A: 예약번호
      now,                                  // B: 신청일시
      formData.date,                        // C: 예약날짜
      formData.startTime,                   // D: 시작시간
      formData.endTime,                     // E: 종료시간
      hours,                                // F: 이용시간
      formData.roomType,                    // G: Room타입
      formData.companyName,                 // H: 업체명
      formData.instagram || '',             // I: 인스타그램ID
      formData.name,                        // J: 이름
      formData.phone,                       // K: 연락처
      formData.persons,                     // L: 전체인원
      formData.cars,                        // M: 차량대수
      formData.taxBill,                     // N: 세금계산서
      formData.source,                      // O: 유입경로
      formData.shootingType,                // P: 촬영내용
      price.basePrice,                      // Q: 기본요금
      price.extraPersonFee,                 // R: 추가인원요금
      price.subtotal,                       // S: 소계
      price.vat,                            // T: VAT
      price.total,                          // U: 총금액
      'N',                                  // V: 입금확인
      '',                                   // W: 입금확인일시
      fileUrl,                              // X: 사업자등록증
      '',                                   // Y: Calendar이벤트ID
      '대기',                               // Z: 알림톡발송상태
      ''                                    // AA: 비고
    ]);

    logActivity('예약등록', {
      reservationNumber: reservationNumber,
      name: formData.name,
      date: formData.date,
      roomType: formData.roomType
    });

    return {
      success: true,
      reservationNumber: reservationNumber,
      totalAmount: price.total,
      message: '예약 신청이 완료되었습니다. 입금 확인 후 예약이 확정됩니다.'
    };

  } catch (error) {
    logError('submitReservation', error);
    return {
      success: false,
      error: '예약 처리 중 오류가 발생했습니다. 다시 시도해주세요.'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 예약번호 생성
 * @return {string} 예약번호 (예: RES20250101-001)
 */
function generateReservationNumber() {
  const sheet = getSheet('예약내역');
  const today = new Date();
  const dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyyMMdd');
  const prefix = 'RES' + dateStr + '-';

  // 오늘 날짜의 예약 번호 찾기
  const data = sheet.getDataRange().getValues();
  let maxNum = 0;

  for (let i = 1; i < data.length; i++) {
    const resNum = data[i][0];
    if (resNum && resNum.startsWith(prefix)) {
      const num = parseInt(resNum.split('-')[1]);
      if (num > maxNum) maxNum = num;
    }
  }

  const newNum = (maxNum + 1).toString().padStart(3, '0');
  return prefix + newNum;
}

/**
 * 폼 데이터 유효성 검증
 * @param {Object} data - 폼 데이터
 * @return {Object} { valid: true/false, errors: [] }
 */
function validateFormData(data) {
  const errors = [];

  // 필수 필드 체크
  if (!data.companyName) errors.push('업체명을 입력해주세요.');
  if (!data.name) errors.push('이름을 입력해주세요.');
  if (!data.phone) errors.push('연락처를 입력해주세요.');
  if (!data.date) errors.push('예약 날짜를 선택해주세요.');
  if (!data.startTime) errors.push('시작 시간을 선택해주세요.');
  if (!data.endTime) errors.push('종료 시간을 선택해주세요.');
  if (!data.roomType) errors.push('Room을 선택해주세요.');
  if (!data.persons) errors.push('인원을 입력해주세요.');
  if (!data.cars) errors.push('차량 대수를 입력해주세요.');
  if (!data.taxBill) errors.push('세금계산서 발행 여부를 선택해주세요.');
  if (!data.source) errors.push('유입 경로를 선택해주세요.');
  if (!data.shootingType) errors.push('촬영 내용을 선택해주세요.');
  if (!data.agreeTerms || data.agreeTerms !== 'true') errors.push('약관에 동의해주세요.');

  // 연락처 형식 체크
  if (data.phone) {
    const phoneRegex = /^010-\d{4}-\d{4}$/;
    if (!phoneRegex.test(data.phone)) {
      errors.push('연락처는 010-0000-0000 형식으로 입력해주세요.');
    }
  }

  // 날짜 체크 (과거 날짜 불가)
  if (data.date) {
    const reservationDate = new Date(data.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (reservationDate < today) {
      errors.push('과거 날짜는 예약할 수 없습니다.');
    }
  }

  // 시간 체크
  if (data.startTime && data.endTime) {
    const start = timeToMinutes(data.startTime);
    const end = timeToMinutes(data.endTime);

    if (end <= start) {
      errors.push('종료 시간은 시작 시간보다 늦어야 합니다.');
    }

    const hours = (end - start) / 60;
    const settings = getSettings();
    const minHours = settings['최소이용시간'] || 2;

    if (hours < minHours) {
      errors.push('최소 이용 시간은 ' + minHours + '시간입니다.');
    }
  }

  // 인원 체크
  if (data.persons) {
    const persons = parseInt(data.persons);
    if (persons <= 0) {
      errors.push('인원은 1명 이상이어야 합니다.');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// ==========================================
// 3. 유틸리티 함수
// ==========================================

/**
 * 시트 가져오기
 * @param {string} sheetName - 시트 이름
 * @return {Sheet} 시트 객체
 */
function getSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  return sheet;
}

/**
 * 날짜 포맷팅
 * @param {Date} date - 날짜 객체
 * @return {string} YYYY-MM-DD 형식
 */
function formatDate(date) {
  if (typeof date === 'string') return date;
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * 시간을 분으로 변환
 * @param {string} time - HH:MM 형식
 * @return {number} 분 단위
 */
function timeToMinutes(time) {
  const parts = time.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/**
 * 이용 시간 계산 (시간 단위)
 * @param {string} startTime - HH:MM
 * @param {string} endTime - HH:MM
 * @return {number} 시간
 */
function calculateHours(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return (end - start) / 60;
}

/**
 * 활동 로그 기록
 * @param {string} action - 액션명
 * @param {Object} data - 로그 데이터
 */
function logActivity(action, data) {
  console.log('[' + action + ']', JSON.stringify(data));
}

/**
 * 에러 로그 기록
 * @param {string} functionName - 함수명
 * @param {Error} error - 에러 객체
 */
function logError(functionName, error) {
  console.error('[ERROR]', functionName, error.toString(), error.stack);
}

/**
 * Base64 문자열을 Blob으로 변환
 * @param {string} base64Data - Base64 인코딩된 데이터
 * @param {string} mimeType - MIME 타입 (예: image/jpeg, application/pdf)
 * @param {string} fileName - 파일명
 * @return {Blob} Blob 객체
 */
function base64ToBlob(base64Data, mimeType, fileName) {
  try {
    // Base64 문자열을 바이트 배열로 디코딩
    const bytes = Utilities.base64Decode(base64Data);

    // Blob 생성
    const blob = Utilities.newBlob(bytes, mimeType, fileName);

    return blob;
  } catch (error) {
    logError('base64ToBlob', error);
    throw new Error('파일 변환 중 오류가 발생했습니다.');
  }
}

/**
 * 파일을 Google Drive에 업로드
 * @param {Blob} fileBlob - 파일 Blob 객체
 * @param {string} reservationNumber - 예약번호
 * @return {string} 업로드된 파일의 Drive URL
 */
function uploadFile(fileBlob, reservationNumber) {
  try {
    // 파일이 없으면 빈 문자열 반환
    if (!fileBlob) {
      return '';
    }

    // 파일 크기 확인 (10MB 제한)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (fileBlob.getBytes().length > maxSize) {
      throw new Error('파일 크기가 10MB를 초과합니다.');
    }

    // Drive 폴더 찾기 또는 생성
    const folderName = '예약_사업자등록증';
    let folder;

    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
      // 폴더를 루트가 아닌 특정 위치에 생성하려면 여기서 설정
    }

    // 파일명 생성: 예약번호_원본파일명
    const originalName = fileBlob.getName();
    const fileName = reservationNumber + '_' + originalName;

    // 파일 업로드
    const file = folder.createFile(fileBlob.setName(fileName));

    // 파일 공유 설정 (제한된 접근 - 링크 있는 사람만)
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingError) {
      // 공유 설정 실패는 무시 (파일은 이미 업로드됨)
      console.log('파일 공유 설정 실패 (무시):', sharingError);
    }

    // 파일 URL 반환
    const fileUrl = file.getUrl();

    logActivity('파일업로드', {
      reservationNumber: reservationNumber,
      fileName: fileName,
      fileSize: fileBlob.getBytes().length,
      fileUrl: fileUrl
    });

    return fileUrl;

  } catch (error) {
    logError('uploadFile', error);
    // 더 상세한 에러 메시지 반환
    const errorMsg = '파일 업로드 실패: ' + error.message + ' (파일크기: ' + (fileBlob ? fileBlob.getBytes().length : 'unknown') + ' bytes)';
    throw new Error(errorMsg);
  }
}

/**
 * Drive 폴더 ID 가져오기 (설정에서 관리)
 * @return {string} 폴더 ID
 */
function getUploadFolderId() {
  // Script Properties에서 폴더 ID를 가져오거나
  // 없으면 자동 생성
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('UPLOAD_FOLDER_ID');

  if (!folderId) {
    const folderName = '예약_사업자등록증';
    let folder;

    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }

    folderId = folder.getId();
    props.setProperty('UPLOAD_FOLDER_ID', folderId);
  }

  return folderId;
}

/**
 * Google Docs에서 이용약관 내용 가져오기
 * @return {Object} { content: HTML 내용, lastModified: 마지막 수정일 }
 */
function getTermsContent() {
  try {
    const docId = '15NN03jeN6CHls3TMjkTIQWfmQIDvnxuoKukARue3f_0';
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    const lastModified = DriveApp.getFileById(docId).getLastUpdated();

    // 문서 내용을 HTML로 변환
    const htmlContent = convertDocToHtml(body);

    return {
      content: htmlContent,
      lastModified: Utilities.formatDate(lastModified, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
    };
  } catch (error) {
    logError('getTermsContent', error);
    return {
      content: '<p>약관을 불러오는데 실패했습니다. 관리자에게 문의해주세요.</p>',
      lastModified: ''
    };
  }
}

/**
 * Google Docs Body를 HTML로 변환
 * @param {Body} body - Google Docs Body 객체
 * @return {string} HTML 문자열
 */
function convertDocToHtml(body) {
  const numChildren = body.getNumChildren();
  let html = '';

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    const type = child.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const paragraph = child.asParagraph();
      const heading = paragraph.getHeading();
      const text = paragraph.getText();

      // 빈 줄 무시
      if (!text.trim()) {
        continue;
      }

      // 제목 스타일에 따라 태그 선택
      if (heading === DocumentApp.ParagraphHeading.HEADING1) {
        html += '<h1>' + escapeHtml(text) + '</h1>\n';
      } else if (heading === DocumentApp.ParagraphHeading.HEADING2) {
        html += '<h2>' + escapeHtml(text) + '</h2>\n';
      } else if (heading === DocumentApp.ParagraphHeading.HEADING3) {
        html += '<h3>' + escapeHtml(text) + '</h3>\n';
      } else if (heading === DocumentApp.ParagraphHeading.HEADING4) {
        html += '<h4>' + escapeHtml(text) + '</h4>\n';
      } else {
        // 일반 단락
        html += '<p>' + convertParagraphToHtml(paragraph) + '</p>\n';
      }
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      const listItem = child.asListItem();
      const text = listItem.getText();
      html += '<li>' + escapeHtml(text) + '</li>\n';
    } else if (type === DocumentApp.ElementType.TABLE) {
      html += convertTableToHtml(child.asTable());
    }
  }

  return html;
}

/**
 * 단락 내 텍스트 포맷 처리 (굵기, 이탤릭 등)
 * @param {Paragraph} paragraph - 단락 객체
 * @return {string} HTML 문자열
 */
function convertParagraphToHtml(paragraph) {
  const text = paragraph.getText();
  const numChildren = paragraph.getNumChildren();
  let html = '';

  for (let i = 0; i < numChildren; i++) {
    const child = paragraph.getChild(i);

    if (child.getType() === DocumentApp.ElementType.TEXT) {
      const textElement = child.asText();
      const textStr = textElement.getText();

      // 간단한 처리: 전체 텍스트만 반환 (포맷 무시)
      // 더 복잡한 포맷 처리는 필요시 추가 가능
      html += escapeHtml(textStr);
    }
  }

  return html || escapeHtml(text);
}

/**
 * 테이블을 HTML로 변환
 * @param {Table} table - 테이블 객체
 * @return {string} HTML 문자열
 */
function convertTableToHtml(table) {
  const numRows = table.getNumRows();
  let html = '<table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0;">\n';

  for (let i = 0; i < numRows; i++) {
    const row = table.getRow(i);
    const numCells = row.getNumCells();
    html += '<tr>\n';

    for (let j = 0; j < numCells; j++) {
      const cell = row.getCell(j);
      const cellText = cell.getText();
      const tag = i === 0 ? 'th' : 'td';
      html += '<' + tag + ' style="padding: 8px; border: 1px solid #ddd;">' + escapeHtml(cellText) + '</' + tag + '>\n';
    }

    html += '</tr>\n';
  }

  html += '</table>\n';
  return html;
}

/**
 * HTML 이스케이프 처리
 * @param {string} text - 원본 텍스트
 * @return {string} 이스케이프된 텍스트
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

/**
 * 입금 확인 처리 (관리자용)
 * @param {string} reservationNumber - 예약번호
 * @return {Object} { success: true/false, calendarEventId: '...', message: '...' }
 */
function confirmPayment(reservationNumber) {
  try {
    const sheet = getSheet('예약내역');
    const data = sheet.getDataRange().getValues();

    // 예약번호로 행 찾기
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === reservationNumber) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      return {
        success: false,
        error: '예약번호를 찾을 수 없습니다: ' + reservationNumber
      };
    }

    // 이미 입금 확인된 경우
    if (data[rowIndex][21] === 'Y') {  // V열: 입금확인
      return {
        success: false,
        error: '이미 입금 확인된 예약입니다.'
      };
    }

    // 예약 정보 추출
    const reservationData = {
      reservationNumber: data[rowIndex][0],   // A: 예약번호
      date: data[rowIndex][2],                 // C: 예약날짜
      startTime: data[rowIndex][3],            // D: 시작시간
      endTime: data[rowIndex][4],              // E: 종료시간
      hours: data[rowIndex][5],                // F: 이용시간
      roomType: data[rowIndex][6],             // G: Room타입
      companyName: data[rowIndex][7],          // H: 업체명
      instagram: data[rowIndex][8],            // I: 인스타그램ID
      name: data[rowIndex][9],                 // J: 이름
      phone: data[rowIndex][10],               // K: 연락처
      persons: data[rowIndex][11],             // L: 전체인원
      cars: data[rowIndex][12],                // M: 차량대수
      taxBill: data[rowIndex][13],             // N: 세금계산서
      source: data[rowIndex][14],              // O: 유입경로
      shootingType: data[rowIndex][15],        // P: 촬영내용
      totalAmount: data[rowIndex][20]          // U: 총금액
    };

    // Google Calendar 이벤트 생성
    const calendarEventId = createCalendarEvent(reservationData);

    // 입금 확인 업데이트
    const now = new Date();
    sheet.getRange(rowIndex + 1, 22).setValue('Y');  // V열: 입금확인
    sheet.getRange(rowIndex + 1, 23).setValue(now);   // W열: 입금확인일시
    sheet.getRange(rowIndex + 1, 25).setValue(calendarEventId);  // Y열: Calendar이벤트ID
    sheet.getRange(rowIndex + 1, 26).setValue('예약확정');  // Z열: 알림톡발송상태

    logActivity('입금확인', {
      reservationNumber: reservationNumber,
      calendarEventId: calendarEventId,
      confirmedAt: now
    });

    return {
      success: true,
      calendarEventId: calendarEventId,
      message: '입금 확인 및 Calendar 등록이 완료되었습니다.',
      reservationData: reservationData
    };

  } catch (error) {
    logError('confirmPayment', error);
    return {
      success: false,
      error: '입금 확인 처리 중 오류가 발생했습니다: ' + error.message
    };
  }
}

/**
 * Google Calendar에 예약 이벤트 생성
 * @param {Object} reservationData - 예약 정보 객체
 * @return {string} Calendar Event ID
 */
function createCalendarEvent(reservationData) {
  try {
    // 기본 Calendar 가져오기
    const calendar = CalendarApp.getDefaultCalendar();

    // 이벤트 제목
    const title = '[' + reservationData.roomType + '] ' +
                  reservationData.companyName + ' - ' +
                  reservationData.shootingType;

    // 시작/종료 시간 생성
    const startDateTime = new Date(reservationData.date + ' ' + reservationData.startTime);
    const endDateTime = new Date(reservationData.date + ' ' + reservationData.endTime);

    // 이벤트 설명 (상세 정보)
    const description =
      '=== 예약 정보 ===\n' +
      '예약번호: ' + reservationData.reservationNumber + '\n' +
      '업체명: ' + reservationData.companyName + '\n' +
      (reservationData.instagram ? '인스타그램: ' + reservationData.instagram + '\n' : '') +
      '\n' +
      '=== 예약자 정보 ===\n' +
      '이름: ' + reservationData.name + '\n' +
      '연락처: ' + reservationData.phone + '\n' +
      '\n' +
      '=== 방문 정보 ===\n' +
      '전체 인원: ' + reservationData.persons + '명\n' +
      '차량 대수: ' + reservationData.cars + '대\n' +
      '\n' +
      '=== 촬영 정보 ===\n' +
      '촬영 내용: ' + reservationData.shootingType + '\n' +
      '이용 시간: ' + reservationData.hours + '시간\n' +
      '\n' +
      '=== 결제 정보 ===\n' +
      '총 금액: ' + (reservationData.totalAmount ? reservationData.totalAmount.toLocaleString() : '0') + '원\n' +
      '세금계산서: ' + (reservationData.taxBill === 'Y' ? '발행' : '미발행') + '\n' +
      '\n' +
      '유입 경로: ' + reservationData.source;

    // 이벤트 생성
    const event = calendar.createEvent(
      title,
      startDateTime,
      endDateTime,
      {
        description: description,
        location: '스튜디오 ' + reservationData.roomType
      }
    );

    // 알림 설정 (30분 전)
    event.addPopupReminder(30);

    // 이벤트 ID 반환
    const eventId = event.getId();

    logActivity('Calendar이벤트생성', {
      reservationNumber: reservationData.reservationNumber,
      eventId: eventId,
      title: title,
      startTime: startDateTime,
      endTime: endDateTime
    });

    return eventId;

  } catch (error) {
    logError('createCalendarEvent', error);
    throw new Error('Calendar 이벤트 생성 실패: ' + error.message);
  }
}

/**
 * Calendar 이벤트 삭제 (예약 취소 시 사용)
 * @param {string} eventId - Calendar Event ID
 * @return {boolean} 성공 여부
 */
function deleteCalendarEvent(eventId) {
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    const event = calendar.getEventById(eventId);

    if (event) {
      event.deleteEvent();
      logActivity('Calendar이벤트삭제', { eventId: eventId });
      return true;
    }

    return false;
  } catch (error) {
    logError('deleteCalendarEvent', error);
    return false;
  }
}

/**
 * 예약번호로 예약 정보 조회
 * @param {string} reservationNumber - 예약번호
 * @return {Object} 예약 정보 객체 또는 null
 */
function getReservationByNumber(reservationNumber) {
  try {
    const sheet = getSheet('예약내역');
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === reservationNumber) {
        return {
          rowIndex: i,
          reservationNumber: data[i][0],
          applicationDate: data[i][1],
          date: data[i][2],
          startTime: data[i][3],
          endTime: data[i][4],
          hours: data[i][5],
          roomType: data[i][6],
          companyName: data[i][7],
          instagram: data[i][8],
          name: data[i][9],
          phone: data[i][10],
          persons: data[i][11],
          cars: data[i][12],
          taxBill: data[i][13],
          source: data[i][14],
          shootingType: data[i][15],
          basePrice: data[i][16],
          extraPersonFee: data[i][17],
          subtotal: data[i][18],
          vat: data[i][19],
          totalAmount: data[i][20],
          paymentConfirmed: data[i][21],
          paymentConfirmedDate: data[i][22],
          businessFile: data[i][23],
          calendarEventId: data[i][24],
          notificationStatus: data[i][25],
          notes: data[i][26]
        };
      }
    }

    return null;
  } catch (error) {
    logError('getReservationByNumber', error);
    return null;
  }
}

function testDrivePermission() {
  DriveApp.createFolder('테스트');
}

function testCalendarPermission() {
  CalendarApp.getDefaultCalendar();
}

/**
 * 스프레드시트 버튼용 - 선택된 행의 입금 확인 처리
 * 사용법: 예약내역 시트에서 해당 행을 선택하고 버튼 클릭
 */
function confirmPaymentFromSheet() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('예약내역');
    const activeRange = sheet.getActiveRange();
    const row = activeRange.getRow();

    // 헤더 행인 경우
    if (row === 1) {
      SpreadsheetApp.getUi().alert('헤더 행은 선택할 수 없습니다. 예약 데이터 행을 선택해주세요.');
      return;
    }

    // 예약번호 가져오기 (A열)
    const reservationNumber = sheet.getRange(row, 1).getValue();

    if (!reservationNumber) {
      SpreadsheetApp.getUi().alert('예약번호가 없습니다. 올바른 예약 행을 선택해주세요.');
      return;
    }

    // 입금 확인 처리
    const result = confirmPayment(reservationNumber);

    // 결과 알림
    if (result.success) {
      SpreadsheetApp.getUi().alert(
        '✅ 입금 확인 완료\n\n' +
        '예약번호: ' + reservationNumber + '\n' +
        '업체명: ' + result.reservationData.companyName + '\n' +
        '예약날짜: ' + result.reservationData.date + '\n' +
        'Room: ' + result.reservationData.roomType + '\n\n' +
        'Google Calendar에 일정이 등록되었습니다.'
      );
    } else {
      SpreadsheetApp.getUi().alert('❌ 오류 발생\n\n' + result.error);
    }

  } catch (error) {
    logError('confirmPaymentFromSheet', error);
    SpreadsheetApp.getUi().alert('❌ 오류 발생\n\n' + error.message);
  }
}

/**
 * 스프레드시트 열릴 때 커스텀 메뉴 추가
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎬 예약 관리')
    .addItem('💰 입금 확인 (선택된 행)', 'confirmPaymentFromSheet')
    .addSeparator()
    .addItem('📅 Calendar 이벤트 삭제', 'deleteCalendarEventFromSheet')
    .addSeparator()
    .addItem('📊 예약 현황 보기', 'showReservationSummary')
    .addToUi();
}

/**
 * 선택된 행의 Calendar 이벤트 삭제
 */
function deleteCalendarEventFromSheet() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('예약내역');
    const activeRange = sheet.getActiveRange();
    const row = activeRange.getRow();

    if (row === 1) {
      SpreadsheetApp.getUi().alert('헤더 행은 선택할 수 없습니다.');
      return;
    }

    // Calendar 이벤트 ID 가져오기 (Y열 = 25)
    const eventId = sheet.getRange(row, 25).getValue();

    if (!eventId) {
      SpreadsheetApp.getUi().alert('Calendar 이벤트 ID가 없습니다.');
      return;
    }

    // 확인 대화상자
    const response = SpreadsheetApp.getUi().alert(
      'Calendar 이벤트 삭제',
      'Google Calendar에서 이 예약의 일정을 삭제하시겠습니까?',
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );

    if (response === SpreadsheetApp.getUi().Button.YES) {
      const success = deleteCalendarEvent(eventId);

      if (success) {
        // 스프레드시트에서도 이벤트 ID 제거
        sheet.getRange(row, 25).setValue('');
        SpreadsheetApp.getUi().alert('✅ Calendar 이벤트가 삭제되었습니다.');
      } else {
        SpreadsheetApp.getUi().alert('❌ Calendar 이벤트 삭제에 실패했습니다.');
      }
    }

  } catch (error) {
    logError('deleteCalendarEventFromSheet', error);
    SpreadsheetApp.getUi().alert('❌ 오류 발생\n\n' + error.message);
  }
}

/**
 * 예약 현황 요약 표시
 */
function showReservationSummary() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('예약내역');
    const data = sheet.getDataRange().getValues();

    let totalReservations = data.length - 1;  // 헤더 제외
    let confirmedPayments = 0;
    let pendingPayments = 0;
    let totalAmount = 0;
    let confirmedAmount = 0;

    for (let i = 1; i < data.length; i++) {
      const paymentConfirmed = data[i][21];  // V열
      const amount = data[i][20] || 0;       // U열

      totalAmount += amount;

      if (paymentConfirmed === 'Y') {
        confirmedPayments++;
        confirmedAmount += amount;
      } else {
        pendingPayments++;
      }
    }

    const message =
      '📊 예약 현황 요약\n\n' +
      '총 예약 건수: ' + totalReservations + '건\n' +
      '입금 확인: ' + confirmedPayments + '건\n' +
      '입금 대기: ' + pendingPayments + '건\n\n' +
      '총 예약 금액: ' + totalAmount.toLocaleString() + '원\n' +
      '확정 금액: ' + confirmedAmount.toLocaleString() + '원\n' +
      '대기 금액: ' + (totalAmount - confirmedAmount).toLocaleString() + '원';

    SpreadsheetApp.getUi().alert(message);

  } catch (error) {
    logError('showReservationSummary', error);
    SpreadsheetApp.getUi().alert('❌ 오류 발생\n\n' + error.message);
  }
}
