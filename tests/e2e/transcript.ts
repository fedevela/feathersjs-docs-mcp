import fs from 'node:fs';
import path from 'node:path';

export interface TranscriptEvent {
  ts: string;
  step: string;
  kind: 'log' | 'request' | 'response';
  payload: unknown;
}

export class Transcript {
  private events: TranscriptEvent[] = [];
  private filePath: string;

  constructor(filePath = path.resolve(process.cwd(), 'artifacts', 'e2e-transcript.jsonl')) {
    this.filePath = filePath;
  }

  push(step: string, kind: TranscriptEvent['kind'], payload: unknown): void {
    this.events.push({
      ts: new Date().toISOString(),
      step,
      kind,
      payload
    });
  }

  flush(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const data = this.events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(this.filePath, data, 'utf8');
  }
}
