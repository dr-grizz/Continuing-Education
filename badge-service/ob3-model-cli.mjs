import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildUnsignedOpenBadge,validateUnsignedOpenBadge} from './ob3-model.mjs';
import {syntheticModelInput} from './standards/ob3/synthetic-input.mjs';
const [command,path]=process.argv.slice(2);
try{
 if(command==='example'&&path){const output=resolve(path);mkdirSync(output,{recursive:true});const credential=buildUnsignedOpenBadge(syntheticModelInput()),result=await validateUnsignedOpenBadge(credential);writeFileSync(join(output,'synthetic-unsigned-credential.json'),JSON.stringify(credential,null,2)+'\n');writeFileSync(join(output,'validation-report.json'),JSON.stringify({synthetic:true,notice:'Unsigned data model only; no proof, status or issuer authority verification. Example URLs do not resolve.',...result},null,2)+'\n');console.log(JSON.stringify({output,result},null,2));if(!result.valid)process.exitCode=1;}
 else if(command==='validate'&&path){const result=await validateUnsignedOpenBadge(JSON.parse(readFileSync(path,'utf8')));console.log(JSON.stringify(result,null,2));if(!result.valid)process.exitCode=1;}
 else{console.error('Usage: node ob3-model-cli.mjs example OUTPUT_DIR | validate MODEL.json');process.exitCode=2;}
}catch(error){console.error('Open Badges model operation failed: '+error.message);process.exitCode=1;}
