import type { StageStoreData } from '@/lib/utils/stage-storage';

export type ClassroomSaveState = 'saving' | 'saved' | 'error';

type MarkerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ClassroomPersistenceOptions {
  readonly stageId: string;
  readonly saveLocal: (snapshot: StageStoreData) => Promise<void>;
  readonly saveRemote: (snapshot: StageStoreData, revision: number) => Promise<void>;
  readonly markerStorage?: MarkerStorage;
  readonly debounceMs?: number;
}

const MARKER_PREFIX = 'qalem:classroom-unsynced:';
const listeners = new Set<() => void>();
let activeController: ClassroomPersistence | null = null;
let activeState: ClassroomSaveState = 'saved';

function browserStorage(): MarkerStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

function markerKey(stageId: string): string {
  return `${MARKER_PREFIX}${stageId}`;
}

function publish(state: ClassroomSaveState) {
  if (state === activeState) return;
  activeState = state;
  listeners.forEach((listener) => listener());
}

export function hasUnsyncedClassroom(
  stageId: string,
  storage: MarkerStorage | undefined = browserStorage(),
): boolean {
  return storage ? storage.getItem(markerKey(stageId)) !== null : false;
}

export function clearUnsyncedClassroom(
  stageId: string,
  storage: MarkerStorage | undefined = browserStorage(),
): void {
  storage?.removeItem(markerKey(stageId));
}

export function subscribeClassroomSaveState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getClassroomSaveState(): ClassroomSaveState {
  return activeState;
}

export function activateClassroomPersistence(controller: ClassroomPersistence): () => void {
  activeController = controller;
  publish(controller.state);
  return () => {
    if (activeController === controller) {
      activeController = null;
      publish('saved');
    }
  };
}

export function flushClassroomPersistence(): Promise<boolean> {
  return activeController?.flush() ?? Promise.resolve(true);
}

export function retryClassroomPersistence(): void {
  void activeController?.flush();
}

export class ClassroomPersistence {
  private readonly storage: MarkerStorage | undefined;
  private readonly debounceMs: number;
  private revision = 0;
  private savedRevision = 0;
  private latest: StageStoreData | null = null;
  private localTail: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<boolean> | null = null;
  state: ClassroomSaveState = 'saved';

  constructor(private readonly options: ClassroomPersistenceOptions) {
    this.storage = options.markerStorage ?? browserStorage();
    this.debounceMs = options.debounceMs ?? 800;
  }

  schedule(snapshot: StageStoreData, immediate = false): void {
    const revision = ++this.revision;
    const frozen = structuredClone(snapshot);
    this.latest = frozen;
    this.storage?.setItem(markerKey(this.options.stageId), String(revision));
    this.setState('saving');

    // Serialize local snapshots too: an older IndexedDB transaction must never
    // finish after a newer one and become the snapshot restored on reload.
    this.localTail = this.localTail.then(
      () => this.options.saveLocal(frozen),
      () => this.options.saveLocal(frozen),
    );

    if (this.timer) clearTimeout(this.timer);
    if (immediate) {
      void this.flush();
    } else {
      this.timer = setTimeout(() => void this.flush(), this.debounceMs);
    }
  }

  flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.running) {
      return this.running.then((saved) =>
        this.savedRevision < this.revision ? this.flush() : saved,
      );
    }

    if (this.state === 'error' && this.latest) {
      const snapshot = this.latest;
      this.localTail = this.localTail.catch(() => this.options.saveLocal(snapshot));
      this.setState('saving');
    }

    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(): Promise<boolean> {
    try {
      while (this.savedRevision < this.revision) {
        const revision = this.revision;
        const snapshot = this.latest;
        const localWrite = this.localTail;
        if (!snapshot) break;

        await localWrite;
        await this.options.saveRemote(snapshot, revision);
        this.savedRevision = revision;
      }

      if (this.revision > 0 && this.savedRevision === this.revision) {
        this.storage?.removeItem(markerKey(this.options.stageId));
        this.setState('saved');
      }
      return true;
    } catch {
      this.setState('error');
      return false;
    }
  }

  private setState(state: ClassroomSaveState): void {
    this.state = state;
    if (activeController === this) publish(state);
  }
}
