import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import {GroveProvider} from '@/app/useGrove';
import {AppShell} from '@/components/layout/AppShell';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <MotionConfig reducedMotion="user">
    <GroveProvider>
      <AppShell />
    </GroveProvider>
  </MotionConfig>,
);
