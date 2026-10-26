'use client';
import {useState} from 'react';
import {Bell,Save} from 'lucide-react';
export type MailSettings={preferences:{frequency:string;no_change:number;last_sent:number|null;error:string|null};email:string|null;mailConfigured:boolean;lastScheduledRun:number|null};
export default function NotificationSettings({settings,signedIn,save}:{settings:MailSettings;signedIn:boolean;save:(frequency:string,noChange:boolean)=>Promise<boolean>}){
 const [frequency,setFrequency]=useState(settings.preferences.frequency),[noChange,setNoChange]=useState(!!settings.preferences.no_change),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <section className="settings-card notification-settings"><span className="settings-icon"><Bell size={22}/></span><h2>Email updates</h2><p>Send alerts to <strong>{settings.email||'your verified sign-in address'}</strong>. You can turn off email for individual watches.</p>
  <p className="setup-status">{!settings.mailConfigured?'Email sending setup is pending. Preferences can be saved now.':settings.preferences.last_sent?`Last email accepted by the mail provider: ${new Date(settings.preferences.last_sent).toLocaleString()}`:'Email sending is configured. No alert email has been accepted by the mail provider yet.'}</p>
  {settings.preferences.error&&<p role="alert" className="form-error">{settings.preferences.error}</p>}
  <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{if(await save(frequency,noChange))setMessage('Email preferences saved. They apply to future changes.');}finally{setBusy(false);}}}><label>Email frequency<select name="email-frequency" value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="off">Email off</option><option value="change">When a change is detected</option><option value="daily">Daily summary</option><option value="weekly">Weekly summary</option></select></label><p className="field-hint">Change emails are queued for the next scheduled delivery run. Daily and weekly summaries begin one period after you save.</p>
   {['daily','weekly'].includes(frequency)&&<label className="check-label"><input type="checkbox" name="no-change-summary" checked={noChange} onChange={e=>setNoChange(e.target.checked)}/>Send a summary even when no matching changes were detected</label>}
   <p className="field-hint">A summary includes failed checks. Missing updates never confirm a house sold.</p><button className="btn primary" disabled={busy||!signedIn}><Save size={15}/>{busy?'Saving…':'Save email preferences'}</button><p role="status">{message}</p>
  </form>
 </section>;
}
