/** CPU-heavy browsing runs separately from playback and streaming requests. */
import { Worker } from "node:worker_threads";
import type { Library } from "../query/evaluate.ts";
import { BrowseError } from "./browse.ts";
import type { ExploreOptions, explore, exploreSections } from "./explore.ts";

export type ExploreResult = ReturnType<typeof explore> | ReturnType<typeof exploreSections>;
export type ExploreJob = {
  id: number; library?: Library; options: ExploreOptions; favourites?: string[]; sections: boolean;
};
type Reply = { id: number; result?: ExploreResult; error?: { message: string; status: number } };

export class ExploreService {
  private worker?: Worker;
  private sentLibrary?: Library;
  private sequence = 0;
  private closed = false;
  private pending = new Map<number, { resolve: (result: ExploreResult) => void; reject: (error: Error) => void }>();

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./explore-worker.ts", import.meta.url));
    this.worker = worker;
    worker.on("message", (reply: Reply) => {
      const job = this.pending.get(reply.id);
      if (!job) return;
      this.pending.delete(reply.id);
      if (!this.pending.size) worker.unref();
      if (reply.error) job.reject(new BrowseError(reply.error.message, reply.error.status));
      else if (reply.result) job.resolve(reply.result);
      else job.reject(new BrowseError("The Library browser sent no result. Try again.", 503));
    });
    const stopped = () => {
      if (this.worker !== worker) return;
      this.worker = undefined;
      this.sentLibrary = undefined;
      for (const job of this.pending.values()) job.reject(new BrowseError("The Library browser stopped. Try again.", 503));
      this.pending.clear();
    };
    worker.on("error", stopped);
    worker.on("exit", stopped);
    worker.unref();
    return worker;
  }

  async query(library: Library, options: ExploreOptions = {}, favourites?: ReadonlySet<string>, sections = false): Promise<ExploreResult> {
    if (this.closed) throw new BrowseError("The Library browser is stopping.", 503);
    if (this.pending.size >= 16) throw new BrowseError("The Library browser is busy. Try again shortly.", 503);
    const worker = this.start();
    const id = ++this.sequence;
    // Transfer only browse metadata, once per immutable library snapshot. Audio
    // embeddings, signals and analysis provenance are large and never browsed.
    const snapshot: Library | undefined = library === this.sentLibrary ? undefined : {
      version: library.version,
      tracks: library.tracks.map(({ id, title, artist, album_artist, album, path, year, duration_s, genre }) =>
        ({ id, title, artist, album_artist, album, path, year, duration_s, genre })),
    };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.ref();
      try {
        worker.postMessage({ id, library: snapshot, options, favourites: favourites ? [...favourites] : undefined, sections } satisfies ExploreJob);
        this.sentLibrary = library;
      } catch (error) {
        this.pending.delete(id);
        if (!this.pending.size) worker.unref();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.pending.values()) job.reject(new BrowseError("The Library browser is stopping.", 503));
    this.pending.clear();
    const worker = this.worker;
    this.worker = undefined;
    this.sentLibrary = undefined;
    if (worker) await worker.terminate();
  }
}
