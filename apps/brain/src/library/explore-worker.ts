import { parentPort } from "node:worker_threads";
import type { Library } from "../query/evaluate.ts";
import { BrowseError } from "./browse.ts";
import { explore, exploreSections } from "./explore.ts";
import type { ExploreJob } from "./explore-service.ts";

const port = parentPort;
if (!port) throw new Error("The Library browser needs a worker thread");
let library: Library | undefined;
port.on("message", (job: ExploreJob) => {
  try {
    if (job.library) library = job.library;
    if (!library) throw new BrowseError("The Library browser has no library yet.", 503);
    const run = job.sections ? exploreSections : explore;
    const result = run(library, job.options, job.favourites ? new Set(job.favourites) : undefined);
    port.postMessage({ id: job.id, result });
  } catch (error) {
    port.postMessage({ id: job.id, error: error instanceof BrowseError
      ? { message: error.message, status: error.status }
      : { message: "The Library browser couldn't finish this request. Try again.", status: 503 } });
  }
});
