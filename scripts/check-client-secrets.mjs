import {spawnSync} from 'node:child_process';
const scans=[
  ['-n','XAI_API_KEY','src/components','src/lib/voice/realtime.ts'],
  ['-c','xai-canary|xai-[A-Za-z0-9]{20,}','.next/static'],
];
for(const args of scans){
  const result=spawnSync('rg',args,{encoding:'utf8'});
  if(result.status!==1){console.error('Client secret scan failed. Inspect locally; matches are not printed.');process.exitCode=1;}
  else console.log(`rg ${args.join(' ')}: 0 hits`);
}
