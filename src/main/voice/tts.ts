/**
 * Spoken replies. Two engines:
 *
 * - **system** — Chromium's own `speechSynthesis`, which ships with the app: no download, no extra
 *   process, and it runs entirely in the renderer. This is the default.
 * - **piper** — rhasspy/piper, a small offline neural voice. Cellar downloads the Windows build and
 *   one voice (an .onnx model plus its .json config), then runs `piper.exe` per utterance and hands
 *   the WAV back to the renderer to play. Better voices at the cost of ~20 MB of binary and ~60 MB
 *   per voice.
 *
 * Either way the audio is played in the renderer — the main process has no audio output — so this
 * module's job is to produce the bytes and to let main-side callers (the `cellar-voice` module's
 * `speak` action) ask the renderer to say something.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import extractZip from 'extract-zip';
import type { PiperVoiceInfo, TtsStatus } from '@shared/types/voice';
import { downloadFile } from '../lib/download';
import { bus } from '../lib/events';
import { errorMessage, newId, throttle } from '../lib/util';
import { settings } from '../services/settings';
import { paths } from '../system/paths';

/** The last Windows x64 release of rhasspy/piper; its binary layout has been stable since. */
const PIPER_RELEASE = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip';
const PIPER_LINUX = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz';
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';

/**
 * A deliberately short list: one good voice per language people here actually dictate in. `sizeBytes`
 * is the typical size of a piper voice of that quality, shown as an estimate before the download —
 * the real total comes from the response once it starts.
 */
export const PIPER_VOICES: Array<Omit<PiperVoiceInfo, 'installed'>> = [
  { id: 'en_US-amy-medium', label: 'Amy (English, US)', language: 'en', quality: 'medium', sizeBytes: 63_000_000, path: 'en/en_US/amy/medium/en_US-amy-medium.onnx' },
  { id: 'en_US-ryan-high', label: 'Ryan (English, US)', language: 'en', quality: 'high', sizeBytes: 113_000_000, path: 'en/en_US/ryan/high/en_US-ryan-high.onnx' },
  { id: 'en_GB-alan-medium', label: 'Alan (English, UK)', language: 'en', quality: 'medium', sizeBytes: 63_000_000, path: 'en/en_GB/alan/medium/en_GB-alan-medium.onnx' },
  { id: 'tr_TR-fahrettin-medium', label: 'Fahrettin (Türkçe)', language: 'tr', quality: 'medium', sizeBytes: 63_000_000, path: 'tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium.onnx' },
  { id: 'de_DE-thorsten-medium', label: 'Thorsten (Deutsch)', language: 'de', quality: 'medium', sizeBytes: 63_000_000, path: 'de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx' },
];

const piperDir = () => paths().piper;
const voicesDir = () => join(piperDir(), 'voices');
const EXE_NAMES = ['piper.exe', 'piper'];

async function findPiper(dir: string, depth = 2): Promise<string | null> {
  for (const name of EXE_NAMES) if (existsSync(join(dir, name))) return join(dir, name);
  if (depth <= 0) return null;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const found = await findPiper(join(dir, entry.name), depth - 1);
    if (found) return found;
  }
  return null;
}

const installing = new Set<string>();

function progress(id: string) {
  return throttle((stage: 'downloading' | 'extracting' | 'done' | 'error', receivedBytes: number, totalBytes: number, message?: string) => {
    bus.emit('voice:progress', { kind: 'tts', id, stage, receivedBytes, totalBytes, message });
  }, 200);
}

class TtsService {
  async binary(): Promise<string | null> {
    return findPiper(join(piperDir(), 'runtime'));
  }

  async status(): Promise<TtsStatus> {
    const app = settings.get();
    const binary = await this.binary();
    const voices = PIPER_VOICES.map((v) => ({ ...v, installed: existsSync(join(voicesDir(), `${v.id}.onnx`)) && existsSync(join(voicesDir(), `${v.id}.onnx.json`)) }));
    const selected = voices.find((v) => v.id === app.piperVoice);
    return {
      engine: app.ttsEngine,
      speakReplies: app.voiceReplies,
      systemVoice: app.voiceReplyVoice,
      piperInstalled: !!binary,
      piperVoice: app.piperVoice,
      voices,
      ready: app.ttsEngine === 'system' || (!!binary && !!selected?.installed),
    };
  }

  async installPiper(): Promise<void> {
    if (installing.has('piper')) throw new Error('Piper is already being installed.');
    if (process.platform === 'darwin') throw new Error('Piper does not ship a macOS build here; use the system voices instead.');
    installing.add('piper');
    const report = progress('piper');
    try {
      const url = process.platform === 'win32' ? PIPER_RELEASE : PIPER_LINUX;
      if (!url.endsWith('.zip')) throw new Error('Install piper with your package manager and it will be picked up automatically.');
      const archive = join(paths().tmp, 'piper.zip');
      await downloadFile({ url, dest: archive, onProgress: (received, total) => report('downloading', received, total) });
      report('extracting', 1, 1);
      report.flush();
      const target = join(piperDir(), 'runtime');
      await rm(target, { recursive: true, force: true });
      await extractZip(archive, { dir: target });
      await rm(archive, { force: true });
      if (!(await findPiper(target))) throw new Error('The download did not contain piper.');
      report('done', 1, 1);
      report.flush();
    } catch (err) {
      report('error', 0, 0, errorMessage(err));
      report.flush();
      throw err;
    } finally {
      installing.delete('piper');
    }
  }

  async downloadVoice(id: string): Promise<void> {
    const voice = PIPER_VOICES.find((v) => v.id === id);
    if (!voice) throw new Error('Unknown voice.');
    if (installing.has(id)) throw new Error('That voice is already downloading.');
    installing.add(id);
    const report = progress(id);
    try {
      await mkdir(voicesDir(), { recursive: true });
      await downloadFile({ url: `${VOICE_BASE}/${voice.path}`, dest: join(voicesDir(), `${id}.onnx`), onProgress: (received, total) => report('downloading', received, total || voice.sizeBytes) });
      await downloadFile({ url: `${VOICE_BASE}/${voice.path}.json`, dest: join(voicesDir(), `${id}.onnx.json`) });
      settings.update({ piperVoice: id });
      report('done', voice.sizeBytes, voice.sizeBytes);
      report.flush();
    } catch (err) {
      report('error', 0, 0, errorMessage(err));
      report.flush();
      throw err;
    } finally {
      installing.delete(id);
    }
  }

  async deleteVoice(id: string): Promise<void> {
    if (!PIPER_VOICES.some((v) => v.id === id)) throw new Error('Unknown voice.');
    await rm(join(voicesDir(), `${id}.onnx`), { force: true });
    await rm(join(voicesDir(), `${id}.onnx.json`), { force: true });
  }

  /** Renders text to a 22 kHz WAV with piper. Returns null when piper is not the active engine. */
  async synthesize(text: string): Promise<Uint8Array | null> {
    const app = settings.get();
    if (app.ttsEngine !== 'piper') return null;
    const binary = await this.binary();
    if (!binary) throw new Error('Piper is not installed. Install it in Settings → Voice, or switch spoken replies back to the system voices.');
    const model = join(voicesDir(), `${app.piperVoice}.onnx`);
    if (!existsSync(model)) throw new Error('That piper voice is not downloaded yet.');
    const out = join(paths().tmp, `speech-${newId()}.wav`);
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(binary, ['--model', model, '--output_file', out], { cwd: dirname(binary), windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
        const errors: Buffer[] = [];
        const timer = setTimeout(() => child.kill(), 60_000);
        child.stderr.on('data', (c: Buffer) => errors.push(c));
        child.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(`piper failed (exit code ${code}): ${Buffer.concat(errors).toString('utf8').trim().split('\n').slice(-2).join(' ')}`));
        });
        child.stdin.end(text);
      });
      return new Uint8Array(await readFile(out));
    } finally {
      await rm(out, { force: true }).catch(() => undefined);
    }
  }

}

export const tts = new TtsService();

