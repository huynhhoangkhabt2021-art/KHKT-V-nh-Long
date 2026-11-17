import type {
  AutoPurifierStatus,
  DayPeriod,
  EnvironmentReading,
  HealthTone,
  MedicalRecordProfile,
  MedicationDose,
  SmartHealthState,
  SosContact,
} from '../types/health';

export const DAY_PERIODS: DayPeriod[] = ['Sáng', 'Trưa', 'Chiều', 'Tối'];

export const PERIOD_TRAY_MAP: Record<DayPeriod, 1 | 2 | 3 | 4> = {
  Sáng: 1,
  Trưa: 2,
  Chiều: 3,
  Tối: 4,
};

export function getTrayNumberForPeriod(period: DayPeriod): 1 | 2 | 3 | 4 {
  return PERIOD_TRAY_MAP[period] ?? 1;
}

export function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  if (parts.length !== 2) return 0;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return (
    Math.max(0, Math.min(23, hours)) * 60 +
    Math.max(0, Math.min(59, minutes))
  );
}

export function formatClockTime(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getAllTraysSorted(doses: MedicationDose[]): MedicationDose[] {
  return [...doses].sort((a, b) => {
    if (a.trayNumber !== b.trayNumber) return a.trayNumber - b.trayNumber;
    return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
  });
}

export function getNextPriorityDose(
  doses: MedicationDose[]
): MedicationDose | null {
  const pending = doses.filter((dose) => !dose.taken);
  if (pending.length === 0) return null;
  return [...pending].sort(
    (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
  )[0];
}

export function groupDosesByPeriod(
  doses: MedicationDose[]
): Record<DayPeriod, MedicationDose[]> {
  const grouped: Record<DayPeriod, MedicationDose[]> = {
    Sáng: [],
    Trưa: [],
    Chiều: [],
    Tối: [],
  };
  const sorted = [...doses].sort(
    (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
  );
  for (const dose of sorted) {
    if (grouped[dose.period]) {
      grouped[dose.period].push(dose);
    }
  }
  return grouped;
}

export function findDueTrayAlarms(
  doses: MedicationDose[],
  currentHHMM: string
): MedicationDose[] {
  return doses.filter(
    (dose) => !dose.taken && !dose.alarmActive && dose.time === currentHHMM
  );
}

export function evaluateAirQuality(aqi: number): {
  label: string;
  tone: HealthTone;
  advice: string;
} {
  if (aqi <= 50) {
    return {
      label: 'Trong lành (Tốt)',
      tone: 'safe',
      advice:
        'Không khí phòng sạch sẽ. Máy lọc tự động tạm nghỉ để tiết kiệm điện năng.',
    };
  }
  if (aqi <= 100) {
    return {
      label: 'Ô nhiễm nhẹ',
      tone: 'warning',
      advice:
        'Phát hiện bụi/khí tăng nhẹ. Máy lọc tự động khởi động ở công suất nhẹ để làm sạch tiết kiệm điện.',
    };
  }
  if (aqi <= 150) {
    return {
      label: 'Ô nhiễm trung bình',
      tone: 'warning',
      advice:
        'Chất lượng không khí suy giảm. Máy lọc tự động tăng lên công suất vừa để lọc nhanh.',
    };
  }
  return {
    label: 'Ô nhiễm cao',
    tone: 'danger',
    advice:
      'Cảnh báo ô nhiễm không khí cao! Máy lọc tự động chạy công suất tối đa, nên mở cửa thông thoáng.',
  };
}

export function evaluateDht22Comfort(
  temperature: number,
  humidity: number
): {
  label: string;
  tone: HealthTone;
  advice: string;
} {
  if (temperature > 33 || temperature < 16 || humidity > 82 || humidity < 30) {
    return {
      label: 'Cần điều chỉnh phòng',
      tone: 'warning',
      advice:
        'Nhiệt độ hoặc độ ẩm phòng đang lệch ngưỡng thoải mái cho người cao tuổi.',
    };
  }
  return {
    label: 'Dễ chịu, ổn định',
    tone: 'safe',
    advice: 'Nhiệt độ và độ ẩm phòng đang ở mức phù hợp cho hô hấp và giấc ngủ.',
  };
}

export function computeAutoPurifierState(
  aqi: number,
  temperature: number,
  humidity: number
): AutoPurifierStatus {
  if (aqi > 150) {
    return {
      on: true,
      autoMode: true,
      level: 3,
      levelLabel: 'Mức 3 · Công suất tối đa (Bật tự động)',
      reason: `Chỉ số ô nhiễm đạt ${aqi} AQI (> 150) — tự động chạy công suất tối đa để lọc nhanh khí độc và bụi mịn.`,
      powerSavingNote: 'Đang ưu tiên công suất tối đa xử lý ô nhiễm cao.',
    };
  }
  if (aqi > 100) {
    return {
      on: true,
      autoMode: true,
      level: 2,
      levelLabel: 'Mức 2 · Công suất trung bình (Bật tự động)',
      reason: `Chỉ số ô nhiễm đạt ${aqi} AQI (101–150) — tự động chạy công suất vừa, cân bằng lọc sạch và điện năng.`,
      powerSavingNote: 'Điều chỉnh công suất vừa phù hợp mức ô nhiễm trung bình.',
    };
  }
  if (aqi > 50 || humidity > 78) {
    return {
      on: true,
      autoMode: true,
      level: 1,
      levelLabel: 'Mức 1 · Công suất nhẹ (Bật tự động)',
      reason: `Không khí ở mức ${aqi} AQI, ẩm ${humidity}% — tự động khởi động công suất nhẹ tiết kiệm điện.`,
      powerSavingNote: 'Chạy công suất nhẹ tối ưu điện năng khi ô nhiễm mức thấp.',
    };
  }
  return {
    on: false,
    autoMode: true,
    level: 0,
    levelLabel: 'Đang nghỉ · Chế độ Tiết kiệm điện',
    reason: `Không khí trong lành (${aqi} AQI, ${temperature.toFixed(1)}°C) — máy lọc tự động tạm nghỉ.`,
    powerSavingNote: 'Tự động tắt quạt khi không khí sạch để tiết kiệm điện tối đa.',
  };
}

export function buildSpeechSummary(
  env: EnvironmentReading,
  purifier: AutoPurifierStatus,
  doses: MedicationDose[]
): string {
  const airStatus = evaluateAirQuality(env.aqi);
  const pendingTrays = getAllTraysSorted(doses).filter((d) => !d.taken);

  const envPart = `Chất lượng không khí hiện tại là ${env.aqi} AQI, mức ${airStatus.label}. Nhiệt độ phòng ${env.temperature.toFixed(1)} độ C và độ ẩm ${env.humidity} phần trăm.`;
  const purifierPart = `Máy lọc không khí đang ở trạng thái ${purifier.levelLabel}.`;
  const medPart =
    pendingTrays.length > 0
      ? `Hôm nay còn ${pendingTrays.length} cữ thuốc chưa uống, gần nhất là khay số ${pendingTrays[0].trayNumber} lúc ${pendingTrays[0].time}: ${pendingTrays[0].medicineName}.`
      : 'Hôm nay bác đã uống đầy đủ các cữ thuốc.';

  return `${envPart} ${purifierPart} ${medPart}`;
}

export interface SosQuickSlots {
  contact1: SosContact | null;
  contact2: SosContact | null;
  doctor: SosContact | null;
}

export function resolveSosQuickSlots(contacts: SosContact[]): SosQuickSlots {
  const usedIds = new Set<string>();
  const takeBySlot = (slot: 'contact1' | 'contact2' | 'doctor'): SosContact | null => {
    const found = contacts.find((c) => c.slot === slot);
    if (found) usedIds.add(found.id);
    return found ?? null;
  };

  let contact1 = takeBySlot('contact1');
  let contact2 = takeBySlot('contact2');
  let doctor = takeBySlot('doctor');

  const remaining = contacts.filter((c) => !usedIds.has(c.id));
  for (const c of remaining) {
    if (!doctor && c.relationship.toLowerCase().includes('bác sĩ')) {
      doctor = c;
      usedIds.add(c.id);
    } else if (!contact1) {
      contact1 = c;
      usedIds.add(c.id);
    } else if (!contact2) {
      contact2 = c;
      usedIds.add(c.id);
    } else if (!doctor) {
      doctor = c;
      usedIds.add(c.id);
    }
  }

  return { contact1, contact2, doctor };
}

export function computeSosTargetCount(contacts: SosContact[]): number {
  const validContacts = contacts.filter((c) => c.phone.trim().length > 0);
  return validContacts.length + 1;
}

export function createEmptyMedicalRecord(): MedicalRecordProfile {
  return {
    managingAgency: '',
    facilityName: '',
    department: '',
    patientId: '',
    recordCode: '',
    archiveNumber: '',
    fullNameUpper: '',
    birthDate: '',
    gender: '',
    ethnicity: '',
    cccd: '',
    occupation: '',
    address: '',
    paymentType: '',
    bhytCode: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    admissionTime: '',
    chiefComplaint: '',
    illnessHistory: '',
    allergyHistory: { status: '', details: '' },
    personalHistory: { status: '', details: '' },
    familyHistory: { status: '', details: '' },
    pulse: '',
    temperature: '',
    bloodPressure: '',
    respiratoryRate: '',
    weight: '',
    height: '',
    generalExam: '',
    organExam: '',
    labRows: [
      { stt: 1, group: 'Xét nghiệm (Huyết học, Sinh hóa...)', testName: '', resultSummary: '' },
      { stt: 2, group: 'Chẩn đoán hình ảnh (X-quang, Siêu âm, CT...)', testName: '', resultSummary: '' },
      { stt: 3, group: 'Thăm dò chức năng (Điện tim, Nội soi...)', testName: '', resultSummary: '' },
      { stt: 4, group: 'Dịch vụ khác', testName: '', resultSummary: '' },
    ],
    preliminaryDiagnosis: '',
    preliminaryIcd: '',
    confirmedDiagnosis: '',
    confirmedIcd: '',
    comorbidities: '',
    comorbiditiesIcd: '',
    prescriptions: [
      { stt: 1, drugName: '', unit: '', quantity: '', usage: '' },
      { stt: 2, drugName: '', unit: '', quantity: '', usage: '' },
      { stt: 3, drugName: '', unit: '', quantity: '', usage: '' },
      { stt: 4, drugName: '', unit: '', quantity: '', usage: '' },
    ],
    dischargeTime: '',
    dischargeOutcome: '',
    doctorAdvice: '',
    patientSignature: '',
    doctorSignature: '',
    directorSignature: '',
  };
}

export function buildHealthAlertSmsBody(params: {
  patientName?: string;
  reason: string;
  note?: string;
  timestamp: string;
}): string {
  const who = params.patientName?.trim() || 'Người cao tuổi trong gia đình';
  const notePart = params.note?.trim() ? ` Ghi chú: ${params.note.trim()}.` : '';
  return `[SMART HEALTHCARE] CANH BAO SUC KHOE (${params.timestamp}): ${who} - ${params.reason}.${notePart} Vui long kiem tra va lien he ngay.`;
}

export function buildSmsHref(phones: string[], message: string): string {
  const cleanPhones = phones
    .map((p) => p.replace(/[^\d+]/g, ''))
    .filter((p) => p.length > 0);
  const recipient = cleanPhones.join(',');
  return `sms:${recipient}?body=${encodeURIComponent(message)}`;
}

export function normalizeDocCategoryLabel(
  category: 'emergency' | 'respiratory' | 'medication' | 'daily'
): string {
  switch (category) {
    case 'emergency':
      return 'Cấp cứu & Đột quỵ';
    case 'respiratory':
      return 'Hô hấp & Không khí';
    case 'medication':
      return 'Uống thuốc an toàn';
    case 'daily':
    default:
      return 'Chăm sóc hàng ngày';
  }
}

export function createSeedSmartHealthState(now: Date = new Date()): SmartHealthState {
  const nowTime = formatClockTime(now);
  const initialEnv: EnvironmentReading = {
    aqi: 32,
    mq135Ppm: 168,
    temperature: 26.4,
    humidity: 58,
    source: 'seed',
    updatedAt: nowTime,
  };

  return {
    environment: initialEnv,
    purifier: computeAutoPurifierState(
      initialEnv.aqi,
      initialEnv.temperature,
      initialEnv.humidity
    ),
    doses: [
      {
        id: 'tray-1',
        trayNumber: 1,
        period: 'Sáng',
        time: '07:00',
        medicineName: 'Vitamin B & Bảo Vệ Dạ Dày',
        dosageNote: '1 viên với 150ml nước ấm',
        preMealNote: 'Uống trước ăn sáng 30 phút',
        servoAngle: 0,
        taken: false,
        alarmActive: false,
      },
      {
        id: 'tray-2',
        trayNumber: 2,
        period: 'Trưa',
        time: '12:00',
        medicineName: 'Thuốc Hỗ Trợ Tim Mạch',
        dosageNote: '1 viên đúng cữ trưa',
        preMealNote: 'Ăn no trước khi uống thuốc',
        servoAngle: 45,
        taken: false,
        alarmActive: false,
      },
      {
        id: 'tray-3',
        trayNumber: 3,
        period: 'Chiều',
        time: '17:30',
        medicineName: 'Thuốc Ổn Định Đường Huyết',
        dosageNote: '1 viên buổi chiều',
        preMealNote: 'Đo đường huyết & ăn nhẹ trước khi uống',
        servoAngle: 90,
        taken: false,
        alarmActive: false,
      },
      {
        id: 'tray-4',
        trayNumber: 4,
        period: 'Tối',
        time: '20:30',
        medicineName: 'Thuốc Hoạt Huyết & Ngủ Ngon',
        dosageNote: '1 viên buổi tối',
        preMealNote: 'Tránh uống trà đậm hoặc cà phê trước khi uống',
        servoAngle: 135,
        taken: false,
        alarmActive: false,
      },
    ],
    sosContacts: [],
    emergencyCard: {
      fullName: '',
      bloodType: '',
      conditions: '',
      allergies: '',
    },
    medicalRecord: createEmptyMedicalRecord(),
    feelingLogs: [],
    sosEvents: [],
    customDocs: [],
    familyAlerts: [],
    pendingEsp32Commands: [],
    esp32LastSeen: null,
    setupCompleted: true,
  };
}

export function buildLocalDoctorReply(
  question: string,
  env: EnvironmentReading,
  purifier: AutoPurifierStatus
): string {
  const q = question.toLowerCase();

  if (
    q.includes('huyết áp') ||
    q.includes('chóng mặt') ||
    q.includes('chống mặt') ||
    q.includes('hoa mắt') ||
    q.includes('choáng')
  ) {
    return [
      'Với tình trạng đang hơi mệt, chóng mặt kèm bệnh nền huyết áp cao, bác cần làm ngay các bước sau:',
      '1. Ngồi hoặc nằm nghỉ ngay tại chỗ an toàn, kê đầu hơi cao và thả lỏng, tuyệt đối không đứng dậy đột ngột để tránh té ngã.',
      '2. Nếu có máy đo huyết áp tại nhà, nhờ người thân đo lại ngay sau khi nghỉ 5 phút và giữ bình tĩnh, thở chậm sâu.',
      '3. Không tự ý uống thêm hoặc uống gấp đôi thuốc huyết áp khi chưa biết chỉ số đo hiện tại; có thể nhấp từng ngụm nước lọc nhỏ.',
      '4. Gọi ngay người thân hoặc bấm nút Cấp cứu SOS / 115 nếu xuất hiện bất kỳ dấu hiệu nào như: huyết áp tăng vọt (từ 180/120 mmHg trở lên), đau tức ngực, khó thở, tê yếu tay chân, méo miệng hoặc nói khó.',
    ].join('\n');
  }

  if (q.includes('khó thở') || q.includes('đau ngực') || q.includes('tức ngực') || q.includes('tim')) {
    return [
      'Khi thấy tức ngực hoặc khó thở, bác nên xử trí ngay:',
      '1. Dừng mọi hoạt động, ngồi thẳng hoặc tựa lưng góc 45–60 độ nơi thoáng khí, nới lỏng cổ áo.',
      '2. Tập thở chúm môi nhẹ nhàng (hít vào bằng mũi 2 giây, thổi nhẹ ra qua miệng 4 giây).',
      '3. Báo ngay cho người thân bên cạnh. Nếu cơn đau ngực lan lên vai/cổ, vã mồ hôi lạnh hoặc khó thở tăng sau 5 phút, hãy bấm nút SOS / gọi 115 ngay lập tức.',
    ].join('\n');
  }

  if (q.includes('đường huyết') || q.includes('tiểu đường') || q.includes('run tay') || q.includes('vã mồ hôi')) {
    return [
      'Khi có biểu hiện mệt, run tay, vã mồ hôi ở người bệnh tiểu đường:',
      '1. Ngồi yên xuống ngay và đo đường huyết mao mạch nếu có máy.',
      '2. Nếu vẫn tỉnh táo hoàn toàn, uống ngay nửa cốc nước đường ấm hoặc 3–4 viên kẹo đường (quy tắc 15–15), sau 15 phút kiểm tra lại và ăn thêm bữa nhẹ.',
      '3. Tuyệt đối không uống thêm thuốc tiểu đường lúc đang mệt lả. Nếu có dấu hiệu lơ mơ, gọi ngay người thân và cấp cứu 115.',
    ].join('\n');
  }

  if (q.includes('khay') || q.includes('thuốc') || q.includes('quên liều') || q.includes('trước ăn') || q.includes('sau ăn')) {
    return [
      'Về cách uống thuốc an toàn theo 4 khay (Sáng – Trưa – Chiều – Tối):',
      '1. Kiểm tra kỹ ghi chú "Lưu ý trước khi uống" của từng túm thuốc (ví dụ: ăn no trước khi uống hay uống trước ăn 30 phút).',
      '2. Uống thuốc ở tư thế ngồi thẳng với 150–200 ml nước lọc ấm.',
      '3. Nếu lỡ quên một cữ và gần sát giờ cữ tiếp theo, hãy bỏ qua cữ đã quên — tuyệt đối không uống gấp đôi liều.',
    ].join('\n');
  }

  if (q.includes('không khí') || q.includes('ô nhiễm') || q.includes('nhiệt độ') || q.includes('lọc') || q.includes('aqi')) {
    return [
      `Hiện chất lượng không khí phòng là ${env.aqi} AQI, nhiệt độ ${env.temperature.toFixed(1)}°C, độ ẩm ${env.humidity}% và máy lọc tự động đang ở chế độ "${purifier.levelLabel}".`,
      '1. Nếu chỉ số AQI cao trên 100, hãy giữ máy lọc chạy tự động ở mức cao và kiểm tra nguồn khói bụi trong nhà.',
      '2. Giữ nhiệt độ phòng ngủ dễ chịu khoảng 24–28°C và uống đủ nước ấm để bảo vệ đường hô hấp.',
    ].join('\n');
  }

  if (q.includes('xương') || q.includes('khớp') || q.includes('nhức') || q.includes('tê')) {
    return [
      'Khi bị đau nhức xương khớp:',
      '1. Giữ ấm vùng khớp đau (nhất là khớp gối và bàn chân khi trời lạnh ẩm), tránh ngồi xổm hoặc mang vác nặng.',
      '2. Nghỉ ngơi nhẹ nhàng, có thể chườm ấm 10–15 phút nếu không có sưng nóng đỏ cấp tính.',
      '3. Không tự ý uống thuốc giảm đau không rõ nguồn gốc; nếu khớp sưng nóng nhiều hoặc đau tăng nặng, hãy liên hệ bác sĩ khám trực tiếp.',
    ].join('\n');
  }

  return [
    `Bác sĩ đã ghi nhận tình trạng "${question}". Bác nên làm ngay các bước cơ bản sau:`,
    '1. Ngồi hoặc nằm nghỉ ngơi ở nơi thoáng mát, nới lỏng quần áo và uống từng ngụm nước ấm nhỏ.',
    '2. Nhờ người thân kiểm tra lại nhiệt độ cơ thể, huyết áp (nếu có máy) và xem bác đã ăn uống hoặc uống đúng cữ thuốc hôm nay chưa.',
    '3. Nếu triệu chứng không giảm sau 15–30 phút nghỉ ngơi hoặc kèm khó thở, đau ngực, chóng mặt nặng hay lơ mơ, hãy bấm ngay Mục SOS Khẩn cấp hoặc gọi 115.',
  ].join('\n');
}

