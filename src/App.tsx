import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight,
  Check, Clock3, Crosshair, Expand, LockKeyhole, Minus, Pin, Radio, Settings2, Shrink, X } from 'lucide-react';
import { useMarketClock } from './hooks/useMarketClock';
import { useWindowControls } from './hooks/useWindowControls';
import { preview } from './lib/preview';
import { clock, duration, referenceTime, type MarketPayload, type SessionClock, type TimelineWindow } from './lib/types';
import { IconButton, SettingSwitch } from './components/ui';
import { TimezonePicker } from './components/TimezonePicker';
import relayLogo from './assets/relay.svg';

function SessionTile({ session, twelveHour, upcoming }: { session: SessionClock; twelveHour: boolean; upcoming?: { seconds: number; local: string } }) {
  const time = clock(session.time, twelveHour);
  const open = session.is_open && !upcoming;
  return <article className={`session-tile city-${session.id} ${open ? 'is-open' : ''}`} aria-label={`${session.name} session`}>
    <div className="tile-heading"><h2><i />{session.name}</h2><span className={`session-state ${open ? 'open' : ''}`}>{upcoming ? 'Upcoming' : open ? 'Open' : 'Closed'}</span></div>
    <div className="session-clock" aria-label={`${session.name} local time ${time.main}:${time.seconds} ${time.period}`}><span>{time.main}</span><span className="seconds">:{time.seconds}</span>{time.period && <span className="period">{time.period}</span>}</div>
    <div className="session-date"><span>{session.timezone}</span><span>{session.date}</span></div>
    <div className="session-change" title={`Next change: ${upcoming?.local ?? session.next_change_local}`}><span>{open ? 'Closes in' : 'Opens in'}</span><strong>{duration(upcoming?.seconds ?? session.next_change_seconds)}</strong></div>
  </article>;
}

function CompactView({ data, twelveHour }: { data: MarketPayload; twelveHour: boolean }) {
  const current = data.sessions.find(session => session.id === data.compact.current_id);
  const next = data.sessions.find(session => session.id === data.compact.next_id);
  const overlapping = data.sessions.filter(session => session.is_open && session.id !== current?.id);
  return <>
    <section className="compact-clock-grid" aria-label="Current and upcoming sessions">
      <div className="compact-slot"><h2 className="compact-label">Current</h2>
        {current ? <SessionTile session={current} twelveHour={twelveHour} /> : <article className="session-tile no-current" aria-label="No session open"><Clock3 size={22} /><h3>No session open</h3><p>Waiting for the next opening</p></article>}
      </div>
      <div className="compact-slot"><h2 className="compact-label">Up next</h2>
        {next && <SessionTile session={next} twelveHour={twelveHour} upcoming={{ seconds: data.compact.next_open_seconds, local: data.compact.next_open_local }} />}
      </div>
    </section>
    <div className="compact-footer">
      <span className="home-reference" title={`${next?.name} opens ${referenceTime(data.home.next_open, twelveHour)} · ${data.home.id}`}>Opens {referenceTime(data.home.next_open, twelveHour)} · {data.home.label}</span>
      {overlapping.length > 0 && <span className="compact-overlap"><i />Overlap with {overlapping.map(session => session.name).join(' + ')}</span>}
    </div>
  </>;
}

const position = (seconds: number) => seconds / 86400 * 100;
const barStyle = (window: TimelineWindow) => ({ left: `${position(window.start)}%`, width: `${position(window.end - window.start)}%` });

function Timeline({ data }: { data: MarketPayload }) {
  return <section className="timeline" aria-label="All four sessions over the next 24 hours">
    <div className="timeline-heading"><h2>Next 24 hours</h2><span className="overlap-key"><i /> Overlapping sessions</span></div>
    <div className="timeline-chart">
      <div className="timeline-names">{data.sessions.map(session => <span key={session.id} className={`city-${session.id}`}><i />{session.name}</span>)}</div>
      <div className="timeline-tracks">
        <div className="timeline-axis">{['Now', '+4h', '+8h', '+12h', '+16h', '+20h', '+24h'].map(label => <span key={label}>{label}</span>)}</div>
        <div className="chart-body">
          <div className="chart-grid" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map(i => <i key={i} style={{ left: `${i / 6 * 100}%` }} />)}</div>
          {data.overlaps.map((window, i) => <div className="overlap-shading" key={i} style={barStyle(window)} />)}
          {data.sessions.map(session => <div className={`timeline-row city-${session.id}`} key={session.id} aria-label={`${session.name}: ${session.windows.length ? `${session.hours} local time` : 'No session in the next 24 hours'}`}>
            {session.windows.map((window, i) => <div className="timeline-bar" key={i} style={barStyle(window)} title={`${session.name} · ${session.hours} ${session.timezone}`} />)}
            {!session.windows.length && <span className="no-session">Weekend</span>}
          </div>)}
          <div className="now-marker" />
        </div>
      </div>
    </div>
    <div className="timeline-footnote"><span>Bars show scheduled session hours.</span><span>DST adjusted automatically</span></div>
  </section>;
}

export default function App() {
  const connection = useMarketClock();
  const controls = useWindowControls(connection.native);
  const { preferences, busy } = controls;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const data = connection.payload ?? (connection.native ? null : connection.previewPayload ?? preview);
  const active = data?.sessions.filter(session => session.is_open) ?? [];

  return <Tooltip.Provider delayDuration={250}>
    <div className={`app-shell ${preferences.compact ? 'compact' : ''}`}>
      <header className="titlebar">
        <div className={`brand-drag ${preferences.locked ? 'locked' : ''}`} onPointerDown={event => { if (event.button === 0) controls.drag(); }}>
          <div className="brand-icon"><img src={relayLogo} alt="" draggable={false} /></div><span className="brand-name">forextime<span>.</span></span>
          <span className="brand-caption">SESSION CLOCKS</span>
        </div>
        <div className="window-actions">
          <IconButton label={preferences.onTop ? 'Unpin from top' : 'Keep on top'} active={preferences.onTop} aria-pressed={preferences.onTop} disabled={busy || !connection.native} onClick={() => void controls.update('onTop', !preferences.onTop)}><Pin size={15} /></IconButton>
          <IconButton label={preferences.compact ? 'Show all sessions' : 'Compact view'} active={preferences.compact} disabled={busy} onClick={() => void controls.update('compact', !preferences.compact)}>{preferences.compact ? <Expand size={15} /> : <Shrink size={15} />}</IconButton>
          <IconButton label="Settings" active={settingsOpen} onClick={() => setSettingsOpen(true)}><Settings2 size={15} /></IconButton>
          <span className="window-divider" />
          <IconButton label="Minimize window" disabled={!connection.native || busy} onClick={() => void controls.minimize()}><Minus size={16} /></IconButton>
          <IconButton label="Close window" disabled={!connection.native || busy} onClick={() => void controls.close()}><X size={16} /></IconButton>
        </div>
      </header>

      {!connection.native && <div className="preview-banner">Static design preview · live clocks run in the desktop app</div>}
      {controls.error && <div role="alert" className="error-banner"><span>{controls.error}</span><button onClick={controls.dismissError} aria-label="Dismiss error"><X size={15} /></button></div>}

      {!data ? <main className="connection-state"><Radio size={24} /><h1>{connection.error ? 'Clock disconnected' : 'Connecting…'}</h1>{connection.error && <><p>{connection.error}</p><button className="primary-button" onClick={connection.retry}>Reconnect</button></>}</main> : <main className="dashboard">
        {preferences.compact ? <CompactView data={data} twelveHour={preferences.twelveHour} /> : <>
        <div className="overview"><h1>Four sessions. One glance.</h1><div className={`live-summary ${active.length ? 'has-active' : ''}`}><i />{active.length ? `${active.length} ${active.length === 1 ? 'session' : 'sessions'} open` : 'All sessions closed'}</div></div>
        <section className="clock-grid" aria-label="Four market clocks">{data.sessions.map(session => <SessionTile key={session.id} session={session} twelveHour={preferences.twelveHour} />)}</section>
        <div className="next-event"><span><Clock3 size={13} /><span className="next-caption">NEXT</span><strong>{data.next_event.label}</strong><span className="next-in">in</span><b>{duration(data.next_event.seconds)}</b><span className="event-home-time" title={data.home.id}>{referenceTime(data.home.next_event, preferences.twelveHour)} · {data.home.label}</span></span><span className="current-overlap">{active.length > 1 ? `${active.map(session => session.name).join(' + ')} overlap` : active.length === 1 ? `${active[0].name} session` : 'Between sessions'}</span></div>
        <Timeline data={data} />
        </>}
      </main>}

      <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="settings-dialog">
        <div className="dialog-heading"><Dialog.Title>Clock settings</Dialog.Title><Dialog.Close asChild><button className="icon-button" aria-label="Close settings"><X size={18} /></button></Dialog.Close></div>
        <Dialog.Description className="dialog-description">Place your session clocks where you trade.</Dialog.Description>
        {!connection.native && <p className="settings-preview">Pinning and placement are available in the desktop app.</p>}
        {data && <TimezonePicker home={data.home} busy={connection.timezoneBusy} error={connection.timezoneError} onChange={connection.setTimezone} />}
        <SettingSwitch label="Always on top" description="Keep your session clocks over your charts." checked={preferences.onTop} onChange={value => void controls.update('onTop', value)} disabled={busy || !connection.native} />
        <SettingSwitch label="Lock position" description="Prevent dragging and manual resizing." checked={preferences.locked} onChange={value => void controls.update('locked', value)} disabled={busy || !connection.native} />
        <SettingSwitch label="Compact view" description="Just the current session and the next opening." checked={preferences.compact} onChange={value => void controls.update('compact', value)} disabled={busy} />
        <div className="placement-heading"><span>Quick placement</span>{preferences.locked && <span><LockKeyhole size={11} /> Unlock to move</span>}</div>
        <div className="placement-buttons">{([
          ['top-left', ArrowUpLeft, 'Top left'], ['top-right', ArrowUpRight, 'Top right'],
          ['center', Crosshair, 'Center'], ['bottom-left', ArrowDownLeft, 'Bottom left'], ['bottom-right', ArrowDownRight, 'Bottom right'],
        ] as const).map(([corner, Icon, label]) => <button key={corner} disabled={!connection.native || busy || preferences.locked} onClick={() => void controls.place(corner)}><Icon size={18} /><span>{label}</span></button>)}</div>
        <SettingSwitch label="12-hour clock" description="Use AM / PM on each city clock." checked={preferences.twelveHour} onChange={value => void controls.update('twelveHour', value)} disabled={busy} />
        <details className="schedule-info"><summary>Session hours & details</summary><p>Monday–Friday in each city’s local time. Session conventions, not exchange hours or measured volatility.</p><ul>{data?.sessions.map(session => <li key={session.id}><span>{session.name}</span><span>{session.hours}</span></li>)}</ul></details>
        <Dialog.Close asChild><button className="primary-button">Done <Check size={15} /></button></Dialog.Close>
      </Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  </Tooltip.Provider>;
}
