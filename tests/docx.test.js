import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {JSDOM} from 'jsdom';
import {extractDOCX,DOCX_MIME} from '../src/docx.js';
import {inspectFile,extractFileText} from '../src/materials.js';
const Parser=new JSDOM('').window.DOMParser;
function zip(xml,{method=8,flags=0,size}={}){
 const name=Buffer.from('word/document.xml'),plain=Buffer.from(xml),data=method===8?deflateRawSync(plain):plain;
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(plain.length,22);local.writeUInt16LE(name.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(flags,8);central.writeUInt16LE(method,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(size??plain.length,24);central.writeUInt16LE(name.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+data.length,16);
 return new File([local,name,data,central,name,end],'Dialogue.docx',{type:DOCX_MIME});
}
const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello! How are you?</w:t></w:r></w:p><w:p><w:r><w:t>I am fine. Très bien.</w:t></w:r></w:p></w:body></w:document>';
test('Word attachments are inspected and read locally, including accents and paragraph boundaries',async()=>{
 const file=zip(xml);assert.deepEqual(await inspectFile(file),{mime:DOCX_MIME});
 assert.equal(await extractFileText(file,DOCX_MIME,{Parser}),'Hello! How are you?\nI am fine. Très bien.');
 assert.equal(await extractDOCX(zip(xml,{method:0}),{Parser}),'Hello! How are you?\nI am fine. Très bien.');
});
test('Word reader refuses encryption, excessive expansion, external entities, cancellation and malformed archives',async()=>{
 await assert.rejects(extractDOCX(zip(xml,{flags:1}),{Parser}),/chiffré/);
 await assert.rejects(extractDOCX(zip(xml,{size:3000000}),{Parser}),/trop long/);
 await assert.rejects(extractDOCX(zip('<!DOCTYPE x [<!ENTITY ext SYSTEM "https://private.test">]>'+xml),{Parser}),/Structure Word/);
 await assert.rejects(extractDOCX(new File(['PKbroken'],'bad.docx'),{Parser}),/incomplet/);
 const controller=new AbortController();controller.abort();await assert.rejects(extractDOCX(zip(xml),{Parser,signal:controller.signal}),/annulée/);
 await assert.rejects(inspectFile(new File(['<html>'],'bad.docx',{type:DOCX_MIME})),/Formats acceptés/);
});
