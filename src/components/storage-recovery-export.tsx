import type { AppColors } from '@/constants/theme';
import type { Translate } from '@/constants/i18n';

export type RecoveryExportProps = { payload: () => string; colors: AppColors; t: Translate };

// Native file transfer is a separate roadmap stage; no new native dependency here.
export function StorageRecoveryExport(_props: RecoveryExportProps) { return null; }
