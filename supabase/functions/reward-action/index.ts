import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { sendExpoPush } from '../_shared/push.ts';
import { createRewardHandler } from './handler.ts';

Deno.serve(createRewardHandler({ requireUser, serviceClient, sendExpoPush }));
