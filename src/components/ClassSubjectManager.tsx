import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers,
  Filter,
  Plus,
  Trash2,
  Check,
  Search,
  School,
  Save,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Eye,
  EyeOff,
  Compass,
  Calendar,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { SelectedClass, UserSettings, SemesterInfo, AvailableSubject } from '../types.js';

interface ClassSubjectManagerProps {
  settings: UserSettings | null;
  availableSubjects: AvailableSubject[];
  semesterInfo?: SemesterInfo | null;
  userRole?: string;
  onSaveClasses: (classes: SelectedClass[], schoolName?: string, serverUrl?: string) => Promise<void>;
  onSaveFilter: (excludedSubjects: string[]) => Promise<void>;
  onSaveHybridSubjects?: (hybridSubjects: string[]) => Promise<void>;
  onSync: () => Promise<void>;
  onScanSemester?: () => Promise<any>;
  onNavigateToTimetable?: () => void;
}

export const ClassSubjectManager: React.FC<ClassSubjectManagerProps> = ({
  settings,
  availableSubjects,
  semesterInfo,
  userRole,
  onSaveClasses,
  onSaveFilter,
  onSaveHybridSubjects,
  onSync,
  onScanSemester,
  onNavigateToTimetable
}) => {
  // Local states for editing
  const [selectedClasses, setSelectedClasses] = useState<SelectedClass[]>(settings?.selectedClasses || []);
  const [excludedSubjects, setExcludedSubjects] = useState<string[]>(settings?.excludedSubjects || []);
  const [hybridSubjects, setHybridSubjects] = useState<string[]>(settings?.hybridSubjects || []);
  const [schoolName, setSchoolName] = useState(settings?.schoolName || 'hs-albstadt');
  const [serverUrl, setServerUrl] = useState(settings?.serverUrl || 'https://hs-albstadt.webuntis.com');

  // Immediate ref tracking to prevent stale race conditions and debounced saving
  const selectedClassesRef = useRef<SelectedClass[]>(settings?.selectedClasses || []);
  const pendingUserEditsRef = useRef(false);
  const pendingFilterEditsRef = useRef(false);
  const debounceTimerRef = useRef<any>(null);
  const filterDebounceTimerRef = useRef<any>(null);
  const saveSeqRef = useRef(0);

  // WebUntis class catalog search
  const [catalogClasses, setCatalogClasses] = useState<SelectedClass[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [customClassName, setCustomClassName] = useState('');
  const [customClassId, setCustomClassId] = useState('');

  // Status & Feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResultNotice, setScanResultNotice] = useState<string | null>(null);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'excluded'>('all');

  // Keep in sync with incoming settings ONLY when user has no pending edits
  useEffect(() => {
    if (settings) {
      if (!pendingUserEditsRef.current) {
        setSelectedClasses(settings.selectedClasses || []);
        selectedClassesRef.current = settings.selectedClasses || [];
      }
      if (!pendingFilterEditsRef.current) {
        setExcludedSubjects(settings.excludedSubjects || []);
        setHybridSubjects(settings.hybridSubjects || []);
      }
      setSchoolName(settings.schoolName || 'hs-albstadt');
      setServerUrl(settings.serverUrl || 'https://hs-albstadt.webuntis.com');
    }
  }, [settings]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (filterDebounceTimerRef.current) {
        clearTimeout(filterDebounceTimerRef.current);
      }
    };
  }, []);

  // Fetch available WebUntis classes
  const loadClassCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch(`/api/webuntis/classes?school=${encodeURIComponent(schoolName)}&server=${encodeURIComponent(serverUrl)}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('stundenplan_token') || ''}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setCatalogClasses(data);
      }
    } catch (e) {
      console.error('Error fetching catalog:', e);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    loadClassCatalog();
  }, [schoolName, serverUrl]);

  // Filter catalog list
  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim()) return catalogClasses.slice(0, 30);
    const q = catalogSearch.toLowerCase();
    return catalogClasses.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.longName && c.longName.toLowerCase().includes(q))
    );
  }, [catalogClasses, catalogSearch]);

  // Automatic debounced save for selected classes
  const scheduleAutoSave = (nextClasses: SelectedClass[]) => {
    selectedClassesRef.current = nextClasses;
    pendingUserEditsRef.current = true;
    setIsScanning(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      const currentSeq = ++saveSeqRef.current;
      setScanResultNotice('Aktualisiere Fächerliste für das Semester automatisch...');
      try {
        await onSaveClasses(selectedClassesRef.current, schoolName, serverUrl);
        if (saveSeqRef.current === currentSeq) {
          pendingUserEditsRef.current = false;
          setIsScanning(false);
          setScanResultNotice('Fächerliste für das gesamte Semester ist aktuell.');
          setTimeout(() => setScanResultNotice(null), 3500);
        }
      } catch (e: any) {
        if (saveSeqRef.current === currentSeq) {
          pendingUserEditsRef.current = false;
          setIsScanning(false);
          setScanResultNotice(`Hinweis: ${e.message || 'Verbindung aktiv'}`);
        }
      }
    }, 400); // 400ms debounce
  };

  // Instant toggle for catalog classes (0ms UI latency, no reselection loop)
  const toggleClassSelection = (cls: SelectedClass) => {
    const isAlreadySelected = selectedClasses.some(
      c => c.id === cls.id || c.name.toLowerCase() === cls.name.toLowerCase()
    );
    let next: SelectedClass[];
    if (isAlreadySelected) {
      next = selectedClasses.filter(
        c => c.id !== cls.id && c.name.toLowerCase() !== cls.name.toLowerCase()
      );
    } else {
      next = [...selectedClasses, cls];
    }
    setSelectedClasses(next);
    scheduleAutoSave(next);
  };

  // Add a class
  const addClass = (cls: SelectedClass) => {
    if (selectedClasses.some(c => c.id === cls.id || c.name.toLowerCase() === cls.name.toLowerCase())) {
      return;
    }
    const nextClasses = [...selectedClasses, cls];
    setSelectedClasses(nextClasses);
    scheduleAutoSave(nextClasses);
  };

  // Remove a class
  const removeClass = (id: number) => {
    const nextClasses = selectedClasses.filter(c => c.id !== id);
    setSelectedClasses(nextClasses);
    scheduleAutoSave(nextClasses);
  };

  // Add custom class
  const handleAddCustomClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customClassName.trim()) return;
    const newId = customClassId.trim() ? parseInt(customClassId, 10) : Date.now();
    const newCls: SelectedClass = {
      id: newId,
      name: customClassName.trim(),
      longName: customClassName.trim()
    };
    setCustomClassName('');
    setCustomClassId('');
    addClass(newCls);
  };

  // Auto-save filter changes with a debounce to keep server & calendar feed in sync
  const scheduleFilterAutoSave = (nextExcluded: string[], nextHybrid: string[] = hybridSubjects) => {
    pendingFilterEditsRef.current = true;
    setIsSaving(true);
    setSaveSuccess(false);

    if (filterDebounceTimerRef.current) {
      clearTimeout(filterDebounceTimerRef.current);
    }

    filterDebounceTimerRef.current = setTimeout(async () => {
      try {
        await onSaveFilter(nextExcluded);
        if (onSaveHybridSubjects) {
          await onSaveHybridSubjects(nextHybrid);
        }
        pendingFilterEditsRef.current = false;
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } catch (e) {
        console.error('Error auto-saving filter:', e);
      } finally {
        setIsSaving(false);
      }
    }, 350);
  };

  // Subject toggling
  const toggleSubject = (subjectName: string) => {
    setExcludedSubjects(prev => {
      const next = prev.includes(subjectName)
        ? prev.filter(s => s !== subjectName) // Un-exclude (activate)
        : [...prev, subjectName]; // Exclude (filter out)
      scheduleFilterAutoSave(next);
      return next;
    });
  };

  const selectAllSubjects = () => {
    setExcludedSubjects([]); // none excluded
    scheduleFilterAutoSave([]);
  };

  const deselectAllSubjects = () => {
    const allExcluded = availableSubjects.map(s => s.name);
    setExcludedSubjects(allExcluded); // all excluded
    scheduleFilterAutoSave(allExcluded);
  };

  // Save filtered subjects & trigger sync, then redirect to timetable
  const handleSaveAndRedirect = async () => {
    if (filterDebounceTimerRef.current) {
      clearTimeout(filterDebounceTimerRef.current);
    }
    pendingFilterEditsRef.current = false;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSaveFilter(excludedSubjects);
      if (onSaveHybridSubjects) {
        await onSaveHybridSubjects(hybridSubjects);
      }
      setSaveSuccess(true);
      if (onNavigateToTimetable) {
        onNavigateToTimetable();
      }
    } catch (e) {
      console.error('Error saving subjects:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr || dateStr.length !== 10) return dateStr || '';
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
  };

  // Filter subjects view by search and tab
  const visibleSubjects = useMemo(() => {
    let list = availableSubjects;

    if (activeTab === 'active') {
      list = list.filter(s => !excludedSubjects.includes(s.name));
    } else if (activeTab === 'excluded') {
      list = list.filter(s => excludedSubjects.includes(s.name));
    }

    if (!subjectSearch.trim()) return list;
    const q = subjectSearch.toLowerCase();
    return list.filter(s =>
      s.name.toLowerCase().includes(q) || s.longName.toLowerCase().includes(q)
    );
  }, [availableSubjects, subjectSearch, activeTab, excludedSubjects]);

  const isAdmin = userRole === 'admin';

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Klassen & Fächer konfigurieren</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Wähle Deine Klassen und Fächer aus. Der Stundenplan wird automatisch für Dein gesamtes Semester synchronisiert.
        </p>
      </div>

      {/* SECTION 1: Class Selection */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">1. Gewählte Klassen</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Wähle beliebig viele Klassen aus, deren Vorlesungen in Deinem Stundenplan zusammengeführt werden sollen.
              </p>
            </div>
          </div>

          <button
            onClick={loadClassCatalog}
            disabled={loadingCatalog}
            className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center space-x-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
            <span>Klassenliste neu laden</span>
          </button>
        </div>

        {/* Selected Classes Chips */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Aktuell ausgewählte Klassen ({selectedClasses.length})
          </label>

          {selectedClasses.length === 0 ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs text-slate-500 dark:text-slate-400">
              Noch keine Klasse ausgewählt. Wähle unten aus dem WebUntis-Katalog oder füge manuell eine Klasse hinzu.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedClasses.map(cls => (
                <div
                  key={cls.id}
                  className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs"
                >
                  <span>{cls.name}</span>
                  {cls.longName && cls.longName !== cls.name && (
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-normal max-w-[140px] truncate">
                      ({cls.longName})
                    </span>
                  )}
                  <button
                    onClick={() => removeClass(cls.id)}
                    className="text-blue-400 hover:text-rose-600 dark:hover:text-rose-400 ml-1 p-0.5 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                    title="Klasse entfernen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* WebUntis Class Search & Catalog Selection */}
        <div className="pt-2">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Aus WebUntis auswählen (z.B. ITS-1, DEC_1, TI-1, WIN-1...)
          </label>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Klasse suchen (z.B. ITS, DEC, MAB, TI)..."
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden transition-all"
            />
          </div>

          {loadingCatalog ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
              <span>Lade Klassen von WebUntis...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-56 overflow-y-auto p-1 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/40">
              {filteredCatalog.map(cls => {
                const isSelected = selectedClasses.some(
                  c => c.id === cls.id || c.name.toLowerCase() === cls.name.toLowerCase()
                );
                return (
                  <button
                    key={cls.id}
                    onClick={() => toggleClassSelection(cls)}
                    className={`p-2 rounded-lg text-left text-xs font-semibold border transition-all cursor-pointer truncate ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-950/30'
                    }`}
                    title={cls.longName || cls.name}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{cls.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 ml-1 shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Manual Add Input */}
        <form onSubmit={handleAddCustomClass} className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Oder Klasse manuell per Name / ID hinzufügen
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Klassenname (z.B. ITS-1)"
              value={customClassName}
              onChange={e => setCustomClassName(e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
            <input
              type="text"
              placeholder="WebUntis Element-ID (optional)"
              value={customClassId}
              onChange={e => setCustomClassId(e.target.value)}
              className="sm:w-48 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
            <button
              type="submit"
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Hinzufügen</span>
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: Subject Filter (Aussortieren) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 gap-2">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">2. Fächerfilter (Aussortieren)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deaktiviere Fächer, die Du nicht belegst. Nur die aktiven Fächer erscheinen in Deinem finalen Stundenplan.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={selectAllSubjects}
              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-md transition-colors cursor-pointer border border-transparent dark:border-slate-700"
            >
              Alle einblenden
            </button>
            <button
              onClick={deselectAllSubjects}
              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-md transition-colors cursor-pointer border border-transparent dark:border-slate-700"
            >
              Alle ausblenden
            </button>
          </div>
        </div>

        {/* Result & Progress banner */}
        {isScanning && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center space-x-2 text-xs font-medium text-blue-800 dark:text-blue-300 animate-in fade-in">
            <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 animate-spin" />
            <span>{scanResultNotice || 'Fächerliste für das Semester wird automatisch aktualisiert...'}</span>
          </div>
        )}
        {!isScanning && scanResultNotice && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center space-x-2 text-xs font-medium text-emerald-800 dark:text-emerald-300 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{scanResultNotice}</span>
          </div>
        )}

        {/* Tabs & Search */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Alle ({availableSubjects.length})</span>
              {isScanning && <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />}
            </button>
            <button
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Aktiv ({availableSubjects.length - excludedSubjects.length})
            </button>
            <button
              onClick={() => setActiveTab('excluded')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'excluded'
                  ? 'bg-white dark:bg-slate-900 text-rose-800 dark:text-rose-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Ausgeblendet ({excludedSubjects.length})
            </button>
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Erkanntes Fach suchen..."
              value={subjectSearch}
              onChange={e => setSubjectSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden transition-all"
            />
          </div>
        </div>

        {/* Subjects List with Toggle Switches */}
        {availableSubjects.length === 0 ? (
          <div className="p-8 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs text-slate-500 dark:text-slate-400 space-y-3">
            {isScanning ? (
              <div className="flex flex-col items-center justify-center space-y-2 py-4">
                <RefreshCw className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">Lade alle Fächer des gesamten Semesters...</p>
                <p className="text-[11px] text-slate-400">Dies geschieht automatisch im Hintergrund.</p>
              </div>
            ) : (
              <p>
                Noch keine Vorlesungen geladen. Wähle oben mindestens eine Klasse aus, um alle Fächer des Semesters automatisch zu laden.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleSubjects.map(subject => {
              const isExcluded = excludedSubjects.includes(subject.name);

              return (
                <div
                  key={subject.name}
                  onClick={() => toggleSubject(subject.name)}
                  className={`group p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    isExcluded
                      ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60'
                      : 'bg-white dark:bg-slate-800/90 border-blue-200 dark:border-slate-700 shadow-2xs hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                      isExcluded ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500' : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'
                    }`}>
                      {isExcluded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <h4 className={`text-xs font-bold truncate ${isExcluded ? 'line-through text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                        {subject.longName || subject.name}
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Kürzel: <span className="font-semibold text-slate-700 dark:text-slate-300">{subject.name}</span> • {subject.count} {subject.count === 1 ? 'Termin' : 'Termine'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      isExcluded
                        ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300'
                        : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                    }`}>
                      {isExcluded ? 'Ausgeblendet' : 'Aktiv'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Save Button for Subjects -> Generate Timetable & Redirect */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {availableSubjects.length - excludedSubjects.length} von {availableSubjects.length} Fächern ausgewählt
              </p>
              {isSaving && (
                <span className="text-[10px] text-blue-600 dark:text-blue-400 animate-pulse font-medium">
                  Speichere Fächer...
                </span>
              )}
              {saveSuccess && !isSaving && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center space-x-1">
                  <span>✓</span> <span>Automatisch gespeichert</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Änderungen werden sofort für Deinen Stundenplan und Kalender-Abo synchronisiert.
            </p>
          </div>

          <button
            onClick={handleSaveAndRedirect}
            disabled={isSaving}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Speichere...' : 'Fächer übernehmen & zum Stundenplan'}</span>
          </button>
        </div>
      </div>

      {/* WebUntis School Connection Details */}
      <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 text-xs space-y-3 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-200 font-bold">
            <School className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>WebUntis Server-Konfiguration</span>
          </div>
          {!isAdmin && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center space-x-1">
              <Lock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>Schreibgeschützt (Nur Admin)</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Schulkürzel</label>
            <input
              type="text"
              value={schoolName}
              disabled={!isAdmin}
              onChange={e => setSchoolName(e.target.value)}
              className={`w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-xs ${
                !isAdmin ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
              }`}
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">WebUntis Server Basis-URL</label>
            <input
              type="text"
              value={serverUrl}
              disabled={!isAdmin}
              onChange={e => setServerUrl(e.target.value)}
              className={`w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-xs ${
                !isAdmin ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500'
              }`}
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Zentrale WebUntis Server- und Schulkennung für Stundenplanabfragen.
          {!isAdmin && ' Änderungen können nur von Administratoren vorgenommen werden.'}
        </p>
      </div>
    </div>
  );
};
