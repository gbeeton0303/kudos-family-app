import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { createMigrationHandler } from './handler.ts';

Deno.serve(createMigrationHandler({ requireUser, serviceClient }));
