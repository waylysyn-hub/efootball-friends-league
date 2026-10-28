import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('fresh and existing installation instructions include every timestamped migration in order', async () => {
  const files=(await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort();
  const setup=await fs.readFile(new URL('../SETUP.md',import.meta.url),'utf8');
  const sections=[setup.split('## Fresh installation')[1].split('Then create the first user')[0],setup.split('## Existing project upgrade')[1].split('## Authorization model')[0]];
  for(const section of sections){
    const documented=[...section.matchAll(/`supabase\/migrations\/([^`]+[.]sql)`/g)].map(match=>match[1]);
    assert.deepEqual(documented,files);
  }
});
