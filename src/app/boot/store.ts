// What the app keeps between visits (the mode and the best score), in localStorage under one prefix. Moved out of main.ts.

/** Read and write one saved setting; both give up quietly where storage is off (private mode). */
export interface Store {
  get(k: string): string | null;
  set(k: string, v: string): void;
}

export const store: Store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(`spaghetti-rig:${k}`);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(`spaghetti-rig:${k}`, v);
    } catch {
      /* private mode */
    }
  },
};
