/** game-design §5.4 content packages – data shown in settings and on the start screen. */
export interface PackageSummary {
  id: string;
  name: string;
  createdAt: string;
  folderCount: number;
  mediaCount: number;
  sizeBytes: number;
}

export interface PackagesStatus {
  /** Library folder; null until the setup ran */
  root: string | null;
  activeId: string | null;
  activeName: string | null;
  packages: PackageSummary[];
  /** No library folder or no usable package yet – the setup screen is shown */
  needsSetup: boolean;
  /** Content of a pre-package install waits to be copied into "Default" */
  hasLegacyContent: boolean;
}

/** A package ZIP picked for import, read before anything is extracted. */
export interface PackageZipInfo {
  path: string;
  id: string;
  name: string;
  folderCount: number;
  /** A package with this id is already in the library */
  exists: boolean;
}

export type PackageImportMode = 'replace' | 'copy';

/** Long running package work (setup copy, ZIP export / import, moving the library). */
export interface PackageProgress {
  task: 'setup' | 'export' | 'import' | 'move';
  label: string;
  done: number;
  total: number;
}
