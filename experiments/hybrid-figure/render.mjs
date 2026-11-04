import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),pkg=require.resolve('@remotion/cli/package.json'),cli=path.join(path.dirname(pkg),require('@remotion/cli/package.json').bin.remotion);
const [id='Hybrid-Actions',output='out/actions.mp4',...extra]=process.argv.slice(2),still=output.endsWith('.png');
const browser=process.env.REMOTION_BROWSER_EXECUTABLE;
const result=spawnSync(process.execPath,[cli,still?'still':'render','src/index.tsx',id,output,...(browser?[`--browser-executable=${browser}`]:[]),...(process.platform==='darwin'?['--gl=angle']:[]),'--log=error',...extra],{stdio:'inherit'});
process.exit(result.status??1);
