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
}

export const RecoveryCsvModal: React.FC<RecoveryCsvModalProps> = ({
  isOpen,
  onClose,
  logs,
  onImportLogs,
  onResetDefaults,
}) => {
  const [csvText, setCsvText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

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
    setError(null);
    setSuccessMsg(null);
    const res = parseGarminOrTpCsv(text);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.imported.length === 0) {
      setError('No valid recovery entries found.');
      return;
    }

    onImportLogs(res.imported);
    setSuccessMsg(`Successfully imported ${res.imported.length} daily recovery logs!`);
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
    const template = [
      'Date,Resting_HR_bpm,HRV_rMSSD_ms,Sleep_Hours,Sleep_Score,Deep_Sleep_Minutes,REM_Sleep_Minutes',
      '2026-10-24,41,78,8.25,88,85,105',
      '2026-10-23,42,74,7.75,82,78,95',
      '2026-10-22,44,66,7.00,71,60,80',
    ].join('\n');

    const blob = new Blob([template], { type: 'text/csv' });
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
    a.download = `fit_track_recovery_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f111a] border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Import Garmin / TrainingPeaks Data</h2>
              <p className="text-xs text-slate-400">Sync HRV, Resting HR, and Sleep history</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* File Upload Zone */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Upload CSV File
            </label>
            <label className="border-2 border-dashed border-slate-800 hover:border-sky-500/60 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-950/40 group">
              <Upload className="w-8 h-8 text-slate-500 group-hover:text-sky-400 transition-colors mb-2" />
              <span className="text-sm font-semibold text-slate-300 group-hover:text-white">
                Click to browse or drop Garmin / TP CSV
              </span>
              <span className="text-xs text-slate-500 mt-1">
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
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Or Paste CSV Text
              </label>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-xs text-sky-400 hover:text-sky-300 underline flex items-center gap-1"
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
              className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl p-3 font-mono text-xs text-slate-300 outline-none resize-none"
            />
          </div>

          {/* Preset Sample Data & Export */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onResetDefaults();
                  setSuccessMsg('Loaded 28-day historical baseline dataset (41 bpm baseline RHR).');
                  setTimeout(() => onClose(), 1000);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Load 28d Sample Data (41 bpm)
              </button>
              <button
                type="button"
                onClick={handleExportCurrent}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                Export CSV ({logs.length} days)
              </button>
            </div>

            <button
              type="button"
              onClick={handleManualImport}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-sky-500/20"
            >
              <Check className="w-4 h-4" />
              Parse & Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
