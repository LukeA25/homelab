import {MessageCircle} from 'lucide-react';
import {motion} from 'motion/react';
import {Button} from '@/components/ui/button';
import {useGrove} from '@/app/useGrove';

export function ExplorePage() {
  const {openVoice} = useGrove();
  return (
    <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: 0.25}}>
      <h1 className="font-display text-4xl font-semibold">Plan a learning path</h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">Talk through what you want to be able to do, what you already know, how deep to go, and where it should finish. Grove saves the path when you are done.</p>
      <Button className="mt-8" onClick={() => openVoice('plan')}><MessageCircle size={16} /> Plan a path</Button>
    </motion.div>
  );
}
