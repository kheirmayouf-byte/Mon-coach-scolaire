import {execFile} from 'node:child_process';
// Windows' installed speech engine. No recording or audio is sent by this helper.
const script=String.raw`$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$recognizers=[System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
$info=$recognizers | Where-Object { $_.Culture.Name -eq 'fr-FR' } | Select-Object -First 1
if(-not $info){throw 'FR_RECOGNIZER_MISSING'}
$engine=New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
try {
 $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
 $engine.SetInputToDefaultAudioDevice()
 $result=$engine.Recognize([TimeSpan]::FromSeconds(15))
 @{text=if($result){$result.Text}else{''}} | ConvertTo-Json -Compress
} finally {$engine.Dispose()}
`;
export function createDictation(spawn=execFile){
 let active=null;
 return {
  listen(){if(active)throw Error('Une dictée est déjà en cours.');return new Promise((resolve,reject)=>{active=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,encoding:'utf8',timeout:22000,maxBuffer:100000},(error,stdout,stderr)=>{active=null;if(error){reject(Error(String(stderr).includes('FR_RECOGNIZER_MISSING')?'Installe la reconnaissance vocale française dans les paramètres de langue Windows, puis réessaie.':'La dictée a été interrompue. Vérifie le micro et son autorisation dans les paramètres de confidentialité Windows.'));return;}try{resolve({text:String(JSON.parse(stdout).text||'').slice(0,2000)});}catch{reject(Error('La dictée n’a pas pu être lue. Réessaie.'));}});});},
  cancel(){active?.kill();active=null;return {cancelled:true};}
 };
}
