import {motion} from 'motion/react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {api} from '@/model';
import {useGrove} from '@/app/useGrove';

export function SettingsPage() {
  const {data, preference, setPreference, busy, run, refresh} = useGrove();
  return (
    <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: 0.25}}>
      <h1 className="font-display text-4xl font-semibold">Settings</h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">Saved here, and followed in every lesson, idea, and planning conversation.</p>
      <h2 className="mb-3 mt-8 font-display text-xl">For every lesson</h2>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={event => {event.preventDefault(); run(async () => {await api('/preferences', 'POST', {text: preference}); setPreference(''); await refresh();});}}>
        <Input required maxLength={240} placeholder="Ask the tutor to keep or stop something" value={preference} onChange={event => setPreference(event.target.value)} />
        <Button disabled={busy}>Save</Button>
      </form>
      <div className="mt-4 grid gap-3">{data?.preferences?.length ? data.preferences.map(item => (
        <Card key={item.id} className="flex items-start justify-between gap-4 p-4"><p className="text-sm">{item.text}</p><Button variant="outline" size="sm" onClick={() => run(async () => {await api(`/preferences/${item.id}`, 'DELETE'); await refresh();})}>Remove</Button></Card>
      )) : <p className="text-sm text-muted-foreground">Nothing saved yet. You can also say it during a lesson.</p>}</div>
    </motion.div>
  );
}
