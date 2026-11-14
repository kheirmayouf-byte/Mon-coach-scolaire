import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readableOCR} from '../src/ocr-text.js';
import {enhanceDocumentImage} from '../src/ocr-image.js';
const word=(text,x0,confidence=96)=>({text,confidence,bbox:{x0,x1:x0+text.length*8,y0:10,y1:30}});
const page=lines=>({blocks:[{paragraphs:[{lines:lines.map(words=>({words}))}]}]});
test('OCR omits disconnected margin marks but preserves accents and uncertain real words',()=>{
 const result=readableOCR(page([
  [word('d',0,78),word('Le',200),word('cours',230),word('est',290),word('vérifié.',330),word('|',600,96)],
  [word('|',0),word('musulmans.',200),word('|',600)],
  [word('Texte',200),word('étranger',260,20),word('conservé',350)],
  [word('i',0,20),word('"',10,5)],
 ]));
 assert.equal(result.text,'Le cours est vérifié.\nmusulmans.\nTexte étranger conservé');assert.equal(result.uncertain,true);
});
test('OCR retains maths, numbers, option labels and foreign-language accents',()=>{
 const lines=[[word('x',10,12),word('=',100),word('−2',400,25)],
  [word('|x|',10),word('≤',100),word('√4',400)],
  [word('B)',10),word('¿Quién',50),word('es?',120)],
  [word('électricité',10),word('→',120),word('énergie',180)],
  [word('1/2',10),word('+',80),word('1/3',140),word('=',200),word('5/6',260)]];
 assert.equal(readableOCR(page(lines)).text,lines.map(ws=>ws.map(w=>w.text).join(' ')).join('\n'));
});
test('local contrast separates dark ink from uneven paper and faint show-through',()=>{
 const width=100,height=60,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*4,base=x<50?230:175;data.fill(base,at,at+3);data[at+3]=255;}
 const pixel=(x,y,v)=>{const at=(y*width+x)*4;data.fill(v,at,at+3);};pixel(25,30,60);pixel(75,30,50);pixel(30,30,215);pixel(80,30,165);
 let written=false;const canvas={width,height,getContext:()=>({getImageData:()=>({data}),putImageData:()=>{written=true;}})};
 enhanceDocumentImage(canvas);assert.equal(written,true);
 for(const x of [25,75])assert.equal(data[(30*width+x)*4],0);
 for(const x of [20,30,70,80])assert.equal(data[(30*width+x)*4],255);
});
