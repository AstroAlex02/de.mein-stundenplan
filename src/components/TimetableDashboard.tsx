import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  User as UserIcon,
  Layers,
  AlertTriangle,
  Search,
  Filter,
  Info,
  CalendarCheck,
  CheckCircle,
  XCircle,
  ExternalLink
} from 'lucide-react';
import { TimetableLesson, SelectedClass, UserSettings, SemesterInfo } from '../types.js';

export interface LessonRoomFormat {
  displayText: string;
  type: 'hybrid' | 'online' | 'in_person';
  badgeClasses: string;
}

/**
 * Format calculation according to user rules:
 * 1. Ist ein Fach im Hybrid und es gibt eine Raumnummer -> Raumnummer + Online
 * 2. Fehlt eine Raumnummer (oder steht Online) -> nur Online
 * 3. Weder hybrid noch online -> nur den Raum (Feld rot markiert)
 */
export function getLessonRoomFormat(lesson?: {
  isHybrid?: boolean;
  roomName?: string;
  roomLongName?: string;
} | null): LessonRoomFormat {
  if (!lesson) {
    return {
      displayText: '-',
      type: 'online',
      badgeClasses: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
    };
  }

  const room = (lesson.roomName || lesson.roomLongName || '').trim();
  const isHybrid = Boolean(lesson.isHybrid);

  // Check if room is missing, dash, or explicitly contains online/virtual
  const isRoomEmpty = !room || room === '-' || room === '—' || room.toLowerCase() === 'kein raum';
  const isRoomOnlineText = /\b(online|virtuell\w*|zoom|teams|webex|bbb)\b/i.test(room);
  const hasRealPhysicalRoom = !isRoomEmpty && !isRoomOnlineText;

  // 1. Ist ein Fach im Hybrid und es gibt eine Raumnummer -> Raumnummer + Online
  if (isHybrid && hasRealPhysicalRoom) {
    return {
      displayText: `${room} + Online`,
      type: 'hybrid',
      badgeClasses: 'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-bold'
    };
  }

  // 2. Fehlt eine Raumnummer (oder Fach ist online ohne physischen Raum) -> nur Online
  if (!hasRealPhysicalRoom || isRoomOnlineText) {
    return {
      displayText: 'Online',
      type: 'online',
      badgeClasses: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold'
    };
  }

  // 3. Weder hybrid noch online -> nur den Raum. Das Feld soll rot markiert sein!
  return {
    displayText: room,
    type: 'in_person',
    badgeClasses: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold'
  };
}

// Fixed university time slot definitions
const TIME_SLOTS = [
  { index: 0, start: '08:00', end: '09:30', timeNum: 800, row: 2 },
  { index: 1, start: '09:45', end: '11:15', timeNum: 945, row: 3 },
  { index: 2, start: '11:30', end: '13:00', timeNum: 1130, row: 4 },
  // Row 5: Mittagspause 13:00 - 14:00 (no merging across this row!)
  { index: 3, start: '14:00', end: '15:30', timeNum: 1400, row: 6 },
  { index: 4, start: '15:45', end: '17:15', timeNum: 1545, row: 7 },
  { index: 5, start: '17:30', end: '19:00', timeNum: 1730, row: 8 },
  { index: 6, start: '19:15', end: '20:45', timeNum: 1915, row: 9 }
];

interface DayBlock {
  key: string;
  startRow: number;
  rowSpan: number;
  isMerged: boolean;
  lessons: TimetableLesson[];
}

function getLessonsForSlot(dayLessons: TimetableLesson[], slotTimeNum: number): TimetableLesson[] {
  const slotStart = slotTimeNum;
  const slotEnd = slotStart + 130;
  return dayLessons.filter(l =>
    (l.startTime >= slotStart && l.startTime < slotEnd) ||
    (l.startTime <= slotStart && l.endTime > slotStart)
  );
}

/**
 * Computes grid blocks for a single day:
 * - Identifies overlapping lessons (sit side-by-side)
 * - Merges 2 consecutive lessons of the same subject into one block (rowSpan = 2)
 * - Strictly prevents merging across lunch break (13:00 to 14:00)
 */
function computeDayGridBlocks(dayLessons: TimetableLesson[]): DayBlock[] {
  const blocks: DayBlock[] = [];
  const handledSlotIndices = new Set<number>();

  for (let s = 0; s < TIME_SLOTS.length; s++) {
    if (handledSlotIndices.has(s)) continue;

    const currentSlot = TIME_SLOTS[s];
    const currentLessons = getLessonsForSlot(dayLessons, currentSlot.timeNum);

    if (currentLessons.length === 0) {
      blocks.push({
        key: `slot-${s}`,
        startRow: currentSlot.row,
        rowSpan: 1,
        isMerged: false,
        lessons: []
      });
      continue;
    }

    // Merge check with next slot (s + 1)
    // Rule: DO NOT merge across lunch break (Slot 2 ends at 13:00, Slot 3 starts at 14:00)
    const canLookAhead = s !== 2 && s + 1 < TIME_SLOTS.length;

    if (canLookAhead) {
      const nextSlot = TIME_SLOTS[s + 1];
      const nextLessons = getLessonsForSlot(dayLessons, nextSlot.timeNum);

      // Case A: 1 lesson in current slot, 1 in next slot with the same subject
      if (
        currentLessons.length === 1 &&
        nextLessons.length === 1 &&
        currentLessons[0].subjectName.trim().toLowerCase() === nextLessons[0].subjectName.trim().toLowerCase() &&
        currentLessons[0].isCancelled === nextLessons[0].isCancelled
      ) {
        const l1 = currentLessons[0];
        const l2 = nextLessons[0];

        const mergedLesson: TimetableLesson = {
          ...l1,
          id: `${l1.id}_merged_${l2.id}`,
          endTime: Math.max(l1.endTime, l2.endTime),
          endTimeStr: l2.endTimeStr || l1.endTimeStr,
          roomName: l1.roomName || l2.roomName,
          roomLongName: l1.roomLongName || l2.roomLongName,
          isHybrid: l1.isHybrid || l2.isHybrid,
          teacherName: l1.teacherName || l2.teacherName,
          teacherLongName: l1.teacherLongName || l2.teacherLongName,
          substText: [l1.substText, l2.substText].filter(Boolean).join(' | ')
        };

        blocks.push({
          key: `merged-${s}-${s + 1}`,
          startRow: currentSlot.row,
          rowSpan: 2,
          isMerged: true,
          lessons: [mergedLesson]
        });

        handledSlotIndices.add(s + 1);
        continue;
      }

      // Case B: 2 overlapping lessons that match pairwise with 2 in the next slot
      if (
        currentLessons.length === 2 &&
        nextLessons.length === 2 &&
        currentLessons[0].subjectName.trim().toLowerCase() === nextLessons[0].subjectName.trim().toLowerCase() &&
        currentLessons[1].subjectName.trim().toLowerCase() === nextLessons[1].subjectName.trim().toLowerCase() &&
        currentLessons[0].isCancelled === nextLessons[0].isCancelled &&
        currentLessons[1].isCancelled === nextLessons[1].isCancelled
      ) {
        const mergedA: TimetableLesson = {
          ...currentLessons[0],
          id: `${currentLessons[0].id}_merged_${nextLessons[0].id}`,
          endTime: Math.max(currentLessons[0].endTime, nextLessons[0].endTime),
          endTimeStr: nextLessons[0].endTimeStr,
          roomName: currentLessons[0].roomName || nextLessons[0].roomName,
          isHybrid: currentLessons[0].isHybrid || nextLessons[0].isHybrid
        };
        const mergedB: TimetableLesson = {
          ...currentLessons[1],
          id: `${currentLessons[1].id}_merged_${nextLessons[1].id}`,
          endTime: Math.max(currentLessons[1].endTime, nextLessons[1].endTime),
          endTimeStr: nextLessons[1].endTimeStr,
          roomName: currentLessons[1].roomName || nextLessons[1].roomName,
          isHybrid: currentLessons[1].isHybrid || nextLessons[1].isHybrid
        };

        blocks.push({
          key: `merged-${s}-${s + 1}`,
          startRow: currentSlot.row,
          rowSpan: 2,
          isMerged: true,
          lessons: [mergedA, mergedB]
        });

        handledSlotIndices.add(s + 1);
        continue;
      }
    }

    // Default: Single slot block (if multiple lessons, they sit side-by-side)
    blocks.push({
      key: `slot-${s}`,
      startRow: currentSlot.row,
      rowSpan: 1,
      isMerged: false,
      lessons: currentLessons
    });
  }

  return blocks;
}

interface TimetableDashboardProps {
  lessons: TimetableLesson[];
  classes: SelectedClass[];
  settings: UserSettings | null;
  semesterInfo?: SemesterInfo | null;
  onOpenClassManager: () => void;
  onTriggerSync: () => void;
}

export const TimetableDashboard: React.FC<TimetableDashboardProps> = ({
  lessons,
  classes,
  settings,
  onOpenClassManager,
  onTriggerSync
}) => {
  // Default view date is strictly today's current date
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [currentWeekDate, setCurrentWeekDate] = useState<string>(todayStr);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'list'; // Mobile default: Tagesliste
    }
    return 'grid'; // PC/Desktop default: Wochenraster
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLesson, setSelectedLesson] = useState<TimetableLesson | null>(null);

  // Compute Monday of the selected week and include Samstag (Monday to Saturday = 6 days)
  const weekDays = useMemo(() => {
    const base = new Date(currentWeekDate);
    const dayOfWeek = base.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(base);
    monday.setDate(base.getDate() + diffToMonday);

    const days: Array<{ dateStr: string; dayName: string; dayNumber: string; isToday: boolean }> = [];
    const dayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        dateStr,
        dayName: dayNames[i],
        dayNumber: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        isToday: dateStr === todayStr
      });
    }

    return days;
  }, [currentWeekDate]);

  // Navigate weeks
  const changeWeek = (direction: number) => {
    const current = new Date(currentWeekDate);
    current.setDate(current.getDate() + direction * 7);
    setCurrentWeekDate(current.toISOString().split('T')[0]);
  };

  // Filter lessons for the week and search
  const filteredLessons = useMemo(() => {
    return lessons.filter(l => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          l.subjectName.toLowerCase().includes(q) ||
          l.subjectLongName.toLowerCase().includes(q) ||
          l.roomName.toLowerCase().includes(q) ||
          l.teacherName.toLowerCase().includes(q) ||
          l.className.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [lessons, searchQuery]);

  // Today's lessons
  const todayLessons = useMemo(() => {
    return lessons.filter(l => l.dateStr === todayStr && !l.isCancelled);
  }, [lessons, todayStr]);

  // Next upcoming lesson
  const nextLesson = useMemo(() => {
    const now = new Date();
    const currentTimeNum = now.getHours() * 100 + now.getMinutes();
    return lessons.find(l => {
      if (l.isCancelled) return false;
      if (l.dateStr > todayStr) return true;
      if (l.dateStr === todayStr && l.endTime > currentTimeNum) return true;
      return false;
    });
  }, [lessons, todayStr]);

  // Pre-compute grid blocks per day
  const dayGridBlocks = useMemo(() => {
    const map = new Map<string, DayBlock[]>();
    for (const day of weekDays) {
      const dayLessons = filteredLessons.filter(l => l.dateStr === day.dateStr);
      map.set(day.dateStr, computeDayGridBlocks(dayLessons));
    }
    return map;
  }, [weekDays, filteredLessons]);

  return (
    <div className="space-y-6">
      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Today's Lectures */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between transition-colors">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Vorlesungen Heute</p>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{todayLessons.length}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Stunden</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <CalendarCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Next Lecture */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between transition-colors">
          <div className="min-w-0 pr-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nächste Vorlesung</p>
            {nextLesson ? (
              <div className="mt-1 truncate">
                <div className="font-bold text-slate-900 dark:text-white text-sm truncate">
                  {nextLesson.subjectName}
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">{nextLesson.startTimeStr} Uhr</span>
                  <span>•</span>
                  {(() => {
                    const nextRoomFormat = getLessonRoomFormat(nextLesson);
                    return (
                      <span className={`font-semibold px-2 py-0.5 rounded-md ${nextRoomFormat.badgeClasses}`}>
                        {nextRoomFormat.displayText}
                      </span>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Keine anstehenden Termine</p>
            )}
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Timetable Controls Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 transition-colors">
        {/* Week Navigator */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => changeWeek(-1)}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            title="Vorherige Woche"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setCurrentWeekDate(new Date().toISOString().split('T')[0])}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Heute
          </button>

          <button
            onClick={() => changeWeek(1)}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            title="Nächste Woche"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="text-sm font-bold text-slate-800 dark:text-slate-200 ml-2">
            Woche vom {weekDays[0].dayNumber} - {weekDays[weekDays.length - 1]?.dayNumber || weekDays[0].dayNumber}
          </div>
        </div>

        {/* Search & View Switch */}
        <div className="flex items-center space-x-3">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Fach, Raum, Dozent..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all"
            />
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Wochenraster
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tagesliste
            </button>
          </div>
        </div>
      </div>

      {/* No Classes Selected State */}
      {classes.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-xs max-w-2xl mx-auto transition-colors">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Layers className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Noch keine Klassen ausgewählt</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
            Wähle Deine Uni-Klassen (z.B. ITS-1, DEC_1, TI-1) aus, um Deinen individuellen Stundenplan automatisch aus WebUntis zusammenzustellen.
          </p>
          <button
            onClick={onOpenClassManager}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            Jetzt Klassen auswählen
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW (Montag bis Samstag, nebeneinander bei Überschneidung & verbundene 2x Blöcke) */
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-x-auto transition-colors">
          <div
            className="grid min-w-[960px]"
            style={{
              gridTemplateColumns: '76px repeat(6, minmax(140px, 1fr))',
              gridTemplateRows: 'auto repeat(3, minmax(96px, auto)) minmax(40px, auto) repeat(4, minmax(96px, auto))'
            }}
          >
            {/* 1. Header (Row 1): Zeit + 6 Wochentage (Mo - Sa) */}
            <div
              style={{ gridColumn: 1, gridRow: 1 }}
              className="p-3 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-center text-xs font-bold text-slate-400 dark:text-slate-500 flex items-center justify-center"
            >
              Zeit
            </div>
            {weekDays.map((day, dIdx) => (
              <div
                key={day.dateStr}
                style={{ gridColumn: dIdx + 2, gridRow: 1 }}
                className={`p-3 text-center border-b border-r border-slate-200 dark:border-slate-800 last:border-r-0 ${
                  day.isToday
                    ? 'bg-blue-50/80 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 font-extrabold'
                    : 'bg-slate-50/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="text-sm font-bold">{day.dayName}</div>
                <div className={`text-[11px] font-medium ${day.isToday ? 'text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {day.dayNumber}
                </div>
              </div>
            ))}

            {/* 2. Zeitspalte Vormittag (Slots 0 bis 2: 08:00 - 13:00) */}
            {TIME_SLOTS.slice(0, 3).map(slot => (
              <div
                key={slot.start}
                style={{ gridColumn: 1, gridRow: slot.row }}
                className="p-2 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 text-center flex flex-col justify-center"
              >
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{slot.start}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{slot.end}</span>
              </div>
            ))}

            {/* Row 5 Col 1: Mittagspause Zeitlabel (13:00 - 14:00) */}
            <div
              style={{ gridColumn: 1, gridRow: 5 }}
              className="p-2 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 text-center flex flex-col justify-center"
            >
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">13:00</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">14:00</span>
            </div>

            {/* Row 5 Cols 2-7: Mittagspause Block (neutral ohne besondere Hervorhebung) */}
            {weekDays.map((day, dIdx) => (
              <div
                key={`lunch-${day.dateStr}`}
                style={{ gridColumn: dIdx + 2, gridRow: 5 }}
                className={`border-b ${dIdx < 5 ? 'border-r' : ''} border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/20`}
              />
            ))}

            {/* Zeitspalte Nachmittag (Slots 3 bis 6: 14:00 - 20:45) */}
            {TIME_SLOTS.slice(3).map(slot => (
              <div
                key={slot.start}
                style={{ gridColumn: 1, gridRow: slot.row }}
                className="p-2 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 text-center flex flex-col justify-center"
              >
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{slot.start}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{slot.end}</span>
              </div>
            ))}

            {/* 3. Vorlesungsblöcke je Tag (Spalten 2 bis 7: Mo, Di, Mi, Do, Fr, Sa) */}
            {weekDays.map((day, dIdx) => {
              const blocks = dayGridBlocks.get(day.dateStr) || [];
              const col = dIdx + 2;
              const isLastCol = dIdx === 5;

              return blocks.map(block => {
                if (block.lessons.length === 0) {
                  return (
                    <div
                      key={`${day.dateStr}-${block.key}`}
                      style={{
                        gridColumn: col,
                        gridRow: `${block.startRow} / span ${block.rowSpan}`
                      }}
                      className={`p-1.5 border-b ${!isLastCol ? 'border-r' : ''} border-slate-100 dark:border-slate-800/80 transition-colors ${
                        day.isToday ? 'bg-blue-50/10 dark:bg-blue-950/15' : 'hover:bg-slate-50/30 dark:hover:bg-slate-800/30'
                      }`}
                    />
                  );
                }

                return (
                  <div
                    key={`${day.dateStr}-${block.key}`}
                    style={{
                      gridColumn: col,
                      gridRow: `${block.startRow} / span ${block.rowSpan}`
                    }}
                    className={`p-1.5 border-b ${!isLastCol ? 'border-r' : ''} border-slate-100 dark:border-slate-800/80 transition-colors flex flex-row gap-1.5 h-full w-full ${
                      day.isToday ? 'bg-blue-50/15 dark:bg-blue-950/20' : 'hover:bg-slate-50/40 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Render overlapping lessons side-by-side */}
                    {block.lessons.map(lesson => {
                      const roomFormat = getLessonRoomFormat(lesson);
                      return (
                        <div
                          key={lesson.id}
                          onClick={() => setSelectedLesson(lesson)}
                          style={{ borderLeftColor: lesson.subjectColor || '#3b82f6' }}
                          className={`flex-1 min-w-0 p-2 rounded-md border-l-4 text-left shadow-2xs transition-all hover:scale-[1.01] cursor-pointer flex flex-col justify-between ${
                            lesson.isCancelled
                              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-400 dark:border-rose-800 opacity-75'
                              : 'bg-white dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 hover:shadow-md'
                          }`}
                        >
                          {/* Top: Title & Merged/Ausfall Badges */}
                          <div>
                            <div className="flex items-start justify-between gap-1">
                              <span
                                title={lesson.subjectLongName || lesson.subjectName}
                                className={`font-bold text-xs leading-tight line-clamp-2 ${
                                  lesson.isCancelled
                                    ? 'line-through text-rose-800 dark:text-rose-300'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {lesson.subjectName}
                              </span>
                              <div className="flex items-center space-x-1 shrink-0">
                                {block.isMerged && (
                                  <span
                                    title="Verbundene Doppelstunde (2 Blöcke)"
                                    className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[9px] font-extrabold px-1 rounded"
                                  >
                                    2x
                                  </span>
                                )}
                                {lesson.isCancelled && (
                                  <span className="bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[9px] font-extrabold px-1 rounded">
                                    Ausfall
                                  </span>
                                )}
                                {lesson.isSubstitution && (
                                  <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[9px] font-bold px-1 rounded">
                                    Vertr.
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Time & Room display */}
                            <div className="mt-1 flex items-center justify-between gap-1 text-[10px] flex-wrap">
                              <span className="font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                {lesson.startTimeStr} - {lesson.endTimeStr}
                              </span>
                              <span
                                title={
                                  roomFormat.type === 'in_person'
                                    ? 'Reine Präsenzvorlesung (Raum)'
                                    : roomFormat.type === 'hybrid'
                                    ? 'Hybrid: Raum + Online'
                                    : 'Online'
                                }
                                className={`px-1.5 py-0.2 rounded text-[10px] ${roomFormat.badgeClasses}`}
                              >
                                {roomFormat.displayText}
                              </span>
                            </div>
                          </div>

                          {/* Bottom: Class & Teacher */}
                          <div className="mt-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-1 rounded font-medium truncate max-w-[65px] border border-blue-200/50 dark:border-blue-900/50">
                              {lesson.className}
                            </span>
                            {lesson.teacherName && (
                              <span className="truncate max-w-[70px] text-slate-500 dark:text-slate-400">
                                {lesson.teacherName}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })}
          </div>
        </div>
      ) : (
        /* LIST VIEW (Day by Day with 2x merged subjects & room format) */
        <div className="space-y-4">
          {weekDays.map(day => {
            const dayLessons = filteredLessons.filter(l => l.dateStr === day.dateStr);

            // Group consecutive lessons in list view as well (excluding crossing lunch break)
            const groupedListLessons: Array<{ lesson: TimetableLesson; isMerged: boolean }> = [];
            let i = 0;
            while (i < dayLessons.length) {
              const cur = dayLessons[i];
              const next = dayLessons[i + 1];

              const canMerge =
                next &&
                cur.subjectName.trim().toLowerCase() === next.subjectName.trim().toLowerCase() &&
                cur.isCancelled === next.isCancelled &&
                // Do not merge across lunch break (13:00 - 14:00)
                !(cur.endTime <= 1300 && next.startTime >= 1350);

              if (canMerge) {
                groupedListLessons.push({
                  lesson: {
                    ...cur,
                    id: `${cur.id}_merged_${next.id}`,
                    endTime: Math.max(cur.endTime, next.endTime),
                    endTimeStr: next.endTimeStr || cur.endTimeStr,
                    roomName: cur.roomName || next.roomName,
                    roomLongName: cur.roomLongName || next.roomLongName,
                    isHybrid: cur.isHybrid || next.isHybrid,
                    teacherName: cur.teacherName || next.teacherName,
                    substText: [cur.substText, next.substText].filter(Boolean).join(' | ')
                  },
                  isMerged: true
                });
                i += 2;
              } else {
                groupedListLessons.push({ lesson: cur, isMerged: false });
                i++;
              }
            }

            return (
              <div key={day.dateStr} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
                <div className={`px-4 py-2.5 font-bold text-sm flex items-center justify-between ${
                  day.isToday ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                }`}>
                  <div className="flex items-center space-x-2">
                    <span>{day.dayName}, {day.dayNumber}</span>
                    {day.isToday && (
                      <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                        Heute
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold opacity-85">
                    {dayLessons.length} {dayLessons.length === 1 ? 'Vorlesung' : 'Vorlesungen'}
                  </span>
                </div>

                <div className="p-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {groupedListLessons.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center italic">Keine Vorlesungen an diesem Tag</p>
                  ) : (
                    groupedListLessons.map(({ lesson, isMerged }) => {
                      const roomFormat = getLessonRoomFormat(lesson);
                      return (
                        <div
                          key={lesson.id}
                          onClick={() => setSelectedLesson(lesson)}
                          className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 p-2 rounded-lg transition-colors cursor-pointer"
                        >
                          <div className="flex items-start space-x-3">
                            <div
                              className="w-1.5 h-12 rounded-full mt-0.5 shrink-0"
                              style={{ backgroundColor: lesson.subjectColor || '#3b82f6' }}
                            />
                            <div>
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <h4 className={`text-sm font-bold ${lesson.isCancelled ? 'line-through text-rose-800 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'}`}>
                                  {lesson.subjectLongName || lesson.subjectName}
                                </h4>
                                {isMerged && (
                                  <span className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs px-2 py-0.2 rounded font-extrabold">
                                    2 Blöcke
                                  </span>
                                )}
                                {lesson.isCancelled && (
                                  <span className="bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-xs px-2 py-0.2 rounded font-bold">
                                    Entfällt
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap gap-y-1">
                                <span className="flex items-center space-x-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    {lesson.startTimeStr} - {lesson.endTimeStr}
                                  </span>
                                </span>
                                <span className="flex items-center space-x-1">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                  <span className={`font-semibold px-2 py-0.5 rounded-md ${roomFormat.badgeClasses}`}>
                                    {roomFormat.displayText}
                                  </span>
                                </span>
                                {lesson.teacherName && (
                                  <span className="flex items-center space-x-1">
                                    <UserIcon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                    <span>{lesson.teacherName}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 self-end sm:self-auto">
                            <span className="bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800">
                              {lesson.className}
                            </span>
                            {lesson.studentGroup && (
                              <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs px-2 py-1 rounded-md">
                                {lesson.studentGroup}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lesson Details Modal */}
      {selectedLesson && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {selectedLesson.className}
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedLesson.subjectLongName || selectedLesson.subjectName}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLesson(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Datum & Uhrzeit:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {selectedLesson.dateStr} • {selectedLesson.startTimeStr} - {selectedLesson.endTimeStr} Uhr
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Format & Raum:</span>
                {(() => {
                  const modalRoomFormat = getLessonRoomFormat(selectedLesson);
                  return (
                    <span className={`font-bold px-2.5 py-1 rounded-lg border ${modalRoomFormat.badgeClasses}`}>
                      {modalRoomFormat.displayText}
                    </span>
                  );
                })()}
              </div>

              {selectedLesson.teacherName && (
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Dozent / Prüfer:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedLesson.teacherLongName || selectedLesson.teacherName}
                  </span>
                </div>
              )}

              {selectedLesson.studentGroup && (
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Gruppe:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{selectedLesson.studentGroup}</span>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Status in WebUntis:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedLesson.cellState || 'REGULAR'}</span>
              </div>

              {selectedLesson.substText && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-medium">
                  <strong>Hinweis zur Änderung:</strong> {selectedLesson.substText}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedLesson(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
