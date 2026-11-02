import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Activity, ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, ArrowUpRight as Arrow,
  Check, ChevronRight, Clock3, Crosshair, Expand, Globe2, Grip, Info, LockKeyhole,
  MapPin, Minus, PanelTop, Pin, Radio, Settings2, ShieldCheck, Shrink, X } from 'lucide-react';
import { useMarketClock } from './hooks/useMarketClock';
import { useWindowControls } from './hooks/useWindowControls';
import { previewFor } from './lib/preview';
import { clock, duration, type MarketPayload, type SessionDetails } from './lib/types';
import { IconButton, SettingSwitch } from './components/ui';

function Time({ value, twelveHour, large = false }: { value: string; twelveHour: boolean; large?: boolean }) {
  const parts = clock(value, twelveHour);
  return <div className={`clock ${large ? 'clock-large' : ''}`} aria-label={`${parts.main}:${parts.seconds}${parts.period ? ` ${parts.period}` : ''}`}>
    <span>{parts.main}</span><span className="clock-seconds">:{parts.seconds}</span>
    {parts.period && <span className="clock-period">{parts.period}</span>}
  </div>;
}

function SessionCard({ name, time, open, details, twelveHour, overlap }: {
  name: 'London' | 'New York'; time: string; open: boolean; details: SessionDetails; twelveHour: boolean; overlap: boolean;
}) {
  return <article className={`session-card ${open ? 'session-open' : ''}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <div className="city-mark" aria-hidden="true">{name === 'London' ? 'LDN' : 'NYC'}</div>
        <div><h2>{name}</h2><p className="city-zone">{details.timezone_label} <span>· {name === 'London' ? '08:00–16:00' : '08:00–17:00'}</span></p></div>
      </div>
      <span className={`status-pill ${open ? (overlap ? 'emerald' : 'blue') : 'muted'}`}><i />{open ? 'Open' : 'Closed'}</span>
    </div>
    <div className="session-time-row"><Time value={time} twelveHour={twelveHour} /><span className="local-label">LOCAL TIME</span></div>
    <div className="session-progress" role="progressbar" aria-label={`${name} session elapsed`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={details.progress_percent}>
      <div style={{ width: `${details.progress_percent}%` }} />
    </div>
    <div className="session-countdown"><span>{open ? 'Closes' : 'Opens'} in <strong>{duration(details.next_change_seconds)}</strong></span><span title={`${details.next_change_at} Kabul time`}>{details.next_change_at} <span className="subtle">KBL</span></span></div>
  </article>;
}

const percent = (minutes: number) => ((minutes - 360) / 1440) * 100;

function Timeline({ data }: { data: MarketPayload }) {
  const start = Math.max(data.london_session.timeline_start, data.ny_session.timeline_start);
  const end = Math.min(data.london_session.timeline_end, data.ny_session.timeline_end);
  const scheduled = data.london_session.scheduled && data.ny_session.scheduled;
  return <section className="timeline-card" aria-label="Session timeline in Kabul time">
    <div className="timeline-heading">
      <div><h2>Your session map <span>{data.timeline_date}</span></h2><p>Every session, in Kabul time.</p></div>
      <span className="timeline-zone"><Globe2 size={13} /> UTC+4:30</span>
    </div>
    <div className="timeline-chart">
      <div className="timeline-labels"><span>London</span><span>New York</span></div>
      <div className="timeline-plot">
        <div className="timeline-grid" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map(i => <i key={i} style={{ left: `${i / 6 * 100}%` }} />)}</div>
        {scheduled && <div className="overlap-region" style={{ left: `${percent(start)}%`, width: `${(end - start) / 1440 * 100}%` }} />}
        {[data.london_session, data.ny_session].map((session, i) => <div className="timeline-row" key={i}>
          {session.scheduled ? <div className={`session-bar bar-${i}`} style={{ left: `${percent(session.timeline_start)}%`, width: `${(session.timeline_end - session.timeline_start) / 1440 * 100}%` }}>
            <span>{session.opens_at_kabul}</span><span>{session.closes_at_kabul}{session.timeline_end >= 1440 ? ' +1' : ''}</span>
          </div> : <span className="weekend-label">Weekend · no scheduled session</span>}
        </div>)}
        <div className="now-line" style={{ left: `${percent(data.timeline_minute)}%` }}><span>NOW</span><i /></div>
        <div className="timeline-axis">{['06', '10', '14', '18', '22', '02⁺¹', '06⁺¹'].map(label => <span key={label}>{label}</span>)}</div>
      </div>
    </div>
    <div className="timeline-legend"><span><i className="legend-overlap" />{scheduled ? `Overlap ${data.ny_session.opens_at_kabul}–${data.london_session.closes_at_kabul}` : 'Weekday sessions resume Monday'}</span><span>+1 next day <span className="legend-divider">/</span> DST adjusts automatically</span></div>
  </section>;
}

export default function App() {
  const connection = useMarketClock();
  const controls = useWindowControls(connection.native);
  const { preferences, busy } = controls;
  const [previewMode, setPreviewMode] = useState('overlap');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const data = connection.native ? connection.payload : previewFor(previewMode);
  const phase = data?.is_overlap ? 'overlap' : data?.london_status || data?.ny_status ? 'solo' : 'closed';
  const activeCount = Number(data?.london_status ?? false) + Number(data?.ny_status ?? false);
  const title = phase === 'overlap' ? 'The overlap is live.' : phase === 'solo' ? `${data?.london_status ? 'London' : 'New York'} is in session.` : 'A quieter moment.';

  return <Tooltip.Provider delayDuration={300}>
    <div className={`app-shell phase-${phase} ${preferences.compact ? 'compact' : ''}`}>
      <header className="titlebar">
        <div className={`brand-drag ${preferences.locked ? 'locked' : ''}`} onPointerDown={event => {
          if (event.button === 0) controls.drag();
        }}>
          <div className="brand-icon"><Activity size={18} strokeWidth={2.5} /></div>
          <span className="brand-name">forex<span>time</span><span className="brand-dot">.</span></span>
          <span className="brand-caption">YOUR MARKET COMPANION</span>
        </div>
        <div className="window-actions">
          <IconButton label={preferences.onTop ? 'Unpin from top' : 'Keep on top'} active={preferences.onTop} aria-pressed={preferences.onTop} disabled={busy || !connection.native} onClick={() => void controls.update('onTop', !preferences.onTop)}><Pin size={15} /></IconButton>
          <IconButton label={preferences.compact ? 'Expand dashboard' : 'Compact mode'} active={preferences.compact} disabled={busy} onClick={() => void controls.update('compact', !preferences.compact)}>{preferences.compact ? <Expand size={15} /> : <Shrink size={15} />}</IconButton>
          <IconButton label="Settings" active={settingsOpen} onClick={() => setSettingsOpen(true)}><Settings2 size={15} /></IconButton>
          <span className="window-divider" />
          <IconButton label="Minimize window" disabled={!connection.native || busy} onClick={() => void controls.minimize()}><Minus size={16} /></IconButton>
          <IconButton label="Close window" disabled={!connection.native || busy} onClick={() => void controls.close()}><X size={16} /></IconButton>
        </div>
      </header>

      {!connection.native && <div className="preview-banner"><span><Info size={13} /> Design preview · static sample</span><select aria-label="Preview session state" value={previewMode} onChange={e => setPreviewMode(e.target.value)}><option value="overlap">Overlap</option><option value="solo">Solo session</option><option value="closed">Off-peak</option></select></div>}
      {controls.error && <div role="alert" className="error-banner"><span>{controls.error}</span><button onClick={controls.dismissError} aria-label="Dismiss error"><X size={15} /></button></div>}

      {!data ? <main className="connection-state"><Radio size={30} /><h1>{connection.error ? 'Let’s reconnect your clock.' : 'Connecting to your clock…'}</h1><p>{connection.error ?? 'Waiting for the first time update.'}</p>{connection.error && <button className="primary-button" onClick={connection.retry}>Reconnect</button>}</main> : <>
        {preferences.compact ? <main className="compact-content">
          <div className="compact-caption"><span><MapPin size={12} /> KABUL</span><span className={`status-pill ${phase === 'overlap' ? 'emerald' : phase === 'solo' ? 'blue' : 'muted'}`}><i />{phase === 'overlap' ? 'Overlap' : phase === 'solo' ? 'Solo session' : 'Off-peak'}</span></div>
          <Time value={data.kabul_time} twelveHour={preferences.twelveHour} large />
          <div className="compact-sessions"><span><i className={data.london_status ? 'open-dot' : ''} />LDN <b>{data.london_time.slice(0, 5)}</b></span><span><i className={data.ny_status ? 'open-dot' : ''} />NYC <b>{data.ny_time.slice(0, 5)}</b></span><span>{preferences.locked ? <LockKeyhole size={12} /> : <Grip size={13} />}</span></div>
          <div className="compact-next"><span>{data.next_event.label}</span><strong>{duration(data.next_event.seconds)}</strong></div>
        </main> : <main className="dashboard">
          <div className="page-heading"><div><div className="eyebrow">TIME IT RIGHT</div><h1>Your trading day, at a glance.</h1></div><span className="engine-status"><i />{connection.native ? 'Clock connected' : 'Sample session'}</span></div>
          <section className="hero" aria-label="Kabul clock and current market session">
            <div className="hero-clock"><div className="hero-location"><MapPin size={15} /><h2>Kabul, Afghanistan</h2><span>UTC+4:30</span></div><Time value={data.kabul_time} twelveHour={preferences.twelveHour} large /><p className="hero-date">{data.kabul_date}</p></div>
            <div className="hero-phase"><div className="phase-icon"><Activity size={22} /></div><div className="phase-eyebrow">{phase === 'overlap' ? 'PRIME SESSION WINDOW' : phase === 'solo' ? 'MARKET IN MOTION' : 'BETWEEN SESSIONS'}</div><h2>{title}</h2><p>{phase === 'overlap' ? 'London & New York are both open.' : phase === 'solo' ? 'One major session is currently open.' : 'London & New York are currently closed.'}</p><span className="active-session-count"><i />{activeCount} of 2 sessions active</span></div>
          </section>

          <div className="next-event"><div className="flex items-center gap-3"><div className="next-icon"><Clock3 size={16} /></div><span className="next-label">UP NEXT</span><strong>{data.next_event.label}</strong><ChevronRight size={13} className="subtle" /><span className="next-at">{data.next_event.at_kabul} <span>Kabul</span></span></div><span className="next-countdown"><span>in</span> {duration(data.next_event.seconds)}</span></div>

          <section className="sessions-grid" aria-label="Market sessions"><SessionCard name="London" time={data.london_time} open={data.london_status} details={data.london_session} twelveHour={preferences.twelveHour} overlap={data.is_overlap} /><SessionCard name="New York" time={data.ny_time} open={data.ny_status} details={data.ny_session} twelveHour={preferences.twelveHour} overlap={data.is_overlap} /></section>
          <Timeline data={data} />
          <div className="bottom-note"><Info size={13} /><span>Session activity is a timing guide, not a live volatility measure.</span></div>
        </main>}
        {!preferences.compact && <footer><span><ShieldCheck size={13} /> DST-aware <i /> Powered by your local clock</span><button className="footer-placement" onClick={() => setSettingsOpen(true)}>{preferences.locked ? <LockKeyhole size={12} /> : <Pin size={12} />}{preferences.locked ? 'Position locked' : preferences.onTop ? 'Pinned on top' : 'Make it float'}<Arrow size={12} /></button></footer>}
      </>}

      <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="settings-dialog">
        <div className="dialog-heading"><div><div className="eyebrow">MAKE IT YOURS</div><Dialog.Title>Workspace settings</Dialog.Title></div><Dialog.Close asChild><button className="icon-button" aria-label="Close settings"><X size={18} /></button></Dialog.Close></div>
        <Dialog.Description className="dialog-description">A quiet companion, right where you need it.</Dialog.Description>
        {!connection.native && <p className="settings-preview"><Info size={14} /> Placement and pinning work in the desktop app.</p>}
        <div className="setting-section-label"><PanelTop size={14} /> WINDOW</div>
        <SettingSwitch label="Always on top" description="Keep the clock above your trading charts." checked={preferences.onTop} onChange={value => void controls.update('onTop', value)} disabled={busy || !connection.native} />
        <SettingSwitch label="Lock position" description="Prevent dragging and resizing the window." checked={preferences.locked} onChange={value => void controls.update('locked', value)} disabled={busy || !connection.native} />
        <SettingSwitch label="Compact mode" description="Just the clocks and your next session change." checked={preferences.compact} onChange={value => void controls.update('compact', value)} disabled={busy} />
        <div className="placement-heading"><span>Quick placement</span>{preferences.locked && <span><LockKeyhole size={11} /> Unlock to move</span>}</div>
        <div className="placement-buttons">{([
          ['top-left', ArrowUpLeft, 'Top left'], ['top-right', ArrowUpRight, 'Top right'],
          ['center', Crosshair, 'Center'], ['bottom-left', ArrowDownLeft, 'Bottom left'], ['bottom-right', ArrowDownRight, 'Bottom right'],
        ] as const).map(([corner, Icon, label]) => <button key={corner} disabled={!connection.native || busy || preferences.locked} onClick={() => void controls.place(corner)}><Icon size={18} /><span>{label}</span></button>)}</div>
        <div className="setting-section-label display-section"><Clock3 size={14} /> DISPLAY</div>
        <SettingSwitch label="12-hour clock" description="Use AM / PM for the three live clocks." checked={preferences.twelveHour} onChange={value => void controls.update('twelveHour', value)} disabled={busy} />
        <div className="settings-footnote"><Check size={13} /><span>Preferences and desktop placement are saved automatically.</span></div>
        <Dialog.Close asChild><button className="primary-button">Done <Check size={15} /></button></Dialog.Close>
      </Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  </Tooltip.Provider>;
}
