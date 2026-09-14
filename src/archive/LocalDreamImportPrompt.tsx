import { useState } from 'react';
import { getDreams, getMigrationStatus, setMigrationStatus, type SavedDream } from '../hero/dreamStorage';
import { importDreamsRemote } from '../hero/dreamRemoteStorage';
import { useLanguage } from '../i18n/LanguageContext';
import './LocalDreamImportPrompt.css';

interface LocalDreamImportPromptProps {
  userId: string;
  /** Fired once the explicit import actually succeeds, with the exact
      dreams that were just imported — lets the caller (DreamArchive)
      merge them into its own already-loaded list without a full refetch. */
  onImported: (dreams: SavedDream[]) => void;
}

/**
 * The ONLY place local (pre-Supabase) dreams ever move into an
 * authenticated account — always by explicit choice, never automatically.
 * Reads this browser's localStorage dreams (dreamStorage.ts) once on
 * mount; if there are any AND this specific account (by Supabase user id)
 * has never been asked before (see getMigrationStatus), shows a real
 * Import / Not now choice. Either answer is recorded per-account so the
 * same account is never asked twice in this browser — but a DIFFERENT
 * account signing into the same browser still gets its own independent
 * prompt, since nothing here ever deletes the original localStorage data
 * (see importDreamsRemote's own doc comment on why upsert-by-id makes a
 * retried import safe, and dreamStorage.ts's writeAll, which this never
 * calls at all — the local copy simply stays, indefinitely, as a safety
 * net regardless of import outcome).
 */
export default function LocalDreamImportPrompt({ userId, onImported }: LocalDreamImportPromptProps) {
  const { t } = useLanguage();
  const [localDreams] = useState<SavedDream[]>(() => getDreams());
  const [status, setStatus] = useState<'idle' | 'importing' | 'error' | 'done'>(() =>
    getMigrationStatus(userId) ? 'done' : 'idle',
  );

  if (localDreams.length === 0 || status === 'done') return null;

  const handleImport = async () => {
    setStatus('importing');
    try {
      await importDreamsRemote(localDreams, userId);
      setMigrationStatus(userId, 'imported');
      setStatus('done');
      onImported(localDreams);
    } catch (err) {
      console.error('Failed to import local dreams to Supabase:', err);
      setStatus('error');
    }
  };

  const handleDecline = () => {
    setMigrationStatus(userId, 'declined');
    setStatus('done');
  };

  const title =
    localDreams.length === 1 ? t('dreamImport.bannerTitleOne') : t('dreamImport.bannerTitleMany').replace('{count}', String(localDreams.length));

  return (
    <div className="ar-import-banner" role="status">
      <div className="ar-import-text">
        <p className="ar-import-title">{title}</p>
        <p className="ar-import-body">{t('dreamImport.bannerBody')}</p>
        {status === 'error' && <p className="ar-import-error">{t('dreamImport.importError')}</p>}
      </div>
      <div className="ar-import-actions">
        <button type="button" className="btn btn-secondary" data-cursor-hover onClick={handleDecline} disabled={status === 'importing'}>
          {t('dreamImport.notNowButton')}
        </button>
        <button type="button" className="btn btn-primary" data-cursor-hover onClick={handleImport} disabled={status === 'importing'}>
          {status === 'importing' ? t('dreamImport.importing') : t('dreamImport.importButton')}
        </button>
      </div>
    </div>
  );
}
