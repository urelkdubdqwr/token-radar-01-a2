// Competition entry point: execute the radar defined in lib/model.ts against the
// sealed snapshot, emitting the board, the dashboard payload and the dossier.
// Every substantive piece of logic sits over in lib/model.ts.
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runEntryX } from './lib/model.ts';

// Directory of this module — the tree that contains dashboard/ and screenshots/.
const repoRoot = dirname(fileURLToPath(import.meta.url));
try {
  await runEntryX(repoRoot, process.argv.slice(2));
} catch (failure) {
  process.stderr.write(`token radar aborted: ${failure instanceof Error ? failure.message : String(failure)}\n`);
  process.exit(1);
}
