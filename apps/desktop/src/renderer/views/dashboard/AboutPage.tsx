import type { AppStatus } from '@cue/types';
import { ShieldIcon } from './icons';

function platformName(p?: string): string {
  if (p === 'darwin') return 'macOS';
  if (p === 'win32') return 'Windows';
  if (p === 'linux') return 'Linux';
  return p ?? 'Unknown';
}

export function AboutPage({ status }: { status: AppStatus | null }): React.JSX.Element {
  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">About</h1>
        <p className="page__sub">AssistMe — a real-time interview &amp; meeting copilot.</p>
      </div>

      <section className="about">
        <span className="about__badge">
          <ShieldIcon />
        </span>
        <div>
          <h3 className="page__h3">Invisible by design</h3>
          <p className="about__p">
            The cue overlay is excluded from screen capture (macOS{' '}
            <code>NSWindowSharingType=none</code>, Windows <code>WDA_EXCLUDEFROMCAPTURE</code>), so
            it never appears in Zoom, Meet, or Teams shares — or in recordings. It does not hide the
            app from the operating system, Activity Monitor, or Task Manager.
          </p>
        </div>
      </section>

      <div className="meta">
        <div className="meta__row">
          <span>Version</span>
          <b>v{status?.appVersion ?? '0.0.0'}</b>
        </div>
        <div className="meta__row">
          <span>Platform</span>
          <b>{platformName(status?.platform)}</b>
        </div>
        <div className="meta__row">
          <span>Speech-to-text</span>
          <b>{status?.sttProvider === 'deepgram' ? 'Deepgram' : 'Local Whisper (whisper.cpp)'}</b>
        </div>
        <div className="meta__row">
          <span>Cue generation</span>
          <b>Anthropic Claude</b>
        </div>
      </div>

      <p className="page__note">
        Use responsibly: only capture audio where you have the participants&rsquo; consent and
        recording is lawful.
      </p>
    </div>
  );
}
