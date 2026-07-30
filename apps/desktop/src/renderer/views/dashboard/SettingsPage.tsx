import type { ReactNode } from 'react';
import type { DashboardData } from './use-dashboard';

const MODELS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'tiny.en', label: 'Tiny — fastest, least accurate' },
  { value: 'base.en', label: 'Base — recommended balance' },
  { value: 'small.en', label: 'Small — most accurate, slower' },
];

const LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
];

function Section({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="sect">
      <h3 className="sect__title">{title}</h3>
      <div className="sect__body">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label">{label}</label>
        {hint ? <p className="field__hint">{hint}</p> : null}
      </div>
      <div className="field__control">{children}</div>
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'muted';
  children: ReactNode;
}): React.JSX.Element {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function SettingsPage({ data }: { data: DashboardData }): React.JSX.Element {
  const { status, settings, updateSettings } = data;

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Settings</h1>
        <p className="page__sub">Configure transcription and review your runtime configuration.</p>
      </div>

      <Section title="Transcription">
        <Field label="Model" hint="Runs on-device (Metal-accelerated). Applies on next launch.">
          <select
            className="select"
            value={settings?.whisperModel ?? 'base.en'}
            onChange={(e) => void updateSettings({ whisperModel: e.target.value })}
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Language" hint="Spoken language of the conversation. Applies on next launch.">
          <select
            className="select"
            value={settings?.language ?? 'en'}
            onChange={(e) => void updateSettings({ language: e.target.value })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Audio capture">
        <Field label="Sources" hint="A meeting or interview always captures both sides — this is not configurable by design.">
          <Badge tone="muted">You + the meeting (mixed)</Badge>
        </Field>
      </Section>

      <Section title="AI & backend">
        <Field label="Speech-to-text" hint="Set STT_PROVIDER=deepgram + a key to use the paid cloud instead.">
          <Badge tone="ok">
            {status?.sttProvider === 'deepgram' ? 'Deepgram (cloud)' : 'Local Whisper — free'}
          </Badge>
        </Field>
        <Field label="Cues (Claude)" hint="AI cues require an Anthropic API key in the environment.">
          {status?.anthropicKeyPresent ? (
            <Badge tone="ok">Anthropic key detected</Badge>
          ) : (
            <Badge tone="warn">Not set — transcription only</Badge>
          )}
        </Field>
        <Field label="Pipeline backend" hint="`local` runs the AI in-process; `gateway` streams through the backend.">
          <Badge tone="muted">{status?.backend ?? '—'}</Badge>
        </Field>
      </Section>
    </div>
  );
}
