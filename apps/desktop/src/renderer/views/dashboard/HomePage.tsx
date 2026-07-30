import type { FC, SVGProps } from 'react';
import type { DashboardData } from './use-dashboard';
import { BoltIcon, MicIcon, ShieldIcon } from './icons';

function FeatureCard({
  Icon,
  title,
  body,
}: {
  Icon: FC<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
}): React.JSX.Element {
  return (
    <div className="card card--feature">
      <span className="card__icon">
        <Icon />
      </span>
      <h4 className="card__title">{title}</h4>
      <p className="card__body">{body}</p>
    </div>
  );
}

export function HomePage({ data }: { data: DashboardData }): React.JSX.Element {
  const { status, busy, startListening } = data;
  const localStt = status?.sttProvider !== 'deepgram';
  const cues = status?.anthropicKeyPresent ?? false;

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Ready when you are</h1>
        <p className="page__sub">
          Start a session and AssistMe listens to the whole conversation — you and the other
          participants — surfacing private, real-time cues in an overlay that stays invisible to
          screen sharing.
        </p>
      </div>

      <section className="hero">
        <div className="hero__body">
          <span className="pill">
            <span className="dot dot--ok" />
            {localStt ? 'Local Whisper — free & offline' : 'Deepgram (cloud)'}
          </span>
          <h2 className="hero__h">Start listening</h2>
          <p className="hero__p">
            Opens the content-protected overlay and begins transcription
            {cues ? ' plus live AI cues.' : ' (add an Anthropic key for live cues).'}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={busy}
            onClick={() => void startListening()}
          >
            {busy ? 'Opening…' : 'Start Listening'}
          </button>
        </div>
        <div className="hero__art" aria-hidden="true">
          <div className="hero__orb" />
        </div>
      </section>

      <div className="cards">
        <FeatureCard
          Icon={MicIcon}
          title="Hears everyone"
          body="Mixes your mic and system audio, so cues understand both sides of an interview or meeting."
        />
        <FeatureCard
          Icon={ShieldIcon}
          title="Invisible overlay"
          body="The cue window is excluded from screen capture on macOS & Windows — hidden from Zoom, Meet, and recorders."
        />
        <FeatureCard
          Icon={BoltIcon}
          title="Private, free STT"
          body="Speech-to-text runs on-device via whisper.cpp. Your audio never leaves the machine to be transcribed."
        />
      </div>

      <section className="steps">
        <h3 className="page__h3">How it works</h3>
        <ol className="steps__list">
          <li>
            <span className="steps__n">1</span>
            <div>
              <b>Start</b> — grant microphone (and Screen Recording, for system audio) once.
            </div>
          </li>
          <li>
            <span className="steps__n">2</span>
            <div>
              <b>Talk</b> — live transcription appears; cues stream as the conversation unfolds.
            </div>
          </li>
          <li>
            <span className="steps__n">3</span>
            <div>
              <b>Stay hidden</b> — share your screen freely; the overlay never appears in the
              capture.
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
