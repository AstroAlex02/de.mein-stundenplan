import { db, addNotification, getUserSettings } from './db.js';
import { SelectedClass, TimetableLesson, UntisElement } from '../src/types.js';

interface WebUntisPageConfigResponse {
  data?: {
    elements?: Array<{
      type: number;
      id: number;
      name: string;
      longName?: string;
      displayname?: string;
    }>;
  };
}

interface WebUntisTimetableResponse {
  data?: {
    result?: {
      data?: {
        elementPeriods?: Record<string, Array<{
          id: number;
          lessonId: number;
          lessonNumber?: number;
          lessonCode?: string;
          lessonText?: string;
          periodText?: string;
          substText?: string;
          date: number; // e.g. 20261012
          startTime: number; // e.g. 1400
          endTime: number; // e.g. 1530
          elements: Array<{
            type: number; // 1: class, 2: teacher, 3: subject, 4: room
            id: number;
            orgId?: number;
            missing?: boolean;
            state?: string;
          }>;
          cellState?: string;
        }>>;
        elements?: UntisElement[];
      };
    };
  };
}

// Convert Untis time integer e.g. 800 -> "08:00", 1430 -> "14:30"
export function formatUntisTime(timeNum: number): string {
  const str = timeNum.toString().padStart(4, '0');
  return `${str.slice(0, 2)}:${str.slice(2, 4)}`;
}

// Convert Untis date integer e.g. 20261012 -> "2026-10-12"
export function formatUntisDate(dateNum: number): string {
  const str = dateNum.toString();
  if (str.length !== 8) return str;
  return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
}

// Fetch available classes from WebUntis
export async function fetchWebUntisClasses(
  schoolName = 'hs-albstadt',
  serverUrl = 'https://hs-albstadt.webuntis.com',
  targetDate?: string
): Promise<SelectedClass[]> {
  const dateStr = targetDate || new Date().toISOString().split('T')[0];
  const url = `${serverUrl.replace(/\/+$/, '')}/WebUntis/api/public/timetable/weekly/pageconfig?type=1&date=${dateStr}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WebUntisStundenplanManager/1.0'
      }
    });

    if (!res.ok) {
      throw new Error(`WebUntis returned HTTP ${res.status}`);
    }

    const data = await res.json() as WebUntisPageConfigResponse;
    const elements = data.data?.elements || [];

    const classes: SelectedClass[] = elements.map(e => ({
      id: e.id,
      name: e.name,
      longName: e.longName || e.name,
      displayName: e.displayname || e.name
    }));

    // If few classes are returned for the current date (e.g. semester break),
    // probe semester dates (October or April) to get a full catalog of classes
    if (classes.length < 10) {
      const semesterDates = ['2026-10-15', '2026-04-15', '2025-10-15'];
      for (const sDate of semesterDates) {
        if (sDate === dateStr) continue;
        try {
          const sRes = await fetch(`${serverUrl.replace(/\/+$/, '')}/WebUntis/api/public/timetable/weekly/pageconfig?type=1&date=${sDate}`, {
            headers: { 'Accept': 'application/json' }
          });
          if (sRes.ok) {
            const sData = await sRes.json() as WebUntisPageConfigResponse;
            const moreElements = sData.data?.elements || [];
            if (moreElements.length > classes.length) {
              const seen = new Set(classes.map(c => c.id));
              for (const me of moreElements) {
                if (!seen.has(me.id)) {
                  classes.push({
                    id: me.id,
                    name: me.name,
                    longName: me.longName || me.name,
                    displayName: me.displayname || me.name
                  });
                  seen.add(me.id);
                }
              }
            }
          }
        } catch (e) {
          // continue
        }
      }
    }

    classes.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
    return classes;
  } catch (err: any) {
    console.error('[WebUntis] Error fetching classes:', err.message);
    throw err;
  }
}

// Fetch timetable for a single class and date
export async function fetchWebUntisTimetable(
  schoolName: string,
  serverUrl: string,
  classId: number,
  dateStr: string
): Promise<{ periods: any[]; elements: Map<string, UntisElement> }> {
  const url = `${serverUrl.replace(/\/+$/, '')}/WebUntis/api/public/timetable/weekly/data?elementType=1&elementId=${classId}&date=${dateStr}&formatId=5`;

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'WebUntisStundenplanManager/1.0'
    }
  });

  if (!res.ok) {
    throw new Error(`WebUntis data error: HTTP ${res.status}`);
  }

  const json = await res.json() as WebUntisTimetableResponse;
  const rawPeriods = json.data?.result?.data?.elementPeriods?.[classId.toString()] || [];
  const rawElements = json.data?.result?.data?.elements || [];

  const elementMap = new Map<string, UntisElement>();
  for (const el of rawElements) {
    elementMap.set(`${el.type}:${el.id}`, el);
  }

  return { periods: rawPeriods, elements: elementMap };
}

// Calculate complete semester range and weekly Monday dates
export interface SemesterPeriodInfo {
  semName: string;
  startDate: string;
  endDate: string;
  weekCount: number;
  weekDates: string[];
}

export function getSemesterPeriodInfo(ref: Date = new Date()): SemesterPeriodInfo {
  const year = ref.getFullYear();
  const month = ref.getMonth(); // 0-11: 0=Jan, 1=Feb, 2=Mar, 8=Sep, 9=Oct, 11=Dec

  let semName = '';
  let start: Date;
  let end: Date;

  if (month >= 8 || month <= 1) {
    // Wintersemester (WiSe): typically late September through February
    const startYear = month >= 8 ? year : year - 1;
    const endYear = startYear + 1;
    semName = `Wintersemester ${startYear}/${(endYear % 100).toString().padStart(2, '0')}`;
    start = new Date(Date.UTC(startYear, 8, 21)); // Sep 21
    end = new Date(Date.UTC(endYear, 1, 28)); // Feb 28
  } else {
    // Sommersemester (SoSe): typically mid March through July/August
    semName = `Sommersemester ${year}`;
    start = new Date(Date.UTC(year, 2, 9)); // Mar 9
    end = new Date(Date.UTC(year, 6, 31)); // Jul 31
  }

  // Snap start date to preceding Monday
  const day = start.getUTCDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  start.setUTCDate(start.getUTCDate() + diffToMonday);

  const weekDates: string[] = [];
  const curr = new Date(start);
  while (curr <= end) {
    weekDates.push(curr.toISOString().split('T')[0]);
    curr.setUTCDate(curr.getUTCDate() + 7);
  }

  return {
    semName,
    startDate: weekDates[0],
    endDate: weekDates[weekDates.length - 1],
    weekCount: weekDates.length,
    weekDates
  };
}

// Helper to process a single week for a class and detect room/time changes
async function processClassWeek(
  schoolName: string,
  serverUrl: string,
  classId: number,
  className: string,
  subscribers: Array<{ userId: number; excludedSubjects: string[] }>,
  dateStr: string
): Promise<{ periodsCount: number; changesDetected: number }> {
  let periodsCount = 0;
  let changesDetected = 0;

  const { periods, elements } = await fetchWebUntisTimetable(schoolName, serverUrl, classId, dateStr);

  for (const period of periods) {
    periodsCount++;
    const periodId = period.id;

    // Extract referenced elements
    const subjectRef = period.elements?.find((e: any) => e.type === 3);
    const roomRef = period.elements?.find((e: any) => e.type === 4);
    const teacherRef = period.elements?.find((e: any) => e.type === 2);

    const subjectEl = subjectRef ? elements.get(`3:${subjectRef.id}`) : undefined;
    const roomEl = roomRef ? elements.get(`4:${roomRef.id}`) : undefined;
    const teacherEl = teacherRef ? elements.get(`2:${teacherRef.id}`) : undefined;

    const subjectName = subjectEl?.name || subjectEl?.longName || 'Vorlesung';
    const subjectLongName = subjectEl?.longName || subjectName;
    const roomName = roomEl?.name || roomEl?.longName || 'Kein Raum';
    const roomLongName = roomEl?.longName || roomName;
    const teacherName = teacherEl?.longName || teacherEl?.name || '';
    const isCancelled = period.cellState === 'CANCELLED' || period.elements?.some((e: any) => e.missing) ? 1 : 0;

    // Check if previously recorded in cached_periods
    const prev = db.prepare(`
      SELECT * FROM cached_periods WHERE period_id = ? AND class_id = ?
    `).get(periodId, classId) as any;

    if (prev) {
      // Detect Changes!
      const dateFormatted = formatUntisDate(period.date);
      const startTimeFormatted = formatUntisTime(period.startTime);

      // 1. Raumänderung Check
      if (prev.room_name && roomName && prev.room_name !== roomName && !prev.is_cancelled && !isCancelled) {
        changesDetected++;
        const title = `🚨 Raumänderung: ${subjectName}`;
        const message = `Der Raum für "${subjectName}" (${className}) am ${dateFormatted} um ${startTimeFormatted} Uhr wurde von "${prev.room_name}" auf "${roomName}" geändert.`;

        for (const sub of subscribers) {
          if (!sub.excludedSubjects.includes(subjectName)) {
            addNotification(sub.userId, {
              type: 'room_change',
              title,
              message,
              lessonName: subjectName,
              oldValue: prev.room_name,
              newValue: roomName,
              date: dateFormatted,
              startTime: startTimeFormatted
            });
          }
        }
      }

      // 2. Zeitänderung Check
      if ((prev.start_time !== period.startTime || prev.end_time !== period.endTime || prev.date !== period.date) && !isCancelled) {
        changesDetected++;
        const oldTime = `${formatUntisDate(prev.date)} ${formatUntisTime(prev.start_time)}-${formatUntisTime(prev.end_time)}`;
        const newTime = `${dateFormatted} ${startTimeFormatted}-${formatUntisTime(period.endTime)}`;
        const title = `⏰ Zeitänderung: ${subjectName}`;
        const message = `Die Vorlesungszeit für "${subjectName}" (${className}) wurde verschoben von ${oldTime} auf ${newTime}.`;

        for (const sub of subscribers) {
          if (!sub.excludedSubjects.includes(subjectName)) {
            addNotification(sub.userId, {
              type: 'time_change',
              title,
              message,
              lessonName: subjectName,
              oldValue: oldTime,
              newValue: newTime,
              date: dateFormatted,
              startTime: startTimeFormatted
            });
          }
        }
      }

      // 3. Ausfall / Cancellation Check
      if (!prev.is_cancelled && isCancelled) {
        changesDetected++;
        const title = `❌ Vorlesungsausfall: ${subjectName}`;
        const message = `Die Vorlesung "${subjectName}" (${className}) am ${dateFormatted} um ${startTimeFormatted} Uhr entfällt!`;

        for (const sub of subscribers) {
          if (!sub.excludedSubjects.includes(subjectName)) {
            addNotification(sub.userId, {
              type: 'cancellation',
              title,
              message,
              lessonName: subjectName,
              date: dateFormatted,
              startTime: startTimeFormatted
            });
          }
        }
      }
    }

    // Upsert into cached_periods
    db.prepare(`
      INSERT INTO cached_periods (
        period_id, school_name, class_id, lesson_id, date, start_time, end_time,
        subject_id, subject_name, subject_long_name, room_id, room_name, room_long_name,
        teacher_id, teacher_name, cell_state, is_cancelled, raw_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(period_id, class_id) DO UPDATE SET
        date = excluded.date,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        subject_name = excluded.subject_name,
        subject_long_name = excluded.subject_long_name,
        room_name = excluded.room_name,
        room_long_name = excluded.room_long_name,
        teacher_name = excluded.teacher_name,
        cell_state = excluded.cell_state,
        is_cancelled = excluded.is_cancelled,
        raw_json = excluded.raw_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      periodId, schoolName, classId, period.lessonId, period.date, period.startTime, period.endTime,
      subjectRef?.id || null, subjectName, subjectLongName,
      roomRef?.id || null, roomName, roomLongName,
      teacherRef?.id || null, teacherName, period.cellState || 'STANDARD',
      isCancelled, JSON.stringify({ period, elements: Array.from(elements.values()) })
    );
  }

  return { periodsCount, changesDetected };
}

// Synchronize all enrolled classes across weeks and detect short-term room/time adjustments
export async function syncTimetables(options: { forceUserId?: number; fullSemester?: boolean } = {}) {
  const startTime = Date.now();
  console.log('[Sync] Starting timetable sync at', new Date().toISOString());

  // Get all classes that users have selected
  const usersSettingsRows = db.prepare('SELECT user_id, school_name, server_url, selected_classes, excluded_subjects FROM user_settings').all() as any[];

  // Map classId -> list of { userId, excludedSubjects, schoolName, serverUrl, className }
  const classSubscribers = new Map<number, Array<{
    userId: number;
    excludedSubjects: string[];
    schoolName: string;
    serverUrl: string;
    className: string;
  }>>();

  for (const row of usersSettingsRows) {
    if (options.forceUserId && row.user_id !== options.forceUserId) continue;

    let selectedClasses: SelectedClass[] = [];
    let excludedSubjects: string[] = [];
    try {
      selectedClasses = JSON.parse(row.selected_classes);
      excludedSubjects = JSON.parse(row.excluded_subjects);
    } catch (e) {
      continue;
    }

    for (const cls of selectedClasses) {
      if (!classSubscribers.has(cls.id)) {
        classSubscribers.set(cls.id, []);
      }
      classSubscribers.get(cls.id)!.push({
        userId: row.user_id,
        excludedSubjects,
        schoolName: row.school_name,
        serverUrl: row.server_url,
        className: cls.name
      });
    }
  }

  let totalPeriods = 0;
  let changesDetected = 0;

  // Determine dates to sync
  const semInfo = getSemesterPeriodInfo();
  // By default, sync all semester weeks (or when fullSemester requested)
  // To ensure every course throughout the entire semester is covered
  const datesToSync: string[] = options.fullSemester !== false
    ? semInfo.weekDates
    : (() => {
        const near: string[] = [];
        const now = new Date();
        for (let offset = -1; offset <= 4; offset++) {
          const d = new Date(now.getTime() + offset * 7 * 24 * 60 * 60 * 1000);
          near.push(d.toISOString().split('T')[0]);
        }
        return near;
      })();

  console.log(`[Sync] Scanning ${datesToSync.length} weeks for ${classSubscribers.size} classes...`);

  for (const [classId, subscribers] of classSubscribers.entries()) {
    if (subscribers.length === 0) continue;
    const { schoolName, serverUrl, className } = subscribers[0];

    // Process in parallel batches of 4 weeks to balance speed and connection limits
    const batchSize = 4;
    for (let i = 0; i < datesToSync.length; i += batchSize) {
      const chunk = datesToSync.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        chunk.map(dateStr =>
          processClassWeek(schoolName, serverUrl, classId, className, subscribers, dateStr)
        )
      );

      for (const res of results) {
        if (res.status === 'fulfilled') {
          totalPeriods += res.value.periodsCount;
          changesDetected += res.value.changesDetected;
        } else {
          console.warn(`[Sync] Week fetch warning for class ${className} (${classId}):`, res.reason?.message);
        }
      }
    }
  }

  // Record sync history
  db.prepare(`
    INSERT INTO sync_history (status, classes_count, periods_count, changes_count, details)
    VALUES ('success', ?, ?, ?, ?)
  `).run(
    classSubscribers.size,
    totalPeriods,
    changesDetected,
    `Sync completed in ${Date.now() - startTime}ms`
  );

  console.log(`[Sync] Finished. Tracked ${totalPeriods} periods across ${datesToSync.length} weeks, ${changesDetected} changes detected.`);
  return {
    classesCount: classSubscribers.size,
    weeksScanned: datesToSync.length,
    totalPeriods,
    changesDetected,
    durationMs: Date.now() - startTime
  };
}

// Dedicated full semester scan for a specific user
export async function scanFullSemesterForUser(
  userId: number,
  options: { onlyUncachedClasses?: boolean; forceAll?: boolean } = {}
) {
  const startTime = Date.now();
  const settings = getUserSettings(userId);
  if (!settings.selectedClasses || settings.selectedClasses.length === 0) {
    return {
      semesterName: '',
      startDate: '',
      endDate: '',
      totalWeeksScanned: 0,
      totalPeriodsFound: 0,
      uniqueSubjectsFound: 0,
      classesCount: 0,
      durationMs: 0
    };
  }

  const semInfo = getSemesterPeriodInfo();
  const schoolName = settings.schoolName;
  const serverUrl = settings.serverUrl;
  const subscribers = [{
    userId,
    excludedSubjects: settings.excludedSubjects || []
  }];

  let totalPeriodsFound = 0;
  let changesDetected = 0;

  // Filter classes to scan (skip classes already in cached_periods if onlyUncachedClasses is requested)
  const classesToScan = settings.selectedClasses.filter(cls => {
    if (options.forceAll) return true;
    if (options.onlyUncachedClasses) {
      try {
        const cachedCount = (db.prepare('SELECT COUNT(*) as cnt FROM cached_periods WHERE class_id = ?').get(cls.id) as any)?.cnt || 0;
        return cachedCount === 0;
      } catch {
        return true;
      }
    }
    return true;
  });

  if (classesToScan.length === 0) {
    console.log(`[SemesterScan] All ${settings.selectedClasses.length} selected classes for user ${userId} are already cached. Serving instantly.`);
  } else {
    console.log(`[SemesterScan] Scanning ${classesToScan.length} of ${settings.selectedClasses.length} classes for user ${userId} (${semInfo.semName}, ${semInfo.weekDates.length} weeks)...`);

    for (const cls of classesToScan) {
      const batchSize = 6;
      for (let i = 0; i < semInfo.weekDates.length; i += batchSize) {
        const chunk = semInfo.weekDates.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          chunk.map(dateStr =>
            processClassWeek(schoolName, serverUrl, cls.id, cls.name, subscribers, dateStr)
          )
        );

        for (const res of results) {
          if (res.status === 'fulfilled') {
            totalPeriodsFound += res.value.periodsCount;
            changesDetected += res.value.changesDetected;
          }
        }
      }
    }
  }

  // Count unique subjects now in cache for these classes
  const classIds = settings.selectedClasses.map(c => c.id);
  const placeholders = classIds.map(() => '?').join(',');
  const distinctSubjects = db.prepare(`
    SELECT DISTINCT subject_name FROM cached_periods
    WHERE class_id IN (${placeholders}) AND subject_name IS NOT NULL
  `).all(...classIds) as any[];

  console.log(`[SemesterScan] Finished in ${Date.now() - startTime}ms. Found ${distinctSubjects.length} subjects and ${totalPeriodsFound} lesson slots.`);

  return {
    semesterName: semInfo.semName,
    startDate: semInfo.startDate,
    endDate: semInfo.endDate,
    totalWeeksScanned: semInfo.weekDates.length,
    totalPeriodsFound,
    uniqueSubjectsFound: distinctSubjects.length,
    classesCount: settings.selectedClasses.length,
    changesDetected,
    durationMs: Date.now() - startTime
  };
}

// Check if a lesson or subject is hybrid (both in-person and online, or conducted online/hybrid)
export function isHybridEvent(params: {
  subjectName?: string;
  subjectLongName?: string;
  roomName?: string;
  roomLongName?: string;
  studentGroup?: string;
  lessonText?: string;
  periodText?: string;
  substText?: string;
  hybridSubjects?: string[];
}): boolean {
  if (params.hybridSubjects && params.hybridSubjects.length > 0) {
    if (params.subjectName && params.hybridSubjects.includes(params.subjectName)) return true;
    if (params.subjectLongName && params.hybridSubjects.includes(params.subjectLongName)) return true;
  }

  // 1. Room check (e.g. "online", "virtueller Raum", "Zoom", "Teams")
  const roomText = [params.roomName, params.roomLongName].filter(Boolean).join(' ');
  if (/\b(online|zoom|teams|webex|virtuell\w*|virtual\w*|distanz\w*|moodle|bbb|bigbluebutton|stream\w*|videokonferenz\w*|alfaview\w*)\b/i.test(roomText)) {
    return true;
  }

  // 2. Extra lesson texts and notes (e.g. lessonText "online", "hybrid", "zoom", etc.)
  const extraText = [params.studentGroup, params.lessonText, params.periodText, params.substText].filter(Boolean).join(' ');
  if (/\b(hybrid\w*|hyb\w*|online|zoom|teams|webex|virtuell\w*|virtual\w*|distanz\w*|stream\w*|videokonferenz\w*)\b|präsenz\s*(&|\/|\+)\s*online|online\s*(&|\/|\+)\s*präsenz/i.test(extraText)) {
    return true;
  }

  // 3. Subject name explicitly tagged as online or hybrid
  const subjText = [params.subjectName, params.subjectLongName].filter(Boolean).join(' ');
  if (/\b(hybrid\w*|hyb\w*)\b|(\(online\))|\[online\]|(\(hybrid\))|\[hybrid\]|hybrid-|\bhyb\b|präsenz\s*(&|\/|\+)\s*online|online\s*(&|\/|\+)\s*präsenz/i.test(subjText)) {
    return true;
  }

  return false;
}

// Get personal combined and filtered timetable for a user
export function getUserTimetable(userId: number, options: { fromDate?: string; toDate?: string } = {}): {
  lessons: TimetableLesson[];
  availableSubjects: Array<{ name: string; longName: string; count: number; firstDate?: string; lastDate?: string; isHybrid?: boolean }>;
  classes: SelectedClass[];
  semesterInfo: SemesterPeriodInfo;
} {
  const semInfo = getSemesterPeriodInfo();
  const settings = getUserSettings(userId);
  if (!settings.selectedClasses || settings.selectedClasses.length === 0) {
    return { lessons: [], availableSubjects: [], classes: [], semesterInfo: semInfo };
  }

  const classIds = settings.selectedClasses.map(c => c.id);
  const placeholders = classIds.map(() => '?').join(',');

  const rows = db.prepare(`
    SELECT * FROM cached_periods
    WHERE class_id IN (${placeholders})
    ORDER BY date ASC, start_time ASC
  `).all(...classIds) as any[];

  const subjectCounts = new Map<string, { name: string; longName: string; count: number; firstDate: string; lastDate: string; isHybrid?: boolean }>();
  const lessons: TimetableLesson[] = [];

  const classMap = new Map(settings.selectedClasses.map(c => [c.id, c.name]));
  const excludedSet = new Set(settings.excludedSubjects || []);
  const hybridSet = new Set(settings.hybridSubjects || []);

  for (const row of rows) {
    const subjectName = row.subject_name || 'Vorlesung';
    const subjectLongName = row.subject_long_name || subjectName;
    const dateFormatted = formatUntisDate(row.date);

    // Parse raw_json for extra colors / groups / notes if available
    let subjectColor: string | undefined;
    let studentGroup: string | undefined;
    let originalRoomName: string | undefined;
    let lessonText: string | undefined;
    let periodText: string | undefined;
    let substText: string | undefined;

    try {
      if (row.raw_json) {
        const parsed = JSON.parse(row.raw_json);
        const subElem = parsed.elements?.find((e: any) => e.type === 3 && (e.backColor || e.name === subjectName));
        if (subElem?.backColor) {
          subjectColor = subElem.backColor;
        }
        studentGroup = parsed.period?.studentGroup;
        lessonText = parsed.period?.lessonText;
        periodText = parsed.period?.periodText;
        substText = parsed.period?.substText;
      }
    } catch (e) {}

    // Determine if this lesson/subject is hybrid (präsenz & online)
    const isHybrid = isHybridEvent({
      subjectName,
      subjectLongName,
      roomName: row.room_name,
      roomLongName: row.room_long_name,
      studentGroup,
      lessonText,
      periodText,
      substText,
      hybridSubjects: settings.hybridSubjects
    });

    // Track all available subjects for filter UI across the whole semester
    if (!subjectCounts.has(subjectName)) {
      subjectCounts.set(subjectName, {
        name: subjectName,
        longName: subjectLongName,
        count: 0,
        firstDate: dateFormatted,
        lastDate: dateFormatted,
        isHybrid
      });
    }
    const subjTracker = subjectCounts.get(subjectName)!;
    subjTracker.count++;
    if (isHybrid) subjTracker.isHybrid = true;
    if (dateFormatted < subjTracker.firstDate) subjTracker.firstDate = dateFormatted;
    if (dateFormatted > subjTracker.lastDate) subjTracker.lastDate = dateFormatted;

    // Check exclusion
    if (excludedSet.has(subjectName)) {
      continue;
    }

    if (options.fromDate && dateFormatted < options.fromDate) continue;
    if (options.toDate && dateFormatted > options.toDate) continue;

    const className = classMap.get(row.class_id) || `Klasse ${row.class_id}`;

    // Distinct colors based on subject name if none provided
    if (!subjectColor) {
      const colors = [
        '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4',
        '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16'
      ];
      let hash = 0;
      for (let i = 0; i < subjectName.length; i++) {
        hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
      }
      subjectColor = colors[Math.abs(hash) % colors.length];
    }

    lessons.push({
      id: row.period_id,
      lessonId: row.lesson_id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      dateStr: dateFormatted,
      startTimeStr: formatUntisTime(row.start_time),
      endTimeStr: formatUntisTime(row.end_time),
      subjectName,
      subjectLongName,
      subjectId: row.subject_id,
      subjectColor,
      roomName: row.room_name || 'TBA',
      roomLongName: row.room_long_name || row.room_name || 'TBA',
      roomId: row.room_id,
      teacherName: row.teacher_name || '',
      teacherLongName: row.teacher_name || '',
      teacherId: row.teacher_id,
      className,
      classId: row.class_id,
      studentGroup,
      cellState: row.cell_state,
      isCancelled: Boolean(row.is_cancelled),
      isSubstitution: row.cell_state === 'SUBSTITUTION',
      isRoomChanged: false,
      isHybrid,
      originalRoomName
    });
  }

  const availableSubjects = Array.from(subjectCounts.values()).sort((a, b) => a.name.localeCompare(b.name));

  return {
    lessons,
    availableSubjects,
    classes: settings.selectedClasses,
    semesterInfo: semInfo
  };
}

// Escape special characters in iCalendar text fields according to RFC 5545
function escapeIcsText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Generate RFC 5545 iCal / .ics file content
export function generateIcsCalendar(lessons: TimetableLesson[], calendarName = 'Mein-Stundenplan'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mein-Stundenplan//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-CALDESC:Dein persönlicher Stundenplan mit automatischen Aktualisierungen',
    'X-WR-TIMEZONE:Europe/Berlin',
    'X-PUBLISHED-TTL:PT15M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  for (const lesson of lessons) {
    const dateStr = lesson.date.toString();
    const startTimeStr = lesson.startTime.toString().padStart(4, '0');
    const endTimeStr = lesson.endTime.toString().padStart(4, '0');

    const dtStart = `${dateStr}T${startTimeStr}00`;
    const dtEnd = `${dateStr}T${endTimeStr}00`;
    const dtStamp = `${dateStr}T000000Z`;
    const uid = `lesson-${lesson.id}-${lesson.classId}-${dateStr}@stundenplan-manager`;

    let summary = lesson.subjectName;
    if (lesson.isHybrid) {
      summary += ' [Hybrid]';
    }
    if (lesson.roomName) {
      summary += ` (${lesson.roomName})`;
    }

    let location = lesson.roomName || 'TBA';
    if (lesson.isHybrid) {
      location = `${lesson.roomName} (Hybrid: Präsenz & Online)`;
    }

    let description = `Fach: ${lesson.subjectLongName}\nKlasse: ${lesson.className}`;
    if (lesson.isHybrid) {
      description += `\nFormat: Hybrid (Teilnahme sowohl vor Ort in Präsenz als auch online möglich)`;
    }
    if (lesson.teacherName) {
      description += `\nDozent/in: ${lesson.teacherName}`;
    }
    if (lesson.studentGroup) {
      description += `\nGruppe: ${lesson.studentGroup}`;
    }

    if (lesson.isCancelled) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;TZID=Europe/Berlin:${dtStart}`,
        `DTEND;TZID=Europe/Berlin:${dtEnd}`,
        `SUMMARY:${escapeIcsText(`[ENTFÄLLT] ${summary}`)}`,
        `DESCRIPTION:${escapeIcsText(`ACHTUNG: Diese Vorlesung entfällt!\n${description}`)}`,
        `LOCATION:${escapeIcsText(location)}`,
        'STATUS:CANCELLED',
        'END:VEVENT'
      );
      continue;
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;TZID=Europe/Berlin:${dtStart}`,
      `DTEND;TZID=Europe/Berlin:${dtEnd}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `LOCATION:${escapeIcsText(location)}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`Erinnerung: ${lesson.subjectName} in Raum ${lesson.roomName}${lesson.isHybrid ? ' (oder online)' : ''}`)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
