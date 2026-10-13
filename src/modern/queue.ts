import * as vscode from 'vscode';
export interface Job {
  id: number; label: string; state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  bytes: number; total: number; speed: number; error?: string; started?: number;
  run: (signal: AbortSignal, progress: (bytes: number, total?: number) => void) => Promise<any>;
  controller: AbortController; resolve: (value: any) => void; reject: (error: Error) => void;
}
export class Queue {
  jobs: Job[] = []; readonly changed = new vscode.EventEmitter<void>(); private nextId = 1; private running = 0;
  add(label: string, run: Job['run']): Promise<any> {
    const promise = new Promise((resolve, reject) => {
      this.jobs.push({ id: this.nextId++, label, state: 'queued', bytes: 0, total: 0, speed: 0, run, controller: new AbortController(), resolve, reject });
    });
    this.changed.fire(); this.pump(); return promise;
  }
  private pump() {
    while (this.running < 2) {
      const job = this.jobs.find(x => x.state === 'queued'); if (!job) return;
      this.running++; job.state = 'running'; job.started = Date.now(); this.changed.fire();
      let last = 0;
      const progress = (bytes: number, total?: number) => { job.bytes = bytes; if (total !== undefined) job.total = total; job.speed = bytes / Math.max(.001, (Date.now() - job.started!) / 1000); if (Date.now() - last > 150) { last = Date.now(); this.changed.fire(); } };
      Promise.resolve().then(() => job.run(job.controller.signal, progress)).then(value => {
        if (job.controller.signal.aborted) throw new Error('Transfer cancelled.');
        job.state = 'completed'; job.resolve(value);
      }).catch(error => { job.state = job.controller.signal.aborted ? 'cancelled' : 'failed'; const failure = job.controller.signal.aborted ? new Error('Transfer cancelled.') : error; job.error = failure.message; job.reject(failure); }).finally(() => { this.running--; this.changed.fire(); this.pump(); });
    }
  }
  cancel(id?: number) {
    for (const job of this.jobs.filter(x => (id === undefined || x.id === id) && ['running', 'queued'].includes(x.state))) {
      job.controller.abort();
      if (job.state === 'queued') { job.state = 'cancelled'; job.reject(new Error('Transfer cancelled.')); }
    }
    this.changed.fire();
  }
  async retry(id?: number) { await Promise.all(this.jobs.filter(x => (id === undefined || x.id === id) && ['failed', 'cancelled'].includes(x.state)).map(x => this.add(x.label, x.run))); }
  clear() { this.jobs = this.jobs.filter(x => ['running', 'queued'].includes(x.state)); this.changed.fire(); }
  get pending() { return this.jobs.filter(x => ['running', 'queued'].includes(x.state)).length; }
  dispose() { this.cancel(); this.changed.dispose(); }
}
