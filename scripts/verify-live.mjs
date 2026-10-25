import {investigate} from '../server/investigate.mjs';
import {modelJSON} from '../server/providers.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const claim=process.argv[2];const label=process.argv[3]||'diagnostic';
if(!claim||!/^[a-z0-9-]+$/.test(label))throw Error('Usage: node --env-file=.env scripts/verify-live.mjs CLAIM LABEL');
const dir=new URL('../docs/real-queries/',import.meta.url);await mkdir(dir,{recursive:true});let round=0;
const report=await investigate({claim,depth:'standard'},e=>console.log(JSON.stringify(e)),{modelFn:async(...args)=>{const result=await modelJSON(...args);await writeFile(new URL(`${label}-model-${++round}.json`,dir),JSON.stringify(result,null,2));return result;}});
await writeFile(new URL(`${label}.json`,dir),JSON.stringify(report,null,2));console.log(JSON.stringify({id:report.id,verdict:report.verdict,evidence:report.evidence.length,sources:report.sources.length}));
