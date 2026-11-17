import type {
  AuthUser,
  CustomMedicalDoc,
  EmergencyMedicalCard,
  Esp32PendingCommand,
  FamilyHealthAlert,
  FeelingMood,
  MedicalRecordProfile,
  MedicationDose,
  SmartHealthState,
  SosContact,
  UserRole,
} from '../types/health';
import {
  buildHealthAlertSmsBody,
  buildLocalDoctorReply,
  computeAutoPurifierState,
  createEmptyMedicalRecord,
  createSeedSmartHealthState,
  formatClockTime,
  getTrayNumberForPeriod,
  normalizeDocCategoryLabel,
} from '../utils/healthLogic';

const LOCAL_STATE_KEY = 'smart_healthcare_web_state_v1';
const LOCAL_ACCOUNTS_KEY = 'smart_healthcare_web_accounts_v1';
const LOCAL_TOKENS_KEY = 'smart_healthcare_web_tokens_v1';

interface LocalAccount {
  id: string;
  fullName: string;
  username: string;
  phone: string;
  role: UserRole;
  password: string;
  pin?: string;
  createdAt: string;
}

function readLocalState(): SmartHealthState {
  try {
    const raw = window.localStorage.getItem(LOCAL_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SmartHealthState;
      if (parsed && parsed.environment && Array.isArray(parsed.doses)) {
        return {
          ...createSeedSmartHealthState(),
          ...parsed,
          medicalRecord: {
            ...createEmptyMedicalRecord(),
            ...(parsed.medicalRecord ?? {}),
          },
          customDocs: Array.isArray(parsed.customDocs) ? parsed.customDocs : [],
          familyAlerts: Array.isArray(parsed.familyAlerts) ? parsed.familyAlerts : [],
          feelingLogs: Array.isArray(parsed.feelingLogs) ? parsed.feelingLogs : [],
          sosEvents: Array.isArray(parsed.sosEvents) ? parsed.sosEvents : [],
          sosContacts: Array.isArray(parsed.sosContacts) ? parsed.sosContacts : [],
          pendingEsp32Commands: Array.isArray(parsed.pendingEsp32Commands)
            ? parsed.pendingEsp32Commands
            : [],
        };
      }
    }
  } catch {
    // fall back to fresh seed
  }
  const seed = createSeedSmartHealthState();
  writeLocalState(seed);
  return seed;
}

function writeLocalState(state: SmartHealthState): SmartHealthState {
  try {
    window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota issues
  }
  return state;
}

function readLocalAccounts(): LocalAccount[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalAccount[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  const seedAccounts: LocalAccount[] = [
    {
      id: 'acc-demo-1',
      fullName: 'Gia Đình Chăm Sóc',
      username: 'giadinh',
      phone: '0912345678',
      role: 'caregiver',
      password: '1234',
      pin: '1234',
      createdAt: new Date().toISOString(),
    },
  ];
  try {
    window.localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(seedAccounts));
  } catch {
    // ignore
  }
  return seedAccounts;
}

function writeLocalAccounts(accounts: LocalAccount[]): void {
  try {
    window.localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

function readLocalTokens(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(LOCAL_TOKENS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    // ignore
  }
  return {};
}

function writeLocalTokens(tokens: Record<string, string>): void {
  try {
    window.localStorage.setItem(LOCAL_TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // ignore
  }
}

function toAuthUser(acc: LocalAccount): AuthUser {
  return {
    id: acc.id,
    fullName: acc.fullName,
    username: acc.username,
    phone: acc.phone,
    role: acc.role,
    createdAt: acc.createdAt,
  };
}

type ApiResult<T> =
  | { kind: 'api'; ok: boolean; status: number; data: T }
  | { kind: 'offline' };

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function isKnownStaticOriginWithoutBackend(): boolean {
  if (API_BASE || typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith('.github.io') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.pages.dev')
  );
}

let staticHostingDetected = isKnownStaticOriginWithoutBackend();

async function callBackendJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 7000
): Promise<ApiResult<T>> {
  if (staticHostingDetected) {
    return { kind: 'offline' };
  }
  const targetUrl = API_BASE && url.startsWith('/') ? `${API_BASE}${url}` : url;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, { ...init, signal: controller.signal });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      staticHostingDetected = true;
      return { kind: 'offline' };
    }
    const data = (await res.json()) as T;
    return { kind: 'api', ok: res.ok, status: res.status, data };
  } catch {
    return { kind: 'offline' };
  } finally {
    window.clearTimeout(timer);
  }
}

function createLocalFamilyAlert(
  state: SmartHealthState,
  params: {
    severity: 'warning' | 'critical';
    title: string;
    reason: string;
    note?: string;
  }
): { alert: FamilyHealthAlert; nextState: SmartHealthState } {
  const timestamp = formatClockTime(new Date());
  const patientName =
    state.medicalRecord.fullNameUpper ||
    state.emergencyCard.fullName ||
    undefined;
  const smsBody = buildHealthAlertSmsBody({
    patientName,
    reason: params.reason,
    note: params.note,
    timestamp,
  });
  const alert: FamilyHealthAlert = {
    id: `alert-${Date.now()}`,
    severity: params.severity,
    title: params.title,
    message: params.note?.trim()
      ? `${params.reason} — Ghi chú: ${params.note.trim()}`
      : params.reason,
    smsBody,
    targets: state.sosContacts.map((c) => ({ name: c.name, phone: c.phone })),
    channels: ['web', 'sms'],
    smsWebhookSent: false,
    acknowledged: false,
    timestamp,
  };
  const nextState: SmartHealthState = {
    ...state,
    familyAlerts: [alert, ...state.familyAlerts].slice(0, 25),
  };
  return { alert, nextState: writeLocalState(nextState) };
}

export async function fetchHealthState(): Promise<SmartHealthState> {
  const res = await callBackendJson<SmartHealthState>('/api/state');
  if (res.kind === 'api' && res.ok) {
    return writeLocalState(res.data);
  }
  return readLocalState();
}

export async function fetchCurrentUser(
  token: string
): Promise<{ user: AuthUser; state: SmartHealthState } | null> {
  const res = await callBackendJson<{ user: AuthUser; state: SmartHealthState }>(
    '/api/auth/me',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.kind === 'api') {
    if (!res.ok) return null;
    if (res.data.state) writeLocalState(res.data.state);
    return { user: res.data.user, state: res.data.state };
  }
  const tokens = readLocalTokens();
  const userId = tokens[token];
  if (!userId) return null;
  const acc = readLocalAccounts().find((a) => a.id === userId);
  if (!acc) return null;
  return { user: toAuthUser(acc), state: readLocalState() };
}

export async function logoutSession(token: string | null): Promise<void> {
  if (token) {
    await callBackendJson('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const tokens = readLocalTokens();
    delete tokens[token];
    writeLocalTokens(tokens);
  }
}

export async function loginAccount(payload: {
  identifier: string;
  password: string;
  pin: string;
}): Promise<{ token: string; user: AuthUser; state: SmartHealthState }> {
  const res = await callBackendJson<{
    token: string;
    user: AuthUser;
    state: SmartHealthState;
    error?: string;
  }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.kind === 'api') {
    if (!res.ok) throw new Error(res.data.error || 'Đăng nhập chưa thành công.');
    writeLocalState(res.data.state);
    return {
      token: res.data.token,
      user: res.data.user,
      state: res.data.state,
    };
  }

  const accounts = readLocalAccounts();
  const idClean = payload.identifier.trim().toLowerCase();
  const pinClean = payload.pin.trim();
  let matched: LocalAccount | undefined;

  if (idClean) {
    matched = accounts.find(
      (a) => a.username.toLowerCase() === idClean || a.phone === idClean
    );
    if (!matched) {
      throw new Error('Số điện thoại hoặc tài khoản chưa được đăng ký.');
    }
    const okPass = payload.password && matched.password === payload.password;
    const okPin = pinClean && matched.pin === pinClean;
    if (!okPass && !okPin) {
      throw new Error('Mật khẩu hoặc mã PIN 4 số chưa đúng.');
    }
  } else if (/^\d{4}$/.test(pinClean)) {
    const matches = accounts.filter((a) => a.pin === pinClean);
    if (matches.length === 1) {
      matched = matches[0];
    } else if (matches.length > 1) {
      throw new Error(
        'Có nhiều tài khoản dùng cùng mã PIN này. Vui lòng nhập thêm Số điện thoại.'
      );
    } else {
      throw new Error('Mã PIN 4 số chưa đúng.');
    }
  } else {
    throw new Error('Vui lòng nhập Số điện thoại hoặc mã PIN 4 số hợp lệ.');
  }

  const token = `local-tok-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const tokens = readLocalTokens();
  tokens[token] = matched.id;
  writeLocalTokens(tokens);
  return {
    token,
    user: toAuthUser(matched),
    state: readLocalState(),
  };
}

export async function registerAccount(payload: {
  fullName: string;
  phone: string;
  username: string;
  password: string;
  pin: string;
  role: UserRole;
}): Promise<{ token: string; user: AuthUser; state: SmartHealthState }> {
  const res = await callBackendJson<{
    token: string;
    user: AuthUser;
    state: SmartHealthState;
    error?: string;
  }>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.kind === 'api') {
    if (!res.ok) {
      throw new Error(res.data.error || 'Đăng ký tài khoản chưa thành công.');
    }
    writeLocalState(res.data.state);
    return {
      token: res.data.token,
      user: res.data.user,
      state: res.data.state,
    };
  }

  const accounts = readLocalAccounts();
  const userClean = (payload.username || payload.phone).trim().toLowerCase();
  if (
    accounts.some(
      (a) =>
        a.username.toLowerCase() === userClean ||
        (payload.phone && a.phone === payload.phone)
    )
  ) {
    throw new Error('Số điện thoại hoặc tài khoản này đã được đăng ký.');
  }
  const newAcc: LocalAccount = {
    id: `acc-${Date.now()}`,
    fullName: payload.fullName.trim(),
    username: userClean,
    phone: payload.phone.trim(),
    role: payload.role,
    password: payload.password,
    pin: payload.pin,
    createdAt: new Date().toISOString(),
  };
  writeLocalAccounts([...accounts, newAcc]);

  const token = `local-tok-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const tokens = readLocalTokens();
  tokens[token] = newAcc.id;
  writeLocalTokens(tokens);
  return {
    token,
    user: toAuthUser(newAcc),
    state: readLocalState(),
  };
}

export async function triggerTrayAlarm(doseId: string): Promise<SmartHealthState> {
  const res = await callBackendJson<{ state?: SmartHealthState }>(
    '/api/tray/trigger-alarm',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doseId }),
    }
  );
  if (res.kind === 'api' && res.data.state) {
    return writeLocalState(res.data.state);
  }
  const state = readLocalState();
  const target = state.doses.find((d) => d.id === doseId);
  if (!target || target.taken) return state;
  const nowTime = formatClockTime(new Date());
  const cmd: Esp32PendingCommand = {
    id: `cmd-alarm-${Date.now()}`,
    type: 'OPEN_TRAY',
    trayNumber: target.trayNumber,
    servoAngle: target.servoAngle,
    medicineName: target.medicineName,
    ledOn: true,
    audioAlert: true,
    createdAt: nowTime,
  };
  return writeLocalState({
    ...state,
    doses: state.doses.map((d) =>
      d.id === doseId ? { ...d, alarmActive: true } : d
    ),
    pendingEsp32Commands: [cmd, ...state.pendingEsp32Commands].slice(0, 12),
  });
}

export async function clearTrayIr(payload: {
  doseId?: string;
  trayNumber?: 1 | 2 | 3 | 4;
}): Promise<SmartHealthState> {
  const res = await callBackendJson<{ state?: SmartHealthState }>(
    '/api/tray/ir-cleared',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (res.kind === 'api' && res.data.state) {
    return writeLocalState(res.data.state);
  }
  const state = readLocalState();
  const target = payload.doseId
    ? state.doses.find((d) => d.id === payload.doseId)
    : state.doses.find(
        (d) =>
          d.trayNumber === Number(payload.trayNumber) &&
          (d.alarmActive || !d.taken)
      );
  if (!target) return state;
  const nowTime = formatClockTime(new Date());
  return writeLocalState({
    ...state,
    doses: state.doses.map((d) =>
      d.id === target.id
        ? { ...d, alarmActive: false, taken: true, takenAt: nowTime, irClearedAt: nowTime }
        : d
    ),
  });
}

export async function openTrayDose(
  doseId: string
): Promise<{ dose?: MedicationDose; state: SmartHealthState }> {
  const res = await callBackendJson<{
    dose?: MedicationDose;
    state?: SmartHealthState;
  }>('/api/tray/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doseId }),
  });
  if (res.kind === 'api' && res.data.state) {
    return { dose: res.data.dose, state: writeLocalState(res.data.state) };
  }
  const state = readLocalState();
  const target = state.doses.find((d) => d.id === doseId);
  if (!target || target.taken) return { dose: target, state };
  const nowTime = formatClockTime(new Date());
  const updatedDose: MedicationDose = {
    ...target,
    taken: true,
    takenAt: nowTime,
    alarmActive: false,
  };
  const nextState = writeLocalState({
    ...state,
    doses: state.doses.map((d) => (d.id === doseId ? updatedDose : d)),
  });
  return { dose: updatedDose, state: nextState };
}

export async function resetAllTrays(): Promise<SmartHealthState> {
  const res = await callBackendJson<{ state?: SmartHealthState }>(
    '/api/tray/reset',
    { method: 'POST' }
  );
  if (res.kind === 'api' && res.data.state) {
    return writeLocalState(res.data.state);
  }
  const state = readLocalState();
  return writeLocalState({
    ...state,
    doses: state.doses.map((d) => ({
      ...d,
      taken: false,
      takenAt: undefined,
      alarmActive: false,
      irClearedAt: undefined,
    })),
    pendingEsp32Commands: [],
  });
}

export async function submitFeeling(
  mood: FeelingMood | 'Ghi chú',
  note?: string
): Promise<{ state: SmartHealthState; alert?: FamilyHealthAlert }> {
  const res = await callBackendJson<{
    state?: SmartHealthState;
    alert?: FamilyHealthAlert;
  }>('/api/feeling', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mood, ...(note ? { note } : {}) }),
  });
  if (res.kind === 'api' && res.data.state) {
    return {
      state: writeLocalState(res.data.state),
      alert: res.data.alert,
    };
  }
  const state = readLocalState();
  const log = {
    id: `feel-${Date.now()}`,
    mood,
    ...(note ? { note } : {}),
    timestamp: formatClockTime(new Date()),
  };
  let nextState: SmartHealthState = writeLocalState({
    ...state,
    feelingLogs: [log, ...state.feelingLogs].slice(0, 30),
  });
  let alert: FamilyHealthAlert | undefined;
  if (mood === 'Hơi mệt') {
    const created = createLocalFamilyAlert(nextState, {
      severity: 'warning',
      title: 'Sức khỏe người cao tuổi không ổn định (Hơi mệt)',
      reason: 'Báo trạng thái Hơi mệt',
      note,
    });
    alert = created.alert;
    nextState = created.nextState;
  }
  return { state: nextState, alert };
}

export async function notifyPoorHealthAlert(params: {
  reason: string;
  note?: string;
}): Promise<{ state: SmartHealthState; alert: FamilyHealthAlert }> {
  const res = await callBackendJson<{
    state?: SmartHealthState;
    alert?: FamilyHealthAlert;
  }>('/api/alerts/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      severity: 'warning',
      title: 'Sức khỏe người cao tuổi không ổn định — Cần kiểm tra',
      reason: params.reason,
      ...(params.note ? { note: params.note } : {}),
    }),
  });
  if (res.kind === 'api' && res.data.state && res.data.alert) {
    return {
      state: writeLocalState(res.data.state),
      alert: res.data.alert,
    };
  }
  const state = readLocalState();
  const created = createLocalFamilyAlert(state, {
    severity: 'warning',
    title: 'Sức khỏe người cao tuổi không ổn định — Cần kiểm tra',
    reason: params.reason,
    note: params.note,
  });
  return { state: created.nextState, alert: created.alert };
}

export async function acknowledgeAlert(
  alertId?: string
): Promise<SmartHealthState> {
  const res = await callBackendJson<{ state?: SmartHealthState }>(
    '/api/alerts/ack',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId }),
    }
  );
  if (res.kind === 'api' && res.data.state) {
    return writeLocalState(res.data.state);
  }
  const state = readLocalState();
  return writeLocalState({
    ...state,
    familyAlerts: state.familyAlerts.map((a) =>
      !alertId || a.id === alertId ? { ...a, acknowledged: true } : a
    ),
  });
}

export async function addCustomDocItem(payload: {
  category: 'emergency' | 'respiratory' | 'medication' | 'daily';
  title: string;
  summaryPoints: string;
  warningSigns?: string;
  firstAidSteps?: string;
  avoidActions?: string;
  citationTitle?: string;
  citationOrg: string;
  citationRef?: string;
  citationUrl: string;
}): Promise<SmartHealthState> {
  const res = await callBackendJson<{
    state?: SmartHealthState;
    error?: string;
  }>('/api/docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.kind === 'api') {
    if (!res.ok) throw new Error(res.data.error || 'Không thể lưu tài liệu mới.');
    if (res.data.state) return writeLocalState(res.data.state);
  }
  const toList = (val?: string) =>
    (val || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  const newDoc: CustomMedicalDoc = {
    id: `custom-doc-${Date.now()}`,
    category: payload.category,
    categoryLabel: normalizeDocCategoryLabel(payload.category),
    title: payload.title.trim(),
    summaryPoints: toList(payload.summaryPoints),
    warningSigns: toList(payload.warningSigns),
    firstAidSteps: toList(payload.firstAidSteps),
    avoidActions: toList(payload.avoidActions),
    citationTitle: payload.citationTitle?.trim() || payload.title.trim(),
    citationOrg: payload.citationOrg.trim(),
    citationRef: payload.citationRef?.trim() || 'Tài liệu tham khảo gia đình thêm',
    citationUrl: payload.citationUrl.trim(),
    createdAt: formatClockTime(new Date()),
  };
  const state = readLocalState();
  return writeLocalState({
    ...state,
    customDocs: [newDoc, ...state.customDocs].slice(0, 40),
  });
}

export async function deleteCustomDocItem(
  id: string
): Promise<SmartHealthState> {
  const res = await callBackendJson<{ state?: SmartHealthState }>(
    `/api/docs/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  if (res.kind === 'api' && res.data.state) {
    return writeLocalState(res.data.state);
  }
  const state = readLocalState();
  return writeLocalState({
    ...state,
    customDocs: state.customDocs.filter((d) => d.id !== id),
  });
}

export async function saveHealthSettings(payload: {
  sosContacts?: SosContact[];
  emergencyCard?: EmergencyMedicalCard;
  doses?: MedicationDose[];
  medicalRecord?: MedicalRecordProfile;
}): Promise<SmartHealthState> {
  const res = await callBackendJson<{ state?: SmartHealthState }>(
    '/api/settings',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (res.kind === 'api' && res.data.state) {
    return writeLocalState(res.data.state);
  }
  const state = readLocalState();
  const nextDoses = Array.isArray(payload.doses)
    ? payload.doses.slice(0, 24).map((d, idx) => ({
        ...d,
        id: d.id || `tray-${Date.now()}-${idx}`,
        trayNumber: getTrayNumberForPeriod(d.period),
        preMealNote: String(d.preMealNote ?? '').trim(),
        dosageNote: String(d.dosageNote ?? '').trim(),
        medicineName: String(d.medicineName ?? '').trim() || 'Túm thuốc cần uống',
        time: String(d.time || '07:00').trim(),
      }))
    : state.doses;

  return writeLocalState({
    ...state,
    ...(payload.sosContacts ? { sosContacts: payload.sosContacts } : {}),
    ...(payload.emergencyCard ? { emergencyCard: payload.emergencyCard } : {}),
    ...(payload.medicalRecord ? { medicalRecord: payload.medicalRecord } : {}),
    doses: nextDoses,
  });
}

export async function sendEsp32Telemetry(packet: {
  mq135Aqi: number;
  mq135Ppm: number;
  temperature: number;
  humidity: number;
  source?: 'esp32-http' | 'esp32-serial';
}): Promise<SmartHealthState> {
  const res = await callBackendJson<{ state?: SmartHealthState }>(
    '/api/esp32/telemetry',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packet),
    }
  );
  if (res.kind === 'api' && res.data.state) {
    return writeLocalState(res.data.state);
  }
  const state = readLocalState();
  const env = {
    aqi: Math.round(packet.mq135Aqi),
    mq135Ppm: Math.round(packet.mq135Ppm),
    temperature: Number(packet.temperature.toFixed(1)),
    humidity: Math.round(packet.humidity),
    source: packet.source ?? ('esp32-http' as const),
    updatedAt: formatClockTime(new Date()),
  };
  return writeLocalState({
    ...state,
    environment: env,
    purifier: computeAutoPurifierState(env.aqi, env.temperature, env.humidity),
    esp32LastSeen: new Date().toISOString(),
  });
}

export async function ackEsp32Commands(): Promise<SmartHealthState> {
  const res = await callBackendJson<{ state?: SmartHealthState }>(
    '/api/esp32/commands/ack',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    }
  );
  if (res.kind === 'api' && res.data.state) {
    return writeLocalState(res.data.state);
  }
  const state = readLocalState();
  return writeLocalState({ ...state, pendingEsp32Commands: [] });
}

export async function postSosEvent(payload: {
  status: 'countdown' | 'dispatched' | 'cancelled';
  contactName?: string;
  sentCount?: number;
}): Promise<{ state: SmartHealthState; alert?: FamilyHealthAlert }> {
  const res = await callBackendJson<{
    state?: SmartHealthState;
    alert?: FamilyHealthAlert;
  }>('/api/sos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.kind === 'api' && res.data.state) {
    return {
      state: writeLocalState(res.data.state),
      alert: res.data.alert,
    };
  }
  const state = readLocalState();
  const primaryContact = state.sosContacts[0];
  const configuredTotal = state.sosContacts.length + 1;
  const event = {
    id: `sos-${Date.now()}`,
    status: payload.status,
    timestamp: formatClockTime(new Date()),
    contactName: payload.contactName || primaryContact?.name || 'Cấp cứu 115',
    sentCount:
      payload.status === 'dispatched'
        ? payload.sentCount ?? configuredTotal
        : 0,
    totalTargets: configuredTotal,
  };
  let nextState = writeLocalState({
    ...state,
    sosEvents: [event, ...state.sosEvents].slice(0, 20),
  });
  let alert: FamilyHealthAlert | undefined;
  if (payload.status === 'dispatched') {
    const created = createLocalFamilyAlert(nextState, {
      severity: 'critical',
      title: 'KHẨN CẤP SOS — Cần liên hệ ngay!',
      reason: `Đã kích hoạt SOS khẩn cấp tới ${event.contactName}`,
    });
    alert = created.alert;
    nextState = created.nextState;
  }
  return { state: nextState, alert };
}

export async function askDoctorAi(question: string): Promise<string> {
  const res = await callBackendJson<{ answer?: string }>(
    '/api/doctor/ask',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    },
    8000
  );
  if (res.kind === 'api' && res.ok && res.data.answer) {
    return res.data.answer;
  }
  const state = readLocalState();
  return buildLocalDoctorReply(question, state.environment, state.purifier);
}
