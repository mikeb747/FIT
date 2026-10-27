import React, { useState } from 'react';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  Check,
  AlertCircle,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import type { DailyRecoveryLog } from '../types/recovery';
import {
  parseGarminOrTpCsv,
  exportRecoveryLogsToCsv,
  resetRecoveryLogsToDefaults,
} from '../utils/recoveryStorage';

interface RecoveryCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: DailyRecoveryLog[];
  onImportLogs: (imported: DailyRecoveryLog[]) => void;
  onResetDefaults: () => void;
  theme?: 'light' | 'dark';
}

export const RecoveryCsvModal: React.FC<RecoveryCsvModalProps> = ({
  isOpen,
  onClose,
  logs,
  onImportLogs,
  onResetDefaults,
  theme = 'dark',
}) => {
  const [csvText, setCsvText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isLight = theme === 'light';

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCsvText(content);
        processCsv(content);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file from disk.');
    };
    reader.readAsText(file);
  };

  const processCsv = (text: string) => {
    const { imported, error: parseErr } = parseGarminOrTpCsv(text);
    if (parseErr || imported.length === 0) {
      setError(parseErr || 'No valid recovery logs could be extracted.');
      return;
    }
    onImportLogs(imported);
    setSuccessMsg(`Successfully imported ${imported.length} recovery records!`);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleManualImport = () => {
    if (!csvText.trim()) {
      setError('Please paste CSV text or select a file to import.');
      return;
    }
    processCsv(csvText);
  };

  const handleDownloadTemplate = () => {
    const sample = [
      'Date,Resting_HR,HRV,Sleep_Hours,Sleep_Score,Deep_Sleep_Min,REM_Sleep_Min',
      '2026-10-25,41,78,8.2,88,85,100',
      '2026-10-24,42,74,7.8,82,78,95',
      '2026-10-23,44,66,7.0,71,60,80',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fit_track_recovery_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCurrent = () => {
    const csv = exportRecoveryLogsToCsv(logs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fit_track_recovery_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`border rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-xl'
            : 'bg-[#0f111a] border-slate-800 text-slate-100 shadow-2xl'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isLight ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Import Garmin / TrainingPeaks CSV
              </h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Sync HRV, Resting HR, and Sleep history
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isLight
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                isLight
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                isLight
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* File Upload Zone */}
          <div>
            <label
              className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              Upload CSV File
            </label>
            <label
              className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors group ${
                isLight
                  ? 'border-slate-200 bg-slate-50/60 hover:border-sky-500 hover:bg-white'
                  : 'border-slate-800 bg-slate-950/40 hover:border-sky-500/60'
              }`}
            >
              <Upload className="w-8 h-8 text-slate-400 group-hover:text-sky-500 transition-colors mb-2" />
              <span
                className={`text-sm font-semibold transition-colors ${
                  isLight
                    ? 'text-slate-700 group-hover:text-sky-600'
                    : 'text-slate-300 group-hover:text-white'
                }`}
              >
                Click to browse or drop Garmin / TP CSV
              </span>
              <span className="text-xs text-slate-400 mt-1">
                Supports Garmin Connect Sleep/HRV export or TrainingPeaks metrics export
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Direct CSV Paste */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                Or Paste CSV Text
              </label>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-xs text-sky-500 hover:text-sky-600 underline flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download Template CSV
              </button>
            </div>
            <textarea
              rows={4}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Date,Resting_HR,HRV,Sleep_Hours,Sleep_Score&#10;2026-10-25,41,79,8.1,88"
              className={`w-full rounded-xl p-3 font-mono text-xs outline-none resize-none border ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-slate-300 focus:border-sky-500'
              }`}
            />
          </div>

          {/* Export & Actions */}
          <div
            className={`pt-3 border-t flex flex-wrap items-center justify-between gap-3 ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onResetDefaults();
                    setSuccessMsg('Cleared stored recovery logs.');
                    setTimeout(() => onClose(), 800);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                    isLight
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                      : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                  Clear Logs
                </button>
              )}
              <button
                type="button"
                onClick={handleExportCurrent}
                disabled={logs.length === 0}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                  logs.length === 0
                    ? 'opacity-50 cursor-not-allowed border-slate-700 text-slate-500'
                    : isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
                }`}
              >
                <Download className="w-3.5 h-3.5 text-sky-500" />
                Export CSV ({logs.length} days)
              </button>
            </div>

            <button
              type="button"
              onClick={handleManualImport}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-sky-500/20"
            >
              <Check className="w-4 h-4" />
              Parse &amp; Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
